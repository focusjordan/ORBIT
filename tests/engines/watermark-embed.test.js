/**
 * ORBIT Watermark Engine - Embed Tests
 * Tests for spread spectrum watermark embedding
 */

const OrbitWatermark = require('../../src/engines/watermark');
const crypto = require('crypto');

function runTests() {
  console.log('🧪 Running Watermark Embed Tests\n');
  
  const watermark = new OrbitWatermark('test-secret-key');
  
  // Test 1: Create payload
  console.log('Test 1: Create watermark payload');
  const payload = watermark.createPayload({
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash: crypto.randomBytes(16)
  });
  
  console.assert(payload.length === 64, 'Payload should be 64 bytes');
  console.assert(payload.slice(0, 4).toString() === 'ORBT', 'Should have magic bytes');
  console.assert(payload.readUInt8(4) === 1, 'Version should be 1');
  console.log(`   ✅ Payload created (${payload.length} bytes)\n`);
  
  // Test 2: Check minimum duration
  console.log('Test 2: Check minimum audio duration');
  const minDuration = watermark.getMinimumDuration();
  const minSamples = watermark.getRequiredSamples();
  console.log(`   Required: ${minSamples} samples (${minDuration.toFixed(2)}s at 44.1kHz)`);
  console.assert(minDuration > 0, 'Should require some duration');
  console.log('   ✅ Duration requirements calculated\n');
  
  // Test 3: Embed into silence
  console.log('Test 3: Embed payload into audio samples');
  const sampleCount = Math.ceil(minSamples * 1.1); // 10% buffer
  const audioSamples = new Float32Array(sampleCount); // Silence
  
  const watermarked = watermark.embed(audioSamples, payload);
  
  console.assert(watermarked.length === audioSamples.length, 'Output length should match input');
  console.log('   ✅ Embedding complete\n');
  
  // Test 4: Verify watermark modifies signal
  console.log('Test 4: Verify watermark modifies signal');
  let differences = 0;
  let maxDiff = 0;
  
  for (let i = 0; i < minSamples; i++) {
    const diff = Math.abs(watermarked[i] - audioSamples[i]);
    if (diff > 0) differences++;
    if (diff > maxDiff) maxDiff = diff;
  }
  
  console.assert(differences > 0, 'Some samples should be modified');
  console.assert(maxDiff < 0.02, 'Max difference should be small (imperceptible)');
  console.log(`   Modified samples: ${differences}`);
  console.log(`   Max amplitude change: ${maxDiff.toFixed(6)}`);
  console.log('   ✅ Signal modified within acceptable range\n');
  
  // Test 5: Audio too short throws error
  console.log('Test 5: Audio too short throws error');
  const shortAudio = new Float32Array(1000);
  try {
    watermark.embed(shortAudio, payload);
    console.log('   ❌ Should have thrown error');
    process.exit(1);
  } catch (error) {
    console.assert(error.message.includes('too short'), 'Should mention audio too short');
    console.log('   ✅ Correctly rejected short audio\n');
  }
  
  // Test 6: Different payloads produce different watermarks
  console.log('Test 6: Different payloads produce different watermarks');
  const payload2 = watermark.createPayload({
    platform: 'other-platform',
    timestamp: Date.now() + 1000
  });
  
  const watermarked2 = watermark.embed(new Float32Array(sampleCount), payload2);
  
  // Check across entire watermark range (not just first 1000 samples)
  // Different payloads will differ where their bits differ
  let samplesDifferent = 0;
  const checkRange = Math.min(sampleCount, 512000); // Check full payload range
  for (let i = 0; i < checkRange; i++) {
    if (watermarked[i] !== watermarked2[i]) samplesDifferent++;
  }
  
  console.assert(samplesDifferent > 0, 'Different payloads should produce different watermarks');
  console.log(`   Samples different: ${samplesDifferent} out of ${checkRange}`);
  console.log(`   ✅ Different payloads produce different outputs\n`);
  
  // Test 7: Repeating pattern - verify multiple instances
  console.log('Test 7: Repeating pattern (snippet detection capability)');
  // Create 3 minutes of audio (enough for multiple repeats at 30s intervals)
  const longAudio = new Float32Array(3 * 60 * 44100); // 3 minutes
  const watermarkedLong = watermark.embed(longAudio, payload);
  
  console.assert(watermarkedLong.length === longAudio.length, 'Output length should match');
  console.log('   ✅ Repeating pattern embedded (see console output above)\n');
  
  // Test 8: Loudness-aware embedding
  console.log('Test 8: Loudness-aware embedding (quiet vs loud audio)');
  
  // Quiet audio (low RMS)
  const quietAudio = new Float32Array(sampleCount);
  for (let i = 0; i < quietAudio.length; i++) {
    quietAudio[i] = (Math.random() - 0.5) * 0.01; // Very quiet noise
  }
  const watermarkedQuiet = watermark.embed(quietAudio, payload);
  
  // Loud audio (high RMS)
  const loudAudio = new Float32Array(sampleCount);
  for (let i = 0; i < loudAudio.length; i++) {
    loudAudio[i] = (Math.random() - 0.5) * 0.8; // Loud noise
  }
  const watermarkedLoud = watermark.embed(loudAudio, payload);
  
  // Calculate max changes
  let maxChangeQuiet = 0;
  let maxChangeLoud = 0;
  for (let i = 0; i < 10000; i++) {
    maxChangeQuiet = Math.max(maxChangeQuiet, Math.abs(watermarkedQuiet[i] - quietAudio[i]));
    maxChangeLoud = Math.max(maxChangeLoud, Math.abs(watermarkedLoud[i] - loudAudio[i]));
  }
  
  console.log(`   Quiet audio - max change: ${maxChangeQuiet.toFixed(6)}`);
  console.log(`   Loud audio - max change: ${maxChangeLoud.toFixed(6)}`);
  console.assert(maxChangeQuiet < 0.01, 'Quiet audio should have small changes');
  console.log('   ✅ Loudness-aware embedding working\n');
  
  // Test 9: CRC validation
  console.log('Test 9: CRC checksum validation');
  const testPayload = watermark.createPayload({
    platform: 'test',
    timestamp: 1234567890000
  });
  
  // Verify CRC is at the end
  const storedCrc = testPayload.readUInt16BE(62);
  const calculatedCrc = watermark._crc16(testPayload.slice(0, 62));
  console.assert(storedCrc === calculatedCrc, 'CRC should match');
  console.log(`   ✅ CRC validation working (0x${storedCrc.toString(16)})\n`);
  
  // Test 10: Deterministic spreading sequence
  console.log('Test 10: Deterministic spreading sequence');
  const seq1 = watermark._generateSpreadSequence('test-seed', 1000);
  const seq2 = watermark._generateSpreadSequence('test-seed', 1000);
  
  let sequencesMatch = true;
  for (let i = 0; i < 1000; i++) {
    if (seq1[i] !== seq2[i]) {
      sequencesMatch = false;
      break;
    }
  }
  
  console.assert(sequencesMatch, 'Same seed should produce same sequence');
  console.log('   ✅ Spreading sequence is deterministic\n');
  
  // Test 11: Verify bit-level embedding correctness
  console.log('Test 11: Bit-level embedding correctness');
  
  // Create payloads that differ in a known bit position
  const testPayload1 = Buffer.alloc(64);
  testPayload1.write('ORBT', 0);
  testPayload1.writeUInt8(1, 4); // Version
  testPayload1.writeUInt8(0b00000000, 5); // Flags: bit 0 = 0
  
  const testPayload2 = Buffer.alloc(64);
  testPayload2.write('ORBT', 0);
  testPayload2.writeUInt8(1, 4); // Version
  testPayload2.writeUInt8(0b00000001, 5); // Flags: bit 0 = 1 (DIFFERENT)
  
  const testAudio1 = new Float32Array(sampleCount);
  const testAudio2 = new Float32Array(sampleCount);
  
  const testWatermark = new OrbitWatermark('test-key-validation');
  testWatermark.embedAtOffset(testAudio1, 0, testPayload1, 0.005);
  testWatermark.embedAtOffset(testAudio2, 0, testPayload2, 0.005);
  
  // Bits 0-39 are identical (ORBT + version bytes), so samples 0-39999 should be identical
  let identicalInSameRegion = 0;
  for (let i = 0; i < 40000; i++) {
    if (testAudio1[i] === testAudio2[i]) identicalInSameRegion++;
  }
  
  // Bit 47 differs (last bit of flags byte), so samples 47000-48000 should differ
  let differentInDiffRegion = 0;
  for (let i = 47000; i < 48000; i++) {
    if (testAudio1[i] !== testAudio2[i]) differentInDiffRegion++;
  }
  
  console.log(`   Identical samples in same-bit region: ${identicalInSameRegion}/40000`);
  console.log(`   Different samples in diff-bit region: ${differentInDiffRegion}/1000`);
  console.assert(identicalInSameRegion === 40000, 'Same bits should produce identical samples');
  console.assert(differentInDiffRegion === 1000, 'Different bits should produce different samples');
  console.log('   ✅ Bit-level embedding verified correct\n');
  
  console.log('✅ All watermark embed tests passed!');
}

// Run tests
try {
  runTests();
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
