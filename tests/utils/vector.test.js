/**
 * Unit Test Suite: Ohnrscript Native Vector & SIMD Math Engine
 * 
 * Verifies mathematical precision, zero-copy buffer views, and 
 * Postgres serialization parity.
 */

'use strict';

const vectorEngine = require('../../src/utils/vector');

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

function assertClose(actual, expected, tolerance = 1e-6, message = '') {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (expected ${expected}, got ${actual}, diff ${diff.toExponential(2)})`);
}

console.log('\n🧪 Ohnrscript Native Vector & SIMD Math Tests');
console.log('==================================================');

// --- Test 1: mapVector buffer views ---
(() => {
  const floats = new Float32Array([1.5, -2.5, 3.25, 4.125]);
  const buf = Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
  
  const mapped = vectorEngine.mapVector(buf);
  assert(mapped instanceof Float32Array, 'mapVector: returns Float32Array from Buffer');
  assert(mapped.length === 4, 'mapVector: preserves element count');
  assert(mapped[0] === 1.5 && mapped[1] === -2.5 && mapped[3] === 4.125, 'mapVector: byte data matches perfectly');
})();

// --- Test 2: dotProduct and l2NormSquared ---
(() => {
  const a = new Float32Array([1, 2, 3, 4, 5]);
  const b = new Float32Array([2, 3, 4, 5, 6]);
  // dot = 1*2 + 2*3 + 3*4 + 4*5 + 5*6 = 2 + 6 + 12 + 20 + 30 = 70
  const dot = vectorEngine.dotProduct(a, b);
  assertClose(dot, 70, 1e-6, 'dotProduct: calculates 5-dim dot product correctly (70)');

  // normSquared = 1 + 4 + 9 + 16 + 25 = 55
  const normSq = vectorEngine.l2NormSquared(a);
  assertClose(normSq, 55, 1e-6, 'l2NormSquared: calculates sum of squares correctly (55)');

  let threwMismatch = false;
  try {
    vectorEngine.dotProduct(a, new Float32Array([1, 2]));
  } catch (err) {
    threwMismatch = true;
  }
  assert(threwMismatch, 'dotProduct: throws on dimension mismatch');
})();

// --- Test 3: cosineSimilarity properties ---
(() => {
  // Identical vectors -> 1.0
  const v1 = new Float32Array([0.5, 0.5, 0.5, 0.5]);
  assertClose(vectorEngine.cosineSimilarity(v1, v1), 1.0, 1e-6, 'cosineSimilarity: identical vectors return 1.0');

  // Opposite vectors -> -1.0
  const vOpp = new Float32Array([-0.5, -0.5, -0.5, -0.5]);
  assertClose(vectorEngine.cosineSimilarity(v1, vOpp), -1.0, 1e-6, 'cosineSimilarity: opposite vectors return -1.0');

  // Orthogonal vectors -> 0.0
  const vOrthA = new Float32Array([1, 0, 0, 0]);
  const vOrthB = new Float32Array([0, 1, 0, 0]);
  assertClose(vectorEngine.cosineSimilarity(vOrthA, vOrthB), 0.0, 1e-6, 'cosineSimilarity: orthogonal vectors return 0.0');

  // Zero vectors -> 0.0
  const vZero = new Float32Array([0, 0, 0, 0]);
  assert(vectorEngine.cosineSimilarity(v1, vZero) === 0.0, 'cosineSimilarity: zero vector returns 0.0 without NaN');
})();

// --- Test 4: 512-dim (CLAP) and 768-dim (MERT) vectors ---
(() => {
  const dim512 = 512;
  const embA = new Float32Array(dim512);
  const embB = new Float32Array(dim512);
  for (let i = 0; i < dim512; i++) {
    embA[i] = Math.sin(i * 0.1);
    embB[i] = Math.cos(i * 0.1);
  }

  const sim = vectorEngine.cosineSimilarity(embA, embB);
  assert(sim >= -1.0 && sim <= 1.0, `cosineSimilarity: 512-dim CLAP embedding within [-1, 1] (${sim.toFixed(4)})`);
  assert(!isNaN(sim), 'cosineSimilarity: 512-dim result is a valid float');
})();

// --- Test 5: embeddingToPostgres & postgresVectorToEmbedding round-trip ---
(() => {
  const original = new Float32Array([0.12345678, -0.87654321, 0.0, 1.0]);
  const pgStr = vectorEngine.embeddingToPostgres(original, 8);
  
  assert(pgStr.startsWith('[') && pgStr.endsWith(']'), 'embeddingToPostgres: valid bracketed format');
  assert(/\d+\.\d{8}/.test(pgStr), 'embeddingToPostgres: formats with 8-decimal fixed precision');

  const parsed = vectorEngine.postgresVectorToEmbedding(pgStr);
  assert(parsed instanceof Float32Array, 'postgresVectorToEmbedding: parses back to Float32Array');
  assert(parsed.length === original.length, 'postgresVectorToEmbedding: dimension matches');
  assertClose(parsed[0], original[0], 1e-6, 'postgresVectorToEmbedding: roundtrip parity element 0');
  assertClose(parsed[1], original[1], 1e-6, 'postgresVectorToEmbedding: roundtrip parity element 1');
})();

console.log('--------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
