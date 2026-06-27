/**
 * ORBIT Fingerprint Engine
 * Wraps Chromaprint (fpcalc) for audio fingerprinting
 * 
 * DESIGN NOTES:
 * - This provides EXACT-MATCH detection only (no similarity scoring)
 * - Semantic fingerprinting can be added optionally for pitch/speed invariance
 * - Keep this simple: Chromaprint → SHA-256 hash → exact comparison
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

class OrbitFingerprint {
  /**
   * Generate fingerprint from audio buffer or file path
   * @param {Buffer|string} input - Audio buffer or file path
   * @param {Object} options - Options
   * @param {number} options.length - Max audio length to analyze (seconds, default 120)
   * @returns {Promise<{raw: string, hash: Buffer, duration: number}>}
   */
  static async generate(input, options = {}) {
    const { length = 120 } = options;
    
    let audioPath;
    let tempFile = null;
    
    // If input is a buffer, write to temp file
    if (Buffer.isBuffer(input)) {
      tempFile = path.join(
        os.tmpdir(), 
        `orbit-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`
      );
      fs.writeFileSync(tempFile, input);
      audioPath = tempFile;
    } else if (typeof input === 'string') {
      audioPath = input;
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }
    } else {
      throw new Error('Input must be a Buffer or file path string');
    }
    
    try {
      // Verify fpcalc is available
      const versionCheck = spawnSync('fpcalc', ['-version'], { stdio: 'pipe' });
      if (versionCheck.error || versionCheck.status !== 0) {
        throw new Error(
          'Chromaprint (fpcalc) not found. Install with: brew install chromaprint'
        );
      }
      
      // Run fpcalc
      const spawnResult = spawnSync(
        'fpcalc',
        ['-json', '-length', String(length), audioPath],
        { 
          encoding: 'utf8', 
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000
        }
      );
      
      if (spawnResult.error) {
        throw spawnResult.error;
      }
      
      if (spawnResult.status !== 0) {
        throw new Error(`fpcalc exited with code ${spawnResult.status}: ${spawnResult.stderr}`);
      }
      
      const { fingerprint, duration } = JSON.parse(spawnResult.stdout);
      
      if (!fingerprint) {
        throw new Error('Failed to generate fingerprint - no output from fpcalc');
      }
      
      // Create 32-byte hash for compact storage/comparison
      const hash = crypto.createHash('sha256')
        .update(fingerprint)
        .digest();
      
      return {
        raw: fingerprint,
        hash: hash,
        duration: duration
      };
      
    } finally {
      // Clean up temp file
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
  
  /**
   * Compare two fingerprint hashes
   * @param {Buffer} hash1 
   * @param {Buffer} hash2 
   * @returns {boolean} True if identical
   */
  static hashesMatch(hash1, hash2) {
    if (!Buffer.isBuffer(hash1) || !Buffer.isBuffer(hash2)) {
      return false;
    }
    return hash1.equals(hash2);
  }
  
  /**
   * Find matching registrations in database (EXACT match only)
   * @param {Buffer} hash - Fingerprint hash to search for
   * @param {Object} queries - Database queries module
   * @returns {Promise<Array>} Matching registrations
   */
  static async findMatches(hash, queries) {
    return await queries.findByFingerprint(hash);
  }
  
  /**
   * Check if fingerprint already exists in database
   * @param {Buffer} hash - Fingerprint hash
   * @param {Object} queries - Database queries module
   * @returns {Promise<boolean>}
   */
  static async exists(hash, queries) {
    return await queries.fingerprintExists(hash);
  }
}

module.exports = OrbitFingerprint;
