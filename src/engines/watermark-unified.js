/**
 * ORBIT Unified Watermark Engine
 * 
 * Unified interface for AudioSeal (Primary Neural) and Perth (Fallback Neural) watermarking
 * 
 * Architecture:
 * 1. Primary: AudioSeal (Meta FAIR) with 40-bit (5-byte) BLAKE3 frame multiplexing
 * 2. Fallback: Perth (Resemble AI) perceptual neural watermarking
 * 3. Respects ORBIT_WATERMARK_METHOD env var configuration:
 *    - "audioseal" → AudioSeal only (fails if unavailable)
 *    - "perth"     → Perth only (fallback engine only)
 *    - "auto"      → Try AudioSeal first, fall back to Perth (default)
 * 
 * @module engines/watermark-unified
 */

const audioseal = require('./audioseal');
const perth = require('./perth');

/**
 * Watermark method configuration
 * @type {'audioseal'|'perth'|'auto'}
 */
const WATERMARK_METHOD = process.env.ORBIT_WATERMARK_METHOD || 'auto';

let audiosealAvailability = null;
let perthAvailability = null;

/**
 * Check if AudioSeal is available (cached after first check)
 * @returns {Promise<{available: boolean, message: string}>}
 */
async function checkAudioSealAvailable() {
  if (audiosealAvailability !== null) {
    return audiosealAvailability;
  }
  
  try {
    const result = await audioseal.checkPythonEnvironment();
    audiosealAvailability = {
      checked: true,
      available: !!result.available,
      message: result.message || 'AudioSeal environment ready',
      details: result.details
    };
  } catch (error) {
    audiosealAvailability = {
      checked: true,
      available: false,
      message: `AudioSeal check failed: ${error.message}`
    };
  }
  
  return audiosealAvailability;
}

/**
 * Check if Perth is available (cached after first check)
 * @returns {Promise<{available: boolean, message: string}>}
 */
async function checkPerthAvailable() {
  if (perthAvailability !== null) {
    return perthAvailability;
  }
  
  try {
    const result = await perth.checkPythonEnvironment();
    perthAvailability = {
      checked: true,
      available: !!result.available,
      message: result.message || 'Perth environment ready',
      details: result.details
    };
  } catch (error) {
    perthAvailability = {
      checked: true,
      available: false,
      message: `Perth check failed: ${error.message}`
    };
  }
  
  return perthAvailability;
}

/**
 * Check overall neural watermark availability
 */
async function checkWatermarkAvailable() {
  const asAvail = await checkAudioSealAvailable();
  const perthAvail = await checkPerthAvailable();
  return {
    available: asAvail.available || perthAvail.available,
    audioseal: asAvail,
    perth: perthAvail,
    primary: asAvail.available ? 'audioseal' : (perthAvail.available ? 'perth' : null)
  };
}

/**
 * Reset availability cache (useful for testing)
 */
function resetAvailabilityCache() {
  audiosealAvailability = null;
  perthAvailability = null;
}

/**
 * Get current watermark method configuration
 * @returns {'audioseal'|'perth'|'auto'}
 */
function getWatermarkMethod() {
  return WATERMARK_METHOD;
}

/**
 * Unified Watermark Engine
 */
class UnifiedWatermark {
  /**
   * @param {string} secretKey - Secret key (for backward compatibility & key-derived permutations)
   * @param {Object} options - Configuration options
   * @param {string} options.method - Override ORBIT_WATERMARK_METHOD ('audioseal'|'perth'|'auto')
   */
  constructor(secretKey, options = {}) {
    this.secretKey = secretKey;
    this.method = options.method || WATERMARK_METHOD;
    this.options = options;
  }
  
  /**
   * Create watermark payload structure
   * @param {Object} data - Payload data
   * @param {string} data.platform - Platform ID
   * @param {number} data.timestamp - Unix timestamp in ms
   * @param {Buffer} data.payloadHash - Hash of full CBOR payload (at least 5 bytes)
   * @returns {Object} Payload object
   */
  createPayload(data) {
    const payloadHash = data.payloadHash || Buffer.alloc(16);
    return {
      platform: data.platform || 'unknown',
      timestamp: data.timestamp || Date.now(),
      payloadHash: payloadHash.slice(0, 16),
      hashPrefix: payloadHash.slice(0, 5)
    };
  }
  
  /**
   * Embed watermark into audio
   * 
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {Object} payloadData - Payload data with payloadHash (5 bytes for AudioSeal)
   * @param {Object} options - Embed options
   * @returns {Promise<{
   *   success: boolean,
   *   watermarkedAudio: Buffer,
   *   method: 'audioseal'|'perth',
   *   watermarkPayload: Object,
   *   sdr?: number,
   *   fallbackUsed?: boolean,
   *   fallbackReason?: string,
   *   processingTimeMs: number
   * }>}
   */
  async embed(audioBuffer, payloadData, options = {}) {
    const startTime = Date.now();
    const verbose = options.verbose || process.env.ORBIT_ML_VERBOSE === 'true';
    const watermarkPayload = this.createPayload(payloadData);
    
    const shouldTryAudioSeal = this.method === 'audioseal' || this.method === 'auto' || this.method === 'neural';
    const shouldTryPerth = this.method === 'perth' || this.method === 'auto';
    
    // 1. Try Primary: AudioSeal (40-bit BLAKE3)
    if (shouldTryAudioSeal) {
      try {
        const availability = await checkAudioSealAvailable();
        
        if (!availability.available) {
          if (this.method === 'audioseal') {
            throw new Error(`AudioSeal not available: ${availability.message}`);
          }
          if (verbose) {
            console.log(`[WARN] AudioSeal not available, falling back to Perth: ${availability.message}`);
          }
        } else {
          // AudioSeal embeds a 5-byte BLAKE3 payload
          const result = await audioseal.embed(audioBuffer, payloadData.payloadHash, {
            verbose,
          });
          
          if (result.success) {
            return {
              success: true,
              watermarkedAudio: result.watermarkedAudio,
              method: 'audioseal',
              watermarkPayload,
              sdr: result.sdr,
              duration: result.duration,
              fallbackUsed: false,
              processingTimeMs: Date.now() - startTime
            };
          }
        }
      } catch (error) {
        if (this.method === 'audioseal') {
          throw error;
        }
        if (verbose) {
          console.log(`[WARN] AudioSeal embed failed: ${error.message}. Falling back to Perth...`);
        }
        if (!shouldTryPerth) {
          throw error;
        }
      }
    }
    
    // 2. Try Fallback: Perth
    if (shouldTryPerth) {
      try {
        const perthAvail = await checkPerthAvailable();
        if (!perthAvail.available && this.method === 'perth') {
          throw new Error(`Perth not available: ${perthAvail.message}`);
        }
        
        const result = await perth.embed(audioBuffer, { verbose });
        
        return {
          success: true,
          watermarkedAudio: result.watermarkedAudio,
          method: 'perth',
          watermarkPayload,
          sdr: result.sdr,
          duration: result.duration,
          fallbackUsed: shouldTryAudioSeal,
          fallbackReason: shouldTryAudioSeal ? 'audioseal_failed' : undefined,
          processingTimeMs: Date.now() - startTime
        };
      } catch (error) {
        throw new Error(`Watermark embed failed on all engines: ${error.message}`);
      }
    }
    
    throw new Error('No watermark method available');
  }
  
  /**
   * Extract watermark from audio
   * 
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {Object} options - Extract options
   * @returns {Promise<{
   *   success: boolean,
   *   detected: boolean,
   *   method: 'audioseal'|'perth'|null,
   *   confidence: number,
   *   payloadHash?: Buffer,
   *   crcValid?: boolean,
   *   fallbackUsed?: boolean,
   *   processingTimeMs: number
   * }>}
   */
  async extract(audioBuffer, options = {}) {
    const startTime = Date.now();
    const verbose = options.verbose || process.env.ORBIT_ML_VERBOSE === 'true';
    
    const shouldTryAudioSeal = this.method === 'audioseal' || this.method === 'auto' || this.method === 'neural';
    const shouldTryPerth = this.method === 'perth' || this.method === 'auto';
    
    let audiosealResult = null;
    let perthResult = null;
    
    // 1. Try AudioSeal extraction
    if (shouldTryAudioSeal) {
      try {
        const availability = await checkAudioSealAvailable();
        
        if (availability.available) {
          const result = await audioseal.extract(audioBuffer, { verbose });
          
          if (result.success && result.detected) {
            audiosealResult = {
              success: true,
              detected: true,
              method: 'audioseal',
              confidence: result.confidence,
              payloadHash: result.payloadHash, // 5-byte BLAKE3 hash
              crcValid: result.crcValid,
              slotsDetected: result.slotsDetected,
              duration: result.duration,
              fallbackUsed: false,
              processingTimeMs: Date.now() - startTime
            };
            
            if (!options.tryBothMethods) {
              return audiosealResult;
            }
          }
        }
      } catch (error) {
        if (this.method === 'audioseal') {
          throw error;
        }
        if (verbose) {
          console.log(`[WARN] AudioSeal extract error: ${error.message}`);
        }
      }
    }
    
    // 2. Try Perth extraction (if AudioSeal not detected or in perth/tryBothMethods mode)
    if (shouldTryPerth) {
      try {
        const availability = await checkPerthAvailable();
        if (availability.available) {
          const result = await perth.extract(audioBuffer, { verbose });
          if (result.success && result.detected) {
            perthResult = {
              success: true,
              detected: true,
              method: 'perth',
              confidence: result.confidence,
              payloadHash: null,
              duration: result.duration,
              fallbackUsed: shouldTryAudioSeal && !audiosealResult,
              processingTimeMs: Date.now() - startTime
            };
          }
        }
      } catch (error) {
        if (verbose) {
          console.log(`[WARN] Perth extract error: ${error.message}`);
        }
      }
    }
    
    if (audiosealResult && audiosealResult.detected) {
      if (perthResult && options.tryBothMethods) {
        audiosealResult.perthResult = perthResult;
      }
      return audiosealResult;
    }
    
    if (perthResult && perthResult.detected) {
      return perthResult;
    }
    
    return {
      success: true,
      detected: false,
      method: null,
      confidence: 0,
      fallbackUsed: shouldTryAudioSeal && shouldTryPerth,
      processingTimeMs: Date.now() - startTime
    };
  }
  
  /**
   * Fast detection convenience wrapper
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
   * Check if extracted hash matches expected hash
   * @param {Buffer} extractedHash 
   * @param {Buffer} expectedHash 
   * @param {string} method 
   * @returns {boolean}
   */
  static hashMatches(extractedHash, expectedHash, _method = 'audioseal') {
    if (!extractedHash || !expectedHash) return false;
    return audioseal.hashMatches(extractedHash, expectedHash);
  }
  
  /**
   * Get engine diagnostic info
   */
  async getInfo() {
    const asAvail = await checkAudioSealAvailable();
    const pAvail = await checkPerthAvailable();
    
    return {
      configuredMethod: this.method,
      audiosealAvailable: asAvail.available,
      audiosealMessage: asAvail.message,
      perthAvailable: pAvail.available,
      perthMessage: pAvail.message,
      effectiveMethod: this.method === 'auto'
        ? (asAvail.available ? 'audioseal' : (pAvail.available ? 'perth' : 'none'))
        : this.method
    };
  }
}

module.exports = {
  UnifiedWatermark,
  getWatermarkMethod,
  checkAudioSealAvailable,
  checkPerthAvailable,
  checkWatermarkAvailable,
  resetAvailabilityCache,
  audioseal,
  perth,
  
  // Backward compatibility alias
  checkSilentCipherAvailable: checkAudioSealAvailable,
  silentcipher: audioseal,
};
