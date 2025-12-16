/**
 * Debug test: Trace the exact fingerprint flow
 * 
 * This test isolates the issue by:
 * 1. Registering audio and capturing the fingerprint stored
 * 2. Verifying the watermarked audio and comparing fingerprints
 * 3. Showing exactly where the mismatch occurs
 */

const fs = require('fs');
const path = require('path');
const cbor = require('cbor');
const OrbitCrypto = require('../../src/engines/crypto');
const OrbitFingerprint = require('../../src/engines/fingerprint');
const FormData = require('form-data');

const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_PLATFORM_ID = 'test-platform';
const PLATFORM_PRIVATE_KEY = process.env.TEST_PLATFORM_PRIVATE_KEY;

if (!PLATFORM_PRIVATE_KEY) {
  console.error('❌ TEST_PLATFORM_PRIVATE_KEY environment variable not set');
  process.exit(1);
}

const privateKey = Buffer.from(PLATFORM_PRIVATE_KEY, 'base64');

async function debug() {
  console.log('🔍 DEBUG: Fingerprint Flow Analysis\n');
  console.log('='.repeat(60));
  
  // Use rhythm audio (fresh)
  const audioPath = path.join(__dirname, '../fixtures/test-audio-rhythm.wav');
  const originalBuffer = fs.readFileSync(audioPath);
  
  console.log(`\n📁 Original Audio: ${audioPath}`);
  console.log(`   Size: ${originalBuffer.length} bytes`);
  
  // Step 1: Generate fingerprint LOCALLY (what we expect)
  console.log('\n--- STEP 1: Local Fingerprint (before any API calls) ---');
  const localFingerprint = await OrbitFingerprint.generate(originalBuffer);
  console.log(`   Local fingerprint hash: ${localFingerprint.hash.toString('hex')}`);
  console.log(`   Local fingerprint raw (first 60): ${localFingerprint.raw.slice(0, 60)}...`);
  
  // Step 2: Register via API
  console.log('\n--- STEP 2: Register via API ---');
  const testRunId = Date.now();
  const metadata = {
    owner_id: '550e8400-e29b-41d4-a716-446655440000',
    title: `Debug Test - ${testRunId}`,
    artist: 'Debug Artist',
    duration_ms: 30000,
    isrc: `DBG${testRunId.toString().slice(-9)}`,
  };
  
  const formData = new FormData();
  formData.append('metadata', cbor.encode(metadata), {
    filename: 'metadata.cbor',
    contentType: 'application/cbor'
  });
  formData.append('audio', originalBuffer, {
    filename: 'audio.wav',
    contentType: 'audio/wav'
  });
  
  const signature = OrbitCrypto.sign(metadata, privateKey);
  
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
  
  if (regResponse.status !== 200) {
    console.error(`   ❌ Registration failed: ${regResponse.status}`);
    console.error(JSON.stringify(regData, null, 2));
    return;
  }
  
  console.log(`   ✓ Registration successful: ID ${regData.registration_id}`);
  console.log(`   API stored fingerprint: ${regData.fingerprint_hash}`);
  console.log(`   Watermark method: ${regData.watermark_method}`);
  
  // Compare local vs API fingerprint
  const localFpHex = localFingerprint.hash.toString('hex');
  console.log(`\n   🔍 COMPARISON: Local vs API stored fingerprint`);
  console.log(`   Local:  ${localFpHex}`);
  console.log(`   API:    ${regData.fingerprint_hash}`);
  console.log(`   Match:  ${localFpHex === regData.fingerprint_hash ? '✅ YES' : '❌ NO'}`);
  
  // Step 3: Decode watermarked audio
  console.log('\n--- STEP 3: Decode Watermarked Audio ---');
  const watermarkedBuffer = Buffer.from(regData.watermarked_audio, 'base64');
  console.log(`   Watermarked audio size: ${watermarkedBuffer.length} bytes`);
  console.log(`   Original audio size: ${originalBuffer.length} bytes`);
  console.log(`   Size change: ${watermarkedBuffer.length - originalBuffer.length} bytes`);
  
  // Step 4: Fingerprint watermarked audio LOCALLY
  console.log('\n--- STEP 4: Local Fingerprint of Watermarked Audio ---');
  const watermarkedFingerprint = await OrbitFingerprint.generate(watermarkedBuffer);
  console.log(`   Watermarked fingerprint hash: ${watermarkedFingerprint.hash.toString('hex')}`);
  console.log(`   Watermarked raw (first 60): ${watermarkedFingerprint.raw.slice(0, 60)}...`);
  
  // Compare original vs watermarked
  console.log(`\n   🔍 COMPARISON: Original vs Watermarked fingerprint (LOCAL)`);
  console.log(`   Original:    ${localFingerprint.hash.toString('hex')}`);
  console.log(`   Watermarked: ${watermarkedFingerprint.hash.toString('hex')}`);
  console.log(`   Match:       ${localFingerprint.hash.equals(watermarkedFingerprint.hash) ? '✅ YES' : '❌ NO'}`);
  
  // Check raw fingerprint similarity
  let rawDiffs = 0;
  const minLen = Math.min(localFingerprint.raw.length, watermarkedFingerprint.raw.length);
  for (let i = 0; i < minLen; i++) {
    if (localFingerprint.raw[i] !== watermarkedFingerprint.raw[i]) rawDiffs++;
  }
  console.log(`   Raw string diffs: ${rawDiffs}/${minLen} characters`);
  
  // Step 5: Verify via API
  console.log('\n--- STEP 5: Verify Watermarked Audio via API ---');
  const verifyBody = cbor.encode({ audio: watermarkedBuffer.toString('base64') });
  
  const verifyResponse = await fetch(`${API_URL}/orbit/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
      'Accept': 'application/json',
    },
    body: verifyBody,
  });
  
  const verifyData = await verifyResponse.json();
  
  console.log(`   API verify fingerprint: ${verifyData.fingerprint_hash}`);
  console.log(`   Verified: ${verifyData.verified}`);
  console.log(`   Fingerprint match: ${verifyData.fingerprint_match ? 'Found' : 'Not found'}`);
  
  // Final comparison
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL ANALYSIS');
  console.log('='.repeat(60));
  
  console.log(`\n1. Original audio fingerprint (local):      ${localFpHex.slice(0, 32)}...`);
  console.log(`2. API stored fingerprint (registration):   ${regData.fingerprint_hash.slice(0, 32)}...`);
  console.log(`3. Watermarked audio fingerprint (local):   ${watermarkedFingerprint.hash.toString('hex').slice(0, 32)}...`);
  console.log(`4. API verify fingerprint:                  ${verifyData.fingerprint_hash.slice(0, 32)}...`);
  
  const step1Match = localFpHex === regData.fingerprint_hash;
  const step2Match = localFingerprint.hash.equals(watermarkedFingerprint.hash);
  const step3Match = watermarkedFingerprint.hash.toString('hex') === verifyData.fingerprint_hash;
  const overallMatch = regData.fingerprint_hash === verifyData.fingerprint_hash;
  
  console.log(`\n✓ Step 1→2 (local vs API stored):          ${step1Match ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`✓ Step 1→3 (original vs watermarked):      ${step2Match ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`✓ Step 3→4 (local watermarked vs API):     ${step3Match ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`✓ Step 2→4 (stored vs verify):             ${overallMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  if (!step1Match) {
    console.log('\n⚠️  Issue: Local fingerprint differs from what API stored during registration');
    console.log('   Possible cause: API is processing/converting the audio before fingerprinting');
  }
  if (!step2Match) {
    console.log('\n⚠️  Issue: Watermarking changes the fingerprint');
    console.log('   Possible cause: Watermark is too strong OR audio format conversion');
  }
  if (!step3Match) {
    console.log('\n⚠️  Issue: API verify generates different fingerprint than local');
    console.log('   Possible cause: Base64 encoding/decoding issue OR CBOR parsing issue');
  }
  
  console.log('\n');
}

debug().catch(console.error);


