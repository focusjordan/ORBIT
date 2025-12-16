/**
 * ORBIT Authentication Middleware Tests
 * 
 * Tests the platform authentication middleware.
 * 
 * Prerequisites:
 * 1. PostgreSQL running (docker-compose up -d)
 * 2. Migrations run (npm run migrate)
 * 3. Test platform seeded (node scripts/seed-platform.js)
 */

require('dotenv').config();

const http = require('http');
const OrbitCrypto = require('../../src/engines/crypto');
const { pool } = require('../../src/config/database');
const queries = require('../../src/ledger/queries');

// Store test platform credentials
let testPlatform = null;

// Helper to make HTTP requests
function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function setupTestPlatform() {
  console.log('🔧 Setting up test platform...');
  
  // Generate keypair for tests
  const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
  const apiKey = OrbitCrypto.generateApiKey();
  const apiKeyHash = OrbitCrypto.hashApiKey(apiKey);
  
  // Insert into database
  await queries.insertPlatform({
    id: 'auth-test-platform',
    name: 'Auth Test Platform',
    public_key: publicKey,
    api_key_hash: apiKeyHash,
    tier: 'basic',
  });
  
  testPlatform = {
    id: 'auth-test-platform',
    publicKey,
    privateKey,
    apiKey,
  };
  
  console.log('   ✅ Test platform created\n');
}

async function cleanupTestPlatform() {
  console.log('🧹 Cleaning up test platform...');
  await pool.query('DELETE FROM orbit_platforms WHERE id = $1', ['auth-test-platform']);
  console.log('   ✅ Cleaned up\n');
}

async function runTests() {
  console.log('🧪 Running Authentication Middleware Tests\n');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const PORT = process.env.PORT || 4000;
  const BASE_URL = `http://localhost:${PORT}`;
  
  try {
    // Check if server is running
    console.log('Checking if ORBIT server is running...');
    try {
      await makeRequest({ hostname: 'localhost', port: PORT, path: '/health', method: 'GET' });
      console.log('   ✅ Server is running\n');
    } catch (err) {
      console.error('   ❌ Server not running. Start it with: npm run dev');
      process.exit(1);
    }
    
    // Setup
    await setupTestPlatform();
    
    // Test 1: Request without headers
    console.log('Test 1: Request without auth headers');
    const res1 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { test: 'data' });
    
    console.assert(res1.status === 401, `Expected 401, got ${res1.status}`);
    console.assert(res1.body.error === 'missing_platform', `Expected missing_platform, got ${res1.body.error}`);
    console.log('   ✅ Correctly rejected request without headers\n');
    
    // Test 2: Request with platform but no signature
    console.log('Test 2: Request with platform but no signature');
    const res2 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': testPlatform.id,
      },
    }, { test: 'data' });
    
    console.assert(res2.status === 401, `Expected 401, got ${res2.status}`);
    console.assert(res2.body.error === 'missing_signature', `Expected missing_signature, got ${res2.body.error}`);
    console.log('   ✅ Correctly rejected request without signature\n');
    
    // Test 3: Request with unknown platform
    console.log('Test 3: Request with unknown platform');
    const fakeSignature = Buffer.alloc(64).fill(0).toString('base64');
    const res3 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': 'unknown-platform',
        'X-ORBIT-Signature': fakeSignature,
      },
    }, { test: 'data' });
    
    console.assert(res3.status === 401, `Expected 401, got ${res3.status}`);
    console.assert(res3.body.error === 'unknown_platform', `Expected unknown_platform, got ${res3.body.error}`);
    console.log('   ✅ Correctly rejected unknown platform\n');
    
    // Test 4: Request with invalid signature
    console.log('Test 4: Request with invalid signature');
    const res4 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': testPlatform.id,
        'X-ORBIT-Signature': fakeSignature,
      },
    }, { test: 'data' });
    
    console.assert(res4.status === 401, `Expected 401, got ${res4.status}`);
    console.assert(res4.body.error === 'invalid_signature', `Expected invalid_signature, got ${res4.body.error}`);
    console.log('   ✅ Correctly rejected invalid signature\n');
    
    // Test 5: Request with valid signature
    console.log('Test 5: Request with valid signature');
    const requestBody = { test: 'authenticated request', timestamp: Date.now() };
    const signature = OrbitCrypto.sign(requestBody, testPlatform.privateKey);
    
    const res5 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': testPlatform.id,
        'X-ORBIT-Signature': signature.toString('base64'),
      },
    }, requestBody);
    
    console.assert(res5.status === 200, `Expected 200, got ${res5.status}`);
    console.assert(res5.body.authenticated === true, 'Expected authenticated: true');
    console.assert(res5.body.platform.id === testPlatform.id, 'Expected platform ID to match');
    console.log('   ✅ Successfully authenticated request\n');
    
    // Test 6: Request with wrong body (signature mismatch)
    console.log('Test 6: Request with tampered body');
    const res6 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': testPlatform.id,
        'X-ORBIT-Signature': signature.toString('base64'), // reuse old signature
      },
    }, { test: 'different body' }); // but with different body
    
    console.assert(res6.status === 401, `Expected 401, got ${res6.status}`);
    console.assert(res6.body.error === 'invalid_signature', `Expected invalid_signature, got ${res6.body.error}`);
    console.log('   ✅ Correctly rejected tampered body\n');
    
    // Test 7: Protected endpoint without auth
    console.log('Test 7: Protected endpoint (register) without auth');
    const res7 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { audio: 'base64data', metadata: {} });
    
    console.assert(res7.status === 401, `Expected 401, got ${res7.status}`);
    console.log('   ✅ Register endpoint requires auth\n');
    
    // Test 8: Optional auth endpoint (verify) without auth
    console.log('Test 8: Optional auth endpoint (verify) without auth');
    const res8 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/verify',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { audio: 'base64data' });
    
    // Should return 501 (not implemented) not 401 (unauthorized)
    console.assert(res8.status === 501, `Expected 501, got ${res8.status}`);
    console.log('   ✅ Verify endpoint allows anonymous access\n');
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🧪 All authentication tests passed!\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await cleanupTestPlatform();
    await pool.end();
  }
}

runTests();



