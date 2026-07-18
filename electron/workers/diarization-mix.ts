/**
 * Mix mic + system streams into mono for diarization.
 * When both streams have samples at an index, average them (pyannote-style
 * stereo→mono). When only one stream has data, pass it through unchanged.
 */
export function mixMicAndSystem(
  mic: Float32Array,
  sys: Float32Array,
  totalSamples: number,
): Float32Array {
  const mixed = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const hasMic = i < mic.length;
    const hasSys = i < sys.length;
    if (hasMic && hasSys) {
      mixed[i] = (mic[i] + sys[i]) / 2;
    } else if (hasMic) {
      mixed[i] = mic[i];
    } else if (hasSys) {
      mixed[i] = sys[i];
    }
  }
  return mixed;
}
