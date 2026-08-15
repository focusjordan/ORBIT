/**
 * ORBIT Watermark Extraction Tests
 * Tests extraction, parsing, and validation for AudioSeal and Perth neural watermarking
 */

const fs = require('fs');
const path = require('path');
const OrbitCrypto = require('../../src/engines/crypto');
const { UnifiedWatermark } = require('../../src/engines/watermark-unified');

const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

async function runTests() {
  console.log('🧪 Running Watermark Extract Tests\n');
  
  const watermark = new UnifiedWatermark('test-secret-key');
  const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
  
  const fullHash = OrbitCrypto.hash('Watermark Extract Test Track');
  const payloadHash = fullHash.slice(0, 5);
  
  // Setup: Embed AudioSeal watermark
  console.log('Setup: Embedding 40-bit AudioSeal watermark in test audio...');
  const embedResult = await watermark.embed(audioBuffer, {
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash
  });
  
  console.assert(embedResult.success === true, 'Embed should succeed');
  console.log(`   Embedded (${embedResult.method}, SDR: ${embedResult.sdr.toFixed(1)}dB)\n`);
  
  // Test 1: Extract AudioSeal watermark
  console.log('Test 1: Extract AudioSeal watermark');
  const extracted = await watermark.extract(embedResult.watermarkedAudio);
  
  console.assert(extracted.success === true, 'Extraction should succeed');
  console.assert(extracted.detected === true, 'Watermark should be detected');
  console.assert(extracted.method === 'audioseal', 'Method should be audioseal');
  console.assert(extracted.payloadHash && extracted.payloadHash.equals(payloadHash), 'Extracted hash should match');
  console.assert(extracted.crcValid === true, 'CRC should be valid');
  console.log(`   Confidence: ${(extracted.confidence * 100).toFixed(1)}%, Hash: ${extracted.payloadHash.toString('hex')}`);
  console.log('   ✅ PASSED\n');
  
  // Test 2: Verify hash matching helper
  console.log('Test 2: Verify hash matching helper');
  const matches = UnifiedWatermark.hashMatches(extracted.payloadHash, fullHash);
  console.assert(matches === true, 'hashMatches should return true');
  console.log('   ✅ PASSED\n');
  
  // Test 3: Extract from clean unwatermarked audio
  console.log('Test 3: Extract from clean unwatermarked audio (should not detect)');
  const cleanExtract = await watermark.extract(audioBuffer);
  console.assert(cleanExtract.detected === false, 'Clean audio should not detect watermark');
  console.log('   ✅ PASSED\n');
  
  console.log('🎉 All Watermark Extract tests passed!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
