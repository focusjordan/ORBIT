const assert = require('assert');
const ledger = require('./src/index.js');

console.log('Testing @ohnrshyp/ledger...');

// Assert exports exist
assert.ok(ledger.crypto, 'crypto module should be exported');
assert.ok(ledger.queries, 'queries object should be exported');
assert.ok(ledger.setPool, 'setPool function should be exported');

// Test crypto sanity checks
const keypair = ledger.crypto.generateKeypair();
assert.ok(keypair.publicKey instanceof Buffer, 'publicKey should be a Buffer');
assert.ok(keypair.privateKey instanceof Buffer, 'privateKey should be a Buffer');
assert.strictEqual(keypair.publicKey.length, 32, 'publicKey should be 32 bytes');
assert.strictEqual(keypair.privateKey.length, 64, 'privateKey should be 64 bytes');

const data = { hello: 'world' };
const signature = ledger.crypto.sign(data, keypair.privateKey);
assert.ok(signature instanceof Buffer, 'signature should be a Buffer');
assert.strictEqual(signature.length, 64, 'signature should be 64 bytes');

const isValid = ledger.crypto.verify(data, signature, keypair.publicKey);
assert.strictEqual(isValid, true, 'signature verification should succeed');

console.log('All @ohnrshyp/ledger sanity checks passed!');
