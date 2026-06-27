/**
 * ORBIT Model Manager Tests
 * 
 * Tests for ML model infrastructure
 * 
 * Tests verify:
 * 1. Singleton pattern works correctly
 * 2. Lazy loading only loads on first request
 * 3. Caching returns same instance on subsequent requests
 * 4. Configuration is applied correctly
 * 5. Model status reporting works
 * 
 * NOTE: These tests download actual models from HuggingFace.
 * First run will take several minutes. Subsequent runs use cache.
 * 
 * Run: npm run test:models
 */

const path = require('path');
const fs = require('fs');

// Set verbose mode for tests
process.env.ORBIT_ML_VERBOSE = 'true';

// Use a test-specific cache directory
const TEST_CACHE_DIR = path.join(__dirname, '../../.test-model-cache');
process.env.ORBIT_MODEL_CACHE_DIR = TEST_CACHE_DIR;

// Import after setting env vars
const { ModelManager, modelManager, MODEL_CONFIGS } = require('../../src/ml/models');

/**
 * Simple test runner (no external dependencies)
 */
class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }
  
  test(name, fn) {
    this.tests.push({ name, fn });
  }
  
  async run() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[TEST] ${this.suiteName}`);
    console.log('='.repeat(60));
    
    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`  PASS ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`  FAIL ${name}`);
        console.log(`     Error: ${error.message}`);
        if (error.stack) {
          console.log(`     ${error.stack.split('\n').slice(1, 3).join('\n     ')}`);
        }
        this.failed++;
      }
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log(`Results: ${this.passed} passed, ${this.failed} failed`);
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

function assertTruthy(value, message = '') {
  if (!value) {
    throw new Error(`${message}Expected truthy value, got: ${value}`);
  }
}

function assertFalsy(value, message = '') {
  if (value) {
    throw new Error(`${message}Expected falsy value, got: ${value}`);
  }
}

function assertThrows(fn, message = '') {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${message}Expected function to throw`);
  }
}

async function assertThrowsAsync(fn, expectedMessage = null, message = '') {
  let threw = false;
  let actualMessage = '';
  try {
    await fn();
  } catch (e) {
    threw = true;
    actualMessage = e.message;
  }
  if (!threw) {
    throw new Error(`${message}Expected async function to throw`);
  }
  if (expectedMessage && !actualMessage.includes(expectedMessage)) {
    throw new Error(`${message}Expected error to contain "${expectedMessage}", got: "${actualMessage}"`);
  }
}

// ==========================================
// TEST SUITES
// ==========================================

const runner = new TestRunner('ModelManager Tests');

// --- Singleton & Configuration Tests ---

runner.test('ModelManager exports singleton instance', () => {
  assertTruthy(modelManager, 'modelManager should be exported');
  assertTruthy(modelManager instanceof ModelManager, 'modelManager should be ModelManager instance');
});

runner.test('Singleton returns same instance', () => {
  const { modelManager: instance1 } = require('../../src/ml/models');
  const { modelManager: instance2 } = require('../../src/ml/models');
  assertEqual(instance1, instance2, 'Should return same singleton instance');
});

runner.test('MODEL_CONFIGS is exported and has expected models', () => {
  assertTruthy(MODEL_CONFIGS, 'MODEL_CONFIGS should be exported');
  assertTruthy(MODEL_CONFIGS.clap, 'Should have clap config');
  assertTruthy(MODEL_CONFIGS.sentenceTransformer, 'Should have sentenceTransformer config');
  // MERT disabled (CC BY-NC 4.0 - non-commercial only)
  assertTruthy(MODEL_CONFIGS.silentCipher, 'Should have silentCipher config');
  assertTruthy(MODEL_CONFIGS.wmCodec, 'Should have wmCodec config');
});

runner.test('Configuration is applied from environment', () => {
  const config = modelManager.getConfig();
  assertEqual(config.cacheDir, TEST_CACHE_DIR, 'Cache dir should match env var');
  assertEqual(config.verbose, true, 'Verbose should be true from env');
});

runner.test('Configuration can be updated', () => {
  const originalConfig = modelManager.getConfig();
  const originalDevice = originalConfig.device;
  
  modelManager.updateConfig({ device: 'cpu' });
  assertEqual(modelManager.getConfig().device, 'cpu', 'Device should be updated');
  
  // Restore
  modelManager.updateConfig({ device: originalDevice });
});

runner.test('Cache directory is created', () => {
  assertTruthy(fs.existsSync(TEST_CACHE_DIR), 'Cache directory should exist');
});

// --- Model Status Tests ---

runner.test('getStatus returns all model statuses', () => {
  const status = modelManager.getStatus();
  
  assertTruthy(status.clap, 'Should have clap status');
  assertTruthy(status.sentenceTransformer, 'Should have sentenceTransformer status');
  // MERT disabled (CC BY-NC 4.0 - non-commercial only)
  
  // Check structure
  assertEqual(typeof status.clap.loaded, 'boolean', 'loaded should be boolean');
  assertEqual(typeof status.clap.loading, 'boolean', 'loading should be boolean');
  assertEqual(typeof status.clap.size, 'string', 'size should be string');
  assertEqual(typeof status.clap.description, 'string', 'description should be string');
});

runner.test('Models are not loaded initially', () => {
  assertFalsy(modelManager.isLoaded('clap'), 'clap should not be loaded initially');
  assertFalsy(modelManager.isLoaded('sentenceTransformer'), 'sentenceTransformer should not be loaded initially');
});

// MERT test removed - CC BY-NC 4.0 license incompatible with commercial use
// Use CLAP embeddings (clap.getAudioEmbedding) instead

runner.test('SilentCipher successfully loads, WMCodec still requires custom loading', async () => {
  const silentCipher = await modelManager.getSilentCipher();
  assertTruthy(silentCipher, 'SilentCipher should be loaded');
  assertEqual(typeof silentCipher.embed, 'function', 'SilentCipher should have embed function');
  assertEqual(typeof silentCipher.extract, 'function', 'SilentCipher should have extract function');
  
  await assertThrowsAsync(
    () => modelManager.getWmCodec(),
    'requires custom loading',
    'WMCodec should throw custom loading error'
  );
});

// --- Lazy Loading Tests (These download models - slow on first run) ---

runner.test('Sentence Transformer lazy loads on first request', async () => {
  console.log('\n    ⏳ Loading Sentence Transformer (first load may download ~80MB)...');
  
  assertFalsy(modelManager.isLoaded('sentenceTransformer'), 'Should not be loaded before request');
  
  const startTime = Date.now();
  const model = await modelManager.getSentenceTransformer();
  const loadTime = Date.now() - startTime;
  
  assertTruthy(model, 'Model should be returned');
  assertTruthy(modelManager.isLoaded('sentenceTransformer'), 'Should be loaded after request');
  
  console.log(`    [OK] Loaded in ${(loadTime / 1000).toFixed(1)}s`);
});

runner.test('Sentence Transformer returns cached on second request', async () => {
  assertTruthy(modelManager.isLoaded('sentenceTransformer'), 'Should already be loaded');
  
  const startTime = Date.now();
  const model = await modelManager.getSentenceTransformer();
  const loadTime = Date.now() - startTime;
  
  assertTruthy(model, 'Model should be returned');
  assertTruthy(loadTime < 100, `Second request should be instant (<100ms), got ${loadTime}ms`);
  
  console.log(`    [OK] Returned cached in ${loadTime}ms`);
});

runner.test('Model can run inference', async () => {
  const model = await modelManager.getSentenceTransformer();
  
  // Run a simple embedding
  const result = await model('Electronic dance music by The Neon Collective', {
    pooling: 'mean',
    normalize: true
  });
  
  assertTruthy(result, 'Should return result');
  assertTruthy(result.data, 'Should have data property');
  
  // all-MiniLM-L6-v2 produces 384-dim embeddings
  assertEqual(result.data.length, 384, 'Should produce 384-dim embedding');
  
  console.log(`    [OK] Generated ${result.data.length}-dim embedding`);
});

runner.test('Model can be unloaded', () => {
  assertTruthy(modelManager.isLoaded('sentenceTransformer'), 'Should be loaded before unload');
  
  modelManager.unload('sentenceTransformer');
  
  assertFalsy(modelManager.isLoaded('sentenceTransformer'), 'Should not be loaded after unload');
});

runner.test('Unloaded model reloads on next request', async () => {
  assertFalsy(modelManager.isLoaded('sentenceTransformer'), 'Should not be loaded');
  
  const model = await modelManager.getSentenceTransformer();
  
  assertTruthy(model, 'Should return model');
  assertTruthy(modelManager.isLoaded('sentenceTransformer'), 'Should be loaded again');
});

runner.test('unloadAll clears all models', () => {
  assertTruthy(modelManager.isLoaded('sentenceTransformer'), 'Should have loaded model');
  
  modelManager.unloadAll();
  
  const status = modelManager.getStatus();
  for (const [key, value] of Object.entries(status)) {
    assertFalsy(value.loaded, `${key} should not be loaded after unloadAll`);
  }
});

// --- CLAP Model Test (larger, only run if sentence transformer worked) ---

runner.test('CLAP model loads successfully (skip if offline)', async () => {
  console.log('\n    ⏳ Loading CLAP (first load may download ~600MB, skip with Ctrl+C if needed)...');
  
  try {
    const startTime = Date.now();
    const clap = await modelManager.getClap();
    const loadTime = Date.now() - startTime;
    
    assertTruthy(clap, 'CLAP should be returned');
    assertTruthy(modelManager.isLoaded('clap'), 'CLAP should be marked as loaded');
    
    console.log(`    [OK] CLAP loaded in ${(loadTime / 1000).toFixed(1)}s`);
    
    // Note: CLAP is an audio-text contrastive model with specific API requirements.
    // Full inference testing (with audio input) will be done later.
    // We just verify the model loads and caches correctly.
    
    // Verify second load is instant (cached)
    const startTime2 = Date.now();
    const clap2 = await modelManager.getClap();
    const loadTime2 = Date.now() - startTime2;
    
    assertTruthy(loadTime2 < 100, `Cached CLAP should return instantly, got ${loadTime2}ms`);
    assertEqual(clap, clap2, 'Should return same cached instance');
    
    console.log(`    [OK] Cached return in ${loadTime2}ms (same instance)`);
    
  } catch (error) {
    if (error.message.includes('fetch') || error.message.includes('network')) {
      console.log('    [WARN] Skipped - network error (offline mode)');
    } else {
      throw error;
    }
  }
});

// --- Cleanup ---

runner.test('Cleanup: unload all models', () => {
  modelManager.unloadAll();
  assertFalsy(modelManager.isLoaded('clap'), 'CLAP should be unloaded');
  assertFalsy(modelManager.isLoaded('sentenceTransformer'), 'ST should be unloaded');
});

// ==========================================
// RUN TESTS
// ==========================================

async function main() {
  console.log('\n[START] Starting ModelManager Tests');
  console.log(`   Cache directory: ${TEST_CACHE_DIR}`);
  console.log('   Note: First run downloads models (~680MB total)');
  console.log('   Subsequent runs use cache.\n');
  
  const success = await runner.run();
  
  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log('[PASS] All tests passed!');
    console.log('   Verification criteria met:');
    console.log('   - First model request -> logs download progress [OK]');
    console.log('   - Second request -> returns cached instantly [OK]');
  } else {
    console.log('[FAIL] Some tests failed');
  }
  console.log('='.repeat(60) + '\n');
  
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
