import { describe, it, expect, beforeEach } from 'vitest';
import { SpeakerRegistry, cosineSimilarity, indexToLabel } from './speaker-registry.js';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it('returns 0 when one vector is zero', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns a value between -1 and 1 for arbitrary vectors', () => {
    const a = new Float32Array([0.5, 0.3, 0.2]);
    const b = new Float32Array([0.4, 0.4, 0.2]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

describe('indexToLabel', () => {
  it('maps 0-25 to single letters A-Z', () => {
    expect(indexToLabel(0)).toBe('A');
    expect(indexToLabel(25)).toBe('Z');
  });

  it('maps 26 to AA', () => {
    expect(indexToLabel(26)).toBe('AA');
  });

  it('maps 27 to AB', () => {
    expect(indexToLabel(27)).toBe('AB');
  });

  it('maps 51 to AZ', () => {
    expect(indexToLabel(51)).toBe('AZ');
  });

  it('maps 52 to BA', () => {
    expect(indexToLabel(52)).toBe('BA');
  });
});

// ---------------------------------------------------------------------------
// SpeakerRegistry
// ---------------------------------------------------------------------------

describe('SpeakerRegistry', () => {
  let registry: SpeakerRegistry;

  beforeEach(() => {
    registry = new SpeakerRegistry();
  });

  // -------------------------------------------------------------------------
  // matchOrCreate
  // -------------------------------------------------------------------------

  describe('matchOrCreate', () => {
    it('returns a new speaker when the registry is empty', () => {
      const embedding = new Float32Array([1, 0, 0]);
      const result = registry.matchOrCreate(embedding);
      expect(result.isNew).toBe(true);
      expect(result.speakerLabel).toBe('Speaker A');
      expect(result.speakerId).toBeTruthy();
    });

    it('returns the matching speaker when cosine similarity meets the threshold', () => {
      // Enroll speaker A with embedding pointing mostly along x-axis.
      const embedding1 = new Float32Array([1, 0.01, 0]);
      const first = registry.matchOrCreate(embedding1);
      expect(first.isNew).toBe(true);

      // Very similar embedding — should match.
      const embedding2 = new Float32Array([0.999, 0.01, 0]);
      const second = registry.matchOrCreate(embedding2);
      expect(second.isNew).toBe(false);
      expect(second.speakerId).toBe(first.speakerId);
      expect(second.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('creates a new speaker when cosine similarity is below the threshold', () => {
      const embedding1 = new Float32Array([1, 0, 0]);
      const first = registry.matchOrCreate(embedding1);

      // Orthogonal — similarity 0, well below threshold.
      const embedding2 = new Float32Array([0, 1, 0]);
      const second = registry.matchOrCreate(embedding2);

      expect(second.isNew).toBe(true);
      expect(second.speakerId).not.toBe(first.speakerId);
    });

    it('respects a custom threshold', () => {
      const embedding1 = new Float32Array([1, 0, 0]);
      registry.matchOrCreate(embedding1);

      // Moderate similarity (~0.707 for 45-degree angle).
      const embedding2 = new Float32Array([1, 1, 0]);

      // With default threshold 0.75 → new speaker.
      const lowThresholdResult = registry.matchOrCreate(embedding2, 0.75);
      expect(lowThresholdResult.isNew).toBe(true);

      // With a lower threshold of 0.5 → should match the first speaker.
      registry.clear();
      registry.matchOrCreate(embedding1);
      const highToleranceResult = registry.matchOrCreate(embedding2, 0.5);
      expect(highToleranceResult.isNew).toBe(false);
    });

    it('auto-generates incrementing labels: Speaker A, Speaker B, ...', () => {
      const e1 = new Float32Array([1, 0, 0]);
      const e2 = new Float32Array([0, 1, 0]);
      const e3 = new Float32Array([0, 0, 1]);

      const r1 = registry.matchOrCreate(e1);
      const r2 = registry.matchOrCreate(e2);
      const r3 = registry.matchOrCreate(e3);

      expect(r1.speakerLabel).toBe('Speaker A');
      expect(r2.speakerLabel).toBe('Speaker B');
      expect(r3.speakerLabel).toBe('Speaker C');
    });

    it('stores the new speaker in the registry so it can be retrieved', () => {
      const embedding = new Float32Array([1, 0, 0]);
      const result = registry.matchOrCreate(embedding);
      const stored = registry.getSpeaker(result.speakerId);
      expect(stored).toBeDefined();
      expect(stored!.speakerId).toBe(result.speakerId);
    });
  });

  // -------------------------------------------------------------------------
  // enrollSpeaker
  // -------------------------------------------------------------------------

  describe('enrollSpeaker', () => {
    it('updates the speaker label', () => {
      const result = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      registry.enrollSpeaker(result.speakerId, 'Alice');
      const stored = registry.getSpeaker(result.speakerId);
      expect(stored!.speakerLabel).toBe('Alice');
    });

    it('emits a speakerEnrolled event with the updated info', () => {
      const result = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      const events: unknown[] = [];
      registry.on('speakerEnrolled', (e) => events.push(e));
      registry.enrollSpeaker(result.speakerId, 'Bob');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ speakerId: result.speakerId, name: 'Bob' });
    });

    it('throws a descriptive error for an unknown speakerId', () => {
      expect(() => registry.enrollSpeaker('nonexistent-id', 'Alice')).toThrow(
        /not found in registry/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // mergeSpeakers
  // -------------------------------------------------------------------------

  describe('mergeSpeakers', () => {
    it('removes fromId and retains toId after merge', () => {
      const r1 = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      const r2 = registry.matchOrCreate(new Float32Array([0, 1, 0]));

      registry.mergeSpeakers(r1.speakerId, r2.speakerId);

      expect(registry.getSpeaker(r1.speakerId)).toBeUndefined();
      expect(registry.getSpeaker(r2.speakerId)).toBeDefined();
    });

    it('merges centroids equally when both durations are zero', () => {
      const r1 = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      const r2 = registry.matchOrCreate(new Float32Array([0, 1, 0]));

      registry.mergeSpeakers(r1.speakerId, r2.speakerId);

      const merged = registry.getSpeaker(r2.speakerId)!;
      expect(merged.centroid[0]).toBeCloseTo(0.5);
      expect(merged.centroid[1]).toBeCloseTo(0.5);
      expect(merged.centroid[2]).toBeCloseTo(0);
    });

    it('merges centroids using duration-weighted averaging when durations differ', () => {
      const r1 = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      const r2 = registry.matchOrCreate(new Float32Array([0, 1, 0]));

      // Give r2 twice the duration of r1.
      registry.getSpeaker(r1.speakerId)!.totalDuration = 1;
      registry.getSpeaker(r2.speakerId)!.totalDuration = 2;

      registry.mergeSpeakers(r1.speakerId, r2.speakerId);

      const merged = registry.getSpeaker(r2.speakerId)!;
      // merged[0] = (0 * 2 + 1 * 1) / 3 ≈ 0.333
      // merged[1] = (1 * 2 + 0 * 1) / 3 ≈ 0.667
      expect(merged.centroid[0]).toBeCloseTo(1 / 3);
      expect(merged.centroid[1]).toBeCloseTo(2 / 3);
      expect(merged.totalDuration).toBe(3);
    });

    it('accumulates segment counts from both speakers', () => {
      const r1 = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      const r2 = registry.matchOrCreate(new Float32Array([0, 1, 0]));

      registry.getSpeaker(r1.speakerId)!.segmentCount = 3;
      registry.getSpeaker(r2.speakerId)!.segmentCount = 5;

      registry.mergeSpeakers(r1.speakerId, r2.speakerId);

      expect(registry.getSpeaker(r2.speakerId)!.segmentCount).toBe(8);
    });

    it('emits a speakersMerged event', () => {
      const r1 = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      const r2 = registry.matchOrCreate(new Float32Array([0, 1, 0]));
      const events: unknown[] = [];
      registry.on('speakersMerged', (e) => events.push(e));

      registry.mergeSpeakers(r1.speakerId, r2.speakerId);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ fromId: r1.speakerId, toId: r2.speakerId });
    });

    it('throws a descriptive error when fromId is not found', () => {
      const r2 = registry.matchOrCreate(new Float32Array([0, 1, 0]));
      expect(() => registry.mergeSpeakers('bad-id', r2.speakerId)).toThrow(/not found in registry/);
    });

    it('throws a descriptive error when toId is not found', () => {
      const r1 = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      expect(() => registry.mergeSpeakers(r1.speakerId, 'bad-id')).toThrow(/not found in registry/);
    });
  });

  // -------------------------------------------------------------------------
  // getSpeakers / clear
  // -------------------------------------------------------------------------

  describe('getSpeakers', () => {
    it('returns all registered speakers', () => {
      registry.matchOrCreate(new Float32Array([1, 0, 0]));
      registry.matchOrCreate(new Float32Array([0, 1, 0]));
      expect(registry.getSpeakers()).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('removes all speakers and resets label counter', () => {
      registry.matchOrCreate(new Float32Array([1, 0, 0]));
      registry.clear();
      expect(registry.getSpeakers()).toHaveLength(0);

      // Label counter should reset — next speaker gets 'A' again.
      const result = registry.matchOrCreate(new Float32Array([1, 0, 0]));
      expect(result.speakerLabel).toBe('Speaker A');
    });
  });
});
