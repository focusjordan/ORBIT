#!/usr/bin/env node
/**
 * ORBIT SilentCipher MP3 Robustness Test
 * 
 * Session 22 - Tests watermark survival through MP3 compression
 * 
 * This script validates that neural watermarks survive MP3 compression:
 * 1. Embed watermark into WAV audio
 * 2. Compress to MP3 128kbps using ffmpeg
 * 3. Extract watermark from MP3
 * 4. Verify payload matches original
 * 
 * Prerequisites:
 * - SilentCipher installed in .venv-watermark
 * - ffmpeg installed (brew install ffmpeg)
 * 
 * Usage:
 *   node scripts/test-mp3-robustness.js
 * 
 * Expected result:
 * - Watermark extracted with >50% confidence
 * - Payload bytes match exactly
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const silentcipher = require('../src/ml/silentcipher');

// Test configuration
const TEST_AUDIO_PATH = path.join(__dirname, '../tests/fixtures/test-audio-short.wav');
const TEMP_DIR = path.join(__dirname, '../temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Check if ffmpeg is available
 */
function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert audio to MP3 using ffmpeg
 */
function convertToMp3(inputPath, outputPath, bitrate = '128k') {
  execSync(`ffmpeg -y -i "${inputPath}" -b:a ${bitrate} "${outputPath}"`, {
    stdio: 'pipe'
  });
}

/**
 * Run the MP3 robustness test
 */
async function runRobustnessTest() {
  console.log('='.repeat(60));
  console.log('🧪 ORBIT SilentCipher MP3 Robustness Test');
  console.log('='.repeat(60));
  console.log();

  // Check prerequisites
  console.log('📋 Checking prerequisites...');
  
  // Check ffmpeg
  if (!checkFfmpeg()) {
    console.error('❌ ffmpeg not found. Install with: brew install ffmpeg');
    process.exit(1);
  }
  console.log('   ✅ ffmpeg available');

  // Check SilentCipher
  const envCheck = await silentcipher.checkPythonEnvironment();
  if (!envCheck.available) {
    console.error(`❌ SilentCipher not available: ${envCheck.message}`);
    console.error('   Install in .venv-watermark:');
    console.error('   source .venv-watermark/bin/activate && pip install silentcipher librosa soundfile numpy');
    process.exit(1);
  }
  console.log('   ✅ SilentCipher available');

  // Check test audio
  if (!fs.existsSync(TEST_AUDIO_PATH)) {
    console.error(`❌ Test audio not found: ${TEST_AUDIO_PATH}`);
    process.exit(1);
  }
  console.log(`   ✅ Test audio: ${path.basename(TEST_AUDIO_PATH)}`);
  console.log();

  // Generate test payload
  const testPayloadHash = crypto.createHash('sha256').update('ORBIT MP3 Robustness Test').digest();
  const expectedMessage = silentcipher.hashToMessage(testPayloadHash);
  console.log(`📝 Test payload (first 5 bytes): [${expectedMessage.join(', ')}]`);
  console.log();

  // Define temp file paths
  const timestamp = Date.now();
  const watermarkedWavPath = path.join(TEMP_DIR, `robustness-watermarked-${timestamp}.wav`);
  const compressedMp3Path = path.join(TEMP_DIR, `robustness-compressed-${timestamp}.mp3`);

  try {
    // ========================================
    // STEP 1: Embed watermark into WAV
    // ========================================
    console.log('🔐 Step 1: Embedding watermark into WAV...');
    const embedStart = Date.now();
    
    const embedResult = await silentcipher.embed(TEST_AUDIO_PATH, testPayloadHash, {
      outputPath: watermarkedWavPath,
      verbose: false
    });
    
    const embedTime = Date.now() - embedStart;
    console.log(`   ✅ Embedded in ${(embedTime / 1000).toFixed(1)}s`);
    console.log(`   📊 SDR: ${embedResult.sdr?.toFixed(1)}dB (higher = better quality)`);
    console.log(`   💾 Output: ${path.basename(watermarkedWavPath)}`);
    console.log();

    // ========================================
    // STEP 2: Compress to MP3 128kbps
    // ========================================
    console.log('📦 Step 2: Compressing to MP3 128kbps...');
    const compressStart = Date.now();
    
    convertToMp3(watermarkedWavPath, compressedMp3Path, '128k');
    
    const compressTime = Date.now() - compressStart;
    const mp3Size = fs.statSync(compressedMp3Path).size;
    console.log(`   ✅ Compressed in ${(compressTime / 1000).toFixed(1)}s`);
    console.log(`   📊 MP3 size: ${(mp3Size / 1024).toFixed(1)}KB`);
    console.log();

    // ========================================
    // STEP 3: Extract watermark from MP3
    // ========================================
    console.log('🔍 Step 3: Extracting watermark from MP3...');
    const extractStart = Date.now();
    
    const extractResult = await silentcipher.extract(compressedMp3Path, {
      phaseShiftDecoding: true,
      verbose: false
    });
    
    const extractTime = Date.now() - extractStart;
    console.log(`   ⏱️  Extracted in ${(extractTime / 1000).toFixed(1)}s`);
    console.log(`   📊 Confidence: ${(extractResult.confidence * 100).toFixed(1)}%`);
    console.log(`   📊 Detected: ${extractResult.detected ? 'YES' : 'NO'}`);
    
    if (extractResult.message) {
      console.log(`   📝 Extracted message: [${extractResult.message.join(', ')}]`);
    }
    console.log();

    // ========================================
    // STEP 4: Verify payload matches
    // ========================================
    console.log('✅ Step 4: Verifying payload...');
    
    let success = false;
    
    if (extractResult.detected && extractResult.message) {
      const matches = extractResult.message.every((val, idx) => val === expectedMessage[idx]);
      
      if (matches) {
        console.log('   ✅ PAYLOAD MATCHES EXACTLY!');
        success = true;
      } else {
        console.log('   ⚠️  Payload mismatch:');
        console.log(`      Expected: [${expectedMessage.join(', ')}]`);
        console.log(`      Got:      [${extractResult.message.join(', ')}]`);
        
        // Check how many bytes match
        const matchCount = extractResult.message.reduce((count, val, idx) => 
          count + (val === expectedMessage[idx] ? 1 : 0), 0);
        console.log(`      Matching bytes: ${matchCount}/5`);
      }
    } else {
      console.log('   ❌ No watermark detected after MP3 compression');
    }
    console.log();

    // ========================================
    // SUMMARY
    // ========================================
    console.log('='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Watermark Detection: ${extractResult.detected ? '✅ YES' : '❌ NO'}`);
    console.log(`   Confidence: ${(extractResult.confidence * 100).toFixed(1)}%`);
    console.log(`   Payload Match: ${success ? '✅ EXACT' : '❌ MISMATCH'}`);
    console.log(`   SDR (Quality): ${embedResult.sdr?.toFixed(1)}dB`);
    console.log(`   Total Time: ${((Date.now() - embedStart) / 1000).toFixed(1)}s`);
    console.log();
    
    if (success && extractResult.confidence >= 0.5) {
      console.log('🎉 MP3 ROBUSTNESS TEST PASSED!');
      console.log('   Neural watermark survives 128kbps MP3 compression.');
    } else if (extractResult.detected) {
      console.log('⚠️  MP3 ROBUSTNESS TEST PARTIAL PASS');
      console.log('   Watermark detected but payload may not match exactly.');
    } else {
      console.log('❌ MP3 ROBUSTNESS TEST FAILED');
      console.log('   Watermark did not survive MP3 compression.');
    }
    console.log();

    // Cleanup
    if (fs.existsSync(watermarkedWavPath)) fs.unlinkSync(watermarkedWavPath);
    if (fs.existsSync(compressedMp3Path)) fs.unlinkSync(compressedMp3Path);
    
    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error.stack);
    
    // Cleanup on error
    if (fs.existsSync(watermarkedWavPath)) fs.unlinkSync(watermarkedWavPath);
    if (fs.existsSync(compressedMp3Path)) fs.unlinkSync(compressedMp3Path);
    
    process.exit(1);
  }
}

// Run the test
runRobustnessTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

