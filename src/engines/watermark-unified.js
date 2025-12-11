/**
 * ORBIT Unified Watermark Engine
 * 
 * Session 22 - Unified interface for neural (SilentCipher) and spread spectrum watermarking
 * 
 * This module provides a single interface that:
 * 1. Tries SilentCipher (neural) first for superior robustness
 * 2. Falls back to spread spectrum if neural fails
 * 3. Respects ORBIT_WATERMARK_METHOD env var configuration
 * 
 * Configuration (via ORBIT_WATERMARK_METHOD env var):
 * - "neural"  → SilentCipher only (fails if unavailable)
 * - "spread"  → Spread spectrum only (original v1 behavior)
 * - "auto"    → Try neural first, fall back to spread (default)
 * 
 * Key architectural difference:
 * - Spread spectrum embeds full 64-byte payload (self-verifiable via CRC)
 * - SilentCipher embeds 5-byte hash prefix (requires ledger lookup)
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 1 (Neural Watermarking)
 * @see src/engines/watermark.js (spread spectrum implementation)
 * @see src/ml/silentcipher.js (neural watermarking wrapper)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Core watermarking implementations
const OrbitWatermark = require('./watermark');
const silentcipher = require('../ml/silentcipher');
const AudioUtils = require('../utils/audio');

/**
 * Watermark method configuration
 * @type {'neural'|'spread'|'auto'}
 */
const WATERMARK_METHOD = process.env.ORBIT_WATERMARK_METHOD || 'auto';

/**
 * Cache for SilentCipher availability check
 * @type {{checked: boolean, available: boolean, message: string}|null}
 */
let silentcipherAvailability = null;

/**
 * Check if SilentCipher is available (cached after first check)
 * @returns {Promise<{available: boolean, message: string}>}
 */
async function checkSilentCipherAvailable() {
  if (silentcipherAvailability !== null) {
    return silentcipherAvailability;
  }
  
  try {
    const result = await silentcipher.checkPythonEnvironment();
    silentcipherAvailability = {
      checked: true,
      available: result.available,
      message: result.message
    };
  } catch (error) {
    silentcipherAvailability = {
      checked: true,
      available: false,
      message: `SilentCipher check failed: ${error.message}`
    };
  }
  
  return silentcipherAvailability;
}

/**
 * Reset availability cache (useful for testing)
 */
function resetAvailabilityCache() {
  silentcipherAvailability = null;
}

/**
 * Get current watermark method configuration
 * @returns {'neural'|'spread'|'auto'}
 */
function getWatermarkMethod() {
  return WATERMARK_METHOD;
}

/**
 * Unified Watermark Engine
 * 
 * Provides a consistent interface for embedding and extracting watermarks
 * using either neural (SilentCipher) or spread spectrum methods.
 */
class UnifiedWatermark {
  /**
   * @param {string} secretKey - Secret key for spread spectrum (required for fallback)
   * @param {Object} options - Configuration options
   * @param {string} options.method - Override ORBIT_WATERMARK_METHOD ('neural'|'spread'|'auto')
   * @param {Object} options.spreadOptions - Options passed to OrbitWatermark constructor
   */
  constructor(secretKey, options = {}) {
    this.secretKey = secretKey;
    this.method = options.method || WATERMARK_METHOD;
    
    // Initialize spread spectrum engine (always needed for fallback or payload creation)
    this.spreadWatermark = new OrbitWatermark(secretKey, options.spreadOptions || {});
    
    // Store options for potential neural embedding
    this.options = options;
  }
  
  /**
   * Create watermark payload structure
   * This is used by both methods for consistent payload format
   * 
   * @param {Object} data - Payload data
   * @param {string} data.platform - Platform ID
   * @param {number} data.timestamp - Unix timestamp in ms
   * @param {Buffer} data.payloadHash - Hash of full CBOR payload (16 bytes)
   * @returns {Buffer} 64-byte binary payload (for spread spectrum)
   */
  createPayload(data) {
    return this.spreadWatermark.createPayload(data);
  }
  
  /**
   * Embed watermark into audio
   * 
   * @param {Buffer} audioBuffer - Audio file as buffer
   * @param {Object} payloadData - Data for watermark payload
   * @param {string} payloadData.platform - Platform ID
   * @param {number} payloadData.timestamp - Unix timestamp in ms  
   * @param {Buffer} payloadData.payloadHash - Hash of full CBOR payload (16 bytes)
   * @param {Object} options - Embed options
   * @param {boolean} options.verbose - Log progress
   * @returns {Promise<{
   *   success: boolean,
   *   watermarkedAudio: Buffer,
   *   method: 'silentcipher'|'spread',
   *   watermarkPayload: Buffer,
   *   sdr?: number,
   *   fallbackUsed?: boolean,
   *   fallbackReason?: string,
   *   processingTimeMs: number
   * }>}
   */
  async embed(audioBuffer, payloadData, options = {}) {
    const startTime = Date.now();
    const verbose = options.verbose || process.env.ORBIT_ML_VERBOSE === 'true';
    
    // Create the spread spectrum payload (64 bytes)
    // This is stored in the ledger and used for spread spectrum embedding
    const watermarkPayload = this.createPayload(payloadData);
    
    // Determine which method(s) to try
    const shouldTryNeural = this.method === 'neural' || this.method === 'auto';
    const shouldTrySpread = this.method === 'spread' || this.method === 'auto';
    
    // Try neural watermarking first (if configured)
    if (shouldTryNeural) {
      try {
        const availability = await checkSilentCipherAvailable();
        
        if (!availability.available) {
          if (this.method === 'neural') {
            throw new Error(`SilentCipher not available: ${availability.message}`);
          }
          // Auto mode: fall through to spread spectrum
          if (verbose) {
            console.log(`⚠️  SilentCipher not available, falling back to spread spectrum`);
          }
        } else {
          // SilentCipher embeds a 5-byte hash prefix (40 bits)
          // We use the payloadHash for this (first 5 bytes)
          const result = await silentcipher.embed(audioBuffer, payloadData.payloadHash, {
            verbose,
          });
          
          if (result.success) {
            // Read the watermarked audio file
            const watermarkedAudio = fs.readFileSync(result.outputPath);
            
            // Clean up temp file
            try {
              fs.unlinkSync(result.outputPath);
            } catch (e) {
              // Ignore cleanup errors
            }
            
            return {
              success: true,
              watermarkedAudio,
              method: 'silentcipher',
              watermarkPayload,
              sdr: result.sdr,
              message: result.message,
              fallbackUsed: false,
              processingTimeMs: Date.now() - startTime
            };
          }
        }
      } catch (error) {
        if (this.method === 'neural') {
          // Neural-only mode: propagate the error
          throw error;
        }
        
        // Auto mode: log and fall through to spread spectrum
        if (verbose) {
          console.log(`⚠️  SilentCipher embed failed: ${error.message}`);
          console.log(`   Falling back to spread spectrum...`);
        }
        
        // Continue to spread spectrum fallback
        if (!shouldTrySpread) {
          throw error;
        }
      }
    }
    
    // Try spread spectrum (fallback or primary based on config)
    if (shouldTrySpread) {
      try {
        // Convert audio to samples
        const samples = await AudioUtils.decodeAudioToSamples(audioBuffer);
        
        // Embed using spread spectrum
        const watermarkedSamples = this.spreadWatermark.embed(samples, watermarkPayload);
        
        // Encode back to WAV
        const watermarkedAudio = await AudioUtils.encodeSamplesToWav(watermarkedSamples, 44100, 1);
        
        return {
          success: true,
          watermarkedAudio,
          method: 'spread',
          watermarkPayload,
          fallbackUsed: shouldTryNeural, // True if we tried neural first
          fallbackReason: shouldTryNeural ? 'neural_failed' : undefined,
          processingTimeMs: Date.now() - startTime
        };
      } catch (error) {
        throw new Error(`Spread spectrum embed failed: ${error.message}`);
      }
    }
    
    // Should never reach here
    throw new Error('No watermark method available');
  }
  
  /**
   * Extract watermark from audio
   * 
   * @param {Buffer} audioBuffer - Audio file as buffer
   * @param {Object} options - Extract options
   * @param {boolean} options.verbose - Log progress
   * @param {boolean} options.tryBothMethods - Try both methods even if first succeeds (for comparison)
   * @returns {Promise<{
   *   success: boolean,
   *   detected: boolean,
   *   method: 'silentcipher'|'spread'|null,
   *   confidence: number,
   *   payloadHash?: Buffer,
   *   payload?: Buffer,
   *   parsedPayload?: Object,
   *   fallbackUsed?: boolean,
   *   processingTimeMs: number
   * }>}
   */
  async extract(audioBuffer, options = {}) {
    const startTime = Date.now();
    const verbose = options.verbose || process.env.ORBIT_ML_VERBOSE === 'true';
    
    // Determine which method(s) to try
    const shouldTryNeural = this.method === 'neural' || this.method === 'auto';
    const shouldTrySpread = this.method === 'spread' || this.method === 'auto';
    
    let neuralResult = null;
    let spreadResult = null;
    
    // Try neural extraction first (if configured)
    if (shouldTryNeural) {
      try {
        const availability = await checkSilentCipherAvailable();
        
        if (availability.available) {
          const result = await silentcipher.extract(audioBuffer, { verbose });
          
          if (result.success && result.detected) {
            neuralResult = {
              success: true,
              detected: true,
              method: 'silentcipher',
              confidence: result.confidence,
              payloadHash: result.payloadHash, // 5-byte hash prefix
              message: result.message,
              fallbackUsed: false,
              processingTimeMs: Date.now() - startTime
            };
            
            // If not trying both methods, return neural result
            if (!options.tryBothMethods) {
              return neuralResult;
            }
          }
        } else if (this.method === 'neural') {
          throw new Error(`SilentCipher not available: ${availability.message}`);
        }
      } catch (error) {
        if (this.method === 'neural') {
          throw error;
        }
        
        if (verbose) {
          console.log(`⚠️  SilentCipher extract failed: ${error.message}`);
        }
      }
    }
    
    // Try spread spectrum (fallback or primary based on config)
    if (shouldTrySpread) {
      try {
        // Convert audio to samples
        const samples = await AudioUtils.decodeAudioToSamples(audioBuffer);
        
        // Extract using spread spectrum with offset search
        const result = this.spreadWatermark.extractWithSearch(samples);
        
        if (result.valid) {
          const parsedPayload = this.spreadWatermark.parsePayload(result.payload);
          
          spreadResult = {
            success: true,
            detected: true,
            method: 'spread',
            confidence: result.confidence,
            payload: result.payload,
            parsedPayload,
            payloadHash: parsedPayload?.payloadHash,
            offset: result.offset,
            fallbackUsed: shouldTryNeural && !neuralResult,
            processingTimeMs: Date.now() - startTime
          };
        }
      } catch (error) {
        if (verbose) {
          console.log(`⚠️  Spread spectrum extract failed: ${error.message}`);
        }
      }
    }
    
    // Return best result
    if (neuralResult && neuralResult.detected) {
      // Prefer neural result (higher confidence typically)
      if (spreadResult && options.tryBothMethods) {
        neuralResult.spreadResult = spreadResult;
      }
      return neuralResult;
    }
    
    if (spreadResult && spreadResult.detected) {
      return spreadResult;
    }
    
    // No watermark detected
    return {
      success: true,
      detected: false,
      method: null,
      confidence: 0,
      fallbackUsed: shouldTryNeural && shouldTrySpread,
      processingTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Detect if audio contains a valid ORBIT watermark
   * Convenience wrapper around extract()
   * 
   * @param {Buffer} audioBuffer - Audio file as buffer
   * @returns {Promise<{detected: boolean, method: string|null, confidence: number}>}
   */
  async detect(audioBuffer) {
    const result = await this.extract(audioBuffer);
    return {
      detected: result.detected,
      method: result.method,
      confidence: result.confidence
    };
  }
  
  /**
   * Check if a payload hash matches an extracted hash
   * Handles the difference in hash sizes between methods:
   * - SilentCipher: 5 bytes
   * - Spread spectrum: 16 bytes (from 64-byte payload)
   * 
   * @param {Buffer} extractedHash - Hash from extraction (5 or 16 bytes)
   * @param {Buffer} expectedHash - Full payload hash to compare
   * @param {string} method - Extraction method used
   * @returns {boolean}
   */
  static hashMatches(extractedHash, expectedHash, method) {
    if (!extractedHash || !expectedHash) return false;
    
    if (method === 'silentcipher') {
      // SilentCipher uses 5-byte prefix
      return silentcipher.hashMatches(extractedHash, expectedHash);
    } else {
      // Spread spectrum uses 16-byte hash from payload
      const expectedPrefix = expectedHash.slice(0, 16);
      return extractedHash.slice(0, 16).equals(expectedPrefix);
    }
  }
  
  /**
   * Get info about current watermark configuration
   * @returns {Promise<Object>}
   */
  async getInfo() {
    const availability = await checkSilentCipherAvailable();
    
    return {
      configuredMethod: this.method,
      silentcipherAvailable: availability.available,
      silentcipherMessage: availability.message,
      spreadSpectrumAvailable: true, // Always available
      effectiveMethod: this.method === 'auto' 
        ? (availability.available ? 'silentcipher' : 'spread')
        : this.method
    };
  }
}

// Export class and utilities
module.exports = {
  UnifiedWatermark,
  getWatermarkMethod,
  checkSilentCipherAvailable,
  resetAvailabilityCache,
  
  // Re-export underlying implementations for direct access if needed
  OrbitWatermark,
  silentcipher
};
