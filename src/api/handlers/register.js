/**
 * ORBIT Registration Handler
 * POST /orbit/v1/register
 * 
 * Registers new audio with ORBIT, embedding watermark and recording provenance.
 * 
 * Flow:
 * 1. Validate input (audio + required metadata)
 * 2. Embed watermark into audio
 * 3. Generate fingerprint from WATERMARKED audio (Session 25b fix)
 * 4. Check for duplicates
 * 5. Build CBOR payload with all metadata
 * 6. Sign payload with platform key
 * 7. Insert registration into database
 * 8. Optionally compute audio embedding for similarity search
 * 9. Return registration ID, fingerprint, and watermarked audio
 * 
 * Session 19: Added optional semantic fingerprinting
 * Session 22: Switched from MERT (CC BY-NC 4.0) to CLAP embeddings (Apache 2.0)
 * - Set ORBIT_ENABLE_EMBEDDING_ON_REGISTER=true to auto-compute embeddings
 * - Or pass include_embedding: true in metadata for per-request control
 * Session 25b: Fingerprint now generated from WATERMARKED audio, not original.
 * - This ensures the fingerprint represents the distributed content
 * - Fixes fingerprint mismatch after watermarking
 */

const OrbitFingerprint = require('../../engines/fingerprint');
const OrbitCrypto = require('../../engines/crypto');
const { UnifiedWatermark, getWatermarkMethod } = require('../../engines/watermark-unified');
const queries = require('../../ledger/queries');
const config = require('../../config');
const AudioUtils = require('../../utils/audio');

// CLAP for audio embeddings (Apache 2.0 licensed - commercially safe)
const clap = require('../../ml/clap');

// AI music detection (multi-signal analysis)
const aiDetection = require('../../ml/ai-detection');
const metadataExtractor = require('../../ml/metadata-extractor');

// Catalog check (AcoustID + MusicBrainz known-work detection)
const catalogCheck = require('../../engines/catalog-check');

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
  
  // Processing log collector -- captures step messages with timestamps
  // for the demo's server-log panel. Only safe, user-facing messages.
  const processingLog = [];
  const log = (msg) => {
    console.log(msg);
    processingLog.push({ t: Date.now() - startTime, msg });
  };
  
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
    
    // ========================================================================
    // 2. LOAD AUDIO & EXTRACT TECHNICAL METADATA (before validation)
    // ========================================================================
    // ORBIT extracts duration and other technical info from the audio itself.
    // This allows clients to skip local metadata extraction (which may fail
    // on certain formats). ORBIT uses FFmpeg which handles all formats.
    
    log(`📁 Received ${audioBuffer.length} bytes of audio`);
    
    const timestamp = Date.now();
    
    log('🔍 Loading audio and extracting technical metadata...');
    
    // Create unified watermark instance (handles neural + spread spectrum)
    const watermark = new UnifiedWatermark(config.orbit.secretKey);
    
    // Load audio samples - this also gives us duration
    const audioInfo = await AudioUtils.loadAudioSamples(audioBuffer, { targetSampleRate: 44100 });
    log(`   Audio duration: ${audioInfo.duration.toFixed(1)}s`);
    log(`   Audio channels: ${audioInfo.channelCount} (${audioInfo.channelCount === 2 ? 'stereo' : 'mono'})`);
    
    // Inject duration_ms if not provided by client (ORBIT calculates from audio)
    if (!metadata.duration_ms) {
      metadata.duration_ms = Math.round(audioInfo.duration * 1000);
      log(`   ✅ Extracted duration_ms: ${metadata.duration_ms}ms`);
    }
    
    // Inject channel count and sample rate if not provided
    if (!metadata.channels) {
      metadata.channels = audioInfo.channelCount;
    }
    if (!metadata.sample_rate) {
      metadata.sample_rate = audioInfo.sampleRate;
    }
    
    // ========================================================================
    // 3. VALIDATE METADATA (after technical extraction)
    // ========================================================================
    
    const validation = validateMetadata(metadata);
    if (!validation.valid) {
      return res.orbitError(
        'invalid_metadata',
        'Invalid metadata: ' + validation.errors.join(', '),
        400
      );
    }
    
    // ========================================================================
    // 4. EMBED WATERMARK INTO AUDIO (Session 25b: watermark FIRST)
    // ========================================================================
    
    log('💧 Creating watermark...');
    log(`   Method: ${getWatermarkMethod()} (ORBIT_WATERMARK_METHOD)`);
    
    // For spread spectrum fallback, check minimum duration
    const minDurationSpread = watermark.spreadWatermark.getMinimumDuration();
    if (getWatermarkMethod() === 'spread' && audioInfo.duration < minDurationSpread) {
      return res.orbitError(
        'audio_too_short',
        `Audio must be at least ${minDurationSpread.toFixed(1)} seconds for watermarking`,
        400
      );
    }
    
    // Create a preliminary payload hash for watermarking
    // (We'll create the full CBOR payload after we have the fingerprint)
    const preliminaryPayloadHash = OrbitCrypto.hash(Buffer.from(
      `${req.platform.id}:${timestamp}:${metadata.title}:${metadata.artist}`
    )).slice(0, 16);
    
    // Prepare watermark payload data
    const watermarkData = {
      platform: req.platform.id,
      timestamp: timestamp,
      payloadHash: preliminaryPayloadHash
    };
    
    log('💧 Embedding watermark...');
    const embedResult = await watermark.embed(audioBuffer, watermarkData, {
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
    
    log(`✅ Watermark embedded using ${watermarkMethod}`);
    log(`   Watermarked audio size: ${watermarkedAudio.length} bytes`);
    if (embedResult.sdr) {
      log(`   SDR: ${embedResult.sdr.toFixed(1)}dB`);
    }
    if (embedResult.fallbackUsed) {
      log(`   ⚠️  Fallback used: ${embedResult.fallbackReason}`);
    }
    
    // ========================================================================
    // 5. GENERATE FINGERPRINT FROM WATERMARKED AUDIO (Session 25b fix)
    // ========================================================================
    
    // Session 25b: Fingerprint the WATERMARKED audio, not the original!
    // This ensures the fingerprint represents what will actually be distributed.
    log('🔍 Generating fingerprint from WATERMARKED audio...');
    const fingerprint = await OrbitFingerprint.generate(watermarkedAudio);
    log(`✅ Fingerprint generated: ${fingerprint.hash.toString('hex').slice(0, 16)}...`);
    log(`   Track length: ${fingerprint.duration}s`);
    
    // ========================================================================
    // 6. CHECK FOR DUPLICATES
    // ========================================================================
    
    log('🔎 Checking for duplicates...');
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
      log(`⚠️  Audio already registered by ${existingRegistrations[0].origin_platform}, allowing multi-platform registration`);
    }
    
    // ========================================================================
    // 6a. CATALOG CHECK (AcoustID + ACRCloud + MusicBrainz)
    // Cross-references fingerprint against AcoustID (~30M) and ACRCloud
    // (~100M+), then corroborates submitted metadata against MusicBrainz.
    // Advisory only — does not block registration.
    // ========================================================================
    
    let catalogResult = null;
    
    try {
      log('🔎 Running catalog check (AcoustID + ACRCloud + MusicBrainz)...');
      catalogResult = await catalogCheck.check({
        fingerprintRaw: fingerprint.raw,
        duration: fingerprint.duration,
        audioBuffer: audioBuffer,
        metadata: {
          title: metadata.title,
          artist: metadata.artist,
          isrc: metadata.isrc || null,
          label: metadata.label || null,
        },
      });
      
      if (catalogResult.status === 'no_match') {
        log('✅ Catalog check: no known-work match (likely original)');
      } else if (catalogResult.status === 'verified_known_work') {
        const matchSource = catalogResult.acrcloud?.matched ? 'ACRCloud' : 'AcoustID';
        const matchTitle = catalogResult.acrcloud?.title || catalogResult.musicbrainz?.title;
        const matchArtist = catalogResult.acrcloud?.artist || catalogResult.musicbrainz?.artist;
        log(`✅ Catalog check: verified known work via ${matchSource} — "${matchTitle}" by ${matchArtist}`);
        log(`   Corroboration score: ${catalogResult.corroboration?.score}`);
      } else if (catalogResult.status === 'known_work_unverified') {
        log(`⚠️  Catalog check: KNOWN WORK but metadata does not corroborate`);
        if (catalogResult.acrcloud?.matched) {
          log(`   ACRCloud matched: "${catalogResult.acrcloud.title}" by ${catalogResult.acrcloud.artist} (score: ${catalogResult.acrcloud.score})`);
        }
        if (catalogResult.acoustid?.matched) {
          log(`   AcoustID matched: "${catalogResult.musicbrainz?.title}" by ${catalogResult.musicbrainz?.artist}`);
        }
        log(`   Corroboration score: ${catalogResult.corroboration?.score}`);
      } else if (catalogResult.status === 'unavailable') {
        log(`⚠️  Catalog check unavailable: ${catalogResult.error}`);
      }
    } catch (catalogError) {
      log(`⚠️  Catalog check failed (non-fatal): ${catalogError.message}`);
      catalogResult = { status: 'unavailable', error: catalogError.message };
    }
    
    // ========================================================================
    // 7. BUILD CBOR PAYLOAD WITH FULL METADATA
    // ========================================================================
    
    log('📦 Building CBOR payload...');
    
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
    log(`   CBOR payload size: ${payloadCbor.length} bytes`);
    
    // ========================================================================
    // 8. SIGN PAYLOAD
    // ========================================================================
    
    log('🔏 Signing payload...');
    
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
    
    // Create final payload hash for storage (based on signed CBOR)
    const payloadHash = OrbitCrypto.hash(signedPayloadCbor).slice(0, 16);
    
    // ========================================================================
    // 9. CREATE ENTRY HASH & INSERT INTO DATABASE
    // ========================================================================
    
    log('💾 Calculating entry hash...');
    const entryHash = OrbitCrypto.createEntryHash(
      {
        fingerprint_hash: fingerprint.hash,
        origin_platform: req.platform.id,
        origin_timestamp: new Date(timestamp),
        payload_cbor: signedPayloadCbor
      },
      null // prev_entry_hash - null for now, will implement chain in future
    );
    
    log('💾 Inserting registration into database...');
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
    
    log(`✅ Registration complete! ID: ${registration.id}`);
    
    // ========================================================================
    // 10. OPTIONAL: COMPUTE AUDIO EMBEDDING (Session 22 - CLAP)
    // Uses CLAP embeddings (Apache 2.0) instead of MERT (non-commercial).
    // NOTE: metadata-extractor may emit PANNs 2048-dim embeddings for analysis
    // responses, but registration similarity search remains CLAP 512-dim until
    // a dedicated schema/index migration is completed.
    // ========================================================================
    
    let audioEmbedding = null;
    let similarTracks = [];
    
    // Check if embedding is enabled (via env or per-request)
    const enableEmbedding = process.env.ORBIT_ENABLE_EMBEDDING_ON_REGISTER === 'true' 
                           || metadata.include_embedding === true;
    
    if (enableEmbedding) {
      try {
        log('🧠 Computing CLAP audio embedding...');
        const embeddingResult = await clap.getAudioEmbedding(audioBuffer, { verbose: true });
        
        // Convert to PostgreSQL vector format
        const pgVector = clap.embeddingToPostgres(embeddingResult.embedding);
        
        // Update registration with embedding
        await queries.updateAudioEmbedding(registration.id, pgVector);
        log(`✅ Audio embedding stored (${embeddingResult.embedding.length} dims)`);
        
        // Find similar tracks
        similarTracks = await queries.findSimilarByEmbedding(pgVector, {
          threshold: 0.5,
          limit: 5,
          excludeId: registration.id
        });
        
        if (similarTracks.length > 0) {
          log(`🔍 Found ${similarTracks.length} similar tracks:`);
          similarTracks.forEach(s => {
            const rel = clap.classifyRelationship(s.similarity);
            log(`   - "${s.title}" by ${s.artist}: ${(s.similarity * 100).toFixed(1)}% (${rel.relationship})`);
          });
        }
        
        audioEmbedding = {
          computed: true,
          dims: embeddingResult.embedding.length,
          processing_time_ms: embeddingResult.processingTimeMs
        };
        
      } catch (embeddingError) {
        log(`⚠️  Audio embedding failed (non-fatal): ${embeddingError.message}`);
        audioEmbedding = { computed: false, error: embeddingError.message };
      }
    }
    
    // ========================================================================
    // 11. AI MUSIC DETECTION (advisory signals for review)
    // Multi-signal detection using CLAP semantic probe + anomaly analysis
    // Results are informational only - does not block registration
    // Skippable via metadata.skip_ai_detection for callers that handle
    // detection separately (e.g. the demo watermark flow).
    // ========================================================================
    
    let aiDetectionResult = null;
    let aiAnalysisResult = null;
    
    if (metadata.skip_ai_detection) {
      log('⏭️  AI detection skipped (caller handles separately)');
    } else try {
      log('🤖 Running AI music detection...');

      if (config.ai.registerAnalysisEnabled) {
        try {
          log('   → Precomputing audio analysis for AI detection (flag enabled)...');
          aiAnalysisResult = await metadataExtractor.extractMetadata(audioBuffer, {
            includeEmbedding: false,
            verbose: false,
            config: {
              enableClap: false,
              enableEmbedding: false,
              enableAudioAnalysis: true,
              aiForensics: config.ai.v2Enabled || config.ai.shadowMode || config.ai.forensicsV3Enabled,
            },
          });
        } catch (analysisError) {
          log(`   ⚠️  Register audio analysis unavailable (fail-open): ${analysisError.message}`);
          aiAnalysisResult = null;
        }
      }
      
      aiDetectionResult = await aiDetection.detectAI(audioBuffer, {
        metadata: metadata,
        analysisResult: aiAnalysisResult,
        catalogResult: catalogResult,
        verbose: process.env.ORBIT_ML_VERBOSE === 'true',
      });
      
      log(`✅ AI Detection: score=${(aiDetectionResult.score * 100).toFixed(1)}%, recommendation=${aiDetectionResult.recommendation}`);
      
      const allFlags = aiDetection.getAllFlags(aiDetectionResult);
      if (allFlags.length > 0) {
        log(`   Flags: ${allFlags.join(', ')}`);
      }
      if (aiDetectionResult.telemetry) {
        const t = aiDetectionResult.telemetry;
        log(`   Telemetry: mode=${t.mode}, active=${t.active_pipeline?.recommendation || 'n/a'}`);
      }
      
    } catch (aiDetectionError) {
      log(`⚠️  AI detection failed (non-fatal): ${aiDetectionError.message}`);
      aiDetectionResult = {
        score: null,
        recommendation: 'DETECTION_ERROR',
        error: aiDetectionError.message,
      };
    }
    
    // ========================================================================
    // 12. BUILD & RETURN RESPONSE
    // ========================================================================
    
    const responseTime = Date.now() - startTime;
    log(`⏱️  Total registration time: ${responseTime}ms`);
    
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
    
    // Add AI detection results (always present)
    if (aiDetectionResult) {
      response.ai_detection = {
        score: aiDetectionResult.score,
        recommendation: aiDetectionResult.recommendation,
        signals: aiDetectionResult.signals,
        flags: aiDetection.getAllFlags(aiDetectionResult),
        processing_time_ms: aiDetectionResult.processing_time_ms,
        active_flags: aiDetectionResult.active_flags,
        score_floor_applied: aiDetectionResult.score_floor_applied ?? null,
        telemetry: aiDetectionResult.telemetry || null,
      };
      
      // Add error if detection failed
      if (aiDetectionResult.error) {
        response.ai_detection.error = aiDetectionResult.error;
      }
      if (aiDetectionResult.shadow) {
        response.ai_detection.shadow = aiDetectionResult.shadow;
      }
    }
    
    // Add catalog check results (known-work detection)
    if (catalogResult) {
      response.catalog_check = catalogResult;
    }
    
    // Processing log for demo verbose display
    response.processing_log = processingLog;
    
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

