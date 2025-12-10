/**
 * ORBIT Middleware for Ohnrshyp
 * 
 * Architecture-specific implementation for Ohnrshyp's S3 streaming upload flow.
 * 
 * Ohnrshyp Flow:
 * 1. Browser → multer-s3 streams → S3 (audio already uploaded)
 * 2. fileSecurityValidation downloads from S3 for validation
 * 3. orbitDuplicateCheck downloads from S3 for fingerprinting (THIS FILE)
 * 4. contentModerationMiddleware
 * 5. Track document created
 * 
 * Integration Point:
 * router.post('/',
 *   auth,
 *   isMusician,
 *   uploadToS3,
 *   fileSecurityValidation,
 *   orbitDuplicateCheck,        // ← This middleware
 *   contentModerationMiddleware,
 *   createTrackHandler
 * );
 */

const { OrbitClient } = require('@ohnrshyp/orbit-sdk');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const musicMetadata = require('music-metadata');
const { Readable } = require('stream');

// AWS S3 client (assumes you have s3Client configured)
// Import from your existing S3 config
// const { s3Client } = require('../config/s3.config');

// ORBIT Configuration
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
 * Helper: Convert S3 stream to Buffer
 * (Same pattern used in fileSecurityValidation)
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Helper: Download audio from S3
 * (Follows same pattern as fileSecurityValidation)
 */
async function downloadAudioFromS3(s3Client, bucket, key) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const response = await s3Client.send(command);
    const buffer = await streamToBuffer(response.Body);
    
    return buffer;
  } catch (error) {
    throw new Error(`Failed to download audio from S3: ${error.message}`);
  }
}

/**
 * Helper: Extract audio metadata using music-metadata
 */
async function extractAudioMetadata(audioBuffer) {
  try {
    const readable = Readable.from(audioBuffer);
    const metadata = await musicMetadata.parseStream(readable, {}, { skipCovers: true });
    
    return {
      duration_ms: Math.round(metadata.format.duration * 1000),
      bitrate: metadata.format.bitrate,
      sample_rate: metadata.format.sampleRate,
      channels: metadata.format.numberOfChannels,
      format: metadata.format.container || metadata.format.codec,
      codec: metadata.format.codec
    };
  } catch (error) {
    console.error('Failed to extract audio metadata:', error.message);
    return {
      duration_ms: null,
      bitrate: null,
      sample_rate: null,
      channels: null,
      format: null,
      codec: null
    };
  }
}

/**
 * Helper: Map Ohnrshyp metadata to ORBIT schema
 */
function mapOhnrshypToOrbit(req, technicalMetadata) {
  const currentYear = new Date().getFullYear();
  
  // Get artist name (preferred from profile, fallback to username)
  const artistName = req.user?.artistProfile?.artistName || req.user?.username || 'Unknown Artist';
  
  return {
    // ========================================
    // REQUIRED FIELDS
    // ========================================
    title: req.body.title,
    artist: artistName,
    duration_ms: technicalMetadata.duration_ms,
    
    // ========================================
    // IDENTIFIERS (not collected by Ohnrshyp)
    // ========================================
    isrc: null,  // Could generate: `ORBIT-${ORBIT_PLATFORM_ID}-${Date.now()}`
    upc: null,   // Not applicable for single tracks
    
    // ========================================
    // COPYRIGHT (not collected, generate defaults)
    // ========================================
    p_line: `${currentYear} ${artistName}`,
    c_line: `${currentYear} ${artistName}`,
    
    // ========================================
    // DESCRIPTIVE
    // ========================================
    primary_genre: req.body.genre || 'Other',
    secondary_genre: req.body.mood || null,  // Map mood to secondary_genre
    language: 'en',  // Default to English
    
    // ========================================
    // RELEASE INFO
    // ========================================
    album_title: req.body.albumTitle || null,
    track_number: null,
    release_date: req.body.releaseDate || null,
    label: 'Independent',
    version: null,
    
    // ========================================
    // CONTENT ADVISORY
    // ========================================
    parental_advisory: 'none',  // Ohnrshyp doesn't collect this
    
    // ========================================
    // TECHNICAL (auto-extracted)
    // ========================================
    bitrate: technicalMetadata.bitrate,
    sample_rate: technicalMetadata.sample_rate,
    channels: technicalMetadata.channels,
    format: technicalMetadata.format || technicalMetadata.codec,
    
    // ========================================
    // CONTRIBUTORS (not collected by Ohnrshyp)
    // ========================================
    featured_artists: null,
    composers: null,
    lyricists: null,
    writers: null,
    producers: null,
    
    // ========================================
    // DISTRIBUTION
    // ========================================
    territories: ['WW'],  // Worldwide
    preview_start_ms: null
  };
}

/**
 * ORBIT Duplicate Check Middleware for Ohnrshyp
 * 
 * Checks for duplicate audio BEFORE Track document is created.
 * 
 * Prerequisites:
 * - uploadToS3 middleware has completed (audio in S3)
 * - req.files.audio[0] contains S3 location info
 * - User is authenticated (req.user exists)
 * 
 * Behavior:
 * - Downloads audio from S3 (same pattern as fileSecurityValidation)
 * - Extracts technical metadata with music-metadata
 * - Calls ORBIT verify endpoint
 * - Returns 409 if duplicate, continues if new
 * - Graceful degradation if ORBIT is unavailable
 */
async function orbitDuplicateCheck(req, res, next) {
  // Skip if ORBIT not configured
  const client = getOrbitClient();
  if (!client) {
    console.warn('⚠️  ORBIT: Not configured, skipping duplicate check');
    return next();
  }
  
  // Skip if no audio uploaded
  if (!req.files?.audio?.[0]) {
    console.warn('⚠️  ORBIT: No audio file in request, skipping');
    return next();
  }
  
  const audioFile = req.files.audio[0];
  const startTime = Date.now();
  
  try {
    console.log(`🔍 ORBIT: Checking for duplicates...`);
    console.log(`   S3 Key: ${audioFile.key}`);
    console.log(`   Size: ${(audioFile.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Step 1: Download audio from S3
    // Note: Import s3Client from your existing config
    // For now, this assumes you export it from config/s3.config.js
    const s3Client = req.app.locals.s3Client || global.s3Client;
    if (!s3Client) {
      throw new Error('S3 client not available');
    }
    
    const audioBuffer = await downloadAudioFromS3(
      s3Client,
      audioFile.bucket,
      audioFile.key
    );
    console.log(`   ✅ Downloaded from S3 (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
    
    // Step 2: Extract technical metadata
    const technicalMetadata = await extractAudioMetadata(audioBuffer);
    console.log(`   ✅ Extracted metadata (duration: ${technicalMetadata.duration_ms}ms)`);
    
    // Step 3: Map Ohnrshyp metadata to ORBIT schema
    const orbitMetadata = mapOhnrshypToOrbit(req, technicalMetadata);
    
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
          watermark_valid: verification.watermark?.valid || false,
          transfers: verification.transfers || []
        },
        help: 'This exact audio file is already registered in ORBIT. If you believe this is an error, please contact support.',
        orbit_verification: {
          checked_at: new Date().toISOString(),
          duration_ms: duration
        }
      });
    }
    
    // Step 6: Not a duplicate - attach data for potential use
    console.log(`   ✅ New audio, proceeding with upload`);
    
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
      console.warn('⚠️  ORBIT: Service unavailable, allowing upload to proceed');
    } else if (error.response?.status >= 400 && error.response?.status < 500) {
      console.warn(`⚠️  ORBIT: Client error (${error.response.status}), allowing upload to proceed`);
    } else if (error.message.includes('S3')) {
      console.error('⚠️  ORBIT: S3 download failed, allowing upload to proceed');
    } else {
      console.warn('⚠️  ORBIT: Unknown error, allowing upload to proceed');
    }
    
    // Continue without ORBIT verification
    next();
  }
}

module.exports = {
  orbitDuplicateCheck,
  getOrbitClient,
  mapOhnrshypToOrbit,
  extractAudioMetadata,
  downloadAudioFromS3
};
