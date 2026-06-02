/**
 * ORBIT Platform Authentication Middleware
 * 
 * Authenticates API requests using Ed25519 signatures and API keys.
 * 
 * Per ORBIT_SPECIFICATION.md Section 8:
 * Headers:
 *   X-ORBIT-Platform: <platform_id>
 *   X-ORBIT-Signature: <ed25519_signature_of_request_body>
 *   X-ORBIT-API-Key: <api_key>  (required for secure authentication)
 * 
 * Security Hardening
 * - Added API key validation (two-factor: signature + API key)
 * - API key is hashed and compared against stored hash
 * - Provides defense in depth: attacker needs both private key AND API key
 * 
 * Authentication flow:
 * 1. Extract platform ID from X-ORBIT-Platform header
 * 2. Look up platform in database to get public key and api_key_hash
 * 3. Verify X-ORBIT-Signature against request body using public key
 * 4. Verify X-ORBIT-API-Key by hashing and comparing to stored hash
 * 5. Attach platform info to req.platform if valid
 * 6. Return 401 on invalid/missing auth
 */

const crypto = require('crypto');
const OrbitCrypto = require('../../engines/crypto');
const queries = require('../../ledger/queries');

/**
 * Hash an API key for comparison with stored hash
 * Uses SHA-256, same as OrbitCrypto.hashApiKey
 * @param {string} apiKey - Plain text API key
 * @returns {Buffer} - 32-byte hash
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest();
}

/**
 * Platform authentication middleware
 * Verifies Ed25519 signature and API key (two-factor authentication)
 */
async function platformAuth(req, res, next) {
  // Get headers
  const platformId = req.get('X-ORBIT-Platform');
  const signatureHeader = req.get('X-ORBIT-Signature');
  const apiKeyHeader = req.get('X-ORBIT-API-Key');
  
  // Check for required headers
  if (!platformId) {
    return res.orbitError(
      'missing_platform',
      'X-ORBIT-Platform header is required',
      401
    );
  }
  
  if (!signatureHeader) {
    return res.orbitError(
      'missing_signature',
      'X-ORBIT-Signature header is required',
      401
    );
  }
  
  // API key is required for secure platform verification
  if (!apiKeyHeader) {
    return res.orbitError(
      'missing_api_key',
      'X-ORBIT-API-Key header is required',
      401
    );
  }
  
  try {
    // Look up platform in database
    const platform = await queries.getPlatform(platformId);
    
    if (!platform) {
      return res.orbitError(
        'unknown_platform',
        `Platform '${platformId}' not found`,
        401
      );
    }
    
    if (!platform.is_active) {
      return res.orbitError(
        'platform_inactive',
        `Platform '${platformId}' is not active`,
        401
      );
    }
    
    // ========================================================================
    // API Key Validation (Two-Factor Authentication)
    // ========================================================================
    
    // Verify API key by hashing and comparing to stored hash
    const providedKeyHash = hashApiKey(apiKeyHeader);
    
    if (!platform.api_key_hash) {
      // Platform doesn't have an API key configured
      console.warn(`[Auth] Platform '${platformId}' has no API key configured`);
      return res.orbitError(
        'api_key_not_configured',
        'Platform API key is not configured. Contact administrator.',
        401
      );
    }
    
    // Compare hashes (timing-safe comparison)
    const apiKeyValid = crypto.timingSafeEqual(providedKeyHash, platform.api_key_hash);
    
    if (!apiKeyValid) {
      console.warn(`[Auth] Invalid API key for platform '${platformId}'`);
      return res.orbitError(
        'invalid_api_key',
        'Invalid API key',
        401
      );
    }
    
    // ========================================================================
    // Signature Verification (existing logic)
    // ========================================================================
    
    // Decode signature from base64
    let signature;
    try {
      signature = Buffer.from(signatureHeader, 'base64');
    } catch {
      return res.orbitError(
        'invalid_signature_format',
        'X-ORBIT-Signature must be valid base64',
        401
      );
    }
    
    // Verify signature length (Ed25519 signatures are 64 bytes)
    if (signature.length !== 64) {
      return res.orbitError(
        'invalid_signature_length',
        `Expected 64-byte signature, got ${signature.length} bytes`,
        401
      );
    }
    
    // Get the data that was signed (the request body or parsed metadata)
    // For multipart requests, the metadata is in req.parsedMetadata
    // For CBOR/JSON requests, it's in req.body
    // For GET requests with no body, sign an empty object
    const dataToVerify = req.parsedMetadata 
      ? req.parsedMetadata
      : (req.body && Object.keys(req.body).length > 0 
        ? req.body 
        : {});
    
    // Verify the signature
    const isValid = OrbitCrypto.verify(
      dataToVerify,
      signature,
      platform.public_key
    );
    
    if (!isValid) {
      return res.orbitError(
        'invalid_signature',
        'Signature verification failed',
        401
      );
    }
    
    // ========================================================================
    // Authentication Complete
    // ========================================================================
    
    // Attach platform info to request (without sensitive data)
    req.platform = {
      id: platform.id,
      name: platform.name,
      tier: platform.tier,
      publicKey: platform.public_key,
      apiKeyValid: true, // Track that API key was validated
    };
    
    // Continue to route handler
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.orbitError(
      'auth_error',
      'Authentication failed due to internal error',
      500
    );
  }
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't require it
 * Use for endpoints that have different behavior for authenticated vs anonymous
 * 
 * If all auth headers are provided, full validation is required.
 * If partial headers, continue as anonymous.
 */
async function optionalAuth(req, res, next) {
  const platformId = req.get('X-ORBIT-Platform');
  const signatureHeader = req.get('X-ORBIT-Signature');
  const apiKeyHeader = req.get('X-ORBIT-API-Key');
  
  // If no auth headers, continue without platform context
  if (!platformId && !signatureHeader && !apiKeyHeader) {
    req.platform = null;
    return next();
  }
  
  // If only some headers present, continue as anonymous (don't fail)
  // This allows public endpoints to work without auth
  if (!platformId || !signatureHeader || !apiKeyHeader) {
    req.platform = null;
    return next();
  }
  
  // If all headers present, validate them (use regular auth)
  return platformAuth(req, res, next);
}

module.exports = {
  platformAuth,
  optionalAuth,
};






