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
const { platformAuth, optionalAuth } = require('./middleware/auth');
const { registerUpload, parseCborMetadata } = require('./middleware/multipart');

// Import handlers
const registerHandler = require('./handlers/register');
const verifyHandler = require('./handlers/verify');

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
      { method: 'POST', path: '/orbit/v1/register', description: 'Register new audio', status: 'active' },
      { method: 'POST', path: '/orbit/v1/verify', description: 'Verify audio provenance', status: 'active' },
      { method: 'POST', path: '/orbit/v1/transfer', description: 'Initiate B2B transfer', status: 'pending' },
      { method: 'POST', path: '/orbit/v1/accept', description: 'Accept incoming transfer', status: 'pending' },
      { method: 'GET', path: '/orbit/v1/chain/:fingerprint', description: 'Get full custody chain', status: 'pending' },
    ],
  });
});

// ============================================================================
// Authentication Test Endpoint (Session 10)
// ============================================================================

/**
 * POST /orbit/v1/auth-test
 * Test authentication - returns platform info if auth succeeds
 * Used for verifying keypair setup and signature generation
 */
router.post('/auth-test', platformAuth, (req, res) => {
  res.orbit({
    authenticated: true,
    platform: req.platform,
    message: 'Authentication successful!',
    body_received: req.body,
  });
});

// ============================================================================
// Placeholder Routes - Handlers to be implemented in Sessions 11-14
// ============================================================================

/**
 * POST /orbit/v1/register
 * Register new audio with ORBIT
 * Handler: Session 11 ✅
 * Auth: Required (platformAuth)
 * Format: multipart/form-data (metadata as CBOR + audio as binary)
 * 
 * Note: Uses multipart instead of pure CBOR due to cbor library
 * limitations with payloads >200KB. Metadata still uses CBOR.
 * 
 * Middleware order:
 * 1. registerUpload: Parse multipart (metadata + audio files)
 * 2. parseCborMetadata: Decode CBOR metadata → req.parsedMetadata
 * 3. platformAuth: Verify signature using req.parsedMetadata
 * 4. registerHandler: Process registration
 */
router.post('/register', 
  registerUpload,        // 1. Parse multipart (metadata + audio)
  parseCborMetadata,     // 2. Decode CBOR metadata → req.parsedMetadata
  platformAuth,          // 3. Authenticate platform (uses req.parsedMetadata)
  registerHandler        // 4. Process registration
);

/**
 * POST /orbit/v1/verify
 * Verify audio provenance and extract metadata
 * Handler: Session 12 ✅
 * Auth: Optional (verification works for anyone, platform context optional)
 * 
 * Request: CBOR/JSON with base64-encoded audio
 * Response: Complete provenance information including fingerprint match,
 *           watermark validation, signature verification, and metadata
 */
router.post('/verify', optionalAuth, verifyHandler);

/**
 * POST /orbit/v1/transfer
 * Initiate B2B transfer to another platform
 * Handler: Session 13
 * Auth: Required (sender must be authenticated)
 */
router.post('/transfer', platformAuth, (req, res) => {
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
 * Auth: Required (recipient must be authenticated)
 */
router.post('/accept', platformAuth, (req, res) => {
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
 * Auth: Optional (public lookup, but platform context may show more details)
 */
router.get('/chain/:fingerprint', optionalAuth, (req, res) => {
  res.orbitError(
    'not_implemented',
    'Chain lookup endpoint not yet implemented. Coming in Session 14.',
    501
  );
});

module.exports = router;
