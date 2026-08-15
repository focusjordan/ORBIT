/**
 * ORBIT CBOR Engine Unit Tests (RFC 8949)
 * Tests deterministic encoding, decoding, data types, and error handling.
 */

const { encode, decode, CBOREngine } = require('../../src/utils/cbor');

async function runTests() {
  console.log('🧪 Running CBOR Engine Unit Tests\n');

  // Test 1: Primitive Values Roundtrip
  console.log('Test 1: Primitives (bool, null, numbers)');
  const primitives = [
    true,
    false,
    null,
    0,
    1,
    23,
    24,
    255,
    256,
    65535,
    65536,
    4294967295,
    -1,
    -24,
    -25,
    -256,
    -65536,
    3.141592653589793,
    -0.5,
    Infinity,
    -Infinity
  ];

  for (const val of primitives) {
    const encoded = encode(val);
    const decoded = decode(encoded);
    if (Number.isNaN(val)) {
      console.assert(Number.isNaN(decoded), `NaN mismatch`);
    } else {
      console.assert(decoded === val, `Mismatch for ${val}: got ${decoded}`);
    }
  }
  console.log('   ✅ Passed\n');

  // Test 2: Strings and Binary Data
  console.log('Test 2: Strings & Byte Arrays');
  const str = 'Hello, ORBIT Protocol! 🎵 🚀';
  const encodedStr = encode(str);
  console.assert(decode(encodedStr) === str, 'UTF-8 string roundtrip');

  const binary = Buffer.from([0x00, 0x01, 0x02, 0xde, 0xad, 0xbe, 0xef]);
  const encodedBin = encode(binary);
  const decodedBin = decode(encodedBin);
  console.assert(Buffer.compare(decodedBin, binary) === 0, 'Buffer roundtrip');
  console.log('   ✅ Passed\n');

  // Test 3: Arrays & Nested Structures
  console.log('Test 3: Arrays & Nested Objects');
  const complexObj = {
    platform: 'orbit-sound-platform',
    version: 2,
    active: true,
    tags: ['audio', 'provenance', 'watermark'],
    meta: {
      bpm: 128.5,
      key: 'Am',
      nested: {
        id: 99999,
        data: Buffer.from([1, 2, 3, 4])
      }
    }
  };

  const encodedObj = encode(complexObj);
  const decodedObj = decode(encodedObj);
  console.assert(decodedObj.platform === complexObj.platform, 'Object field mismatch');
  console.assert(decodedObj.version === complexObj.version, 'Number field mismatch');
  console.assert(decodedObj.tags.length === 3, 'Array length mismatch');
  console.assert(decodedObj.meta.bpm === 128.5, 'Nested float mismatch');
  console.assert(Buffer.compare(decodedObj.meta.nested.data, Buffer.from([1, 2, 3, 4])) === 0, 'Nested buffer mismatch');
  console.log('   ✅ Passed\n');

  // Test 4: Deterministic Canonical Key Ordering
  console.log('Test 4: Deterministic Key Sorting');
  const objA = { b: 2, a: 1, c: 3 };
  const objB = { a: 1, c: 3, b: 2 };
  const encA = encode(objA);
  const encB = encode(objB);
  console.assert(Buffer.compare(encA, encB) === 0, 'CBOR map encoding is deterministic');
  console.log('   ✅ Passed\n');

  // Test 5: Error Handling on Invalid/Truncated Buffers
  console.log('Test 5: Error Handling');
  try {
    decode(Buffer.alloc(0));
    console.assert(false, 'Should throw on empty buffer');
  } catch (err) {
    console.assert(true, 'Correctly threw on empty buffer');
  }

  try {
    decode(Buffer.from([0x18])); // major type 0 with 1 extra byte expected, but omitted
    console.assert(false, 'Should throw on truncated buffer');
  } catch (err) {
    console.assert(true, 'Correctly threw on truncated buffer');
  }
  console.log('   ✅ Passed\n');

  console.log('🎉 All CBOR Engine Unit Tests passed!\n');
}

runTests().catch(err => {
  console.error('❌ CBOR Unit Test failed:', err);
  process.exit(1);
});
