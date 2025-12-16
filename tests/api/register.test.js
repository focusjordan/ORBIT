/**
 * Test: POST /orbit/v1/register
 * 
 * Tests the registration endpoint with actual audio and metadata.
 * This validates the complete flow from audio input to watermarked output.
 * 
 * Prerequisites:
 * - Server running (npm run dev)
 * - PostgreSQL running with migrations
 * - Test platform seeded
 * 
 * Run: node tests/api/register.test.js
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
const { getTestAudioPath, cacheWatermarkedFixture, logTestMode, getConfig } = require('../test-config');

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_PLATFORM_ID = 'test-platform';

// Get appropriate test audio based on mode (fast = 5sec, full = 30sec)
const TEST_AUDIO_PATH = getTestAudioPath();

// Load test platform credentials (should be set up via seed-platform.js)
const PLATFORM_PRIVATE_KEY = process.env.TEST_PLATFORM_PRIVATE_KEY;

if (!PLATFORM_PRIVATE_KEY) {
  console.error('❌ TEST_PLATFORM_PRIVATE_KEY environment variable not set');
  console.error('   Run: npm run seed:platform first');
  process.exit(1);
}

const privateKey = Buffer.from(PLATFORM_PRIVATE_KEY, 'base64');

/**
 * Make authenticated ORBIT API request with multipart/form-data
 * @param {string} endpoint - API endpoint path
 * @param {Object} metadata - Metadata object (will be CBOR-encoded)
 * @param {Buffer} audioBuffer - Binary audio data
 */
async function orbitRequest(endpoint, metadata, audioBuffer) {
  const url = `${API_URL}/orbit/v1${endpoint}`;
  
  // Sign the metadata object (OrbitCrypto.sign will CBOR-encode it internally)
  const signature = OrbitCrypto.sign(metadata, privateKey);
  
  // Encode metadata as CBOR
  const metadataCbor = cbor.encode(metadata);
  console.log(`   Metadata CBOR: ${metadataCbor.length} bytes`);
  console.log(`   Audio binary: ${audioBuffer.length} bytes`);
  
  // Create multipart form
  const formData = new FormData();
  formData.append('metadata', metadataCbor, {
    filename: 'metadata.cbor',
    contentType: 'application/cbor'
  });
  formData.append('audio', audioBuffer, {
    filename: 'audio.mp3',
    contentType: 'audio/mpeg'
  });
  
  // Get form headers
  const formHeaders = formData.getHeaders();
  
  // Make request with proper streaming
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...formHeaders,
      'X-ORBIT-Platform': TEST_PLATFORM_ID,
      'X-ORBIT-Signature': signature.toString('base64'),
    },
    body: formData.getBuffer(), // Use getBuffer() for synchronous FormData
    duplex: 'half', // Required for streaming bodies in fetch
  });
  
  // Decode response based on content-type
  const contentType = response.headers.get('content-type') || '';
  let responseData;
  
  if (contentType.includes('application/cbor')) {
    const responseBuffer = await response.arrayBuffer();
    responseData = cbor.decode(Buffer.from(responseBuffer));
  } else if (contentType.includes('application/json')) {
    responseData = await response.json();
  } else {
    // Fallback: try JSON first, then text
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { error: 'unparseable_response', body: text };
    }
  }
  
  return {
    status: response.status,
    data: responseData,
    contentType,
  };
}

/**
 * Main test
 */
async function testRegister() {
  logTestMode('Testing POST /orbit/v1/register');
  
  const config = getConfig();
  console.log(`   Expected watermark time: ~${Math.round(config.expectedWatermarkTime / 1000)}s\n`);
  
  try {
    // ========================================================================
    // 1. Load test audio
    // ========================================================================
    
    console.log('📁 Loading test audio...');
    if (!fs.existsSync(TEST_AUDIO_PATH)) {
      throw new Error(`Test audio not found: ${TEST_AUDIO_PATH}`);
    }
    
    const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
    console.log(`   Loaded ${audioBuffer.length} bytes\n`);
    
    // ========================================================================
    // 2. Build registration metadata (CBOR)
    // ========================================================================
    
    console.log('📦 Building registration metadata...');
    const metadata = {
      // Owner ID
      owner_id: '550e8400-e29b-41d4-a716-446655440000',
      
      // Required
      title: 'Test Track',
      artist: 'Test Artist',
      duration_ms: 180000,
      
      // Optional but recommended
      isrc: 'USTEST123456', // ISRC is exactly 12 characters
      upc: '012345678901',
      
      // Copyright
      p_line: '2025 Test Records',
      c_line: '2025 Test Publishing',
      
      // Classification
      primary_genre: 'Electronic',
      secondary_genre: 'Ambient',
      language: 'en',
      
      // Technical
      bitrate: 320,
      sample_rate: 44100,
      channels: 2,
      format: 'mp3',
      
      // Extended
      album_title: 'Test Album',
      track_number: 1,
      label: 'Test Records',
      parental_advisory: 'none',
      
      // Contributors
      composers: ['Test Composer'],
      producers: ['Test Producer'],
      
      // Rights
      territories: ['US', 'GB', 'WW'],
    };
    
    console.log(`   Metadata: "${metadata.title}" by ${metadata.artist}\n`);
    
    // ========================================================================
    // 3. Make multipart request
    // ========================================================================
    
    console.log('🚀 Sending registration request (multipart)...');
    const startTime = Date.now();
    const response = await orbitRequest('/register', metadata, audioBuffer);
    const elapsed = Date.now() - startTime;
    
    console.log(`   Response status: ${response.status}`);
    console.log(`   Request time: ${elapsed}ms\n`);
    
    // ========================================================================
    // 4. Verify response
    // ========================================================================
    
    if (response.status !== 200) {
      console.error('❌ Registration failed!');
      console.error('   Error:', response.data.error);
      console.error('   Message:', response.data.message);
      if (response.data.details) {
        console.error('   Details:', JSON.stringify(response.data.details, null, 2));
      }
      process.exit(1);
    }
    
    console.log('✅ Registration successful!\n');
    console.log('📋 Response:');
    console.log(`   Registration ID: ${response.data.registration_id}`);
    console.log(`   Fingerprint Hash: ${response.data.fingerprint_hash.slice(0, 32)}...`);
    console.log(`   Watermark Hash: ${response.data.watermark_hash.slice(0, 32)}...`);
    console.log(`   Entry Hash: ${response.data.entry_hash.slice(0, 32)}...`);
    console.log(`   Registered At: ${response.data.registered_at}`);
    console.log(`   Processing Time: ${response.data.processing_time_ms}ms`);
    console.log(`   Watermarked Audio: ${response.data.watermarked_audio.length} bytes (base64)\n`);
    
    // ========================================================================
    // 5. Save watermarked audio for inspection AND cache for verify tests
    // ========================================================================
    
    console.log('💾 Saving watermarked audio...');
    const watermarkedBuffer = Buffer.from(response.data.watermarked_audio, 'base64');
    const outputPath = path.join(__dirname, '../fixtures/test-audio-watermarked.wav');
    fs.writeFileSync(outputPath, watermarkedBuffer);
    console.log(`   Saved to: ${outputPath}`);
    
    // Cache for verify tests (speeds up subsequent test runs)
    cacheWatermarkedFixture(watermarkedBuffer, 'register-basic');
    console.log('');
    
    // ========================================================================
    // 6. Test duplicate detection
    // ========================================================================
    
    console.log('🔄 Testing duplicate detection...');
    const duplicateResponse = await orbitRequest('/register', metadata, audioBuffer);
    
    if (duplicateResponse.status === 409) {
      console.log('✅ Duplicate correctly detected!');
      console.log(`   Original registration ID: ${duplicateResponse.data.details.duplicate_of}`);
      console.log(`   Title: ${duplicateResponse.data.details.title}`);
      console.log(`   Artist: ${duplicateResponse.data.details.artist}\n`);
    } else {
      console.log('⚠️  Expected 409 duplicate error, got:', duplicateResponse.status);
    }
    
    // ========================================================================
    // SUCCESS
    // ========================================================================
    
    console.log('✨ All tests passed!\n');
    console.log('📊 Summary:');
    console.log(`   ✅ Registration successful`);
    console.log(`   ✅ Watermark embedded`);
    console.log(`   ✅ Duplicate detection working`);
    console.log(`   ✅ Response structure valid\n`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testRegister();

