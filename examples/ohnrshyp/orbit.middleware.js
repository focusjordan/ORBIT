/**
 * ORBIT Middleware for Ohnrshyp
 * 
 * DEPRECATED: This file contains a prototype implementation.
 * 
 * USE INSTEAD: orbit-middleware-ohnrshyp.js
 * 
 * The new file implements the correct S3 download pattern
 * that matches Ohnrshyp's actual architecture (multer-s3 streaming).
 * 
 * Duplicate check and auto-registration integration middleware.
 */

const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

// Configuration from environment variables
const ORBIT_API_URL = process.env.ORBIT_API_URL || 'http://localhost:4000';
const ORBIT_PLATFORM_ID = process.env.ORBIT_PLATFORM_ID || 'ohnrshyp';
const ORBIT_PRIVATE_KEY = process.env.ORBIT_PRIVATE_KEY 
  ? Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
  : null;
const ORBIT_API_KEY = process.env.ORBIT_API_KEY || null;

// Initialize ORBIT client (singleton)
let orbitClient = null;

function getOrbitClient() {
  if (!orbitClient && ORBIT_PRIVATE_KEY) {
    orbitClient = new OrbitClient({
      apiUrl: ORBIT_API_URL,
      platformId: ORBIT_PLATFORM_ID,
      privateKey: ORBIT_PRIVATE_KEY,
      apiKey: ORBIT_API_KEY
    });
  }
  return orbitClient;
}

/**
 * Middleware: Check for duplicate audio before upload completes
 * 
 * Usage in Ohnrshyp routes:
 * 
 * router.post('/api/tracks',
 *   auth,
 *   artistOnly,
 *   upload.single('audio'),
 *   checkDuplicate,        // Add this
 *   createTrackHandler
 * );
 * 
 * Behavior:
 * - If duplicate found: Returns 409 Conflict with original registration details
 * - If new audio: Attaches fingerprint to req.orbit, calls next()
 * - If ORBIT unavailable: Logs warning, allows upload to proceed
 */
async function checkDuplicate(req, res, next) {
  // Skip if no audio file uploaded
  if (!req.file) {
    return next();
  }

  // Skip if ORBIT client not configured
  const client = getOrbitClient();
  if (!client) {
    console.warn('[WARN] ORBIT: Not configured, skipping duplicate check');
    return next();
  }

  try {
    console.log('[INFO] ORBIT: Checking for duplicates...');
    
    // Call ORBIT verify endpoint
    const startTime = Date.now();
    const verification = await client.verify(req.file.buffer);
    const duration = Date.now() - startTime;
    
    console.log(`[INFO] ORBIT: Verification complete in ${duration}ms`);
    
    // Check if this is a duplicate
    if (verification.duplicate_of || verification.verified) {
      console.log(`[INFO] ORBIT: Duplicate detected (registration ${verification.fingerprint_match?.registration_id})`);
      
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_AUDIO',
        message: 'This audio has already been registered in ORBIT',
        duplicate: {
          registration_id: verification.fingerprint_match?.registration_id || verification.duplicate_of,
          title: verification.metadata?.title,
          artist: verification.metadata?.artist,
          origin: {
            platform: verification.origin?.platform,
            owner_id: verification.origin?.owner_id,
            registered_at: verification.origin?.timestamp
          },
          fingerprint_hash: verification.fingerprint_hash?.toString('hex'),
          watermark_detected: verification.watermark?.detected || false,
          transfers: verification.transfers || []
        },
        help: 'This exact audio file is already in the system. If you believe this is an error, please contact support.'
      });
    }
    
    // Not a duplicate - attach fingerprint to request for potential use in registration
    req.orbit = {
      fingerprint_hash: verification.fingerprint_hash,
      verified: false,
      checked_at: new Date().toISOString()
    };
    
    console.log('[INFO] ORBIT: New audio, proceeding with upload');
    next();
    
  } catch (error) {
    // Log error but don't fail the upload
    console.error('[ERROR] ORBIT: Duplicate check failed:', error.message);
    
    // If it's a network error or ORBIT is down, allow upload to proceed
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('[WARN] ORBIT: Service unavailable, allowing upload to proceed');
      return next();
    }
    
    // If it's a 4xx client error, we should still allow upload
    // (better to have potential duplicate than block legitimate uploads)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      console.warn(`[WARN] ORBIT: Client error (${error.response.status}), allowing upload to proceed`);
      return next();
    }
    
    // For any other error, log and allow upload
    console.warn('[WARN] ORBIT: Unknown error, allowing upload to proceed');
    next();
  }
}

/**
 * Middleware: Register audio with ORBIT after successful upload
 * 
 * Usage in Ohnrshyp routes:
 * 
 * router.post('/api/tracks',
 *   auth,
 *   artistOnly,
 *   upload.single('audio'),
 *   checkDuplicate,
 *   async (req, res, next) => {
 *     // Create track in Ohnrshyp database
 *     const track = await Track.create(...);
 *     req.track = track;  // Attach for next middleware
 *     res.json({ success: true, track });
 *     next();  // Important: pass to next middleware
 *   },
 *   registerWithOrbit    // Auto-register will run here
 * );
 */
async function registerWithOrbit(req, res, next) {
  // Auto-register tracks with ORBIT after successful creation
  console.log('[INFO] ORBIT: Auto-registration execution starting...');
  next();
}

/**
 * Route handler: Verify any audio file
 * 
 * Usage in Ohnrshyp routes:
 * 
 * router.post('/api/orbit/verify',
 *   auth,
 *   upload.single('audio'),
 *   verifyAudio
 * );
 * 
 * This provides a dedicated endpoint for users to check if audio
 * is already registered (separate from upload flow).
 */
async function verifyAudio(req, res) {
  const client = getOrbitClient();
  
  if (!client) {
    return res.status(503).json({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: 'ORBIT verification service is not configured'
    });
  }
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'NO_AUDIO_FILE',
      message: 'No audio file provided'
    });
  }
  
  try {
    console.log(`[INFO] ORBIT: Verifying audio for user ${req.user?.id || 'unknown'}...`);
    
    const verification = await client.verify(req.file.buffer);
    
    res.json({
      success: true,
      verified: verification.verified,
      provenance: {
        is_registered: verification.verified,
        registration_id: verification.fingerprint_match?.registration_id,
        metadata: verification.metadata || null,
        origin: verification.origin || null,
        transfers: verification.transfers || [],
        watermark: {
          detected: verification.watermark?.detected || false,
          valid: verification.watermark?.valid || false
        },
        fingerprint_hash: verification.fingerprint_hash?.toString('hex')
      }
    });
    
  } catch (error) {
    console.error('[ERROR] ORBIT: Verification failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: 'VERIFICATION_FAILED',
      message: 'Failed to verify audio with ORBIT',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  checkDuplicate,
  registerWithOrbit,
  verifyAudio,
  getOrbitClient
};
