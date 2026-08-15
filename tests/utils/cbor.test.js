/**
 * Unit Test Suite: Ohnrscript Deterministic CBOR Engine (RFC 8949)
 * 
 * Verifies primitive serialization, binary fidelity, canonical key sorting,
 * and Ed25519 signature round-trip verification.
 */

'use strict';

const cborEngine = require('../../src/utils/cbor');
const cborRef = require('cbor');
const nacl = require('tweetnacl');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

console.log('\n🧪 Ohnrscript Deterministic CBOR Engine Tests');
console.log('==================================================');

// --- Test 1: Primitive integers & floats ---
(() => {
  const values = [0, 1, 23, 24, 255, 256, 65535, 65536, 4294967295, -1, -24, -100, -65536, 3.14159265, -0.005];
  let allPass = true;
  for (const v of values) {
    const enc = cborEngine.encode(v);
    const dec = cborEngine.decode(enc);
    if (typeof v === 'number' && !Number.isInteger(v)) {
      if (Math.abs(dec - v) > 1e-7) allPass = false;
    } else if (dec !== v) {
      allPass = false;
    }
  }
  assert(allPass, 'Primitives: integers, negative numbers, and floats round-trip');
})();

// --- Test 2: Booleans, null, undefined ---
(() => {
  assert(cborEngine.decode(cborEngine.encode(true)) === true, 'Simple: true encodes and decodes');
  assert(cborEngine.decode(cborEngine.encode(false)) === false, 'Simple: false encodes and decodes');
  assert(cborEngine.decode(cborEngine.encode(null)) === null, 'Simple: null encodes and decodes');
  assert(cborEngine.decode(cborEngine.encode(undefined)) === undefined, 'Simple: undefined encodes and decodes');
})();

// --- Test 3: Strings & Unicode ---
(() => {
  const testStrings = ['', 'hello', 'ORBIT Music Provenance', '🎵 🚀 12345!'];
  let allPass = true;
  for (const s of testStrings) {
    const enc = cborEngine.encode(s);
    const dec = cborEngine.decode(enc);
    if (dec !== s) allPass = false;
  }
  assert(allPass, 'Strings: empty strings, ASCII, and UTF-8 multi-byte emojis round-trip');
})();

// --- Test 4: Byte Strings (Buffers) ---
(() => {
  const rawBytes = Buffer.from([0x01, 0x02, 0x03, 0xde, 0xad, 0xbe, 0xef]);
  const enc = cborEngine.encode(rawBytes);
  const dec = cborEngine.decode(enc);
  assert(Buffer.isBuffer(dec), 'Byte Strings: returns Buffer');
  assert(dec.equals(rawBytes), 'Byte Strings: raw bytes preserved identically');
})();

// --- Test 5: Arrays & Nested Structures ---
(() => {
  const arr = [1, 'two', true, [3, 4, [5, 'nested']]];
  const enc = cborEngine.encode(arr);
  const dec = cborEngine.decode(enc);
  assert(Array.isArray(dec) && dec[1] === 'two' && dec[3][2][1] === 'nested', 'Arrays: nested mixed arrays round-trip');
})();

// --- Test 6: Deterministic Canonical Map Sorting (RFC 8949) ---
(() => {
  const obj1 = { title: 'Song', artist: 'Artist', bitrate: 320000, active: true };
  const obj2 = { active: true, bitrate: 320000, artist: 'Artist', title: 'Song' };
  
  const enc1 = cborEngine.encodeCanonical(obj1);
  const enc2 = cborEngine.encodeCanonical(obj2);

  assert(enc1.equals(enc2), 'Canonical Sorting: different key insertion orders yield identical binary CBOR');
  
  const dec = cborEngine.decode(enc1);
  assert(dec.title === 'Song' && dec.bitrate === 320000 && dec.active === true, 'Maps: decoded properties match');
})();

// --- Test 7: Bidirectional Interoperability with Standard CBOR ---
(() => {
  const payload = {
    fingerprint_hash: 'a1b2c3d4',
    origin_platform: 'platform-alpha',
    origin_timestamp: 1723680000000,
    tags: ['audio', 'flac', 'lossless'],
    metadata: { isrc: 'US1234567890', channels: 2 }
  };

  // Encode with Ohnrscript, decode with reference npm 'cbor'
  const ohnrEncoded = cborEngine.encode(payload);
  const refDecoded = cborRef.decode(ohnrEncoded);
  assert(refDecoded.origin_platform === 'platform-alpha' && refDecoded.metadata.isrc === 'US1234567890',
    'Interoperability: Ohnrscript encoded CBOR decodes cleanly with standard cbor package');

  // Encode with reference npm 'cbor', decode with Ohnrscript
  const refEncoded = cborRef.encode(payload);
  const ohnrDecoded = cborEngine.decode(refEncoded);
  assert(ohnrDecoded.origin_platform === 'platform-alpha' && ohnrDecoded.tags[1] === 'flac',
    'Interoperability: Standard cbor package encoded bytes decode cleanly with Ohnrscript engine');
})();

// --- Test 8: Ed25519 Cryptographic Signature Verification Roundtrip ---
(() => {
  const keypair = nacl.sign.keyPair();
  const txData = {
    fingerprint_hash: 'f9e8d7c6b5a4',
    origin_platform: 'test-node',
    origin_timestamp: 1723680000000,
    payload_cbor: Buffer.from([0x00, 0x11, 0x22, 0x33])
  };

  // Canonical encode & sign
  const canonicalBytes = cborEngine.encodeCanonical(txData);
  const sig = nacl.sign.detached(new Uint8Array(canonicalBytes), keypair.secretKey);

  // Verify signature over same object reconstructed with different key order
  const shuffledTx = {
    payload_cbor: Buffer.from([0x00, 0x11, 0x22, 0x33]),
    origin_timestamp: 1723680000000,
    origin_platform: 'test-node',
    fingerprint_hash: 'f9e8d7c6b5a4'
  };
  const reEncoded = cborEngine.encodeCanonical(shuffledTx);
  const valid = nacl.sign.detached.verify(new Uint8Array(reEncoded), sig, keypair.publicKey);

  assert(valid, 'Crypto: Ed25519 signature verifies perfectly across key-shuffled reconstructed objects');
})();

console.log('--------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
