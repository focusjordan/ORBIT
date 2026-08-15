/**
 * ORBIT Watermark Engine - Embed Tests
 * Tests for AudioSeal and Perth neural watermark embedding
 */

const fs = require('fs');
const path = require('path');
const OrbitCrypto = require('../../src/engines/crypto');
const { UnifiedWatermark } = require('../../src/engines/watermark-unified');

const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

async function runTests() {
  console.log('🧪 Running Watermark Embed Tests\n');
  
  const watermark = new UnifiedWatermark('test-secret-key');
  const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
  
  // Test 1: Create watermark payload
  console.log('Test 1: Create watermark payload');
  const payloadHash = OrbitCrypto.hash('Watermark Embed Test Track').slice(0, 5);
  const payload = watermark.createPayload({
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash
  });
  
  console.assert(payload.platform === 'test-platform', 'Platform should match');
  console.assert(payload.payloadHash.length === 5, 'Payload hash should be 5 bytes');
  console.log(`   ✅ Payload created (hash: ${payload.payloadHash.toString('hex')})\n`);
  
  // Test 2: Embed via AudioSeal (Primary)
  console.log('Test 2: Embed watermark via AudioSeal');
  const embedResult = await watermark.embed(audioBuffer, payload, { verbose: false });
  
  console.assert(embedResult.success === true, 'Embed should succeed');
  console.assert(embedResult.method === 'audioseal', 'Primary method should be audioseal');
  console.assert(embedResult.watermarkedAudio.length > 0, 'Should return watermarked audio');
  console.assert(embedResult.sdr > 25.0, 'SDR should be > 25dB');
  console.log(`   ✅ AudioSeal embedding complete (SDR: ${embedResult.sdr.toFixed(1)}dB)\n`);
  
  // Test 3: Embed via Perth (Fallback)
  console.log('Test 3: Embed watermark via Perth fallback engine');
  const perthWatermark = new UnifiedWatermark('test-secret-key', { method: 'perth' });
  const perthResult = await perthWatermark.embed(audioBuffer, payload, { verbose: false });
  
  console.assert(perthResult.success === true, 'Perth embed should succeed');
  console.assert(perthResult.method === 'perth', 'Method should be perth');
  console.assert(perthResult.watermarkedAudio.length > 0, 'Should return watermarked audio');
  console.log(`   ✅ Perth embedding complete (SDR: ${perthResult.sdr.toFixed(1)}dB)\n`);
  
  console.log('🎉 All Watermark Embed tests passed!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
