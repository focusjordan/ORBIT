const AudioUtils = require('../../src/utils/audio');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function runTests() {
  console.log('🧪 Running Audio Utilities Tests\n');
  
  const testAudio = path.join(__dirname, '../fixtures/test-audio.mp3');
  
  // Test 0: Check FFmpeg
  console.log('Test 0: Check FFmpeg availability');
  const hasFFmpeg = AudioUtils.isFFmpegAvailable();
  if (!hasFFmpeg) {
    console.log('   ⚠️ FFmpeg not available, some tests will be skipped');
    console.log('   Install with: brew install ffmpeg\n');
  } else {
    console.log('   ✅ FFmpeg available\n');
  }
  
  // Test 1: Get audio info
  if (hasFFmpeg && fs.existsSync(testAudio)) {
    console.log('Test 1: Get audio file info');
    try {
      const info = AudioUtils.getAudioInfo(testAudio);
      console.assert(info.duration > 0, 'Duration should be positive');
      console.log(`   Duration: ${info.duration.toFixed(2)}s`);
      console.log(`   Format: ${info.format}`);
      console.log('   ✅ Got audio info\n');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  // Test 2: Load audio samples from MP3
  if (hasFFmpeg && fs.existsSync(testAudio)) {
    console.log('Test 2: Load audio samples from MP3');
    try {
      const audio = await AudioUtils.loadAudioSamples(testAudio);
      
      console.assert(audio.samples instanceof Float32Array, 'Should be Float32Array');
      console.assert(audio.samples.length > 0, 'Should have samples');
      console.assert(audio.sampleRate > 0, 'Should have sample rate');
      console.assert(audio.duration > 0, 'Should have duration');
      
      console.log(`   Samples: ${audio.samples.length}`);
      console.log(`   Sample rate: ${audio.sampleRate}Hz`);
      console.log(`   Duration: ${audio.duration.toFixed(2)}s`);
      console.log('   ✅ Loaded MP3 samples\n');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  // Test 3: Save and reload samples
  console.log('Test 3: Save and reload samples');
  try {
    const outputPath = path.join(os.tmpdir(), `orbit-test-${Date.now()}.wav`);
    
    // Create test samples (1 second sine wave)
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
    }
    
    // Save
    await AudioUtils.saveAudioSamples(samples, outputPath, sampleRate);
    console.assert(fs.existsSync(outputPath), 'File should exist');
    
    // Reload
    const reloaded = await AudioUtils.loadAudioSamples(outputPath);
    console.assert(reloaded.samples.length === samples.length, 'Sample count should match');
    
    // Check samples are similar (allow small rounding differences)
    let maxDiff = 0;
    for (let i = 0; i < Math.min(1000, samples.length); i++) {
      maxDiff = Math.max(maxDiff, Math.abs(samples[i] - reloaded.samples[i]));
    }
    console.assert(maxDiff < 0.01, 'Samples should be very similar');
    
    // Cleanup
    fs.unlinkSync(outputPath);
    
    console.log(`   Saved and reloaded ${samples.length} samples`);
    console.log(`   Max sample difference: ${maxDiff.toFixed(6)}`);
    console.log('   ✅ Round-trip successful\n');
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
  }
  
  // Test 4: Load from Buffer
  if (hasFFmpeg && fs.existsSync(testAudio)) {
    console.log('Test 4: Load from Buffer');
    try {
      const buffer = fs.readFileSync(testAudio);
      const audio = await AudioUtils.loadAudioSamples(buffer);
      
      console.assert(audio.samples.length > 0, 'Should have samples');
      console.log(`   Loaded ${audio.samples.length} samples from Buffer`);
      console.log('   ✅ Buffer loading works\n');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  console.log('🧪 Audio utilities tests complete!');
}

runTests().catch(console.error);
