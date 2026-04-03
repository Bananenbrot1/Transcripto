import { workerData, parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface ParakeetWorkerData {
  modelDir: string;
}

export interface ParakeetTranscribeRequest {
  type: 'transcribe';
  id: number;
  samples: Float32Array;
  sampleRate: number;
}

export interface ParakeetTranscribeResponse {
  type: 'result';
  id: number;
  text: string;
  tokens?: string[];
  timestamps?: number[];
}

export interface ParakeetErrorResponse {
  type: 'error';
  id: number;
  message: string;
}

export interface ParakeetReadyMessage {
  type: 'ready';
}

const { modelDir } = workerData as ParakeetWorkerData;

const sherpaOnnx = require('sherpa-onnx-node');

const recognizer = new sherpaOnnx.OfflineRecognizer({
  featConfig: {
    sampleRate: 16000,
    featureDim: 80,
  },
  modelConfig: {
    transducer: {
      encoder: `${modelDir}/encoder.int8.onnx`,
      decoder: `${modelDir}/decoder.int8.onnx`,
      joiner: `${modelDir}/joiner.int8.onnx`,
    },
    tokens: `${modelDir}/tokens.txt`,
    numThreads: 2,
    provider: 'cpu',
    debug: 0,
    modelType: 'nemo_transducer',
  },
});

parentPort!.postMessage({ type: 'ready' } as ParakeetReadyMessage);

parentPort!.on('message', (msg: ParakeetTranscribeRequest) => {
  if (msg.type !== 'transcribe') return;

  const dbg = (s: string) => process.stderr.write(`[parakeet-worker] ${s}\n`);

  try {
    dbg(`transcribe start: id=${msg.id}, samples=${msg.samples.length}, sampleRate=${msg.sampleRate}`);
    const stream = recognizer.createStream();
    dbg('createStream OK');
    stream.acceptWaveform({ sampleRate: msg.sampleRate, samples: msg.samples });
    dbg('acceptWaveform OK');
    recognizer.decode(stream);
    dbg('decode OK');
    const result = recognizer.getResult(stream);
    dbg(`getResult OK: text="${result.text.slice(0, 60)}"`);

    parentPort!.postMessage({
      type: 'result',
      id: msg.id,
      text: result.text,
      tokens: result.tokens,
      timestamps: result.timestamps,
    } as ParakeetTranscribeResponse);
  } catch (err) {
    dbg(`error: ${err instanceof Error ? err.message : String(err)}`);
    parentPort!.postMessage({
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    } as ParakeetErrorResponse);
  }
});
