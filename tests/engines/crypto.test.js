const OrbitCrypto = require('../../src/engines/crypto');

function runTests() {
  console.log('🧪 Running Crypto Engine Tests\n');
  
  // Test 1: Generate keypair
  console.log('Test 1: Generate keypair');
  const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
  console.assert(publicKey.length === 32, 'Public key should be 32 bytes');
  console.assert(privateKey.length === 64, 'Private key should be 64 bytes');
  console.log('   ✅ Keypair generated\n');
  
  // Test 2: Sign and verify object
  console.log('Test 2: Sign and verify object');
  const data = { title: 'Test', artist: 'Artist', timestamp: Date.now() };
  const signature = OrbitCrypto.sign(data, privateKey);
  console.assert(signature.length === 64, 'Signature should be 64 bytes');
  
  const isValid = OrbitCrypto.verify(data, signature, publicKey);
  console.assert(isValid, 'Signature should be valid');
  console.log('   ✅ Signature verified\n');
  
  // Test 3: Tampered data fails verification
  console.log('Test 3: Tampered data fails verification');
  const tamperedData = { ...data, title: 'Tampered' };
  const isInvalid = OrbitCrypto.verify(tamperedData, signature, publicKey);
  console.assert(!isInvalid, 'Tampered signature should fail');
  console.log('   ✅ Tampered data correctly rejected\n');
  
  // Test 4: CBOR encode/decode
  console.log('Test 4: CBOR encode/decode');
  const original = { 
    title: 'Test', 
    binary: Buffer.from([1, 2, 3]),
    number: 12345 
  };
  const encoded = OrbitCrypto.encode(original);
  console.assert(Buffer.isBuffer(encoded), 'Encoded should be Buffer');
  
  const decoded = OrbitCrypto.decode(encoded);
  console.assert(decoded.title === original.title, 'Title should match');
  console.assert(decoded.number === original.number, 'Number should match');
  console.log(`   ✅ CBOR round-trip successful (${encoded.length} bytes)\n`);
  
  // Test 5: Hash function
  console.log('Test 5: SHA-256 hash');
  const hash = OrbitCrypto.hash('test data');
  console.assert(hash.length === 32, 'Hash should be 32 bytes');
  
  const hash2 = OrbitCrypto.hash('test data');
  console.assert(hash.equals(hash2), 'Same input should produce same hash');
  console.log('   ✅ Hash function working\n');
  
  // Test 6: API key generation
  console.log('Test 6: API key generation');
  const apiKey = OrbitCrypto.generateApiKey();
  console.assert(typeof apiKey === 'string', 'API key should be string');
  console.assert(apiKey.length > 20, 'API key should be reasonably long');
  
  const hashedKey = OrbitCrypto.hashApiKey(apiKey);
  console.assert(hashedKey.length === 32, 'Hashed API key should be 32 bytes');
  console.log('   ✅ API key generation working\n');
  
  // Test 7: Entry hash chain
  console.log('Test 7: Entry hash chain');
  const entry1 = {
    fingerprint_hash: OrbitCrypto.randomBytes(32),
    origin_platform: 'test',
    origin_timestamp: new Date().toISOString(),
    payload_cbor: OrbitCrypto.encode({ test: 1 })
  };
  
  const hash1 = OrbitCrypto.createEntryHash(entry1, null);
  console.assert(hash1.length === 32, 'Entry hash should be 32 bytes');
  
  const entry2 = { ...entry1, payload_cbor: OrbitCrypto.encode({ test: 2 }) };
  const hash2Chain = OrbitCrypto.createEntryHash(entry2, hash1);
  console.assert(!hash1.equals(hash2Chain), 'Different entries should have different hashes');
  console.log('   ✅ Entry hash chain working\n');
  
  // Test 8: Sign Buffer directly
  console.log('Test 8: Sign and verify Buffer directly');
  const bufferData = Buffer.from('test data');
  const bufferSignature = OrbitCrypto.sign(bufferData, privateKey);
  const bufferValid = OrbitCrypto.verify(bufferData, bufferSignature, publicKey);
  console.assert(bufferValid, 'Buffer signature should be valid');
  console.log('   ✅ Buffer signing working\n');
  
  // Test 9: Random bytes generation
  console.log('Test 9: Random bytes generation');
  const random1 = OrbitCrypto.randomBytes(16);
  const random2 = OrbitCrypto.randomBytes(16);
  console.assert(random1.length === 16, 'Should generate 16 bytes');
  console.assert(!random1.equals(random2), 'Random bytes should be different');
  console.log('   ✅ Random bytes generation working\n');
  
  // Test 10: Edge cases - null/undefined handling
  console.log('Test 10: Edge cases - null/undefined handling');
  try {
    OrbitCrypto.sign(null, privateKey);
    console.assert(false, 'Should throw error for null data');
  } catch (err) {
    console.assert(err.message === 'Data must be Buffer or Object', 'Should have correct error message');
  }
  
  try {
    OrbitCrypto.sign(undefined, privateKey);
    console.assert(false, 'Should throw error for undefined data');
  } catch (err) {
    console.assert(err.message === 'Data must be Buffer or Object', 'Should have correct error message');
  }
  
  try {
    OrbitCrypto.sign('string', privateKey);
    console.assert(false, 'Should throw error for string data');
  } catch (err) {
    console.assert(err.message === 'Data must be Buffer or Object', 'Should have correct error message');
  }
  console.log('   ✅ Edge cases handled correctly\n');
  
  console.log('🧪 All crypto tests passed!');
}

runTests();
