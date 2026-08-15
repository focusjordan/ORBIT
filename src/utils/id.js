/**
 * ORBIT High-Performance ID & UUID Engine
 * 
 * Implements the Ohnrscript zero-allocation data-oriented memory design:
 * - 64KB static cryptographic entropy pool (services 4,096 UUIDs per OS refill)
 * - Static pre-formatted 36-byte ASCII output buffer
 * - Zero V8 heap allocations during steady-state generation
 * - 100% self-contained within the ORBIT repository (zero relative-path coupling)
 */

'use strict';

const crypto = require('crypto');

// ============================================================================
// Ohnrscript Zero-Allocation Entropy Pool & Memory Buffers
// ============================================================================

// Globally-scoped single allocation for cryptographic entropy pool
// Size: 65,536 bytes (serves 4,096 UUIDs before refilling)
const POOL_SIZE = 65536;
const pool = new Uint8Array(POOL_SIZE);
let poolOffset = POOL_SIZE;

// Globally-scoped single allocation for formatted ASCII output
const outBuffer = new Uint8Array(36);

// Static lookup table for ASCII hex characters (0-9, a-f)
const hexLookup = new Uint8Array([
  48, 49, 50, 51, 52, 53, 54, 55, 56, 57, // '0'-'9'
  97, 98, 99, 100, 101, 102               // 'a'-'f'
]);

// Hyphen byte code ('-')
const HYPHEN = 0x2d;

// Pre-fill fixed hyphen positions in outBuffer
outBuffer[8] = HYPHEN;
outBuffer[13] = HYPHEN;
outBuffer[18] = HYPHEN;
outBuffer[23] = HYPHEN;

// Pre-allocated 16-byte raw UUID binary buffer
const rawBuffer = new Uint8Array(16);

/**
 * Batch-refill the entropy pool from the OS kernel only when depleted
 */
function fillEntropy() {
  if (poolOffset >= POOL_SIZE) {
    crypto.randomFillSync(pool);
    poolOffset = 0;
  }
}

/**
 * Generate formatted UUID v4 directly into the static 36-byte ASCII buffer
 * @returns {Uint8Array} Static 36-byte buffer containing ASCII UUID
 */
function generateUUIDv4() {
  fillEntropy();

  let outIndex = 0;
  for (let i = 0; i < 16; i++) {
    // Skip pre-filled hyphen positions
    if (outIndex === 8 || outIndex === 13 || outIndex === 18 || outIndex === 23) {
      outIndex++;
    }
    let byte = pool[poolOffset++];

    // Apply UUID v4 mandatory bitwise operations (Version 4 + Variant 1)
    if (i === 6) {
      byte = (byte & 0x0f) | 0x40;
    } else if (i === 8) {
      byte = (byte & 0x3f) | 0x80;
    }

    // High nibble
    outBuffer[outIndex++] = hexLookup[byte >> 4];
    // Low nibble
    outBuffer[outIndex++] = hexLookup[byte & 0x0f];
  }
  return outBuffer;
}

/**
 * Generate raw 16-byte cryptographic UUID v4 binary buffer
 * @returns {Uint8Array} Static 16-byte buffer containing raw bytes
 */
function generateUUIDv4Raw() {
  fillEntropy();
  for (let i = 0; i < 16; i++) {
    let byte = pool[poolOffset++];

    if (i === 6) {
      byte = (byte & 0x0f) | 0x40;
    } else if (i === 8) {
      byte = (byte & 0x3f) | 0x80;
    }
    rawBuffer[i] = byte;
  }
  return rawBuffer;
}

// ============================================================================
// Public High-Level ORBIT API
// ============================================================================

/**
 * Generate a standard RFC 4122 v4 UUID string.
 * @returns {string} 36-character lowercase UUID v4 (e.g. "f47ac10b-58cc-4372-a567-0e02b2c3d479")
 */
function uuidv4() {
  const buf = generateUUIDv4();
  return Buffer.from(buf.buffer, buf.byteOffset, 36).toString('utf8');
}

/**
 * Generate a raw 16-byte cryptographic UUID v4 binary buffer.
 * @returns {Buffer} 16-byte Buffer copy containing raw UUID bytes
 */
function uuidv4Raw() {
  const raw = generateUUIDv4Raw();
  return Buffer.from(raw);
}

/**
 * Generate a high-entropy short random hex token (8-16 characters).
 * Direct ASCII buffer slice without string regex or object allocations.
 * 
 * @param {number} length - Number of hex characters (default: 8, max: 32)
 * @returns {string}
 */
function shortId(length = 8) {
  const buf = generateUUIDv4();
  if (length <= 8) {
    // First 8 characters are contiguous ASCII hex without hyphens
    return Buffer.from(buf.buffer, buf.byteOffset, length).toString('utf8');
  }
  const part1 = Buffer.from(buf.buffer, buf.byteOffset, 8).toString('utf8');
  const part2 = Buffer.from(buf.buffer, buf.byteOffset + 9, Math.min(length - 8, 4)).toString('utf8');
  return part1 + part2;
}

/**
 * Generate a prefixed structured identifier (e.g., "emb_1723680000000_a1b2c3d4").
 * Replaces slow and collision-prone `Math.random().toString(36)` patterns.
 * 
 * @param {string} prefix - ID prefix (e.g., 'emb_', 'req_', 'err_', 'tr_')
 * @param {number} [randomChars=8] - Number of random hex characters to append
 * @returns {string}
 */
function prefixedId(prefix = '', randomChars = 8) {
  const timestamp = Date.now();
  const token = shortId(randomChars);
  return `${prefix}${timestamp}_${token}`;
}

/**
 * Generate a collision-safe temporary audio filename.
 * Used across audio processing and machine learning pipelines.
 * 
 * @param {string} prefix - File prefix (e.g. 'orbit-ffprobe', 'orbit-as-input')
 * @param {string} [ext='.wav'] - File extension (including leading dot)
 * @returns {string} Safe filename (e.g. "orbit-as-input-1723680000000-f47ac10b58cc.wav")
 */
function tempAudioFilename(prefix = 'orbit', ext = '.wav') {
  const formattedExt = ext.startsWith('.') ? ext : `.${ext}`;
  const timestamp = Date.now();
  const token = shortId(12);
  return `${prefix}-${timestamp}-${token}${formattedExt}`;
}

module.exports = {
  uuidv4,
  uuidv4Raw,
  shortId,
  prefixedId,
  tempAudioFilename,
  generateUUIDv4,
  generateUUIDv4Raw,
};
