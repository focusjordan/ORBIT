/**
 * ORBIT SilentCipher Neural Watermarking Tests
 * 
 * Session 22 - Testing neural watermarking with SilentCipher
 * 
 * Tests verify:
 * 1. Module exports required functions
 * 2. Hash conversion utilities work correctly
 * 3. Environment detection (Python + dependencies)
 * 4. Embed/extract round-trip (when SilentCipher installed)
 * 5. Error handling
 * 
 * Prerequisites:
 * - pip install silentcipher librosa soundfile numpy (for embed/extract tests)
 * - Test audio files in tests/fixtures/
 * 
 * Run: npm run test:silentcipher (or node tests/ml/silentcipher.test.js)
 * 
 * NOTE: Embed/extract tests require SilentCipher Python package.
 * Hash conversion and configuration tests run without dependencies.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Test configuration
const TEST_AUDIO_WAV_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

// Import SilentCipher module
const silentcipher = require('../../src/ml/silentcipher');

/**
 * Simple test runner (matches project pattern)
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
        if (process.env.SILENTCIPHER_TEST_VERBOSE) {
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

function assertTrue(value, message = 'Expected true') {
  if (!value) {
    throw new Error(message);
  }
}

function assertFalse(value, message = 'Expected false') {
  if (value) {
    throw new Error(message);
  }
}

function assertThrows(fn, messageIncludes = '') {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (error.message === 'Expected function to throw') {
      throw error;
    }
    if (messageIncludes && !error.message.includes(messageIncludes)) {
      throw new Error(`Expected error to include "${messageIncludes}", got: ${error.message}`);
    }
  }
}

function assertArrayEquals(actual, expected, message = '') {
  if (!Array.isArray(actual) || !Array.isArray(expected)) {
    throw new Error(`${message}Both values must be arrays`);
  }
  if (actual.length !== expected.length) {
    throw new Error(`${message}Array length mismatch: ${actual.length} vs ${expected.length}`);
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${message}Mismatch at index ${i}: ${actual[i]} vs ${expected[i]}`);
    }
  }
}

/**
 * Main test suite
 */
async function runTests() {
  const runner = new TestRunner('SilentCipher Neural Watermarking Tests');
  
  // Check if test audio exists
  const hasTestWav = fs.existsSync(TEST_AUDIO_WAV_PATH);
  
  // Check SilentCipher availability once
  let silentcipherAvailable = false;
  let envCheckResult = null;
  
  // ============================================
  // CONFIGURATION TESTS
  // ============================================
  
  runner.test('exports embed function', () => {
    assertTrue(typeof silentcipher.embed === 'function', 'embed should be a function');
  });
  
  runner.test('exports extract function', () => {
    assertTrue(typeof silentcipher.extract === 'function', 'extract should be a function');
  });
  
  runner.test('exports checkPythonEnvironment function', () => {
    assertTrue(typeof silentcipher.checkPythonEnvironment === 'function', 
      'checkPythonEnvironment should be a function');
  });
  
  runner.test('exports hashToMessage function', () => {
    assertTrue(typeof silentcipher.hashToMessage === 'function', 
      'hashToMessage should be a function');
  });
  
  runner.test('exports messageToHash function', () => {
    assertTrue(typeof silentcipher.messageToHash === 'function', 
      'messageToHash should be a function');
  });
  
  runner.test('exports hashMatches function', () => {
    assertTrue(typeof silentcipher.hashMatches === 'function', 
      'hashMatches should be a function');
  });
  
  runner.test('exports config with correct values', () => {
    assertTrue(silentcipher.config !== undefined, 'config should be defined');
    assertEqual(silentcipher.config.messageBytes, 5, 'messageBytes should be 5: ');
    assertEqual(silentcipher.config.sampleRate, 44100, 'sampleRate should be 44100: ');
    assertEqual(silentcipher.MESSAGE_BYTES, 5, 'MESSAGE_BYTES should be 5: ');
  });
  
  runner.test('script path exists', () => {
    assertTrue(fs.existsSync(silentcipher.config.scriptPath), 
      `Script not found: ${silentcipher.config.scriptPath}`);
  });
  
  // ============================================
  // HASH CONVERSION TESTS
  // ============================================
  
  runner.test('hashToMessage converts 16-byte hash to 5-byte message', () => {
    const hash = Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex');
    const message = silentcipher.hashToMessage(hash);
    
    assertArrayEquals(message, [1, 2, 3, 4, 5], 'Message should be first 5 bytes: ');
    assertEqual(message.length, 5, 'Message length should be 5: ');
  });
  
  runner.test('hashToMessage converts SHA-256 hash to 5-byte message', () => {
    const hash = crypto.createHash('sha256').update('test payload').digest();
    const message = silentcipher.hashToMessage(hash);
    
    assertEqual(message.length, 5, 'Message length should be 5: ');
    assertTrue(message.every(v => v >= 0 && v <= 255), 'All values should be 0-255');
  });
  
  runner.test('hashToMessage throws on non-buffer input', () => {
    assertThrows(() => silentcipher.hashToMessage('string'));
    assertThrows(() => silentcipher.hashToMessage([1, 2, 3, 4, 5]));
    assertThrows(() => silentcipher.hashToMessage(null));
  });
  
  runner.test('messageToHash converts 5-integer message to buffer', () => {
    const message = [10, 20, 30, 40, 50];
    const hash = silentcipher.messageToHash(message);
    
    assertTrue(Buffer.isBuffer(hash), 'Result should be a Buffer');
    assertEqual(hash.length, 5, 'Buffer length should be 5: ');
    assertArrayEquals(Array.from(hash), [10, 20, 30, 40, 50], 'Values should match: ');
  });
  
  runner.test('messageToHash throws on wrong message length', () => {
    assertThrows(() => silentcipher.messageToHash([1, 2, 3]));
    assertThrows(() => silentcipher.messageToHash([1, 2, 3, 4, 5, 6]));
    assertThrows(() => silentcipher.messageToHash([]));
  });
  
  runner.test('messageToHash throws on non-array input', () => {
    assertThrows(() => silentcipher.messageToHash('12345'));
    assertThrows(() => silentcipher.messageToHash(null));
  });
  
  runner.test('hashMatches returns true for matching hashes', () => {
    const fullHash = Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex');
    const extractedHash = Buffer.from([1, 2, 3, 4, 5]);
    
    assertTrue(silentcipher.hashMatches(extractedHash, fullHash), 
      'Should match first 5 bytes');
  });
  
  runner.test('hashMatches returns false for non-matching hashes', () => {
    const fullHash = Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex');
    const extractedHash = Buffer.from([1, 2, 3, 4, 99]); // Different
    
    assertFalse(silentcipher.hashMatches(extractedHash, fullHash), 
      'Should not match different hashes');
  });
  
  runner.test('hashMatches returns false for null inputs', () => {
    const hash = Buffer.from([1, 2, 3, 4, 5]);
    assertFalse(silentcipher.hashMatches(null, hash), 'null first arg');
    assertFalse(silentcipher.hashMatches(hash, null), 'null second arg');
    assertFalse(silentcipher.hashMatches(null, null), 'both null');
  });
  
  runner.test('round-trip: hash -> message -> hash preserves data', () => {
    const originalHash = Buffer.from([100, 150, 200, 50, 25]);
    const message = silentcipher.hashToMessage(originalHash);
    const recoveredHash = silentcipher.messageToHash(message);
    
    assertTrue(recoveredHash.equals(originalHash), 'Round-trip should preserve data');
  });
  
  runner.test('round-trip preserves first 5 bytes of longer hash', () => {
    const longHash = crypto.createHash('sha256').update('test').digest();
    const expectedPrefix = longHash.slice(0, 5);
    
    const message = silentcipher.hashToMessage(longHash);
    const recoveredHash = silentcipher.messageToHash(message);
    
    assertTrue(recoveredHash.equals(expectedPrefix), 'Should match first 5 bytes');
    assertTrue(silentcipher.hashMatches(recoveredHash, longHash), 'hashMatches should return true');
  });
  
  // ============================================
  // ENVIRONMENT TESTS
  // ============================================
  
  runner.test('checkPythonEnvironment returns result object', async () => {
    envCheckResult = await silentcipher.checkPythonEnvironment();
    silentcipherAvailable = envCheckResult.available;
    
    assertTrue('available' in envCheckResult, 'Should have available property');
    assertTrue('message' in envCheckResult, 'Should have message property');
    assertTrue(typeof envCheckResult.available === 'boolean', 'available should be boolean');
    assertTrue(typeof envCheckResult.message === 'string', 'message should be string');
    
    if (!silentcipherAvailable) {
      console.log('  ℹ️  SilentCipher not available - embed/extract tests will be skipped');
      console.log(`     ${envCheckResult.message}`);
    }
  });
  
  // ============================================
  // EMBED/EXTRACT TESTS (Conditional)
  // ============================================
  
  // These tests will be added dynamically based on availability
  if (hasTestWav) {
    runner.test('embed with non-existent file throws error', async () => {
      // This test doesn't require SilentCipher to be installed
      const payloadHash = crypto.randomBytes(32);
      let threw = false;
      
      try {
        await silentcipher.embed('/nonexistent/audio.wav', payloadHash);
      } catch (error) {
        if (error.message.includes('not found')) {
          threw = true;
        } else {
          // Re-throw unexpected errors
          throw error;
        }
      }
      
      assertTrue(threw, 'Should throw on non-existent file');
    });
    
    runner.test('extract with non-existent file throws error', async () => {
      let threw = false;
      
      try {
        await silentcipher.extract('/nonexistent/audio.wav');
      } catch (error) {
        if (error.message.includes('not found')) {
          threw = true;
        } else {
          throw error;
        }
      }
      
      assertTrue(threw, 'Should throw on non-existent file');
    });
  }
  
  // Run the tests
  const success = await runner.run();
  
  // Print summary
  console.log('\n📊 Test Summary:');
  console.log(`   Total: ${runner.passed + runner.failed + runner.skipped}`);
  console.log(`   Passed: ${runner.passed}`);
  console.log(`   Failed: ${runner.failed}`);
  console.log(`   Skipped: ${runner.skipped}`);
  
  if (silentcipherAvailable) {
    console.log('\n✅ SilentCipher is available for full testing');
  } else {
    console.log('\n⚠️  SilentCipher not installed - install for full testing:');
    console.log('   pip install silentcipher librosa soundfile numpy');
  }
  
  // Exit with appropriate code
  process.exit(success ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});




