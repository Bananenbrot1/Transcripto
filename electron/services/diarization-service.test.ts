/**
 * Unit tests for diarization-service.ts
 *
 * These tests mock `node:worker_threads` so no real Worker thread or native
 * module is spawned. The mock Worker is controlled via an EventEmitter so
 * tests can simulate worker messages, errors, and exits.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Worker as WorkerType } from 'node:worker_threads';

// ---------------------------------------------------------------------------
// Mock node:worker_threads — hoisted before all imports
// ---------------------------------------------------------------------------

vi.mock('node:worker_threads', () => ({
  Worker: vi.fn(),
}));

// Must be imported AFTER the vi.mock declaration so Vitest's hoisting applies.
import { Worker } from 'node:worker_threads';
import { diarizeFromFile, diarizeFromFileDual } from './diarization-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockWorker = EventEmitter & {
  terminate: ReturnType<typeof vi.fn>;
  stderr: EventEmitter;
  workerData?: unknown;
};

let currentWorker: MockWorker;

/** Configure the Worker mock to capture the constructed instance. */
function setupWorkerMock() {
  vi.mocked(Worker).mockImplementation(function (_path: unknown, opts: { workerData?: unknown }) {
    const inst: MockWorker = Object.assign(new EventEmitter(), {
      terminate: vi.fn(),
      stderr: new EventEmitter(),
      workerData: opts?.workerData,
    });
    currentWorker = inst;
    return inst as unknown as WorkerType;
  } as unknown as typeof WorkerType);
}

const SEG_A = { speaker: 'Speaker A', start: 0, end: 1.5 };
const SEG_B = { speaker: 'Speaker B', start: 1.5, end: 3.0 };
const SEG_C = { speaker: 'Speaker A', start: 0.5, end: 2.0 };

// ---------------------------------------------------------------------------

describe('diarizeFromFile (single-stream mode)', () => {
  beforeEach(() => {
    setupWorkerMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves with the segments array returned by the worker', async () => {
    const promise = diarizeFromFile(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    // Worker posts a 'result' message
    process.nextTick(() => {
      currentWorker.emit('message', { type: 'result', segments: [SEG_A, SEG_B] });
    });

    const result = await promise;
    expect(result).toEqual([SEG_A, SEG_B]);
  });

  it('rejects when the worker posts an error message', async () => {
    const promise = diarizeFromFile(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('message', { type: 'error', message: 'No audio data to diarize' });
    });

    await expect(promise).rejects.toThrow('No audio data to diarize');
  });

  it('rejects when the worker emits an error event', async () => {
    const promise = diarizeFromFile(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('error', new Error('Worker crashed'));
    });

    await expect(promise).rejects.toThrow('Worker crashed');
  });

  it('rejects when the worker exits with a non-zero code', async () => {
    const promise = diarizeFromFile(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('exit', 1);
    });

    await expect(promise).rejects.toThrow('exited with code 1');
  });

  it('spawns the Worker without a type field in workerData (single-stream)', async () => {
    const promise = diarizeFromFile(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
      3,
    );

    process.nextTick(() => {
      currentWorker.emit('message', { type: 'result', segments: [] });
    });

    await promise;

    const workerData = currentWorker.workerData as Record<string, unknown>;
    expect(workerData.type).toBeUndefined();
    expect(workerData.numSpeakers).toBe(3);
    expect(workerData.micPath).toBe('/tmp/mic.f32');
    expect(workerData.sysPath).toBe('/tmp/sys.f32');
  });
});

// ---------------------------------------------------------------------------

describe('diarizeFromFileDual (dual-stream mode)', () => {
  beforeEach(() => {
    setupWorkerMock();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('spawns the Worker with type: "diarize-dual" in workerData', async () => {
    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('message', { type: 'dual-result', micSegments: [], sysSegments: [] });
    });

    await promise;

    const workerData = currentWorker.workerData as Record<string, unknown>;
    expect(workerData.type).toBe('diarize-dual');
  });

  it('returns micSegments and sysSegments as independent arrays from the worker', async () => {
    const micSegs = [SEG_A, SEG_B];
    const sysSegs = [SEG_C];

    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('message', {
        type: 'dual-result',
        micSegments: micSegs,
        sysSegments: sysSegs,
      });
    });

    const result = await promise;
    expect(result.micSegments).toEqual(micSegs);
    expect(result.sysSegments).toEqual(sysSegs);
  });

  it('calls CrossStreamReconciler.mergeStreamResults with both arrays and returns mergedSegments', async () => {
    const micSegs = [SEG_A];
    const sysSegs = [SEG_C];

    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('message', {
        type: 'dual-result',
        micSegments: micSegs,
        sysSegments: sysSegs,
      });
    });

    const result = await promise;

    // mergedSegments should contain all segments from both streams, tagged with
    // their source, sorted by start time. Suppression does not apply here because
    // neither segment carries an embedding.
    expect(result.mergedSegments).toHaveLength(2);

    const sources = result.mergedSegments.map((s) => s.source);
    expect(sources).toContain('mic');
    expect(sources).toContain('system');

    // Sorted by start time: SEG_A (0.0) before SEG_C (0.5)
    expect(result.mergedSegments[0].start).toBe(0);
    expect(result.mergedSegments[1].start).toBe(0.5);
  });

  it('returns empty mergedSegments when both streams are empty', async () => {
    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('message', {
        type: 'dual-result',
        micSegments: [],
        sysSegments: [],
      });
    });

    const result = await promise;
    expect(result.micSegments).toEqual([]);
    expect(result.sysSegments).toEqual([]);
    expect(result.mergedSegments).toEqual([]);
  });

  it('tags mic segments with source: "mic" and system segments with source: "system"', async () => {
    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('message', {
        type: 'dual-result',
        micSegments: [SEG_A],
        sysSegments: [SEG_B],
      });
    });

    const result = await promise;
    const micMerged = result.mergedSegments.find((s) => s.speaker === SEG_A.speaker && s.start === SEG_A.start);
    const sysMerged = result.mergedSegments.find((s) => s.speaker === SEG_B.speaker && s.start === SEG_B.start);

    expect(micMerged?.source).toBe('mic');
    expect(sysMerged?.source).toBe('system');
  });

  it('rejects when the worker posts an error message', async () => {
    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('message', { type: 'error', message: 'No audio data to diarize' });
    });

    await expect(promise).rejects.toThrow('No audio data to diarize');
  });

  it('rejects when the worker emits an error event', async () => {
    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('error', new Error('Worker crashed'));
    });

    await expect(promise).rejects.toThrow('Worker crashed');
  });

  it('rejects when the worker exits with a non-zero code', async () => {
    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
    );

    process.nextTick(() => {
      currentWorker.emit('exit', 2);
    });

    await expect(promise).rejects.toThrow('exited with code 2');
  });

  it('passes numSpeakers to the worker', async () => {
    const promise = diarizeFromFileDual(
      '/tmp/mic.f32',
      '/tmp/sys.f32',
      '/models/seg.onnx',
      '/models/emb.onnx',
      4,
    );

    process.nextTick(() => {
      currentWorker.emit('message', { type: 'dual-result', micSegments: [], sysSegments: [] });
    });

    await promise;

    const workerData = currentWorker.workerData as Record<string, unknown>;
    expect(workerData.numSpeakers).toBe(4);
  });
});
