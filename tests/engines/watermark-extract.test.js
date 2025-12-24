/**
 * ORBIT Watermark Extraction Tests (Session 7)
 * Tests extraction, parsing, and validation
 * 
 * Note: Arbitrary snippet detection (extracting from unknown clip positions)
 * is a V2 feature handled by neural watermarking (Sessions 22-23).
 * V1 extraction works on full audio or known offsets.
 */

const OrbitWatermark = require('../../src/engines/watermark');
const crypto = require('crypto');

function runTests() {
  console.log('🧪 Running Watermark Extract Tests\n');
  
  const watermark = new OrbitWatermark('test-secret-key');
  
  // Setup: Create test payload and embed in 90-second audio
  const originalPayload = watermark.createPayload({
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash: crypto.randomBytes(16)
  });
  
  // 90-second audio at 44.1kHz
  const audioDurationSeconds = 90;
  const longAudioSamples = audioDurationSeconds * 44100;
  const audioSamples = new Float32Array(longAudioSamples);
  
  // Use very quiet background noise for testing
  for (let i = 0; i < audioSamples.length; i++) {
    audioSamples[i] = (Math.random() - 0.5) * 0.01;
  }
  
  console.log(`Setup: Embedding watermark in ${audioDurationSeconds}-second audio...`);
  const watermarked = watermark.embed(audioSamples, originalPayload);
  console.log('');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Extract at offset 0 (full audio from beginning)
  console.log('Test 1: Extract at offset 0 (fast path)');
  try {
    const extracted = watermark.extract(watermarked);
    
    if (extracted.valid && extracted.offset === 0 && extracted.payload) {
      console.log(`   Offset: ${extracted.offset} samples`);
      console.log(`   Confidence: ${(extracted.confidence * 1000).toFixed(3)}`);
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('Extraction failed validation');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Test 2: Extracted payload matches original
  console.log('Test 2: Extracted payload matches original');
  try {
    const extracted = watermark.extract(watermarked);
    
    if (extracted.payload.equals(originalPayload)) {
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('Payload mismatch');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Test 3: Parse extracted payload
  console.log('Test 3: Parse extracted payload');
  try {
    const extracted = watermark.extract(watermarked);
    const parsed = watermark.parsePayload(extracted.payload);
    
    if (parsed && parsed.magic === 'ORBT' && parsed.version === 1 && parsed.crcValid) {
      console.log(`   Magic: ${parsed.magic}`);
      console.log(`   Version: ${parsed.version}`);
      console.log(`   Timestamp: ${new Date(parsed.timestamp).toISOString()}`);
      console.log(`   CRC Valid: ${parsed.crcValid}`);
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('Parse failed or invalid fields');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Test 4: Audio without watermark returns invalid
  console.log('Test 4: Audio without watermark returns invalid');
  try {
    const cleanAudio = new Float32Array(longAudioSamples);
    const noWatermark = watermark.extract(cleanAudio);
    
    if (!noWatermark.valid) {
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('False positive on clean audio');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Test 5: Survives minor noise
  console.log('Test 5: Survives minor noise addition');
  try {
    const noisyAudio = new Float32Array(watermarked);
    for (let i = 0; i < noisyAudio.length; i++) {
      noisyAudio[i] += (Math.random() - 0.5) * 0.001;
    }
    
    const noisyExtract = watermark.extract(noisyAudio);
    
    if (noisyExtract.valid && noisyExtract.payload.equals(originalPayload)) {
      console.log(`   Confidence after noise: ${(noisyExtract.confidence * 1000).toFixed(3)}`);
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('Failed after noise addition');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Test 6: Different secret key cannot extract
  console.log('Test 6: Different secret key fails extraction');
  try {
    const wrongKeyWatermark = new OrbitWatermark('wrong-secret-key');
    const wrongExtract = wrongKeyWatermark.extract(watermarked);
    
    if (!wrongExtract.valid) {
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('Wrong key should not extract valid watermark');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Test 7: Audio too short returns error gracefully
  console.log('Test 7: Short audio handled gracefully');
  try {
    const shortAudio = new Float32Array(1000);
    const shortResult = watermark.extract(shortAudio);
    
    if (!shortResult.valid && shortResult.payload === null) {
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('Short audio should return invalid result');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Test 8: Detect method works on full audio
  console.log('Test 8: Detect method on full audio');
  try {
    const detected = watermark.detect(watermarked);
    
    if (detected.detected && detected.offset >= 0) {
      console.log(`   Detected: ${detected.detected}`);
      console.log(`   Offset: ${detected.offset}`);
      console.log('   ✅ PASSED\n');
      passed++;
    } else {
      throw new Error('Detection failed on watermarked audio');
    }
  } catch (e) {
    console.log(`   ❌ FAILED: ${e.message}\n`);
    failed++;
  }
  
  // Summary
  console.log('═'.repeat(50));
  console.log(`🧪 Test Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(50));
  
  if (failed === 0) {
    console.log('✅ All tests passed!');
    console.log('');
    console.log('📋 V1 Capabilities:');
    console.log('   • Extract from full audio files');
    console.log('   • Verify payload integrity (magic bytes + CRC)');
    console.log('   • Parse payload into structured data');
    console.log('   • Noise-resistant extraction');
    console.log('   • Secret key validation');
    console.log('');
    console.log('📋 V2 Enhancements (Sessions 22-23):');
    console.log('   • Arbitrary snippet detection (neural watermarking)');
    console.log('   • Shorter watermark duration');
    console.log('   • Higher compression robustness');
    console.log('');
  } else {
    console.log('❌ Some tests failed. Review output above.\n');
    process.exit(1);
  }
}

runTests();





