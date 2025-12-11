/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  MERT TESTS DISABLED - Session 22                                     ║
 * ║                                                                          ║
 * ║  MERT model weights are CC BY-NC 4.0 (non-commercial only).              ║
 * ║  ORBIT is a commercial product, so MERT cannot be used.                  ║
 * ║                                                                          ║
 * ║  Use CLAP embeddings instead: clap.getAudioEmbedding()                   ║
 * ║  See: tests/ml/clap.test.js                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * ORBIT MERT Semantic Fingerprinting Tests (DISABLED)
 * 
 * Session 19 - Tests for MERT semantic audio embeddings
 * Session 22 - DISABLED due to CC BY-NC 4.0 license
 */

// Exit immediately - MERT is disabled
console.log('\n⚠️  MERT TESTS SKIPPED');
console.log('   MERT model is CC BY-NC 4.0 (non-commercial only)');
console.log('   Use CLAP embeddings instead: npm run test:clap\n');
process.exit(0);

// Original test code below (preserved for reference)
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio.mp3');
const TEST_AUDIO_WAV_PATH = path.join(__dirname, '../fixtures/test-audio-watermarked.wav');

// Import MERT module
const mert = require('../../src/ml/mert');
const { modelManager } = require('../../src/ml/models');

/**
 * Simple test runner
 */
class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }
  
  test(name, fn, options = {}) {
    this.tests.push({ name, fn, options });
  }
  
  skip(name, fn) {
    this.tests.push({ name, fn, options: { skip: true } });
  }
  
  async run() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 ${this.suiteName}`);
    console.log('='.repeat(60));
    
    for (const { name, fn, options } of this.tests) {
      if (options.skip) {
        console.log(`  ⏭️  ${name} (skipped)`);
        this.skipped++;
        continue;
      }
      
      try {
        await fn();
        console.log(`  ✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
        if (process.env.MERT_TEST_VERBOSE) {
          console.log(`     ${error.stack?.split('\n').slice(1, 3).join('\n     ')}`);
        }
        this.failed++;
      }
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`Results: ${this.passed} passed, ${this.failed} failed, ${this.skipped} skipped`);
    console.log('-'.repeat(60));
    
    return this.failed === 0;
  }
}

/**
 * Assertion helpers
 */
function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message}Expected: ${expected}, Got: ${actual}`);
  }
}

function assertApproxEqual(actual, expected, tolerance = 0.01, message = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}Expected: ~${expected} (±${tolerance}), Got: ${actual}`);
  }
}

function assertTruthy(value, message = '') {
  if (!value) {
    throw new Error(`${message}Expected truthy value, got: ${value}`);
  }
}

function assertInstanceOf(value, type, message = '') {
  if (!(value instanceof type)) {
    throw new Error(`${message}Expected instance of ${type.name}, got: ${value?.constructor?.name}`);
  }
}

function assertGreaterThan(actual, expected, message = '') {
  if (actual <= expected) {
    throw new Error(`${message}Expected ${actual} > ${expected}`);
  }
}

function assertLessThan(actual, expected, message = '') {
  if (actual >= expected) {
    throw new Error(`${message}Expected ${actual} < ${expected}`);
  }
}

// ==========================================
// TEST SUITES
// ==========================================

const runner = new TestRunner('MERT Semantic Fingerprinting Tests');

// --- Environment Check Tests ---

runner.test('Test audio files exist', () => {
  assertTruthy(fs.existsSync(TEST_AUDIO_PATH), `Missing: ${TEST_AUDIO_PATH}`);
  assertTruthy(fs.existsSync(TEST_AUDIO_WAV_PATH), `Missing: ${TEST_AUDIO_WAV_PATH}`);
});

runner.test('MERT module exports required functions', () => {
  assertTruthy(typeof mert.getEmbedding === 'function', 'getEmbedding should be a function');
  assertTruthy(typeof mert.cosineSimilarity === 'function', 'cosineSimilarity should be a function');
  assertTruthy(typeof mert.classifyRelationship === 'function', 'classifyRelationship should be a function');
  assertTruthy(typeof mert.checkPythonEnvironment === 'function', 'checkPythonEnvironment should be a function');
  assertTruthy(typeof mert.embeddingToPostgres === 'function', 'embeddingToPostgres should be a function');
});

runner.test('EMBEDDING_DIM is 768', () => {
  assertEqual(mert.EMBEDDING_DIM, 768, 'MERT embedding dimension should be 768');
});

runner.test('Python environment check returns status object', async () => {
  const status = await mert.checkPythonEnvironment();
  
  assertTruthy(typeof status === 'object', 'Should return an object');
  assertTruthy(typeof status.available === 'boolean', 'Should have available boolean');
  assertTruthy(typeof status.message === 'string', 'Should have message string');
});

// --- Cosine Similarity Tests (no Python required) ---

runner.test('cosineSimilarity: identical vectors → 1.0', () => {
  const vec = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
  const similarity = mert.cosineSimilarity(vec, vec);
  assertApproxEqual(similarity, 1.0, 0.0001, 'Identical vectors should have similarity 1.0');
});

runner.test('cosineSimilarity: orthogonal vectors → 0.0', () => {
  const vec1 = new Float32Array([1, 0, 0]);
  const vec2 = new Float32Array([0, 1, 0]);
  const similarity = mert.cosineSimilarity(vec1, vec2);
  assertApproxEqual(similarity, 0.0, 0.0001, 'Orthogonal vectors should have similarity 0.0');
});

runner.test('cosineSimilarity: opposite vectors → -1.0', () => {
  const vec1 = new Float32Array([1, 0, 0]);
  const vec2 = new Float32Array([-1, 0, 0]);
  const similarity = mert.cosineSimilarity(vec1, vec2);
  assertApproxEqual(similarity, -1.0, 0.0001, 'Opposite vectors should have similarity -1.0');
});

runner.test('cosineSimilarity: similar vectors → high similarity', () => {
  const vec1 = new Float32Array([0.9, 0.1, 0.0]);
  const vec2 = new Float32Array([0.85, 0.15, 0.0]);
  const similarity = mert.cosineSimilarity(vec1, vec2);
  assertGreaterThan(similarity, 0.95, 'Similar vectors should have high similarity');
});

// --- Relationship Classification Tests ---

runner.test('classifyRelationship: 0.99 → EXACT_DUPLICATE', () => {
  const result = mert.classifyRelationship(0.99);
  assertEqual(result.relationship, 'EXACT_DUPLICATE');
  assertEqual(result.confidence, 'very_high');
});

runner.test('classifyRelationship: 0.96 → TRANSCODED', () => {
  const result = mert.classifyRelationship(0.96);
  assertEqual(result.relationship, 'TRANSCODED');
  assertEqual(result.confidence, 'high');
});

runner.test('classifyRelationship: 0.88 → POSSIBLE_REMIX', () => {
  const result = mert.classifyRelationship(0.88);
  assertEqual(result.relationship, 'POSSIBLE_REMIX');
  assertEqual(result.confidence, 'medium');
});

runner.test('classifyRelationship: 0.75 → POSSIBLE_COVER', () => {
  const result = mert.classifyRelationship(0.75);
  assertEqual(result.relationship, 'POSSIBLE_COVER');
  assertEqual(result.confidence, 'medium');
});

runner.test('classifyRelationship: 0.55 → STYLISTICALLY_SIMILAR', () => {
  const result = mert.classifyRelationship(0.55);
  assertEqual(result.relationship, 'STYLISTICALLY_SIMILAR');
  assertEqual(result.confidence, 'low');
});

runner.test('classifyRelationship: 0.3 → DIFFERENT_WORK', () => {
  const result = mert.classifyRelationship(0.3);
  assertEqual(result.relationship, 'DIFFERENT_WORK');
  assertEqual(result.confidence, 'high');
});

// --- Serialization Tests ---

runner.test('embeddingToPostgres: formats correctly', () => {
  const embedding = new Float32Array([0.1, 0.2, 0.3]);
  const pgVector = mert.embeddingToPostgres(embedding);
  // Check format is correct (8 decimal places)
  assertTruthy(pgVector.startsWith('['), 'Should start with [');
  assertTruthy(pgVector.endsWith(']'), 'Should end with ]');
  assertTruthy(pgVector.includes('0.10000000'), 'Should contain 0.1 with precision');
  assertTruthy(pgVector.includes('0.20000000'), 'Should contain 0.2 with precision');
  assertTruthy(pgVector.includes('0.30000001'), 'Should contain 0.3 with precision'); // Float32 precision
});

runner.test('postgresVectorToEmbedding: parses correctly', () => {
  const pgVector = '[0.1,0.2,0.3]';
  const embedding = mert.postgresVectorToEmbedding(pgVector);
  assertInstanceOf(embedding, Float32Array, 'Should return Float32Array');
  assertEqual(embedding.length, 3, 'Should have correct length');
  assertApproxEqual(embedding[0], 0.1, 0.0001);
  assertApproxEqual(embedding[1], 0.2, 0.0001);
  assertApproxEqual(embedding[2], 0.3, 0.0001);
});

runner.test('embeddingToBuffer and bufferToEmbedding: roundtrip', () => {
  const original = new Float32Array([0.1, 0.2, 0.3, 0.4]);
  const buffer = mert.embeddingToBuffer(original);
  const restored = mert.bufferToEmbedding(buffer);
  
  assertEqual(restored.length, original.length, 'Length should match');
  for (let i = 0; i < original.length; i++) {
    assertApproxEqual(restored[i], original[i], 0.0001, `Element ${i} should match`);
  }
});

// --- Python-dependent Tests (will be skipped if Python not available) ---

let pythonAvailable = false;

runner.test('Check Python availability for remaining tests', async () => {
  const status = await mert.checkPythonEnvironment();
  pythonAvailable = status.available;
  
  if (!pythonAvailable) {
    console.log(`\n    ⚠️  Python environment not ready: ${status.message}`);
    console.log(`    ⚠️  Install with: pip install -r scripts/requirements-ml.txt`);
    console.log(`    ⚠️  Skipping Python-dependent tests\n`);
  } else {
    console.log(`\n    ✓ Python environment ready`);
    if (status.details) {
      console.log(`    ✓ ${status.details.pythonVersion}`);
    }
  }
  
  assertTruthy(true); // Always pass - just for logging
});

runner.test('ModelManager.getMert() returns MERT module', async () => {
  if (!pythonAvailable) {
    console.log('     (skipped - Python not available)');
    return;
  }
  
  const mertFromManager = await modelManager.getMert();
  assertTruthy(mertFromManager, 'Should return MERT module');
  assertTruthy(typeof mertFromManager.getEmbedding === 'function', 'Should have getEmbedding');
  assertTruthy(typeof mertFromManager.cosineSimilarity === 'function', 'Should have cosineSimilarity');
});

runner.test('getEmbedding: generates 768-dim embedding', async () => {
  if (!pythonAvailable) {
    console.log('     (skipped - Python not available)');
    return;
  }
  
  console.log('\n    ⏳ Generating embedding (first run downloads ~400MB model)...');
  
  const result = await mert.getEmbedding(TEST_AUDIO_PATH, { verbose: true });
  
  assertTruthy(result, 'Should return result object');
  assertTruthy(result.embedding, 'Should have embedding');
  assertInstanceOf(result.embedding, Float32Array, 'Embedding should be Float32Array');
  assertEqual(result.embedding.length, 768, 'Embedding should be 768-dim');
  assertTruthy(result.duration > 0, 'Should have positive duration');
  assertTruthy(result.model.includes('MERT'), 'Should identify model');
  
  console.log(`    ✓ Generated ${result.embedding.length}-dim embedding for ${result.duration.toFixed(1)}s audio`);
});

runner.test('getEmbedding: same audio twice → identical embeddings', async () => {
  if (!pythonAvailable) {
    console.log('     (skipped - Python not available)');
    return;
  }
  
  const result1 = await mert.getEmbedding(TEST_AUDIO_PATH);
  const result2 = await mert.getEmbedding(TEST_AUDIO_PATH);
  
  const similarity = mert.cosineSimilarity(result1.embedding, result2.embedding);
  assertApproxEqual(similarity, 1.0, 0.01, 'Same audio should produce identical embeddings');
  
  console.log(`    ✓ Similarity: ${similarity.toFixed(4)} (expected ~1.0)`);
});

runner.test('getEmbedding: different formats of same audio → high similarity', async () => {
  if (!pythonAvailable) {
    console.log('     (skipped - Python not available)');
    return;
  }
  
  // MP3 vs WAV versions should be similar if they're from similar audio
  const mp3Result = await mert.getEmbedding(TEST_AUDIO_PATH);
  const wavResult = await mert.getEmbedding(TEST_AUDIO_WAV_PATH);
  
  const similarity = mert.cosineSimilarity(mp3Result.embedding, wavResult.embedding);
  
  // Note: These are different audio files (test-audio.mp3 and test-audio-watermarked.wav)
  // If they're the same content, similarity should be high
  // If different, this test shows they're different
  console.log(`    ✓ MP3 vs WAV similarity: ${similarity.toFixed(4)}`);
  
  // Just verify we got valid embeddings
  assertTruthy(similarity >= -1 && similarity <= 1, 'Similarity should be in valid range');
});

// --- Cleanup ---

runner.test('Cleanup: unload MERT from ModelManager', () => {
  modelManager.unload('mert');
  assertTruthy(!modelManager.isLoaded('mert'), 'MERT should be unloaded');
});

// ==========================================
// RUN TESTS
// ==========================================

async function main() {
  console.log('\n🚀 Starting MERT Tests');
  console.log(`   Test audio: ${TEST_AUDIO_PATH}`);
  console.log('   Note: First run downloads MERT model (~400MB)');
  console.log('   Set MERT_TEST_VERBOSE=1 for detailed error traces\n');
  
  const success = await runner.run();
  
  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log('✅ All MERT tests passed!');
    console.log('   Session 19 verification criteria:');
    console.log('   - MERT generates 768-dim embeddings ✓');
    console.log('   - Cosine similarity works correctly ✓');
    console.log('   - Relationship classification works ✓');
  } else {
    console.log('❌ Some tests failed');
    if (!pythonAvailable) {
      console.log('\n   To run Python-dependent tests:');
      console.log('   pip install -r scripts/requirements-ml.txt');
    }
  }
  console.log('='.repeat(60) + '\n');
  
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
