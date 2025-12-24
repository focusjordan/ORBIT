#!/usr/bin/env node

/**
 * ORBIT Integration Test - Full Flow
 * 
 * This is the PRIMARY test for validating ORBIT works correctly.
 * It tests the complete flow in a single run:
 * 
 * 1. Register audio → get fingerprint + watermarked audio
 * 2. Verify watermarked audio → confirm registration found
 * 3. Query chain → confirm our registration appears
 * 
 * Prerequisites:
 * - npm run test:setup (clears data, ensures platform, generates audio)
 * - Server running (npm run dev)
 * - PostgreSQL running
 * 
 * Run: npm test
 *      node tests/integration/full-flow.test.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const cbor = require('cbor');
const FormData = require('form-data');
const OrbitCrypto = require('../../src/engines/crypto');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_PLATFORM_ID = 'test-platform';
const TEST_AUDIO_PATH = path.join(__dirname, '../fixtures/test-audio-short.mp3');

// Load credentials
const PLATFORM_PRIVATE_KEY = process.env.TEST_PLATFORM_PRIVATE_KEY;

if (!PLATFORM_PRIVATE_KEY) {
  console.error('❌ TEST_PLATFORM_PRIVATE_KEY not set');
  console.error('   Run: npm run test:setup');
  process.exit(1);
}

const privateKey = Buffer.from(PLATFORM_PRIVATE_KEY, 'base64');

// Test state - passed between steps
const state = {
  registrationId: null,
  fingerprintHash: null,
  watermarkedAudio: null,
  metadata: null,
};

// Results tracking
const results = {
  passed: 0,
  failed: 0,
  steps: [],
};

/**
 * Log a test step result
 */
function logStep(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
  results.steps.push({ name, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

/**
 * Step 1: Register Audio
 */
async function stepRegister() {
  console.log('\n📝 STEP 1: Register Audio');
  console.log('─'.repeat(50));
  
  // Check test audio exists
  if (!fs.existsSync(TEST_AUDIO_PATH)) {
    logStep('Test audio exists', false, `Not found: ${TEST_AUDIO_PATH}`);
    console.log('   Run: npm run test:setup to generate test audio');
    return false;
  }
  
  const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
  console.log(`   Audio file: ${audioBuffer.length} bytes`);
  
  // Build metadata
  state.metadata = {
    title: 'Integration Test Track',
    artist: 'ORBIT Test Suite',
    duration_ms: 15000,
    isrc: 'TEST00000001',
    primary_genre: 'Electronic',
    owner_id: '00000000-0000-0000-0000-000000000001',
  };
  
  // Sign and encode
  const signature = OrbitCrypto.sign(state.metadata, privateKey);
  const metadataCbor = cbor.encode(state.metadata);
  
  // Build multipart form
  const formData = new FormData();
  formData.append('metadata', metadataCbor, {
    filename: 'metadata.cbor',
    contentType: 'application/cbor',
  });
  formData.append('audio', audioBuffer, {
    filename: 'audio.mp3',
    contentType: 'audio/mpeg',
  });
  
  console.log('   Registering with ORBIT...');
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_URL}/orbit/v1/register`, {
      method: 'POST',
      headers: {
        ...formData.getHeaders(),
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': signature.toString('base64'),
      },
      body: formData.getBuffer(),
      duplex: 'half',
    });
    
    const elapsed = Date.now() - startTime;
    const data = await response.json();
    
    if (response.status === 200 && data.success) {
      state.registrationId = data.registration_id;
      state.fingerprintHash = data.fingerprint_hash;
      state.watermarkedAudio = Buffer.from(data.watermarked_audio, 'base64');
      
      logStep('Register audio', true, `ID: ${state.registrationId}, Time: ${elapsed}ms`);
      console.log(`   Fingerprint: ${state.fingerprintHash.slice(0, 16)}...`);
      console.log(`   Watermarked: ${state.watermarkedAudio.length} bytes`);
      return true;
    } else {
      logStep('Register audio', false, `${data.error}: ${data.message}`);
      return false;
    }
  } catch (error) {
    logStep('Register audio', false, error.message);
    return false;
  }
}

/**
 * Step 2: Verify Watermarked Audio
 */
async function stepVerify() {
  console.log('\n🔍 STEP 2: Verify Watermarked Audio');
  console.log('─'.repeat(50));
  
  if (!state.watermarkedAudio) {
    logStep('Verify audio', false, 'No watermarked audio from Step 1');
    return false;
  }
  
  // Build request
  const requestBody = {
    audio: state.watermarkedAudio.toString('base64'),
  };
  
  const signature = OrbitCrypto.sign(requestBody, privateKey);
  const bodyCbor = cbor.encode(requestBody);
  
  console.log('   Verifying with ORBIT...');
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_URL}/orbit/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': signature.toString('base64'),
      },
      body: bodyCbor,
    });
    
    const elapsed = Date.now() - startTime;
    const data = await response.json();
    
    if (response.status === 200 && data.verified) {
      // Check fingerprint matches
      const fpMatch = data.fingerprint_hash === state.fingerprintHash;
      logStep('Verify returns verified=true', true, `Time: ${elapsed}ms`);
      logStep('Fingerprint matches registration', fpMatch, 
        fpMatch ? 'Exact match' : `Mismatch: ${data.fingerprint_hash}`);
      
      // Check watermark detected
      const wmDetected = data.watermark?.detected === true;
      logStep('Watermark detected', wmDetected,
        wmDetected ? `Confidence: ${data.watermark.confidence || 'N/A'}` : 'Not detected');
      
      // Check metadata matches
      const titleMatch = data.metadata?.title === state.metadata.title;
      logStep('Metadata matches', titleMatch,
        titleMatch ? `Title: "${data.metadata.title}"` : `Expected "${state.metadata.title}", got "${data.metadata?.title}"`);
      
      return fpMatch && wmDetected;
    } else {
      logStep('Verify audio', false, `verified=${data.verified}, error=${data.error}`);
      return false;
    }
  } catch (error) {
    logStep('Verify audio', false, error.message);
    return false;
  }
}

/**
 * Step 3: Query Chain
 */
async function stepChain() {
  console.log('\n🔗 STEP 3: Query Custody Chain');
  console.log('─'.repeat(50));
  
  if (!state.fingerprintHash) {
    logStep('Query chain', false, 'No fingerprint from Step 1');
    return false;
  }
  
  console.log('   Querying chain...');
  
  try {
    const response = await fetch(`${API_URL}/orbit/v1/chain/${state.fingerprintHash}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
      },
    });
    
    const data = await response.json();
    
    if (response.status === 200) {
      // Check our registration is in the chain
      const ourReg = data.registrations?.find(r => r.registration_id === state.registrationId);
      
      logStep('Chain endpoint returns 200', true);
      logStep('Our registration in chain', !!ourReg,
        ourReg ? `Found at position ${data.registrations.indexOf(ourReg) + 1}` : 'Not found');
      logStep('Chain has entries', data.chain?.length > 0,
        `${data.chain?.length || 0} entry/entries`);
      
      console.log(`   Total registrations: ${data.registration_count}`);
      console.log(`   Total transfers: ${data.transfer_count}`);
      
      return !!ourReg;
    } else {
      logStep('Query chain', false, `${response.status}: ${data.error}`);
      return false;
    }
  } catch (error) {
    logStep('Query chain', false, error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('   ORBIT Integration Test - Full Flow');
  console.log('═'.repeat(60));
  console.log(`\nAPI: ${API_URL}`);
  console.log(`Platform: ${TEST_PLATFORM_ID}`);
  console.log(`Audio: ${TEST_AUDIO_PATH}`);
  
  const startTime = Date.now();
  
  // Run steps in sequence
  const step1 = await stepRegister();
  const step2 = step1 ? await stepVerify() : false;
  const step3 = step1 ? await stepChain() : false;
  
  const totalTime = Date.now() - startTime;
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('   TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log('');
  
  if (results.failed === 0) {
    console.log('🎉 All tests passed! ORBIT is working correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check output above.\n');
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('\n💥 Test crashed:', error);
  process.exit(1);
});




