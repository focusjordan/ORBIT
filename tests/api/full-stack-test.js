/**
 * ORBIT Full Stack Test
 * 
 * Clean slate test that validates the entire ORBIT pipeline:
 * 1. Platform seeding (prerequisite)
 * 2. Audio registration
 * 3. Fingerprint generation & storage
 * 4. Watermark embedding
 * 5. Audio verification (original)
 * 6. Audio verification (watermarked)
 * 7. V2 response format
 * 
 * Usage:
 *   1. Run: npm run seed:platform (creates fresh platform)
 *   2. Add fresh audio to tests/fixtures/fresh-test-song.wav
 *   3. Export the private key from .test-platform-credentials.json
 *   4. Run: TEST_PLATFORM_PRIVATE_KEY="..." node tests/api/full-stack-test.js
 */

const fs = require('fs');
const path = require('path');
const cbor = require('cbor');
const OrbitCrypto = require('../../src/engines/crypto');
const OrbitFingerprint = require('../../src/engines/fingerprint');
const FormData = require('form-data');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_PLATFORM_ID = process.env.TEST_PLATFORM_ID || 'test-platform';

// Try to load credentials from file if env var not set
let PLATFORM_PRIVATE_KEY = process.env.TEST_PLATFORM_PRIVATE_KEY;
if (!PLATFORM_PRIVATE_KEY) {
  try {
    const credsPath = path.join(__dirname, '../../.test-platform-credentials.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    PLATFORM_PRIVATE_KEY = creds.private_key; // snake_case in file
    console.log('✓ Loaded credentials from .test-platform-credentials.json');
  } catch (e) {
    console.error('❌ Could not load platform credentials');
    console.error('   Run: npm run seed:platform first');
    process.exit(1);
  }
}

const privateKey = Buffer.from(PLATFORM_PRIVATE_KEY, 'base64');

// Find fresh audio file
function findFreshAudio() {
  const fixturesDir = path.join(__dirname, '../fixtures');
  
  // Priority order for fresh audio
  const candidates = [
    'fresh-test-song.wav',
    'fresh-test-song.mp3',
    'new-audio.wav',
    'new-audio.mp3',
  ];
  
  for (const candidate of candidates) {
    const fullPath = path.join(fixturesDir, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  
  // Fall back to generating synthetic audio
  return null;
}

// Generate synthetic audio if no fresh file available
async function generateSyntheticAudio() {
  console.log('   Generating synthetic audio (60 seconds)...');
  
  const sampleRate = 44100;
  const duration = 60; // 60 seconds
  const samples = new Float32Array(sampleRate * duration);
  
  // Create a simple melody with some rhythm
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    
    // Base frequency that changes over time (simple melody)
    const noteIndex = Math.floor(t * 2) % 8;
    const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]; // C4 to C5
    const freq = notes[noteIndex];
    
    // Sine wave with envelope
    const envelope = Math.min(1, Math.min((t % 0.5) * 10, (0.5 - (t % 0.5)) * 10));
    samples[i] = Math.sin(2 * Math.PI * freq * t) * 0.3 * envelope;
    
    // Add some harmonics
    samples[i] += Math.sin(2 * Math.PI * freq * 2 * t) * 0.1 * envelope;
    samples[i] += Math.sin(2 * Math.PI * freq * 3 * t) * 0.05 * envelope;
    
    // Add subtle noise for texture
    samples[i] += (Math.random() - 0.5) * 0.02;
  }
  
  // Encode to WAV
  const AudioUtils = require('../../src/utils/audio');
  const wavBuffer = await AudioUtils.encodeSamplesToWav(samples, sampleRate, 1);
  
  return wavBuffer;
}

async function runFullStackTest() {
  console.log('\n' + '═'.repeat(70));
  console.log('  ORBIT FULL STACK TEST - Clean Slate Validation');
  console.log('═'.repeat(70));
  
  const results = {
    steps: [],
    passed: 0,
    failed: 0,
  };
  
  function logStep(name, success, details = '') {
    const status = success ? '✅' : '❌';
    console.log(`\n${status} ${name}`);
    if (details) console.log(`   ${details}`);
    results.steps.push({ name, success, details });
    if (success) results.passed++;
    else results.failed++;
    return success;
  }
  
  try {
    // ========================================================================
    // STEP 1: Load or generate audio
    // ========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 1: Prepare Audio');
    console.log('─'.repeat(70));
    
    let audioBuffer;
    let audioSource;
    
    const freshAudioPath = findFreshAudio();
    if (freshAudioPath) {
      audioBuffer = fs.readFileSync(freshAudioPath);
      audioSource = path.basename(freshAudioPath);
      console.log(`   Found fresh audio: ${audioSource}`);
    } else {
      audioBuffer = await generateSyntheticAudio();
      audioSource = 'synthetic (generated)';
      console.log(`   No fresh audio found, using synthetic`);
    }
    
    logStep('Audio prepared', true, `Source: ${audioSource}, Size: ${audioBuffer.length} bytes`);
    
    // ========================================================================
    // STEP 2: Generate local fingerprint (baseline)
    // ========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 2: Generate Local Fingerprint (Baseline)');
    console.log('─'.repeat(70));
    
    const localFingerprint = await OrbitFingerprint.generate(audioBuffer);
    const localFpHex = localFingerprint.hash.toString('hex');
    
    logStep('Local fingerprint generated', true, 
      `Hash: ${localFpHex.slice(0, 32)}...\n   Duration: ${localFingerprint.duration}s`);
    
    // ========================================================================
    // STEP 3: Register audio via API
    // ========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 3: Register Audio via API');
    console.log('─'.repeat(70));
    
    const testRunId = Date.now();
    const metadata = {
      owner_id: '550e8400-e29b-41d4-a716-446655440000',
      title: `Full Stack Test - ${testRunId}`,
      artist: 'ORBIT Test Suite',
      duration_ms: Math.round(localFingerprint.duration * 1000),
      isrc: `TST${testRunId.toString().slice(-9)}`,
      primary_genre: 'Electronic',
    };
    
    const formData = new FormData();
    formData.append('metadata', cbor.encode(metadata), {
      filename: 'metadata.cbor',
      contentType: 'application/cbor'
    });
    
    const ext = audioSource.endsWith('.mp3') ? 'mp3' : 'wav';
    const mimeType = ext === 'mp3' ? 'audio/mpeg' : 'audio/wav';
    formData.append('audio', audioBuffer, {
      filename: `audio.${ext}`,
      contentType: mimeType
    });
    
    const signature = OrbitCrypto.sign(metadata, privateKey);
    
    console.log(`   Sending to ${API_URL}/orbit/v1/register`);
    console.log(`   Platform: ${TEST_PLATFORM_ID}`);
    console.log(`   Title: ${metadata.title}`);
    
    const regResponse = await fetch(`${API_URL}/orbit/v1/register`, {
      method: 'POST',
      headers: {
        ...formData.getHeaders(),
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': signature.toString('base64'),
      },
      body: formData.getBuffer(),
      duplex: 'half',
    });
    
    const regData = await regResponse.json();
    
    if (regResponse.status === 409) {
      logStep('Registration', false, 
        `DUPLICATE DETECTED - This audio fingerprint already exists\n   ` +
        `Existing ID: ${regData.existing_registration?.registration_id || 'unknown'}\n   ` +
        `You need to use a FRESH audio file that hasn't been registered before`);
      return results;
    }
    
    if (regResponse.status !== 200) {
      logStep('Registration', false, `HTTP ${regResponse.status}: ${JSON.stringify(regData)}`);
      return results;
    }
    
    logStep('Registration successful', true,
      `ID: ${regData.registration_id}\n   ` +
      `Stored fingerprint: ${regData.fingerprint_hash.slice(0, 32)}...\n   ` +
      `Watermark method: ${regData.watermark_method}`);
    
    // Compare local vs stored fingerprint
    const storedFpMatch = localFpHex === regData.fingerprint_hash;
    logStep('Fingerprint consistency (local vs stored)', storedFpMatch,
      storedFpMatch 
        ? 'Local fingerprint matches what API stored' 
        : `MISMATCH!\n   Local:  ${localFpHex.slice(0, 32)}...\n   Stored: ${regData.fingerprint_hash.slice(0, 32)}...`);
    
    // ========================================================================
    // STEP 4: Decode watermarked audio
    // ========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 4: Process Watermarked Audio');
    console.log('─'.repeat(70));
    
    if (!regData.watermarked_audio) {
      logStep('Watermarked audio received', false, 'No watermarked_audio in response');
      return results;
    }
    
    const watermarkedBuffer = Buffer.from(regData.watermarked_audio, 'base64');
    logStep('Watermarked audio decoded', true,
      `Size: ${watermarkedBuffer.length} bytes (original: ${audioBuffer.length})`);
    
    // Fingerprint the watermarked audio locally
    const wmFingerprint = await OrbitFingerprint.generate(watermarkedBuffer);
    const wmFpHex = wmFingerprint.hash.toString('hex');
    
    const wmFpMatch = localFpHex === wmFpHex;
    logStep('Fingerprint survives watermarking', wmFpMatch,
      wmFpMatch 
        ? 'Watermarked audio has same fingerprint as original ✓'
        : `MISMATCH! Watermarking changed the fingerprint\n   Original:    ${localFpHex.slice(0, 32)}...\n   Watermarked: ${wmFpHex.slice(0, 32)}...`);
    
    // ========================================================================
    // STEP 5: Verify ORIGINAL audio
    // ========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 5: Verify ORIGINAL Audio');
    console.log('─'.repeat(70));
    
    const verifyOrigBody = cbor.encode({ audio: audioBuffer.toString('base64') });
    
    const verifyOrigResponse = await fetch(`${API_URL}/orbit/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        'Accept': 'application/json',
      },
      body: verifyOrigBody,
    });
    
    const verifyOrigData = await verifyOrigResponse.json();
    
    logStep('Verify original audio', verifyOrigData.verified,
      `Verified: ${verifyOrigData.verified}\n   ` +
      `Fingerprint: ${verifyOrigData.fingerprint_hash?.slice(0, 32)}...\n   ` +
      `Match found: ${verifyOrigData.fingerprint_match ? 'Yes (ID: ' + verifyOrigData.fingerprint_match.registration_id + ')' : 'No'}`);
    
    // ========================================================================
    // STEP 6: Verify WATERMARKED audio
    // ========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 6: Verify WATERMARKED Audio');
    console.log('─'.repeat(70));
    
    const verifyWmBody = cbor.encode({ audio: watermarkedBuffer.toString('base64') });
    
    const verifyWmResponse = await fetch(`${API_URL}/orbit/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        'Accept': 'application/json',
      },
      body: verifyWmBody,
    });
    
    const verifyWmData = await verifyWmResponse.json();
    
    logStep('Verify watermarked audio', verifyWmData.verified,
      `Verified: ${verifyWmData.verified}\n   ` +
      `Fingerprint: ${verifyWmData.fingerprint_hash?.slice(0, 32)}...\n   ` +
      `Match found: ${verifyWmData.fingerprint_match ? 'Yes (ID: ' + verifyWmData.fingerprint_match.registration_id + ')' : 'No'}\n   ` +
      `Watermark detected: ${verifyWmData.watermark?.detected || false}`);
    
    // ========================================================================
    // STEP 7: Check V2 Response Structure
    // ========================================================================
    console.log('\n' + '─'.repeat(70));
    console.log('STEP 7: Validate V2 Response Structure');
    console.log('─'.repeat(70));
    
    const v2Sections = ['identity', 'watermark', 'confidence_summary', 'provenance'];
    const presentSections = v2Sections.filter(s => verifyWmData[s]);
    
    logStep('V2 response sections present', presentSections.length >= 3,
      `Found: ${presentSections.join(', ') || 'none'}\n   ` +
      `Missing: ${v2Sections.filter(s => !verifyWmData[s]).join(', ') || 'none'}`);
    
    // Check v1 backward compatibility
    const v1Fields = ['verified', 'fingerprint_hash', 'watermark', 'processing_time_ms'];
    const v1Present = v1Fields.filter(f => f in verifyWmData);
    
    logStep('V1 backward compatibility', v1Present.length === v1Fields.length,
      `V1 fields present: ${v1Present.join(', ')}`);
    
    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log('  TEST SUMMARY');
    console.log('═'.repeat(70));
    
    console.log(`\n  Total steps: ${results.steps.length}`);
    console.log(`  ✅ Passed: ${results.passed}`);
    console.log(`  ❌ Failed: ${results.failed}`);
    
    if (results.failed === 0) {
      console.log('\n  🎉 ALL TESTS PASSED - Full stack is working!\n');
    } else {
      console.log('\n  ⚠️  Some tests failed - review output above\n');
      
      // Highlight critical failures
      const criticalFailures = results.steps.filter(s => !s.success);
      if (criticalFailures.length > 0) {
        console.log('  Critical issues:');
        criticalFailures.forEach(f => {
          console.log(`    • ${f.name}`);
        });
        console.log('');
      }
    }
    
    return results;
    
  } catch (error) {
    console.error('\n❌ TEST SUITE CRASHED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return results;
  }
}

// Run
runFullStackTest().then(results => {
  process.exit(results.failed === 0 ? 0 : 1);
});
