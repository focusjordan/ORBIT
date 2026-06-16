/**
 * ORBIT Platform Administration Handlers
 * 
 * Handles registration and credential rotation for ORBIT platforms (tenants).
 */

const OrbitCrypto = require('../../engines/crypto');
const queries = require('../../ledger/queries');

/**
 * Register a new platform
 * POST /orbit/v1/platforms/register
 * Public endpoint (open registration for sandbox/demo purposes)
 */
async function registerPlatform(req, res) {
  try {
    const { platform_id, name, tier = 'basic' } = req.body || {};

    // Validate inputs
    if (!platform_id || !name) {
      return res.orbitError(
        'missing_fields',
        'platform_id and name are required',
        400
      );
    }

    // platform_id formatting: alphanumeric and hyphens, 3-32 chars
    const idRegex = /^[a-z0-9-]{3,32}$/;
    if (!idRegex.test(platform_id)) {
      return res.orbitError(
        'invalid_platform_id',
        'platform_id must be 3-32 characters, lowercase alphanumeric and hyphens only',
        400
      );
    }

    // Check if platform exists
    const existing = await queries.getPlatform(platform_id);
    if (existing) {
      return res.orbitError(
        'platform_conflict',
        `Platform ID '${platform_id}' is already registered`,
        400
      );
    }

    // Generate keys
    const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
    const apiKey = OrbitCrypto.generateApiKey();
    const apiKeyHash = OrbitCrypto.hashApiKey(apiKey);

    // Save platform
    const platformData = {
      id: platform_id,
      name,
      public_key: publicKey,
      api_key_hash: apiKeyHash,
      tier,
    };

    const result = await queries.insertPlatform(platformData);

    return res.orbit({
      success: true,
      platform_id,
      platform_name: name,
      public_key: publicKey.toString('base64'),
      private_key: privateKey.toString('base64'),
      api_key: apiKey,
      tier,
      created_at: result.created_at,
      warning: 'KEEP THIS FILE SECURE! The private key cannot be recovered.',
    }, 200);

  } catch (error) {
    console.error('[Platform Register] Error:', error);
    return res.orbitError(
      'platform_register_error',
      `Failed to register platform: ${error.message}`,
      500
    );
  }
}

/**
 * Rotate platform API key
 * POST /orbit/v1/platforms/rotate-api-key
 * Authenticated: platformAuth
 */
async function rotateApiKey(req, res) {
  try {
    const platformId = req.platform?.id;
    if (!platformId) {
      return res.orbitError('unauthorized', 'Authentication required', 401);
    }

    // Generate new key
    const newApiKey = OrbitCrypto.generateApiKey();
    const newApiKeyHash = OrbitCrypto.hashApiKey(newApiKey);

    // Update in database
    await queries.updatePlatformApiKey(platformId, newApiKeyHash);

    console.log(`[Platform Key Rotation] Rotated API key for platform '${platformId}'`);

    return res.orbit({
      success: true,
      platform_id: platformId,
      api_key: newApiKey,
      warning: 'Update your client settings with the new API key immediately.',
    }, 200);

  } catch (error) {
    console.error('[Platform Rotate API Key] Error:', error);
    return res.orbitError(
      'platform_rotate_error',
      `Failed to rotate API key: ${error.message}`,
      500
    );
  }
}

/**
 * Rotate platform Ed25519 keypair
 * POST /orbit/v1/platforms/rotate-keypair
 * Authenticated: platformAuth
 */
async function rotateKeypair(req, res) {
  try {
    const platformId = req.platform?.id;
    if (!platformId) {
      return res.orbitError('unauthorized', 'Authentication required', 401);
    }

    // Generate new keys
    const { publicKey, privateKey } = OrbitCrypto.generateKeypair();

    // Update in database
    await queries.updatePlatformPublicKey(platformId, publicKey);

    console.log(`[Platform Key Rotation] Rotated Ed25519 keypair for platform '${platformId}'`);

    return res.orbit({
      success: true,
      platform_id: platformId,
      public_key: publicKey.toString('base64'),
      private_key: privateKey.toString('base64'),
      warning: 'Update your client settings with the new private key immediately. Subsequent requests must be signed with this new private key.',
    }, 200);

  } catch (error) {
    console.error('[Platform Rotate Keypair] Error:', error);
    return res.orbitError(
      'platform_rotate_error',
      `Failed to rotate keypair: ${error.message}`,
      500
    );
  }
}

module.exports = {
  registerPlatform,
  rotateApiKey,
  rotateKeypair,
};
