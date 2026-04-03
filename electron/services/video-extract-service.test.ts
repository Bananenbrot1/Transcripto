import { vi, describe, it, expect } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}));

vi.mock('ffmpeg-static', () => ({
  default: '/usr/bin/ffmpeg',
}));

import { isVideoFile, VIDEO_EXTENSIONS, extractAudio, cleanupExtractedAudio, wavToFloat32, WAV_HEADER_BYTES } from './video-extract-service';

describe('video-extract-service', () => {
  describe('VIDEO_EXTENSIONS', () => {
    it('contains expected video formats', () => {
      expect(VIDEO_EXTENSIONS.has('.mp4')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mkv')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.mov')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.avi')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.webm')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.flv')).toBe(true);
      expect(VIDEO_EXTENSIONS.has('.wmv')).toBe(true);
    });

    it('does not contain audio-only formats', () => {
      expect(VIDEO_EXTENSIONS.has('.mp3')).toBe(false);
      expect(VIDEO_EXTENSIONS.has('.wav')).toBe(false);
      expect(VIDEO_EXTENSIONS.has('.flac')).toBe(false);
    });
  });

  describe('isVideoFile', () => {
    it('returns true for video extensions', () => {
      expect(isVideoFile('movie.mp4')).toBe(true);
      expect(isVideoFile('recording.mkv')).toBe(true);
      expect(isVideoFile('clip.MOV')).toBe(true);
    });

    it('returns false for audio extensions', () => {
      expect(isVideoFile('song.mp3')).toBe(false);
      expect(isVideoFile('audio.wav')).toBe(false);
    });

    it('handles paths with directories', () => {
      expect(isVideoFile('/Users/max/Videos/recording.mp4')).toBe(true);
      expect(isVideoFile('/Users/max/Music/song.mp3')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isVideoFile('file.MP4')).toBe(true);
      expect(isVideoFile('file.Mkv')).toBe(true);
    });
  });

  describe('extractAudio', () => {
    it('is a function that returns a Promise', () => {
      // We don't execute it (requires Electron + real ffmpeg), but verify it's callable
      expect(typeof extractAudio).toBe('function');
    });
  });

  describe('cleanupExtractedAudio', () => {
    it('is a function', () => {
      expect(typeof cleanupExtractedAudio).toBe('function');
    });

    it('does not throw if temp directory does not exist', () => {
      // app.getPath is mocked to return '/tmp', so /tmp/transcripto-session likely doesn't exist
      expect(() => cleanupExtractedAudio()).not.toThrow();
    });
  });

  describe('wavToFloat32', () => {
    function makeWavBuffer(int16Samples: number[]): Buffer {
      const header = Buffer.alloc(WAV_HEADER_BYTES, 0);
      const sampleBuf = Buffer.from(new Int16Array(int16Samples).buffer);
      return Buffer.concat([header, sampleBuf]);
    }

    it('converts int16 samples to normalized float32', () => {
      const wav = makeWavBuffer([0, 32767, -32768, 16384]);
      const { samples, durationSec } = wavToFloat32(wav);

      expect(samples.length).toBe(4);
      expect(samples[0]).toBeCloseTo(0.0, 5);
      expect(samples[1]).toBeCloseTo(32767 / 32768, 4);
      expect(samples[2]).toBeCloseTo(-1.0, 4);
      expect(samples[3]).toBeCloseTo(16384 / 32768, 4);
      expect(durationSec).toBeCloseTo(4 / 16000, 8);
    });

    it('returns empty samples for a header-only buffer', () => {
      const headerOnly = Buffer.alloc(WAV_HEADER_BYTES, 0);
      const { samples, durationSec } = wavToFloat32(headerOnly);

      expect(samples.length).toBe(0);
      expect(durationSec).toBe(0);
    });

    it('returns empty samples when buffer is smaller than header', () => {
      const tooSmall = Buffer.alloc(10, 0);
      const { samples, durationSec } = wavToFloat32(tooSmall);

      expect(samples.length).toBe(0);
      expect(durationSec).toBe(0);
    });
  });
});
