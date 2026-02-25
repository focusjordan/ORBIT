/**
 * ORBIT Pending Transfers Handler
 * GET /orbit/v1/transfers/pending
 * 
 * Returns pending inbound transfers for the authenticated platform.
 * Only shows transfers where the caller is the recipient (to_platform).
 * Excludes expired transfers.
 */

const queries = require('../../ledger/queries');

async function pendingTransfersHandler(req, res) {
  try {
    const platformId = req.platform?.id;
    if (!platformId) {
      return res.orbitError('unauthorized', 'Authentication required', 401);
    }

    const transfers = await queries.getPendingTransfersForPlatform(platformId);

    const formatted = transfers.map(t => ({
      transfer_id: t.id,
      registration_id: t.registration_id,
      from_platform: t.from_platform,
      status: t.status,
      initiated_at: t.initiated_at,
      expires_at: t.expires_at,
    }));

    return res.orbit({
      platform: platformId,
      total: formatted.length,
      transfers: formatted,
    }, 200);

  } catch (error) {
    console.error('[Pending] Unexpected error:', error);
    return res.orbitError('pending_error', `Failed to list pending transfers: ${error.message}`, 500);
  }
}

module.exports = pendingTransfersHandler;
