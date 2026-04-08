/**
 * ORBIT Ledger Database Queries
 * 
 * DESIGN NOTES:
 * - Chromaprint: EXACT hash equality (fingerprint_hash = $1) - fast path
 * - Audio Embedding: Vector similarity via pgvector - semantic path
 * - Multi-platform duplicates allowed: same hash, different platforms = valid
 * 
 * Session 19: Added embedding update and similarity queries
 * Session 22: Switched from MERT (non-commercial) to CLAP embeddings (Apache 2.0)
 *             Similarity search now uses `audio_embedding` (vector(512)).
 *             Note: legacy `mert_embedding` may still exist in older schemas.
 */

const { pool } = require('../config/database');

const queries = {
  // ============================================================================
  // Platform Queries (Session 10)
  // ============================================================================
  
  /**
   * Get platform by ID
   * @param {string} platformId - Platform ID
   * @returns {Promise<Object|undefined>} Platform data including public_key
   */
  getPlatform: async (platformId) => {
    const result = await pool.query(
      `SELECT id, name, public_key, api_key_hash, webhook_url, tier, is_active, created_at
       FROM orbit_platforms
       WHERE id = $1`,
      [platformId]
    );
    return result.rows[0];
  },
  
  /**
   * Check if platform exists and is active
   * @param {string} platformId - Platform ID
   * @returns {Promise<boolean>}
   */
  platformIsActive: async (platformId) => {
    const result = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM orbit_platforms WHERE id = $1 AND is_active = true
      ) as exists`,
      [platformId]
    );
    return result.rows[0].exists;
  },
  
  /**
   * Insert a new platform
   * @param {Object} data - Platform data
   * @returns {Promise<{id: string, created_at: Date}>}
   */
  insertPlatform: async (data) => {
    const result = await pool.query(
      `INSERT INTO orbit_platforms (id, name, public_key, api_key_hash, webhook_url, tier)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         public_key = EXCLUDED.public_key,
         api_key_hash = EXCLUDED.api_key_hash,
         webhook_url = EXCLUDED.webhook_url,
         tier = EXCLUDED.tier
       RETURNING id, created_at`,
      [
        data.id,
        data.name,
        data.public_key,
        data.api_key_hash,
        data.webhook_url || null,
        data.tier || 'basic'
      ]
    );
    return result.rows[0];
  },
  
  // ============================================================================
  // Registration Queries
  // ============================================================================
  /**
   * Find registrations by exact fingerprint hash match
   * @param {Buffer} fingerprintHash - 32-byte SHA-256 hash
   * @returns {Promise<Array>} Array of matching registrations
   */
  findByFingerprint: async (fingerprintHash) => {
    const result = await pool.query(
      `SELECT id, fingerprint_hash, title, artist, origin_platform, owner_id, created_at
       FROM orbit_registrations
       WHERE fingerprint_hash = $1
       ORDER BY created_at ASC`,
      [fingerprintHash]
    );
    return result.rows;
  },
  
  /**
   * Check if fingerprint exists (any platform)
   * @param {Buffer} fingerprintHash - 32-byte SHA-256 hash
   * @returns {Promise<boolean>}
   */
  fingerprintExists: async (fingerprintHash) => {
    const result = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM orbit_registrations WHERE fingerprint_hash = $1
      ) as exists`,
      [fingerprintHash]
    );
    return result.rows[0].exists;
  },
  
  /**
   * Insert a new registration with full metadata support
   * @param {Object} data - Registration data
   * @returns {Promise<{id: number, created_at: Date}>}
   */
  insertRegistration: async (data) => {
    const result = await pool.query(
      `INSERT INTO orbit_registrations (
        fingerprint_hash, fingerprint_raw, watermark_hash,
        isrc, upc, title, artist, duration_ms,
        p_line, c_line, primary_genre, language,
        bitrate, sample_rate, channels, format,
        album_title, track_number, secondary_genre, release_date, original_release_date,
        label, catalog_number, version, parental_advisory,
        featured_artists, composers, lyricists, writers, producers,
        remixer, recording_location, recording_year,
        iswc, territories, preview_start_ms,
        owner_id, origin_platform, origin_timestamp, origin_signature,
        payload_cbor, prev_entry_hash, entry_hash
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
        $41, $42, $43
      )
      RETURNING id, created_at`,
      [
        data.fingerprint_hash,
        data.fingerprint_raw,
        data.watermark_hash,
        data.isrc || null,
        data.upc || null,
        data.title,
        data.artist,
        data.duration_ms,
        data.p_line || null,
        data.c_line || null,
        data.primary_genre || null,
        data.language || null,
        data.bitrate || null,
        data.sample_rate || null,
        data.channels || null,
        data.format || null,
        data.album_title || null,
        data.track_number || null,
        data.secondary_genre || null,
        data.release_date || null,
        data.original_release_date || null,
        data.label || null,
        data.catalog_number || null,
        data.version || null,
        data.parental_advisory || null,
        data.featured_artists ? JSON.stringify(data.featured_artists) : null,
        data.composers ? JSON.stringify(data.composers) : null,
        data.lyricists ? JSON.stringify(data.lyricists) : null,
        data.writers ? JSON.stringify(data.writers) : null,
        data.producers ? JSON.stringify(data.producers) : null,
        data.remixer || null,
        data.recording_location || null,
        data.recording_year || null,
        data.iswc || null,
        data.territories ? JSON.stringify(data.territories) : null,
        data.preview_start_ms || null,
        data.owner_id,
        data.origin_platform,
        data.origin_timestamp,
        data.origin_signature,
        data.payload_cbor,
        data.prev_entry_hash || null,
        data.entry_hash
      ]
    );
    return result.rows[0];
  },
  
  /**
   * Get registration by ID
   * @param {number} id - Registration ID
   * @returns {Promise<Object|undefined>}
   */
  getRegistration: async (id) => {
    const result = await pool.query(
      `SELECT * FROM orbit_registrations WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  },
  
  /**
   * Get all active platforms (for debugging)
   * @returns {Promise<Array>}
   */
  listPlatforms: async () => {
    const result = await pool.query(
      `SELECT id, name, tier, is_active, created_at
       FROM orbit_platforms
       ORDER BY created_at DESC`
    );
    return result.rows;
  },
  
  /**
   * Delete registration by ID (for test cleanup)
   * @param {number} id - Registration ID
   * @returns {Promise<void>}
   */
  deleteRegistration: async (id) => {
    await pool.query(
      `DELETE FROM orbit_registrations WHERE id = $1`,
      [id]
    );
  },
  
  // ============================================================================
  // Transfer Queries (Session 13)
  // ============================================================================
  
  /**
   * Create a new transfer record
   * @param {Object} data - Transfer data
   * @returns {Promise<{id: number, expires_at: Date}>}
   */
  insertTransfer: async (data) => {
    const result = await pool.query(
      `INSERT INTO orbit_transfers (
        registration_id, from_platform, to_platform, from_signature
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, status, initiated_at, expires_at`,
      [
        data.registration_id,
        data.from_platform,
        data.to_platform,
        data.from_signature
      ]
    );
    return result.rows[0];
  },
  
  /**
   * Get transfer by ID
   * @param {number} transferId - Transfer ID
   * @returns {Promise<Object|undefined>}
   */
  getTransfer: async (transferId) => {
    const result = await pool.query(
      `SELECT * FROM orbit_transfers WHERE id = $1`,
      [transferId]
    );
    return result.rows[0];
  },
  
  /**
   * Update transfer status and add recipient signature
   * @param {number} transferId - Transfer ID
   * @param {Object} data - Update data {status, to_signature, new_registration_id}
   * @returns {Promise<Object>}
   */
  updateTransfer: async (transferId, data) => {
    const result = await pool.query(
      `UPDATE orbit_transfers
       SET status = $2::varchar,
           to_signature = $3,
           new_registration_id = $4,
           accepted_at = CASE WHEN $2::varchar = 'accepted' THEN NOW() ELSE accepted_at END
       WHERE id = $1
       RETURNING *`,
      [
        transferId,
        data.status,
        data.to_signature,
        data.new_registration_id || null
      ]
    );
    return result.rows[0];
  },
  
  /**
   * Get all transfers for a registration
   * @param {number} registrationId - Registration ID
   * @returns {Promise<Array>}
   */
  getTransfersByRegistration: async (registrationId) => {
    const result = await pool.query(
      `SELECT * FROM orbit_transfers
       WHERE registration_id = $1
       ORDER BY initiated_at ASC`,
      [registrationId]
    );
    return result.rows;
  },
  
  /**
   * Get pending transfers for a platform (recipient)
   * @param {string} platformId - Platform ID
   * @returns {Promise<Array>}
   */
  getPendingTransfersForPlatform: async (platformId) => {
    const result = await pool.query(
      `SELECT * FROM orbit_transfers
       WHERE to_platform = $1
         AND status = 'pending'
         AND expires_at > NOW()
       ORDER BY initiated_at ASC`,
      [platformId]
    );
    return result.rows;
  },
  
  /**
   * Check if registration is owned by platform
   * @param {number} registrationId - Registration ID
   * @param {string} platformId - Platform ID
   * @returns {Promise<boolean>}
   */
  registrationOwnedByPlatform: async (registrationId, platformId) => {
    const result = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM orbit_registrations
        WHERE id = $1 AND origin_platform = $2
      ) as exists`,
      [registrationId, platformId]
    );
    return result.rows[0].exists;
  },
  
  /**
   * Delete transfer by ID (for test cleanup)
   * @param {number} id - Transfer ID
   * @returns {Promise<void>}
   */
  deleteTransfer: async (id) => {
    await pool.query(
      `DELETE FROM orbit_transfers WHERE id = $1`,
      [id]
    );
  },
  
  // ============================================================================
  // Audio Embedding Queries (Session 19, updated Session 22)
  // Uses CLAP embeddings (512-dim, Apache 2.0 licensed)
  // Stored in `audio_embedding` (vector(512)).
  // ============================================================================
  
  /**
   * Update audio embedding for a registration
   * @param {number} registrationId - Registration ID
   * @param {string} embedding - PostgreSQL vector string '[0.1,0.2,...]'
   * @returns {Promise<Object>}
   */
  updateAudioEmbedding: async (registrationId, embedding) => {
    const result = await pool.query(
      `UPDATE orbit_registrations
       SET audio_embedding = $2::vector
       WHERE id = $1
       RETURNING id, title, artist`,
      [registrationId, embedding]
    );
    return result.rows[0];
  },
  
  /**
   * Find similar registrations by audio embedding using cosine similarity
   * 
   * @param {string} embedding - PostgreSQL vector string '[0.1,0.2,...]'
   * @param {Object} options - Query options
   * @param {number} options.threshold - Minimum similarity (default 0.5)
   * @param {number} options.limit - Max results (default 10)
   * @param {number} options.excludeId - Registration ID to exclude (for self-matching)
   * @returns {Promise<Array>} Array of similar registrations with similarity scores
   */
  findSimilarByEmbedding: async (embedding, options = {}) => {
    const {
      threshold = 0.5,
      limit = 10,
      excludeId = null
    } = options;
    
    let query = `
      SELECT 
        id, title, artist, isrc, origin_platform, owner_id, created_at,
        1 - (audio_embedding <=> $1::vector) as similarity
      FROM orbit_registrations
      WHERE audio_embedding IS NOT NULL
        AND 1 - (audio_embedding <=> $1::vector) > $2
    `;
    
    const params = [embedding, threshold];
    
    if (excludeId) {
      query += ` AND id != $3`;
      params.push(excludeId);
    }
    
    query += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    return result.rows;
  },
  
  /**
   * Check if audio embedding exists for a registration
   * @param {number} registrationId - Registration ID
   * @returns {Promise<boolean>}
   */
  hasAudioEmbedding: async (registrationId) => {
    const result = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM orbit_registrations 
        WHERE id = $1 AND audio_embedding IS NOT NULL
      ) as exists`,
      [registrationId]
    );
    return result.rows[0].exists;
  },
  
  /**
   * Get registration with audio embedding
   * @param {number} registrationId - Registration ID
   * @returns {Promise<Object|undefined>}
   */
  getRegistrationWithEmbedding: async (registrationId) => {
    const result = await pool.query(
      `SELECT id, title, artist, audio_embedding::text as audio_embedding
       FROM orbit_registrations 
       WHERE id = $1`,
      [registrationId]
    );
    return result.rows[0];
  },
  
  /**
   * Find registrations whose watermark_hash starts with the given prefix.
   * SilentCipher embeds 5 bytes; spread spectrum embeds 16.
   * @param {Buffer} hashPrefix - 5-byte (neural) or 16-byte (spread) prefix
   * @returns {Promise<Array>}
   */
  findByWatermarkHashPrefix: async (hashPrefix) => {
    const result = await pool.query(
      `SELECT id, title, artist, origin_platform, owner_id, watermark_hash, created_at
       FROM orbit_registrations
       WHERE substring(watermark_hash from 1 for $2) = $1
       ORDER BY created_at ASC`,
      [hashPrefix, hashPrefix.length]
    );
    return result.rows;
  },

  /**
   * Count registrations with audio embeddings
   * @returns {Promise<number>}
   */
  countAudioEmbeddings: async () => {
    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM orbit_registrations 
       WHERE audio_embedding IS NOT NULL`
    );
    return parseInt(result.rows[0].count, 10);
  }
};

module.exports = queries;
