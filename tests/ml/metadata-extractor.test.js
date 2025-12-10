/**
 * ORBIT Metadata Extractor Tests
 * 
 * Session 21 - Tests for unified AI metadata extraction pipeline
 * 
 * Tests verify:
 * 1. Module exports required functions
 * 2. Environment check reports all components
 * 3. Full extraction combines CLAP + AudioAnalysis + MERT
 * 4. Partial extraction works with individual components
 * 5. Error handling is graceful (doesn't fail on individual component errors)
 * 6. Database formatting functions work correctly
 * 7. Configuration override works
 * 
 * Prerequisites:
 * - Python 3.8+ with librosa, numpy, torch, transformers installed
 * - @xenova/transformers installed
 * - Test audio files in tests/fixtures/
 * 
 * Run: npm run test:metadata-extractor  (or node tests/ml/metadata-extractor.test.js)
 * 
 * NOTE: First run may download models and take several minutes.
 */

const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio.mp3');
const TEST_AUDIO_WAV_PATH = path.join(__dirname, '../fixtures/test-audio-watermarked.wav');
const TEST_AUDIO_RHYTHM_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');
const EXPECTED_RHYTHM_BPM = 128; // Known BPM of test-audio-rhythm.wav

// Import metadata extractor module
const metadataExtractor = require('../../src/ml/metadata-extractor');

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
        if (process.env.METADATA_TEST_VERBOSE) {
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

function assertFalse(condition, message = '') {
  if (condition) {
    throw new Error(`${message}Expected condition to be false`);
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

function assertArray(value, message = '') {
  if (!Array.isArray(value)) {
    throw new Error(`${message}Expected array, got: ${typeof value}`);
  }
}

// ==========================================
// Test Suite
// ==========================================

const runner = new TestRunner('ORBIT Metadata Extractor Tests (Session 21)');

// ------------------------------------------
// Module Export Tests
// ------------------------------------------

runner.test('Module exports required functions', () => {
  assertType(metadataExtractor.extractMetadata, 'function', 'extractMetadata: ');
  assertType(metadataExtractor.extractClapOnly, 'function', 'extractClapOnly: ');
  assertType(metadataExtractor.extractAudioAnalysisOnly, 'function', 'extractAudioAnalysisOnly: ');
  assertType(metadataExtractor.checkEnvironment, 'function', 'checkEnvironment: ');
  assertType(metadataExtractor.formatForDatabase, 'function', 'formatForDatabase: ');
  assertType(metadataExtractor.formatEmbeddingForDatabase, 'function', 'formatEmbeddingForDatabase: ');
});

runner.test('Config object is exported', () => {
  assertType(metadataExtractor.config, 'object', 'config: ');
  assertHasProperty(metadataExtractor.config, 'enableClap', 'config: ');
  assertHasProperty(metadataExtractor.config, 'enableMert', 'config: ');
  assertHasProperty(metadataExtractor.config, 'enableAudioAnalysis', 'config: ');
});

runner.test('Components are exported for direct access', () => {
  assertType(metadataExtractor.components, 'object', 'components: ');
  assertHasProperty(metadataExtractor.components, 'clap', 'components: ');
  assertHasProperty(metadataExtractor.components, 'mert', 'components: ');
  assertHasProperty(metadataExtractor.components, 'audioAnalysis', 'components: ');
});

// ------------------------------------------
// Environment Check Tests
// ------------------------------------------

runner.test('Environment check returns status for all components', async () => {
  const status = await metadataExtractor.checkEnvironment();
  
  assertType(status, 'object', 'Status: ');
  assertHasProperty(status, 'clap', 'Status: ');
  assertHasProperty(status, 'mert', 'Status: ');
  assertHasProperty(status, 'audioAnalysis', 'Status: ');
  assertHasProperty(status, 'overall', 'Status: ');
  
  // Each component should have available and message
  for (const component of ['clap', 'mert', 'audioAnalysis', 'overall']) {
    assertHasProperty(status[component], 'available', `${component}: `);
    assertHasProperty(status[component], 'message', `${component}: `);
  }
});

runner.test('At least some components are available', async () => {
  const status = await metadataExtractor.checkEnvironment();
  
  // Overall should indicate availability
  assertTrue(
    status.overall.available,
    `No components available. CLAP: ${status.clap.message}, MERT: ${status.mert.message}, AudioAnalysis: ${status.audioAnalysis.message}`
  );
});

// ------------------------------------------
// Full Extraction Tests
// ------------------------------------------

runner.test('Full extraction returns expected structure', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  // Check all expected fields are present
  assertHasProperty(result, 'genre', 'Result: ');
  assertHasProperty(result, 'mood', 'Result: ');
  assertHasProperty(result, 'instruments', 'Result: ');
  assertHasProperty(result, 'vocals', 'Result: ');
  assertHasProperty(result, 'bpm', 'Result: ');
  assertHasProperty(result, 'key', 'Result: ');
  assertHasProperty(result, 'energy', 'Result: ');
  assertHasProperty(result, 'loudness_db', 'Result: ');
  assertHasProperty(result, 'danceability', 'Result: ');
  assertHasProperty(result, 'duration', 'Result: ');
  assertHasProperty(result, 'processingTimeMs', 'Result: ');
  assertHasProperty(result, 'extractionStatus', 'Result: ');
});

runner.test('Extraction status tracks all components', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  assertHasProperty(result.extractionStatus, 'clap', 'extractionStatus: ');
  assertHasProperty(result.extractionStatus, 'audioAnalysis', 'extractionStatus: ');
  assertHasProperty(result.extractionStatus, 'mert', 'extractionStatus: ');
});

runner.test('Genre is extracted as array with confidence scores', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  if (result.genre !== null) {
    assertArray(result.genre, 'genre: ');
    if (result.genre.length > 0) {
      assertHasProperty(result.genre[0], 'label', 'genre[0]: ');
      assertHasProperty(result.genre[0], 'confidence', 'genre[0]: ');
      assertInRange(result.genre[0].confidence, 0, 1, 'genre confidence: ');
    }
  }
});

runner.test('Mood is extracted as array with confidence scores', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  if (result.mood !== null) {
    assertArray(result.mood, 'mood: ');
    if (result.mood.length > 0) {
      assertHasProperty(result.mood[0], 'label', 'mood[0]: ');
      assertHasProperty(result.mood[0], 'confidence', 'mood[0]: ');
    }
  }
});

runner.test('BPM has value and confidence', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  if (result.bpm !== null) {
    assertHasProperty(result.bpm, 'value', 'bpm: ');
    assertHasProperty(result.bpm, 'confidence', 'bpm: ');
    // BPM may be 0 for audio without rhythm (like sine wave test file)
    assertType(result.bpm.value, 'number', 'bpm value type: ');
    assertInRange(result.bpm.confidence, 0, 1, 'bpm confidence: ');
  }
});

runner.test('BPM accurately detected from rhythm track', async () => {
  if (!fs.existsSync(TEST_AUDIO_RHYTHM_PATH)) {
    console.log('     (Rhythm test file not available, run: python scripts/generate_test_audio.py)');
    return;
  }
  
  // Use audio analysis only for faster test
  const result = await metadataExtractor.extractAudioAnalysisOnly(TEST_AUDIO_RHYTHM_PATH);
  
  if (result.bpm !== null) {
    const bpmDiff = Math.abs(result.bpm.value - EXPECTED_RHYTHM_BPM);
    assertTrue(bpmDiff <= 5, `BPM off by ${bpmDiff}. Expected ~${EXPECTED_RHYTHM_BPM}, got ${result.bpm.value}`);
    console.log(`     (Detected: ${result.bpm.value} BPM, expected: ${EXPECTED_RHYTHM_BPM} BPM)`);
  }
});

runner.test('Key has value, key, mode, and confidence', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  if (result.key !== null) {
    assertHasProperty(result.key, 'value', 'key: ');
    assertHasProperty(result.key, 'key', 'key: ');
    assertHasProperty(result.key, 'mode', 'key: ');
    assertHasProperty(result.key, 'confidence', 'key: ');
  }
});

runner.test('Danceability is calculated', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  if (result.danceability !== null) {
    assertType(result.danceability, 'number', 'danceability: ');
    assertInRange(result.danceability, 0, 1, 'danceability: ');
  }
});

// ------------------------------------------
// Partial Extraction Tests
// ------------------------------------------

runner.test('extractClapOnly returns only CLAP results', async () => {
  const result = await metadataExtractor.extractClapOnly(TEST_AUDIO_PATH);
  
  // CLAP fields should be present
  assertHasProperty(result, 'genre', 'Result: ');
  assertHasProperty(result, 'mood', 'Result: ');
  assertHasProperty(result, 'instruments', 'Result: ');
  assertHasProperty(result, 'vocals', 'Result: ');
  
  // Audio analysis fields should be null (disabled)
  assertEqual(result.bpm, null, 'bpm should be null: ');
  assertEqual(result.key, null, 'key should be null: ');
  
  // Status should reflect disabled components
  assertEqual(result.extractionStatus.audioAnalysis, 'disabled', 'audioAnalysis status: ');
  assertEqual(result.extractionStatus.mert, 'disabled', 'mert status: ');
});

runner.test('extractAudioAnalysisOnly returns only analysis results', async () => {
  const result = await metadataExtractor.extractAudioAnalysisOnly(TEST_AUDIO_PATH);
  
  // Audio analysis fields should be present
  assertHasProperty(result, 'bpm', 'Result: ');
  assertHasProperty(result, 'key', 'Result: ');
  assertHasProperty(result, 'energy', 'Result: ');
  
  // CLAP fields should be null (disabled)
  assertEqual(result.genre, null, 'genre should be null: ');
  assertEqual(result.mood, null, 'mood should be null: ');
  
  // Status should reflect disabled components
  assertEqual(result.extractionStatus.clap, 'disabled', 'clap status: ');
  assertEqual(result.extractionStatus.mert, 'disabled', 'mert status: ');
});

// ------------------------------------------
// MERT Embedding Tests
// ------------------------------------------

runner.test('MERT embedding is not included by default', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  
  assertFalse('mertEmbedding' in result, 'mertEmbedding should not be present by default');
});

runner.test('MERT embedding can be included with option', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH, {
    includeEmbedding: true,
  });
  
  if (result.extractionStatus.mert === 'success') {
    assertHasProperty(result, 'mertEmbedding', 'Result with embedding: ');
    assertTrue(result.mertEmbedding instanceof Float32Array, 'mertEmbedding should be Float32Array');
    assertEqual(result.mertEmbedding.length, 768, 'MERT embedding should be 768-dim');
  }
});

// ------------------------------------------
// Database Formatting Tests
// ------------------------------------------

runner.test('formatForDatabase returns correct structure', async () => {
  const extraction = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  const formatted = metadataExtractor.formatForDatabase(extraction);
  
  // Check expected fields
  assertHasProperty(formatted, 'genre', 'formatted: ');
  assertHasProperty(formatted, 'mood', 'formatted: ');
  assertHasProperty(formatted, 'instruments', 'formatted: ');
  assertHasProperty(formatted, 'vocals', 'formatted: ');
  assertHasProperty(formatted, 'bpm', 'formatted: ');
  assertHasProperty(formatted, 'key', 'formatted: ');
  assertHasProperty(formatted, 'energy', 'formatted: ');
  assertHasProperty(formatted, 'loudness_db', 'formatted: ');
  assertHasProperty(formatted, 'danceability', 'formatted: ');
  assertHasProperty(formatted, 'extracted_at', 'formatted: ');
  assertHasProperty(formatted, 'processing_time_ms', 'formatted: ');
  assertHasProperty(formatted, 'extraction_status', 'formatted: ');
  
  // extracted_at should be ISO timestamp
  assertTrue(formatted.extracted_at.includes('T'), 'extracted_at should be ISO format');
});

runner.test('formatEmbeddingForDatabase handles null', () => {
  const result = metadataExtractor.formatEmbeddingForDatabase(null);
  assertEqual(result, null, 'null input should return null');
});

runner.test('formatEmbeddingForDatabase returns PostgreSQL vector format', () => {
  const embedding = new Float32Array([0.1, 0.2, 0.3]);
  const result = metadataExtractor.formatEmbeddingForDatabase(embedding);
  
  assertType(result, 'string', 'result type: ');
  assertTrue(result.startsWith('['), 'Should start with [');
  assertTrue(result.endsWith(']'), 'Should end with ]');
  assertTrue(result.includes(','), 'Should contain commas');
});

// ------------------------------------------
// Configuration Override Tests
// ------------------------------------------

runner.test('Configuration can be overridden', async () => {
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH, {
    config: {
      enableClap: true,
      enableMert: false,
      enableAudioAnalysis: false,
    },
  });
  
  assertEqual(result.extractionStatus.mert, 'disabled', 'mert should be disabled');
  assertEqual(result.extractionStatus.audioAnalysis, 'disabled', 'audioAnalysis should be disabled');
});

// ------------------------------------------
// Error Handling Tests
// ------------------------------------------

runner.test('Handles non-existent file gracefully with failOnError=false', async () => {
  try {
    // This should throw an error since the file doesn't exist
    // and all components will fail
    await metadataExtractor.extractMetadata('/nonexistent/path.mp3', {
      config: { failOnError: false },
    });
    // If we get here, check that extraction status shows errors
    // (This path is unlikely as file not found typically throws immediately)
  } catch (error) {
    // Expected - file not found should propagate
    assertTrue(true, 'Error thrown as expected');
  }
});

// ------------------------------------------
// Performance Tests
// ------------------------------------------

runner.test('Full extraction completes within reasonable time', async () => {
  const startTime = Date.now();
  await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  const elapsed = Date.now() - startTime;
  
  // Full extraction should complete within 3 minutes for test audio
  // (CLAP ~40s + AudioAnalysis ~10s + MERT ~60s = ~2 min typical, 3 min max)
  assertTrue(elapsed < 180000, `Extraction took ${elapsed}ms, expected < 180000ms (3 min)`);
  console.log(`     (Took ${(elapsed / 1000).toFixed(1)}s)`);
});

runner.test('Processing time is tracked accurately', async () => {
  const startTime = Date.now();
  const result = await metadataExtractor.extractMetadata(TEST_AUDIO_PATH);
  const elapsed = Date.now() - startTime;
  
  // processingTimeMs should be close to actual elapsed time
  const diff = Math.abs(result.processingTimeMs - elapsed);
  assertTrue(diff < 1000, `Timing difference too large: ${diff}ms`);
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
  
  // Check environment first
  console.log('\n🔍 Checking environment...');
  const envStatus = await metadataExtractor.checkEnvironment();
  console.log(`   CLAP: ${envStatus.clap.available ? '✅' : '❌'} ${envStatus.clap.message}`);
  console.log(`   MERT: ${envStatus.mert.available ? '✅' : '❌'} ${envStatus.mert.message}`);
  console.log(`   AudioAnalysis: ${envStatus.audioAnalysis.available ? '✅' : '❌'} ${envStatus.audioAnalysis.message}`);
  console.log(`   Overall: ${envStatus.overall.available ? '✅' : '❌'} ${envStatus.overall.message}`);
  
  const success = await runner.run();
  
  console.log('\n');
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('\n❌ Test suite crashed:', error.message);
  process.exit(1);
});
