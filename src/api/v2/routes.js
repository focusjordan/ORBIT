/**
 * ORBIT API v2 Routes
 * 
 * Session 26 - V2 Search & Analysis Endpoints
 * Session 32 - Security Hardening (GPU-intensive rate limits)
 * 
 * New endpoints for v2:
 * - POST /orbit/v2/similar  - Find similar-sounding tracks via CLAP embeddings
 * - POST /orbit/v2/analyze  - Standalone audio analysis without registration
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 7 (Updated API Endpoints)
 */

const express = require('express');
const { optionalAuth } = require('../middleware/auth');

// Import ML modules
const contentAnalysis = require('../../ml/content-analysis');
const metadataExtractor = require('../../ml/metadata-extractor');
const clap = require('../../ml/clap');
const OrbitFingerprint = require('../../engines/fingerprint');
const aiDetection = require('../../ml/ai-detection');
const catalogCheck = require('../../engines/catalog-check');

const router = express.Router();

// Get GPU-intensive rate limiter from app (set in index.js)
const getGpuLimiter = (req) => req.app.get('gpuIntensiveLimiter');

// ============================================================================
// POST /orbit/v2/similar - Similarity Search
// ============================================================================

/**
 * Find similar-sounding tracks in the ORBIT registry
 * 
 * Uses CLAP embeddings (512-dim, Apache 2.0 licensed) for semantic similarity.
 * Returns tracks that sound similar even if they're pitch-shifted, time-stretched,
 * or are covers/remixes of the query audio.
 * 
 * Request Body (JSON/CBOR):
 * {
 *   audio: <base64 encoded audio>,
 *   threshold?: number (0.0-1.0, default 0.5),
 *   limit?: number (1-100, default 20),
 *   include_derivatives?: boolean (default true)
 * }
 * 
 * Response:
 * {
 *   query_embedding_id: string,
 *   results: [{
 *     registration_id: number,
 *     title: string,
 *     artist: string,
 *     similarity: number,
 *     relationship: string,
 *     registered_at: timestamp
 *   }],
 *   query_metadata: {
 *     genre: [...],
 *     mood: [...],
 *     bpm: number
 *   }
 * }
 */
async function similarHandler(req, res) {
  const startTime = Date.now();
  
  try {
    // ========================================================================
    // 1. VALIDATE INPUT
    // ========================================================================
    
    const { 
      audio, 
      threshold = 0.5, 
      limit = 20, 
      include_derivatives = true 
    } = req.body;
    
    if (!audio) {
      return res.orbitError(
        'missing_audio',
        'Audio file is required in request body',
        400
      );
    }
    
    // Validate threshold
    const parsedThreshold = parseFloat(threshold);
    if (isNaN(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
      return res.orbitError(
        'invalid_threshold',
        'Threshold must be a number between 0 and 1',
        400
      );
    }
    
    // Validate limit
    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.orbitError(
        'invalid_limit',
        'Limit must be a number between 1 and 100',
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
    
    const verbose = process.env.ORBIT_ML_VERBOSE === 'true';
    
    console.log(`[Similar] Processing audio: ${audioBuffer.length} bytes, threshold=${parsedThreshold}, limit=${parsedLimit}`);
    
    // ========================================================================
    // 2. FIND RELATED CONTENT
    // ========================================================================
    
    let contentResult;
    try {
      contentResult = await contentAnalysis.findRelatedContent(audioBuffer, {
        threshold: parsedThreshold,
        limit: parsedLimit,
        verbose,
      });
    } catch (error) {
      console.error(`[Similar] Content analysis failed: ${error.message}`);
      return res.orbitError(
        'analysis_error',
        `Content analysis failed: ${error.message}`,
        500
      );
    }
    
    if (!contentResult.embedding_extracted) {
      return res.orbitError(
        'embedding_error',
        contentResult.error || 'Failed to extract audio embedding',
        500
      );
    }
    
    console.log(`[Similar] Found ${contentResult.total_found} similar tracks`);
    
    // ========================================================================
    // 3. FILTER RESULTS IF NOT INCLUDING DERIVATIVES
    // ========================================================================
    
    let results = contentResult.similar_works;
    
    if (!include_derivatives) {
      // Filter out derivative relationships, keep only stylistically similar
      results = results.filter(work => 
        work.relationship === 'STYLISTICALLY_SIMILAR' || 
        work.relationship === 'DIFFERENT_WORK'
      );
    }
    
    // ========================================================================
    // 4. EXTRACT QUERY METADATA (optional, for richer response)
    // ========================================================================
    
    let queryMetadata = null;
    try {
      // Quick CLAP analysis for query audio metadata
      const clapResult = await clap.analyzeAudio(audioBuffer, {
        genreTopK: 3,
        moodTopK: 3,
        verbose: false,
      });
      
      queryMetadata = {
        genre: clapResult.genre,
        mood: clapResult.mood,
        instruments: clapResult.instruments,
        vocals: clapResult.vocals,
      };
    } catch (metaError) {
      console.warn(`[Similar] Query metadata extraction failed: ${metaError.message}`);
      // Non-fatal, continue without query metadata
    }
    
    // ========================================================================
    // 5. BUILD RESPONSE
    // ========================================================================
    
    const response = {
      query_embedding_id: `emb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      
      results: results.map(work => ({
        registration_id: work.registration_id,
        title: work.title,
        artist: work.artist,
        isrc: work.isrc,
        origin_platform: work.origin_platform,
        similarity: work.similarity,
        relationship: work.relationship,
        confidence: work.confidence,
        description: work.description,
        registered_at: work.registered_at,
      })),
      
      query_metadata: queryMetadata,
      
      summary: {
        total_found: results.length,
        threshold_used: parsedThreshold,
        relationship_counts: contentResult.relationship_counts || {},
        has_derivatives: contentResult.is_derivative,
      },
      
      processing_time_ms: Date.now() - startTime,
    };
    
    console.log(`[Similar] Complete: ${results.length} results in ${response.processing_time_ms}ms`);
    
    return res.orbit(response, 200);
    
  } catch (error) {
    console.error('[Similar] Unexpected error:', error);
    return res.orbitError(
      'similarity_error',
      `Similarity search failed: ${error.message}`,
      500
    );
  }
}

// ============================================================================
// POST /orbit/v2/analyze - Standalone Audio Analysis
// ============================================================================

/**
 * Analyze audio without registration
 * 
 * Useful for:
 * - Pre-registration analysis to preview AI metadata
 * - Third-party tools that want ORBIT's analysis without registration
 * - Testing audio before committing to the registry
 * 
 * Request Body (JSON/CBOR):
 * {
 *   audio: <base64 encoded audio>,
 *   include?: ['genre', 'mood', 'bpm', 'key', 'instruments', 'vocals', 'fingerprint', 'embedding']
 * }
 * 
 * Default: include all analysis types
 * 
 * Response:
 * {
 *   analysis: {
 *     genre: [{label, confidence}],
 *     mood: [{label, confidence}],
 *     bpm: {value, confidence},
 *     key: {value, confidence},
 *     instruments: [{label, confidence}],
 *     vocals: {present, confidence, gender, ...}
 *   },
 *   embeddings?: {
 *     audio: <2048-dim vector>,
 *     dim: 2048,
 *     model: "panns_cnn14"
 *   },
 *   fingerprint?: {
 *     chromaprint_hash: string
 *   }
 * }
 */
async function analyzeHandler(req, res) {
  const startTime = Date.now();
  
  const processingLog = [];
  const log = (msg) => {
    console.log(msg);
    processingLog.push({ t: Date.now() - startTime, msg });
  };
  
  try {
    // ========================================================================
    // 1. VALIDATE INPUT
    // ========================================================================
    
    const { audio, include } = req.body;
    
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
    
    // Parse include array (default: all)
    const ALL_INCLUDES = ['genre', 'mood', 'bpm', 'key', 'instruments', 'vocals', 'fingerprint', 'embedding', 'ai_detection', 'catalog_check'];
    let includeSet;
    
    if (include && Array.isArray(include)) {
      // Validate include values
      const invalidIncludes = include.filter(i => !ALL_INCLUDES.includes(i));
      if (invalidIncludes.length > 0) {
        return res.orbitError(
          'invalid_include',
          `Invalid include values: ${invalidIncludes.join(', ')}. Valid options: ${ALL_INCLUDES.join(', ')}`,
          400
        );
      }
      includeSet = new Set(include);
    } else {
      includeSet = new Set(['genre', 'mood', 'bpm', 'key', 'instruments', 'vocals', 'fingerprint']);
    }
    
    const verbose = process.env.ORBIT_ML_VERBOSE === 'true';
    
    log(`🔍 Processing audio: ${audioBuffer.length} bytes, include=[${[...includeSet].join(', ')}]`);
    
    // ========================================================================
    // 2. BUILD CONFIG BASED ON INCLUDES
    // ========================================================================
    
    const needsClap = includeSet.has('genre') || includeSet.has('mood') || 
                      includeSet.has('instruments') || includeSet.has('vocals');
    const needsAudioAnalysis = includeSet.has('bpm') || includeSet.has('key') || includeSet.has('ai_detection');
    const needsEmbedding = includeSet.has('embedding');
    const needsFingerprint = includeSet.has('fingerprint') || includeSet.has('catalog_check');
    const needsAiDetection = includeSet.has('ai_detection');
    const needsCatalogCheck = includeSet.has('catalog_check');
    
    // ========================================================================
    // 3. RUN METADATA EXTRACTION
    // ========================================================================
    
    let metadataResult = null;
    
    if (needsClap || needsAudioAnalysis || needsEmbedding) {
      try {
        log('🧠 Running metadata extraction pipeline...');
        metadataResult = await metadataExtractor.extractMetadata(audioBuffer, {
          includeEmbedding: needsEmbedding,
          verbose,
          config: {
            enableClap: needsClap,
            enablePanns: includeSet.has('instruments') || includeSet.has('genre') || needsEmbedding,
            enableGenreClassifier: includeSet.has('genre'),
            enableAudioAnalysis: needsAudioAnalysis,
            enableEmbedding: needsEmbedding,
            enablePannsEmbedding: needsEmbedding,
            // Demo latency safeguard: do not run runtime Demucs in analyze flow.
            // Stem-aware analysis still works when caller provides stemsDir.
            enableDemucs: false,
            aiForensics: needsAiDetection,
            stemsDir: req.body.stemsDir || null,
          },
        });
        
        log(`✅ Metadata extraction complete: ${metadataResult.processingTimeMs}ms`);
        
      } catch (error) {
        console.error(`[Analyze] Metadata extraction failed: ${error.message}`);
        return res.orbitError(
          'analysis_error',
          `Audio analysis failed: ${error.message}`,
          500
        );
      }
    }
    
    // ========================================================================
    // 4. GENERATE FINGERPRINT IF REQUESTED
    // ========================================================================
    
    let fingerprintData = null;
    
    if (needsFingerprint) {
      try {
        log('🔍 Generating Chromaprint fingerprint...');
        fingerprintData = await OrbitFingerprint.generate(audioBuffer);
        log(`✅ Fingerprint generated: ${fingerprintData.hash.toString('hex').slice(0, 16)}...`);
      } catch (error) {
        log(`⚠️  Fingerprint generation failed: ${error.message}`);
      }
    }
    
    // ========================================================================
    // 4a. CATALOG CHECK (AcoustID + MusicBrainz, if requested)
    // ========================================================================
    
    let catalogResult = null;
    
    if (needsCatalogCheck && fingerprintData) {
      try {
        log('🔎 Running catalog check (AcoustID + ACRCloud + MusicBrainz)...');
        const submittedMeta = req.body.metadata || {};
        catalogResult = await catalogCheck.check({
          fingerprintRaw: fingerprintData.raw,
          duration: fingerprintData.duration,
          audioBuffer: audioBuffer,
          metadata: {
            title: submittedMeta.title || null,
            artist: submittedMeta.artist || null,
            isrc: submittedMeta.isrc || null,
            label: submittedMeta.label || null,
          },
        });
        
        if (catalogResult.status === 'no_match') {
          log('✅ Catalog check: no known-work match');
        } else if (catalogResult.status === 'verified_known_work') {
          const src = catalogResult.acrcloud?.matched ? 'ACRCloud' : 'AcoustID';
          const t = catalogResult.acrcloud?.title || catalogResult.musicbrainz?.title;
          const a = catalogResult.acrcloud?.artist || catalogResult.musicbrainz?.artist;
          log(`✅ Catalog check: verified known work via ${src} — "${t}" by ${a}`);
        } else if (catalogResult.status === 'known_work_unverified') {
          log(`⚠️  Catalog check: KNOWN WORK but metadata mismatch`);
          if (catalogResult.acrcloud?.matched) {
            log(`   ACRCloud matched: "${catalogResult.acrcloud.title}" by ${catalogResult.acrcloud.artist}`);
          }
          if (catalogResult.acoustid?.matched) {
            log(`   AcoustID matched: "${catalogResult.musicbrainz?.title}" by ${catalogResult.musicbrainz?.artist}`);
          }
        }
      } catch (catErr) {
        log(`⚠️  Catalog check failed (non-fatal): ${catErr.message}`);
        catalogResult = { status: 'unavailable', error: catErr.message };
      }
    }
    
    // ========================================================================
    // 4b. AI DETECTION (if requested)
    // ========================================================================
    
    let aiDetectionResult = null;
    
    if (needsAiDetection) {
      try {
        log('🤖 Running AI music detection...');
        aiDetectionResult = await aiDetection.detectAI(audioBuffer, {
          metadata: req.body.metadata || {},
          analysisResult: metadataResult,
          catalogResult: catalogResult,
          flags: {
            v2Enabled: true,
            shadowMode: false,
            knnEnabled: false,
            promptsV2Enabled: true,
            metadataV2Enabled: true,
            crossSignalV2Enabled: true,
            forensicsV3Enabled: true,
          },
          verbose,
        });
        
        log(`✅ AI Detection: score=${(aiDetectionResult.score * 100).toFixed(1)}%, recommendation=${aiDetectionResult.recommendation}`);
        
        const allFlags = aiDetection.getAllFlags(aiDetectionResult);
        if (allFlags.length > 0) {
          log(`   Flags: ${allFlags.join(', ')}`);
        }
      } catch (aiError) {
        log(`⚠️  AI detection failed (non-fatal): ${aiError.message}`);
        aiDetectionResult = {
          score: null,
          recommendation: 'DETECTION_ERROR',
          error: aiError.message,
        };
      }
    }
    
    // ========================================================================
    // 5. BUILD RESPONSE
    // ========================================================================
    
    const response = {
      analysis: {},
      processing_time_ms: Date.now() - startTime,
    };
    
    // Add requested analysis fields
    if (metadataResult) {
      if (includeSet.has('genre') && metadataResult.genre) {
        response.analysis.genre = metadataResult.genre;
      }
      
      if (includeSet.has('mood') && metadataResult.mood) {
        response.analysis.mood = metadataResult.mood;
      }
      
      if (includeSet.has('instruments') && metadataResult.instruments) {
        response.analysis.instruments = metadataResult.instruments;
      }
      
      if (includeSet.has('vocals') && metadataResult.vocals) {
        response.analysis.vocals = metadataResult.vocals;
      }
      
      if (includeSet.has('bpm') && metadataResult.bpm) {
        response.analysis.bpm = metadataResult.bpm;
      }
      
      if (includeSet.has('key') && metadataResult.key) {
        response.analysis.key = metadataResult.key;
      }
      
      // Add derived fields if available
      if (metadataResult.energy !== null) {
        response.analysis.energy = metadataResult.energy;
      }
      
      if (metadataResult.loudness_db !== null) {
        response.analysis.loudness = metadataResult.loudness_db;
        response.analysis.loudness_db = metadataResult.loudness_db;
      }

      if (metadataResult.dynamic_range_db !== null) {
        response.analysis.dynamic_range = metadataResult.dynamic_range_db;
        response.analysis.dynamic_range_db = metadataResult.dynamic_range_db;
      }
      
      if (metadataResult.danceability !== null) {
        response.analysis.danceability = metadataResult.danceability;
      }
      
      if (metadataResult.duration !== null) {
        response.analysis.duration = metadataResult.duration;
      }

      if (metadataResult.sample_rate !== null) {
        response.analysis.sample_rate = metadataResult.sample_rate;
      }

      if (metadataResult.key_detection_source) {
        response.analysis.key_detection_source = metadataResult.key_detection_source;
      }

      if (Array.isArray(metadataResult.panns_tags) && metadataResult.panns_tags.length > 0) {
        response.analysis.panns_tags = metadataResult.panns_tags;
      }

      if (Array.isArray(metadataResult.genre_corroboration) && metadataResult.genre_corroboration.length > 0) {
        response.analysis.genre_corroboration = metadataResult.genre_corroboration;
      }
      
      // Add extraction status
      response.extraction_status = metadataResult.extractionStatus;
    }
    
    // Add embedding if requested
    if (needsEmbedding && metadataResult?.embedding) {
      response.embeddings = {
        audio: Array.from(metadataResult.embedding),
        dim: metadataResult.embedding.length,
        model: 'panns_cnn14',
      };
    }
    
    // Add fingerprint if requested and available
    if (fingerprintData) {
      response.fingerprint = {
        chromaprint_hash: fingerprintData.hash.toString('hex'),
        duration: fingerprintData.duration,
      };
    }
    
    // Add AI detection results if requested
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
      if (aiDetectionResult.error) {
        response.ai_detection.error = aiDetectionResult.error;
      }
      if (aiDetectionResult.shadow) {
        response.ai_detection.shadow = aiDetectionResult.shadow;
      }
    }
    
    if (catalogResult) {
      response.catalog_check = catalogResult;
    }
    
    log(`⏱️  Analysis complete in ${response.processing_time_ms}ms`);
    
    response.processing_log = processingLog;
    
    return res.orbit(response, 200);
    
  } catch (error) {
    console.error('[Analyze] Unexpected error:', error);
    return res.orbitError(
      'analysis_error',
      `Audio analysis failed: ${error.message}`,
      500
    );
  }
}

// ============================================================================
// Protocol Info Endpoint (v2 version)
// ============================================================================

/**
 * GET /orbit/v2/info
 * Returns v2 protocol information and available endpoints
 */
router.get('/info', (req, res) => {
  res.orbit({
    protocol: 'ORBIT',
    api_version: 'v2',
    description: 'ORBIT v2 API with ML-powered similarity search and analysis',
    endpoints: [
      { 
        method: 'POST', 
        path: '/orbit/v2/similar', 
        description: 'Find similar-sounding tracks', 
        status: 'active' 
      },
      { 
        method: 'POST', 
        path: '/orbit/v2/analyze', 
        description: 'Standalone audio analysis', 
        status: 'active' 
      },
    ],
    ml_features: {
      embeddings: 'CLAP 512-dim for similarity; PANNs 2048-dim from /analyze embedding output',
      classification: 'wav2vec2 genre + PANNs instruments + CLAP mood/vocals',
      signal_analysis: 'BPM/key detection via librosa',
      fingerprinting: 'Chromaprint + CLAP semantic',
      catalog_check: 'AcoustID + ACRCloud + MusicBrainz',
    },
    note: 'V2 endpoints complement v1 endpoints. Registration still uses /orbit/v1/register',
  });
});

// ============================================================================
// Route Definitions
// ============================================================================

/**
 * POST /orbit/v2/similar
 * Find similar-sounding tracks via CLAP embeddings
 * Auth: Optional (public query, platform context may influence results)
 * Session 32: GPU-intensive rate limit (10/min)
 */
router.post('/similar', 
  (req, res, next) => getGpuLimiter(req)(req, res, next), // GPU rate limit
  optionalAuth, 
  similarHandler
);

/**
 * POST /orbit/v2/analyze
 * Standalone audio analysis without registration
 * Auth: Optional (public analysis, platform context may influence limits)
 * Session 32: GPU-intensive rate limit (10/min)
 */
router.post('/analyze', 
  (req, res, next) => getGpuLimiter(req)(req, res, next), // GPU rate limit
  optionalAuth, 
  analyzeHandler
);

module.exports = router;



