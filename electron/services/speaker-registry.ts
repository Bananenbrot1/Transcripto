import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpeakerEntry {
  speakerId: string;
  /** Auto-generated label (e.g. 'Speaker A') or enrolled human-readable name. */
  speakerLabel: string;
  /** Running centroid of all embeddings attributed to this speaker. */
  centroid: Float32Array;
  /**
   * Total attributed audio duration in seconds. Used for duration-weighted
   * centroid merging. Starts at 0; callers should update it when a segment
   * is confirmed as belonging to this speaker.
   */
  totalDuration: number;
  /** Number of transcript segments attributed to this speaker. */
  segmentCount: number;
  /** Unix epoch ms when the entry was first created. */
  createdAt: number;
}

export interface MatchOrCreateResult {
  speakerId: string;
  speakerLabel: string;
  /** Cosine similarity to the matched speaker, or 0 when the speaker is new. */
  confidence: number;
  /** True when a new speaker entry was created. */
  isNew: boolean;
}

/**
 * Injectable persistence dependencies for SpeakerRegistry.
 *
 * Injecting these rather than importing Electron/fs directly keeps the class
 * testable without any vi.mock() boilerplate — tests pass a mock object.
 *
 * In production, wire this after `app.whenReady()` to avoid Electron bug
 * #45328 (safeStorage not available before app is ready).
 */
export interface SpeakerRegistryPersistenceDeps {
  /** safeStorage.encryptString: encrypts a UTF-8 string to a Buffer. */
  encryptString(plaintext: string): Buffer;
  /** safeStorage.decryptString: decrypts a Buffer back to a UTF-8 string. */
  decryptString(encrypted: Buffer): string;
  /** Returns the user-data directory path (wraps app.getPath('userData')). */
  getUserDataPath(): string;
  /** fs.writeFileSync */
  writeFile(filePath: string, data: Buffer): void;
  /** fs.readFileSync returning a Buffer */
  readFile(filePath: string): Buffer;
  /** fs.existsSync */
  fileExists(filePath: string): boolean;
  /** fs.unlinkSync */
  deleteFile(filePath: string): void;
}

// ---------------------------------------------------------------------------
// Serialization helpers (internal)
// ---------------------------------------------------------------------------

interface SerializedSpeakerEntry {
  speakerId: string;
  speakerLabel: string;
  /** Float32Array serialized as a plain number array for JSON. */
  centroid: number[];
  totalDuration: number;
  segmentCount: number;
  createdAt: number;
}

interface SerializedRegistry {
  version: 1;
  labelCounter: number;
  speakers: SerializedSpeakerEntry[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Computes the cosine similarity between two equal-length Float32Arrays.
 * Returns 0 if either vector is the zero vector.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Converts a zero-based index to an alphabetic label:
 *   0 → 'A', 1 → 'B', ..., 25 → 'Z', 26 → 'AA', 27 → 'AB', ...
 *
 * This matches the "Speaker A / Speaker B / Speaker AA" requirement in the
 * acceptance criteria.
 */
export function indexToLabel(index: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let label = '';
  let n = index;
  // Bijective base-26 numeral system
  do {
    label = alphabet[n % 26] + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

// ---------------------------------------------------------------------------
// SpeakerRegistry
// ---------------------------------------------------------------------------

/**
 * In-memory speaker registry that matches an incoming speaker embedding
 * against known speakers using cosine similarity, or creates a new speaker
 * entry when no existing speaker exceeds the similarity threshold.
 *
 * Extends EventEmitter so callers can subscribe to lifecycle events:
 *   - 'speakerEnrolled'  { speakerId: string; name: string }
 *   - 'speakersMerged'   { fromId: string; toId: string }
 */
export class SpeakerRegistry extends EventEmitter {
  private readonly speakers: Map<string, SpeakerEntry> = new Map();
  private labelCounter = 0;

  private static readonly PERSISTENCE_FILENAME = 'speaker-registry.enc';

  private persistenceDeps: SpeakerRegistryPersistenceDeps | undefined;

  constructor(persistenceDeps?: SpeakerRegistryPersistenceDeps) {
    super();
    this.persistenceDeps = persistenceDeps;
  }

  /**
   * Configures persistence dependencies after construction.
   *
   * This exists because the registry must be created early (before
   * `app.whenReady()`) so that IPC handlers can reference it, but Electron's
   * `safeStorage` API is only available after the app is ready (bug #45328).
   * Call this inside the `app.whenReady()` callback before calling
   * `loadPersistedSpeakers()`.
   */
  setPersistenceDeps(deps: SpeakerRegistryPersistenceDeps): void {
    this.persistenceDeps = deps;
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Matches the given embedding against known speakers using cosine similarity.
   *
   * - If the best match meets or exceeds `threshold` (default 0.75), returns
   *   that speaker's identity.
   * - Otherwise creates a new speaker with an auto-generated label and returns
   *   it with `isNew: true`.
   *
   * @param embedding  Float32Array speaker embedding (e.g. 192-dim for CAM++).
   * @param threshold  Cosine similarity threshold in the range [0, 1].
   */
  matchOrCreate(embedding: Float32Array, threshold = 0.75): MatchOrCreateResult {
    let bestId: string | null = null;
    let bestSimilarity = -1;

    for (const [id, entry] of this.speakers) {
      const sim = cosineSimilarity(embedding, entry.centroid);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestId = id;
      }
    }

    if (bestId !== null && bestSimilarity >= threshold) {
      const entry = this.speakers.get(bestId)!;
      return {
        speakerId: entry.speakerId,
        speakerLabel: entry.speakerLabel,
        confidence: bestSimilarity,
        isNew: false,
      };
    }

    // No match — create a new speaker entry.
    const speakerId = randomUUID();
    const speakerLabel = `Speaker ${indexToLabel(this.labelCounter++)}`;
    const entry: SpeakerEntry = {
      speakerId,
      speakerLabel,
      centroid: new Float32Array(embedding),
      totalDuration: 0,
      segmentCount: 0,
      createdAt: Date.now(),
    };
    this.speakers.set(speakerId, entry);

    // confidence is the best similarity seen, clamped to [0, 1] for clarity.
    const confidence = bestSimilarity >= 0 ? bestSimilarity : 0;
    return { speakerId, speakerLabel, confidence, isNew: true };
  }

  /**
   * Sets a human-readable name for the given speaker and emits a
   * 'speakerEnrolled' event so that downstream consumers (transcript panel,
   * IPC bridge) can reactively update displayed names.
   *
   * @throws if `speakerId` is not found in the registry.
   */
  enrollSpeaker(speakerId: string, name: string): void {
    const entry = this.speakers.get(speakerId);
    if (!entry) {
      throw new Error(
        `enrollSpeaker: speaker "${speakerId}" not found in registry.`,
      );
    }
    entry.speakerLabel = name;
    this.emit('speakerEnrolled', { speakerId, name });
  }

  /**
   * Reassigns all session references from `fromId` to `toId` by:
   *   1. Merging the two centroids using duration-weighted averaging:
   *        merged = (centroid_to * dur_to + centroid_from * dur_from)
   *                 / (dur_to + dur_from)
   *      When both durations are zero, the centroids are averaged equally.
   *   2. Accumulating segment counts.
   *   3. Removing the `fromId` entry.
   *
   * Emits 'speakersMerged' { fromId, toId } after the operation.
   *
   * @throws if either `fromId` or `toId` is not found in the registry.
   */
  mergeSpeakers(fromId: string, toId: string): void {
    const from = this.speakers.get(fromId);
    const to = this.speakers.get(toId);
    if (!from) {
      throw new Error(`mergeSpeakers: speaker "${fromId}" not found in registry.`);
    }
    if (!to) {
      throw new Error(`mergeSpeakers: speaker "${toId}" not found in registry.`);
    }

    const totalDuration = from.totalDuration + to.totalDuration;
    const merged = new Float32Array(to.centroid.length);

    if (totalDuration > 0) {
      for (let i = 0; i < merged.length; i++) {
        merged[i] =
          (to.centroid[i] * to.totalDuration + from.centroid[i] * from.totalDuration) /
          totalDuration;
      }
    } else {
      // Both speakers have zero attributed duration — average equally.
      for (let i = 0; i < merged.length; i++) {
        merged[i] = (to.centroid[i] + from.centroid[i]) / 2;
      }
    }

    to.centroid = merged;
    to.totalDuration = totalDuration;
    to.segmentCount += from.segmentCount;

    this.speakers.delete(fromId);
    this.emit('speakersMerged', { fromId, toId });
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  /** Returns a snapshot of all speaker entries. */
  getSpeakers(): readonly SpeakerEntry[] {
    return Array.from(this.speakers.values());
  }

  /** Returns the entry for the given ID, or undefined if absent. */
  getSpeaker(speakerId: string): SpeakerEntry | undefined {
    return this.speakers.get(speakerId);
  }

  /**
   * Removes a single speaker entry from the registry and emits a
   * 'speakerDeleted' event.
   *
   * @throws if `speakerId` is not found in the registry.
   */
  deleteSpeaker(speakerId: string): void {
    if (!this.speakers.has(speakerId)) {
      throw new Error(
        `deleteSpeaker: speaker "${speakerId}" not found in registry.`,
      );
    }
    this.speakers.delete(speakerId);
    this.emit('speakerDeleted', { speakerId });
  }

  /** Clears all speakers and resets the label counter. */
  clear(): void {
    this.speakers.clear();
    this.labelCounter = 0;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Serializes the registry to JSON, encrypts it via safeStorage, and writes
   * the encrypted bytes to a file in the Electron userData directory.
   *
   * @throws if persistence deps were not provided to the constructor.
   */
  async persistSpeakers(): Promise<void> {
    const deps = this.requirePersistenceDeps();
    const plaintext = this.serializeToJson();
    const encrypted = deps.encryptString(plaintext);
    deps.writeFile(this.persistencePath(deps), encrypted);
  }

  /**
   * Reads the persisted registry file, decrypts it, and populates the
   * in-memory registry.
   *
   * - If the file does not exist, resolves without error (clean first run).
   * - If decryption or parsing fails, logs the error and resets to an empty
   *   registry rather than throwing, so the app remains usable.
   *
   * IMPORTANT: call this only after `app.whenReady()` resolves. Electron's
   * safeStorage is not available before the app is ready (bug #45328).
   *
   * @throws if persistence deps were not provided to the constructor.
   */
  async loadPersistedSpeakers(): Promise<void> {
    const deps = this.requirePersistenceDeps();
    const filePath = this.persistencePath(deps);
    if (!deps.fileExists(filePath)) {
      return;
    }
    try {
      const encrypted = deps.readFile(filePath);
      const plaintext = deps.decryptString(encrypted);
      this.deserializeFromJson(plaintext);
    } catch (err) {
      console.error('[SpeakerRegistry] Failed to load persisted speakers — resetting to empty registry:', err);
      this.speakers.clear();
      this.labelCounter = 0;
    }
  }

  /**
   * Deletes the persisted registry file and clears the in-memory registry.
   *
   * @throws if persistence deps were not provided to the constructor.
   */
  async deletePersistedSpeakers(): Promise<void> {
    const deps = this.requirePersistenceDeps();
    const filePath = this.persistencePath(deps);
    if (deps.fileExists(filePath)) {
      deps.deleteFile(filePath);
    }
    this.speakers.clear();
    this.labelCounter = 0;
  }

  /**
   * Returns the encrypted registry bytes for user backup purposes.
   * The returned Buffer contains the same content that would be written by
   * `persistSpeakers()`.
   *
   * @throws if persistence deps were not provided to the constructor.
   */
  async exportRegistry(): Promise<Buffer> {
    const deps = this.requirePersistenceDeps();
    const plaintext = this.serializeToJson();
    return deps.encryptString(plaintext);
  }

  // ---------------------------------------------------------------------------
  // Persistence internals
  // ---------------------------------------------------------------------------

  private requirePersistenceDeps(): SpeakerRegistryPersistenceDeps {
    if (!this.persistenceDeps) {
      throw new Error(
        'SpeakerRegistry: persistence deps not configured. ' +
          'Pass a SpeakerRegistryPersistenceDeps object to the constructor.',
      );
    }
    return this.persistenceDeps;
  }

  private persistencePath(deps: SpeakerRegistryPersistenceDeps): string {
    return path.join(deps.getUserDataPath(), SpeakerRegistry.PERSISTENCE_FILENAME);
  }

  private serializeToJson(): string {
    const data: SerializedRegistry = {
      version: 1,
      labelCounter: this.labelCounter,
      speakers: Array.from(this.speakers.values()).map((entry) => ({
        speakerId: entry.speakerId,
        speakerLabel: entry.speakerLabel,
        centroid: Array.from(entry.centroid),
        totalDuration: entry.totalDuration,
        segmentCount: entry.segmentCount,
        createdAt: entry.createdAt,
      })),
    };
    return JSON.stringify(data);
  }

  private deserializeFromJson(json: string): void {
    const data = JSON.parse(json) as SerializedRegistry;
    this.speakers.clear();
    for (const entry of data.speakers) {
      this.speakers.set(entry.speakerId, {
        speakerId: entry.speakerId,
        speakerLabel: entry.speakerLabel,
        centroid: new Float32Array(entry.centroid),
        totalDuration: entry.totalDuration,
        segmentCount: entry.segmentCount,
        createdAt: entry.createdAt,
      });
    }
    this.labelCounter = data.labelCounter;
  }
}
