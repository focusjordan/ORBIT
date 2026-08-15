/**
 * ORBIT Perth Neural Watermark Engine Tests (OrbitPerth)
 * 
 * Tests verify:
 * 1. Perth environment availability
 * 2. Perceptual watermark embedding and extraction
 * 3. Confidence score on watermarked vs unwatermarked audio
 */

const path = require('path');
const fs = require('fs');
const perth = require('../../src/engines/perth');

const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');

async function runTests() {
  console.log('\n🧪 Running Perth Engine Tests\n============================================================\n');
  
  // Test 1: Check environment
  console.log('Test 1: Check Python environment');
  const env = await perth.checkPythonEnvironment();
  console.log(`   Available: ${env.available}, Message: ${env.message}`);
  if (!env.available) {
    console.error('Perth environment not available:', env);
    process.exit(1);
  }
  console.log('   ✅ Environment check passed\n');
  
  // Test 2: Embed watermark
  console.log('Test 2: Embed Perth watermark');
  const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
  const embedResult = await perth.embed(audioBuffer, { verbose: false });
  console.log(`   Embedded in ${embedResult.processingTimeMs}ms, SDR: ${embedResult.sdr?.toFixed(1)}dB`);
  console.assert(embedResult.success === true, 'Embed should succeed');
  console.assert(embedResult.watermarkedAudio && embedResult.watermarkedAudio.length > 0, 'Should output watermarked audio buffer');
  console.log('   ✅ Embed passed\n');
  
  // Test 3: Extract watermark from watermarked audio
  console.log('Test 3: Extract watermark from watermarked audio');
  const extractResult = await perth.extract(embedResult.watermarkedAudio, { verbose: false });
  console.log(`   Extracted in ${extractResult.processingTimeMs}ms, Detected: ${extractResult.detected}, Confidence: ${extractResult.confidence}`);
  console.assert(extractResult.detected === true, 'Watermark should be detected on watermarked audio');
  console.assert(extractResult.confidence >= 0.5, 'Confidence should be >= 0.5');
  console.log('   ✅ Watermarked audio detection passed\n');
  
  // Test 4: Extract from clean unwatermarked audio (should not detect)
  console.log('Test 4: Extract from clean unwatermarked audio');
  const cleanExtract = await perth.extract(audioBuffer, { verbose: false });
  console.log(`   Extracted clean in ${cleanExtract.processingTimeMs}ms, Detected: ${cleanExtract.detected}, Confidence: ${cleanExtract.confidence}`);
  console.assert(cleanExtract.detected === false, 'Watermark should not be detected on unwatermarked audio');
  console.log('   ✅ Clean audio correctly identified as unwatermarked\n');
  
  console.log('============================================================');
  console.log('🎉 All Perth engine tests passed!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
