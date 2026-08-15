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

    console.log('Test 1b: Get detailed audio file info');
    try {
      const detailed = AudioUtils.getDetailedAudioInfo(testAudio);
      console.assert(detailed.duration > 0, 'Detailed duration should be positive');
      console.assert(detailed.channels >= 1, 'Detailed channels should be >= 1');
      console.assert(detailed.sampleRate >= 8000, 'Detailed sampleRate should be valid');
      console.log(`   Detailed: ${detailed.channels} channels, ${detailed.sampleRate}Hz, codec: ${detailed.codec}`);
      console.log('   ✅ Got detailed audio info\n');
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
  
  // Test 4: Load from Buffer & Decode Helpers
  if (hasFFmpeg && fs.existsSync(testAudio)) {
    console.log('Test 4: Load from Buffer & Convenience Decoders');
    try {
      const buffer = fs.readFileSync(testAudio);
      const audio = await AudioUtils.loadAudioSamples(buffer);
      
      console.assert(audio.samples.length > 0, 'Should have samples');
      
      const monoSamples = await AudioUtils.decodeAudioToSamples(buffer);
      console.assert(monoSamples instanceof Float32Array, 'Mono decode returns Float32Array');

      const stereoObj = await AudioUtils.decodeAudioToSamples(buffer, { preserveStereo: true });
      console.assert(stereoObj.samples instanceof Float32Array, 'Stereo decode contains samples');
      console.assert(Array.isArray(stereoObj.channels), 'Stereo decode contains channels');

      console.log('   ✅ Buffer loading & decoding helpers work\n');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }

  // Test 5: Encode Samples to WAV (Mono & Stereo)
  console.log('Test 5: Encode Samples to WAV');
  const dummySamples = new Float32Array(44100).fill(0.1);
  const monoWav = await AudioUtils.encodeSamplesToWav(dummySamples, 44100);
  console.assert(Buffer.isBuffer(monoWav) && monoWav.length > 44, 'Mono WAV encoded');

  const stereoDuplicated = await AudioUtils.encodeSamplesToWav(dummySamples, 44100, 2);
  console.assert(Buffer.isBuffer(stereoDuplicated) && stereoDuplicated.length > 44, 'Stereo duplicate WAV encoded');

  const multiChannel = await AudioUtils.encodeSamplesToWav([dummySamples, dummySamples], 44100);
  console.assert(Buffer.isBuffer(multiChannel) && multiChannel.length > 44, 'Multi-channel WAV encoded');

  try {
    await AudioUtils.encodeSamplesToWav('invalid-samples');
    console.assert(false, 'Should throw on invalid samples type');
  } catch (err) {
    console.assert(err.message.includes('Samples must be'), 'Correct error for invalid samples');
  }
  console.log('   ✅ WAV encoding helpers work\n');
  
  console.log('🧪 Audio utilities tests complete!');
}

runTests().catch(console.error);
