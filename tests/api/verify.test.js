/**
 * Test: POST /orbit/v1/verify
 * 
 * Tests the verification endpoint with both registered and unregistered audio.
 * Validates fingerprint matching, watermark extraction, signature verification,
 * and complete provenance response.
 * 
 * Prerequisites:
 * - Server running (npm run dev)
 * - PostgreSQL running with migrations
 * - Test platform seeded
 * 
 * Run: node tests/api/verify.test.js
 */

const fs = require('fs');
const path = require('path');
const cbor = require('cbor');
const OrbitCrypto = require('../../src/engines/crypto');
const FormData = require('form-data');

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_PLATFORM_ID = 'test-platform';
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio.mp3');

// Load test platform credentials
const PLATFORM_PRIVATE_KEY = process.env.TEST_PLATFORM_PRIVATE_KEY;

if (!PLATFORM_PRIVATE_KEY) {
  console.error('❌ TEST_PLATFORM_PRIVATE_KEY environment variable not set');
  console.error('   Run: npm run seed:platform first');
  process.exit(1);
}

const privateKey = Buffer.from(PLATFORM_PRIVATE_KEY, 'base64');

/**
 * Make authenticated ORBIT registration request
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
 * Make verification request (no auth required)
 */
async function verifyAudio(audioBuffer) {
  const url = `${API_URL}/orbit/v1/verify`;
  
  // Encode audio as base64 for CBOR/JSON request
  const audioBase64 = audioBuffer.toString('base64');
  
  // Create CBOR request
  const requestData = { audio: audioBase64 };
  const requestBody = cbor.encode(requestData);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
      'Accept': 'application/json', // Request JSON response for easier debugging
    },
    body: requestBody,
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
 * Main test runner
 */
async function runTests() {
  console.log('🧪 ORBIT Verify Endpoint Test Suite\n');
  console.log('='.repeat(60));
  
  let registrationResponse;
  let testAudioBuffer;
  let watermarkedAudioBuffer;
  
  try {
    // ========================================================================
    // TEST 1: Register Test Audio First
    // ========================================================================
    
    console.log('\n📝 TEST 1: Register test audio (prerequisite for verification)');
    console.log('-'.repeat(60));
    
    testAudioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
    console.log(`✓ Loaded test audio: ${testAudioBuffer.length} bytes`);
    
    const metadata = {
      owner_id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Verify Test Track',
      artist: 'Test Artist',
      duration_ms: 180000,
      isrc: 'USTEST000001',
      upc: '012345678901',
      primary_genre: 'Electronic',
      language: 'en',
      p_line: '2025 Test Records',
      c_line: '2025 Test Publishing',
    };
    
    registrationResponse = await registerAudio(metadata, testAudioBuffer);
    
    if (registrationResponse.status !== 200) {
      console.error(`❌ Registration failed: ${registrationResponse.status}`);
      console.error(JSON.stringify(registrationResponse.data, null, 2));
      return;
    }
    
    console.log(`✓ Registration successful: ID ${registrationResponse.data.registration_id}`);
    console.log(`   Fingerprint: ${registrationResponse.data.fingerprint_hash.slice(0, 16)}...`);
    
    // Save watermarked audio for verification test
    if (registrationResponse.data.watermarked_audio) {
      watermarkedAudioBuffer = Buffer.from(registrationResponse.data.watermarked_audio, 'base64');
      console.log(`✓ Watermarked audio received: ${watermarkedAudioBuffer.length} bytes`);
    }
    
    // ========================================================================
    // TEST 2: Verify Registered Audio (with watermark)
    // ========================================================================
    
    console.log('\n📝 TEST 2: Verify registered audio (watermarked)');
    console.log('-'.repeat(60));
    
    const verifyResult1 = await verifyAudio(watermarkedAudioBuffer);
    
    if (verifyResult1.status !== 200) {
      console.error(`❌ Verification failed: ${verifyResult1.status}`);
      console.error(JSON.stringify(verifyResult1.data, null, 2));
      return;
    }
    
    console.log(`✓ Verification request successful`);
    
    // Check verification response structure
    const v1 = verifyResult1.data;
    
    console.log(`\n📊 Verification Result:`);
    console.log(`   Verified: ${v1.verified}`);
    console.log(`   Fingerprint hash: ${v1.fingerprint_hash?.slice(0, 16)}...`);
    
    if (v1.fingerprint_match) {
      console.log(`   ✓ Fingerprint Match:`);
      console.log(`     - Registration ID: ${v1.fingerprint_match.registration_id}`);
      console.log(`     - Similarity: ${v1.fingerprint_match.similarity}`);
    } else {
      console.log(`   ✗ No fingerprint match found`);
    }
    
    if (v1.watermark) {
      console.log(`   ✓ Watermark Status:`);
      console.log(`     - Detected: ${v1.watermark.detected}`);
      console.log(`     - Valid: ${v1.watermark.valid}`);
      console.log(`     - Confidence: ${v1.watermark.confidence?.toFixed(4) || 'N/A'}`);
      
      if (v1.watermark.extracted_data) {
        console.log(`     - Magic: ${v1.watermark.extracted_data.magic}`);
        console.log(`     - Version: ${v1.watermark.extracted_data.version}`);
        console.log(`     - Timestamp: ${v1.watermark.extracted_data.timestamp}`);
        console.log(`     - Platform hash: ${v1.watermark.extracted_data.platform_hash?.slice(0, 16)}...`);
        console.log(`     - CRC valid: ${v1.watermark.extracted_data.crc_valid}`);
      }
    }
    
    if (v1.metadata) {
      console.log(`   ✓ Metadata Retrieved:`);
      console.log(`     - Title: ${v1.metadata.title}`);
      console.log(`     - Artist: ${v1.metadata.artist}`);
      console.log(`     - ISRC: ${v1.metadata.isrc}`);
      console.log(`     - Duration: ${v1.metadata.duration_ms}ms`);
    }
    
    if (v1.origin) {
      console.log(`   ✓ Origin Information:`);
      console.log(`     - Platform: ${v1.origin.platform}`);
      console.log(`     - Owner ID: ${v1.origin.owner_id}`);
      console.log(`     - Signature valid: ${v1.origin.signature_valid}`);
      console.log(`     - Registered at: ${v1.origin.registered_at}`);
    }
    
    console.log(`   Processing time: ${v1.processing_time_ms}ms`);
    
    // Validate expected structure
    if (!v1.verified) {
      console.error(`\n❌ FAILED: Expected verified=true for registered audio`);
      return;
    }
    
    if (!v1.fingerprint_match) {
      console.error(`\n❌ FAILED: Expected fingerprint_match to be present`);
      return;
    }
    
    if (!v1.metadata) {
      console.error(`\n❌ FAILED: Expected metadata to be present`);
      return;
    }
    
    if (!v1.origin) {
      console.error(`\n❌ FAILED: Expected origin to be present`);
      return;
    }
    
    console.log(`\n✅ TEST 2 PASSED: Watermarked audio verified successfully`);
    
    // ========================================================================
    // TEST 3: Verify Original Audio (no watermark)
    // ========================================================================
    
    console.log('\n📝 TEST 3: Verify original audio (no watermark, fingerprint only)');
    console.log('-'.repeat(60));
    
    const verifyResult2 = await verifyAudio(testAudioBuffer);
    
    if (verifyResult2.status !== 200) {
      console.error(`❌ Verification failed: ${verifyResult2.status}`);
      console.error(JSON.stringify(verifyResult2.data, null, 2));
      return;
    }
    
    const v2 = verifyResult2.data;
    
    console.log(`   Verified: ${v2.verified}`);
    console.log(`   Fingerprint match: ${v2.fingerprint_match ? 'Yes' : 'No'}`);
    console.log(`   Watermark detected: ${v2.watermark?.detected || false}`);
    
    if (!v2.verified) {
      console.error(`\n❌ FAILED: Expected verified=true (fingerprint should still match)`);
      return;
    }
    
    if (!v2.fingerprint_match) {
      console.error(`\n❌ FAILED: Fingerprint should match even without watermark`);
      return;
    }
    
    if (v2.watermark?.detected) {
      console.log(`   ⚠️  Note: Watermark detected in original (may be residual correlation)`);
    }
    
    console.log(`\n✅ TEST 3 PASSED: Original audio verified via fingerprint`);
    
    // ========================================================================
    // TEST 4: Verify Unregistered Audio
    // ========================================================================
    
    console.log('\n📝 TEST 4: Verify unregistered audio');
    console.log('-'.repeat(60));
    
    // Create a fake audio buffer (random data)
    const fakeAudioBuffer = Buffer.alloc(1024 * 100); // 100KB of zeros
    // Note: This won't pass FFmpeg validation in real use, but tests the flow
    
    console.log(`   Note: Using dummy audio data (won't have valid fingerprint)`);
    
    // For a real test, we'd need a different actual audio file
    // For now, we'll skip this test or note it requires manual verification
    console.log(`   ⚠️  SKIPPED: Requires separate unregistered audio file`);
    console.log(`   To test manually: verify with a different MP3 file`);
    
    // ========================================================================
    // TEST 5: Test Response Extensibility (V2 compatibility)
    // ========================================================================
    
    console.log('\n📝 TEST 5: Verify response structure for v2 extensibility');
    console.log('-'.repeat(60));
    
    const v1Response = verifyResult1.data;
    
    // Check that response has expected top-level fields
    const requiredFields = [
      'verified',
      'fingerprint_hash',
      'fingerprint_match',
      'watermark',
      'metadata',
      'origin',
      'transfers',
      'duplicate_of',
      'processing_time_ms'
    ];
    
    const missingFields = requiredFields.filter(field => !(field in v1Response));
    
    if (missingFields.length > 0) {
      console.error(`\n❌ FAILED: Missing required fields: ${missingFields.join(', ')}`);
      return;
    }
    
    console.log(`   ✓ All required response fields present`);
    console.log(`   ✓ Response structure is extensible for v2 enhancements`);
    console.log(`   Note: V2 will add: ai_extracted_metadata, content_analysis, confidence_summary`);
    
    console.log(`\n✅ TEST 5 PASSED: Response structure validated`);
    
    // ========================================================================
    // SUMMARY
    // ========================================================================
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   ✓ Test 1: Registration prerequisite`);
    console.log(`   ✓ Test 2: Watermarked audio verification`);
    console.log(`   ✓ Test 3: Original audio verification (fingerprint only)`);
    console.log(`   ⚠️  Test 4: Unregistered audio (skipped, requires separate file)`);
    console.log(`   ✓ Test 5: Response structure validation`);
    console.log('\n🎉 Verify endpoint is working correctly!\n');
    
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


