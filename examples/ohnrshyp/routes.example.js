/**
 * ORBIT Integration Examples for Ohnrshyp Routes
 * 
 * This file shows how to integrate ORBIT middleware into your existing routes.
 * Copy the relevant patterns into your actual routes file.
 */

/**
 * ORBIT Integration Examples for Ohnrshyp Routes
 * 
 * This file shows how to integrate ORBIT middleware into your existing routes.
 * Copy the relevant patterns into your actual routes file.
 * 
 * Session 16: orbitDuplicateCheck (duplicate detection)
 * Session 17: registerWithOrbit (auto-registration after track creation)
 */

const express = require('express');
const router = express.Router();
const { 
  orbitDuplicateCheck,      // Session 16: Check for duplicates before track creation
  registerWithOrbit          // Session 17: Auto-register after track creation
} = require('./orbit-middleware-ohnrshyp');  // ← Use the S3-aware version

// Your existing Ohnrshyp middleware (adjust paths as needed)
const auth = require('../../middleware/auth.middleware');
const isMusician = require('../../middleware/isMusician');
const Track = require('../../models/track.model');

// Note: Ohnrshyp uses multer-s3 for direct streaming to S3
// This is just a placeholder - use your actual upload configuration
// const { uploadToS3 } = require('../../middleware/upload.middleware');

/**
 * Pattern 1: Upload with Duplicate Check + Auto-Registration
 * 
 * ⭐ RECOMMENDED PATTERN for Ohnrshyp's main upload endpoint
 * 
 * Flow:
 * 1. uploadToS3 - Streams audio directly to S3 (Ohnrshyp's existing middleware)
 * 2. fileSecurityValidation - Downloads from S3, validates file (existing)
 * 3. orbitDuplicateCheck - Downloads from S3, checks for duplicates (Session 16)
 *    ✅ If new: Continues to track creation
 *    🚫 If duplicate: Returns 409, stops here
 * 4. contentModerationMiddleware - Existing Ohnrshyp middleware
 * 5. Track created in MongoDB
 * 6. Response sent to user
 * 7. registerWithOrbit - Auto-registers with ORBIT in background (Session 17)
 * 
 * Key Points:
 * - Response sent BEFORE ORBIT registration (non-blocking)
 * - ORBIT failures don't affect upload success
 * - Track.orbit field updated after registration
 * - Can retry registration later via manual endpoint
 */
router.post('/api/music',
  auth,
  isMusician,
  // uploadToS3,                 // Your existing S3 streaming upload
  // fileSecurityValidation,     // Your existing security validation
  orbitDuplicateCheck,           // ← Session 16: ORBIT duplicate detection
  // contentModerationMiddleware, // Your existing moderation
  async (req, res, next) => {
    try {
      // Get artist name for metadata
      const artistName = req.user.artistProfile?.artistName || req.user.username;
      const currentYear = new Date().getFullYear();
      
      // Create track in Ohnrshyp database
      const track = await Track.create({
        title: req.body.title,
        artist: req.user._id,
        duration: req.body.duration || 0,
        audioUrl: req.files.audio[0].location,  // S3 URL from multer-s3
        genre: req.body.genre,
        mood: req.body.mood,
        albumTitle: req.body.albumTitle,
        releaseDate: req.body.releaseDate,
        
        // ISRC/UPC (if provided)
        isrc: req.body.isrc || null,
        upc: req.body.upc || null,
        
        // Copyright info
        p_line: req.body.p_line || `${currentYear} ${artistName}`,
        c_line: req.body.c_line || `${currentYear} ${artistName}`,
        
        // ORBIT subdocument (will be populated by registerWithOrbit)
        orbit: {
          registration_id: null,
          fingerprint_hash: null,
          registered_at: null,
          auto_register: true  // Enable auto-registration
        }
      });
      
      // ✅ CRITICAL: Attach track to request for registerWithOrbit middleware
      req.track = track;
      
      // ✅ Send response immediately (don't wait for ORBIT)
      res.status(201).json({
        success: true,
        message: 'Track uploaded successfully',
        track: {
          _id: track._id,
          title: track.title,
          artist: track.artist,
          audioUrl: track.audioUrl,
          duration: track.duration,
          genre: track.genre,
          orbit: {
            status: 'pending_registration'  // Will be updated by next middleware
          }
        }
      });
      
      // ✅ Continue to next middleware (ORBIT registration happens in background)
      next();
      
    } catch (error) {
      console.error('Track creation failed:', error);
      res.status(500).json({
        success: false,
        error: 'UPLOAD_FAILED',
        message: error.message
      });
    }
  },
  registerWithOrbit              // ← Session 17: Auto-register with ORBIT (non-blocking)
);

/**
 * Pattern 2: Dedicated Verification Endpoint
 * 
 * Allows users to check if audio is registered WITHOUT uploading a track.
 * 
 * Use Cases:
 * - Pre-upload duplicate check
 * - Verifying received audio files
 * - Admin investigation tools
 * - Copyright verification
 * 
 * Note: This requires implementing a separate verifyAudio handler
 * that calls OrbitClient.verify() and returns the result.
 */
router.post('/api/orbit/verify',
  auth,
  // upload.single('audio'),  // You'd need a temporary upload handler
  async (req, res) => {
    try {
      const { getOrbitClient } = require('./orbit-middleware-ohnrshyp');
      const client = getOrbitClient();
      
      if (!client) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'ORBIT service not configured'
        });
      }
      
      // Verify audio (assuming audio buffer in req.file)
      const verification = await client.verify(req.file.buffer);
      
      res.json({
        success: true,
        verified: verification.verified,
        provenance: {
          is_registered: verification.verified,
          registration_id: verification.fingerprint_match?.registration_id,
          metadata: verification.metadata || null,
          origin: verification.origin || null,
          watermark: {
            detected: verification.watermark?.detected || false,
            valid: verification.watermark?.valid || false
          }
        }
      });
      
    } catch (error) {
      console.error('ORBIT verification failed:', error);
      res.status(500).json({
        success: false,
        error: 'VERIFICATION_FAILED',
        message: error.message
      });
    }
  }
);

/**
 * Pattern 3: Get ORBIT Status for Existing Track
 * 
 * Returns ORBIT registration status for a track.
 */
router.get('/api/tracks/:trackId/orbit',
  auth,
  async (req, res) => {
    try {
      const track = await Track.findById(req.params.trackId);
      
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'TRACK_NOT_FOUND'
        });
      }
      
      // Check if user owns this track or is admin
      if (track.artist.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN'
        });
      }
      
      res.json({
        success: true,
        orbit: {
          is_registered: !!track.orbit?.registration_id,
          registration_id: track.orbit?.registration_id,
          registered_at: track.orbit?.registered_at,
          fingerprint_hash: track.orbit?.fingerprint_hash?.toString('hex'),
          transfers: track.orbit?.transfers || [],
          last_verified: track.orbit?.last_verified
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: error.message
      });
    }
  }
);

/**
 * Pattern 4: Manual ORBIT Registration
 * 
 * Allows artists to register existing tracks that weren't auto-registered.
 * Useful for:
 * - Tracks uploaded before ORBIT integration
 * - Tracks where auto-registration was disabled
 * - Re-registration after errors
 */
router.post('/api/tracks/:trackId/orbit/register',
  auth,
  artistOnly,
  async (req, res) => {
    try {
      const track = await Track.findById(req.params.trackId);
      
      if (!track) {
        return res.status(404).json({
          success: false,
          error: 'TRACK_NOT_FOUND'
        });
      }
      
      // Check ownership
      if (track.artist.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN'
        });
      }
      
      // Check if already registered
      if (track.orbit?.registration_id) {
        return res.status(409).json({
          success: false,
          error: 'ALREADY_REGISTERED',
          registration_id: track.orbit.registration_id
        });
      }
      
      // Fetch audio from S3 (your existing logic)
      const audioBuffer = await fetchAudioFromS3(track.audioUrl);
      
      // Register with ORBIT (using SDK)
      const { getOrbitClient, mapOhnrshypToOrbit, extractAudioMetadata } = require('./orbit-middleware-ohnrshyp');
      const client = getOrbitClient();

      if (!client) {
        return res.status(503).json({
          success: false,
          error: 'ORBIT_UNAVAILABLE',
          message: 'ORBIT service not configured'
        });
      }
      
      // Extract technical metadata
      const technicalMetadata = await extractAudioMetadata(audioBuffer);
      
      // Build metadata object
      const metadata = {
        title: track.title,
        artist: req.user.artistProfile?.artistName || req.user.username,
        duration_ms: technicalMetadata.duration_ms || track.duration * 1000,
        isrc: track.isrc,
        upc: track.upc,
        primary_genre: track.genre,
        p_line: track.p_line,
        c_line: track.c_line,
        bitrate: technicalMetadata.bitrate,
        sample_rate: technicalMetadata.sample_rate,
        channels: technicalMetadata.channels,
        format: technicalMetadata.format
      };
      
      const result = await client.register(audioBuffer, metadata, req.user._id.toString());
      
      // Update track with ORBIT data
      track.orbit = {
        registration_id: result.registration_id,
        fingerprint_hash: result.fingerprint_hash,
        entry_hash: result.entry_hash,
        registered_at: new Date()
      };
      await track.save();
      
      res.json({
        success: true,
        message: 'Track registered with ORBIT',
        orbit: {
          registration_id: result.registration_id,
          registered_at: track.orbit.registered_at
        }
      });
      
    } catch (error) {
      console.error('Manual ORBIT registration failed:', error);
      res.status(500).json({
        success: false,
        error: 'REGISTRATION_FAILED',
        message: error.message
      });
    }
  }
);

// Helper function (you would have your own implementation)
async function fetchAudioFromS3(audioUrl) {
  // Your S3 fetch logic here
  // Return Buffer
  throw new Error('fetchAudioFromS3 not implemented - add your S3 logic');
}

module.exports = router;
