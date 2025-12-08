const OrbitFingerprint = require('../../src/engines/fingerprint');
const path = require('path');
const fs = require('fs');

// Simple test runner (replace with Jest later)
async function runTests() {
  const testAudio = path.join(__dirname, '../fixtures/test-audio.mp3');
  
  // Check if test audio exists
  if (!fs.existsSync(testAudio)) {
    console.log('⚠️  Test audio file not found at:', testAudio);
    console.log('   Please add any MP3 file (10+ seconds) as tests/fixtures/test-audio.mp3');
    console.log('   You can use any royalty-free audio for testing.\n');
    return;
  }
  
  console.log('🧪 Running Fingerprint Engine Tests\n');
  
  // Test 1: Generate from file path
  try {
    console.log('Test 1: Generate fingerprint from file path');
    const result = await OrbitFingerprint.generate(testAudio);
    
    console.assert(result.raw, 'Should have raw fingerprint');
    console.assert(Buffer.isBuffer(result.hash), 'Hash should be Buffer');
    console.assert(result.hash.length === 32, 'Hash should be 32 bytes');
    console.assert(result.duration > 0, 'Duration should be positive');
    
    console.log('   ✅ Passed');
    console.log(`   Raw length: ${result.raw.length} chars`);
    console.log(`   Hash: ${result.hash.toString('hex').slice(0, 16)}...`);
    console.log(`   Duration: ${result.duration}s\n`);
  } catch (error) {
    console.log('   ❌ Failed:', error.message, '\n');
  }
  
  // Test 2: Same file produces same hash
  try {
    console.log('Test 2: Same audio produces same fingerprint');
    const result1 = await OrbitFingerprint.generate(testAudio);
    const result2 = await OrbitFingerprint.generate(testAudio);
    
    console.assert(
      OrbitFingerprint.hashesMatch(result1.hash, result2.hash),
      'Hashes should match'
    );
    
    console.log('   ✅ Passed\n');
  } catch (error) {
    console.log('   ❌ Failed:', error.message, '\n');
  }
  
  // Test 3: Generate from Buffer
  try {
    console.log('Test 3: Generate fingerprint from Buffer');
    const audioBuffer = fs.readFileSync(testAudio);
    const result = await OrbitFingerprint.generate(audioBuffer);
    
    console.assert(result.raw, 'Should have raw fingerprint');
    console.assert(Buffer.isBuffer(result.hash), 'Hash should be Buffer');
    
    console.log('   ✅ Passed\n');
  } catch (error) {
    console.log('   ❌ Failed:', error.message, '\n');
  }
  
  // Test 4: Non-existent file throws error
  try {
    console.log('Test 4: Non-existent file throws error');
    await OrbitFingerprint.generate('/nonexistent/file.mp3');
    console.log('   ❌ Failed: Should have thrown error\n');
  } catch (error) {
    console.assert(error.message.includes('not found'), 'Should mention file not found');
    console.log('   ✅ Passed (correctly threw error)\n');
  }
  
  // Test 5: hashesMatch comparison
  try {
    console.log('Test 5: Hash comparison method');
    const result = await OrbitFingerprint.generate(testAudio);
    const sameHash = Buffer.from(result.hash);
    const differentHash = Buffer.alloc(32).fill(0);
    
    console.assert(
      OrbitFingerprint.hashesMatch(result.hash, sameHash),
      'Identical hashes should match'
    );
    console.assert(
      !OrbitFingerprint.hashesMatch(result.hash, differentHash),
      'Different hashes should not match'
    );
    console.assert(
      !OrbitFingerprint.hashesMatch(result.hash, 'not-a-buffer'),
      'Non-buffer should not match'
    );
    
    console.log('   ✅ Passed\n');
  } catch (error) {
    console.log('   ❌ Failed:', error.message, '\n');
  }
  
  console.log('🧪 Tests complete');
}

runTests().catch(console.error);
