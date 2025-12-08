/**
 * ORBIT Fingerprint Database Integration Tests
 * 
 * Tests the full workflow: generate → store → lookup → cleanup
 * Uses real PostgreSQL database with test platform
 */

require('dotenv').config();
const OrbitFingerprint = require('../../src/engines/fingerprint');
const queries = require('../../src/ledger/queries');
const { pool } = require('../../src/config/database');
const path = require('path');
const crypto = require('crypto');

async function runTests() {
  console.log('🧪 Running Fingerprint Database Integration Tests\n');
  
  const testAudio = path.join(__dirname, '../fixtures/test-audio.mp3');
  let registrationId = null;
  let registration2Id = null;
  
  try {
    // Setup: Ensure test platform exists
    console.log('Setup: Creating test platform...');
    await queries.ensureTestPlatform();
    console.log('   ✅ Test platform ready\n');
    
    // Test 1: Generate fingerprint
    console.log('Test 1: Generate fingerprint for database test');
    const fp = await OrbitFingerprint.generate(testAudio);
    console.assert(fp.hash, 'Should have fingerprint hash');
    console.assert(fp.hash.length === 32, 'Hash should be 32 bytes');
    console.log(`   Hash: ${fp.hash.toString('hex').slice(0, 16)}...`);
    console.log(`   Duration: ${fp.duration}s`);
    console.log('   ✅ Generated fingerprint\n');
    
    // Test 2: Check if exists (should not)
    console.log('Test 2: Fingerprint should not exist yet');
    const existsBefore = await OrbitFingerprint.exists(fp.hash, queries);
    console.assert(!existsBefore, 'Should not exist before insert');
    console.log('   ✅ Confirmed not in database\n');
    
    // Test 3: Insert registration
    console.log('Test 3: Insert test registration');
    const registration = await queries.insertRegistration({
      fingerprint_hash: fp.hash,
      fingerprint_raw: fp.raw,
      watermark_hash: crypto.randomBytes(16),
      title: 'Test Track',
      artist: 'Test Artist',
      duration_ms: Math.floor(fp.duration * 1000),
      format: 'mp3',
      owner_id: '550e8400-e29b-41d4-a716-446655440000',
      origin_platform: 'test-platform',
      origin_timestamp: new Date(),
      origin_signature: crypto.randomBytes(64),
      payload_cbor: Buffer.from('test'),
      entry_hash: crypto.randomBytes(32)
    });
    
    registrationId = registration.id;
    console.assert(registrationId, 'Should have registration ID');
    console.log(`   ✅ Inserted with ID: ${registrationId}`);
    console.log(`   Created at: ${registration.created_at.toISOString()}\n`);
    
    // Test 4: Check if exists (should now)
    console.log('Test 4: Fingerprint should exist now');
    const existsAfter = await OrbitFingerprint.exists(fp.hash, queries);
    console.assert(existsAfter, 'Should exist after insert');
    console.log('   ✅ Confirmed in database\n');
    
    // Test 5: Find matches
    console.log('Test 5: Find matching registrations');
    const matches = await OrbitFingerprint.findMatches(fp.hash, queries);
    console.assert(matches.length > 0, 'Should find matches');
    console.assert(matches[0].title === 'Test Track', 'Should match title');
    console.assert(matches[0].artist === 'Test Artist', 'Should match artist');
    console.assert(matches[0].origin_platform === 'test-platform', 'Should match platform');
    console.log(`   ✅ Found ${matches.length} match(es)`);
    console.log(`   Title: "${matches[0].title}"`);
    console.log(`   Artist: "${matches[0].artist}"`);
    console.log(`   Platform: ${matches[0].origin_platform}\n`);
    
    // Test 6: Get registration by ID
    console.log('Test 6: Get registration by ID');
    const retrieved = await queries.getRegistration(registrationId);
    console.assert(retrieved, 'Should retrieve registration');
    console.assert(retrieved.id === registrationId, 'IDs should match');
    console.assert(retrieved.title === 'Test Track', 'Title should match');
    console.assert(Buffer.isBuffer(retrieved.fingerprint_hash), 'Hash should be Buffer');
    console.log('   ✅ Retrieved complete registration\n');
    
    // Test 7: Duplicate insert (same hash, same platform should fail)
    console.log('Test 7: Duplicate insert should fail (unique constraint)');
    try {
      await queries.insertRegistration({
        fingerprint_hash: fp.hash,
        fingerprint_raw: fp.raw,
        watermark_hash: crypto.randomBytes(16),
        title: 'Duplicate Track',
        artist: 'Duplicate Artist',
        duration_ms: Math.floor(fp.duration * 1000),
        format: 'mp3',
        owner_id: '550e8400-e29b-41d4-a716-446655440001',
        origin_platform: 'test-platform', // Same platform
        origin_timestamp: new Date(),
        origin_signature: crypto.randomBytes(64),
        payload_cbor: Buffer.from('test'),
        entry_hash: crypto.randomBytes(32)
      });
      console.log('   ❌ Should have thrown unique constraint error\n');
    } catch (error) {
      console.assert(
        error.message.includes('unique') || error.code === '23505',
        'Should be unique constraint violation'
      );
      console.log('   ✅ Correctly rejected duplicate (same hash + platform)\n');
    }
    
    // Test 8: Different platform with same hash (should succeed)
    console.log('Test 8: Same hash on different platform should succeed');
    
    // Create second test platform
    await pool.query(
      `INSERT INTO orbit_platforms (id, name, public_key, api_key_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      ['test-platform-2', 'Test Platform 2', Buffer.alloc(32).fill(3), Buffer.alloc(32).fill(4)]
    );
    
    const registration2 = await queries.insertRegistration({
      fingerprint_hash: fp.hash,
      fingerprint_raw: fp.raw,
      watermark_hash: crypto.randomBytes(16),
      title: 'Same Track',
      artist: 'Same Artist',
      duration_ms: Math.floor(fp.duration * 1000),
      format: 'mp3',
      owner_id: '550e8400-e29b-41d4-a716-446655440002',
      origin_platform: 'test-platform-2', // Different platform
      origin_timestamp: new Date(),
      origin_signature: crypto.randomBytes(64),
      payload_cbor: Buffer.from('test'),
      entry_hash: crypto.randomBytes(32)
    });
    
    registration2Id = registration2.id;
    console.log(`   ✅ Inserted on different platform (ID: ${registration2Id})`);
    
    // Now should find 2 matches
    const multiMatches = await OrbitFingerprint.findMatches(fp.hash, queries);
    console.assert(multiMatches.length === 2, 'Should find 2 matches');
    console.log(`   ✅ Found ${multiMatches.length} registrations with same hash\n`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup: Delete test registrations
    if (registration2Id) {
      await queries.deleteRegistration(registration2Id);
      console.log('🧹 Cleaned up second registration');
    }
    if (registrationId) {
      await queries.deleteRegistration(registrationId);
      console.log('🧹 Cleaned up test registration\n');
    }
    
    // Close pool
    await pool.end();
    console.log('🧪 Database tests complete');
  }
}

runTests();
