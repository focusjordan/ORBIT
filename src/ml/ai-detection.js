/**
 * ORBIT AI Music Detection Module
 * 
 * Multi-signal AI-generated music detection using:
 * 1. Zero-shot CLAP semantic probing (AI vs human performance prompts)
 * 2. Audio analysis anomaly detection (suspiciously perfect metrics)
 * 3. Metadata/behavioral pattern heuristics
 * 
 * This module provides ADVISORY signals for human review, not automated rejection.
 * Detection is always run during registration but results are informational only.
 * 
 * Architecture:
 * - Uses existing CLAP infrastructure for semantic probing
 * - Uses existing audio-analysis for anomaly detection
 * - Combines signals with weighted scoring
 * - Fail-open design: errors don't block registration
 * 
 * Accuracy Note:
 * This is a first-generation detection system using zero-shot classification.
 * It is NOT 100% accurate and should be used alongside:
 * - Community reporting
 * - Manual review for flagged content
 * - Platform FAQ/policy enforcement
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
    semantic: 0.50,    // CLAP zero-shot probe (strongest signal)
    anomaly: 0.30,     // Audio analysis anomalies
    metadata: 0.20,    // Metadata/behavioral patterns
  },
  
  // Thresholds for recommendations
  thresholds: {
    likelyAI: 0.70,    // Score >= 0.70 → LIKELY_AI
    review: 0.40,      // Score >= 0.40 → REVIEW
    // Below 0.40 → LIKELY_HUMAN
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

// ============================================================================
// AI DETECTION PROMPTS
// ============================================================================

/**
 * Zero-shot prompts for AI vs human music detection
 * 
 * These prompts leverage CLAP's text-audio alignment to probe
 * whether audio sounds more like AI-generated or human-performed music.
 */
const AI_DETECTION_PROMPTS = [
  // AI-generated indicators
  { 
    label: 'ai_generated', 
    prompt: 'artificial intelligence generated synthetic music' 
  },
  { 
    label: 'ai_generated', 
    prompt: 'computer generated audio neural network music' 
  },
  { 
    label: 'ai_generated', 
    prompt: 'AI synthesized digital music production' 
  },
  
  // Human performance indicators
  { 
    label: 'human_performance', 
    prompt: 'natural human musical performance recording' 
  },
  { 
    label: 'human_performance', 
    prompt: 'live musician playing real instruments studio recording' 
  },
  { 
    label: 'human_performance', 
    prompt: 'authentic human voice singing natural performance' 
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
 * AI-generated music often has telltale signs:
 * - Suspiciously perfect tempo (no natural drift)
 * - Unnaturally consistent key (no modulation variance)
 * - Low dynamic range (over-compressed sounding)
 * 
 * @param {Object} analysisResult - Result from audio-analysis.js analyze()
 * @returns {{anomalyScore: number, flags: string[], details: Object}}
 */
function checkAudioAnomalies(analysisResult) {
  const flags = [];
  const details = {};
  let anomalyScore = 0;
  
  if (!analysisResult) {
    return { anomalyScore: 0, flags: ['NO_ANALYSIS_DATA'], details: {} };
  }
  
  const { bpm, key, loudness_db, energy } = analysisResult;
  const thresholds = AI_DETECTION_CONFIG.anomalyThresholds;
  
  // Check 1: Suspiciously perfect BPM confidence
  // Real recordings have slight tempo drift; AI is often too perfect
  if (bpm && bpm.confidence > thresholds.perfectTempo) {
    flags.push('PERFECT_TEMPO');
    details.bpmConfidence = bpm.confidence;
    anomalyScore += 0.25;
  }
  
  // Check 2: Unnaturally high key confidence
  // AI tends to stay perfectly in key throughout
  if (key && key.confidence > thresholds.perfectKey) {
    flags.push('PERFECT_KEY');
    details.keyConfidence = key.confidence;
    anomalyScore += 0.20;
  }
  
  // Check 3: Very consistent energy (would need variance metric)
  // For now, very low or very high energy might indicate synthesis
  if (energy !== undefined && energy !== null) {
    // Extremely consistent energy (close to 0.5) can indicate AI
    const energyDeviation = Math.abs(energy - 0.5);
    if (energyDeviation < 0.1) {
      flags.push('UNIFORM_ENERGY');
      details.energy = energy;
      anomalyScore += 0.15;
    }
  }
  
  // Check 4: Unusual loudness (if we had loudness range data)
  // AI music often has compressed dynamics
  // Note: This would need loudness_range from analysis
  
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
 * Check metadata patterns common in AI-generated uploads
 * 
 * AI generators often produce content with characteristic patterns:
 * - Typical duration ranges (Suno/Udio: ~2-3:30)
 * - Round durations (exactly 2:00, 3:00)
 * - Missing standard identifiers (no ISRC/UPC)
 * 
 * @param {Object} metadata - Track metadata
 * @param {number} durationSeconds - Track duration in seconds
 * @returns {{suspicionScore: number, flags: string[], details: Object}}
 */
function checkMetadataPatterns(metadata, durationSeconds) {
  const flags = [];
  const details = {};
  let suspicionScore = 0;
  
  const typicalDurations = AI_DETECTION_CONFIG.typicalAIDurations;
  
  // Check 1: Duration in typical AI generator range
  if (durationSeconds >= typicalDurations.min && durationSeconds <= typicalDurations.max) {
    flags.push('TYPICAL_AI_DURATION');
    details.duration = durationSeconds;
    details.typicalRange = `${typicalDurations.min}-${typicalDurations.max}s`;
    suspicionScore += 0.15;
  }
  
  // Check 2: Suspiciously round duration (exactly on 30s or 60s marks)
  if (durationSeconds > 0) {
    const isRoundDuration = durationSeconds % 30 === 0;
    if (isRoundDuration) {
      flags.push('ROUND_DURATION');
      details.exactDuration = durationSeconds;
      suspicionScore += 0.10;
    }
  }
  
  // Check 3: Missing industry identifiers
  // Legitimate releases usually have ISRC/UPC
  if (metadata) {
    if (!metadata.isrc && !metadata.upc) {
      flags.push('NO_IDENTIFIERS');
      suspicionScore += 0.05;
    }
  }
  
  // Note: Additional heuristics could include:
  // - Bulk upload patterns (would need session context)
  // - Generic/templated metadata
  // - Suspicious artist names
  
  return {
    suspicionScore: Math.min(1, Math.round(suspicionScore * 1000) / 1000),
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
    const metadataResult = checkMetadataPatterns(metadata, duration);
    result.signals.metadata = metadataResult;
    const metadataScore = metadataResult.suspicionScore;
    
    // Combine scores with weights
    const combinedScore = 
      (semanticScore * weights.semantic) +
      (anomalyScore * weights.anomaly) +
      (metadataScore * weights.metadata);
    
    result.score = Math.round(combinedScore * 1000) / 1000;
    
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
  
  // Utility functions
  shouldReview,
  formatForDatabase,
  getAllFlags,
  
  // Configuration (for testing/tuning)
  config: AI_DETECTION_CONFIG,
  prompts: AI_DETECTION_PROMPTS,
};

