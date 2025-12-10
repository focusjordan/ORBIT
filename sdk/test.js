/**
 * ORBIT SDK Test
 * 
 * Tests the SDK against a running ORBIT server.
 * 
 * Prerequisites:
 * - ORBIT server running (npm run dev in main project)
 * - PostgreSQL running with test platform seeded
 * - TEST_PLATFORM_PRIVATE_KEY environment variable set
 * 
 * Run: node sdk/test.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { OrbitClient } = require('./index');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const PLATFORM_ID = process.env.TEST_PLATFORM_ID || 'test-platform';
const PRIVATE_KEY = process.env.TEST_PLATFORM_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error('❌ TEST_PLATFORM_PRIVATE_KEY environment variable not set');
  console.error('   Run: npm run seed:platform first');
  process.exit(1);
}

const privateKey = Buffer.from(PRIVATE_KEY, 'base64');

// Test fixtures
const TEST_AUDIO_PATH = path.join(__dirname, '../tests/fixtures/test-audio.mp3');

if (!fs.existsSync(TEST_AUDIO_PATH)) {
  console.error(`❌ Test audio file not found: ${TEST_AUDIO_PATH}`);
  process.exit(1);
}

// Initialize client
const client = new OrbitClient({
  apiUrl: API_URL,
  platformId: PLATFORM_ID,
  privateKey: privateKey
});

console.log('🧪 ORBIT SDK Test Suite\n');
console.log(`API URL: ${API_URL}`);
console.log(`Platform: ${PLATFORM_ID}`);
console.log(`Private Key: ${privateKey.slice(0, 8).toString('hex')}...\n`);

/**
 * Test helper: Run test and report result
 */
async function runTest(name, testFn) {
  try {
    console.log(`▶️  ${name}`);
    const result = await testFn();
    console.log(`✅ ${name} - PASSED\n`);
    return result;
  } catch (error) {
    console.error(`❌ ${name} - FAILED`);
    console.error(`   ${error.message}`);
    if (error.code) console.error(`   Code: ${error.code}`);
    if (error.status) console.error(`   Status: ${error.status}`);
    console.error();
    throw error;
  }
}

/**
 * Main test suite
 */
async function runTests() {
  let registrationId;
  let fingerprintHash;
  let watermarkedAudio;
  let transferId;

  try {
    // Test 1: Register new audio (or verify if already registered)
    const registerResult = await runTest('Test 1: Register new audio', async () => {
      const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
      
      try {
        const result = await client.register(audioBuffer, {
          title: 'SDK Test Track',
          artist: 'SDK Test Artist',
          duration_ms: 180000,
          isrc: 'USSDK2024001',
          primary_genre: 'Test',
          album_title: 'SDK Test Album',
          p_line: '2024 SDK Test',
          c_line: '2024 SDK Test'
        }, '12345678-1234-1234-1234-123456789012');
        
        console.log('   ✅ New registration created');
        return result;
      } catch (error) {
        if (error.code === 'duplicate_registration') {
          // Audio already registered - verify instead to get the data
          console.log('   ⚠️  Audio already registered, verifying existing...');
          const verifyResult = await client.verify(audioBuffer);
          
          // Convert verify result to look like register result for tests
          return {
            success: true,
            registration_id: verifyResult.fingerprint_match.registration_id,
            fingerprint_hash: verifyResult.fingerprint_hash,
            watermarked_audio: audioBuffer, // Use original
            registered_at: verifyResult.origin.timestamp
          };
        }
        throw error; // Re-throw if it's a different error
      }

      console.log(`   Registration ID: ${result.registration_id}`);
      console.log(`   Fingerprint: ${result.fingerprint_hash.toString('hex').slice(0, 16)}...`);
      console.log(`   Watermarked audio: ${result.watermarked_audio.length} bytes`);
      
      // Validate response
      if (!result.success) throw new Error('Registration not successful');
      if (!result.registration_id) throw new Error('No registration_id returned');
      if (!result.fingerprint_hash) throw new Error('No fingerprint_hash returned');
      if (!result.watermarked_audio) throw new Error('No watermarked_audio returned');

      return result;
    });

    registrationId = registerResult.registration_id;
    fingerprintHash = registerResult.fingerprint_hash;
    watermarkedAudio = registerResult.watermarked_audio;

    // Test 2: Verify registered audio
    await runTest('Test 2: Verify registered audio', async () => {
      const result = await client.verify(watermarkedAudio);

      console.log(`   Verified: ${result.verified}`);
      console.log(`   Watermark detected: ${result.watermark.detected}`);
      console.log(`   Watermark valid: ${result.watermark.valid}`);
      console.log(`   Title: ${result.metadata.title}`);
      console.log(`   Artist: ${result.metadata.artist}`);

      // Validate response
      if (!result.verified) throw new Error('Audio not verified');
      if (!result.watermark.detected) throw new Error('Watermark not detected');
      if (!result.watermark.valid) throw new Error('Watermark not valid');
      if (result.metadata.title !== 'SDK Test Track') {
        throw new Error('Metadata mismatch');
      }

      return result;
    });

    // Test 3: Verify original (unwatermarked) audio
    await runTest('Test 3: Verify original audio (no watermark)', async () => {
      const originalAudio = fs.readFileSync(TEST_AUDIO_PATH);
      const result = await client.verify(originalAudio);

      console.log(`   Verified: ${result.verified}`);
      console.log(`   Watermark detected: ${result.watermark.detected}`);
      console.log(`   Fingerprint matched: ${!!result.fingerprint_match}`);

      // Should match by fingerprint but no watermark
      if (!result.verified) throw new Error('Audio not verified');
      if (result.watermark.detected) {
        console.log('   ⚠️  Warning: Watermark detected in original (unexpected)');
      }

      return result;
    });

    // Test 4: Get chain
    await runTest('Test 4: Get custody chain', async () => {
      const result = await client.getChain(fingerprintHash);

      console.log(`   Registrations: ${result.registrations.length}`);
      console.log(`   Transfers: ${result.transfers.length}`);

      // Validate response
      if (result.registrations.length === 0) {
        throw new Error('No registrations found');
      }

      // Check our registration is in the chain
      const found = result.registrations.find(r => r.id === registrationId);
      if (!found) {
        throw new Error('Our registration not found in chain');
      }

      return result;
    });

    // Test 5: Transfer (will fail since we don't have another platform, but tests the SDK method)
    console.log('▶️  Test 5: Attempt transfer (expected to fail - no second platform)');
    try {
      const result = await client.transfer(registrationId, 'nonexistent-platform');
      console.log('   ⚠️  Unexpected: Transfer succeeded');
      transferId = result.transfer_id;
    } catch (error) {
      if (error.code === 'not_found' || error.code === 'invalid_platform') {
        console.log(`✅ Test 5: Transfer correctly rejected (${error.code})`);
      } else {
        throw error;
      }
    }
    console.log();

    // Test 6: Verify error handling
    await runTest('Test 6: Verify error handling (invalid audio)', async () => {
      try {
        await client.verify(Buffer.from('invalid audio data'));
        throw new Error('Should have thrown error for invalid audio');
      } catch (error) {
        if (error.message.includes('Should have thrown')) throw error;
        console.log(`   Correctly threw error: ${error.message.slice(0, 60)}...`);
        return true;
      }
    });

    // All tests passed
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\nSDK is working correctly with ORBIT server at ${API_URL}`);
    
  } catch (error) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ TEST SUITE FAILED');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

