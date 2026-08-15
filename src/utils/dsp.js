/**
 * ORBIT High-Performance Audio DSP & Forensics Engine (Phase 4)
 * 
 * Powered by Ohnrscript's data-oriented design (DOD).
 * Emits zero heap allocations and leverages optimal contiguous V8 Float32Array SIMD pipelines.
 */

'use strict';

const PI2 = 6.283185307179586;

/**
 * Calculate Root-Mean-Square (RMS) audio energy over Float32Array PCM samples.
 * 
 * @param {Float32Array|Array<number>} samples - Float32 PCM audio samples
 * @returns {number} RMS energy value [0.0, 1.0]
 */
function calculateRms(samples) {
  const n = samples.length;
  if (n === 0) return 0.0;

  let sumSq = 0.0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    sumSq += s * s;
  }

  return Math.sqrt(sumSq / n);
}

/**
 * In-place peak sample normalization.
 * 
 * @param {Float32Array} samples - Audio samples to scale in-place
 * @param {number} targetPeak - Desired maximum amplitude (e.g. 0.95 or 1.0)
 * @returns {number} Previous maximum absolute peak found
 */
function peakNormalize(samples, targetPeak = 0.95) {
  const n = samples.length;
  if (n === 0) return 0.0;

  let maxVal = 0.0;
  for (let i = 0; i < n; i++) {
    const absVal = Math.abs(samples[i]);
    if (absVal > maxVal) {
      maxVal = absVal;
    }
  }

  if (maxVal <= 1e-9) return 0.0;

  const scale = targetPeak / maxVal;
  for (let i = 0; i < n; i++) {
    samples[i] *= scale;
  }

  return maxVal;
}

/**
 * Pearson Phase Cross-Correlation for audio forensics and tampering detection.
 * 
 * @param {Float32Array} a - First audio waveform
 * @param {Float32Array} b - Second audio waveform
 * @returns {number} Correlation coefficient [-1.0, 1.0]
 */
function crossCorrelate(a, b) {
  const n = a.length;
  if (n === 0 || n !== b.length) return 0.0;

  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;

  for (let i = 0; i < n; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 1e-9) return 0.0;

  const res = dot / denom;
  return res > 1.0 ? 1.0 : (res < -1.0 ? -1.0 : res);
}

/**
 * Apply in-place Hann window for FFT spectral analysis.
 * 
 * @param {Float32Array} samples - Audio window buffer
 */
function hannWindow(samples) {
  const n = samples.length;
  if (n <= 1) return;

  const invN = 1.0 / (n - 1);
  for (let i = 0; i < n; i++) {
    const multiplier = 0.5 * (1.0 - Math.cos(PI2 * i * invN));
    samples[i] *= multiplier;
  }
}

module.exports = {
  calculateRms,
  peakNormalize,
  crossCorrelate,
  hannWindow,
};
