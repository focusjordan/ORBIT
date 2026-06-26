/**
 * ORBIT SDK
 * Client library for interacting with the ORBIT audio provenance protocol
 * 
 * @module @ohnrshyp/orbit-sdk
 * 
 * Usage:
 * ```javascript
 * const { OrbitClient } = require('@ohnrshyp/orbit-sdk');
 * 
 * const client = new OrbitClient({
 *   apiUrl: 'https://orbit.ohnrshyp.com',
 *   platformId: 'your-platform-id',
 *   privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
 * });
 * 
 * // Verify audio provenance
 * const result = await client.verify(audioBuffer);
 * 
 * // Register new audio
 * const registration = await client.register(audioBuffer, metadata, ownerId);
 * ```
 */

const nacl = require('tweetnacl');
const cbor = require('cbor');
const FormData = require('form-data');
const crypto = require('crypto');

/**
 * ORBIT API Client
 * 
 * Provides a simple interface for interacting with ORBIT's audio provenance
 * and metadata transfer protocol.
 */
class OrbitClient {
  /**
   * Create a new ORBIT client
   * 
   * @param {Object} config - Client configuration
   * @param {string} config.apiUrl - Base URL of ORBIT API (e.g., 'https://orbit.ohnrshyp.com')
   * @param {string} config.platformId - Your registered platform ID
   * @param {Buffer} config.privateKey - Your Ed25519 private key (64 bytes)
   * @param {string} [config.apiKey] - Optional API key for rate limiting/billing
   * 
   * @example
   * const client = new OrbitClient({
   *   apiUrl: 'https://orbit.ohnrshyp.com',
   *   platformId: 'ohnrshyp',
   *   privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
   * });
   */
  constructor(config) {
    if (!config.apiUrl) {
      throw new Error('apiUrl is required');
    }
    if (!config.platformId) {
      throw new Error('platformId is required');
    }
    if (!config.privateKey) {
      throw new Error('privateKey is required');
    }
    if (!Buffer.isBuffer(config.privateKey)) {
      throw new Error('privateKey must be a Buffer');
    }
    if (config.privateKey.length !== 64) {
      throw new Error('privateKey must be 64 bytes (Ed25519 secret key)');
    }

    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.platformId = config.platformId;
    this.privateKey = config.privateKey;
    this.apiKey = config.apiKey || null;
  }

  /**
   * Sign data with Ed25519 private key
   * @private
   * @param {Buffer|Object} data - Data to sign
   * @returns {Buffer} 64-byte signature
   */
  _sign(data) {
    let dataBuffer;
    
    if (Buffer.isBuffer(data)) {
      dataBuffer = data;
    } else if (typeof data === 'object' && data !== null) {
      // Remove signature field if present, then encode
      const { signature, ...unsigned } = data;
      dataBuffer = cbor.encode(unsigned);
    } else {
      throw new Error('Data must be Buffer or Object');
    }
    
    const signature = nacl.sign.detached(
      new Uint8Array(dataBuffer),
      new Uint8Array(this.privateKey)
    );
    
    return Buffer.from(signature);
  }

  /**
   * Make an authenticated request to ORBIT API
   * @private
   * @param {string} method - HTTP method
   * @param {string} path - API path (e.g., '/orbit/v1/verify')
   * @param {Object|Buffer} body - Request body
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.isFormData] - Whether body is FormData
   * @returns {Promise<Object>} Parsed response
   */
  async _request(method, path, body, options = {}) {
    const url = `${this.apiUrl}${path}`;
    
    // Build headers
    const headers = {
      'X-ORBIT-Platform': this.platformId,
    };

    if (this.apiKey) {
      headers['X-ORBIT-API-Key'] = this.apiKey;
    }

    let requestBody;
    let signature;

    if (options.isFormData) {
      // For multipart/form-data (register endpoint)
      // Body is already a FormData object
      requestBody = body;
      Object.assign(headers, body.getHeaders());
      // Signature is already added to headers by the caller
    } else {
      // For CBOR/JSON requests
      if (body) {
        // Sign the body
        signature = this._sign(body);
        headers['X-ORBIT-Signature'] = signature.toString('base64');
        
        // Encode as CBOR
        requestBody = cbor.encode(body);
        headers['Content-Type'] = 'application/cbor';
      }
    }

    // Make request
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      duplex: options.isFormData ? 'half' : undefined,
    });

    // Parse response based on content-type
    const contentType = response.headers.get('content-type') || '';
    let responseData;
    
    if (contentType.includes('application/cbor')) {
      const responseBuffer = await response.arrayBuffer();
      responseData = cbor.decode(Buffer.from(responseBuffer));
    } else if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      // Fallback: try JSON first, then text
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        throw new Error(`Unexpected response format: ${text.slice(0, 200)}`);
      }
    }

    // Handle errors
    if (!response.ok) {
      const error = new Error(
        responseData.message || responseData.error || `HTTP ${response.status}`
      );
      error.status = response.status;
      error.code = responseData.error;
      error.details = responseData.details;
      throw error;
    }

    return responseData;
  }

  /**
   * Register new audio with ORBIT
   * 
   * Registers audio with embedded watermark and records provenance in the ledger.
   * Returns the watermarked audio file for storage.
   * 
   * @param {Buffer} audioBuffer - Binary audio data (MP3, WAV, FLAC, etc.)
   * @param {Object} metadata - Audio metadata
   * @param {string} metadata.title - Track title (required)
   * @param {string} metadata.artist - Artist name (required)
   * @param {number} [metadata.duration_ms] - Duration in milliseconds (optional - ORBIT extracts from audio)
   * @param {string} [metadata.isrc] - International Standard Recording Code
   * @param {string} [metadata.upc] - Universal Product Code
   * @param {string} [metadata.p_line] - ℗ Sound recording copyright
   * @param {string} [metadata.c_line] - © Composition copyright
   * @param {string} [metadata.primary_genre] - Primary genre
   * @param {string} [metadata.language] - ISO 639-1 language code
   * @param {number} [metadata.bitrate] - Audio bitrate in kbps
   * @param {number} [metadata.sample_rate] - Sample rate in Hz
   * @param {number} [metadata.channels] - Number of audio channels
   * @param {string} [metadata.format] - File format (mp3, wav, flac, aac)
   * @param {string} [metadata.album_title] - Album/EP name
   * @param {number} [metadata.track_number] - Position on album
   * @param {string} [metadata.secondary_genre] - Additional genre
   * @param {string} [metadata.release_date] - Release date (ISO 8601)
   * @param {string} [metadata.label] - Record label name
   * @param {string} [metadata.parental_advisory] - "explicit", "clean", or "none"
   * @param {Array<string>} [metadata.featured_artists] - Featured artist names
   * @param {Array<string>} [metadata.composers] - Music composers
   * @param {Array<string>} [metadata.lyricists] - Lyric writers
   * @param {Array<string>} [metadata.producers] - Producers
   * @param {Array<string>} [metadata.territories] - ISO 3166-1 alpha-2 country codes
   * @param {string} ownerId - UUID of the owner (user/artist ID from your system)
   * 
   * @returns {Promise<Object>} Registration result
   * @returns {boolean} result.success - Whether registration succeeded
   * @returns {number} result.registration_id - Unique registration ID
   * @returns {Buffer} result.fingerprint_hash - 32-byte fingerprint hash
   * @returns {Buffer} result.watermark_hash - 16-byte watermark hash
   * @returns {Buffer} result.watermarked_audio - Audio with embedded watermark
   * @returns {Buffer} result.entry_hash - Ledger entry hash
   * @returns {string} result.registered_at - ISO 8601 timestamp
   * 
   * @throws {Error} If audio or required metadata is missing
   * @throws {Error} If registration fails
   * 
   * @example
   * const audioBuffer = fs.readFileSync('track.mp3');
   * const result = await client.register(audioBuffer, {
   *   title: 'Midnight Drive',
   *   artist: 'The Neon Collective',
   *   duration_ms: 234567,
   *   isrc: 'USRC12345678',
   *   primary_genre: 'Electronic'
   * }, 'user-uuid-here');
   * 
   * // Store the watermarked audio
   * fs.writeFileSync('track-watermarked.mp3', result.watermarked_audio);
   */
  async register(audioBuffer, metadata, ownerId) {
    if (!Buffer.isBuffer(audioBuffer)) {
      throw new Error('audioBuffer must be a Buffer');
    }
    if (!metadata || typeof metadata !== 'object') {
      throw new Error('metadata must be an object');
    }
    if (!ownerId) {
      throw new Error('ownerId is required');
    }

    // Validate required fields (duration_ms is optional - ORBIT extracts from audio)
    const required = ['title', 'artist'];
    for (const field of required) {
      if (!metadata[field]) {
        throw new Error(`metadata.${field} is required`);
      }
    }

    // Build full metadata object
    const fullMetadata = {
      ...metadata,
      owner_id: ownerId
    };

    // Sign the metadata
    const signature = this._sign(fullMetadata);

    // Encode metadata as CBOR
    const metadataCbor = cbor.encode(fullMetadata);

    // Create multipart form
    const formData = new FormData();
    formData.append('metadata', metadataCbor, {
      filename: 'metadata.cbor',
      contentType: 'application/cbor'
    });
    formData.append('audio', audioBuffer, {
      filename: 'audio',
      contentType: 'application/octet-stream'
    });

    // Make request with signature in headers
    const headers = formData.getHeaders();
    headers['X-ORBIT-Platform'] = this.platformId;
    headers['X-ORBIT-Signature'] = signature.toString('base64');
    if (this.apiKey) {
      headers['X-ORBIT-API-Key'] = this.apiKey;
    }
    if (metadata.skip_ai_detection) {
      headers['X-Skip-AI-Detection'] = 'true';
    }

    const url = `${this.apiUrl}/orbit/v1/register`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData.getBuffer(), // Convert FormData to Buffer for fetch
      duplex: 'half'
    });

    // Parse response
    const contentType = response.headers.get('content-type') || '';
    let responseData;
    
    if (contentType.includes('application/cbor')) {
      const responseBuffer = await response.arrayBuffer();
      responseData = cbor.decode(Buffer.from(responseBuffer));
    } else if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        throw new Error(`Unexpected response format: ${text.slice(0, 200)}`);
      }
    }

    if (!response.ok) {
      const error = new Error(
        responseData.message || responseData.error || `HTTP ${response.status}`
      );
      error.status = response.status;
      error.code = responseData.error;
      error.details = responseData.details;
      throw error;
    }

    return responseData;
  }

  /**
   * Verify audio provenance
   * 
   * Verifies the authenticity and provenance of an audio file by checking
   * its fingerprint and watermark against the ORBIT ledger.
   * 
   * @param {Buffer} audioBuffer - Binary audio data to verify
   * 
   * @returns {Promise<Object>} Verification result
   * @returns {boolean} result.verified - Whether audio is registered in ORBIT
   * @returns {Buffer} result.fingerprint_hash - Generated fingerprint hash
   * @returns {Object} result.fingerprint_match - Match details
   * @returns {number} result.fingerprint_match.registration_id - ID of matching registration
   * @returns {number} result.fingerprint_match.similarity - Match confidence (0-1)
   * @returns {Object} result.watermark - Watermark extraction result
   * @returns {boolean} result.watermark.detected - Whether watermark was found
   * @returns {boolean} result.watermark.valid - Whether watermark is valid
   * @returns {Object} result.metadata - Registered metadata
   * @returns {Object} result.origin - Origin information
   * @returns {string} result.origin.platform - Platform where registered
   * @returns {string} result.origin.timestamp - Registration timestamp
   * @returns {boolean} result.origin.signature_valid - Whether signature is valid
   * @returns {Array} result.transfers - Transfer history
   * @returns {number|null} result.duplicate_of - Registration ID if duplicate
   * 
   * @throws {Error} If verification request fails
   * 
   * @example
   * const audioBuffer = fs.readFileSync('track.mp3');
   * const result = await client.verify(audioBuffer);
   * 
   * if (result.verified) {
   *   console.log(`Audio registered by ${result.origin.platform}`);
   *   console.log(`Title: ${result.metadata.title}`);
   *   console.log(`Artist: ${result.metadata.artist}`);
   * }
   * 
   * if (result.duplicate_of) {
   *   console.log(`This is a duplicate of registration ${result.duplicate_of}`);
   * }
   */
  async verify(audioBuffer) {
    if (!Buffer.isBuffer(audioBuffer)) {
      throw new Error('audioBuffer must be a Buffer');
    }

    // Encode audio as base64 for transport
    const body = {
      audio: audioBuffer.toString('base64')
    };

    return this._request('POST', '/orbit/v1/verify', body);
  }

  /**
   * Watermark-only verification
   * 
   * Extracts watermark from audio and looks up the matching registration
   * by hash prefix. No fingerprint, no AI metadata.
   * 
   * @param {Buffer} audioBuffer - Binary audio data to verify
   * 
   * @returns {Promise<Object>} Match result
   */
  async watermarkmatch(audioBuffer) {
    if (!Buffer.isBuffer(audioBuffer)) {
      throw new Error('audioBuffer must be a Buffer');
    }

    const body = {
      audio: audioBuffer.toString('base64')
    };

    return this._request('POST', '/orbit/v1/watermarkmatch', body);
  }

  /**
   * Initiate B2B transfer
   * 
   * Transfers ownership of a registered audio file to another platform.
   * Requires that you own the registration.
   * 
   * @param {number} registrationId - ID of registration to transfer
   * @param {string} toPlatform - Platform ID of recipient
   * 
   * @returns {Promise<Object>} Transfer initiation result
   * @returns {boolean} result.success - Whether transfer was initiated
   * @returns {number} result.transfer_id - Unique transfer ID
   * @returns {string} result.status - Transfer status ('pending')
   * @returns {string} result.expires_at - ISO 8601 expiration timestamp
   * @returns {boolean} result.recipient_notified - Whether recipient was notified
   * 
   * @throws {Error} If you don't own the registration
   * @throws {Error} If registration not found
   * @throws {Error} If transfer creation fails
   * 
   * @example
   * const result = await client.transfer(12345, 'partner-dsp');
   * console.log(`Transfer initiated: ${result.transfer_id}`);
   * // Recipient can now accept with: client.acceptTransfer(result.transfer_id)
   */
  async transfer(registrationId, toPlatform) {
    if (typeof registrationId !== 'number') {
      throw new Error('registrationId must be a number');
    }
    if (!toPlatform || typeof toPlatform !== 'string') {
      throw new Error('toPlatform must be a string');
    }

    const body = {
      registration_id: registrationId,
      to_platform: toPlatform
    };

    return this._request('POST', '/orbit/v1/transfer', body);
  }

  /**
   * Accept incoming transfer
   * 
   * Accepts a transfer initiated by another platform. Creates a new registration
   * for your platform with the complete provenance chain.
   * 
   * @param {number} transferId - ID of pending transfer
   * 
   * @returns {Promise<Object>} Transfer acceptance result
   * @returns {boolean} result.success - Whether transfer was accepted
   * @returns {boolean} result.accepted - Confirmation of acceptance
   * @returns {number} result.new_registration_id - Your new registration ID
   * @returns {Buffer} result.watermarked_audio - Re-watermarked audio
   * @returns {Object} result.metadata - Full metadata
   * @returns {Array} result.full_chain - Complete custody chain
   * 
   * @throws {Error} If transfer not found or expired
   * @throws {Error} If transfer not intended for your platform
   * @throws {Error} If acceptance fails
   * 
   * @example
   * // After receiving notification of pending transfer
   * const result = await client.acceptTransfer(67890);
   * 
   * // Store the re-watermarked audio
   * fs.writeFileSync('received-track.mp3', result.watermarked_audio);
   * 
   * // Your new registration ID
   * console.log(`New registration: ${result.new_registration_id}`);
   */
  async acceptTransfer(transferId) {
    if (typeof transferId !== 'number') {
      throw new Error('transferId must be a number');
    }

    const body = {
      transfer_id: transferId
    };

    return this._request('POST', '/orbit/v1/accept', body);
  }

  /**
   * Get custody chain for a fingerprint
   * 
   * Retrieves the complete provenance chain for an audio file, including
   * all registrations and transfers.
   * 
   * @param {Buffer|string} fingerprintHash - Fingerprint hash (32 bytes as Buffer or 64-char hex string)
   * 
   * @returns {Promise<Object>} Chain lookup result
   * @returns {Buffer} result.fingerprint_hash - Fingerprint hash
   * @returns {Array} result.registrations - All registrations with this fingerprint
   * @returns {Array} result.transfers - All transfers
   * @returns {Object} result.merkle_proof - Merkle proof of inclusion
   * 
   * @throws {Error} If fingerprint not found
   * @throws {Error} If fingerprint format is invalid
   * 
   * @example
   * // Using fingerprint hash from registration
   * const chain = await client.getChain(result.fingerprint_hash);
   * 
   * // Using hex string
   * const chain = await client.getChain('a1b2c3d4...');
   * 
   * console.log(`${chain.registrations.length} registration(s) found`);
   * console.log(`${chain.transfers.length} transfer(s) recorded`);
   */
  async getChain(fingerprintHash) {
    let hexFingerprint;

    if (Buffer.isBuffer(fingerprintHash)) {
      if (fingerprintHash.length !== 32) {
        throw new Error('fingerprintHash must be 32 bytes');
      }
      hexFingerprint = fingerprintHash.toString('hex');
    } else if (typeof fingerprintHash === 'string') {
      if (!/^[0-9a-fA-F]{64}$/.test(fingerprintHash)) {
        throw new Error('fingerprintHash must be 64 hexadecimal characters');
      }
      hexFingerprint = fingerprintHash;
    } else {
      throw new Error('fingerprintHash must be Buffer or hex string');
    }

    // GET request (no body, no signature)
    const url = `${this.apiUrl}/orbit/v1/chain/${hexFingerprint}`;
    const headers = {
      'X-ORBIT-Platform': this.platformId
    };
    if (this.apiKey) {
      headers['X-ORBIT-API-Key'] = this.apiKey;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    // Parse response
    const contentType = response.headers.get('content-type') || '';
    let responseData;
    
    if (contentType.includes('application/cbor')) {
      const responseBuffer = await response.arrayBuffer();
      responseData = cbor.decode(Buffer.from(responseBuffer));
    } else if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        throw new Error(`Unexpected response format: ${text.slice(0, 200)}`);
      }
    }

    if (!response.ok) {
      const error = new Error(
        responseData.message || responseData.error || `HTTP ${response.status}`
      );
      error.status = response.status;
      error.code = responseData.error;
      throw error;
    }

    return responseData;
  }

  // ============================================================================
  // Platform Management Endpoints
  // ============================================================================

  /**
   * List registrations for the authenticated platform
   * 
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=50] - Max results (1-100)
   * @param {number} [options.offset=0] - Pagination offset
   * 
   * @returns {Promise<Object>} Registration list
   * @returns {string} result.platform - Platform ID
   * @returns {number} result.total - Total registration count
   * @returns {Array} result.registrations - Registration records
   */
  async listRegistrations(options = {}) {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const url = `${this.apiUrl}/orbit/v1/registrations?limit=${limit}&offset=${offset}`;
    const body = {};
    const signature = this._sign(body);

    const headers = {
      'X-ORBIT-Platform': this.platformId,
      'X-ORBIT-Signature': signature.toString('base64'),
    };
    if (this.apiKey) headers['X-ORBIT-API-Key'] = this.apiKey;

    const response = await fetch(url, { method: 'GET', headers });

    const contentType = response.headers.get('content-type') || '';
    let responseData;
    if (contentType.includes('application/cbor')) {
      const buf = await response.arrayBuffer();
      responseData = cbor.decode(Buffer.from(buf));
    } else if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try { responseData = JSON.parse(text); } catch { throw new Error(`Unexpected response: ${text.slice(0, 200)}`); }
    }

    if (!response.ok) {
      const error = new Error(responseData.message || responseData.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = responseData.error;
      throw error;
    }

    return responseData;
  }

  /**
   * List pending inbound transfers for the authenticated platform
   * 
   * @returns {Promise<Object>} Pending transfers
   * @returns {string} result.platform - Platform ID
   * @returns {number} result.total - Count of pending transfers
   * @returns {Array} result.transfers - Pending transfer records
   */
  async listPendingTransfers() {
    const url = `${this.apiUrl}/orbit/v1/transfers/pending`;
    const body = {};
    const signature = this._sign(body);

    const headers = {
      'X-ORBIT-Platform': this.platformId,
      'X-ORBIT-Signature': signature.toString('base64'),
    };
    if (this.apiKey) headers['X-ORBIT-API-Key'] = this.apiKey;

    const response = await fetch(url, { method: 'GET', headers });

    const contentType = response.headers.get('content-type') || '';
    let responseData;
    if (contentType.includes('application/cbor')) {
      const buf = await response.arrayBuffer();
      responseData = cbor.decode(Buffer.from(buf));
    } else if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try { responseData = JSON.parse(text); } catch { throw new Error(`Unexpected response: ${text.slice(0, 200)}`); }
    }

    if (!response.ok) {
      const error = new Error(responseData.message || responseData.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = responseData.error;
      throw error;
    }

    return responseData;
  }

  /**
   * Register a new platform
   * @static
   * @param {string} apiUrl - Base URL of ORBIT API
   * @param {string} platformId - Desired platform ID (3-32 chars)
   * @param {string} name - Platform name
   * @param {string} [tier='basic'] - Platform tier
   * @returns {Promise<Object>} Registration details including private_key
   */
  static async registerPlatform(apiUrl, platformId, name, tier = 'basic') {
    const url = `${apiUrl.replace(/\/$/, '')}/orbit/v1/platforms/register`;
    const body = { platform_id: platformId, name, tier };
    
    const requestBody = cbor.encode(body);
    const headers = { 'Content-Type': 'application/cbor' };

    const response = await fetch(url, { method: 'POST', headers, body: requestBody });
    const contentType = response.headers.get('content-type') || '';
    let responseData;
    
    if (contentType.includes('application/cbor')) {
      const buf = await response.arrayBuffer();
      responseData = cbor.decode(Buffer.from(buf));
    } else if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try { responseData = JSON.parse(text); } catch { throw new Error(`Unexpected response: ${text.slice(0, 200)}`); }
    }

    if (!response.ok) {
      const error = new Error(responseData.message || responseData.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = responseData.error;
      throw error;
    }

    return responseData;
  }

  /**
   * Rotate platform API key
   * @returns {Promise<Object>} New API key details
   */
  async rotateApiKey() {
    return this._request('POST', '/orbit/v1/platforms/rotate-api-key', {});
  }

  /**
   * Rotate platform Ed25519 keypair
   * @returns {Promise<Object>} New keypair details
   */
  async rotateKeypair() {
    return this._request('POST', '/orbit/v1/platforms/rotate-keypair', {});
  }

  // ============================================================================
  // V2 ENDPOINTS - AI-Powered Analysis
  // ============================================================================

  /**
   * Find similar-sounding tracks via CLAP embeddings (v2)
   * 
   * Uses AI embeddings to find tracks that sound similar, even if they're
   * pitch-shifted, time-stretched, or are covers/remixes.
   * 
   * @param {Buffer} audioBuffer - Binary audio data to find similar tracks for
   * @param {Object} [options] - Search options
   * @param {number} [options.threshold=0.5] - Similarity threshold (0-1)
   * @param {number} [options.limit=20] - Maximum results (1-100)
   * @param {boolean} [options.includeDerivatives=true] - Include covers/remixes
   * 
   * @returns {Promise<Object>} Similarity search results
   * @returns {string} result.query_embedding_id - Unique query ID
   * @returns {Array} result.results - Similar tracks with similarity scores
   * @returns {Object} result.query_metadata - Detected genre/mood of query audio
   * @returns {Object} result.summary - Result summary with counts
   * 
   * @example
   * const audioBuffer = fs.readFileSync('track.mp3');
   * const results = await client.similar(audioBuffer, {
   *   threshold: 0.7,
   *   limit: 10
   * });
   * 
   * results.results.forEach(track => {
   *   console.log(`${track.title} - ${track.artist} (${track.similarity.toFixed(2)})`);
   * });
   */
  async similar(audioBuffer, options = {}) {
    if (!Buffer.isBuffer(audioBuffer)) {
      throw new Error('audioBuffer must be a Buffer');
    }

    const body = {
      audio: audioBuffer.toString('base64'),
      threshold: options.threshold ?? 0.5,
      limit: options.limit ?? 20,
      include_derivatives: options.includeDerivatives ?? true
    };

    return this._request('POST', '/orbit/v2/similar', body);
  }

  /**
   * Analyze audio without registration (v2)
   * 
   * Get AI-powered analysis including genre, mood, BPM, key, instruments, 
   * and vocal detection. Useful for previewing metadata before registration
   * or for third-party analysis tools.
   * 
   * @param {Buffer} audioBuffer - Binary audio data to analyze
   * @param {Object} [options] - Analysis options
   * @param {Array<string>} [options.include] - Specific fields to include
   *   Valid values: 'genre', 'mood', 'bpm', 'key', 'instruments', 'vocals', 
   *   'fingerprint', 'embedding', 'ai_detection', 'catalog_check'
   *   Default: all except 'embedding', 'ai_detection', 'catalog_check'
   * 
   * @returns {Promise<Object>} Analysis results
   * @returns {Object} result.analysis - Analysis data
   * @returns {Array} result.analysis.genre - Genre predictions with confidence
   * @returns {Array} result.analysis.mood - Mood predictions with confidence
   * @returns {Object} result.analysis.bpm - BPM with confidence
   * @returns {Object} result.analysis.key - Musical key with confidence
   * @returns {Array} result.analysis.instruments - Detected instruments
   * @returns {Object} result.analysis.vocals - Vocal detection info
   * @returns {Object} [result.embeddings] - CLAP embeddings (if requested)
   * @returns {Object} [result.fingerprint] - Chromaprint hash (if requested)
   * @returns {number} result.processing_time_ms - Processing time
   * 
   * @example
   * const audioBuffer = fs.readFileSync('track.mp3');
   * const analysis = await client.analyze(audioBuffer, {
   *   include: ['genre', 'mood', 'bpm', 'key']
   * });
   * 
   * console.log('Genre:', analysis.analysis.genre[0].label);
   * console.log('Mood:', analysis.analysis.mood[0].label);
   * console.log('BPM:', analysis.analysis.bpm.value);
   */
  async analyze(audioBuffer, options = {}) {
    if (!Buffer.isBuffer(audioBuffer)) {
      throw new Error('audioBuffer must be a Buffer');
    }

    const body = {
      audio: audioBuffer.toString('base64')
    };

    if (options.include && Array.isArray(options.include)) {
      body.include = options.include;
    }

    return this._request('POST', '/orbit/v2/analyze', body);
  }
}

// Export for CommonJS
module.exports = { OrbitClient };

// Export for ES modules
module.exports.default = OrbitClient;





