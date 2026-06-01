/**
 * ORBIT Verification Handler
 * POST /orbit/v1/verify
 * 
 * Verifies audio provenance by:
 * 1. Generating fingerprint and searching database for matches
 * 2. Extracting watermark and validating integrity
 * 3. Verifying cryptographic signatures
 * 4. Extracting AI metadata (genre, mood, BPM, key, instruments)
 * 5. Computing CLAP embeddings for semantic similarity
 * 6. Building comprehensive provenance response
 * 7. Flagging duplicates from different owners
 * 
 * Session 25: Enhanced V2 Verification Response
 * - Added `identity` section with dual fingerprints (Chromaprint + CLAP embedding)
 * - Added `ai_extracted_metadata` section with ML-derived metadata
 * - Enhanced `watermark` section with method and confidence
 * - Added `confidence_summary` section for overall verification confidence
 * - Maintains backward compatibility with v1 clients
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 5 (Enhanced V2 Verify Response)
 */

const OrbitFingerprint = require('../../engines/fingerprint');
const OrbitCrypto = require('../../engines/crypto');
const { UnifiedWatermark } = require('../../engines/watermark-unified');
const { queries } = require('@orbit/ledger');
const config = require('../../config');
const AudioUtils = require('../../utils/audio');

// ML modules for v2 enhancements (Session 20-24)
const contentAnalysis = require('../../ml/content-analysis');
const metadataExtractor = require('@orbit/metadata');
const clap = require('../../ml/clap');

/**
 * Calculate overall confidence summary based on verification results
 * 
 * @param {Object} params - Verification results
 * @returns {Object} Confidence summary
 */
function calculateConfidenceSummary(params) {
  const {
    fingerprintMatch,
    watermarkResult,
    signatureValid,
    aiMetadata,
    contentAnalysisResult,
  } = params;
  
  // Identity confidence: based on fingerprint match
  let identityConfidence = 0;
  if (fingerprintMatch) {
    identityConfidence = fingerprintMatch.similarity || 1.0;
  }
  
  // Watermark confidence: from extraction result
  let watermarkConfidence = 0;
  if (watermarkResult?.detected && watermarkResult?.valid) {
    watermarkConfidence = watermarkResult.confidence || 0.9;
  } else if (watermarkResult?.detected) {
    watermarkConfidence = 0.5; // Detected but invalid
  }
  
  // Metadata confidence: based on AI extraction success
  let metadataConfidence = 0;
  if (aiMetadata) {
    // Check both camelCase and snake_case for compatibility
    const status = aiMetadata.extraction_status || aiMetadata.extractionStatus || {};
    let successCount = 0;
    let totalCount = 0;
    
    for (const [key, value] of Object.entries(status)) {
      totalCount++;
      if (value === 'success') successCount++;
    }
    
    metadataConfidence = totalCount > 0 ? successCount / totalCount : 0;
  }
  
  // Calculate overall verification confidence
  // Weighted average: identity (50%), watermark (30%), signature (20%)
  const signatureWeight = signatureValid ? 1.0 : 0.0;
  const overallScore = (
    (identityConfidence * 0.50) +
    (watermarkConfidence * 0.30) +
    (signatureWeight * 0.20)
  );
  
  // Determine overall verification level
  let overallVerification = 'NONE';
  if (overallScore >= 0.9) {
    overallVerification = 'VERY_HIGH';
  } else if (overallScore >= 0.75) {
    overallVerification = 'HIGH';
  } else if (overallScore >= 0.5) {
    overallVerification = 'MEDIUM';
  } else if (overallScore > 0) {
    overallVerification = 'LOW';
  }
  
  return {
    identity_confidence: parseFloat(identityConfidence.toFixed(4)),
    watermark_confidence: parseFloat(watermarkConfidence.toFixed(4)),
    metadata_confidence: parseFloat(metadataConfidence.toFixed(4)),
    signature_valid: signatureValid,
    overall_score: parseFloat(overallScore.toFixed(4)),
    overall_verification: overallVerification,
  };
}

/**
 * Main verification handler
 * Expects CBOR/JSON request with:
 * - audio: base64-encoded audio buffer
 * 
 * Query parameters:
 * - include_ai_metadata: 'true' (default) or 'false' - include AI-extracted metadata
 * - include_content_analysis: 'true' (default) or 'false' - include content relationship analysis
 * - include_embedding: 'true' or 'false' (default) - include raw CLAP embedding in response
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
    
    // Parse query options
    const includeAiMetadata = req.query?.include_ai_metadata !== 'false';
    const includeContentAnalysis = req.query?.include_content_analysis !== 'false';
    const includeEmbedding = req.query?.include_embedding === 'true';
    const verbose = process.env.ORBIT_ML_VERBOSE === 'true';
    
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
    // FAST PATH: New audio (no fingerprint match)
    // Skip slow operations - registration will handle AI metadata & watermarking
    // ========================================================================
    
    if (matches.length === 0) {
      const processingTime = Date.now() - startTime;
      console.log(`[Verify] No matches - new audio, returning fast path (${processingTime}ms)`);
      
      // Return minimal response for new audio
      // Full analysis happens during registration, not duplicate check
      return res.orbit({
        verified: false,
        
        // Identity: only fingerprint (no matches to compare)
        identity: {
          fingerprint_hash: fingerprintData.hash.toString('hex'),
          chromaprint_match: null,
          clap_embedding_id: null,
          semantic_match: null,
        },
        
        // No watermark check for new uploads (they won't have one)
        watermark: {
          detected: false,
          valid: false,
          skipped: true,
          reason: 'new_audio_fast_path',
        },
        
        // No AI metadata during verify - done during registration
        ai_extracted_metadata: {
          skipped: true,
          reason: 'new_audio_fast_path',
          note: 'AI metadata extracted during registration',
        },
        
        // No content analysis during verify - available via /orbit/v2/similar
        content_analysis: {
          skipped: true,
          reason: 'new_audio_fast_path',
          note: 'Similar content search available via POST /orbit/v2/similar',
        },
        
        // Provenance: none (new audio)
        provenance: {
          origin: null,
          transfers: [],
          chain_integrity: null,
        },
        
        // Not a duplicate
        duplicate_of: null,
        
        // Confidence: low (unregistered)
        confidence_summary: {
          identity_confidence: 0,
          watermark_confidence: 0,
          metadata_confidence: 0,
          signature_valid: false,
          overall_score: 0,
          overall_verification: 'NONE',
        },
        
        // V1 compatibility fields
        fingerprint_hash: fingerprintData.hash.toString('hex'),
        fingerprint_match: null,
        metadata: null,
        origin: null,
        transfers: [],
        
        // Timing
        processing_time_ms: processingTime,
        fast_path: true,
      }, 200);
    }
    
    // ========================================================================
    // SLOW PATH: Potential duplicate (fingerprint matched)
    // Full verification needed for matched audio
    // ========================================================================
    
    // ========================================================================
    // 4. EXTRACT WATERMARK
    // ========================================================================
    
    let watermarkResult = {
      detected: false,
      valid: false,
      method: null,
      confidence: 0,
      payload_hash: null,
      fallback_attempted: false,
    };
    
    try {
      console.log(`[Verify] Extracting watermark...`);
      
      // Initialize unified watermark engine (tries neural first, then spread spectrum)
      const watermark = new UnifiedWatermark(config.orbit.secretKey);
      
      // Extract watermark using unified interface
      const extracted = await watermark.extract(audioBuffer, { verbose });
      
      if (extracted.detected) {
        watermarkResult.detected = true;
        watermarkResult.valid = false; // Set true only after ledger match
        watermarkResult.method = extracted.method;
        watermarkResult.confidence = extracted.confidence;
        watermarkResult.fallback_attempted = extracted.fallbackUsed || false;
        watermarkResult._extractedPayloadHash = extracted.payloadHash || null;
        
        if (extracted.method === 'silentcipher') {
          watermarkResult.payload_hash = extracted.payloadHash.toString('hex');
          watermarkResult.message = extracted.message;
          console.log(`[Verify] Neural watermark extracted: hash_prefix=${watermarkResult.payload_hash}`);
        } else if (extracted.method === 'spread') {
          watermarkResult.payload_hash = extracted.parsedPayload?.payloadHash?.toString('hex') || null;
          watermarkResult._extractedPayloadHash = extracted.parsedPayload?.payloadHash || null;
          
          if (extracted.parsedPayload) {
            watermarkResult.parsed_payload = {
              magic: extracted.parsedPayload.magic,
              version: extracted.parsedPayload.version,
              timestamp: new Date(extracted.parsedPayload.timestamp).toISOString(),
              platform_hash: extracted.parsedPayload.platformHash.toString('hex'),
              crc_valid: extracted.parsedPayload.crcValid,
            };
            console.log(`[Verify] Spread watermark extracted: platform=${watermarkResult.parsed_payload.platform_hash.slice(0, 8)}...`);
          }
        }
      } else {
        console.log(`[Verify] Watermark not detected`);
      }
    } catch (error) {
      console.warn(`[Verify] Watermark extraction failed: ${error.message}`);
      // Non-fatal: continue with fingerprint-only verification
    }
    
    // ========================================================================
    // 5. EXTRACT AI METADATA (Session 25 - v2 enhancement)
    // ========================================================================
    
    let aiMetadata = null;
    let clapEmbedding = null;
    
    if (includeAiMetadata) {
      try {
        console.log(`[Verify] Extracting AI metadata...`);
        
        // Extract full AI metadata (genre, mood, instruments, vocals, BPM, key)
        const aiResult = await metadataExtractor.extractMetadata(audioBuffer, {
          includeEmbedding: true, // We need the embedding for identity section
          verbose,
        });
        
        // Store embedding separately for identity section
        if (aiResult.embedding) {
          clapEmbedding = aiResult.embedding;
          // Remove from AI metadata (it goes in identity section)
          delete aiResult.embedding;
          delete aiResult.embeddingDim;
        }
        
        aiMetadata = {
          genre: aiResult.genre,
          mood: aiResult.mood,
          instruments: aiResult.instruments,
          vocals: aiResult.vocals,
          bpm: aiResult.bpm,
          key: aiResult.key,
          energy: aiResult.energy,
          loudness_db: aiResult.loudness_db,
          danceability: aiResult.danceability,
          duration: aiResult.duration,
          extraction_status: aiResult.extractionStatus,
          processing_time_ms: aiResult.processingTimeMs,
        };
        
        console.log(`[Verify] AI metadata extracted in ${aiResult.processingTimeMs}ms`);
        
      } catch (error) {
        console.warn(`[Verify] AI metadata extraction failed: ${error.message}`);
        aiMetadata = {
          error: error.message,
          extraction_status: { clap: 'error', audioAnalysis: 'error', embedding: 'error' },
        };
      }
    }
    
    // ========================================================================
    // 6. BUILD V2 VERIFICATION RESPONSE
    // ========================================================================
    
    // Base response structure (v2 format)
    const response = {
      verified: matches.length > 0,
      
      // v2: Enhanced identity section
      identity: {
        fingerprint_hash: fingerprintData.hash.toString('hex'),
        chromaprint_match: null,
        clap_embedding_id: null,
        semantic_match: null,
      },
      
      // v2: Enhanced watermark section
      watermark: watermarkResult,
      
      // v1 compatibility: registered_metadata (same as v1 'metadata')
      registered_metadata: null,
      
      // v2: AI-extracted metadata
      ai_extracted_metadata: aiMetadata,
      
      // v2/v1: Content analysis (already added in Session 24)
      content_analysis: null,
      
      // v2/v1: Provenance
      provenance: {
        origin: null,
        transfers: [],
        chain_integrity: null,
      },
      
      // v1 compatibility: duplicate_of
      duplicate_of: null,
      
      // v2: Confidence summary
      confidence_summary: null,
      
      // Timing
      processing_time_ms: Date.now() - startTime,
    };
    
    // Add CLAP embedding to identity if available
    if (clapEmbedding) {
      response.identity.clap_embedding_id = `emb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      response.identity.clap_embedding_dim = clapEmbedding.length;
      
      // Optionally include raw embedding (large, usually not needed)
      if (includeEmbedding) {
        response.identity.clap_embedding = Array.from(clapEmbedding);
      }
    }
    
    // ========================================================================
    // 7. PROCESS MATCHES AND BUILD PROVENANCE
    // Note: matches.length === 0 case handled in fast path above
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
    
    // Build identity section with Chromaprint match
    response.identity.chromaprint_match = {
      registration_id: registration.id,
      similarity: 1.0, // Chromaprint is exact match only
      matched_at: registration.created_at,
    };
    
    // If the registration has a stored CLAP embedding, we could compute semantic similarity
    // For now, we indicate exact match since fingerprint matched
    response.identity.semantic_match = {
      registration_id: registration.id,
      similarity: 1.0, // Same as fingerprint match (exact)
      method: 'chromaprint_verified',
    };
    
    // ========================================================================
    // 7b. CLOSE THE LOOP: Compare extracted watermark against registration
    // ========================================================================
    
    if (watermarkResult.detected && watermarkResult._extractedPayloadHash && registration.watermark_hash) {
      const storedHash = Buffer.isBuffer(registration.watermark_hash)
        ? registration.watermark_hash
        : Buffer.from(registration.watermark_hash, 'hex');
      
      const match = UnifiedWatermark.hashMatches(
        watermarkResult._extractedPayloadHash,
        storedHash,
        watermarkResult.method
      );
      
      watermarkResult.valid = match;
      watermarkResult.registration_match = match ? registration.id : null;
      
      if (match) {
        console.log(`[Verify] Watermark hash MATCHES registration ${registration.id}`);
      } else {
        console.log(`[Verify] Watermark hash MISMATCH — extracted: ${watermarkResult.payload_hash}, stored: ${storedHash.toString('hex').slice(0, 10)}...`);
      }
    } else if (watermarkResult.detected) {
      console.log(`[Verify] Watermark detected but cannot compare — missing stored hash or extracted hash`);
    }
    
    // Remove internal field from response
    delete watermarkResult._extractedPayloadHash;
    
    // Build registered_metadata (v2) / metadata (v1 compatibility)
    const registeredMetadata = {
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
      preview_start_ms: registration.preview_start_ms,
    };
    
    response.registered_metadata = registeredMetadata;
    
    // V1 compatibility: also include at top level
    response.metadata = registeredMetadata;
    
    // ========================================================================
    // 9. VERIFY CRYPTOGRAPHIC SIGNATURE
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
    
    // Build provenance section (v2) / origin (v1 compatibility)
    const originData = {
      platform: registration.origin_platform,
      owner_id: registration.owner_id,
      timestamp: registration.origin_timestamp,
      signature_valid: signatureValid,
      registered_at: registration.created_at,
    };
    
    response.provenance.origin = originData;
    response.provenance.chain_integrity = signatureValid ? 'VALID' : 'SIGNATURE_INVALID';
    
    // V1 compatibility
    response.origin = originData;
    
    // ========================================================================
    // 10. CHECK FOR DUPLICATES FROM DIFFERENT OWNERS
    // ========================================================================
    
    if (matches.length > 1) {
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
            registered_at: m.created_at,
          })),
        };
        console.log(`[Verify] Duplicate detected: ${matches.length} registrations found`);
      }
    }
    
    // ========================================================================
    // 11. CONTENT RELATIONSHIP ANALYSIS
    // ========================================================================
    
    if (includeContentAnalysis) {
      try {
        console.log(`[Verify] Running content relationship analysis...`);
        
        const contentResult = await contentAnalysis.findRelatedContent(audioBuffer, {
          threshold: 0.50,
          limit: 10,
          excludeId: registration.id, // Don't include self-match
          verbose,
        });
        
        response.content_analysis = {
          is_derivative: contentResult.is_derivative,
          similar_works: contentResult.similar_works,
          relationship_counts: contentResult.relationship_counts || {},
          analysis_time_ms: contentResult.processing_time_ms,
        };
        
        console.log(`[Verify] Content analysis: is_derivative=${contentResult.is_derivative}, found=${contentResult.total_found}`);
      } catch (contentError) {
        console.warn(`[Verify] Content analysis failed: ${contentError.message}`);
        response.content_analysis = {
          error: contentError.message,
          is_derivative: false,
          similar_works: [],
        };
      }
    }
    
    // ========================================================================
    // 12. CALCULATE CONFIDENCE SUMMARY (v2)
    // ========================================================================
    
    response.confidence_summary = calculateConfidenceSummary({
      fingerprintMatch: response.identity.chromaprint_match,
      watermarkResult,
      signatureValid,
      aiMetadata,
      contentAnalysisResult: response.content_analysis,
    });
    
    // ========================================================================
    // 13. V1 COMPATIBILITY FIELDS
    // ========================================================================
    
    // These fields are at top level for v1 client compatibility
    response.fingerprint_hash = fingerprintData.hash.toString('hex');
    response.fingerprint_match = response.identity.chromaprint_match;
    response.transfers = response.provenance.transfers;
    
    // ========================================================================
    // 14. RETURN COMPLETE VERIFICATION RESPONSE
    // ========================================================================
    
    response.processing_time_ms = Date.now() - startTime;
    
    console.log(`[Verify] Verification complete: verified=${response.verified}, confidence=${response.confidence_summary.overall_verification}, time=${response.processing_time_ms}ms`);
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
