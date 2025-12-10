/**
 * ORBIT Audio Analysis Tests
 * 
 * Session 21 - Tests for BPM, key, energy, and loudness detection
 * 
 * Tests verify:
 * 1. Audio analysis module exports required functions
 * 2. Python environment check works
 * 3. BPM detection returns value with confidence
 * 4. Key detection returns key, mode, and confidence
 * 5. Energy calculation returns 0-1 value
 * 6. Loudness calculation returns dB value
 * 7. Full analysis combines all features
 * 8. Danceability calculation works
 * 9. File and buffer inputs both work
 * 
 * Prerequisites:
 * - Python 3.8+ with librosa and numpy installed
 * - Test audio files in tests/fixtures/
 * 
 * Run: npm run test:audio-analysis  (or node tests/ml/audio-analysis.test.js)
 */

const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio.mp3');
const TEST_AUDIO_WAV_PATH = path.join(__dirname, '../fixtures/test-audio-watermarked.wav');
const TEST_AUDIO_RHYTHM_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');
const EXPECTED_RHYTHM_BPM = 128; // Known BPM of test-audio-rhythm.wav

// Import audio analysis module
const audioAnalysis = require('../../src/ml/audio-analysis');

/**
 * Simple test runner (same pattern as other ML tests)
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
        if (process.env.AUDIO_ANALYSIS_TEST_VERBOSE) {
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

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(`${message}Expected condition to be true`);
  }
}

function assertInRange(value, min, max, message = '') {
  if (value < min || value > max) {
    throw new Error(`${message}Value ${value} not in range [${min}, ${max}]`);
  }
}

function assertType(value, type, message = '') {
  const actualType = typeof value;
  if (actualType !== type) {
    throw new Error(`${message}Expected type: ${type}, Got: ${actualType}`);
  }
}

function assertHasProperty(obj, prop, message = '') {
  if (!(prop in obj)) {
    throw new Error(`${message}Object missing property: ${prop}`);
  }
}

// ==========================================
// Test Suite
// ==========================================

const runner = new TestRunner('ORBIT Audio Analysis Tests (Session 21)');

// ------------------------------------------
// Module Export Tests
// ------------------------------------------

runner.test('Module exports required functions', () => {
  assertType(audioAnalysis.analyze, 'function', 'analyze: ');
  assertType(audioAnalysis.getBpm, 'function', 'getBpm: ');
  assertType(audioAnalysis.getKey, 'function', 'getKey: ');
  assertType(audioAnalysis.getEnergy, 'function', 'getEnergy: ');
  assertType(audioAnalysis.checkPythonEnvironment, 'function', 'checkPythonEnvironment: ');
  assertType(audioAnalysis.calculateDanceability, 'function', 'calculateDanceability: ');
});

runner.test('Config object is exported', () => {
  assertType(audioAnalysis.config, 'object', 'config: ');
  assertHasProperty(audioAnalysis.config, 'scriptPath', 'config: ');
  assertHasProperty(audioAnalysis.config, 'maxLengthSeconds', 'config: ');
  assertHasProperty(audioAnalysis.config, 'pythonCommand', 'config: ');
  assertHasProperty(audioAnalysis.config, 'timeout', 'config: ');
});

// ------------------------------------------
// Python Environment Tests
// ------------------------------------------

runner.test('Python environment check returns status object', async () => {
  const result = await audioAnalysis.checkPythonEnvironment();
  
  assertType(result, 'object', 'Result: ');
  assertHasProperty(result, 'available', 'Result: ');
  assertHasProperty(result, 'message', 'Result: ');
  assertType(result.available, 'boolean', 'available: ');
  assertType(result.message, 'string', 'message: ');
});

runner.test('Python environment is available', async () => {
  const result = await audioAnalysis.checkPythonEnvironment();
  assertTrue(result.available, `Python not available: ${result.message}`);
});

// ------------------------------------------
// Analysis Tests
// ------------------------------------------

runner.test('Full analysis returns all expected fields', async () => {
  const result = await audioAnalysis.analyze(TEST_AUDIO_PATH);
  
  // Check structure
  assertHasProperty(result, 'bpm', 'Result: ');
  assertHasProperty(result, 'key', 'Result: ');
  assertHasProperty(result, 'energy', 'Result: ');
  assertHasProperty(result, 'loudness_db', 'Result: ');
  assertHasProperty(result, 'duration', 'Result: ');
  assertHasProperty(result, 'processingTimeMs', 'Result: ');
  
  // Check BPM structure
  assertHasProperty(result.bpm, 'value', 'bpm: ');
  assertHasProperty(result.bpm, 'confidence', 'bpm: ');
  
  // Check key structure
  assertHasProperty(result.key, 'value', 'key: ');
  assertHasProperty(result.key, 'key', 'key: ');
  assertHasProperty(result.key, 'mode', 'key: ');
  assertHasProperty(result.key, 'confidence', 'key: ');
});

runner.test('BPM detection returns value with confidence', async () => {
  const result = await audioAnalysis.analyze(TEST_AUDIO_PATH);
  
  // BPM value should be a number (may be 0 for audio without beats like sine wave)
  assertType(result.bpm.value, 'number', 'BPM value type: ');
  
  // If BPM is detected, should be in reasonable range
  if (result.bpm.value > 0) {
    assertInRange(result.bpm.value, 40, 240, 'BPM value (when detected): ');
  }
  
  // Confidence should be 0-1
  assertInRange(result.bpm.confidence, 0, 1, 'BPM confidence: ');
});

runner.test('BPM detection accurately detects 128 BPM rhythm track', async () => {
  if (!fs.existsSync(TEST_AUDIO_RHYTHM_PATH)) {
    console.log('     (Rhythm test file not available, run: python scripts/generate_test_audio.py)');
    return;
  }
  
  const result = await audioAnalysis.analyze(TEST_AUDIO_RHYTHM_PATH);
  
  // BPM should be close to 128 (within ±5 BPM tolerance)
  const bpmDiff = Math.abs(result.bpm.value - EXPECTED_RHYTHM_BPM);
  assertTrue(bpmDiff <= 5, `BPM detection off by ${bpmDiff}. Expected ~${EXPECTED_RHYTHM_BPM}, got ${result.bpm.value}`);
  
  // Confidence should be reasonably high for a clear rhythm track
  assertTrue(result.bpm.confidence > 0.3, `Low BPM confidence: ${result.bpm.confidence}`);
  
  console.log(`     (Detected: ${result.bpm.value} BPM, expected: ${EXPECTED_RHYTHM_BPM} BPM, diff: ${bpmDiff.toFixed(1)})`);
});

runner.test('Key detection returns valid key and mode', async () => {
  const result = await audioAnalysis.analyze(TEST_AUDIO_PATH);
  
  // Key should be valid pitch class
  const validKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  assertTrue(validKeys.includes(result.key.key), `Invalid key: ${result.key.key}`);
  
  // Mode should be major or minor
  assertTrue(['major', 'minor'].includes(result.key.mode), `Invalid mode: ${result.key.mode}`);
  
  // Value should combine key and mode
  assertEqual(result.key.value, `${result.key.key} ${result.key.mode}`, 'Key value format: ');
  
  // Confidence should be 0-1
  assertInRange(result.key.confidence, 0, 1, 'Key confidence: ');
});

runner.test('Energy returns 0-1 value', async () => {
  const result = await audioAnalysis.analyze(TEST_AUDIO_PATH);
  
  assertType(result.energy, 'number', 'Energy type: ');
  assertInRange(result.energy, 0, 1, 'Energy value: ');
});

runner.test('Loudness returns dB value', async () => {
  const result = await audioAnalysis.analyze(TEST_AUDIO_PATH);
  
  assertType(result.loudness_db, 'number', 'Loudness type: ');
  // Loudness should be in reasonable range (-60 to 0 dB)
  assertInRange(result.loudness_db, -60, 0, 'Loudness value: ');
});

runner.test('Duration is detected correctly', async () => {
  const result = await audioAnalysis.analyze(TEST_AUDIO_PATH);
  
  assertType(result.duration, 'number', 'Duration type: ');
  assertTrue(result.duration > 0, 'Duration should be positive');
});

// ------------------------------------------
// Helper Function Tests
// ------------------------------------------

runner.test('getBpm returns only BPM result', async () => {
  const result = await audioAnalysis.getBpm(TEST_AUDIO_PATH);
  
  assertHasProperty(result, 'value', 'BPM result: ');
  assertHasProperty(result, 'confidence', 'BPM result: ');
  assertType(result.value, 'number', 'BPM value type: ');
  assertType(result.confidence, 'number', 'BPM confidence type: ');
});

runner.test('getKey returns only key result', async () => {
  const result = await audioAnalysis.getKey(TEST_AUDIO_PATH);
  
  assertHasProperty(result, 'value', 'Key result: ');
  assertHasProperty(result, 'key', 'Key result: ');
  assertHasProperty(result, 'mode', 'Key result: ');
  assertHasProperty(result, 'confidence', 'Key result: ');
});

runner.test('getEnergy returns energy value', async () => {
  const result = await audioAnalysis.getEnergy(TEST_AUDIO_PATH);
  
  assertType(result, 'number', 'Energy type: ');
  assertInRange(result, 0, 1, 'Energy value: ');
});

runner.test('calculateDanceability returns valid score', () => {
  const mockResult = {
    bpm: { value: 120, confidence: 0.9 },
    energy: 0.7,
  };
  
  const danceability = audioAnalysis.calculateDanceability(mockResult);
  
  assertType(danceability, 'number', 'Danceability type: ');
  assertInRange(danceability, 0, 1, 'Danceability value: ');
});

runner.test('calculateDanceability peaks around 115 BPM', () => {
  // Test that danceability is higher for 115 BPM than 80 BPM
  const result115 = audioAnalysis.calculateDanceability({
    bpm: { value: 115, confidence: 0.9 },
    energy: 0.7,
  });
  
  const result80 = audioAnalysis.calculateDanceability({
    bpm: { value: 80, confidence: 0.9 },
    energy: 0.7,
  });
  
  assertTrue(result115 > result80, `Expected 115 BPM (${result115}) to be more danceable than 80 BPM (${result80})`);
});

// ------------------------------------------
// Input Handling Tests
// ------------------------------------------

runner.test('Handles WAV files', async () => {
  if (!fs.existsSync(TEST_AUDIO_WAV_PATH)) {
    console.log('     (WAV test file not available, skipping)');
    return;
  }
  
  const result = await audioAnalysis.analyze(TEST_AUDIO_WAV_PATH);
  
  assertHasProperty(result, 'bpm', 'WAV result: ');
  assertHasProperty(result, 'key', 'WAV result: ');
});

runner.test('Handles Buffer input', async () => {
  const buffer = fs.readFileSync(TEST_AUDIO_PATH);
  const result = await audioAnalysis.analyze(buffer);
  
  assertHasProperty(result, 'bpm', 'Buffer result: ');
  assertHasProperty(result, 'key', 'Buffer result: ');
  assertType(result.bpm.value, 'number', 'BPM should be number from buffer');
  assertType(result.key.value, 'string', 'Key should be string from buffer');
});

runner.test('Throws error for non-existent file', async () => {
  try {
    await audioAnalysis.analyze('/nonexistent/path/audio.mp3');
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertTrue(
      error.message.includes('not found') || error.message.includes('file_not_found'),
      `Expected "not found" error, got: ${error.message}`
    );
  }
});

runner.test('Throws error for invalid input type', async () => {
  try {
    await audioAnalysis.analyze(12345);
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertTrue(
      error.message.includes('must be'),
      `Expected input type error, got: ${error.message}`
    );
  }
});

// ------------------------------------------
// Performance Test
// ------------------------------------------

runner.test('Analysis completes within timeout', async () => {
  const startTime = Date.now();
  await audioAnalysis.analyze(TEST_AUDIO_PATH);
  const elapsed = Date.now() - startTime;
  
  // Should complete within 30 seconds for test audio
  assertTrue(elapsed < 30000, `Analysis took ${elapsed}ms, expected < 30000ms`);
});

// ==========================================
// Run Tests
// ==========================================

async function main() {
  // Check for test fixtures
  if (!fs.existsSync(TEST_AUDIO_PATH)) {
    console.error(`\n❌ Test audio file not found: ${TEST_AUDIO_PATH}`);
    console.error('   Please ensure tests/fixtures/test-audio.mp3 exists');
    process.exit(1);
  }
  
  console.log('\n📁 Test Files:');
  console.log(`   MP3: ${TEST_AUDIO_PATH}`);
  console.log(`   WAV: ${fs.existsSync(TEST_AUDIO_WAV_PATH) ? TEST_AUDIO_WAV_PATH : '(not available)'}`);
  
  const success = await runner.run();
  
  console.log('\n');
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('\n❌ Test suite crashed:', error.message);
  process.exit(1);
});
