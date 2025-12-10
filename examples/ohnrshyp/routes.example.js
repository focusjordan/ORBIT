/**
 * ORBIT Integration Examples for Ohnrshyp Routes
 * 
 * This file shows how to integrate ORBIT middleware into your existing routes.
 * Copy the relevant patterns into your actual routes file.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { checkDuplicate, registerWithOrbit, verifyAudio } = require('./orbit.middleware');

// Your existing middleware (these are placeholders)
const auth = require('../../middleware/auth');
const artistOnly = require('../../middleware/artistOnly');
const Track = require('../../models/Track');  // Your Track model

// Multer configuration (your existing setup)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }  // 100MB
});

/**
 * Pattern 1: Upload with Duplicate Check + Auto-Registration
 * 
 * This is the recommended pattern for Ohnrshyp's main upload endpoint.
 * 
 * Flow:
 * 1. User uploads audio
 * 2. checkDuplicate runs BEFORE track creation
 *    - If duplicate: Returns 409, stops here
 *    - If new: Continues to track creation
 * 3. Track is created in Ohnrshyp database
 * 4. registerWithOrbit runs AFTER track creation (Session 17)
 *    - Registers with ORBIT
 *    - Updates track with registration data
 */
router.post('/api/tracks',
  auth,
  artistOnly,
  upload.single('audio'),
  checkDuplicate,              // ← Session 16: Check for duplicates
  async (req, res, next) => {
    try {
      // Your existing track creation logic
      const track = await Track.create({
        title: req.body.title,
        artist: req.user._id,
        duration: req.body.duration,
        audioUrl: req.body.audioUrl,  // From S3 upload
        genre: req.body.genre,
        isrc: req.body.isrc,
        upc: req.body.upc,
        p_line: req.body.p_line || `${new Date().getFullYear()} ${req.user.artistName}`,
        c_line: req.body.c_line || `${new Date().getFullYear()} ${req.user.artistName}`,
        // ... other fields
      });
      
      // Attach track to request for next middleware
      req.track = track;
      
      // Send response to user (don't wait for ORBIT registration)
      res.status(201).json({
        success: true,
        track: track.toJSON()
      });
      
      // Continue to next middleware (registerWithOrbit)
      next();
      
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'UPLOAD_FAILED',
        message: error.message
      });
    }
  },
  registerWithOrbit            // ← Session 17: Auto-register with ORBIT
);

/**
 * Pattern 2: Dedicated Verification Endpoint
 * 
 * Allows users to check if audio is registered WITHOUT uploading a track.
 * Useful for:
 * - Pre-upload checks
 * - Verifying received audio
 * - Admin tools
 */
router.post('/api/orbit/verify',
  auth,
  upload.single('audio'),
  verifyAudio
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
      const { getOrbitClient } = require('./orbit.middleware');
      const client = getOrbitClient();
      
      const result = await client.register(audioBuffer, {
        title: track.title,
        artist: req.user.artistName || req.user.username,
        duration_ms: track.duration * 1000,
        isrc: track.isrc,
        upc: track.upc,
        primary_genre: track.genre,
        p_line: track.p_line,
        c_line: track.c_line
      }, req.user._id.toString());
      
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
