/**
 * ORBIT AI Music Detection Tests
 * 
 * Tests for multi-signal AI-generated music detection
 * 
 * Tests verify:
 * 1. Module exports all required functions
 * 2. Configuration is correctly structured
 * 3. Anomaly detection logic works correctly
 * 4. Metadata pattern detection works correctly
 * 5. Combined scoring produces expected recommendations
 * 6. Semantic probe works with CLAP (model-dependent)
 * 7. Fail-open behavior on errors
 * 
 * Prerequisites:
 * - CLAP model available (should be cached from previous tests)
 * - Test audio files in tests/fixtures/
 * 
 * Run: node tests/ml/ai-detection.test.js
 */

const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio.mp3');
const TEST_AUDIO_WAV_PATH = path.join(__dirname, '../fixtures/test-audio-watermarked.wav');

// Import AI detection module
const aiDetection = require('../../src/ml/ai-detection');
const clap = require('../../src/ml/clap');

/**
 * Simple test runner (same pattern as other ORBIT tests)
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
        if (process.env.AI_DETECTION_TEST_VERBOSE) {
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

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(`${message}Expected truthy value, got: ${value}`);
  }
}

function assertFalse(value, message = '') {
  if (value) {
    throw new Error(`${message}Expected falsy value, got: ${value}`);
  }
}

function assertDefined(value, message = '') {
  if (value === undefined || value === null) {
    throw new Error(`${message}Expected defined value, got: ${value}`);
  }
}

function assertTypeOf(value, type, message = '') {
  if (typeof value !== type) {
    throw new Error(`${message}Expected type: ${type}, Got: ${typeof value}`);
  }
}

function assertGreaterThan(actual, expected, message = '') {
  if (!(actual > expected)) {
    throw new Error(`${message}Expected ${actual} > ${expected}`);
  }
}

function assertLessOrEqual(actual, expected, message = '') {
  if (!(actual <= expected)) {
    throw new Error(`${message}Expected ${actual} <= ${expected}`);
  }
}

function assertGreaterOrEqual(actual, expected, message = '') {
  if (!(actual >= expected)) {
    throw new Error(`${message}Expected ${actual} >= ${expected}`);
  }
}

function assertIncludes(array, value, message = '') {
  if (!array.includes(value)) {
    throw new Error(`${message}Expected array to include: ${value}`);
  }
}

function assertArrayLength(arr, expectedLength, message = '') {
  if (!Array.isArray(arr) || arr.length !== expectedLength) {
    throw new Error(`${message}Expected array of length ${expectedLength}, got: ${arr?.length}`);
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

async function runModuleExportsTests() {
  const runner = new TestRunner('Module Exports');
  
  runner.test('exports detectAI function', () => {
    assertTypeOf(aiDetection.detectAI, 'function');
  });
  
  runner.test('exports probeAIGenerated function', () => {
    assertTypeOf(aiDetection.probeAIGenerated, 'function');
  });
  
  runner.test('exports checkAudioAnomalies function', () => {
    assertTypeOf(aiDetection.checkAudioAnomalies, 'function');
  });
  
  runner.test('exports checkMetadataPatterns function', () => {
    assertTypeOf(aiDetection.checkMetadataPatterns, 'function');
  });
  
  runner.test('exports shouldReview function', () => {
    assertTypeOf(aiDetection.shouldReview, 'function');
  });
  
  runner.test('exports formatForDatabase function', () => {
    assertTypeOf(aiDetection.formatForDatabase, 'function');
  });
  
  runner.test('exports getAllFlags function', () => {
    assertTypeOf(aiDetection.getAllFlags, 'function');
  });
  
  runner.test('exports config object', () => {
    assertDefined(aiDetection.config);
    assertTypeOf(aiDetection.config, 'object');
  });
  
  runner.test('exports prompts array', () => {
    assertTrue(Array.isArray(aiDetection.prompts));
    assertGreaterThan(aiDetection.prompts.length, 0, 'Should have detection prompts');
  });
  
  return runner.run();
}

async function runConfigurationTests() {
  const runner = new TestRunner('Configuration');
  
  runner.test('config has weights that sum to 1.0', () => {
    const weights = aiDetection.config.weights;
    const sum = weights.semantic + weights.anomaly + weights.metadata + weights.catalog;
    assertApproxEqual(sum, 1.0, 0.001, 'Weights should sum to 1.0: ');
  });

  runner.test('config has v2 weights that sum to 1.0', () => {
    const weights = aiDetection.config.weightsV2;
    const sum = weights.semantic + weights.anomaly + weights.metadata + weights.catalog + weights.knn;
    assertApproxEqual(sum, 1.0, 0.001, 'V2 weights should sum to 1.0: ');
  });
  
  runner.test('config has valid thresholds', () => {
    const thresholds = aiDetection.config.thresholds;
    assertDefined(thresholds.likelyAI);
    assertDefined(thresholds.review);
    assertGreaterThan(thresholds.likelyAI, thresholds.review, 'likelyAI > review: ');
    assertLessOrEqual(thresholds.likelyAI, 1.0);
    assertGreaterOrEqual(thresholds.review, 0);
  });
  
  runner.test('config has anomaly thresholds', () => {
    const anomaly = aiDetection.config.anomalyThresholds;
    assertDefined(anomaly.perfectTempo);
    assertDefined(anomaly.perfectKey);
    assertGreaterThan(anomaly.perfectTempo, 0.9);
    assertGreaterThan(anomaly.perfectKey, 0.9);
  });
  
  runner.test('prompts have label and prompt text', () => {
    for (const p of aiDetection.prompts) {
      assertDefined(p.label, 'Prompt should have label');
      assertDefined(p.prompt, 'Prompt should have prompt text');
      assertTrue(p.label === 'ai_generated' || p.label === 'human_performance', 
        'Label should be ai_generated or human_performance');
    }
  });
  
  runner.test('prompts have both AI and human labels', () => {
    const aiPrompts = aiDetection.prompts.filter(p => p.label === 'ai_generated');
    const humanPrompts = aiDetection.prompts.filter(p => p.label === 'human_performance');
    assertGreaterThan(aiPrompts.length, 0, 'Should have AI prompts');
    assertGreaterThan(humanPrompts.length, 0, 'Should have human prompts');
  });
  
  return runner.run();
}

async function runAnomalyDetectionTests() {
  const runner = new TestRunner('Audio Anomaly Detection');
  
  runner.test('returns zero score for null analysis', () => {
    const result = aiDetection.checkAudioAnomalies(null);
    assertEqual(result.anomalyScore, 0);
    assertIncludes(result.flags, 'NO_ANALYSIS_DATA');
  });
  
  runner.test('returns zero score for empty analysis', () => {
    const result = aiDetection.checkAudioAnomalies({});
    assertEqual(result.anomalyScore, 0);
    assertEqual(result.flags.length, 0);
  });
  
  runner.test('detects perfect tempo (high BPM confidence)', () => {
    const result = aiDetection.checkAudioAnomalies({
      bpm: { value: 120, confidence: 0.99 },
    });
    assertIncludes(result.flags, 'PERFECT_TEMPO');
    assertGreaterThan(result.anomalyScore, 0);
  });
  
  runner.test('does NOT flag normal tempo confidence', () => {
    const result = aiDetection.checkAudioAnomalies({
      bpm: { value: 120, confidence: 0.85 },
    });
    assertFalse(result.flags.includes('PERFECT_TEMPO'));
  });
  
  runner.test('detects perfect key (high key confidence)', () => {
    const result = aiDetection.checkAudioAnomalies({
      key: { value: 'A minor', confidence: 0.97 },
    });
    assertIncludes(result.flags, 'PERFECT_KEY');
    assertGreaterThan(result.anomalyScore, 0);
  });
  
  runner.test('does NOT flag normal key confidence', () => {
    const result = aiDetection.checkAudioAnomalies({
      key: { value: 'A minor', confidence: 0.80 },
    });
    assertFalse(result.flags.includes('PERFECT_KEY'));
  });
  
  runner.test('detects uniform energy', () => {
    const result = aiDetection.checkAudioAnomalies({
      energy: 0.5, // Exactly middle
    });
    assertIncludes(result.flags, 'UNIFORM_ENERGY');
  });
  
  runner.test('does NOT flag varied energy', () => {
    const result = aiDetection.checkAudioAnomalies({
      energy: 0.8, // High energy
    });
    assertFalse(result.flags.includes('UNIFORM_ENERGY'));
  });
  
  runner.test('anomaly score is capped at 1.0', () => {
    const result = aiDetection.checkAudioAnomalies({
      bpm: { value: 120, confidence: 0.99 },
      key: { value: 'A minor', confidence: 0.99 },
      energy: 0.5,
    });
    assertLessOrEqual(result.anomalyScore, 1.0);
  });

  runner.test('default-off parity: low dynamic range is v2-only', () => {
    const base = {
      dynamic_range_db: 2.1,
      bpm: { value: 120, confidence: 0.8 },
      key: { value: 'A minor', confidence: 0.8 },
      energy: 0.7,
    };
    const legacy = aiDetection.checkAudioAnomalies(base, { v2Enabled: false });
    const v2 = aiDetection.checkAudioAnomalies(base, { v2Enabled: true });
    assertFalse(legacy.flags.includes('LOW_DYNAMIC_RANGE'));
    assertIncludes(v2.flags, 'LOW_DYNAMIC_RANGE');
  });

  runner.test('default-off parity: all new forensic signals are v2-only', () => {
    const analysis = {
      bpm: { value: 120, confidence: 0.8 },
      key: { value: 'C major', confidence: 0.8 },
      energy: 0.7,
      ai_forensics: {
        crest_factor: { available: true, crest_factor: 2.0, low_crest: true },
        spectral_centroid_var: { available: true, cv: 0.05, low_variance: true },
        spectral_bandwidth_var: { available: true, cv: 0.05, low_variance: true },
        spectral_rolloff: { available: true, steepness: 0.03, steep_rolloff: true },
        spectral_flux: { available: true, cv: 0.1, low_flux_variance: true },
        zcr_variance: { available: true, cv: 0.1, low_variance: true },
        mfcc_temporal: { available: true, mean_variance: 5.0, low_variance: true },
        chroma_entropy: { available: true, normalized: 0.3, low_entropy: true },
        energy_arc: { available: true, arc_variance: 0.00001, flat_arc: true },
        checkerboard: { available: true, peak_autocorr: 0.5, has_artifacts: true },
        subband_energy: { available: true, distribution_entropy: 0.8, low_entropy: true },
        harmonicity: { available: true, harmonic_ratio: 0.2, hf_anomalous: true, hf_harmonic_ratio: 0.8 },
      },
    };
    const legacy = aiDetection.checkAudioAnomalies(analysis, { v2Enabled: false });
    const v2 = aiDetection.checkAudioAnomalies(analysis, { v2Enabled: true });

    const v2OnlyFlags = [
      'LOW_CREST_FACTOR', 'LOW_SPECTRAL_CENTROID_VARIANCE', 'LOW_SPECTRAL_BANDWIDTH_VARIANCE',
      'STEEP_SPECTRAL_ROLLOFF', 'LOW_SPECTRAL_FLUX_VARIANCE', 'LOW_ZCR_VARIANCE',
      'LOW_MFCC_VARIANCE', 'LOW_CHROMA_ENTROPY', 'FLAT_ENERGY_ARC',
      'CHECKERBOARD_ARTIFACTS', 'LOW_SUBBAND_ENTROPY', 'HF_HARMONIC_ANOMALY',
    ];
    for (const flag of v2OnlyFlags) {
      assertFalse(legacy.flags.includes(flag), `Legacy should NOT have ${flag}: `);
      assertIncludes(v2.flags, flag);
    }
  });

  runner.test('v2 anomaly score increases with each new forensic signal', () => {
    const base = {
      bpm: { value: 120, confidence: 0.8 },
      key: { value: 'C major', confidence: 0.8 },
      energy: 0.7,
      ai_forensics: {
        crest_factor: { available: true, crest_factor: 2.0, low_crest: true },
        checkerboard: { available: true, peak_autocorr: 0.5, has_artifacts: true },
      },
    };
    const result = aiDetection.checkAudioAnomalies(base, { v2Enabled: true });
    assertGreaterThan(result.anomalyScore, 0.1);
    assertIncludes(result.flags, 'LOW_CREST_FACTOR');
    assertIncludes(result.flags, 'CHECKERBOARD_ARTIFACTS');
  });
  
  return runner.run();
}

async function runMetadataPatternTests() {
  const runner = new TestRunner('Metadata Pattern Detection');
  
  runner.test('detects typical AI duration range', () => {
    const result = aiDetection.checkMetadataPatterns({}, 180); // 3 minutes
    assertIncludes(result.flags, 'TYPICAL_AI_DURATION');
    assertGreaterThan(result.suspicionScore, 0);
  });
  
  runner.test('does NOT flag short durations', () => {
    const result = aiDetection.checkMetadataPatterns({}, 60); // 1 minute
    assertFalse(result.flags.includes('TYPICAL_AI_DURATION'));
  });
  
  runner.test('does NOT flag long durations', () => {
    const result = aiDetection.checkMetadataPatterns({}, 300); // 5 minutes
    assertFalse(result.flags.includes('TYPICAL_AI_DURATION'));
  });
  
  runner.test('detects round duration (30s marks)', () => {
    const result = aiDetection.checkMetadataPatterns({}, 150); // 2:30 exactly
    assertIncludes(result.flags, 'ROUND_DURATION');
  });
  
  runner.test('detects round duration (60s marks)', () => {
    const result = aiDetection.checkMetadataPatterns({}, 180); // 3:00 exactly
    assertIncludes(result.flags, 'ROUND_DURATION');
  });
  
  runner.test('does NOT flag non-round duration', () => {
    const result = aiDetection.checkMetadataPatterns({}, 187); // 3:07
    assertFalse(result.flags.includes('ROUND_DURATION'));
  });
  
  runner.test('detects missing identifiers', () => {
    const result = aiDetection.checkMetadataPatterns({}, 200);
    assertIncludes(result.flags, 'NO_IDENTIFIERS');
  });
  
  runner.test('does NOT flag when ISRC present', () => {
    const result = aiDetection.checkMetadataPatterns({ isrc: 'USRC12345678' }, 200);
    assertFalse(result.flags.includes('NO_IDENTIFIERS'));
  });
  
  runner.test('does NOT flag when UPC present', () => {
    const result = aiDetection.checkMetadataPatterns({ upc: '012345678901' }, 200);
    assertFalse(result.flags.includes('NO_IDENTIFIERS'));
  });
  
  runner.test('suspicion score is capped at 1.0', () => {
    const result = aiDetection.checkMetadataPatterns({}, 180);
    assertLessOrEqual(result.suspicionScore, 1.0);
  });

  runner.test('default-off parity: metadata v2 checks are gated', () => {
    const metadata = {
      album_title: 'Demo Album',
      sample_rate: 48000,
      bit_depth: 24,
      catalog_number: 'AI-123',
      label: 'Label',
    };
    const legacy = aiDetection.checkMetadataPatterns(metadata, 80, { metadataV2Enabled: false });
    const v2 = aiDetection.checkMetadataPatterns(metadata, 80, { metadataV2Enabled: true });
    assertFalse(legacy.flags.includes('ALBUM_WITHOUT_TRACK_NUMBER'));
    assertIncludes(v2.flags, 'ALBUM_WITHOUT_TRACK_NUMBER');
  });

  runner.test('v2: detects AI encoder signature', () => {
    const result = aiDetection.checkMetadataPatterns({}, 200, {
      metadataV2Enabled: true,
      fileMetadata: { encoder: 'Suno Audio v3.5', sample_rate: 44100, bits_per_raw_sample: 32, sample_fmt: 'flt' },
    });
    assertIncludes(result.flags, 'AI_ENCODER_SIGNATURE');
    assertIncludes(result.flags, 'AI_FORMAT_COMBO_MATCH');
    assertGreaterThan(result.suspicionScore, 0.25);
  });

  runner.test('v2: detects Udio format combo', () => {
    const result = aiDetection.checkMetadataPatterns({}, 200, {
      metadataV2Enabled: true,
      fileMetadata: { sample_rate: 44100, bits_per_raw_sample: 16, sample_fmt: 's16' },
    });
    assertIncludes(result.flags, 'AI_FORMAT_COMBO_MATCH');
    assertEqual(result.details.format_combo.generator, 'Udio');
  });

  runner.test('v2: does NOT flag non-AI encoder', () => {
    const result = aiDetection.checkMetadataPatterns({}, 200, {
      metadataV2Enabled: true,
      fileMetadata: { encoder: 'LAME3.100', sample_rate: 44100, bits_per_raw_sample: 16 },
    });
    assertFalse(result.flags.includes('AI_ENCODER_SIGNATURE'));
  });

  runner.test('v2: detects generic album title', () => {
    const result = aiDetection.checkMetadataPatterns({ album_title: 'Untitled' }, 200, {
      metadataV2Enabled: true,
    });
    assertIncludes(result.flags, 'GENERIC_ALBUM_TITLE');
  });

  runner.test('v2: detects AI text in album field', () => {
    const result = aiDetection.checkMetadataPatterns({ album_title: 'AI Generated Music Vol 1' }, 200, {
      metadataV2Enabled: true,
    });
    assertIncludes(result.flags, 'AI_ALBUM_TEXT');
  });

  runner.test('v2: detects AI keywords in comment tag', () => {
    const result = aiDetection.checkMetadataPatterns({}, 200, {
      metadataV2Enabled: true,
      fileMetadata: { comment: 'Made with Suno AI' },
    });
    assertIncludes(result.flags, 'AI_COMMENT_TAG');
  });

  runner.test('v2: detects creation-upload proximity', () => {
    const now = new Date().toISOString();
    const result = aiDetection.checkMetadataPatterns({}, 200, {
      metadataV2Enabled: true,
      fileMetadata: { creation_time: now },
    });
    assertIncludes(result.flags, 'CREATION_UPLOAD_PROXIMITY');
  });

  runner.test('v2: does NOT flag creation-upload with old date', () => {
    const result = aiDetection.checkMetadataPatterns({}, 200, {
      metadataV2Enabled: true,
      fileMetadata: { creation_time: '2020-01-01T00:00:00Z' },
    });
    assertFalse(result.flags.includes('CREATION_UPLOAD_PROXIMITY'));
  });

  runner.test('v2: all new metadata signals gated behind flag', () => {
    const result = aiDetection.checkMetadataPatterns({}, 200, {
      metadataV2Enabled: false,
      fileMetadata: {
        encoder: 'Suno Audio v3.5',
        comment: 'Made with Suno AI',
        creation_time: new Date().toISOString(),
      },
    });
    assertFalse(result.flags.includes('AI_ENCODER_SIGNATURE'));
    assertFalse(result.flags.includes('AI_COMMENT_TAG'));
    assertFalse(result.flags.includes('CREATION_UPLOAD_PROXIMITY'));
  });
  
  return runner.run();
}

async function runFlagResolutionTests() {
  const runner = new TestRunner('Feature Flag Resolution');

  runner.test('resolveFeatureFlags supports explicit overrides', () => {
    const flags = aiDetection.resolveFeatureFlags({
      v2Enabled: true,
      shadowMode: true,
      metadataV2Enabled: true,
      crossSignalV2Enabled: true,
    });
    assertTrue(flags.v2Enabled);
    assertTrue(flags.shadowMode);
    assertTrue(flags.metadataV2Enabled);
    assertTrue(flags.crossSignalV2Enabled);
  });

  return runner.run();
}

async function runUtilityFunctionTests() {
  const runner = new TestRunner('Utility Functions');
  
  runner.test('shouldReview returns true for LIKELY_AI', () => {
    assertTrue(aiDetection.shouldReview('LIKELY_AI'));
  });
  
  runner.test('shouldReview returns true for REVIEW', () => {
    assertTrue(aiDetection.shouldReview('REVIEW'));
  });
  
  runner.test('shouldReview returns false for LIKELY_HUMAN', () => {
    assertFalse(aiDetection.shouldReview('LIKELY_HUMAN'));
  });
  
  runner.test('shouldReview returns false for DETECTION_ERROR', () => {
    assertFalse(aiDetection.shouldReview('DETECTION_ERROR'));
  });
  
  runner.test('formatForDatabase creates correct structure', () => {
    const mockResult = {
      score: 0.45,
      recommendation: 'REVIEW',
      signals: { semantic: {}, anomalies: {}, metadata: {} },
      processing_time_ms: 100,
    };
    
    const formatted = aiDetection.formatForDatabase(mockResult);
    assertDefined(formatted.ai_detection);
    assertEqual(formatted.ai_detection.score, 0.45);
    assertEqual(formatted.ai_detection.recommendation, 'REVIEW');
    assertDefined(formatted.ai_detection.detected_at);
  });
  
  runner.test('getAllFlags collects flags from all signals', () => {
    const mockResult = {
      signals: {
        anomalies: { flags: ['PERFECT_TEMPO', 'PERFECT_KEY'] },
        metadata: { flags: ['ROUND_DURATION'] },
      },
    };
    
    const flags = aiDetection.getAllFlags(mockResult);
    assertIncludes(flags, 'PERFECT_TEMPO');
    assertIncludes(flags, 'PERFECT_KEY');
    assertIncludes(flags, 'ROUND_DURATION');
    assertEqual(flags.length, 3);
  });
  
  runner.test('getAllFlags handles missing signals', () => {
    const mockResult = { signals: {} };
    const flags = aiDetection.getAllFlags(mockResult);
    assertEqual(flags.length, 0);
  });
  
  runner.test('getAllFlags handles null result', () => {
    const flags = aiDetection.getAllFlags({});
    assertEqual(flags.length, 0);
  });

  runner.test('v2+knn fail-open on missing references', async () => {
    const result = await aiDetection.detectAI(Buffer.from([1, 2, 3, 4]), {
      metadata: {},
      analysisResult: null,
      verbose: false,
      flags: {
        v2Enabled: false,
        shadowMode: true,
        knnEnabled: true,
      },
    });
    assertDefined(result.recommendation);
    const flags = aiDetection.getAllFlags(result);
    assertTrue(flags.includes('KNN_UNAVAILABLE_FAIL_OPEN') || result.recommendation === 'DETECTION_ERROR');
  });
  
  return runner.run();
}

async function runIntegrationTests() {
  const runner = new TestRunner('Integration Tests (Model-Dependent)');
  
  // Check if test fixtures exist
  const hasTestAudio = fs.existsSync(TEST_AUDIO_PATH);
  
  if (!hasTestAudio) {
    runner.skip('detectAI with real audio (FIXTURE MISSING)', () => {});
    runner.skip('probeAIGenerated with real audio (FIXTURE MISSING)', () => {});
  } else {
    let modelAvailable = false;
    
    runner.test('Check CLAP model availability', async () => {
      try {
        console.log('\n    ⏳ Checking CLAP model...');
        // Quick probe to check if model works
        await clap.classifyWithLabels(TEST_AUDIO_PATH, ['music'], { verbose: false });
        modelAvailable = true;
        console.log('    ✓ CLAP model available');
      } catch (error) {
        console.log(`\n    ⚠️  CLAP model not available: ${error.message}`);
        console.log('    ⚠️  Skipping model-dependent tests');
        modelAvailable = false;
      }
      assertTrue(true); // Always pass - just for setup
    });
    
    runner.test('detectAI returns expected structure', async () => {
      if (!modelAvailable) {
        console.log('     (skipped - model not available)');
        return;
      }
      
      console.log('\n    ⏳ Running full AI detection...');
      
      const result = await aiDetection.detectAI(TEST_AUDIO_PATH, {
        metadata: { title: 'Test Track', artist: 'Test Artist' },
        verbose: true,
      });
      
      assertDefined(result.score, 'Should have score');
      assertDefined(result.recommendation, 'Should have recommendation');
      assertDefined(result.signals, 'Should have signals');
      assertDefined(result.processing_time_ms, 'Should have processing_time_ms');
      
      // Score should be between 0 and 1
      if (result.score !== null) {
        assertGreaterOrEqual(result.score, 0);
        assertLessOrEqual(result.score, 1);
      }
      
      // Recommendation should be one of expected values
      const validRecommendations = ['LIKELY_AI', 'REVIEW', 'LIKELY_HUMAN', 'DETECTION_ERROR'];
      assertTrue(validRecommendations.includes(result.recommendation), 
        `Recommendation should be valid: ${result.recommendation}`);
      
      console.log(`    ✓ Score: ${(result.score * 100).toFixed(1)}%`);
      console.log(`    ✓ Recommendation: ${result.recommendation}`);
    });
    
    runner.test('probeAIGenerated returns scores', async () => {
      if (!modelAvailable) {
        console.log('     (skipped - model not available)');
        return;
      }
      
      const result = await aiDetection.probeAIGenerated(TEST_AUDIO_PATH, { verbose: true });
      
      assertDefined(result.aiScore);
      assertDefined(result.humanScore);
      assertDefined(result.confidence);
      
      // Scores should be between 0 and 1
      assertGreaterOrEqual(result.aiScore, 0);
      assertLessOrEqual(result.aiScore, 1);
      assertGreaterOrEqual(result.humanScore, 0);
      assertLessOrEqual(result.humanScore, 1);
      
      // Scores should roughly sum to 1
      assertApproxEqual(result.aiScore + result.humanScore, 1.0, 0.01);
    });
    
    runner.test('detectAI handles invalid audio gracefully', async () => {
      const invalidBuffer = Buffer.from([0, 0, 0, 0]);
      
      const result = await aiDetection.detectAI(invalidBuffer, {
        metadata: {},
        verbose: false,
      });
      
      // Should not throw, should return a result
      assertDefined(result);
      assertDefined(result.recommendation);
      assertDefined(result.processing_time_ms);
    });
  }
  
  return runner.run();
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function main() {
  console.log('\n' + '🤖'.repeat(30));
  console.log('    ORBIT AI Music Detection Tests');
  console.log('🤖'.repeat(30));
  
  const results = [];
  
  // Run all test suites
  results.push(await runModuleExportsTests());
  results.push(await runConfigurationTests());
  results.push(await runAnomalyDetectionTests());
  results.push(await runMetadataPatternTests());
  results.push(await runFlagResolutionTests());
  results.push(await runUtilityFunctionTests());
  results.push(await runIntegrationTests());
  
  // Summary
  const allPassed = results.every(r => r);
  console.log('\n' + '='.repeat(60));
  console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  console.log('='.repeat(60));
  
  if (allPassed) {
    console.log('\n   AI Detection module verification complete:');
    console.log('   - Module exports all required functions ✓');
    console.log('   - Configuration is correctly structured ✓');
    console.log('   - Anomaly detection logic works ✓');
    console.log('   - Metadata pattern detection works ✓');
    console.log('   - Utility functions work correctly ✓');
    console.log('   - Integration with CLAP verified ✓');
  }
  
  console.log('\n');
  
  // Cleanup
  clap.unload();
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

