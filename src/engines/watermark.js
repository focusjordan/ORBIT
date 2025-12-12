/**
 * ORBIT Watermark Engine
 * Spread spectrum audio watermarking implementation
 * 
 * This v1 implementation uses spread spectrum and will become a fallback
 * when neural watermarking (SilentCipher/WMCodec) is added in Sessions 22-23.
 * 
 * Key features:
 * - Loudness-aware embedding (imperceptible in quiet audio)
 * - Repeating pattern every 30 seconds (enables snippet detection)
 * - Simple, swappable interface for v2 neural upgrade
 */

const crypto = require('crypto');

class OrbitWatermark {
  /**
   * @param {string} secretKey - Secret key for spreading sequence generation
   * @param {Object} options - Configuration options
   * @param {number} options.chipRate - Samples per bit (default: 1000)
   * @param {number} options.strength - Embed amplitude (default: 0.005)
   * @param {number} options.repeatInterval - Samples between repeats (default: 30s at 44.1kHz)
   * @param {number} options.searchInterval - Samples between extraction attempts (default: 5s at 44.1kHz)
   */
  constructor(secretKey, options = {}) {
    if (!secretKey) {
      throw new Error('Secret key is required for watermarking');
    }
    
    this.secretKey = secretKey;
    this.CHIP_RATE = options.chipRate || 1000;       // Samples per bit
    this.EMBED_STRENGTH = options.strength || 0.005; // Amplitude (imperceptible)
    this.REPEAT_INTERVAL = options.repeatInterval || 30 * 44100; // Repeat every 30 seconds
    this.SEARCH_INTERVAL = options.searchInterval || 5 * 44100;  // Search every 5 seconds
    this.MAGIC = Buffer.from('ORBT');                // Magic bytes
    this.VERSION = 1;
    this.PAYLOAD_SIZE = 64;                          // Fixed payload size in bytes
  }
  
  /**
   * Calculate RMS (Root Mean Square) loudness of audio
   * Used for loudness-aware embedding strength adjustment
   * @param {Float32Array} samples - Audio samples
   * @returns {number} RMS value (0-1 range)
   */
  _calculateRMS(samples) {
    const sumSquares = samples.reduce((sum, sample) => sum + sample * sample, 0);
    return Math.sqrt(sumSquares / samples.length);
  }
  
  /**
   * Generate pseudo-random spreading sequence using HMAC
   * Deterministic - same seed always produces same sequence
   * @param {string} seed - Seed for PRNG
   * @param {number} length - Sequence length
   * @returns {Float32Array} Spreading sequence (-1 or +1 values)
   */
  _generateSpreadSequence(seed, length) {
    const sequence = new Float32Array(length);
    let counter = 0;
    
    while (counter < length) {
      // Use HMAC-SHA256 as PRNG (deterministic and cryptographically secure)
      const hmac = crypto.createHmac('sha256', this.secretKey);
      hmac.update(`${seed}:${Math.floor(counter / 32)}`);
      const hash = hmac.digest();
      
      // Each byte of hash gives us one spread value
      for (let i = 0; i < hash.length && counter < length; i++) {
        sequence[counter] = (hash[i] & 1) ? 1 : -1;
        counter++;
      }
    }
    
    return sequence;
  }
  
  /**
   * Convert bytes to bits array
   * @param {Buffer} buffer
   * @returns {number[]} Array of 0s and 1s
   */
  _bytesToBits(buffer) {
    const bits = [];
    for (const byte of buffer) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }
    return bits;
  }
  
  /**
   * Convert bits array to bytes
   * @param {number[]} bits - Array of 0s and 1s
   * @returns {Buffer}
   */
  _bitsToBytes(bits) {
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8 && i + j < bits.length; j++) {
        byte = (byte << 1) | (bits[i + j] > 0 ? 1 : 0);
      }
      bytes.push(byte);
    }
    return Buffer.from(bytes);
  }
  
  /**
   * CRC16 implementation (CCITT polynomial)
   * Used for payload integrity verification
   * @param {Buffer} buffer
   * @returns {number} 16-bit checksum
   */
  _crc16(buffer) {
    let crc = 0xFFFF;
    for (const byte of buffer) {
      crc ^= byte << 8;
      for (let i = 0; i < 8; i++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
      }
    }
    return crc & 0xFFFF;
  }
  
  /**
   * Create watermark payload from metadata
   * Fixed 64-byte structure: magic + version + timestamp + hashes + CRC
   * @param {Object} data - Payload data
   * @param {string} data.platform - Platform ID
   * @param {number} data.timestamp - Unix timestamp in ms
   * @param {Buffer} data.payloadHash - Hash of full CBOR payload (16 bytes)
   * @returns {Buffer} 64-byte binary payload
   */
  createPayload(data) {
    const payload = Buffer.alloc(this.PAYLOAD_SIZE);
    let offset = 0;
    
    // Magic bytes (4) - "ORBT"
    this.MAGIC.copy(payload, offset);
    offset += 4;
    
    // Version (1)
    payload.writeUInt8(this.VERSION, offset);
    offset += 1;
    
    // Flags (1) - reserved for future use
    payload.writeUInt8(0, offset);
    offset += 1;
    
    // Timestamp (8 bytes - milliseconds since epoch)
    const timestamp = BigInt(data.timestamp || Date.now());
    payload.writeBigUInt64BE(timestamp, offset);
    offset += 8;
    
    // Platform ID hash (8 bytes - truncated SHA-256)
    const platformHash = crypto.createHash('sha256')
      .update(data.platform || 'unknown')
      .digest()
      .slice(0, 8);
    platformHash.copy(payload, offset);
    offset += 8;
    
    // Full payload hash pointer (16 bytes - links to ledger entry)
    const payloadHash = data.payloadHash || crypto.randomBytes(16);
    if (Buffer.isBuffer(payloadHash)) {
      payloadHash.slice(0, 16).copy(payload, offset);
    }
    offset += 16;
    
    // Reserved space (24 bytes) - for future extensions
    // Already zeros from Buffer.alloc
    offset += 24;
    
    // CRC16 checksum of payload (last 2 bytes, at position 62-63)
    const crc = this._crc16(payload.slice(0, 62));
    payload.writeUInt16BE(crc, 62);
    
    return payload;
  }
  
  /**
   * Helper: Embed watermark at specific offset
   * @param {Float32Array} audioSamples - Audio samples (modified in place)
   * @param {number} offset - Sample offset to start embedding
   * @param {Buffer} payload - Payload to embed (64 bytes)
   * @param {number} strength - Embed strength (optional, calculated if not provided)
   */
  embedAtOffset(audioSamples, offset, payload, strength = null) {
    const bits = this._bytesToBits(payload);
    const requiredSamples = bits.length * this.CHIP_RATE;
    
    if (offset + requiredSamples > audioSamples.length) {
      return; // Not enough space at this offset, skip
    }
    
    // Calculate embed strength if not provided (loudness-aware)
    if (strength === null) {
      const segment = audioSamples.slice(offset, offset + requiredSamples);
      const rms = this._calculateRMS(segment);
      // Adaptive strength: use at most 10% of local RMS, capped at EMBED_STRENGTH
      // Minimum floor of 0.001 to ensure embedding even in silence
      const adaptiveStrength = rms > 0 ? Math.min(this.EMBED_STRENGTH, rms * 0.1) : this.EMBED_STRENGTH;
      strength = Math.max(0.001, adaptiveStrength);
    }
    
    // Generate spreading sequence (unique per offset)
    const spreadSeq = this._generateSpreadSequence(`embed:${offset}`, bits.length * this.CHIP_RATE);
    
    // Embed each bit using spread spectrum
    for (let bitIdx = 0; bitIdx < bits.length; bitIdx++) {
      const bitValue = bits[bitIdx] ? 1 : -1;
      const startSample = offset + (bitIdx * this.CHIP_RATE);
      
      for (let chip = 0; chip < this.CHIP_RATE; chip++) {
        const sampleIdx = startSample + chip;
        const spreadIdx = bitIdx * this.CHIP_RATE + chip;
        
        // Add spread spectrum signal
        audioSamples[sampleIdx] += spreadSeq[spreadIdx] * bitValue * strength;
        
        // Clip to valid range [-1, 1]
        audioSamples[sampleIdx] = Math.max(-1, Math.min(1, audioSamples[sampleIdx]));
      }
    }
  }
  
  /**
   * Embed payload into audio samples with repeating pattern
   * Main embedding function with loudness-aware strength and repeating pattern
   * @param {Float32Array} audioSamples - PCM audio samples (mono, normalized -1 to 1)
   * @param {Buffer} payload - Binary payload to embed (64 bytes)
   * @returns {Float32Array} Watermarked audio samples
   */
  embed(audioSamples, payload) {
    if (payload.length !== this.PAYLOAD_SIZE) {
      throw new Error(`Payload must be ${this.PAYLOAD_SIZE} bytes`);
    }
    
    const requiredSamples = this.PAYLOAD_SIZE * 8 * this.CHIP_RATE;
    
    if (audioSamples.length < requiredSamples) {
      throw new Error(
        `Audio too short. Need ${requiredSamples} samples (${(requiredSamples / 44100).toFixed(1)}s at 44.1kHz), ` +
        `got ${audioSamples.length} samples`
      );
    }
    
    const output = new Float32Array(audioSamples);
    
    // Calculate overall RMS for consistent strength across repeats
    const rms = this._calculateRMS(audioSamples);
    const adaptiveStrength = rms > 0 ? Math.min(this.EMBED_STRENGTH, rms * 0.1) : this.EMBED_STRENGTH;
    const safeStrength = Math.max(0.001, adaptiveStrength);
    
    // Embed watermark at start, then every REPEAT_INTERVAL samples
    let offset = 0;
    let embedCount = 0;
    
    while (offset + requiredSamples <= audioSamples.length) {
      this.embedAtOffset(output, offset, payload, safeStrength);
      embedCount++;
      offset += this.REPEAT_INTERVAL;
    }
    
    console.log(`Embedded ${embedCount} watermark instance(s) across ${(audioSamples.length / 44100).toFixed(1)}s audio`);
    
    return output;
  }
  
  /**
   * Get required sample count for embedding
   * @returns {number} Minimum samples needed
   */
  getRequiredSamples() {
    return this.PAYLOAD_SIZE * 8 * this.CHIP_RATE;
  }
  
  /**
   * Get minimum audio duration in seconds (at 44.1kHz)
   * @returns {number}
   */
  getMinimumDuration() {
    return this.getRequiredSamples() / 44100;
  }
  
  // ============================================
  // EXTRACTION METHODS (Session 7)
  // ============================================
  
  /**
   * Verify CRC16 of payload
   * @param {Buffer} payload
   * @returns {boolean}
   */
  _verifyCrc(payload) {
    if (!payload || payload.length < this.PAYLOAD_SIZE) return false;
    const storedCrc = payload.readUInt16BE(62);
    const calculatedCrc = this._crc16(payload.slice(0, 62));
    return storedCrc === calculatedCrc;
  }
  
  /**
   * Extract payload at specific offset
   * Each embedded instance uses offset-specific spreading sequence
   * @param {Float32Array} audioSamples - Watermarked PCM samples
   * @param {number} offset - Sample offset where watermark starts
   * @param {number} payloadBytes - Expected payload size (default 64)
   * @returns {{payload: Buffer|null, confidence: number, valid: boolean, offset: number}}
   */
  extractAtOffset(audioSamples, offset, payloadBytes = 64) {
    const bitCount = payloadBytes * 8;
    const requiredSamples = bitCount * this.CHIP_RATE;
    
    // Check if we have enough samples at this offset
    if (offset + requiredSamples > audioSamples.length) {
      return { payload: null, confidence: 0, valid: false, offset };
    }
    
    const bits = [];
    const confidences = [];
    
    // Generate same spreading sequence used at this offset during embedding
    // CRITICAL: Must match embedAtOffset's seed pattern exactly
    const spreadSeq = this._generateSpreadSequence(`embed:${offset}`, bitCount * this.CHIP_RATE);
    
    // Correlate to extract each bit
    for (let bitIdx = 0; bitIdx < bitCount; bitIdx++) {
      let correlation = 0;
      const startSample = offset + (bitIdx * this.CHIP_RATE);
      
      for (let chip = 0; chip < this.CHIP_RATE; chip++) {
        const sampleIdx = startSample + chip;
        const spreadIdx = bitIdx * this.CHIP_RATE + chip;
        
        correlation += audioSamples[sampleIdx] * spreadSeq[spreadIdx];
      }
      
      // Normalize correlation by chip rate
      const normalizedCorrelation = correlation / this.CHIP_RATE;
      
      // Bit decision: positive correlation = 1, negative = 0
      bits.push(correlation > 0 ? 1 : 0);
      confidences.push(Math.abs(normalizedCorrelation));
    }
    
    const payload = this._bitsToBytes(bits);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    
    // Verify magic bytes ("ORBT") and CRC16 checksum
    const hasMagic = payload.length >= 4 && payload.slice(0, 4).equals(this.MAGIC);
    const hasValidCrc = this._verifyCrc(payload);
    
    return {
      payload,
      confidence: avgConfidence,
      valid: hasMagic && hasValidCrc,
      offset
    };
  }
  
  /**
   * Extract payload from watermarked audio (fast path - tries offset 0)
   * For full search across multiple offsets, use extractWithSearch()
   * @param {Float32Array} audioSamples - Watermarked PCM samples
   * @param {number} payloadBytes - Expected payload size (default 64)
   * @returns {{payload: Buffer|null, confidence: number, valid: boolean, offset: number}}
   */
  extract(audioSamples, payloadBytes = 64) {
    // Fast path: try offset 0 first (most common case - full file from beginning)
    return this.extractAtOffset(audioSamples, 0, payloadBytes);
  }
  
  /**
   * Extract with offset search - enables snippet/clip detection
   * Tries multiple starting positions to find watermark
   * Leverages the repeating pattern from embed()
   * @param {Float32Array} audioSamples - Watermarked PCM samples
   * @param {number} payloadBytes - Expected payload size (default 64)
   * @param {number} maxSearchDuration - Max samples to search (default: 2 repeat intervals)
   * @returns {{payload: Buffer|null, confidence: number, valid: boolean, offset: number, attempts: number}}
   */
  extractWithSearch(audioSamples, payloadBytes = 64, maxSearchDuration = null) {
    const maxSearch = maxSearchDuration || (this.REPEAT_INTERVAL * 2);
    const searchLimit = Math.min(audioSamples.length, maxSearch);
    const requiredSamples = payloadBytes * 8 * this.CHIP_RATE;
    
    const validResults = [];
    let offset = 0;
    let attemptCount = 0;
    
    // Try extraction at intervals (0, 5s, 10s, 15s, etc.)
    while (offset + requiredSamples <= audioSamples.length && offset < searchLimit) {
      const result = this.extractAtOffset(audioSamples, offset, payloadBytes);
      attemptCount++;
      
      if (result.valid) {
        validResults.push(result);
      }
      
      offset += this.SEARCH_INTERVAL;
    }
    
    // Return best result (highest confidence)
    if (validResults.length > 0) {
      const best = validResults.sort((a, b) => b.confidence - a.confidence)[0];
      return { ...best, attempts: attemptCount };
    }
    
    return { 
      payload: null, 
      confidence: 0, 
      valid: false, 
      offset: -1,
      attempts: attemptCount 
    };
  }
  
  /**
   * Parse extracted payload into structured data
   * @param {Buffer} payload - Extracted payload
   * @returns {Object|null} Parsed payload data, or null if invalid
   */
  parsePayload(payload) {
    if (!payload || payload.length < this.PAYLOAD_SIZE) {
      return null;
    }
    
    // Check magic bytes
    const hasMagic = payload.slice(0, 4).equals(this.MAGIC);
    if (!hasMagic) {
      return null;
    }
    
    return {
      magic: payload.slice(0, 4).toString(),
      version: payload.readUInt8(4),
      flags: payload.readUInt8(5),
      timestamp: Number(payload.readBigUInt64BE(6)),
      platformHash: payload.slice(14, 22),
      payloadHash: payload.slice(22, 38),
      crcValid: this._verifyCrc(payload)
    };
  }
  
  /**
   * Check if audio contains a valid ORBIT watermark
   * Uses search to handle clips/snippets
   * @param {Float32Array} audioSamples
   * @returns {{detected: boolean, confidence: number, offset: number}}
   */
  detect(audioSamples) {
    const result = this.extractWithSearch(audioSamples);
    return {
      detected: result.valid,
      confidence: result.confidence,
      offset: result.offset
    };
  }
}

module.exports = OrbitWatermark;
