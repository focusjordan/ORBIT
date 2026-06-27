/**
 * Test Script for ORBIT Middleware
 * 
 * This script demonstrates the duplicate check middleware in action.
 * Run this to verify your integration is working correctly.
 * 
 * Prerequisites:
 * 1. ORBIT server running (npm start in ORBIT root)
 * 2. Test platform credentials configured
 * 3. ORBIT SDK installed
 * 
 * Usage:
 *   node test-middleware.js
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { checkDuplicate, verifyAudio, getOrbitClient } = require('./orbit.middleware');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Mock authentication middleware (replace with real auth)
const mockAuth = (req, res, next) => {
  req.user = {
    id: 'test-user-123',
    _id: 'test-user-123',
    artistName: 'Test Artist',
    role: 'artist'
  };
  next();
};

// Mock track creation handler
const mockCreateTrack = async (req, res, next) => {
  // Simulate track creation
  const track = {
    _id: 'track-' + Date.now(),
    title: req.body.title || 'Test Track',
    artist: req.user.id,
    duration: 180000,
    audioUrl: 's3://bucket/key',
    orbit: null  // Will be populated by registerWithOrbit
  };
  
  req.track = track;
  
  res.json({
    success: true,
    message: 'Track uploaded successfully',
    track: track
  });
  
  next();
};

// Test routes
app.post('/api/tracks',
  mockAuth,
  upload.single('audio'),
  checkDuplicate,           // Duplicate check middleware
  mockCreateTrack
);

app.post('/api/orbit/verify',
  mockAuth,
  upload.single('audio'),
  verifyAudio
);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    orbit_configured: !!getOrbitClient()
  });
});

// Start server
const PORT = process.env.TEST_PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`\n[INFO] Test server running on http://localhost:${PORT}\n`);
  
  // Check ORBIT configuration
  const client = getOrbitClient();
  if (!client) {
    console.warn('[WARN] ORBIT not configured. Set these environment variables:');
    console.warn('   ORBIT_API_URL');
    console.warn('   ORBIT_PLATFORM_ID');
    console.warn('   ORBIT_PRIVATE_KEY\n');
  } else {
    console.log('[INFO] ORBIT client configured\n');
  }
  
  runTests();
});

// Automated tests
async function runTests() {
  console.log('[INFO] Running automated tests...\n');
  
  const testAudioPath = path.join(__dirname, '../../tests/fixtures/test-audio.mp3');
  
  if (!fs.existsSync(testAudioPath)) {
    console.warn('[WARN] Test audio not found at:', testAudioPath);
    console.log('   Skipping automated tests\n');
    printManualTests();
    return;
  }
  
  const FormData = require('form-data');
  const axios = require('axios');
  
  // Test 1: First upload (should succeed)
  console.log('Test 1: First upload of new audio');
  try {
    const form1 = new FormData();
    form1.append('audio', fs.createReadStream(testAudioPath));
    form1.append('title', 'Test Track 1');
    
    const response1 = await axios.post(`http://localhost:${PORT}/api/tracks`, form1, {
      headers: form1.getHeaders()
    });
    
    if (response1.status === 200) {
      console.log('   [PASS] First upload succeeded\n');
    }
  } catch (error) {
    console.log('   [WARN] First upload failed:', error.response?.status || error.message);
    console.log('      (Expected if ORBIT not configured or not running)\n');
  }
  
  // Test 2: Second upload (should be rejected as duplicate)
  console.log('Test 2: Second upload of same audio (should be duplicate)');
  try {
    const form2 = new FormData();
    form2.append('audio', fs.createReadStream(testAudioPath));
    form2.append('title', 'Test Track 2 (Duplicate)');
    
    await axios.post(`http://localhost:${PORT}/api/tracks`, form2, {
      headers: form2.getHeaders()
    });
    
    console.log('   [WARN] Second upload succeeded (should have been rejected)');
    console.log('      This means duplicate detection is not working\n');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('   [PASS] Duplicate correctly detected!');
      console.log('   Response:', JSON.stringify(error.response.data, null, 2).substring(0, 200), '...\n');
    } else {
      console.log('   [WARN] Unexpected error:', error.response?.status || error.message, '\n');
    }
  }
  
  // Test 3: Verify endpoint
  console.log('Test 3: Verification endpoint');
  try {
    const form3 = new FormData();
    form3.append('audio', fs.createReadStream(testAudioPath));
    
    const response3 = await axios.post(`http://localhost:${PORT}/api/orbit/verify`, form3, {
      headers: form3.getHeaders()
    });
    
    if (response3.data.success && response3.data.verified) {
      console.log('   [PASS] Verification succeeded');
      console.log('   Audio is registered:', response3.data.provenance.is_registered);
      console.log('   Registration ID:', response3.data.provenance.registration_id, '\n');
    } else {
      console.log('   [INFO] Audio not registered (expected for first run)\n');
    }
  } catch (error) {
    console.log('   [WARN] Verification failed:', error.response?.status || error.message, '\n');
  }
  
  console.log('[INFO] Automated tests complete\n');
  printManualTests();
}

function printManualTests() {
  console.log('[INFO] Manual Testing Commands:\n');
  console.log('1. Upload new audio:');
  console.log(`   curl -X POST http://localhost:${PORT}/api/tracks \\`);
  console.log('     -F "audio=@path/to/audio.mp3" \\');
  console.log('     -F "title=My Track"\n');
  
  console.log('2. Upload same audio again (should get 409):');
  console.log(`   curl -X POST http://localhost:${PORT}/api/tracks \\`);
  console.log('     -F "audio=@path/to/audio.mp3" \\');
  console.log('     -F "title=Duplicate Track"\n');
  
  console.log('3. Verify audio:');
  console.log(`   curl -X POST http://localhost:${PORT}/api/orbit/verify \\`);
  console.log('     -F "audio=@path/to/audio.mp3"\n');
  
  console.log('4. Check health:');
  console.log(`   curl http://localhost:${PORT}/health\n`);
  
  console.log('Press Ctrl+C to stop server');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n[INFO] Shutting down test server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
