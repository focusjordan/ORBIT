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
    console.warn('[WARN] ORBIT: Not configured, skipping duplicate check');
    return next();
  }
  
  // Skip if no audio uploaded
  if (!req.files?.audio?.[0]) {
    console.warn('[WARN] ORBIT: No audio file in request, skipping');
    return next();
  }
  
  const audioFile = req.files.audio[0];
  const startTime = Date.now();
  
  try {
    console.log('[INFO] ORBIT: Checking for duplicates...');
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
    console.log(`   [OK] Downloaded from S3 (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
    
    // Step 2: Extract technical metadata
    const technicalMetadata = await extractAudioMetadata(audioBuffer);
    console.log(`   [OK] Extracted metadata (duration: ${technicalMetadata.duration_ms}ms)`);
    
    // Step 3: Map Ohnrshyp metadata to ORBIT schema
    const orbitMetadata = mapOhnrshypToOrbit(req, technicalMetadata);
    
    // Step 4: Verify with ORBIT
    const verification = await client.verify(audioBuffer);
    const duration = Date.now() - startTime;
    
    console.log(`   [OK] ORBIT verification complete (${duration}ms)`);
    
    // Step 5: Check for duplicate
    if (verification.verified || verification.duplicate_of) {
      const registrationId = verification.fingerprint_match?.registration_id || verification.duplicate_of;
      
      console.log(`   [INFO] DUPLICATE detected (registration ${registrationId})`);
      
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
    console.log('   [OK] New audio, proceeding with upload');
    
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
    console.error(`[ERROR] ORBIT: Duplicate check failed (${duration}ms):`, error.message);
    
    // Graceful degradation - allow upload to proceed
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn('[WARN] ORBIT: Service unavailable, allowing upload to proceed');
    } else if (error.response?.status >= 400 && error.response?.status < 500) {
      console.warn(`[WARN] ORBIT: Client error (${error.response.status}), allowing upload to proceed`);
    } else if (error.message.includes('S3')) {
      console.error('[ERROR] ORBIT: S3 download failed, allowing upload to proceed');
    } else {
      console.warn('[WARN] ORBIT: Unknown error, allowing upload to proceed');
    }
    
    // Continue without ORBIT verification
    next();
  }
}

/**
 * ORBIT Auto-Registration Middleware for Ohnrshyp
 * 
 * Registers newly created tracks with ORBIT AFTER the track document is saved
 * and response is sent to the user.
 * 
 * Prerequisites:
 * - Track document created (req.track exists)
 * - Track has MongoDB _id
 * - Response already sent to user (don't block upload)
 * - Audio exists in S3 (from uploadToS3 middleware)
 * 
 * Flow:
 * 1. Check if Track model is available
 * 2. Reuse metadata/audio from duplicate check if available
 * 3. Otherwise, download from S3 and extract metadata
 * 4. Call ORBIT register endpoint
 * 5. Update Track document with registration data
 * 6. Log success/failure (but don't fail the request)
 * 
 * Behavior:
 * - Success: Track.orbit updated with registration data
 * - ORBIT unavailable: Logged warning, track remains unregistered
 * - Network/API errors: Logged error, track remains unregistered
 * - Track can be registered later via manual endpoint
 * 
 * Usage in routes:
 * 
 * router.post('/',
 *   auth,
 *   isMusician,
 *   uploadToS3,
 *   fileSecurityValidation,
 *   orbitDuplicateCheck,
 *   contentModerationMiddleware,
 *   async (req, res, next) => {
 *     const track = await Track.create({...});
 *     req.track = track;  // ← Required
 *     res.json({ success: true, track });
 *     next();  // ← Important: pass to next middleware
 *   },
 *   registerWithOrbit  // ← This function
 * );
 */
async function registerWithOrbit(req, res, next) {
  // Skip if ORBIT not configured
  const client = getOrbitClient();
  if (!client) {
    console.log('[WARN] ORBIT: Auto-registration skipped (not configured)');
    return next ? next() : undefined;
  }
  
  // Skip if no track was created
  if (!req.track) {
    console.log('[WARN] ORBIT: Auto-registration skipped (no track in request)');
    return next ? next() : undefined;
  }
  
  // Skip if track already has ORBIT registration
  // Note: Using camelCase to match Ohnrshyp's Track model convention
  if (req.track.orbit?.registrationId) {
    console.log(`[WARN] ORBIT: Track ${req.track._id} already registered (ID: ${req.track.orbit.registrationId})`);
    return next ? next() : undefined;
  }
  
  // Skip if auto-registration is disabled for this track
  if (req.track.orbit?.autoRegister === false) {
    console.log(`[WARN] ORBIT: Auto-registration disabled for track ${req.track._id}`);
    return next ? next() : undefined;
  }
  
  const startTime = Date.now();
  const trackId = req.track._id;
  
  try {
    console.log(`[INFO] ORBIT: Auto-registering track ${trackId}...`);
    
    // Step 1: Get Track model (need it to update after registration)
    // In Ohnrshyp, this would be imported at top of file
    // For now, try to get from req.app.locals or require
    const Track = req.app.locals.Track || require('../../models/Track');
    if (!Track) {
      throw new Error('Track model not available');
    }
    
    // Step 2: Get audio buffer and metadata
    let audioBuffer, orbitMetadata;
    
    // Try to reuse data from duplicate check (more efficient)
    if (req.orbit?.metadata && req.files?.audio?.[0]) {
      console.log('   [INFO] Reusing metadata from duplicate check');
      orbitMetadata = req.orbit.metadata;
      
      // Download audio from S3
      const audioFile = req.files.audio[0];
      const s3Client = req.app.locals.s3Client || global.s3Client;
      
      if (!s3Client) {
        throw new Error('S3 client not available');
      }
      
      audioBuffer = await downloadAudioFromS3(
        s3Client,
        audioFile.bucket,
        audioFile.key
      );
      
      console.log(`   [OK] Downloaded from S3 (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
    } else {
      // Need to fetch from track's audioUrl and extract metadata
      console.log('   [INFO] Fetching audio and extracting metadata');
      
      // Parse S3 URL to get bucket and key
      // Ohnrshyp audioUrl format: https://bucket.s3.region.amazonaws.com/key
      // or s3://bucket/key
      const audioUrl = req.track.audioUrl;
      const { bucket, key } = parseS3Url(audioUrl);
      
      const s3Client = req.app.locals.s3Client || global.s3Client;
      if (!s3Client) {
        throw new Error('S3 client not available');
      }
      
      audioBuffer = await downloadAudioFromS3(s3Client, bucket, key);
      console.log(`   [OK] Downloaded from S3 (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
      
      // Extract technical metadata
      const technicalMetadata = await extractAudioMetadata(audioBuffer);
      console.log(`   [OK] Extracted metadata (duration: ${technicalMetadata.duration_ms}ms)`);
      
      // Map to ORBIT schema
      orbitMetadata = mapOhnrshypToOrbit(req, technicalMetadata);
    }
    
    // Step 3: Register with ORBIT
    console.log('   [INFO] Registering with ORBIT...');
    
    const ownerId = req.user?._id?.toString() || req.track.artist?.toString();
    if (!ownerId) {
      throw new Error('Owner ID not available');
    }
    
    const result = await client.register(audioBuffer, orbitMetadata, ownerId);
    
    const duration = Date.now() - startTime;
    console.log(`   [OK] ORBIT registration complete (${duration}ms)`);
    console.log(`      Registration ID: ${result.registration_id}`);
    
    // Step 4: Update Track document with ORBIT data
    // Note: Using camelCase to match Ohnrshyp's Track model convention
    const updateData = {
      'orbit.registrationId': result.registration_id,
      'orbit.fingerprintHash': result.fingerprint_hash,
      'orbit.watermarkHash': result.watermark_hash || null,
      'orbit.entryHash': result.entry_hash,
      'orbit.registeredAt': new Date(),
      'orbit.lastVerified': new Date()
    };
    
    await Track.findByIdAndUpdate(trackId, updateData);
    
    console.log(`   [OK] Track ${trackId} updated with ORBIT data`);
    console.log('   [OK] Auto-registration successful!');
    
    // Success - continue to next middleware if present
    if (next) next();
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ERROR] ORBIT: Auto-registration failed for track ${trackId} (${duration}ms)`);
    console.error(`   Error: ${error.message}`);
    
    // Log different error types for debugging
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('   Cause: ORBIT service unavailable');
    } else if (error.message.includes('S3')) {
      console.error('   Cause: Failed to download audio from S3');
    } else if (error.message.includes('Track model')) {
      console.error('   Cause: Track model not available');
    } else if (error.response?.status) {
      console.error(`   Cause: ORBIT API error (${error.response.status})`);
    } else {
      console.error('   Cause: Unknown error');
    }
    
    // Important: Don't throw - track upload already succeeded
    // User doesn't need to know registration failed
    // Track can be registered later via manual endpoint
    console.log(`   [INFO] Track ${trackId} created successfully but not registered with ORBIT`);
    console.log('   [INFO] Can be registered later via manual registration endpoint');
    
    // Continue to next middleware if present
    if (next) next();
  }
}

/**
 * Helper: Parse S3 URL to extract bucket and key
 * 
 * Supports formats:
 * - https://bucket.s3.region.amazonaws.com/path/to/file.mp3
 * - https://bucket.s3.amazonaws.com/path/to/file.mp3
 * - https://s3.region.amazonaws.com/bucket/path/to/file.mp3
 * - s3://bucket/path/to/file.mp3
 */
function parseS3Url(url) {
  if (url.startsWith('s3://')) {
    // s3://bucket/key format
    const parts = url.slice(5).split('/');
    const bucket = parts[0];
    const key = parts.slice(1).join('/');
    return { bucket, key };
  }
  
  // HTTPS URL format
  const urlObj = new URL(url);
  
  // Format 1: bucket.s3.region.amazonaws.com/key
  if (urlObj.hostname.includes('.s3.')) {
    const bucket = urlObj.hostname.split('.')[0];
    const key = urlObj.pathname.slice(1); // Remove leading /
    return { bucket, key };
  }
  
  // Format 2: s3.region.amazonaws.com/bucket/key
  if (urlObj.hostname.startsWith('s3.')) {
    const parts = urlObj.pathname.slice(1).split('/');
    const bucket = parts[0];
    const key = parts.slice(1).join('/');
    return { bucket, key };
  }
  
  throw new Error(`Unable to parse S3 URL: ${url}`);
}

module.exports = {
  orbitDuplicateCheck,
  registerWithOrbit,
  getOrbitClient,
  mapOhnrshypToOrbit,
  extractAudioMetadata,
  downloadAudioFromS3,
  parseS3Url
};
