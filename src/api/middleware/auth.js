/**
 * ORBIT Platform Authentication Middleware
 * 
 * Authenticates API requests using Ed25519 signatures.
 * 
 * Per ORBIT_SPECIFICATION.md Section 8:
 * Headers:
 *   X-ORBIT-Platform: <platform_id>
 *   X-ORBIT-Signature: <ed25519_signature_of_request_body>
 *   X-ORBIT-API-Key: <api_key>  (for rate limiting/billing - optional in v1)
 * 
 * Authentication flow:
 * 1. Extract platform ID from X-ORBIT-Platform header
 * 2. Look up platform in database to get public key
 * 3. Verify X-ORBIT-Signature against request body using public key
 * 4. Attach platform info to req.platform if valid
 * 5. Return 401 on invalid/missing auth
 */

const OrbitCrypto = require('../../engines/crypto');
const queries = require('../../ledger/queries');

/**
 * Platform authentication middleware
 * Verifies Ed25519 signature of request body
 */
async function platformAuth(req, res, next) {
  // Get headers
  const platformId = req.get('X-ORBIT-Platform');
  const signatureHeader = req.get('X-ORBIT-Signature');
  
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
    
    // Attach platform info to request (without sensitive data)
    req.platform = {
      id: platform.id,
      name: platform.name,
      tier: platform.tier,
      publicKey: platform.public_key,
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
 */
async function optionalAuth(req, res, next) {
  const platformId = req.get('X-ORBIT-Platform');
  const signatureHeader = req.get('X-ORBIT-Signature');
  
  // If no auth headers, continue without platform context
  if (!platformId || !signatureHeader) {
    req.platform = null;
    return next();
  }
  
  // If headers present, validate them (use regular auth)
  return platformAuth(req, res, next);
}

module.exports = {
  platformAuth,
  optionalAuth,
};


