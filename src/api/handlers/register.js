/**
 * ORBIT Registration Handler
 * POST /orbit/v1/register
 * 
 * Registers new audio with ORBIT, embedding watermark and recording provenance.
 * 
 * Flow:
 * 1. Validate input (audio + required metadata)
 * 2. Generate fingerprint and check for duplicates
 * 3. Build CBOR payload with all metadata
 * 4. Sign payload with platform key
 * 5. Create watermark payload and embed into audio
 * 6. Insert registration into database
 * 7. Optionally compute audio embedding for similarity search
 * 8. Return registration ID, fingerprint, and watermarked audio
 * 
 * Session 19: Added optional semantic fingerprinting
 * Session 22: Switched from MERT (CC BY-NC 4.0) to CLAP embeddings (Apache 2.0)
 * - Set ORBIT_ENABLE_EMBEDDING_ON_REGISTER=true to auto-compute embeddings
 * - Or pass include_embedding: true in metadata for per-request control
 */

const OrbitFingerprint = require('../../engines/fingerprint');
const OrbitCrypto = require('../../engines/crypto');
const { UnifiedWatermark, getWatermarkMethod } = require('../../engines/watermark-unified');
const queries = require('../../ledger/queries');
const config = require('../../config');
const AudioUtils = require('../../utils/audio');

// CLAP for audio embeddings (Apache 2.0 licensed - commercially safe)
const clap = require('../../ml/clap');

/**
 * Validate required metadata fields
 * @param {Object} metadata - Metadata object from request
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateMetadata(metadata) {
  const errors = [];
  const required = ['title', 'artist', 'duration_ms'];
  
  for (const field of required) {
    if (!metadata[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate types
  if (metadata.duration_ms && typeof metadata.duration_ms !== 'number') {
    errors.push('duration_ms must be a number');
  }
  
  // Validate enums
  if (metadata.parental_advisory && 
      !['explicit', 'clean', 'none'].includes(metadata.parental_advisory)) {
    errors.push('parental_advisory must be one of: explicit, clean, none');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Main registration handler
 * Expects multipart/form-data with:
 * - metadata: CBOR-encoded metadata (in req.parsedMetadata)
 * - audio: Binary audio file (in req.audioBuffer)
 */
async function registerHandler(req, res) {
  const startTime = Date.now();
  
  try {
    // ========================================================================
    // 1. VALIDATE INPUT (from multipart middleware)
    // ========================================================================
    
    // Multipart middleware (parseCborMetadata) has already parsed these
    const metadata = req.parsedMetadata;
    const audioBuffer = req.audioBuffer;
    const owner_id = metadata.owner_id;
    
    if (!audioBuffer) {
      return res.orbitError('missing_audio', 'Audio file is required', 400);
    }
    
    if (!metadata) {
      return res.orbitError('missing_metadata', 'Metadata is required', 400);
    }
    
    if (!owner_id) {
      return res.orbitError('missing_owner', 'owner_id is required in metadata', 400);
    }
    
    // Validate metadata
    const validation = validateMetadata(metadata);
    if (!validation.valid) {
      return res.orbitError(
        'invalid_metadata',
        'Invalid metadata: ' + validation.errors.join(', '),
        400
      );
    }
    
    // ========================================================================
    // 2. PROCESS AUDIO & GENERATE FINGERPRINT
    // ========================================================================
    
    console.log(`📁 Received ${audioBuffer.length} bytes of audio`);
    
    // Generate fingerprint
    console.log('🔍 Generating fingerprint...');
    const fingerprint = await OrbitFingerprint.generate(audioBuffer);
    console.log(`✅ Fingerprint generated: ${fingerprint.hash.toString('hex').slice(0, 16)}...`);
    console.log(`   Duration: ${fingerprint.duration}s`);
    
    // ========================================================================
    // 3. CHECK FOR DUPLICATES
    // ========================================================================
    
    console.log('🔎 Checking for duplicates...');
    const existingRegistrations = await OrbitFingerprint.findMatches(fingerprint.hash, queries);
    
    if (existingRegistrations.length > 0) {
      // Check if same platform already registered this
      const samePlatformDuplicate = existingRegistrations.find(
        reg => reg.origin_platform === req.platform.id
      );
      
      if (samePlatformDuplicate) {
        return res.orbitError(
          'duplicate_registration',
          'This audio has already been registered by your platform',
          409,
          {
            duplicate_of: samePlatformDuplicate.id,
            registered_at: samePlatformDuplicate.created_at,
            title: samePlatformDuplicate.title,
            artist: samePlatformDuplicate.artist
          }
        );
      }
      
      // Different platform registered it - log warning but allow (multi-platform allowed)
      console.log(`⚠️  Audio already registered by ${existingRegistrations[0].origin_platform}, allowing multi-platform registration`);
    }
    
    // ========================================================================
    // 4. BUILD CBOR PAYLOAD WITH FULL METADATA
    // ========================================================================
    
    console.log('📦 Building CBOR payload...');
    
    const timestamp = Date.now();
    
    // Build complete metadata object for CBOR payload
    // V2 extensibility: This structure can be extended with ai_metadata in Session 21
    const payloadData = {
      _v: 1, // Protocol version
      _t: 'registration', // Message type
      
      // Core metadata (required)
      title: metadata.title,
      artist: metadata.artist,
      duration_ms: metadata.duration_ms,
      
      // Identifiers (optional but recommended)
      isrc: metadata.isrc || null,
      upc: metadata.upc || null,
      
      // Copyright
      p_line: metadata.p_line || null,
      c_line: metadata.c_line || null,
      
      // Classification
      primary_genre: metadata.primary_genre || null,
      secondary_genre: metadata.secondary_genre || null,
      language: metadata.language || null,
      
      // Technical (auto-extracted from audio if not provided)
      bitrate: metadata.bitrate || null,
      sample_rate: metadata.sample_rate || 44100,
      channels: metadata.channels || 2,
      format: metadata.format || 'wav',
      
      // Extended metadata
      album_title: metadata.album_title || null,
      track_number: metadata.track_number || null,
      release_date: metadata.release_date || null,
      original_release_date: metadata.original_release_date || null,
      label: metadata.label || null,
      catalog_number: metadata.catalog_number || null,
      version: metadata.version || null,
      parental_advisory: metadata.parental_advisory || null,
      
      // Contributors
      featured_artists: metadata.featured_artists || null,
      composers: metadata.composers || null,
      lyricists: metadata.lyricists || null,
      writers: metadata.writers || null,
      producers: metadata.producers || null,
      remixer: metadata.remixer || null,
      recording_location: metadata.recording_location || null,
      recording_year: metadata.recording_year || null,
      
      // Rights
      iswc: metadata.iswc || null,
      territories: metadata.territories || null,
      preview_start_ms: metadata.preview_start_ms || null,
      
      // Ownership
      owner_id: owner_id,
      origin_platform: req.platform.id,
      origin_timestamp: timestamp,
      
      // Fingerprint
      fingerprint_hash: fingerprint.hash,
      fingerprint_raw: fingerprint.raw,
    };
    
    // Encode to CBOR
    const payloadCbor = OrbitCrypto.encode(payloadData);
    console.log(`   CBOR payload size: ${payloadCbor.length} bytes`);
    
    // ========================================================================
    // 5. SIGN PAYLOAD
    // ========================================================================
    
    console.log('🔏 Signing payload...');
    
    // Get this ORBIT node's private key
    const nodePrivateKey = config.orbit.privateKey;
    if (!nodePrivateKey) {
      throw new Error('ORBIT_PRIVATE_KEY not configured');
    }
    
    // Decode private key from base64
    const privateKeyBuffer = Buffer.from(nodePrivateKey, 'base64');
    
    // Sign the payload with this node's private key
    const signature = OrbitCrypto.sign(payloadData, privateKeyBuffer);
    
    // Add signature to payload
    payloadData.signature = signature;
    const signedPayloadCbor = OrbitCrypto.encode(payloadData);
    
    // ========================================================================
    // 6. CREATE WATERMARK & EMBED INTO AUDIO
    // ========================================================================
    
    console.log('💧 Creating watermark...');
    console.log(`   Method: ${getWatermarkMethod()} (ORBIT_WATERMARK_METHOD)`);
    
    // Create unified watermark instance (handles neural + spread spectrum)
    const watermark = new UnifiedWatermark(config.orbit.secretKey);
    
    // Create payload hash (16 bytes for spread spectrum, 5 bytes used for neural)
    const payloadHash = OrbitCrypto.hash(signedPayloadCbor).slice(0, 16);
    
    // Prepare payload data
    const payloadData = {
      platform: req.platform.id,
      timestamp: timestamp,
      payloadHash: payloadHash
    };
    
    // Check audio duration before attempting watermark
    // Note: Neural watermarking needs ~1s minimum, spread spectrum needs ~12s at default settings
    const audioInfo = await AudioUtils.loadAudioSamples(audioBuffer, { targetSampleRate: 44100 });
    console.log(`   Audio duration: ${audioInfo.duration.toFixed(1)}s`);
    
    // For spread spectrum fallback, check minimum duration
    const minDurationSpread = watermark.spreadWatermark.getMinimumDuration();
    if (getWatermarkMethod() === 'spread' && audioInfo.duration < minDurationSpread) {
      return res.orbitError(
        'audio_too_short',
        `Audio must be at least ${minDurationSpread.toFixed(1)} seconds for watermarking`,
        400
      );
    }
    
    console.log('💧 Embedding watermark...');
    const embedResult = await watermark.embed(audioBuffer, payloadData, {
      verbose: process.env.ORBIT_ML_VERBOSE === 'true'
    });
    
    if (!embedResult.success) {
      return res.orbitError(
        'watermark_failed',
        'Failed to embed watermark into audio',
        500
      );
    }
    
    const watermarkedAudio = embedResult.watermarkedAudio;
    const watermarkPayload = embedResult.watermarkPayload;
    const watermarkMethod = embedResult.method;
    
    console.log(`✅ Watermark embedded using ${watermarkMethod}`);
    console.log(`   Watermarked audio size: ${watermarkedAudio.length} bytes`);
    if (embedResult.sdr) {
      console.log(`   SDR: ${embedResult.sdr.toFixed(1)}dB`);
    }
    if (embedResult.fallbackUsed) {
      console.log(`   ⚠️  Fallback used: ${embedResult.fallbackReason}`);
    }
    
    // ========================================================================
    // 7. CREATE ENTRY HASH & INSERT INTO DATABASE
    // ========================================================================
    
    console.log('💾 Calculating entry hash...');
    const entryHash = OrbitCrypto.createEntryHash(
      {
        fingerprint_hash: fingerprint.hash,
        origin_platform: req.platform.id,
        origin_timestamp: new Date(timestamp),
        payload_cbor: signedPayloadCbor
      },
      null // prev_entry_hash - null for now, will implement chain in future
    );
    
    console.log('💾 Inserting registration into database...');
    const registration = await queries.insertRegistration({
      // Fingerprint
      fingerprint_hash: fingerprint.hash,
      fingerprint_raw: fingerprint.raw,
      watermark_hash: payloadHash,
      
      // Core metadata
      isrc: metadata.isrc,
      upc: metadata.upc,
      title: metadata.title,
      artist: metadata.artist,
      duration_ms: metadata.duration_ms,
      p_line: metadata.p_line,
      c_line: metadata.c_line,
      primary_genre: metadata.primary_genre,
      language: metadata.language,
      
      // Technical
      bitrate: metadata.bitrate,
      sample_rate: metadata.sample_rate || 44100,
      channels: metadata.channels || 2,
      format: metadata.format || 'wav',
      
      // Extended
      album_title: metadata.album_title,
      track_number: metadata.track_number,
      secondary_genre: metadata.secondary_genre,
      release_date: metadata.release_date,
      original_release_date: metadata.original_release_date,
      label: metadata.label,
      catalog_number: metadata.catalog_number,
      version: metadata.version,
      parental_advisory: metadata.parental_advisory,
      
      // Contributors
      featured_artists: metadata.featured_artists,
      composers: metadata.composers,
      lyricists: metadata.lyricists,
      writers: metadata.writers,
      producers: metadata.producers,
      remixer: metadata.remixer,
      recording_location: metadata.recording_location,
      recording_year: metadata.recording_year,
      
      // Rights
      iswc: metadata.iswc,
      territories: metadata.territories,
      preview_start_ms: metadata.preview_start_ms,
      
      // Ownership
      owner_id: owner_id,
      origin_platform: req.platform.id,
      origin_timestamp: new Date(timestamp),
      origin_signature: signature,
      
      // Payload
      payload_cbor: signedPayloadCbor,
      entry_hash: entryHash,
      prev_entry_hash: null // For now, will implement full chain later
    });
    
    console.log(`✅ Registration complete! ID: ${registration.id}`);
    
    // ========================================================================
    // 8. OPTIONAL: COMPUTE AUDIO EMBEDDING (Session 22 - CLAP)
    // Uses CLAP embeddings (Apache 2.0) instead of MERT (non-commercial)
    // ========================================================================
    
    let audioEmbedding = null;
    let similarTracks = [];
    
    // Check if embedding is enabled (via env or per-request)
    const enableEmbedding = process.env.ORBIT_ENABLE_EMBEDDING_ON_REGISTER === 'true' 
                           || metadata.include_embedding === true;
    
    if (enableEmbedding) {
      try {
        console.log('🧠 Computing CLAP audio embedding...');
        const embeddingResult = await clap.getAudioEmbedding(audioBuffer, { verbose: true });
        
        // Convert to PostgreSQL vector format
        const pgVector = clap.embeddingToPostgres(embeddingResult.embedding);
        
        // Update registration with embedding
        await queries.updateAudioEmbedding(registration.id, pgVector);
        console.log(`✅ Audio embedding stored (${embeddingResult.embedding.length} dims)`);
        
        // Find similar tracks
        similarTracks = await queries.findSimilarByEmbedding(pgVector, {
          threshold: 0.5,
          limit: 5,
          excludeId: registration.id
        });
        
        if (similarTracks.length > 0) {
          console.log(`🔍 Found ${similarTracks.length} similar tracks:`);
          similarTracks.forEach(s => {
            const rel = clap.classifyRelationship(s.similarity);
            console.log(`   - "${s.title}" by ${s.artist}: ${(s.similarity * 100).toFixed(1)}% (${rel.relationship})`);
          });
        }
        
        audioEmbedding = {
          computed: true,
          dims: embeddingResult.embedding.length,
          processing_time_ms: embeddingResult.processingTimeMs
        };
        
      } catch (embeddingError) {
        console.log(`⚠️  Audio embedding failed (non-fatal): ${embeddingError.message}`);
        audioEmbedding = { computed: false, error: embeddingError.message };
      }
    }
    
    // ========================================================================
    // 9. BUILD & RETURN RESPONSE
    // ========================================================================
    
    const responseTime = Date.now() - startTime;
    console.log(`⏱️  Total registration time: ${responseTime}ms`);
    
    const response = {
      success: true,
      registration_id: registration.id,
      fingerprint_hash: fingerprint.hash.toString('hex'),
      watermark_hash: payloadHash.toString('hex'),
      watermark_method: watermarkMethod, // 'silentcipher' or 'spread'
      watermarked_audio: watermarkedAudio.toString('base64'),
      entry_hash: entryHash.toString('hex'),
      registered_at: registration.created_at,
      metadata: {
        title: metadata.title,
        artist: metadata.artist,
        duration_ms: metadata.duration_ms,
        isrc: metadata.isrc,
        upc: metadata.upc
      },
      processing_time_ms: responseTime
    };
    
    // Add neural watermark SDR if available
    if (embedResult.sdr) {
      response.watermark_sdr = embedResult.sdr;
    }
    
    // Add fallback info if applicable
    if (embedResult.fallbackUsed) {
      response.watermark_fallback_used = true;
      response.watermark_fallback_reason = embedResult.fallbackReason;
    }
    
    // Add embedding info if computed
    if (audioEmbedding) {
      response.embedding = audioEmbedding;
      if (similarTracks.length > 0) {
        response.similar_tracks = similarTracks.map(s => ({
          registration_id: s.id,
          title: s.title,
          artist: s.artist,
          similarity: parseFloat(s.similarity.toFixed(4)),
          relationship: clap.classifyRelationship(s.similarity).relationship
        }));
      }
    }
    
    res.orbit(response);
    
  } catch (error) {
    console.error('❌ Registration failed:', error);
    console.error(error.stack);
    
    res.orbitError(
      'registration_failed',
      `Registration failed: ${error.message}`,
      500,
      { error: error.message }
    );
  }
}

module.exports = registerHandler;

