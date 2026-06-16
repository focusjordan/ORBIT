/**
 * ORBIT Platform Onboarding & Key Rotation Integration Tests
 * 
 * Verifies the flow for:
 * 1. Platform Registration (POST /orbit/v1/platforms/register)
 * 2. Authenticating with new credentials (POST /orbit/v1/auth-test)
 * 3. API Key Rotation (POST /orbit/v1/platforms/rotate-api-key)
 * 4. Ed25519 Public Key Rotation (POST /orbit/v1/platforms/rotate-keypair)
 */

require('dotenv').config();

const http = require('http');
const OrbitCrypto = require('../../src/engines/crypto');
const { pool } = require('../../src/config/database');

const TEST_PLATFORM_ID = 'onboard-test-platform';
const PORT = process.env.PORT || 4000;

// Helper to make HTTP requests
function makeRequest(options, body = null, isCbor = false) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        if (res.headers['content-type'] && res.headers['content-type'].includes('application/cbor')) {
          try {
            const cbor = require('cbor');
            resolve({ status: res.statusCode, headers: res.headers, body: cbor.decode(buffer) });
          } catch (err) {
            reject(new Error(`Failed to decode CBOR: ${err.message}`));
          }
        } else {
          const text = buffer.toString('utf8');
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: text });
          }
        }
      });
    });
    req.on('error', reject);
    
    if (body) {
      if (isCbor) {
        const cbor = require('cbor');
        req.write(cbor.encode(body));
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function cleanupTestPlatform() {
  console.log('🧹 Cleaning up test platform from database...');
  await pool.query('DELETE FROM orbit_platforms WHERE id = $1', [TEST_PLATFORM_ID]);
  console.log('   ✅ Cleaned up\n');
}

async function runTests() {
  console.log('🧪 Running Platform Onboarding & Key Rotation Integration Tests\n');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // 0. Check if server is running
    console.log('Checking if ORBIT server is running...');
    try {
      await makeRequest({ hostname: 'localhost', port: PORT, path: '/health', method: 'GET' });
      console.log('   ✅ Server is running\n');
    } catch (err) {
      console.error('   ❌ Server not running. Start it with: npm run dev');
      process.exit(1);
    }

    // Ensure database is clean
    await cleanupTestPlatform();

    // 1. Generate keypair for onboarding
    console.log('Step 1: Generating secure Ed25519 keypair for new platform...');
    const keypair1 = OrbitCrypto.generateKeypair();
    const initialPublicKey = keypair1.publicKey;
    const initialPrivateKey = keypair1.privateKey;
    console.log('   Public Key (Base64):', initialPublicKey);
    console.log('   ✅ Keypair generated\n');

    // 2. Onboard new platform via public registration endpoint
    console.log('Step 2: Registering new platform (POST /orbit/v1/platforms/register)...');
    const registerRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/platforms/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      platform_id: TEST_PLATFORM_ID,
      name: 'Onboarding Test Platform Inc.',
      public_key: initialPublicKey
    });

    console.assert(registerRes.status === 200 || registerRes.status === 201, `Expected 200/201, got ${registerRes.status}`);
    console.assert(registerRes.body.success === true, 'Expected success: true');
    console.assert(registerRes.body.platform_id === TEST_PLATFORM_ID, `Expected platform_id: ${TEST_PLATFORM_ID}, got ${registerRes.body.platform_id}`);
    console.assert(!!registerRes.body.api_key, 'Expected api_key to be returned');
    
    const initialApiKey = registerRes.body.api_key;
    console.log('   API Key returned:', initialApiKey);
    console.log('   ✅ Platform onboarding successful\n');

    // 3. Test authenticating with new credentials
    console.log('Step 3: Verifying authentication handshake with new credentials...');
    const authBody1 = { test: 'initial authentication test', timestamp: Date.now() };
    const signature1 = OrbitCrypto.sign(authBody1, initialPrivateKey);

    const authRes1 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': signature1.toString('base64'),
        'X-ORBIT-API-Key': initialApiKey
      }
    }, authBody1);

    console.assert(authRes1.status === 200, `Expected 200, got ${authRes1.status}`);
    console.assert(authRes1.body.authenticated === true, 'Expected authenticated: true');
    console.log('   ✅ Authentication handshake successful\n');

    // 4. Rotate API Key
    console.log('Step 4: Rotating API Key (POST /orbit/v1/platforms/rotate-api-key)...');
    const rotateKeyBody = {};
    const rotateKeySig = OrbitCrypto.sign(rotateKeyBody, initialPrivateKey);

    const rotateKeyRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/platforms/rotate-api-key',
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': rotateKeySig.toString('base64'),
        'X-ORBIT-API-Key': initialApiKey
      }
    }, rotateKeyBody, true);

    console.assert(rotateKeyRes.status === 200, `Expected 200, got ${rotateKeyRes.status}`);
    console.assert(!!rotateKeyRes.body.api_key, 'Expected new api_key in response');
    const rotatedApiKey = rotateKeyRes.body.api_key;
    console.log('   New API Key returned:', rotatedApiKey);
    console.log('   ✅ API Key rotation successful\n');

    // 5. Test auth using new API key
    console.log('Step 5: Testing authentication with rotated API Key...');
    const authBody2 = { test: 'auth after api key rotation', timestamp: Date.now() };
    const signature2 = OrbitCrypto.sign(authBody2, initialPrivateKey);

    const authRes2 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': signature2.toString('base64'),
        'X-ORBIT-API-Key': rotatedApiKey // New key
      }
    }, authBody2);

    console.assert(authRes2.status === 200, `Expected 200, got ${authRes2.status}`);
    console.assert(authRes2.body.authenticated === true, 'Expected authenticated: true');
    console.log('   ✅ Authentication with rotated API Key successful\n');

    // 6. Test auth using OLD API key (should be rejected)
    console.log('Step 6: Confirming old API Key is rejected...');
    const authRes3 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': signature2.toString('base64'),
        'X-ORBIT-API-Key': initialApiKey // Old key
      }
    }, authBody2);

    console.assert(authRes3.status === 401, `Expected 401, got ${authRes3.status}`);
    console.assert(authRes3.body.error === 'invalid_api_key', `Expected invalid_api_key, got ${authRes3.body.error}`);
    console.log('   ✅ Old API Key correctly rejected\n');

    // 7. Rotate Keypair
    console.log('Step 7: Rotating Ed25519 Public Key (POST /orbit/v1/platforms/rotate-keypair)...');
    const keypair2 = OrbitCrypto.generateKeypair();
    const rotatedPublicKey = keypair2.publicKey;
    const rotatedPrivateKey = keypair2.privateKey;
    
    const rotatePubkeyBody = { public_key: rotatedPublicKey };
    const rotatePubkeySig = OrbitCrypto.sign(rotatePubkeyBody, initialPrivateKey); // Sign with OLD private key since public key is not yet rotated

    const rotatePubkeyRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/platforms/rotate-keypair',
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': rotatePubkeySig.toString('base64'),
        'X-ORBIT-API-Key': rotatedApiKey
      }
    }, rotatePubkeyBody, true);

    console.assert(rotatePubkeyRes.status === 200, `Expected 200, got ${rotatePubkeyRes.status}`);
    console.assert(rotatePubkeyRes.body.success === true, 'Expected success: true');
    console.log('   ✅ Public Key rotation successful\n');

    // 8. Test auth using new rotated keypair
    console.log('Step 8: Testing authentication with rotated Keypair...');
    const authBody3 = { test: 'auth after keypair rotation', timestamp: Date.now() };
    const signature3 = OrbitCrypto.sign(authBody3, rotatedPrivateKey); // New private key

    const authRes4 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': signature3.toString('base64'),
        'X-ORBIT-API-Key': rotatedApiKey
      }
    }, authBody3);

    console.assert(authRes4.status === 200, `Expected 200, got ${authRes4.status}`);
    console.assert(authRes4.body.authenticated === true, 'Expected authenticated: true');
    console.log('   ✅ Authentication with rotated Keypair successful\n');

    // 9. Test auth using OLD private key (should be rejected)
    console.log('Step 9: Confirming old private key signature is rejected...');
    const oldSignature3 = OrbitCrypto.sign(authBody3, initialPrivateKey); // Old private key

    const authRes5 = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/orbit/v1/auth-test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ORBIT-Platform': TEST_PLATFORM_ID,
        'X-ORBIT-Signature': oldSignature3.toString('base64'),
        'X-ORBIT-API-Key': rotatedApiKey
      }
    }, authBody3);

    console.assert(authRes5.status === 401, `Expected 401, got ${authRes5.status}`);
    console.assert(authRes5.body.error === 'invalid_signature', `Expected invalid_signature, got ${authRes5.body.error}`);
    console.log('   ✅ Old private key signature correctly rejected\n');

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🧪 All platform onboarding & key rotation tests passed!\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await cleanupTestPlatform();
    await pool.end();
  }
}

runTests();
