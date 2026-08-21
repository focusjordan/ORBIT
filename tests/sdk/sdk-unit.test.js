/**
 * ORBIT SDK - Offline Unit Tests
 * Tests OrbitClient constructor, Ed25519 signing, Pre-Hash protocol,
 * header generation, and input validation without requiring a running server.
 */

const nacl = require('tweetnacl');
const cbor = require('cbor');
const { blake3 } = require('@noble/hashes/blake3.js');
const { OrbitClient } = require('../../sdk/index.js');

async function runTests() {
  console.log('🧪 Running ORBIT SDK Unit Tests\n');
  
  // Generate a valid test keypair
  const keypair = nacl.sign.keyPair();
  const validPrivateKey = Buffer.from(keypair.secretKey);
  const validPublicKey = Buffer.from(keypair.publicKey);
  
  // Test 1: Constructor Validation
  console.log('Test 1: Constructor Validation');
  
  try {
    new OrbitClient({});
    console.assert(false, 'Should throw if apiUrl is missing');
  } catch (err) {
    console.assert(err.message.includes('apiUrl is required'), 'Correct error for missing apiUrl');
  }
  
  try {
    new OrbitClient({ apiUrl: 'http://localhost:4000' });
    console.assert(false, 'Should throw if platformId is missing');
  } catch (err) {
    console.assert(err.message.includes('platformId is required'), 'Correct error for missing platformId');
  }
  
  try {
    new OrbitClient({ apiUrl: 'http://localhost:4000', platformId: 'test-platform' });
    console.assert(false, 'Should throw if privateKey is missing');
  } catch (err) {
    console.assert(err.message.includes('privateKey is required'), 'Correct error for missing privateKey');
  }
  
  try {
    new OrbitClient({ apiUrl: 'http://localhost:4000', platformId: 'test-platform', privateKey: 'not-a-buffer' });
    console.assert(false, 'Should throw if privateKey is not a Buffer');
  } catch (err) {
    console.assert(err.message.includes('privateKey must be a Buffer'), 'Correct error for non-buffer privateKey');
  }
  
  try {
    new OrbitClient({ apiUrl: 'http://localhost:4000', platformId: 'test-platform', privateKey: Buffer.alloc(32) });
    console.assert(false, 'Should throw if privateKey length != 64');
  } catch (err) {
    console.assert(err.message.includes('must be 64 bytes'), 'Correct error for wrong privateKey length');
  }
  
  const client = new OrbitClient({
    apiUrl: 'http://localhost:4000/',
    platformId: 'test-platform',
    privateKey: validPrivateKey,
    apiKey: 'orbit_live_testkey123'
  });
  
  console.assert(client.apiUrl === 'http://localhost:4000', 'Trailing slash stripped');
  console.assert(client.platformId === 'test-platform', 'Platform ID assigned');
  console.assert(client.apiKey === 'orbit_live_testkey123', 'API key assigned');
  console.log('   ✅ Passed\n');
  
  // Test 2: Ed25519 Signing on Raw Buffer
  console.log('Test 2: Ed25519 Signing on Raw Buffer');
  const rawData = Buffer.from('hello orbit protocol');
  const signature = client._sign(rawData);
  
  console.assert(Buffer.isBuffer(signature), 'Signature is a Buffer');
  console.assert(signature.length === 64, 'Signature is 64 bytes');
  
  const verifiedRaw = nacl.sign.detached.verify(
    new Uint8Array(rawData),
    new Uint8Array(signature),
    new Uint8Array(validPublicKey)
  );
  console.assert(verifiedRaw === true, 'Signature verified with Ed25519 public key');
  console.log('   ✅ Passed\n');
  
  // Test 3: Ed25519 Signing on Structured Object & Pre-Hash Protocol
  console.log('Test 3: Object Signing & Pre-Hash Protocol');
  const testAudio = Buffer.from('fake-audio-sample-data-for-testing');
  const payload = {
    platform: 'test-platform',
    title: 'Test Song',
    audio: testAudio,
    signature: 'should-be-ignored-during-signing'
  };
  
  const objectSignature = client._sign(payload);
  console.assert(Buffer.isBuffer(objectSignature), 'Object signature is a Buffer');
  console.assert(objectSignature.length === 64, 'Object signature is 64 bytes');
  
  // Verify what was signed: { platform, title, audio_hash }
  const expectedAudioHash = Buffer.from(blake3(testAudio));
  const expectedUnsigned = {
    platform: 'test-platform',
    title: 'Test Song',
    audio_hash: expectedAudioHash
  };
  const expectedCbor = cbor.encode(expectedUnsigned);
  
  const verifiedObj = nacl.sign.detached.verify(
    new Uint8Array(expectedCbor),
    new Uint8Array(objectSignature),
    new Uint8Array(validPublicKey)
  );
  console.assert(verifiedObj === true, 'Pre-hash object signature matches expected CBOR payload');
  console.log('   ✅ Passed\n');

  // Test 4: Base64 Audio Pre-Hash Protocol
  console.log('Test 4: Base64 Audio Pre-Hash Signing');
  const base64Audio = testAudio.toString('base64');
  const base64Payload = {
    platform: 'test-platform',
    audio: base64Audio
  };
  const b64Signature = client._sign(base64Payload);
  const expectedB64Unsigned = {
    platform: 'test-platform',
    audio_hash: expectedAudioHash
  };
  const verifiedB64 = nacl.sign.detached.verify(
    new Uint8Array(cbor.encode(expectedB64Unsigned)),
    new Uint8Array(b64Signature),
    new Uint8Array(validPublicKey)
  );
  console.assert(verifiedB64 === true, 'Base64 audio pre-hash signature verified');
  console.log('   ✅ Passed\n');

  // Test 5: Client Input Validation
  console.log('Test 5: Method Input Validation');
  
  await assertThrowsAsync(async () => {
    await client.similar('not-a-buffer');
  }, 'audioBuffer must be a Buffer');

  await assertThrowsAsync(async () => {
    await client.analyze('not-a-buffer');
  }, 'audioBuffer must be a Buffer');

  await assertThrowsAsync(async () => {
    await client.verify('not-a-buffer');
  }, 'audioBuffer must be a Buffer');

  await assertThrowsAsync(async () => {
    await client.register('not-a-buffer', {}, 'owner-1');
  }, 'audioBuffer must be a Buffer');

  await assertThrowsAsync(async () => {
    await client.register(Buffer.from('audio'), null, 'owner-1');
  }, 'metadata must be an object');

  await assertThrowsAsync(async () => {
    await client.register(Buffer.from('audio'), {}, 'owner-1');
  }, 'metadata.title is required');

  await assertThrowsAsync(async () => {
    await client.register(Buffer.from('audio'), { title: 'Song' }, 'owner-1');
  }, 'metadata.artist is required');

  await assertThrowsAsync(async () => {
    await client.register(Buffer.from('audio'), { title: 'Song', artist: 'Artist' }, null);
  }, 'ownerId is required');

  await assertThrowsAsync(async () => {
    await client.getChain('invalid-hex');
  }, 'fingerprintHash must be 64 hexadecimal characters');

  await assertThrowsAsync(async () => {
    await client.getChain(Buffer.alloc(16));
  }, 'fingerprintHash must be 32 bytes');

  console.log('   ✅ Passed\n');

  // Test 6: Mocked Client Requests & Response Parsing
  console.log('Test 6: Mocked Client Requests & Response Parsing');
  const originalFetch = global.fetch;

  try {
    // 6a: CBOR Response handling
    global.fetch = async (_url, _opts) => {
      const mockResult = { success: true, verified: true, origin_id: 'orig-123', registrations: [], transfers: [] };
      const encoded = cbor.encode(mockResult);
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/cbor']]),
        arrayBuffer: async () => encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
      };
    };

    const verifyRes = await client.verify(testAudio);
    console.assert(verifyRes.verified === true, 'CBOR response parsed');

    const similarRes = await client.similar(testAudio, { threshold: 0.8, limit: 5 });
    console.assert(similarRes.success === true, 'similar request parsed');

    const analyzeRes = await client.analyze(testAudio, { include: ['bpm', 'key'] });
    console.assert(analyzeRes.success === true, 'analyze request parsed');

    const hexHash = Buffer.alloc(32).fill(1).toString('hex');
    const chainRes = await client.getChain(hexHash);
    console.assert(chainRes.success === true, 'getChain hex request parsed');

    const chainBufRes = await client.getChain(Buffer.alloc(32).fill(1));
    console.assert(chainBufRes.success === true, 'getChain buffer request parsed');

    const listRegRes = await client.listRegistrations({ limit: 10 });
    console.assert(listRegRes.success === true, 'listRegistrations parsed');

    const pendingRes = await client.listPendingTransfers();
    console.assert(pendingRes.success === true, 'listPendingTransfers parsed');

    const rotateKeyRes = await client.rotateApiKey();
    console.assert(rotateKeyRes.success === true, 'rotateApiKey parsed');

    const rotatePairRes = await client.rotateKeypair();
    console.assert(rotatePairRes.success === true, 'rotateKeypair parsed');

    // 6b: Multipart Register Mock
    global.fetch = async (_url, _opts) => {
      const mockResult = { success: true, registration_id: 42, registered_at: new Date().toISOString() };
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockResult
      };
    };

    const regRes = await client.register(testAudio, { title: 'Song', artist: 'Artist' }, 'owner-uuid');
    console.assert(regRes.registration_id === 42, 'Register multipart request parsed');

    // 6c: Static Platform Registration
    const platformRes = await OrbitClient.registerPlatform('http://localhost:4000', 'new-plat', 'New Platform', 'pro');
    console.assert(platformRes.registration_id === 42, 'Platform registration parsed');

    // 6d: HTTP Error handling
    global.fetch = async () => ({
      ok: false,
      status: 401,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ error: 'unauthorized', message: 'Invalid API key' })
    });

    await assertThrowsAsync(async () => {
      await client.verify(testAudio);
    }, 'Invalid API key');

    // 6e: Fallback string error response
    global.fetch = async () => ({
      ok: false,
      status: 502,
      headers: new Map([['content-type', 'text/plain']]),
      text: async () => 'Bad Gateway'
    });

    await assertThrowsAsync(async () => {
      await client.verify(testAudio);
    }, 'Unexpected response format: Bad Gateway');

    console.log('   ✅ Passed\n');
  } finally {
    global.fetch = originalFetch;
  }
  
  console.log('🎉 All ORBIT SDK Unit Tests passed!\n');
}

async function assertThrowsAsync(fn, expectedMsg) {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    if (expectedMsg) {
      console.assert(err.message.includes(expectedMsg), `Expected error to contain "${expectedMsg}", got "${err.message}"`);
    }
  }
  console.assert(threw, `Expected function to throw with "${expectedMsg}"`);
}

runTests().catch(err => {
  console.error('❌ SDK Unit Test failed:', err);
  process.exit(1);
});
