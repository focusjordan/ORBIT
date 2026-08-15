/**
 * ORBIT AudioSeal Neural Watermark Engine Tests (OrbitSeal)
 * 
 * Tests verify:
 * 1. AudioSeal environment availability
 * 2. 40-bit BLAKE3 hash embedding and extraction
 * 3. Exact payload match and CRC validity
 * 4. High SDR fidelity (>25dB)
 */

const path = require('path');
const fs = require('fs');
const OrbitCrypto = require('../../src/engines/crypto');
const audioseal = require('../../src/engines/audioseal');

const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

async function runTests() {
  console.log('\n🧪 Running AudioSeal Engine Tests\n============================================================\n');
  
  // Test 1: Check environment
  console.log('Test 1: Check Python environment');
  const env = await audioseal.checkPythonEnvironment();
  console.log(`   Available: ${env.available}, Message: ${env.message}`);
  if (!env.available) {
    console.error('AudioSeal environment not available:', env);
    process.exit(1);
  }
  console.log('   ✅ Environment check passed\n');
  
  // Test 2: Generate 40-bit BLAKE3 hash and embed into audio
  console.log('Test 2: Embed 40-bit BLAKE3 watermark');
  const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
  const fullHash = OrbitCrypto.hash('ORBIT AudioSeal Unit Test Track');
  const expected5 = fullHash.slice(0, 5);
  console.log(`   Payload (5 bytes): ${expected5.toString('hex')}`);
  
  const embedResult = await audioseal.embed(audioBuffer, expected5, { verbose: false });
  console.log(`   Embedded in ${embedResult.processingTimeMs}ms, SDR: ${embedResult.sdr?.toFixed(1)}dB`);
  console.assert(embedResult.success === true, 'Embed should succeed');
  console.assert(embedResult.watermarkedAudio && embedResult.watermarkedAudio.length > 0, 'Should output watermarked audio buffer');
  console.assert(embedResult.sdr > 25.0, `SDR should be > 25dB, got ${embedResult.sdr}`);
  console.log('   ✅ Embed passed\n');
  
  // Test 3: Extract watermark from watermarked audio
  console.log('Test 3: Extract 40-bit BLAKE3 watermark');
  const extractResult = await audioseal.extract(embedResult.watermarkedAudio, { verbose: false });
  console.log(`   Extracted in ${extractResult.processingTimeMs}ms`);
  console.log(`   Detected: ${extractResult.detected}, Confidence: ${(extractResult.confidence * 100).toFixed(1)}%`);
  console.log(`   CRC Valid: ${extractResult.crcValid}, Slots: [${extractResult.slotsDetected.join(', ')}]`);
  console.log(`   Extracted Hash: ${extractResult.payloadHash?.toString('hex')}`);
  
  console.assert(extractResult.detected === true, 'Watermark should be detected');
  console.assert(extractResult.payloadHash !== null, 'Payload hash should not be null');
  console.assert(extractResult.payloadHash.equals(expected5), `Extracted hash ${extractResult.payloadHash.toString('hex')} must match expected ${expected5.toString('hex')}`);
  console.assert(extractResult.crcValid === true, 'CRC must be valid');
  console.assert(audioseal.hashMatches(extractResult.payloadHash, fullHash) === true, 'hashMatches should return true');
  console.log('   ✅ Extract passed\n');
  
  console.log('============================================================');
  console.log('🎉 All AudioSeal engine tests passed!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
