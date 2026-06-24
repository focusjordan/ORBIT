/**
 * Test: GET /orbit/v1/chain/:fingerprint
 * 
 * Tests the chain lookup endpoint which returns complete custody history
 * for a given fingerprint hash.
 * 
 * Test scenarios:
 * 1. Query chain for non-existent fingerprint (404)
 * 2. Query chain for freshly registered audio (single registration, no transfers)
 * 3. Query chain after transfer (registration + transfer + new registration)
 * 
 * Prerequisites:
 * - Server running (npm run dev)
 * - PostgreSQL running with migrations
 * - Test platforms seeded
 * 
 * Run: node tests/api/chain.test.js
 * 
 * Test Modes:
 * - Fast (default): Uses 5-second audio for quick iteration
 * - Full: Uses 30-second audio for thorough validation
 */

const fs = require('fs');
const path = require('path');
const cbor = require('cbor');
const OrbitCrypto = require('../../src/engines/crypto');
const FormData = require('form-data');
const { getTestAudioPath, logTestMode, getConfig } = require('../test-config');

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_PLATFORM_ID = 'test-platform';

// Get appropriate test audio based on mode
const TEST_AUDIO_PATH = getTestAudioPath();

// Load test platform credentials
const PLATFORM_PRIVATE_KEY = process.env.TEST_PLATFORM_PRIVATE_KEY;
const PLATFORM_API_KEY = process.env.TEST_PLATFORM_API_KEY;

if (!PLATFORM_PRIVATE_KEY || !PLATFORM_API_KEY) {
  console.error('❌ TEST_PLATFORM_PRIVATE_KEY or TEST_PLATFORM_API_KEY environment variable not set');
  console.error('   Run: npm run seed:platform first');
  process.exit(1);
}

const privateKey = Buffer.from(PLATFORM_PRIVATE_KEY, 'base64');

/**
 * Helper: Register audio with ORBIT
 */
async function registerAudio(metadata, audioBuffer) {
  const url = `${API_URL}/orbit/v1/register`;
  
  const signature = OrbitCrypto.sign(metadata, privateKey);
  const metadataCbor = cbor.encode(metadata);
  
  const formData = new FormData();
  formData.append('metadata', metadataCbor, {
    filename: 'metadata.cbor',
    contentType: 'application/cbor'
  });
  formData.append('audio', audioBuffer, {
    filename: 'audio.mp3',
    contentType: 'audio/mpeg'
  });
  
  const formHeaders = formData.getHeaders();
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...formHeaders,
      'X-ORBIT-Platform': TEST_PLATFORM_ID,
      'X-ORBIT-Signature': signature.toString('base64'),
      'X-ORBIT-API-Key': PLATFORM_API_KEY,
    },
    body: formData.getBuffer(),
    duplex: 'half',
  });
  
  const contentType = response.headers.get('content-type') || '';
  let responseData;
  
  if (contentType.includes('application/json')) {
    responseData = await response.json();
  } else {
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { error: 'unparseable_response', body: text };
    }
  }
  
  return { status: response.status, data: responseData };
}

/**
 * Helper: Look up chain by fingerprint hash
 */
async function getChain(fingerprintHash) {
  // Convert Buffer to hex string if needed
  const fingerprintHex = Buffer.isBuffer(fingerprintHash) 
    ? fingerprintHash.toString('hex')
    : fingerprintHash;
  
  const url = `${API_URL}/orbit/v1/chain/${fingerprintHex}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-ORBIT-Platform': TEST_PLATFORM_ID,
      'X-ORBIT-API-Key': PLATFORM_API_KEY,
    }
  });
  
  const contentType = response.headers.get('content-type') || '';
  let responseData;
  
  if (contentType.includes('application/json')) {
    responseData = await response.json();
  } else {
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { error: 'unparseable_response', body: text };
    }
  }
  
  return { status: response.status, data: responseData };
}

/**
 * Helper: Initiate transfer
 */
async function initiateTransfer(registrationId, toPlatform) {
  const url = `${API_URL}/orbit/v1/transfer`;
  
  const requestData = {
    registration_id: registrationId,
    to_platform: toPlatform
  };
  
  const signature = OrbitCrypto.sign(requestData, privateKey);
  const requestBody = cbor.encode(requestData);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
      'X-ORBIT-Platform': TEST_PLATFORM_ID,
      'X-ORBIT-Signature': signature.toString('base64'),
      'X-ORBIT-API-Key': PLATFORM_API_KEY
    },
    body: requestBody
  });
  
  const text = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(text);
  } catch {
    responseData = { error: 'unparseable_response', body: text };
  }
  
  return { status: response.status, data: responseData };
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runTests() {
  logTestMode('ORBIT Chain Lookup Endpoint Tests');
  console.log('='.repeat(60));
  
  const config = getConfig();
  let testsPassed = 0;
  let testsFailed = 0;
  let registeredFingerprint = null;
  let registrationId = null;
  
  // Load test audio
  const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
  console.log(`✓ Loaded test audio: ${audioBuffer.length} bytes`);
  console.log(`   Expected watermark time: ~${Math.round(config.expectedWatermarkTime / 1000)}s\n`);
  
  // ========================================================================
  // TEST 1: Query non-existent fingerprint (should return 404)
  // ========================================================================
  
  console.log('TEST 1: Query chain for non-existent fingerprint');
  console.log('-'.repeat(60));
  
  try {
    const fakeFingerprint = '0'.repeat(64); // All zeros
    const result = await getChain(fakeFingerprint);
    
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, JSON.stringify(result.data, null, 2));
    
    if (result.status === 404) {
      console.log('✅ PASS: Correctly returned 404 for non-existent fingerprint\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Expected 404, got', result.status, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Test threw exception:', error.message, '\n');
    testsFailed++;
  }
  
  // ========================================================================
  // TEST 2: Register audio and query its chain
  // ========================================================================
  
  console.log('TEST 2: Register audio and query its chain');
  console.log('-'.repeat(60));
  
  try {
    // Register audio
    const metadata = {
      title: 'Chain Test Track',
      artist: 'Chain Test Artist',
      duration_ms: 180000,
      p_line: '2024 Test Label',
      c_line: '2024 Test Publisher',
      primary_genre: 'Test',
      language: 'en',
      isrc: 'TESTCHAIN001',
      upc: '000000000001',
      owner_id: '00000000-0000-0000-0000-000000000001'
    };
    
    console.log('Registering test audio...');
    const registerResult = await registerAudio(metadata, audioBuffer);
    
    if (registerResult.status !== 200 || !registerResult.data.success) {
      throw new Error(`Registration failed: ${JSON.stringify(registerResult.data)}`);
    }
    
    registeredFingerprint = registerResult.data.fingerprint_hash;
    registrationId = registerResult.data.registration_id;
    
    console.log(`✓ Registered: ID=${registrationId}`);
    console.log(`✓ Fingerprint: ${registeredFingerprint.slice(0, 16)}...`);
    
    // Query chain
    console.log('\nQuerying chain...');
    const chainResult = await getChain(registeredFingerprint);
    
    console.log(`Status: ${chainResult.status}`);
    console.log(`Response:`, JSON.stringify(chainResult.data, null, 2));
    
    // Validate response structure
    const chain = chainResult.data;
    
    // Find our specific registration in the chain (may have previous test runs)
    const ourRegistration = chain.registrations?.find(r => r.registration_id === registrationId);
    
    if (chainResult.status === 200 &&
        chain.fingerprint_hash === registeredFingerprint &&
        chain.registration_count >= 1 &&  // May have previous test runs
        ourRegistration &&
        ourRegistration.metadata.title === metadata.title &&
        ourRegistration.metadata.artist === metadata.artist &&
        chain.chain?.length >= 1) {
      console.log('✅ PASS: Chain returned correct structure (our registration found)\n');
      console.log(`   Note: ${chain.registration_count} total registration(s) for this fingerprint`);
      testsPassed++;
    } else {
      console.log('❌ FAIL: Chain structure validation failed\n');
      console.log('Expected our registration in chain. Got:', {
        status: chainResult.status,
        registration_count: chain.registration_count,
        our_registration_found: !!ourRegistration,
        chain_length: chain.chain?.length
      });
      console.log();
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Test threw exception:', error.message, '\n');
    testsFailed++;
  }
  
  // ========================================================================
  // TEST 3: Query chain with invalid fingerprint format
  // ========================================================================
  
  console.log('TEST 3: Query chain with invalid fingerprint format');
  console.log('-'.repeat(60));
  
  try {
    const invalidFingerprint = 'not-a-valid-hex-string';
    const result = await getChain(invalidFingerprint);
    
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, JSON.stringify(result.data, null, 2));
    
    if (result.status === 400 && result.data.error) {
      console.log('✅ PASS: Correctly rejected invalid fingerprint format\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Expected 400 error for invalid format, got', result.status, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Test threw exception:', error.message, '\n');
    testsFailed++;
  }
  
  // ========================================================================
  // TEST 4: Query chain with wrong-length fingerprint
  // ========================================================================
  
  console.log('TEST 4: Query chain with wrong-length fingerprint');
  console.log('-'.repeat(60));
  
  try {
    const wrongLengthFingerprint = '0123456789abcdef'; // Too short (16 chars instead of 64)
    const result = await getChain(wrongLengthFingerprint);
    
    console.log(`Status: ${result.status}`);
    console.log(`Response:`, JSON.stringify(result.data, null, 2));
    
    if (result.status === 400 && result.data.error) {
      console.log('✅ PASS: Correctly rejected wrong-length fingerprint\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Expected 400 error for wrong length, got', result.status, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Test threw exception:', error.message, '\n');
    testsFailed++;
  }
  
  // ========================================================================
  // SUMMARY
  // ========================================================================
  
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${testsFailed} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});


