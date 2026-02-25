/**
 * ORBIT List Registrations Handler
 * GET /orbit/v1/registrations
 * 
 * Returns registrations belonging to the authenticated platform.
 * Scoped to the caller's platform ID — a platform can only see its own registrations.
 * 
 * Query params:
 *   limit  - max results (1-100, default 50)
 *   offset - pagination offset (default 0)
 */

const { pool } = require('../../config/database');

async function listRegistrationsHandler(req, res) {
  try {
    const platformId = req.platform?.id;
    if (!platformId) {
      return res.orbitError('unauthorized', 'Authentication required', 401);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM orbit_registrations WHERE origin_platform = $1`,
      [platformId]
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await pool.query(
      `SELECT id, fingerprint_hash, title, artist, isrc, primary_genre,
              owner_id, created_at, duration_ms
       FROM orbit_registrations
       WHERE origin_platform = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [platformId, limit, offset]
    );

    const registrations = result.rows.map(r => ({
      registration_id: r.id,
      fingerprint_hash: r.fingerprint_hash ? r.fingerprint_hash.toString('hex') : null,
      title: r.title,
      artist: r.artist,
      isrc: r.isrc,
      primary_genre: r.primary_genre,
      owner_id: r.owner_id,
      duration_ms: r.duration_ms,
      registered_at: r.created_at,
    }));

    return res.orbit({
      platform: platformId,
      total,
      limit,
      offset,
      registrations,
    }, 200);

  } catch (error) {
    console.error('[List] Unexpected error:', error);
    return res.orbitError('list_error', `Failed to list registrations: ${error.message}`, 500);
  }
}

module.exports = listRegistrationsHandler;
