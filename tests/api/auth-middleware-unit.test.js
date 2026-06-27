/**
 * Unit tests for Platform Authentication Middleware length guard and safeness.
 */

const assert = require('assert');
const OrbitCrypto = require('../../src/engines/crypto');

// Mock queries before importing the middleware
const queries = require('../../src/ledger/queries');

let mockPlatform = null;

// Override getPlatform to return our mockPlatform
queries.getPlatform = async (id) => {
  if (mockPlatform && mockPlatform.id === id) {
    return mockPlatform;
  }
  return null;
};

// Import the middleware
const { platformAuth } = require('../../src/api/middleware/auth');

// Helper to construct request, response and next function
function createHttpMocks(headers, body = {}) {
  const req = {
    headers: headers,
    body: body,
    get(name) {
      return this.headers[name] || this.headers[name.toLowerCase()];
    }
  };

  const res = {
    statusCode: 200,
    errorResponse: null,
    orbitError(error, message, status) {
      this.statusCode = status;
      this.errorResponse = { error, message };
      return this;
    }
  };

  const next = () => {
    res.nextCalled = true;
  };

  return { req, res, next };
}

async function runTests() {
  console.log('🧪 Running Auth Middleware Unit Tests...');
  
  // Set up a valid keypair and api key
  const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
  const apiKey = OrbitCrypto.generateApiKey();
  const apiKeyHash = OrbitCrypto.hashApiKey(apiKey); // 32-byte Buffer
  
  const defaultHeaders = {
    'X-ORBIT-Platform': 'test-platform-123',
    'X-ORBIT-API-Key': apiKey
  };
  
  const body = { test: 'auth' };
  const signature = OrbitCrypto.sign(body, privateKey).toString('base64');
  defaultHeaders['X-ORBIT-Signature'] = signature;

  // Test Case 1: Happy Path - Valid API key and signature
  {
    mockPlatform = {
      id: 'test-platform-123',
      name: 'Test Platform',
      public_key: publicKey,
      api_key_hash: apiKeyHash,
      tier: 'basic',
      is_active: true
    };
    
    const { req, res, next } = createHttpMocks(defaultHeaders, body);
    await platformAuth(req, res, next);
    
    assert.strictEqual(res.nextCalled, true, 'Next should have been called');
    assert.strictEqual(res.errorResponse, null, 'Should not have error response');
    assert.strictEqual(req.platform.id, 'test-platform-123');
    console.log('   ✅ Test 1 Passed: Valid authentication succeeds');
  }

  // Test Case 2: Malformed API key hash in DB (different length Buffer)
  {
    mockPlatform = {
      id: 'test-platform-123',
      name: 'Test Platform',
      public_key: publicKey,
      api_key_hash: Buffer.from('short-hash'), // 10 bytes instead of 32
      tier: 'basic',
      is_active: true
    };
    
    const { req, res, next } = createHttpMocks(defaultHeaders, body);
    await platformAuth(req, res, next);
    
    assert.strictEqual(res.nextCalled, undefined, 'Next should NOT be called');
    assert.strictEqual(res.statusCode, 401, 'Status code should be 401');
    assert.strictEqual(res.errorResponse.error, 'invalid_api_key', 'Error should be invalid_api_key');
    console.log('   ✅ Test 2 Passed: Shorter hash buffer fails gracefully with 401');
  }

  // Test Case 3: Empty string API key hash in DB
  {
    mockPlatform = {
      id: 'test-platform-123',
      name: 'Test Platform',
      public_key: publicKey,
      api_key_hash: '', // Empty string, wait, line 103 checks if (!platform.api_key_hash) which handles falsy
      tier: 'basic',
      is_active: true
    };
    
    const { req, res, next } = createHttpMocks(defaultHeaders, body);
    await platformAuth(req, res, next);
    
    assert.strictEqual(res.nextCalled, undefined, 'Next should NOT be called');
    assert.strictEqual(res.statusCode, 401, 'Status code should be 401');
    assert.strictEqual(res.errorResponse.error, 'api_key_not_configured', 'Falsy hash handled correctly');
    console.log('   ✅ Test 3 Passed: Falsy string fails gracefully with 401 (api_key_not_configured)');
  }

  // Test Case 4: Non-empty string of different length API key hash in DB
  {
    mockPlatform = {
      id: 'test-platform-123',
      name: 'Test Platform',
      public_key: publicKey,
      api_key_hash: 'not-a-32-byte-hash-or-hex',
      tier: 'basic',
      is_active: true
    };
    
    const { req, res, next } = createHttpMocks(defaultHeaders, body);
    await platformAuth(req, res, next);
    
    assert.strictEqual(res.nextCalled, undefined, 'Next should NOT be called');
    assert.strictEqual(res.statusCode, 401, 'Status code should be 401');
    assert.strictEqual(res.errorResponse.error, 'invalid_api_key', 'String hash of different length fails with 401');
    console.log('   ✅ Test 4 Passed: Non-empty string fails gracefully with 401');
  }

  // Test Case 5: hex string format (64 chars) of matching API key hash in DB
  {
    mockPlatform = {
      id: 'test-platform-123',
      name: 'Test Platform',
      public_key: publicKey,
      api_key_hash: apiKeyHash.toString('hex'), // hex string format
      tier: 'basic',
      is_active: true
    };
    
    const { req, res, next } = createHttpMocks(defaultHeaders, body);
    await platformAuth(req, res, next);
    
    assert.strictEqual(res.nextCalled, true, 'Next should be called for valid hex hash');
    assert.strictEqual(res.errorResponse, null, 'Should not have error response');
    console.log('   ✅ Test 5 Passed: Hex string hash of correct length verified and authenticated successfully');
  }

  // Test Case 6: base64 string format of matching API key hash in DB
  {
    mockPlatform = {
      id: 'test-platform-123',
      name: 'Test Platform',
      public_key: publicKey,
      api_key_hash: apiKeyHash.toString('base64'), // base64 format
      tier: 'basic',
      is_active: true
    };
    
    const { req, res, next } = createHttpMocks(defaultHeaders, body);
    await platformAuth(req, res, next);
    
    assert.strictEqual(res.nextCalled, true, 'Next should be called for valid base64 hash');
    assert.strictEqual(res.errorResponse, null, 'Should not have error response');
    console.log('   ✅ Test 6 Passed: Base64 string hash of correct length verified and authenticated successfully');
  }

  console.log('\n🎉 All unit tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
