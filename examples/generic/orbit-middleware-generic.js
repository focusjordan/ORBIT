/**
 * ORBIT Middleware - Generic Implementation
 * 
 * This is a template for integrating ORBIT into ANY platform.
 * Adapt the adapter functions to match your platform's architecture.
 * 
 * Usage Pattern:
 * 1. Implement getAudioBuffer() for your upload architecture
 * 2. Implement mapMetadata() for your metadata schema
 * 3. Insert middleware at appropriate point in your route
 * 4. Handle duplicate response in your UX
 */

const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

// =============================================================================
// CONFIGURATION
// =============================================================================

const ORBIT_CONFIG = {
  apiUrl: process.env.ORBIT_API_URL || 'http://localhost:4000',
  platformId: process.env.ORBIT_PLATFORM_ID,
  privateKey: process.env.ORBIT_PRIVATE_KEY 
    ? Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
    : null,
  apiKey: process.env.ORBIT_API_KEY || null
};

// Singleton ORBIT client
let orbitClient = null;

function getOrbitClient() {
  if (!orbitClient && ORBIT_CONFIG.privateKey) {
    orbitClient = new OrbitClient(ORBIT_CONFIG);
  }
  return orbitClient;
}

// =============================================================================
// PLATFORM ADAPTER INTERFACE
// =============================================================================

/**
 * Platform Adapter Interface
 * 
 * Implement these functions to match your platform's architecture:
 */

class PlatformAdapter {
  /**
   * Get audio buffer from request
   * 
   * Examples:
   * - Memory storage: return req.file.buffer
   * - S3 streaming: download from S3
   * - CDN: fetch from CDN
   * - Local disk: read from temp file
   * 
   * @param {Object} req - Express request object
   * @returns {Promise<Buffer>} Audio buffer
   */
  async getAudioBuffer(req) {
    throw new Error('getAudioBuffer() must be implemented by platform');
  }
  
  /**
   * Map platform metadata to ORBIT schema
   * 
   * ORBIT Required:
   * - title: string
   * - artist: string
   * - duration_ms: number
   * 
   * ORBIT Optional (but recommended):
   * - isrc, upc, genre, p_line, c_line, etc.
   * 
   * @param {Object} req - Express request object
   * @param {Object} technicalMetadata - Auto-extracted from audio
   * @returns {Object} ORBIT metadata object
   */
  mapMetadata(req, technicalMetadata) {
    throw new Error('mapMetadata() must be implemented by platform');
  }
  
  /**
   * Extract technical metadata from audio
   * 
   * Uses music-metadata package to extract:
   * - duration_ms
   * - bitrate
   * - sample_rate
   * - channels
   * - format/codec
   * 
   * @param {Buffer} audioBuffer
   * @returns {Promise<Object>} Technical metadata
   */
  async extractTechnicalMetadata(audioBuffer) {
    const musicMetadata = require('music-metadata');
    const { Readable } = require('stream');
    
    try {
      const readable = Readable.from(audioBuffer);
      const metadata = await musicMetadata.parseStream(readable, {}, { skipCovers: true });
      
      return {
        duration_ms: Math.round(metadata.format.duration * 1000),
        bitrate: metadata.format.bitrate,
        sample_rate: metadata.format.sampleRate,
        channels: metadata.format.numberOfChannels,
        format: metadata.format.container || metadata.format.codec
      };
    } catch (error) {
      console.error('Failed to extract audio metadata:', error.message);
      return {
        duration_ms: null,
        bitrate: null,
        sample_rate: null,
        channels: null,
        format: null
      };
    }
  }
}

// =============================================================================
// EXAMPLE ADAPTERS
// =============================================================================

/**
 * Example 1: Memory Upload (Multer memoryStorage)
 * 
 * Use when: audio is uploaded to backend memory before storage
 * Pros: Simple, no downloads needed
 * Cons: RAM-intensive for large files
 */
class MemoryUploadAdapter extends PlatformAdapter {
  async getAudioBuffer(req) {
    if (!req.file || !req.file.buffer) {
      throw new Error('No audio file in request (expected req.file.buffer)');
    }
    return req.file.buffer;
  }
  
  mapMetadata(req, technicalMetadata) {
    const currentYear = new Date().getFullYear();
    const artistName = req.user?.artistName || req.user?.username || 'Unknown';
    
    return {
      // Required
      title: req.body.title,
      artist: artistName,
      duration_ms: technicalMetadata.duration_ms,
      
      // Optional (adjust field names to match your platform)
      isrc: req.body.isrc || null,
      upc: req.body.upc || null,
      primary_genre: req.body.genre || 'Other',
      p_line: req.body.copyright || `${currentYear} ${artistName}`,
      c_line: req.body.composition_copyright || `${currentYear} ${artistName}`,
      
      // Technical (auto-extracted)
      bitrate: technicalMetadata.bitrate,
      sample_rate: technicalMetadata.sample_rate,
      channels: technicalMetadata.channels,
      format: technicalMetadata.format
    };
  }
}

/**
 * Example 2: S3 Streaming Upload (Ohnrshyp-style)
 * 
 * Use when: audio streams directly to S3 via multer-s3
 * Pros: No memory overhead during upload
 * Cons: Need to download for verification
 */
class S3StreamingAdapter extends PlatformAdapter {
  constructor(s3Client) {
    super();
    this.s3Client = s3Client;
  }
  
  async getAudioBuffer(req) {
    if (!req.files?.audio?.[0]) {
      throw new Error('No audio file in request (expected req.files.audio[0])');
    }
    
    const audioFile = req.files.audio[0];
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    
    const command = new GetObjectCommand({
      Bucket: audioFile.bucket,
      Key: audioFile.key
    });
    
    const response = await this.s3Client.send(command);
    return await this.streamToBuffer(response.Body);
  }
  
  async streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
  
  mapMetadata(req, technicalMetadata) {
    // Same as MemoryUploadAdapter (adjust to your schema)
    const currentYear = new Date().getFullYear();
    const artistName = req.user?.artistName || req.user?.username || 'Unknown';
    
    return {
      title: req.body.title,
      artist: artistName,
      duration_ms: technicalMetadata.duration_ms,
      isrc: req.body.isrc || null,
      upc: req.body.upc || null,
      primary_genre: req.body.genre || 'Other',
      p_line: `${currentYear} ${artistName}`,
      c_line: `${currentYear} ${artistName}`,
      bitrate: technicalMetadata.bitrate,
      sample_rate: technicalMetadata.sample_rate,
      channels: technicalMetadata.channels,
      format: technicalMetadata.format
    };
  }
}

// =============================================================================
// GENERIC MIDDLEWARE
// =============================================================================

/**
 * Create ORBIT duplicate check middleware
 * 
 * @param {PlatformAdapter} adapter - Platform-specific adapter
 * @returns {Function} Express middleware
 */
function createOrbitDuplicateCheck(adapter) {
  return async function orbitDuplicateCheck(req, res, next) {
    const client = getOrbitClient();
    
    // Skip if ORBIT not configured
    if (!client) {
      console.warn('⚠️  ORBIT: Not configured, skipping duplicate check');
      return next();
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🔍 ORBIT: Checking for duplicates...');
      
      // Step 1: Get audio buffer (platform-specific)
      const audioBuffer = await adapter.getAudioBuffer(req);
      console.log(`   ✅ Got audio buffer (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
      
      // Step 2: Extract technical metadata
      const technicalMetadata = await adapter.extractTechnicalMetadata(audioBuffer);
      console.log(`   ✅ Extracted metadata (duration: ${technicalMetadata.duration_ms}ms)`);
      
      // Step 3: Map platform metadata to ORBIT schema
      const orbitMetadata = adapter.mapMetadata(req, technicalMetadata);
      
      // Step 4: Verify with ORBIT
      const verification = await client.verify(audioBuffer);
      const duration = Date.now() - startTime;
      
      console.log(`   ✅ ORBIT verification complete (${duration}ms)`);
      
      // Step 5: Check for duplicate
      if (verification.verified || verification.duplicate_of) {
        const registrationId = verification.fingerprint_match?.registration_id || verification.duplicate_of;
        
        console.log(`   🚫 DUPLICATE detected (registration ${registrationId})`);
        
        return res.status(409).json({
          success: false,
          error: 'DUPLICATE_AUDIO',
          message: 'This audio has already been registered in ORBIT',
          duplicate: {
            registration_id: registrationId,
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
          help: 'This audio file is already registered in ORBIT. If you believe this is an error, please contact support.'
        });
      }
      
      // Step 6: Not a duplicate - attach data for later use
      console.log(`   ✅ New audio, proceeding`);
      
      req.orbit = {
        verified: false,
        fingerprint_hash: verification.fingerprint_hash,
        metadata: orbitMetadata,
        technical_metadata: technicalMetadata,
        checked_at: new Date().toISOString(),
        duration_ms: duration
      };
      
      next();
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`⚠️  ORBIT: Duplicate check failed (${duration}ms):`, error.message);
      
      // Graceful degradation - allow upload to proceed
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.warn('⚠️  ORBIT: Service unavailable, allowing upload');
      } else if (error.response?.status >= 400 && error.response?.status < 500) {
        console.warn(`⚠️  ORBIT: Client error (${error.response.status}), allowing upload`);
      } else {
        console.warn('⚠️  ORBIT: Error, allowing upload to proceed');
      }
      
      next();
    }
  };
}

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/**
 * Example 1: Memory Upload Platform
 * 
 * const adapter = new MemoryUploadAdapter();
 * const orbitMiddleware = createOrbitDuplicateCheck(adapter);
 * 
 * router.post('/upload',
 *   auth,
 *   upload.single('audio'),  // multer memoryStorage
 *   orbitMiddleware,         // Check for duplicates
 *   createTrackHandler
 * );
 */

/**
 * Example 2: S3 Streaming Platform (Ohnrshyp-style)
 * 
 * const adapter = new S3StreamingAdapter(s3Client);
 * const orbitMiddleware = createOrbitDuplicateCheck(adapter);
 * 
 * router.post('/upload',
 *   auth,
 *   uploadToS3,              // multer-s3 streaming
 *   fileValidation,          // Your existing validation
 *   orbitMiddleware,         // Check for duplicates
 *   createTrackHandler
 * );
 */

/**
 * Example 3: Custom Adapter
 * 
 * class MyPlatformAdapter extends PlatformAdapter {
 *   async getAudioBuffer(req) {
 *     // Your platform-specific logic
 *     return await fetchFromYourStorage(req.body.audioId);
 *   }
 *   
 *   mapMetadata(req, tech) {
 *     // Your platform-specific mapping
 *     return { title: req.body.trackName, ... };
 *   }
 * }
 * 
 * const adapter = new MyPlatformAdapter();
 * const orbitMiddleware = createOrbitDuplicateCheck(adapter);
 */

module.exports = {
  createOrbitDuplicateCheck,
  PlatformAdapter,
  MemoryUploadAdapter,
  S3StreamingAdapter,
  getOrbitClient
};
