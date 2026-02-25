/**
 * ORBIT Configuration
 * 
 * Centralized configuration management for the ORBIT API.
 * All environment variables are validated and exported from here.
 */

require('dotenv').config();

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

  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },
};

/**
 * Validate required configuration
 * Warns in development, throws in production
 */
function validateConfig() {
  const warnings = [];
  
  // Check for default secret key
  if (config.orbit.secretKey === 'development-secret-key-change-in-production') {
    warnings.push('ORBIT_SECRET_KEY is using default value - set a secure key for production');
  }
  
  // Check for ORBIT node private key
  if (!config.orbit.privateKey) {
    warnings.push('ORBIT_PRIVATE_KEY not set - this node cannot sign payloads');
  }

  // Check for AcoustID API key (catalog check)
  if (!config.acoustid.apiKey) {
    warnings.push('ACOUSTID_API_KEY not set - catalog check (known-work detection) will be unavailable');
  }
  
  // Check for database URL
  if (!process.env.DATABASE_URL) {
    warnings.push('DATABASE_URL not set - using default local connection');
  }
  
  // Log warnings
  if (warnings.length > 0) {
    if (config.server.isProd) {
      throw new Error(`Configuration errors:\n${warnings.map(w => `  - ${w}`).join('\n')}`);
    } else {
      warnings.forEach(w => console.warn(`⚠️  Config warning: ${w}`));
    }
  }
}

// Validate on load
validateConfig();

module.exports = config;
