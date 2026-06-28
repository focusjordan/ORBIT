/**
 * ORBIT Neural Watermark Engine Tests
 * 
 * Separated from unified tests to isolate heavy PyTorch operations.
 * Tests verify:
 * 1. Neural embed/extract (SilentCipher)
 * 2. Auto mode fallback behavior
 * 
 * Run: npm run test:watermark:neural
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import unified watermark module
const { 
  UnifiedWatermark, 
  checkSilentCipherAvailable,
  resetAvailabilityCache 
} = require('../../src/engines/watermark-unified');

// Test fixtures
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio-short.wav');
const TEST_AUDIO_RHYTHM_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

/**
 * Test runner
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
    this.tests.push({ name, fn, skip: true });
  }
  
  async run() {
    console.log(`\n🧪 ${this.suiteName}\n${'='.repeat(60)}\n`);
    
    for (const test of this.tests) {
      if (test.skip) {
        console.log(`⏭️  SKIP: ${test.name}`);
        this.skipped++;
        continue;
      }
      
      try {
        await test.fn();
        console.log(`✅ PASS: ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error.message}`);
        if (error.stack) {
          console.log(`   Stack: ${error.stack.split('\n')[1]}`);
        }
        this.failed++;
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Results: ${this.passed} passed, ${this.failed} failed, ${this.skipped} skipped`);
    console.log(`${'='.repeat(60)}\n`);
    
    return this.failed === 0;
  }
}

// Create test runner
const runner = new TestRunner('Neural Watermark Engine Tests');

runner.test('SilentCipher availability check', async () => {
  resetAvailabilityCache(); // Ensure fresh check
  const availability = await checkSilentCipherAvailable();
  
  if (typeof availability.available !== 'boolean') {
    throw new Error('Should have available boolean');
  }
  if (typeof availability.message !== 'string') {
    throw new Error('Should have message string');
  }
  
  console.log(`   Available: ${availability.available}`);
  console.log(`   Message: ${availability.message}`);
});

runner.test('Neural embed/extract (if SilentCipher available)', async () => {
  const availability = await checkSilentCipherAvailable();
  
  if (!availability.available) {
    console.log('   ⏭️  Skipping: SilentCipher not available');
    return;
  }
  
  // Use short audio for neural watermarking test
  const testAudioPath = TEST_AUDIO_PATH;
  if (!fs.existsSync(testAudioPath)) {
    throw new Error(`Test audio not found: ${testAudioPath}`);
  }
  
  const watermark = new UnifiedWatermark('test-secret-key', { method: 'neural' });
  const audioBuffer = fs.readFileSync(testAudioPath);
  const payloadHash = crypto.randomBytes(16);
  
  // Embed
  const embedResult = await watermark.embed(audioBuffer, {
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash
  });
  
  if (!embedResult.success) {
    throw new Error('Neural embed should succeed');
  }
  if (embedResult.method !== 'silentcipher') {
    throw new Error(`Method should be 'silentcipher', got '${embedResult.method}'`);
  }
  if (!embedResult.sdr || embedResult.sdr < 20) {
    throw new Error(`SDR should be >= 20dB, got ${embedResult.sdr}`);
  }
  
  console.log(`   Embedded: SDR=${embedResult.sdr.toFixed(1)}dB`);
  
  // Extract
  const extractResult = await watermark.extract(embedResult.watermarkedAudio);
  
  if (!extractResult.success) {
    throw new Error('Neural extract should succeed');
  }
  if (!extractResult.detected) {
    throw new Error('Should detect neural watermark');
  }
  if (extractResult.method !== 'silentcipher') {
    throw new Error(`Extract method should be 'silentcipher', got '${extractResult.method}'`);
  }
  
  // Verify payload hash prefix matches (5 bytes)
  const extractedPrefix = extractResult.payloadHash;
  const expectedPrefix = payloadHash.slice(0, 5);
  if (!extractedPrefix.equals(expectedPrefix)) {
    throw new Error('Extracted hash prefix should match');
  }
  
  console.log(`   Extracted: confidence=${(extractResult.confidence * 100).toFixed(1)}%`);
});

runner.test('Auto mode falls back to spread when neural unavailable', async () => {
  if (!fs.existsSync(TEST_AUDIO_RHYTHM_PATH)) {
    throw new Error(`Test audio not found: ${TEST_AUDIO_RHYTHM_PATH}`);
  }
  
  const watermark = new UnifiedWatermark('test-secret-key', { method: 'auto' });
  const audioBuffer = fs.readFileSync(TEST_AUDIO_RHYTHM_PATH);
  
  const embedResult = await watermark.embed(audioBuffer, {
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash: crypto.randomBytes(16)
  });
  
  if (!embedResult.success) {
    throw new Error('Embed should succeed');
  }
  
  // Should use either method based on availability
  if (!['silentcipher', 'spread'].includes(embedResult.method)) {
    throw new Error(`Invalid method: ${embedResult.method}`);
  }
  
  console.log(`   Method used: ${embedResult.method}`);
  console.log(`   Fallback used: ${embedResult.fallbackUsed || false}`);
});

async function main() {
  const success = await runner.run();
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
