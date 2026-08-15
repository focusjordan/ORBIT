/**
 * Test Suite for ORBIT High-Performance ID & UUID Engine (Ohnrscript ohn-uuid)
 */

'use strict';

const idEngine = require('../../src/utils/id');

class SimpleTestRunner {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(description, fn) {
    this.tests.push({ description, fn });
  }

  async run() {
    console.log(`\n🧪 ${this.name}`);
    console.log('='.repeat(50));

    for (const { description, fn } of this.tests) {
      try {
        await fn();
        console.log(`  ✅ ${description}`);
        this.passed++;
      } catch (err) {
        console.log(`  ❌ ${description}`);
        console.error(`     ${err.message}`);
        this.failed++;
      }
    }

    console.log('-'.repeat(50));
    console.log(`Results: ${this.passed} passed, ${this.failed} failed\n`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

const runner = new SimpleTestRunner('Ohnrscript ohn-uuid Engine Tests');

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

runner.test('uuidv4: generates valid RFC 4122 v4 UUID string', () => {
  const id = idEngine.uuidv4();
  if (typeof id !== 'string') throw new Error(`Expected string, got ${typeof id}`);
  if (id.length !== 36) throw new Error(`Expected 36 chars, got ${id.length}`);
  if (!UUID_V4_REGEX.test(id)) throw new Error(`UUID format mismatch: ${id}`);
});

runner.test('uuidv4: version 4 bit (0x40) and variant 1 bits (0x80) correctly placed', () => {
  for (let i = 0; i < 100; i++) {
    const id = idEngine.uuidv4();
    if (id[14] !== '4') throw new Error(`Position 14 must be '4', got '${id[14]}' in ${id}`);
    if (!['8', '9', 'a', 'b'].includes(id[19])) {
      throw new Error(`Position 19 must be one of [8,9,a,b], got '${id[19]}' in ${id}`);
    }
  }
});

runner.test('uuidv4Raw: generates 16-byte buffer with correct v4 bits', () => {
  const raw = idEngine.uuidv4Raw();
  if (!Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) {
    throw new Error('Expected Buffer/Uint8Array');
  }
  if (raw.length !== 16) throw new Error(`Expected 16 bytes, got ${raw.length}`);
  if ((raw[6] & 0xf0) !== 0x40) throw new Error('Byte 6 does not have v4 bit set');
  if ((raw[8] & 0xc0) !== 0x80) throw new Error('Byte 8 does not have variant 1 bit set');
});

runner.test('Entropy pool refill: handles 10,000 continuous generations without error', () => {
  const seen = new Set();
  for (let i = 0; i < 10000; i++) {
    const id = idEngine.uuidv4();
    if (seen.has(id)) throw new Error(`Duplicate UUID detected at iteration ${i}: ${id}`);
    seen.add(id);
  }
});

runner.test('prefixedId: formats structured token correctly', () => {
  const reqId = idEngine.prefixedId('req_');
  if (!reqId.startsWith('req_')) throw new Error(`Expected prefix 'req_', got ${reqId}`);
  const parts = reqId.split('_');
  if (parts.length < 3) throw new Error(`Expected req_<timestamp>_<token>, got ${reqId}`);
  const timestamp = parseInt(parts[1], 10);
  if (isNaN(timestamp) || timestamp < 1700000000000) throw new Error(`Invalid timestamp: ${parts[1]}`);
});

runner.test('tempAudioFilename: generates safe audio path with extension', () => {
  const filename = idEngine.tempAudioFilename('orbit-as', '.wav');
  if (!filename.startsWith('orbit-as-')) throw new Error(`Expected prefix 'orbit-as-', got ${filename}`);
  if (!filename.endsWith('.wav')) throw new Error(`Expected extension '.wav', got ${filename}`);
});

runner.run();
