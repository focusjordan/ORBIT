/**
 * ORBIT AI Music Detection Module
 * 
 * Multi-signal AI-generated music detection using:
 * 1. Zero-shot CLAP semantic probing (artifact-targeted prompts)
 * 2. Spectral forensics (16kHz cutoff, phase entropy, spectral contrast, onset regularity)
 * 3. Metadata intelligence (AI keyword scanning, duration heuristics, identifier checks)
 * 4. AcoustID catalog provenance mismatch
 * 
 * Dynamic weight redistribution: when the catalog signal is non-informative
 * (no AcoustID match), its weight is redistributed proportionally among the
 * remaining signals so they can reach the full 0-1 scoring range.
 * 
 * This module provides ADVISORY signals for human review, not automated rejection.
 * Detection is always run during registration but results are informational only.
 * 
 * Architecture:
 * - Uses existing CLAP infrastructure for semantic probing
 * - Uses existing audio-analysis + librosa spectral forensics
 * - Scans metadata text for AI self-declaration keywords
 * - Combines signals with weighted scoring and dynamic rebalancing
 * - Fail-open design: errors don't block registration
 * 
 * @see ORBIT_SPECIFICATION.md Section 17 (Future Considerations - AI Detection)
 */

const clap = require('./clap');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * AI Detection Configuration
 */
const AI_DETECTION_CONFIG = {
  // Weights for combining signals (must sum to 1.0)
  weights: {
    semantic: 0.30,    // CLAP zero-shot probe
    anomaly: 0.20,     // Audio analysis anomalies
    metadata: 0.15,    // Metadata/behavioral patterns
    catalog: 0.35,     // AcoustID provenance mismatch (strongest signal for covers)
  },
  
  // Thresholds for recommendations
  thresholds: {
    likelyAI: 0.55,    // Score >= 0.55 → LIKELY_AI (lowered -- catalog signal is decisive)
    review: 0.30,      // Score >= 0.30 → REVIEW
    // Below 0.30 → LIKELY_HUMAN
  },
  
  // Anomaly detection thresholds
  anomalyThresholds: {
    perfectTempo: 0.98,       // BPM confidence above this is suspicious
    perfectKey: 0.95,         // Key confidence above this is suspicious
    lowDynamicRange: 4,       // Loudness range below this (dB) is suspicious
  },
  
  // Duration patterns (in seconds) typical of AI generators
  typicalAIDurations: {
    min: 115,   // ~1:55
    max: 215,   // ~3:35
  },
};

// Regex patterns for detecting AI self-declaration in metadata text
const AI_TEXT_PATTERNS = {
  // Strong: explicit self-declaration of AI origin
  strong: [
    /\bai\s+cover\b/i,
    /\bai\s+\w+\s+cover\b/i,       // "AI Jazz Cover", "AI Style Cover"
    /\bai\s+remix\b/i,
    /\bai\s+version\b/i,
    /\bai[\s-]+generated\b/i,
    /\bgenerated\s+by\s+ai\b/i,
    /\bai\s+song\b/i,
    /\bai\s+music\b/i,
    /\bmade\s+(with|by|in)\s+(suno|udio|mubert)\b/i,
    /\b(suno|udio)\s+(ai|cover|remix|version|generation)\b/i,
  ],
  // Moderate: AI-related terms that suggest but don't confirm AI origin
  moderate: [
    /\bai\b.*\bcover\b/i,           // "AI" and "cover" anywhere in same text
    /\bcover\b.*\bai\b/i,
    /\b(suno|udio|mubert)\b/i,      // Known AI music generators
    /\bartificial\s+intelligence\b/i,
  ],
};

// ============================================================================
// AI DETECTION PROMPTS
// ============================================================================

/**
 * Zero-shot prompts for AI vs human music detection
 * 
 * These prompts target audible artifacts rather than asking "is this AI?"
 * CLAP matches audio-to-text semantic similarity, so we describe what AI
 * audio actually *sounds like* vs what human recordings *sound like*.
 */
const AI_DETECTION_PROMPTS = [
  // AI artifact indicators — describe what AI audio sounds like
  { 
    label: 'ai_generated', 
    prompt: 'metallic robotic vocal artifacts and unnatural singing voice' 
  },
  { 
    label: 'ai_generated', 
    prompt: 'digital vocal synthesis with artificial vibrato and phrasing' 
  },
  { 
    label: 'ai_generated', 
    prompt: 'blurry instrument separation with muddy frequency mixing' 
  },
  { 
    label: 'ai_generated', 
    prompt: 'sterile heavily quantized drums with perfect mechanical timing' 
  },
  { 
    label: 'ai_generated', 
    prompt: 'flat sterile mix with no room ambience or microphone character' 
  },
  
  // Human performance indicators — describe what real recordings sound like
  { 
    label: 'human_performance', 
    prompt: 'natural room acoustics with warm microphone character' 
  },
  { 
    label: 'human_performance', 
    prompt: 'live performance with human timing imperfections and groove' 
  },
  { 
    label: 'human_performance', 
    prompt: 'clear instrument separation with distinct spatial placement' 
  },
  { 
    label: 'human_performance', 
    prompt: 'natural singing voice with breath sounds and vocal expression' 
  },
  { 
    label: 'human_performance', 
    prompt: 'organic drum performance with dynamic velocity variations' 
  },
];

// ============================================================================
// SIGNAL 1: ZERO-SHOT CLAP PROBE
// ============================================================================

/**
 * Probe audio for AI vs human characteristics using CLAP zero-shot classification
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<{aiScore: number, humanScore: number, confidence: number, prompts: Object}>}
 */
async function probeAIGenerated(input, options = {}) {
  const { verbose = process.env.ORBIT_ML_VERBOSE === 'true' } = options;
  
  if (verbose) {
    console.log('🤖 AI Detection: Running semantic probe...');
  }
  
  const prompts = AI_DETECTION_PROMPTS.map(p => p.prompt);
  const results = await clap.classifyWithLabels(input, prompts, { verbose: false });
  
  // Aggregate scores by label
  let aiScore = 0;
  let humanScore = 0;
  const promptResults = {};
  
  for (const r of results) {
    const entry = AI_DETECTION_PROMPTS.find(p => p.prompt === r.label);
    if (entry) {
      promptResults[r.label] = r.confidence;
      if (entry.label === 'ai_generated') {
        aiScore += r.confidence;
      } else if (entry.label === 'human_performance') {
        humanScore += r.confidence;
      }
    }
  }
  
  // Normalize scores (3 prompts each category)
  const aiPromptCount = AI_DETECTION_PROMPTS.filter(p => p.label === 'ai_generated').length;
  const humanPromptCount = AI_DETECTION_PROMPTS.filter(p => p.label === 'human_performance').length;
  
  aiScore = aiScore / aiPromptCount;
  humanScore = humanScore / humanPromptCount;
  
  // Calculate relative score (0 = definitely human, 1 = definitely AI)
  const total = aiScore + humanScore;
  const normalizedAI = total > 0 ? aiScore / total : 0.5;
  
  // Confidence is how decisive the classification is
  const confidence = Math.abs(aiScore - humanScore);
  
  if (verbose) {
    console.log(`   AI score: ${(normalizedAI * 100).toFixed(1)}%`);
    console.log(`   Human score: ${((1 - normalizedAI) * 100).toFixed(1)}%`);
    console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
  }
  
  return {
    aiScore: Math.round(normalizedAI * 1000) / 1000,
    humanScore: Math.round((1 - normalizedAI) * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    rawScores: {
      ai: Math.round(aiScore * 1000) / 1000,
      human: Math.round(humanScore * 1000) / 1000,
    },
  };
}

// ============================================================================
// SIGNAL 2: AUDIO ANALYSIS ANOMALIES
// ============================================================================

/**
 * Check for audio anomalies typical of AI-generated music
 * 
 * Classic checks (BPM/key/energy) plus spectral forensics when available:
 * - 16kHz frequency cutoff from MP3-trained AI models
 * - Low phase entropy from neural vocoder artifacts
 * - Low spectral contrast from spectral smearing / instrument bleed
 * - Metronomic onset timing (no human micro-timing)
 * 
 * @param {Object} analysisResult - Result from metadata-extractor (includes ai_forensics when enabled)
 * @returns {{anomalyScore: number, flags: string[], details: Object}}
 */
function checkAudioAnomalies(analysisResult) {
  const flags = [];
  const details = {};
  let anomalyScore = 0;
  
  if (!analysisResult) {
    return { anomalyScore: 0, flags: ['NO_ANALYSIS_DATA'], details: {} };
  }
  
  const { bpm, key, energy } = analysisResult;
  const thresholds = AI_DETECTION_CONFIG.anomalyThresholds;
  
  // --- Classic checks ---
  
  if (bpm && bpm.confidence > thresholds.perfectTempo) {
    flags.push('PERFECT_TEMPO');
    details.bpmConfidence = bpm.confidence;
    anomalyScore += 0.12;
  }
  
  if (key && key.confidence > thresholds.perfectKey) {
    flags.push('PERFECT_KEY');
    details.keyConfidence = key.confidence;
    anomalyScore += 0.10;
  }
  
  if (energy !== undefined && energy !== null) {
    const energyDeviation = Math.abs(energy - 0.5);
    if (energyDeviation < 0.1) {
      flags.push('UNIFORM_ENERGY');
      details.energy = energy;
      anomalyScore += 0.08;
    }
  }
  
  // --- Spectral forensics (when ai_forensics data is available) ---
  
  const forensics = analysisResult.ai_forensics;
  if (forensics) {
    // 16kHz cutoff: AI models trained on MP3 datasets reproduce MP3's rolloff
    const cutoff = forensics.spectral_cutoff;
    if (cutoff && cutoff.available && cutoff.has_16k_cutoff) {
      flags.push('FREQ_CUTOFF_16K');
      details.energy_ratio_above_16k = cutoff.energy_ratio_above_16k;
      anomalyScore += 0.20;
    }
    
    // Phase entropy: AI audio has unnaturally coherent (low-entropy) phase
    const phase = forensics.phase_entropy;
    if (phase && phase.low_entropy) {
      flags.push('LOW_PHASE_ENTROPY');
      details.phase_entropy = phase.mean_entropy;
      details.phase_normalized = phase.normalized_entropy;
      anomalyScore += 0.25;
    }
    
    // Spectral contrast: low contrast = spectral smearing / instrument bleed
    const contrast = forensics.spectral_contrast;
    if (contrast && contrast.low_contrast) {
      flags.push('SPECTRAL_SMEARING');
      details.spectral_contrast_db = contrast.mean_contrast_db;
      details.spectral_flatness = contrast.mean_flatness;
      anomalyScore += 0.15;
    }
    
    // Onset regularity: metronomic timing suggests machine generation
    const onsets = forensics.onset_regularity;
    if (onsets && onsets.available && onsets.metronomic) {
      flags.push('METRONOMIC_TIMING');
      details.onset_cv = onsets.coefficient_of_variation;
      anomalyScore += 0.10;
    }
  }
  
  return {
    anomalyScore: Math.min(1, Math.round(anomalyScore * 1000) / 1000),
    flags,
    details,
  };
}

// ============================================================================
// SIGNAL 3: METADATA & BEHAVIORAL PATTERNS
// ============================================================================

/**
 * Scan text strings for AI-indicative keywords and phrases.
 * Returns the highest-tier match found across all input texts.
 *
 * @param {string[]} texts - Array of text strings to scan (title, artist, filename, etc.)
 * @returns {{tier: 'strong'|'moderate'|null, score: number, matched: string|null}}
 */
function scanTextForAIIndicators(texts) {
  const candidates = texts.filter(Boolean).map(t => String(t));
  if (candidates.length === 0) return { tier: null, score: 0, matched: null };

  for (const text of candidates) {
    for (const re of AI_TEXT_PATTERNS.strong) {
      if (re.test(text)) return { tier: 'strong', score: 0.85, matched: text };
    }
  }
  for (const text of candidates) {
    for (const re of AI_TEXT_PATTERNS.moderate) {
      if (re.test(text)) return { tier: 'moderate', score: 0.50, matched: text };
    }
  }

  return { tier: null, score: 0, matched: null };
}

/**
 * Check metadata patterns common in AI-generated uploads
 * 
 * AI generators often produce content with characteristic patterns:
 * - Explicit AI self-declaration in title/artist/filename
 * - Typical duration ranges (Suno/Udio: ~2-3:30)
 * - Round durations (exactly 2:00, 3:00)
 * - Missing standard identifiers (no ISRC/UPC)
 * 
 * @param {Object} metadata - Track metadata (title, artist, filename, isrc, upc)
 * @param {number} durationSeconds - Track duration in seconds
 * @returns {{suspicionScore: number, flags: string[], details: Object}}
 */
function checkMetadataPatterns(metadata, durationSeconds) {
  const flags = [];
  const details = {};
  let suspicionScore = 0;
  
  // Check 1: AI self-declaration in title, artist, or filename
  if (metadata) {
    const textHit = scanTextForAIIndicators([
      metadata.title,
      metadata.artist,
      metadata.filename,
    ]);
    if (textHit.tier === 'strong') {
      flags.push('AI_SELF_DECLARED');
      details.ai_text_tier = 'strong';
      details.ai_text_matched = textHit.matched;
      suspicionScore += textHit.score;
    } else if (textHit.tier === 'moderate') {
      flags.push('AI_TEXT_INDICATOR');
      details.ai_text_tier = 'moderate';
      details.ai_text_matched = textHit.matched;
      suspicionScore += textHit.score;
    }
  }
  
  const typicalDurations = AI_DETECTION_CONFIG.typicalAIDurations;
  
  // Check 2: Duration in typical AI generator range
  if (durationSeconds >= typicalDurations.min && durationSeconds <= typicalDurations.max) {
    flags.push('TYPICAL_AI_DURATION');
    details.duration = durationSeconds;
    details.typicalRange = `${typicalDurations.min}-${typicalDurations.max}s`;
    suspicionScore += 0.15;
  }
  
  // Check 3: Suspiciously round duration (exactly on 30s or 60s marks)
  if (durationSeconds > 0) {
    const isRoundDuration = durationSeconds % 30 === 0;
    if (isRoundDuration) {
      flags.push('ROUND_DURATION');
      details.exactDuration = durationSeconds;
      suspicionScore += 0.10;
    }
  }
  
  // Check 4: Missing industry identifiers
  if (metadata) {
    if (!metadata.isrc && !metadata.upc) {
      flags.push('NO_IDENTIFIERS');
      suspicionScore += 0.05;
    }
  }
  
  return {
    suspicionScore: Math.min(1, Math.round(suspicionScore * 1000) / 1000),
    flags,
    details,
  };
}

// ============================================================================
// SIGNAL 4: CATALOG PROVENANCE MISMATCH
// ============================================================================

/**
 * Check for provenance mismatch using AcoustID catalog results.
 * 
 * If AcoustID matches a known work but the metadata doesn't corroborate
 * (different artist, no ISRC, low corroboration score), this is a strong
 * signal of an AI cover or unauthorized derivative.
 * 
 * @param {Object|null} catalogResult - Result from catalog-check.check()
 * @returns {{provenanceScore: number, flags: string[], details: Object}}
 */
function checkCatalogProvenance(catalogResult) {
  const flags = [];
  const details = {};
  let provenanceScore = 0;
  
  if (!catalogResult || catalogResult.status === 'unavailable') {
    return { provenanceScore: 0, flags: ['CATALOG_UNAVAILABLE'], details: {} };
  }
  
  if (catalogResult.status === 'no_match') {
    return { provenanceScore: 0, flags: [], details: { status: 'no_match' } };
  }
  
  // AcoustID matched a known work
  details.acoustid_score = catalogResult.acoustid?.score;
  details.known_title = catalogResult.musicbrainz?.title || null;
  details.known_artist = catalogResult.musicbrainz?.artist || null;
  
  if (catalogResult.status === 'known_work_unverified') {
    // AcoustID matches but metadata doesn't corroborate -- strong AI cover signal
    flags.push('KNOWN_WORK_METADATA_MISMATCH');
    provenanceScore = 0.85;
    
    details.corroboration_score = catalogResult.corroboration?.score || 0;
    details.title_match = catalogResult.corroboration?.title_match || false;
    details.artist_match = catalogResult.corroboration?.artist_match || false;
  } else if (catalogResult.status === 'verified_known_work') {
    // Metadata matches -- likely a legitimate upload of the known work
    details.corroboration_score = catalogResult.corroboration?.score || 0;
    provenanceScore = 0;
  }
  
  return {
    provenanceScore: Math.min(1, Math.round(provenanceScore * 1000) / 1000),
    flags,
    details,
  };
}

// ============================================================================
// COMBINED DETECTION
// ============================================================================

/**
 * Run complete AI music detection
 * 
 * Combines all signals into a single score with recommendation.
 * This is designed to be called during registration and returns
 * advisory information for human review.
 * 
 * @param {string|Buffer} audioInput - Audio file path or buffer
 * @param {Object} options - Detection options
 * @param {Object} options.metadata - Track metadata (title, artist, isrc, etc.)
 * @param {Object} options.analysisResult - Pre-computed audio analysis (optional)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<Object>} AI detection result with score and signals
 * 
 * @example
 * const result = await detectAI(audioBuffer, { metadata: { title: 'My Track' } });
 * // {
 * //   score: 0.45,
 * //   recommendation: 'REVIEW',
 * //   signals: { semantic: {...}, anomalies: {...}, metadata: {...} },
 * //   processing_time_ms: 234
 * // }
 */
async function detectAI(audioInput, options = {}) {
  const {
    metadata = {},
    analysisResult = null,
    catalogResult = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log('🤖 AI Detection: Starting multi-signal analysis...');
  }
  
  const weights = AI_DETECTION_CONFIG.weights;
  const thresholds = AI_DETECTION_CONFIG.thresholds;
  
  // Initialize result structure
  const result = {
    score: null,
    recommendation: null,
    signals: {
      semantic: null,
      anomalies: null,
      metadata: null,
      catalog: null,
    },
    processing_time_ms: 0,
  };
  
  try {
    // Signal 1: Semantic CLAP probe
    let semanticScore = 0;
    try {
      const semanticResult = await probeAIGenerated(audioInput, { verbose });
      result.signals.semantic = semanticResult;
      semanticScore = semanticResult.aiScore;
    } catch (error) {
      if (verbose) {
        console.log(`   ⚠️ Semantic probe failed: ${error.message}`);
      }
      result.signals.semantic = { error: error.message, aiScore: 0 };
      semanticScore = 0;
    }
    
    // Signal 2: Audio anomalies (use provided analysis or skip)
    let anomalyScore = 0;
    if (analysisResult) {
      const anomalyResult = checkAudioAnomalies(analysisResult);
      result.signals.anomalies = anomalyResult;
      anomalyScore = anomalyResult.anomalyScore;
    } else {
      result.signals.anomalies = { 
        anomalyScore: 0, 
        flags: ['NO_ANALYSIS_PROVIDED'],
        details: {} 
      };
    }
    
    // Signal 3: Metadata patterns
    const duration = analysisResult?.duration || 
                     (metadata.duration_ms ? metadata.duration_ms / 1000 : 0);
    const metadataPatterns = checkMetadataPatterns(metadata, duration);
    result.signals.metadata = metadataPatterns;
    const metadataScore = metadataPatterns.suspicionScore;
    
    // Signal 4: Catalog provenance mismatch
    let catalogScore = 0;
    const catalogSignal = checkCatalogProvenance(catalogResult);
    result.signals.catalog = catalogSignal;
    catalogScore = catalogSignal.provenanceScore;
    
    // Determine effective weights.
    // When catalog signal is non-informative (no_match or unavailable),
    // redistribute its weight proportionally among the other signals so
    // they aren't capped at (1 - catalog_weight) of the total.
    const catalogInformative = catalogScore > 0 ||
      catalogSignal.flags?.includes('KNOWN_WORK_METADATA_MISMATCH');

    let wSemantic = weights.semantic;
    let wAnomaly  = weights.anomaly;
    let wMetadata = weights.metadata;
    let wCatalog  = weights.catalog;

    if (!catalogInformative) {
      const nonCatalogSum = weights.semantic + weights.anomaly + weights.metadata;
      wSemantic = weights.semantic / nonCatalogSum;
      wAnomaly  = weights.anomaly  / nonCatalogSum;
      wMetadata = weights.metadata / nonCatalogSum;
      wCatalog  = 0;
    }

    const weightedScore =
      (semanticScore * wSemantic) +
      (anomalyScore  * wAnomaly) +
      (metadataScore * wMetadata) +
      (catalogScore  * wCatalog);

    // Signal-override floors: certain flag combinations are strong enough
    // to override the weighted average. Self-declaration isn't a heuristic —
    // it's the uploader telling you the content is AI.
    const metaFlags = metadataPatterns.flags;
    const anomalyFlags = result.signals.anomalies?.flags || [];
    const forensicHits = anomalyFlags.filter(f =>
      ['FREQ_CUTOFF_16K', 'LOW_PHASE_ENTROPY', 'SPECTRAL_SMEARING', 'METRONOMIC_TIMING'].includes(f));

    let scoreFloor = 0;
    if (metaFlags.includes('AI_SELF_DECLARED') && forensicHits.length >= 1) {
      scoreFloor = 0.75;
    } else if (metaFlags.includes('AI_SELF_DECLARED')) {
      scoreFloor = 0.60;
    } else if (metaFlags.includes('AI_TEXT_INDICATOR') && forensicHits.length >= 1) {
      scoreFloor = 0.55;
    } else if (forensicHits.length >= 2) {
      scoreFloor = 0.45;
    }

    const combinedScore = Math.max(weightedScore, scoreFloor);

    result.score = Math.round(combinedScore * 1000) / 1000;
    result.weights_used = { semantic: wSemantic, anomaly: wAnomaly, metadata: wMetadata, catalog: wCatalog };
    if (scoreFloor > 0 && scoreFloor > weightedScore) {
      result.score_floor_applied = scoreFloor;
    }
    
    // Determine recommendation
    if (result.score >= thresholds.likelyAI) {
      result.recommendation = 'LIKELY_AI';
    } else if (result.score >= thresholds.review) {
      result.recommendation = 'REVIEW';
    } else {
      result.recommendation = 'LIKELY_HUMAN';
    }
    
    result.processing_time_ms = Date.now() - startTime;
    
    if (verbose) {
      console.log(`✅ AI Detection complete:`);
      console.log(`   Score: ${(result.score * 100).toFixed(1)}%`);
      console.log(`   Recommendation: ${result.recommendation}`);
      console.log(`   Time: ${result.processing_time_ms}ms`);
    }
    
  } catch (error) {
    // Fail-open: return neutral result on unexpected errors
    if (verbose) {
      console.log(`⚠️ AI Detection error (non-fatal): ${error.message}`);
    }
    
    result.score = null;
    result.recommendation = 'DETECTION_ERROR';
    result.error = error.message;
    result.processing_time_ms = Date.now() - startTime;
  }
  
  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a recommendation indicates potential AI content
 * 
 * @param {string} recommendation - Recommendation from detectAI()
 * @returns {boolean}
 */
function shouldReview(recommendation) {
  return recommendation === 'LIKELY_AI' || recommendation === 'REVIEW';
}

/**
 * Format AI detection result for database storage
 * 
 * @param {Object} detectionResult - Result from detectAI()
 * @returns {Object} Formatted for ai_metadata JSONB column
 */
function formatForDatabase(detectionResult) {
  return {
    ai_detection: {
      score: detectionResult.score,
      recommendation: detectionResult.recommendation,
      signals: detectionResult.signals,
      detected_at: new Date().toISOString(),
      processing_time_ms: detectionResult.processing_time_ms,
    },
  };
}

/**
 * Get all flags from all signals
 * 
 * @param {Object} detectionResult - Result from detectAI()
 * @returns {string[]} Combined list of all flags
 */
function getAllFlags(detectionResult) {
  const flags = [];
  
  if (detectionResult.signals?.anomalies?.flags) {
    flags.push(...detectionResult.signals.anomalies.flags);
  }
  if (detectionResult.signals?.metadata?.flags) {
    flags.push(...detectionResult.signals.metadata.flags);
  }
  if (detectionResult.signals?.catalog?.flags) {
    flags.push(...detectionResult.signals.catalog.flags);
  }
  
  return flags;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main detection function
  detectAI,
  
  // Individual signal functions (for testing/advanced use)
  probeAIGenerated,
  checkAudioAnomalies,
  checkMetadataPatterns,
  checkCatalogProvenance,
  scanTextForAIIndicators,
  
  // Utility functions
  shouldReview,
  formatForDatabase,
  getAllFlags,
  
  // Configuration (for testing/tuning)
  config: AI_DETECTION_CONFIG,
  prompts: AI_DETECTION_PROMPTS,
};

