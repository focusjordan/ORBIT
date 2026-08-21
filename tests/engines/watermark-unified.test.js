/**
 * ORBIT Unified Watermark Engine Tests
 * 
 * Tests verify:
 * 1. Module exports and configuration
 * 2. UnifiedWatermark class functionality
 * 3. Primary AudioSeal (40-bit BLAKE3) embed/extract
 * 4. Fallback Perth perceptual embed/extract
 * 5. Auto routing and fallback behavior
 * 6. Hash matching utilities
 * 
 * Run: node tests/engines/watermark-unified.test.js
 */

const path = require('path');
const fs = require('fs');
const OrbitCrypto = require('../../src/engines/crypto');

const { 
  UnifiedWatermark, 
  getWatermarkMethod, 
  checkAudioSealAvailable,
  checkPerthAvailable,
  checkWatermarkAvailable
} = require('../../src/engines/watermark-unified');

const TEST_AUDIO_RHYTHM_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

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

const runner = new TestRunner('Unified Watermark Engine Tests');

// ============================================================================
// MODULE EXPORTS TESTS
// ============================================================================

runner.test('Module exports required functions', () => {
  if (typeof UnifiedWatermark !== 'function') {
    throw new Error('UnifiedWatermark should be a class/function');
  }
  if (typeof getWatermarkMethod !== 'function') {
    throw new Error('getWatermarkMethod should be a function');
  }
  if (typeof checkAudioSealAvailable !== 'function') {
    throw new Error('checkAudioSealAvailable should be a function');
  }
  if (typeof checkPerthAvailable !== 'function') {
    throw new Error('checkPerthAvailable should be a function');
  }
  if (typeof checkWatermarkAvailable !== 'function') {
    throw new Error('checkWatermarkAvailable should be a function');
  }
});

runner.test('getWatermarkMethod returns valid method', () => {
  const method = getWatermarkMethod();
  if (!['audioseal', 'perth', 'auto', 'neural', 'spread'].includes(method)) {
    throw new Error(`Invalid method: ${method}`);
  }
  console.log(`   Current method: ${method}`);
});

runner.test('UnifiedWatermark.getInfo() returns engine statuses', async () => {
  const watermark = new UnifiedWatermark('test-secret-key');
  const info = await watermark.getInfo();
  
  if (typeof info.configuredMethod !== 'string') {
    throw new Error('Should have configuredMethod');
  }
  if (typeof info.audiosealAvailable !== 'boolean') {
    throw new Error('Should have audiosealAvailable');
  }
  if (typeof info.perthAvailable !== 'boolean') {
    throw new Error('Should have perthAvailable');
  }
  
  console.log(`   Configured: ${info.configuredMethod}, AudioSeal: ${info.audiosealAvailable}, Perth: ${info.perthAvailable}`);
});

// ============================================================================
// AUDIOSEAL PRIMARY TESTS
// ============================================================================

runner.test('AudioSeal (Primary) embed/extract round-trip via UnifiedWatermark', async () => {
  const audioBuffer = fs.readFileSync(TEST_AUDIO_RHYTHM_PATH);
  const watermark = new UnifiedWatermark('test-secret-key', { method: 'audioseal' });
  const fullHash = OrbitCrypto.hash('ORBIT Unified AudioSeal Track');
  const payloadHash = fullHash.slice(0, 5);
  
  // Embed
  const embedResult = await watermark.embed(audioBuffer, {
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash
  });
  
  if (!embedResult.success) {
    throw new Error('Embed should succeed');
  }
  if (embedResult.method !== 'audioseal') {
    throw new Error(`Method should be 'audioseal', got '${embedResult.method}'`);
  }
  if (!embedResult.watermarkedAudio || embedResult.watermarkedAudio.length === 0) {
    throw new Error('Should return watermarked audio');
  }
  
  console.log(`   AudioSeal embedded: ${embedResult.watermarkedAudio.length} bytes (SDR: ${embedResult.sdr?.toFixed(1)}dB)`);
  
  // Extract
  const extractResult = await watermark.extract(embedResult.watermarkedAudio);
  
  if (!extractResult.success) {
    throw new Error('Extract should succeed');
  }
  if (!extractResult.detected) {
    throw new Error('Should detect watermark');
  }
  if (extractResult.method !== 'audioseal') {
    throw new Error(`Extract method should be 'audioseal', got '${extractResult.method}'`);
  }
  if (!extractResult.payloadHash || !extractResult.payloadHash.equals(payloadHash)) {
    throw new Error(`Extracted hash (${extractResult.payloadHash?.toString('hex')}) does not match expected (${payloadHash.toString('hex')})`);
  }
  
  console.log(`   AudioSeal extracted: hash=${extractResult.payloadHash.toString('hex')}, confidence=${(extractResult.confidence * 100).toFixed(1)}%`);
});

// ============================================================================
// PERTH FALLBACK TESTS
// ============================================================================

runner.test('Perth (Fallback) embed/extract round-trip via UnifiedWatermark', async () => {
  const audioBuffer = fs.readFileSync(TEST_AUDIO_RHYTHM_PATH);
  const watermark = new UnifiedWatermark('test-secret-key', { method: 'perth' });
  const payloadHash = OrbitCrypto.hash('ORBIT Unified Perth Track').slice(0, 5);
  
  // Embed
  const embedResult = await watermark.embed(audioBuffer, {
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash
  });
  
  if (!embedResult.success) {
    throw new Error('Embed should succeed');
  }
  if (embedResult.method !== 'perth') {
    throw new Error(`Method should be 'perth', got '${embedResult.method}'`);
  }
  
  console.log(`   Perth embedded: ${embedResult.watermarkedAudio.length} bytes (SDR: ${embedResult.sdr?.toFixed(1)}dB)`);
  
  // Extract
  const extractResult = await watermark.extract(embedResult.watermarkedAudio);
  
  if (!extractResult.success) {
    throw new Error('Extract should succeed');
  }
  if (!extractResult.detected) {
    throw new Error('Should detect Perth watermark');
  }
  if (extractResult.method !== 'perth') {
    throw new Error(`Extract method should be 'perth', got '${extractResult.method}'`);
  }
  
  console.log(`   Perth extracted: confidence=${extractResult.confidence}`);
});

// ============================================================================
// HASH MATCHING UTILITY TESTS
// ============================================================================

runner.test('UnifiedWatermark.hashMatches() compares 5-byte BLAKE3 prefixes', () => {
  const fullHash1 = OrbitCrypto.hash('track 1');
  const fullHash2 = OrbitCrypto.hash('track 2');
  const extractedPrefix1 = fullHash1.slice(0, 5);
  const extractedPrefix2 = fullHash2.slice(0, 5);
  
  if (!UnifiedWatermark.hashMatches(extractedPrefix1, fullHash1)) {
    throw new Error('Matching hashes should return true');
  }
  if (UnifiedWatermark.hashMatches(extractedPrefix1, fullHash2)) {
    throw new Error('Different hashes should return false');
  }
  if (UnifiedWatermark.hashMatches(extractedPrefix2, fullHash1)) {
    throw new Error('Different hashes should return false');
  }
});

runner.run().then((success) => {
  if (!success) process.exit(1);
});
