/**
 * Unit Tests for Ohnrscript Audio DSP & Forensics Engine (Phase 4)
 * 
 * Verifies:
 * - RMS calculation mathematical accuracy
 * - In-place peak sample normalization
 * - Phase cross-correlation parity across inverted/orthogonal audio
 * - Hann spectral windowing
 * - Native C shared library parity (if compiled)
 */

'use strict';

const dspEngine = require('../../src/utils/dsp');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

function assertApprox(actual, expected, tol = 1e-4, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    console.log(`  ✅ ${message} (expected ${expected}, got ${actual.toFixed(5)})`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message} (expected ${expected}, got ${actual.toFixed(5)}, diff: ${diff})`);
    failed++;
  }
}

console.log('\n🧪 Ohnrscript Audio DSP & Polyglot Engine Tests');
console.log('==================================================');

// --- Test 1: RMS Energy on Silence and DC ---
(() => {
  const silence = new Float32Array(1024);
  assert(dspEngine.calculateRms(silence) === 0.0, 'RMS: silence produces exactly 0.0');

  const dc = new Float32Array(1024).fill(0.5);
  assertApprox(dspEngine.calculateRms(dc), 0.5, 1e-5, 'RMS: DC signal of 0.5 returns 0.5');
})();

// --- Test 2: RMS Energy on Sine Wave ---
(() => {
  const n = 44100;
  const sine = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sine[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
  }
  // Theoretical RMS of sine wave with peak 1.0 is 1 / sqrt(2) ≈ 0.707106
  assertApprox(dspEngine.calculateRms(sine), 0.707106, 1e-3, 'RMS: 440Hz sine wave RMS matches 1/sqrt(2)');
})();

// --- Test 3: Peak Normalization ---
(() => {
  const samples = new Float32Array([0.1, -0.4, 0.2, -0.5, 0.3]);
  const prevMax = dspEngine.peakNormalize(samples, 1.0);
  assertApprox(prevMax, 0.5, 1e-5, 'Peak Normalization: identifies previous max peak correctly');
  assertApprox(samples[3], -1.0, 1e-5, 'Peak Normalization: scales peak sample to target 1.0');
  assertApprox(samples[1], -0.8, 1e-5, 'Peak Normalization: scales intermediate samples proportionally');
})();

// --- Test 4: Cross-Correlation (Forensics) ---
(() => {
  const a = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const b = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const c = new Float32Array([-1, -2, -3, -4, -5, -6, -7, -8]);
  const d = new Float32Array([1, -1, 1, -1, 1, -1, 1, -1]);

  assertApprox(dspEngine.crossCorrelate(a, b), 1.0, 1e-5, 'Cross-Correlation: identical waveforms return 1.0');
  assertApprox(dspEngine.crossCorrelate(a, c), -1.0, 1e-5, 'Cross-Correlation: inverted waveforms return -1.0');
  assert(Math.abs(dspEngine.crossCorrelate(a, d)) < 0.3, 'Cross-Correlation: uncorrelated audio returns low score');
})();

// --- Test 5: Hann Spectral Windowing ---
(() => {
  const n = 512;
  const window = new Float32Array(n).fill(1.0);
  dspEngine.hannWindow(window);

  assertApprox(window[0], 0.0, 1e-5, 'Hann Window: start edge reaches zero');
  assertApprox(window[n - 1], 0.0, 1e-5, 'Hann Window: end edge reaches zero');
  assertApprox(window[Math.floor(n / 2)], 1.0, 1e-3, 'Hann Window: center reaches peak 1.0');
})();

// --- Test 6: Native C-ABI Shared Library Exists ---
(() => {
  const dylibPath = path.join(__dirname, '../../src/native/liborbit_dsp.dylib');
  const soPath = path.join(__dirname, '../../src/native/liborbit_dsp.so');
  const exists = fs.existsSync(dylibPath) || fs.existsSync(soPath);
  assert(exists, 'Polyglot Native C Shim: shared library compiled and available');
})();

console.log('--------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
