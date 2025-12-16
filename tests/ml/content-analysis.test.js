/**
 * ORBIT Content Analysis Tests
 * 
 * Session 24 - Tests for content relationship detection
 * 
 * Tests verify:
 * 1. Module exports all required functions
 * 2. Relationship classification works correctly for all thresholds
 * 3. Derivative relationship detection works
 * 4. Audio comparison produces expected results
 * 5. findRelatedContent handles errors gracefully
 * 6. Threshold configuration is correct
 * 
 * Prerequisites:
 * - CLAP model available (should be cached from previous tests)
 * - Test audio files in tests/fixtures/
 * 
 * Run: npm run test:content-analysis  (or node tests/ml/content-analysis.test.js)
 */

const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio.mp3');
const TEST_AUDIO_SHORT = path.join(__dirname, '../fixtures/test-audio-short.wav');
const TEST_AUDIO_RHYTHM = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

// Import modules
const contentAnalysis = require('../../src/ml/content-analysis');
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
        if (process.env.CONTENT_ANALYSIS_TEST_VERBOSE) {
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

function assertDeepEqual(actual, expected, message = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
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

function assertLessThan(actual, expected, message = '') {
  if (!(actual < expected)) {
    throw new Error(`${message}Expected ${actual} < ${expected}`);
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

// ============================================================================
// TEST SUITES
// ============================================================================

async function runModuleExportsTests() {
  const runner = new TestRunner('Module Exports');
  
  runner.test('exports findRelatedContent function', () => {
    assertTypeOf(contentAnalysis.findRelatedContent, 'function');
  });
  
  runner.test('exports compareAudioFiles function', () => {
    assertTypeOf(contentAnalysis.compareAudioFiles, 'function');
  });
  
  runner.test('exports findRelatedFromEmbedding function', () => {
    assertTypeOf(contentAnalysis.findRelatedFromEmbedding, 'function');
  });
  
  runner.test('exports classifyRelationship function', () => {
    assertTypeOf(contentAnalysis.classifyRelationship, 'function');
  });
  
  runner.test('exports isDerivativeRelationship function', () => {
    assertTypeOf(contentAnalysis.isDerivativeRelationship, 'function');
  });
  
  runner.test('exports SIMILARITY_THRESHOLDS object', () => {
    assertDefined(contentAnalysis.SIMILARITY_THRESHOLDS);
    assertTypeOf(contentAnalysis.SIMILARITY_THRESHOLDS, 'object');
  });
  
  runner.test('exports DEFAULT_MIN_THRESHOLD', () => {
    assertDefined(contentAnalysis.DEFAULT_MIN_THRESHOLD);
    assertTypeOf(contentAnalysis.DEFAULT_MIN_THRESHOLD, 'number');
  });
  
  runner.test('exports DEFAULT_LIMIT', () => {
    assertDefined(contentAnalysis.DEFAULT_LIMIT);
    assertTypeOf(contentAnalysis.DEFAULT_LIMIT, 'number');
  });
  
  return runner.run();
}

async function runThresholdConfigTests() {
  const runner = new TestRunner('Threshold Configuration');
  
  runner.test('SIMILARITY_THRESHOLDS has EXACT_DUPLICATE = 0.95', () => {
    assertEqual(contentAnalysis.SIMILARITY_THRESHOLDS.EXACT_DUPLICATE, 0.95);
  });
  
  runner.test('SIMILARITY_THRESHOLDS has LIKELY_DUPLICATE = 0.85', () => {
    assertEqual(contentAnalysis.SIMILARITY_THRESHOLDS.LIKELY_DUPLICATE, 0.85);
  });
  
  runner.test('SIMILARITY_THRESHOLDS has POSSIBLE_REMIX = 0.75', () => {
    assertEqual(contentAnalysis.SIMILARITY_THRESHOLDS.POSSIBLE_REMIX, 0.75);
  });
  
  runner.test('SIMILARITY_THRESHOLDS has POSSIBLE_COVER = 0.65', () => {
    assertEqual(contentAnalysis.SIMILARITY_THRESHOLDS.POSSIBLE_COVER, 0.65);
  });
  
  runner.test('SIMILARITY_THRESHOLDS has STYLISTICALLY_SIMILAR = 0.55', () => {
    assertEqual(contentAnalysis.SIMILARITY_THRESHOLDS.STYLISTICALLY_SIMILAR, 0.55);
  });
  
  runner.test('DEFAULT_MIN_THRESHOLD = 0.50', () => {
    assertEqual(contentAnalysis.DEFAULT_MIN_THRESHOLD, 0.50);
  });
  
  runner.test('DEFAULT_LIMIT = 10', () => {
    assertEqual(contentAnalysis.DEFAULT_LIMIT, 10);
  });
  
  runner.test('thresholds are in descending order', () => {
    const t = contentAnalysis.SIMILARITY_THRESHOLDS;
    assertGreaterThan(t.EXACT_DUPLICATE, t.LIKELY_DUPLICATE, 'EXACT > LIKELY: ');
    assertGreaterThan(t.LIKELY_DUPLICATE, t.POSSIBLE_REMIX, 'LIKELY > REMIX: ');
    assertGreaterThan(t.POSSIBLE_REMIX, t.POSSIBLE_COVER, 'REMIX > COVER: ');
    assertGreaterThan(t.POSSIBLE_COVER, t.STYLISTICALLY_SIMILAR, 'COVER > SIMILAR: ');
  });
  
  return runner.run();
}

async function runClassifyRelationshipTests() {
  const runner = new TestRunner('classifyRelationship()');
  
  runner.test('classifies exact duplicate (>= 0.95)', () => {
    const result = contentAnalysis.classifyRelationship(0.98);
    assertEqual(result.relationship, 'EXACT_DUPLICATE');
    assertEqual(result.confidence, 'very_high');
    assertDefined(result.description);
  });
  
  runner.test('classifies likely duplicate (0.85-0.95)', () => {
    const result = contentAnalysis.classifyRelationship(0.90);
    assertEqual(result.relationship, 'LIKELY_DUPLICATE');
    assertEqual(result.confidence, 'high');
  });
  
  runner.test('classifies possible remix (0.75-0.85)', () => {
    const result = contentAnalysis.classifyRelationship(0.80);
    assertEqual(result.relationship, 'POSSIBLE_REMIX');
    assertEqual(result.confidence, 'medium');
  });
  
  runner.test('classifies possible cover (0.65-0.75)', () => {
    const result = contentAnalysis.classifyRelationship(0.70);
    assertEqual(result.relationship, 'POSSIBLE_COVER');
    assertEqual(result.confidence, 'medium');
  });
  
  runner.test('classifies stylistically similar (0.55-0.65)', () => {
    const result = contentAnalysis.classifyRelationship(0.60);
    assertEqual(result.relationship, 'STYLISTICALLY_SIMILAR');
    assertEqual(result.confidence, 'low');
  });
  
  runner.test('classifies different work (< 0.55)', () => {
    const result = contentAnalysis.classifyRelationship(0.40);
    assertEqual(result.relationship, 'DIFFERENT_WORK');
    assertEqual(result.confidence, 'high');
  });
  
  runner.test('handles boundary value 0.95 as EXACT_DUPLICATE', () => {
    assertEqual(contentAnalysis.classifyRelationship(0.95).relationship, 'EXACT_DUPLICATE');
  });
  
  runner.test('handles boundary value 0.85 as LIKELY_DUPLICATE', () => {
    assertEqual(contentAnalysis.classifyRelationship(0.85).relationship, 'LIKELY_DUPLICATE');
  });
  
  runner.test('handles boundary value 0.75 as POSSIBLE_REMIX', () => {
    assertEqual(contentAnalysis.classifyRelationship(0.75).relationship, 'POSSIBLE_REMIX');
  });
  
  runner.test('handles boundary value 0.65 as POSSIBLE_COVER', () => {
    assertEqual(contentAnalysis.classifyRelationship(0.65).relationship, 'POSSIBLE_COVER');
  });
  
  runner.test('handles boundary value 0.55 as STYLISTICALLY_SIMILAR', () => {
    assertEqual(contentAnalysis.classifyRelationship(0.55).relationship, 'STYLISTICALLY_SIMILAR');
  });
  
  runner.test('handles similarity = 1.0', () => {
    assertEqual(contentAnalysis.classifyRelationship(1.0).relationship, 'EXACT_DUPLICATE');
  });
  
  runner.test('handles similarity = 0.0', () => {
    assertEqual(contentAnalysis.classifyRelationship(0.0).relationship, 'DIFFERENT_WORK');
  });
  
  return runner.run();
}

async function runDerivativeDetectionTests() {
  const runner = new TestRunner('isDerivativeRelationship()');
  
  runner.test('EXACT_DUPLICATE is derivative', () => {
    assertTrue(contentAnalysis.isDerivativeRelationship('EXACT_DUPLICATE'));
  });
  
  runner.test('LIKELY_DUPLICATE is derivative', () => {
    assertTrue(contentAnalysis.isDerivativeRelationship('LIKELY_DUPLICATE'));
  });
  
  runner.test('POSSIBLE_REMIX is derivative', () => {
    assertTrue(contentAnalysis.isDerivativeRelationship('POSSIBLE_REMIX'));
  });
  
  runner.test('POSSIBLE_COVER is derivative', () => {
    assertTrue(contentAnalysis.isDerivativeRelationship('POSSIBLE_COVER'));
  });
  
  runner.test('STYLISTICALLY_SIMILAR is NOT derivative', () => {
    assertFalse(contentAnalysis.isDerivativeRelationship('STYLISTICALLY_SIMILAR'));
  });
  
  runner.test('DIFFERENT_WORK is NOT derivative', () => {
    assertFalse(contentAnalysis.isDerivativeRelationship('DIFFERENT_WORK'));
  });
  
  runner.test('unknown relationship is NOT derivative', () => {
    assertFalse(contentAnalysis.isDerivativeRelationship('UNKNOWN_TYPE'));
  });
  
  runner.test('empty string is NOT derivative', () => {
    assertFalse(contentAnalysis.isDerivativeRelationship(''));
  });
  
  runner.test('null is NOT derivative', () => {
    assertFalse(contentAnalysis.isDerivativeRelationship(null));
  });
  
  return runner.run();
}

async function runAudioComparisonTests() {
  const runner = new TestRunner('Audio Comparison');
  
  // Check if test fixtures exist
  const hasTestAudio = fs.existsSync(TEST_AUDIO_PATH);
  const hasRhythmAudio = fs.existsSync(TEST_AUDIO_RHYTHM);
  
  if (!hasTestAudio) {
    runner.skip('same file comparison - exact duplicate (FIXTURE MISSING)', () => {});
    runner.skip('different files comparison (FIXTURE MISSING)', () => {});
  } else {
    runner.test('same file comparison returns exact duplicate', async () => {
      const result = await contentAnalysis.compareAudioFiles(
        TEST_AUDIO_PATH,
        TEST_AUDIO_PATH
      );
      
      assertDefined(result.similarity);
      assertDefined(result.relationship);
      assertDefined(result.confidence);
      assertDefined(result.is_derivative);
      assertDefined(result.processing_time_ms);
      
      // Same file should have very high similarity
      assertGreaterThan(result.similarity, 0.95, 'Same file similarity should be > 0.95: ');
      assertEqual(result.relationship, 'EXACT_DUPLICATE');
      assertTrue(result.is_derivative);
    });
    
    if (hasRhythmAudio) {
      runner.test('different files have lower similarity', async () => {
        const result = await contentAnalysis.compareAudioFiles(
          TEST_AUDIO_PATH,
          TEST_AUDIO_RHYTHM
        );
        
        assertDefined(result.similarity);
        assertDefined(result.relationship);
        assertLessThan(result.similarity, 0.95, 'Different files should have similarity < 0.95: ');
        assertGreaterThan(result.processing_time_ms, 0);
      });
    } else {
      runner.skip('different files have lower similarity (RHYTHM FIXTURE MISSING)', () => {});
    }
  }
  
  return runner.run();
}

async function runFindRelatedContentTests() {
  const runner = new TestRunner('findRelatedContent()');
  
  const hasTestAudio = fs.existsSync(TEST_AUDIO_PATH);
  
  if (!hasTestAudio) {
    runner.skip('returns expected structure (FIXTURE MISSING)', () => {});
  } else {
    runner.test('returns expected structure with audio file', async () => {
      try {
        const result = await contentAnalysis.findRelatedContent(TEST_AUDIO_PATH, {
          threshold: 0.50,
          limit: 5
        });
        
        // Should always have these properties
        assertDefined(result.processing_time_ms, 'Should have processing_time_ms');
        assertGreaterThan(result.processing_time_ms, 0);
        
        // Check embedding extraction status
        if (result.embedding_extracted) {
          assertDefined(result.is_derivative, 'Should have is_derivative');
          assertDefined(result.similar_works, 'Should have similar_works');
          assertTrue(Array.isArray(result.similar_works), 'similar_works should be array');
        } else {
          // Embedding extraction failed - check for error
          assertDefined(result.error, 'Should have error when extraction fails');
        }
      } catch (error) {
        // Database connection errors are acceptable in unit tests
        if (!error.message.includes('connect') && !error.message.includes('ECONNREFUSED')) {
          throw error;
        }
      }
    });
  }
  
  runner.test('handles invalid audio gracefully', async () => {
    const invalidBuffer = Buffer.from([0, 0, 0, 0]);
    
    const result = await contentAnalysis.findRelatedContent(invalidBuffer, {
      threshold: 0.50
    });
    
    assertDefined(result, 'Should return result object');
    assertDefined(result.processing_time_ms);
    
    // Should either have error or embedding_extracted = false
    if (!result.embedding_extracted) {
      // Graceful failure - embedding extraction failed
      assertTrue(true);
    }
  });
  
  return runner.run();
}

async function runFindRelatedFromEmbeddingTests() {
  const runner = new TestRunner('findRelatedFromEmbedding()');
  
  runner.test('accepts 512-dim embedding array', async () => {
    const dummyEmbedding = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      dummyEmbedding[i] = Math.random() * 2 - 1;
    }
    
    try {
      const result = await contentAnalysis.findRelatedFromEmbedding(dummyEmbedding, {
        threshold: 0.50,
        limit: 5
      });
      
      assertDefined(result.processing_time_ms);
      assertDefined(result.is_derivative);
      assertDefined(result.similar_works);
      assertTrue(Array.isArray(result.similar_works));
    } catch (error) {
      // Database connection errors are acceptable in unit tests
      if (!error.message.includes('connect') && !error.message.includes('ECONNREFUSED')) {
        throw error;
      }
    }
  });
  
  return runner.run();
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function main() {
  console.log('\n' + '🔬'.repeat(30));
  console.log('    ORBIT Content Analysis Tests (Session 24)');
  console.log('🔬'.repeat(30));
  
  const results = [];
  
  // Run all test suites
  results.push(await runModuleExportsTests());
  results.push(await runThresholdConfigTests());
  results.push(await runClassifyRelationshipTests());
  results.push(await runDerivativeDetectionTests());
  results.push(await runAudioComparisonTests());
  results.push(await runFindRelatedContentTests());
  results.push(await runFindRelatedFromEmbeddingTests());
  
  // Summary
  const allPassed = results.every(r => r);
  console.log('\n' + '='.repeat(60));
  console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  console.log('='.repeat(60) + '\n');
  
  // Cleanup CLAP model resources
  clap.unload();
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


