/**
 * ORBIT API Routes
 * 
 * Route definitions for the ORBIT protocol endpoints.
 * 
 * Per ORBIT_SPECIFICATION.md Section 8:
 * - POST /orbit/v1/register   - Register new audio
 * - POST /orbit/v1/verify     - Verify audio provenance
 * - POST /orbit/v1/transfer   - Initiate B2B transfer
 * - POST /orbit/v1/accept     - Accept incoming transfer
 * - GET  /orbit/v1/chain/:fp  - Get full custody chain
 * 
 * Security Hardening:
 * - GPU-intensive endpoints have stricter rate limits
 * - Input sanitization validates field lengths
 */

const express = require('express');
const config = require('../config');
const { platformAuth, optionalAuth } = require('./middleware/auth');
const { registerUpload, parseCborMetadata } = require('./middleware/multipart');
const { sanitizeInput } = require('./middleware/sanitize');

// Import handlers
const registerHandler = require('./handlers/register');
const verifyHandler = require('./handlers/verify');
const transferHandlers = require('./handlers/transfer');
const chainHandler = require('./handlers/chain');
const listRegistrationsHandler = require('./handlers/list');
const pendingTransfersHandler = require('./handlers/pending');
const watermarkmatchHandler = require('./handlers/watermarkmatch');
const platformHandlers = require('./handlers/platform');

const router = express.Router();

// Get GPU-intensive rate limiter from app (set in index.js)
const getGpuLimiter = (req) => req.app.get('gpuIntensiveLimiter');

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
      { method: 'POST', path: '/orbit/v1/transfer', description: 'Initiate B2B transfer', status: 'active' },
      { method: 'POST', path: '/orbit/v1/accept', description: 'Accept incoming transfer', status: 'active' },
      { method: 'GET', path: '/orbit/v1/chain/:fingerprint', description: 'Get full custody chain', status: 'active' },
    ],
  });
});

// ============================================================================
// Authentication Test Endpoint
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
// Core Protocol Routes
// ============================================================================

/**
 * POST /orbit/v1/register
 * Register new audio with ORBIT
 * Auth: Required (platformAuth)
 * Format: multipart/form-data (metadata as CBOR + audio as binary)
 * 
 * Note: Uses multipart instead of pure CBOR due to cbor library
 * limitations with payloads >200KB. Metadata still uses CBOR.
 * 
 * Security: GPU-intensive rate limit (10/min) + input sanitization
 * 
 * Middleware order:
 * 1. GPU rate limiter: Protect against abuse
 * 2. registerUpload: Parse multipart (metadata + audio files)
 * 3. parseCborMetadata: Decode CBOR metadata → req.parsedMetadata
 * 4. sanitizeInput: Validate field lengths
 * 5. platformAuth: Verify signature using req.parsedMetadata
 * 6. registerHandler: Process registration
 */
router.post('/register', 
  (req, res, next) => getGpuLimiter(req)(req, res, next), // 1. GPU rate limit
  registerUpload,        // 2. Parse multipart (metadata + audio)
  parseCborMetadata,     // 3. Decode CBOR metadata → req.parsedMetadata
  sanitizeInput,         // 4. Validate field lengths
  platformAuth,          // 5. Authenticate platform (uses req.parsedMetadata)
  registerHandler        // 6. Process registration
);

/**
 * POST /orbit/v1/verify
 * Verify audio provenance and extract metadata
 * Auth: Required (platform context required for compute-intensive tasks)
 * 
 * Security: GPU-intensive rate limit (10/min)
 * 
 * Request: CBOR/JSON with base64-encoded audio
 * Response: Complete provenance information including fingerprint match,
 *           watermark validation, signature verification, and metadata
 */
router.post('/verify', 
  (req, res, next) => getGpuLimiter(req)(req, res, next), // GPU rate limit
  platformAuth, 
  verifyHandler
);

/**
 * POST /orbit/v1/watermarkmatch
 * Watermark-only verification — extracts watermark from audio and looks up
 * the matching registration by hash prefix. No fingerprint, no AI metadata.
 * Auth: Required
 *
 * Request: JSON with base64-encoded audio { "audio": "<base64>" }
 * Response: extracted watermark info + matching registration (if found)
 */
router.post('/watermarkmatch',
  (req, res, next) => getGpuLimiter(req)(req, res, next),
  platformAuth,
  watermarkmatchHandler
);

/**
 * POST /orbit/v1/transfer
 * Initiate B2B transfer to another platform
 * Auth: Required (sender must be authenticated)
 * 
 * Request (CBOR/JSON):
 * {
 *   registration_id: number,
 *   to_platform: string
 * }
 * 
 * Response: Transfer record with ID, status, expiration
 */
router.post('/transfer', platformAuth, transferHandlers.initiateTransfer);

/**
 * POST /orbit/v1/accept
 * Accept incoming transfer from another platform
 * Auth: Required (recipient must be authenticated)
 * 
 * Request (CBOR/JSON):
 * {
 *   transfer_id: number
 * }
 * 
 * Response: New registration with extended chain, re-watermarked audio
 */
router.post('/accept', platformAuth, transferHandlers.acceptTransfer);

/**
 * GET /orbit/v1/chain/:fingerprint
 * Get full custody chain for a fingerprint
 * Auth: Required
 * 
 * URL Parameter:
 * - fingerprint: 64-character hex string (32-byte hash)
 * 
 * Response: Complete chain with all registrations and transfers,
 *           chronologically ordered, with signature validation status
 */
router.get('/chain/:fingerprint', platformAuth, chainHandler);

/**
 * GET /orbit/v1/registrations
 * List registrations for the authenticated platform
 * Auth: Required (only returns caller's registrations)
 * 
 * Query params: limit (1-100), offset (default 0)
 */
router.get('/registrations', platformAuth, listRegistrationsHandler);

/**
 * GET /orbit/v1/transfers/pending
 * List pending inbound transfers for the authenticated platform
 * Auth: Required (only returns transfers where caller is recipient)
 */
router.get('/transfers/pending', platformAuth, pendingTransfersHandler);

// Platform Onboarding & Key Management
router.post('/platforms/register', platformHandlers.registerPlatform);
router.post('/platforms/rotate-api-key', platformAuth, platformHandlers.rotateApiKey);
router.post('/platforms/rotate-keypair', platformAuth, platformHandlers.rotateKeypair);

module.exports = router;
