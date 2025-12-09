/**
 * ORBIT API Routes
 * 
 * Route definitions for the ORBIT protocol endpoints.
 * Core handlers will be implemented in Sessions 11-14.
 * 
 * Per ORBIT_SPECIFICATION.md Section 8:
 * - POST /orbit/v1/register   - Register new audio
 * - POST /orbit/v1/verify     - Verify audio provenance
 * - POST /orbit/v1/transfer   - Initiate B2B transfer
 * - POST /orbit/v1/accept     - Accept incoming transfer
 * - GET  /orbit/v1/chain/:fp  - Get full custody chain
 */

const express = require('express');
const config = require('../config');

const router = express.Router();

// ============================================================================
// Protocol Info Endpoint
// ============================================================================

/**
 * GET /orbit/v1/info
 * Returns protocol information and available endpoints
 */
router.get('/info', (req, res) => {
  res.orbit({
    protocol: config.orbit.name,
    version: config.orbit.version,
    description: config.orbit.description,
    endpoints: [
      { method: 'POST', path: '/orbit/v1/register', description: 'Register new audio', status: 'pending' },
      { method: 'POST', path: '/orbit/v1/verify', description: 'Verify audio provenance', status: 'pending' },
      { method: 'POST', path: '/orbit/v1/transfer', description: 'Initiate B2B transfer', status: 'pending' },
      { method: 'POST', path: '/orbit/v1/accept', description: 'Accept incoming transfer', status: 'pending' },
      { method: 'GET', path: '/orbit/v1/chain/:fingerprint', description: 'Get full custody chain', status: 'pending' },
    ],
  });
});

// ============================================================================
// Placeholder Routes - Handlers to be implemented in Sessions 11-14
// ============================================================================

/**
 * POST /orbit/v1/register
 * Register new audio with ORBIT
 * Handler: Session 11
 */
router.post('/register', (req, res) => {
  res.orbitError(
    'not_implemented',
    'Registration endpoint not yet implemented. Coming in Session 11.',
    501
  );
});

/**
 * POST /orbit/v1/verify
 * Verify audio provenance and extract metadata
 * Handler: Session 12
 */
router.post('/verify', (req, res) => {
  res.orbitError(
    'not_implemented',
    'Verification endpoint not yet implemented. Coming in Session 12.',
    501
  );
});

/**
 * POST /orbit/v1/transfer
 * Initiate B2B transfer to another platform
 * Handler: Session 13
 */
router.post('/transfer', (req, res) => {
  res.orbitError(
    'not_implemented',
    'Transfer endpoint not yet implemented. Coming in Session 13.',
    501
  );
});

/**
 * POST /orbit/v1/accept
 * Accept incoming transfer from another platform
 * Handler: Session 13
 */
router.post('/accept', (req, res) => {
  res.orbitError(
    'not_implemented',
    'Accept endpoint not yet implemented. Coming in Session 13.',
    501
  );
});

/**
 * GET /orbit/v1/chain/:fingerprint
 * Get full custody chain for a fingerprint
 * Handler: Session 14
 */
router.get('/chain/:fingerprint', (req, res) => {
  res.orbitError(
    'not_implemented',
    'Chain lookup endpoint not yet implemented. Coming in Session 14.',
    501
  );
});

module.exports = router;
