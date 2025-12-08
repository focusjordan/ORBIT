/**
 * ORBIT Ledger Database Queries
 * 
 * DESIGN NOTES:
 * - All fingerprint lookups use EXACT hash equality (fingerprint_hash = $1)
 * - NO similarity queries (reserved for Session 19 with MERT + pgvector)
 * - Multi-platform duplicates allowed: same hash, different platforms = valid
 */

const { pool } = require('../config/database');

const queries = {
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
   * Insert a new registration
   * @param {Object} data - Registration data
   * @returns {Promise<{id: number, created_at: Date}>}
   */
  insertRegistration: async (data) => {
    const result = await pool.query(
      `INSERT INTO orbit_registrations (
        fingerprint_hash, fingerprint_raw, watermark_hash,
        title, artist, duration_ms, format,
        owner_id, origin_platform, origin_timestamp, origin_signature,
        payload_cbor, entry_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, created_at`,
      [
        data.fingerprint_hash,
        data.fingerprint_raw,
        data.watermark_hash,
        data.title,
        data.artist,
        data.duration_ms,
        data.format,
        data.owner_id,
        data.origin_platform,
        data.origin_timestamp,
        data.origin_signature,
        data.payload_cbor,
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
   * Create or get test platform (for testing only)
   * @returns {Promise<Object>} Platform data
   */
  ensureTestPlatform: async () => {
    const testPlatform = {
      id: 'test-platform',
      name: 'Test Platform',
      public_key: Buffer.alloc(32).fill(1),
      api_key_hash: Buffer.alloc(32).fill(2)
    };
    
    await pool.query(
      `INSERT INTO orbit_platforms (id, name, public_key, api_key_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [testPlatform.id, testPlatform.name, testPlatform.public_key, testPlatform.api_key_hash]
    );
    
    return testPlatform;
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
  }
};

module.exports = queries;
