/**
 * ORBIT Verification Handler
 * POST /orbit/v1/verify
 * 
 * Verifies audio provenance by:
 * 1. Generating fingerprint and searching database for matches
 * 2. Extracting watermark and validating integrity
 * 3. Verifying cryptographic signatures
 * 4. Building comprehensive provenance response
 * 5. Flagging duplicates from different owners
 * 
 * V2 Note (Session 25): This response will be enhanced with:
 * - AI-extracted metadata (genre, mood, BPM, key)
 * - Content relationship detection (covers, remixes)
 * - MERT semantic similarity scores
 * - Enhanced confidence metrics
 * 
 * Design: Response structure is extensible to support v2 additions
 * without breaking v1 clients.
 */

const OrbitFingerprint = require('../../engines/fingerprint');
const OrbitCrypto = require('../../engines/crypto');
const OrbitWatermark = require('../../engines/watermark');
const queries = require('../../ledger/queries');
const config = require('../../config');
const AudioUtils = require('../../utils/audio');

/**
 * Main verification handler
 * Expects CBOR/JSON request with:
 * - audio: base64-encoded audio buffer
 */
async function verifyHandler(req, res) {
  const startTime = Date.now();
  
  try {
    // ========================================================================
    // 1. VALIDATE INPUT
    // ========================================================================
    
    const { audio } = req.body;
    
    if (!audio) {
      return res.orbitError(
        'missing_audio',
        'Audio file is required in request body',
        400
      );
    }
    
    // Decode audio from base64
    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audio, 'base64');
    } catch (error) {
      return res.orbitError(
        'invalid_audio',
        'Audio must be valid base64-encoded data',
        400
      );
    }
    
    if (audioBuffer.length === 0) {
      return res.orbitError(
        'empty_audio',
        'Audio buffer is empty',
        400
      );
    }
    
    console.log(`[Verify] Processing audio: ${audioBuffer.length} bytes`);
    
    // ========================================================================
    // 2. GENERATE FINGERPRINT
    // ========================================================================
    
    let fingerprintData;
    try {
      fingerprintData = await OrbitFingerprint.generate(audioBuffer);
      console.log(`[Verify] Fingerprint generated: ${fingerprintData.hash.toString('hex').slice(0, 16)}...`);
    } catch (error) {
      return res.orbitError(
        'fingerprint_error',
        `Failed to generate fingerprint: ${error.message}`,
        400
      );
    }
    
    // ========================================================================
    // 3. SEARCH DATABASE FOR MATCHES
    // ========================================================================
    
    const matches = await queries.findByFingerprint(fingerprintData.hash);
    console.log(`[Verify] Found ${matches.length} fingerprint match(es)`);
    
    // ========================================================================
    // 4. EXTRACT WATERMARK
    // ========================================================================
    
    let watermarkResult = {
      detected: false,
      valid: false,
      payload: null,
      confidence: 0,
      extracted_data: null
    };
    
    try {
      // Convert audio to samples for watermark extraction
      const samples = await AudioUtils.decodeAudioToSamples(audioBuffer);
      console.log(`[Verify] Audio decoded: ${samples.length} samples`);
      
      // Initialize watermark engine with secret key
      const watermark = new OrbitWatermark(config.orbit.secretKey);
      
      // Extract watermark with offset search
      const extracted = watermark.extractWithOffsetSearch(samples);
      
      if (extracted.valid) {
        watermarkResult.detected = true;
        watermarkResult.valid = true;
        watermarkResult.payload = extracted.payload;
        watermarkResult.confidence = extracted.confidence;
        
        // Parse watermark payload
        const parsed = watermark.parsePayload(extracted.payload);
        if (parsed) {
          watermarkResult.extracted_data = {
            magic: parsed.magic,
            version: parsed.version,
            timestamp: new Date(parsed.timestamp).toISOString(),
            platform_hash: parsed.platformHash.toString('hex'),
            payload_hash: parsed.payloadHash.toString('hex'),
            crc_valid: parsed.crcValid
          };
          console.log(`[Verify] Watermark extracted: platform=${watermarkResult.extracted_data.platform_hash.slice(0, 8)}...`);
        }
      } else {
        console.log(`[Verify] Watermark not detected or invalid`);
      }
    } catch (error) {
      console.warn(`[Verify] Watermark extraction failed: ${error.message}`);
      // Non-fatal: continue with fingerprint-only verification
    }
    
    // ========================================================================
    // 5. BUILD VERIFICATION RESPONSE
    // ========================================================================
    
    // Base response structure
    const response = {
      verified: matches.length > 0,
      fingerprint_hash: fingerprintData.hash.toString('hex'),
      fingerprint_match: null,
      watermark: watermarkResult,
      metadata: null,
      origin: null,
      transfers: [], // V1: not implemented yet (Session 13)
      duplicate_of: null,
      processing_time_ms: Date.now() - startTime
    };
    
    // If no matches found, return early with unverified response
    if (matches.length === 0) {
      console.log(`[Verify] No matches found - audio not registered`);
      return res.orbit(response, 200);
    }
    
    // ========================================================================
    // 6. PROCESS MATCHES AND BUILD PROVENANCE
    // ========================================================================
    
    // Get the first (oldest) registration for primary match
    const primaryMatch = matches[0];
    
    // Get full registration details
    const registration = await queries.getRegistration(primaryMatch.id);
    
    if (!registration) {
      return res.orbitError(
        'database_error',
        'Registration found but could not retrieve details',
        500
      );
    }
    
    // Build fingerprint match info
    response.fingerprint_match = {
      registration_id: registration.id,
      similarity: 1.0, // V1: Chromaprint is exact match only (Session 19 adds MERT similarity)
      matched_at: registration.created_at
    };
    
    // Extract metadata (handle JSONB fields)
    response.metadata = {
      isrc: registration.isrc,
      upc: registration.upc,
      title: registration.title,
      artist: registration.artist,
      duration_ms: registration.duration_ms,
      p_line: registration.p_line,
      c_line: registration.c_line,
      primary_genre: registration.primary_genre,
      secondary_genre: registration.secondary_genre,
      language: registration.language,
      album_title: registration.album_title,
      track_number: registration.track_number,
      release_date: registration.release_date,
      label: registration.label,
      version: registration.version,
      parental_advisory: registration.parental_advisory,
      // Technical metadata
      bitrate: registration.bitrate,
      sample_rate: registration.sample_rate,
      channels: registration.channels,
      format: registration.format,
      // Contributors (parse JSONB if present)
      featured_artists: registration.featured_artists || null,
      composers: registration.composers || null,
      lyricists: registration.lyricists || null,
      writers: registration.writers || null,
      producers: registration.producers || null,
      remixer: registration.remixer,
      // Rights
      iswc: registration.iswc,
      territories: registration.territories || null,
      preview_start_ms: registration.preview_start_ms
    };
    
    // ========================================================================
    // 7. VERIFY CRYPTOGRAPHIC SIGNATURE
    // ========================================================================
    
    let signatureValid = false;
    try {
      // Get platform public key
      const platform = await queries.getPlatform(registration.origin_platform);
      
      if (platform && platform.public_key) {
        // Decode CBOR payload and verify signature
        const payloadData = OrbitCrypto.decode(registration.payload_cbor);
        signatureValid = OrbitCrypto.verify(
          payloadData,
          registration.origin_signature,
          platform.public_key
        );
        console.log(`[Verify] Signature verification: ${signatureValid ? 'VALID' : 'INVALID'}`);
      } else {
        console.warn(`[Verify] Platform not found or missing public key: ${registration.origin_platform}`);
      }
    } catch (error) {
      console.error(`[Verify] Signature verification error: ${error.message}`);
    }
    
    // Build origin section
    response.origin = {
      platform: registration.origin_platform,
      owner_id: registration.owner_id,
      timestamp: registration.origin_timestamp,
      signature_valid: signatureValid,
      registered_at: registration.created_at
    };
    
    // ========================================================================
    // 8. CHECK FOR DUPLICATES FROM DIFFERENT OWNERS
    // ========================================================================
    
    // If there are multiple registrations with different owners, flag as duplicate
    if (matches.length > 1) {
      // Check if any match has a different owner than the first
      const differentOwner = matches.find(m => m.owner_id !== primaryMatch.owner_id);
      
      if (differentOwner) {
        response.duplicate_of = {
          registration_id: primaryMatch.id,
          owner_id: primaryMatch.owner_id,
          platform: primaryMatch.origin_platform,
          registered_at: primaryMatch.created_at,
          duplicate_registrations: matches.slice(1).map(m => ({
            registration_id: m.id,
            owner_id: m.owner_id,
            platform: m.origin_platform,
            registered_at: m.created_at
          }))
        };
        console.log(`[Verify] Duplicate detected: ${matches.length} registrations found`);
      }
    }
    
    // ========================================================================
    // 9. RETURN COMPLETE VERIFICATION RESPONSE
    // ========================================================================
    
    console.log(`[Verify] Verification complete: verified=${response.verified}, time=${response.processing_time_ms}ms`);
    return res.orbit(response, 200);
    
  } catch (error) {
    console.error('[Verify] Unexpected error:', error);
    return res.orbitError(
      'verification_error',
      `Verification failed: ${error.message}`,
      500
    );
  }
}

module.exports = verifyHandler;

