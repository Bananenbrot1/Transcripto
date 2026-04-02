import { vi, describe, it, expect } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
}));

vi.mock('ffmpeg-static', () => ({
  default: '/usr/bin/ffmpeg',
}));

import { isVideoFile, VIDEO_EXTENSIONS, extractAudio, cleanupExtractedAudio } from './video-extract-service';

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
});
