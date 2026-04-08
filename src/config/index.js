/**
 * ORBIT Configuration
 * 
 * Centralized configuration management for the ORBIT API.
 * All environment variables are validated and exported from here.
 */

require('dotenv').config();

function parseBooleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

const config = {
  // Server settings
  server: {
    port: parseInt(process.env.PORT, 10) || 4000,
    env: process.env.NODE_ENV || 'development',
    isDev: (process.env.NODE_ENV || 'development') === 'development',
    isProd: process.env.NODE_ENV === 'production',
  },

  // Database settings (connection handled in database.js)
  database: {
    url: process.env.DATABASE_URL || 'postgres://orbit:orbit@localhost:5432/orbit_dev',
  },

  // ORBIT protocol settings
  orbit: {
    // Secret key for watermark spreading sequence generation
    secretKey: process.env.ORBIT_SECRET_KEY || 'development-secret-key-change-in-production',
    
    // Platform ID for this ORBIT instance
    platformId: process.env.ORBIT_PLATFORM_ID || 'orbit-dev',
    
    // Ed25519 private key for this ORBIT node (base64-encoded 64-byte keypair)
    // Used to sign ORBIT payloads created by this node
    privateKey: process.env.ORBIT_PRIVATE_KEY || null,
    
    // Protocol version
    version: '1.0.0',
    
    // Protocol name
    name: 'ORBIT',
    
    // Protocol description
    description: 'Origin-Based Identity & Rights Transfer Protocol',
  },

  // API settings
  api: {
    // Maximum request body size (100MB for audio files)
    maxBodySize: '100mb',
    
    // CBOR content types
    contentTypes: {
      cbor: 'application/cbor',
      cborDiagnostic: 'application/cbor-diagnostic',
      json: 'application/json',
    },
    
    // Rate limiting (to be implemented in future session)
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
    },
  },

  // AcoustID settings (catalog check — known-work detection)
  acoustid: {
    apiKey: process.env.ACOUSTID_API_KEY || null,
    baseUrl: 'https://api.acoustid.org/v2',
    minScore: 0.7,
  },

  // MusicBrainz settings (catalog check — metadata corroboration)
  musicbrainz: {
    baseUrl: 'https://musicbrainz.org/ws/2',
    userAgent: 'ORBIT/1.0.0 (https://github.com/orbit-protocol)',
  },

  // ACRCloud settings (catalog check — commercial catalog identification)
  acrcloud: {
    accessKey: process.env.ACRCLOUD_ACCESS_KEY || null,
    accessSecret: process.env.ACRCLOUD_SECRET_KEY || null,
    host: process.env.ACRCLOUD_HOST || 'identify-us-west-2.acrcloud.com',
  },

  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },

  // AI detection rollout flags (all default-off for safety)
  ai: {
    v2Enabled: parseBooleanEnv('ORBIT_AI_V2_ENABLED', false),
    shadowMode: parseBooleanEnv('ORBIT_AI_SHADOW_MODE', false),
    registerAnalysisEnabled: parseBooleanEnv('ORBIT_AI_REGISTER_ANALYSIS_ENABLED', false),
    knnEnabled: parseBooleanEnv('ORBIT_AI_KNN_ENABLED', false),
    promptsV2Enabled: parseBooleanEnv('ORBIT_AI_PROMPTS_V2_ENABLED', false),
    metadataV2Enabled: parseBooleanEnv('ORBIT_AI_METADATA_V2_ENABLED', false),
    crossSignalV2Enabled: parseBooleanEnv('ORBIT_AI_CROSSSIGNAL_V2_ENABLED', false),
    forensicsV3Enabled: parseBooleanEnv('ORBIT_AI_FORENSICS_V3_ENABLED', false),
  },
};

/**
 * Validate required configuration
 * Warns in development, throws in production
 */
function validateConfig() {
  const errors = [];
  const warnings = [];
  
  // Required in production
  if (config.server.isProd && config.orbit.secretKey === 'development-secret-key-change-in-production') {
    errors.push('ORBIT_SECRET_KEY is using default value - set a secure key for production');
  }
  
  // Optional — warn but don't block startup
  if (!config.orbit.privateKey) {
    warnings.push('ORBIT_PRIVATE_KEY not set - this node cannot sign payloads');
  }

  if (!config.acoustid.apiKey) {
    warnings.push('ACOUSTID_API_KEY not set - catalog check (known-work detection) will be unavailable');
  }

  if (!config.acrcloud.accessKey || !config.acrcloud.accessSecret) {
    warnings.push('ACRCLOUD_ACCESS_KEY / ACRCLOUD_SECRET_KEY not set - ACRCloud catalog check will be unavailable');
  }
  
  if (!process.env.DATABASE_URL) {
    warnings.push('DATABASE_URL not set - using default local connection');
  }
  
  warnings.forEach(w => console.warn(`⚠️  Config warning: ${w}`));
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

// Validate on load
validateConfig();

module.exports = config;
