const assert = require('assert');
const watermark = require('./src/index.js');

console.log('Testing @ohnrshyp/watermark...');

// Assert exports exist
assert.ok(watermark.embed, 'embed function should be exported');
assert.ok(watermark.extract, 'extract function should be exported');
assert.ok(watermark.checkPythonEnvironment, 'checkPythonEnvironment function should be exported');
assert.ok(watermark.hashToMessage, 'hashToMessage function should be exported');
assert.ok(watermark.messageToHash, 'messageToHash function should be exported');
assert.ok(watermark.hashMatches, 'hashMatches function should be exported');
assert.ok(watermark.config, 'config object should be exported');

// Test message translation functions
const dummyHash = Buffer.alloc(32, 1); // 32 bytes of 0x01
const message = watermark.hashToMessage(dummyHash);
assert.strictEqual(message.length, watermark.config.messageBytes, 'message length should match config');
assert.deepStrictEqual(message, [1, 1, 1, 1, 1]);

const backToHash = watermark.messageToHash(message);
assert.ok(backToHash instanceof Buffer, 'converted back message should be a Buffer');
assert.strictEqual(backToHash.length, watermark.config.messageBytes);
assert.deepStrictEqual(backToHash, dummyHash.slice(0, watermark.config.messageBytes));

assert.strictEqual(watermark.hashMatches(backToHash, dummyHash), true, 'hashes should match');

console.log('All @ohnrshyp/watermark sanity checks passed!');
