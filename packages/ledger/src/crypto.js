/**
 * ORBIT Crypto Engine
 * Ed25519 signing and CBOR encoding
 */

const nacl = require('tweetnacl');
const cborEngine = require('./cbor');
const crypto = require('crypto');
const { blake3 } = require('@noble/hashes/blake3.js');

class OrbitCrypto {
  /**
   * Generate new Ed25519 keypair for a platform
   * @returns {{publicKey: Buffer, privateKey: Buffer}}
   */
  static generateKeypair() {
    const keypair = nacl.sign.keyPair();
    return {
      publicKey: Buffer.from(keypair.publicKey),
      privateKey: Buffer.from(keypair.secretKey)
    };
  }
  
  /**
   * Sign data with Ed25519 private key
   * @param {Buffer|Object} data - Data to sign (will be CBOR encoded if object)
   * @param {Buffer} privateKey - 64-byte Ed25519 private key
   * @returns {Buffer} 64-byte signature
   */
  static sign(data, privateKey) {
    let dataBuffer;
    
    if (Buffer.isBuffer(data)) {
      dataBuffer = data;
    } else if (typeof data === 'object' && data !== null) {
      // Remove signature field if present, then encode
      const unsigned = { ...data };
      delete unsigned.signature;
      dataBuffer = cborEngine.encode(unsigned);
    } else {
      throw new Error('Data must be Buffer or Object');
    }
    
    const signature = nacl.sign.detached(
      new Uint8Array(dataBuffer),
      new Uint8Array(privateKey)
    );
    
    return Buffer.from(signature);
  }
  
  /**
   * Verify Ed25519 signature
   * @param {Buffer|Object} data - Original data
   * @param {Buffer} signature - 64-byte signature
   * @param {Buffer} publicKey - 32-byte public key
   * @returns {boolean}
   */
  static verify(data, signature, publicKey) {
    let dataBuffer;
    
    if (Buffer.isBuffer(data)) {
      dataBuffer = data;
    } else if (typeof data === 'object' && data !== null) {
      const unsigned = { ...data };
      delete unsigned.signature;
      dataBuffer = cborEngine.encode(unsigned);
    } else {
      throw new Error('Data must be Buffer or Object');
    }
    
    try {
      return nacl.sign.detached.verify(
        new Uint8Array(dataBuffer),
        new Uint8Array(signature),
        new Uint8Array(publicKey)
      );
    } catch {
      return false;
    }
  }
  
  /**
   * Encode data to CBOR
   * @param {Object} data 
   * @returns {Buffer}
   */
  static encode(data) {
    return cborEngine.encode(data);
  }
  
  /**
   * Decode CBOR data
   * @param {Buffer} buffer 
   * @returns {Object}
   */
  static decode(buffer) {
    return cborEngine.decode(buffer);
  }
  
  /**
   * BLAKE3 cryptographic hash
   * @param {Buffer|Uint8Array|string} data 
   * @returns {Buffer} 32-byte hash
   */
  static hash(data) {
    const input = typeof data === 'string' ? Buffer.from(data) : data;
    return Buffer.from(blake3(input));
  }
  
  /**
   * Generate random bytes
   * @param {number} length 
   * @returns {Buffer}
   */
  static randomBytes(length) {
    return crypto.randomBytes(length);
  }
  
  /**
   * Hash API key for storage using BLAKE3
   * @param {string} apiKey 
   * @returns {Buffer} 32-byte hash
   */
  static hashApiKey(apiKey) {
    return this.hash(apiKey);
  }
  
  /**
   * Generate a new API key
   * @returns {string} Base64url-encoded API key
   */
  static generateApiKey() {
    return crypto.randomBytes(32).toString('base64url');
  }
  
  /**
   * Create entry hash for ledger chain using BLAKE3
   * @param {Object} entry - Registration entry
   * @param {Buffer} prevHash - Previous entry hash (null for first entry)
   * @returns {Buffer} 32-byte hash
   */
  static createEntryHash(entry, prevHash = null) {
    const hashInput = Buffer.concat([
      prevHash || Buffer.alloc(32),
      cborEngine.encode({
        fingerprint_hash: entry.fingerprint_hash,
        origin_platform: entry.origin_platform,
        origin_timestamp: entry.origin_timestamp,
        payload_cbor: entry.payload_cbor
      })
    ]);
    
    return this.hash(hashInput);
  }
}

module.exports = OrbitCrypto;
