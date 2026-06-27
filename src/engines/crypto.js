/**
 * ORBIT Crypto Engine
 * Ed25519 signing and CBOR encoding
 */

const nacl = require('tweetnacl');
const cbor = require('cbor');
const crypto = require('crypto');

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
   * Internal helper: Prepares an object for Ed25519 signing/verification
   * Implements the ORBIT Pre-Hash Protocol to prevent event-loop blocking
   * @param {Buffer|Object} data 
   * @returns {Buffer}
   */
  static _prepareForCrypto(data) {
    if (Buffer.isBuffer(data)) {
      return data;
    } else if (typeof data === 'object' && data !== null) {
      // Remove signature field if present
      const unsigned = { ...data };
      delete unsigned.signature;
      
      if (unsigned.audio) {
        if (Buffer.isBuffer(unsigned.audio)) {
          unsigned.audio_hash = this.hash(unsigned.audio);
          delete unsigned.audio;
        } else if (typeof unsigned.audio === 'string') {
          const audioBuffer = Buffer.from(unsigned.audio, 'base64');
          unsigned.audio_hash = this.hash(audioBuffer);
          delete unsigned.audio;
        }
      }
      
      return cbor.encode(unsigned);
    } else {
      throw new Error('Data must be Buffer or Object');
    }
  }

  /**
   * Sign data with Ed25519 private key
   * @param {Buffer|Object} data - Data to sign (will be CBOR encoded if object)
   * @param {Buffer} privateKey - 64-byte Ed25519 private key
   * @returns {Buffer} 64-byte signature
   */
  static sign(data, privateKey) {
    const dataBuffer = this._prepareForCrypto(data);
    
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
    const dataBuffer = this._prepareForCrypto(data);
    
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
    return cbor.encode(data);
  }
  
  /**
   * Decode CBOR data
   * @param {Buffer} buffer 
   * @returns {Object}
   */
  static decode(buffer) {
    return cbor.decode(buffer);
  }
  
  /**
   * SHA-256 hash
   * @param {Buffer|string} data 
   * @returns {Buffer} 32-byte hash
   */
  static hash(data) {
    return crypto.createHash('sha256').update(data).digest();
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
   * Hash API key for storage
   * @param {string} apiKey 
   * @returns {Buffer}
   */
  static hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest();
  }
  
  /**
   * Generate a new API key
   * @returns {string} Base64url-encoded API key
   */
  static generateApiKey() {
    return crypto.randomBytes(32).toString('base64url');
  }
  
  /**
   * Create entry hash for ledger chain
   * @param {Object} entry - Registration entry
   * @param {Buffer} prevHash - Previous entry hash (null for first entry)
   * @returns {Buffer} 32-byte hash
   */
  static createEntryHash(entry, prevHash = null) {
    const hashInput = Buffer.concat([
      prevHash || Buffer.alloc(32),
      cbor.encode({
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
