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
const aiKnn = require('./ai-knn');
const audioAnalysis = require('./audio-analysis');
const silentcipher = require('./silentcipher');
const sonics = require('./sonics');
const runtimeConfig = require('../config');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * AI Detection Configuration
 */
const AI_DETECTION_CONFIG = {
  // Legacy weights for combining signals (must sum to 1.0)
  weights: {
    semantic: 0.30,
    anomaly: 0.20,
    metadata: 0.15,
    catalog: 0.35,
  },

  // V2 weights — SONICS primary, KNN excluded (no reference catalog)
  weightsV2: {
    semantic: 0.10,
    anomaly: 0.20,
    metadata: 0.10,
    catalog: 0.10,
    sonics: 0.50,
    knn: 0.00,
  },

  // V3 weights — SONICS is primary (purpose-built AI music detector).
  // Watermark (SilentCipher) and KNN are separate ORBIT capabilities,
  // not part of the AI-detection scoring pipeline.
  weightsV3: {
    semantic: 0.10,
    anomaly: 0.20,
    metadata: 0.10,
    catalog: 0.10,
    watermark: 0.00,
    sonics: 0.50,
    knn: 0.00,
  },

  // Thresholds for recommendations
  thresholds: {
    likelyAI: 0.55,
    review: 0.30,
  },

  thresholdsV2: {
    likelyAI: 0.58,
    review: 0.34,
  },

  thresholdsV3: {
    likelyAI: 0.55,
    review: 0.30,
  },
  
  // Anomaly detection thresholds
  anomalyThresholds: {
    perfectTempo: 0.98,
    perfectKey: 0.95,
    lowDynamicRange: 6,
    lowHarmonicity: 0.35,
    highLoopRepetition: 0.65,
    highTempoStability: 0.94,
    lowCrestFactor: 4.5,
    lowSpectralCentroidCv: 0.30,
    lowSpectralBandwidthCv: 0.25,
    steepSpectralRolloff: 0.15,
    lowSpectralFluxCv: 0.55,
    lowZcrCv: 0.45,
    lowMfccVariance: 700.0,
    lowChromaEntropy: 0.88,
    flatEnergyArc: 0.0005,
    checkerboardPeak: 0.65,
    lowSubbandEntropy: 0.78,
    hfHarmonicAnomaly: 0.50,
    preEchoRatio: 0.15,
    hfPhaseVariance: 2.5,
    msCoherenceLow: 0.4,
    msCoherenceDropRatio: 0.35,
    pitchJitterClean: 0.5,
    noiseFloorAutocorr: 0.35,
  },
  
  // Duration patterns (in seconds) typical of AI generators
  typicalAIDurations: {
    min: 115,   // ~1:55
    max: 215,   // ~3:35
  },

  metadataThresholdsV2: {
    suspiciousSampleRates: [32000, 48000],
    suspiciousBitDepths: [16, 24],
    contributorCountMin: 1,
    shortDurationSignatureSec: 95,
  },

  // Known AI generator encoder/format fingerprints
  aiEncoderSignatures: [
    { pattern: /\bsuno\b/i, generator: 'Suno' },
    { pattern: /\budio\b/i, generator: 'Udio' },
    { pattern: /\bmubert\b/i, generator: 'Mubert' },
    { pattern: /\bsoundraw\b/i, generator: 'SoundRaw' },
    { pattern: /\baiva\b/i, generator: 'AIVA' },
    { pattern: /\bboomy\b/i, generator: 'Boomy' },
    { pattern: /\bbeatoven\b/i, generator: 'Beatoven' },
    { pattern: /\bloudly\b/i, generator: 'Loudly' },
  ],

  // Known DAW/production software encoder signatures — evidence of human production
  knownDawEncoders: [
    { pattern: /\bFL Studio\b/i, daw: 'FL Studio' },
    { pattern: /\bLogic Pro\b/i, daw: 'Logic Pro' },
    { pattern: /\bPro Tools\b/i, daw: 'Pro Tools' },
    { pattern: /\bAbleton\b/i, daw: 'Ableton Live' },
    { pattern: /\bCubase\b/i, daw: 'Cubase' },
    { pattern: /\bReaper\b/i, daw: 'Reaper' },
    { pattern: /\bStudio One\b/i, daw: 'Studio One' },
    { pattern: /\bGarageBand\b/i, daw: 'GarageBand' },
    { pattern: /\bAudacity\b/i, daw: 'Audacity' },
    { pattern: /\bAdobe Audition\b/i, daw: 'Adobe Audition' },
    { pattern: /\bBitwig\b/i, daw: 'Bitwig' },
    { pattern: /\bReason\b/i, daw: 'Reason' },
    { pattern: /\bLAME\b/i, daw: 'LAME (encoder)' },
    { pattern: /\bffmpeg\b/i, daw: 'FFmpeg' },
    { pattern: /\bSoundForge\b/i, daw: 'Sound Forge' },
  ],

  // Format combos are no longer standalone signals — standard DAW export formats
  // overlap with AI generators. Only used as corroboration when paired with other evidence.
  aiFormatCombos: [
    { sample_rate: 44100, bits: 32, sample_fmt: 'flt', generator: 'Suno' },
    { sample_rate: 44100, bits: 32, sample_fmt: 'f32le', generator: 'Suno' },
    { sample_rate: 44100, bits: 16, sample_fmt: 's16', generator: 'Udio' },
    { sample_rate: 44100, bits: 16, sample_fmt: 's16p', generator: 'Udio' },
  ],

  // Generic album values typical of AI generators
  genericAlbumPatterns: [
    /^untitled$/i,
    /^unknown$/i,
    /^album$/i,
    /^my\s+album$/i,
    /^single$/i,
    /^demo$/i,
    /^music$/i,
    /^ai\s*(music|songs?|tracks?|album)?$/i,
  ],

  creationUploadMaxGapSec: 300,
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
const AI_DETECTION_PROMPTS_V1 = [
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

const AI_DETECTION_PROMPTS_V2 = [
  { label: 'ai_generated', prompt: 'unnatural vocal formants with digital shimmer artifacts' },
  { label: 'ai_generated', prompt: 'repetitive phrase-level structure with low section variation' },
  { label: 'ai_generated', prompt: 'uniformly loud synthetic mastering with limited macro-dynamics' },
  { label: 'ai_generated', prompt: 'hyper-clean transients with machine-perfect rhythmic quantization' },
  { label: 'ai_generated', prompt: 'blurred harmonic overtones and smeared timbral boundaries' },
  { label: 'human_performance', prompt: 'natural vocal phrasing with breath and articulation nuance' },
  { label: 'human_performance', prompt: 'arrangement evolution with intentional section contrast' },
  { label: 'human_performance', prompt: 'organic dynamic movement between verse and chorus' },
  { label: 'human_performance', prompt: 'imperfect but expressive groove and timing feel' },
  { label: 'human_performance', prompt: 'distinct instrument timbres with natural acoustic depth' },
];

function resolveFeatureFlags(overrides = {}) {
  const cfg = runtimeConfig.ai || {};
  return {
    v2Enabled: overrides.v2Enabled ?? cfg.v2Enabled ?? false,
    shadowMode: overrides.shadowMode ?? cfg.shadowMode ?? false,
    registerAnalysisEnabled: overrides.registerAnalysisEnabled ?? cfg.registerAnalysisEnabled ?? false,
    knnEnabled: overrides.knnEnabled ?? cfg.knnEnabled ?? false,
    promptsV2Enabled: overrides.promptsV2Enabled ?? cfg.promptsV2Enabled ?? false,
    metadataV2Enabled: overrides.metadataV2Enabled ?? cfg.metadataV2Enabled ?? false,
    crossSignalV2Enabled: overrides.crossSignalV2Enabled ?? cfg.crossSignalV2Enabled ?? false,
    forensicsV3Enabled: overrides.forensicsV3Enabled ?? cfg.forensicsV3Enabled ?? false,
  };
}

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
  const {
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
    useV2Prompts = false,
  } = options;
  
  if (verbose) {
    console.log('🤖 AI Detection: Running semantic probe...');
  }
  
  const promptBank = useV2Prompts ? AI_DETECTION_PROMPTS_V2 : AI_DETECTION_PROMPTS_V1;
  const prompts = promptBank.map(p => p.prompt);
  const results = await clap.classifyWithLabels(input, prompts, { verbose: false });
  
  // Aggregate scores by label
  let aiScore = 0;
  let humanScore = 0;
  const promptResults = {};
  
  for (const r of results) {
    const entry = promptBank.find(p => p.prompt === r.label);
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
  const aiPromptCount = promptBank.filter(p => p.label === 'ai_generated').length;
  const humanPromptCount = promptBank.filter(p => p.label === 'human_performance').length;
  
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
  
  const flags = [];
  if (normalizedAI >= 0.67) flags.push('SEMANTIC_AI_DOMINANT');
  if (confidence >= 0.18) flags.push('SEMANTIC_HIGH_CONFIDENCE');

  return {
    aiScore: Math.round(normalizedAI * 1000) / 1000,
    humanScore: Math.round((1 - normalizedAI) * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    flags,
    prompt_set: useV2Prompts ? 'v2' : 'v1',
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
function checkAudioAnomalies(analysisResult, options = {}) {
  const { v2Enabled = false, forensicsV3Enabled = false } = options;
  const verbose = process.env.ORBIT_ML_VERBOSE === 'true';
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

  if (v2Enabled) {
    const dynamicRangeDb = analysisResult.dynamic_range_db ?? analysisResult.loudness_range_db;
    if (dynamicRangeDb !== undefined && dynamicRangeDb !== null && dynamicRangeDb < thresholds.lowDynamicRange) {
      flags.push('LOW_DYNAMIC_RANGE');
      details.dynamic_range_db = dynamicRangeDb;
      anomalyScore += 0.07;
    }
  }
  const classicFlagsCount = flags.length;
  
  // --- Spectral forensics (when ai_forensics data is available) ---
  
  const forensics = analysisResult.ai_forensics;
  if (forensics) {
    if (forensics.stem_forensics && typeof forensics.stem_forensics === 'object') {
      details.stem_forensics = forensics.stem_forensics;

      const stemForensics = forensics.stem_forensics;
      const stemCutoff = stemForensics.vocal_spectral_cutoff;
      if (stemCutoff && stemCutoff.available && stemCutoff.has_16k_cutoff) {
        flags.push('STEM_VOCAL_FREQ_CUTOFF_16K');
        anomalyScore += 0.08;
      }

      const stemPhase = stemForensics.vocal_phase_entropy;
      if (stemPhase && stemPhase.low_entropy) {
        flags.push('STEM_LOW_VOCAL_PHASE_ENTROPY');
        anomalyScore += 0.08;
      }

      const stemDrums = stemForensics.drum_onset_regularity;
      if (stemDrums && stemDrums.available && stemDrums.metronomic) {
        flags.push('STEM_METRONOMIC_DRUM_TIMING');
        anomalyScore += 0.06;
      }
    }

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

    if (v2Enabled) {
      const harmonicity = forensics.harmonicity;
      if (harmonicity && harmonicity.available && harmonicity.harmonic_ratio < thresholds.lowHarmonicity) {
        flags.push('LOW_HARMONICITY');
        details.harmonic_ratio = harmonicity.harmonic_ratio;
        anomalyScore += 0.08;
      }
      if (harmonicity && harmonicity.hf_anomalous) {
        flags.push('HF_HARMONIC_ANOMALY');
        details.hf_harmonic_ratio = harmonicity.hf_harmonic_ratio;
        anomalyScore += 0.06;
      }

      const repetition = forensics.loop_repetition;
      if (repetition && repetition.available && repetition.repetition_score > thresholds.highLoopRepetition) {
        flags.push('HIGH_LOOP_REPETITION');
        details.loop_repetition_score = repetition.repetition_score;
        anomalyScore += 0.08;
      }

      const tempoRegularity = forensics.tempo_regularity;
      if (tempoRegularity && tempoRegularity.available && tempoRegularity.stability > thresholds.highTempoStability) {
        flags.push('HIGH_TEMPO_STABILITY');
        details.tempo_stability = tempoRegularity.stability;
        anomalyScore += 0.07;
      }

      const crest = forensics.crest_factor;
      if (crest && crest.available && crest.low_crest) {
        flags.push('LOW_CREST_FACTOR');
        details.crest_factor = crest.crest_factor;
        anomalyScore += 0.06;
      }

      const centroidVar = forensics.spectral_centroid_var;
      if (centroidVar && centroidVar.available && centroidVar.low_variance) {
        flags.push('LOW_SPECTRAL_CENTROID_VARIANCE');
        details.spectral_centroid_cv = centroidVar.cv;
        anomalyScore += 0.05;
      }

      const bwVar = forensics.spectral_bandwidth_var;
      if (bwVar && bwVar.available && bwVar.low_variance) {
        flags.push('LOW_SPECTRAL_BANDWIDTH_VARIANCE');
        details.spectral_bandwidth_cv = bwVar.cv;
        anomalyScore += 0.05;
      }

      const rolloff = forensics.spectral_rolloff;
      if (rolloff && rolloff.available && rolloff.steep_rolloff) {
        flags.push('STEEP_SPECTRAL_ROLLOFF');
        details.spectral_rolloff_steepness = rolloff.steepness;
        anomalyScore += 0.05;
      }

      const flux = forensics.spectral_flux;
      if (flux && flux.available && flux.low_flux_variance) {
        flags.push('LOW_SPECTRAL_FLUX_VARIANCE');
        details.spectral_flux_cv = flux.cv;
        anomalyScore += 0.06;
      }

      const zcrVar = forensics.zcr_variance;
      if (zcrVar && zcrVar.available && zcrVar.low_variance) {
        flags.push('LOW_ZCR_VARIANCE');
        details.zcr_cv = zcrVar.cv;
        anomalyScore += 0.05;
      }

      const mfcc = forensics.mfcc_temporal;
      if (mfcc && mfcc.available && mfcc.low_variance) {
        flags.push('LOW_MFCC_VARIANCE');
        details.mfcc_mean_variance = mfcc.mean_variance;
        anomalyScore += 0.06;
      }

      const chromaEnt = forensics.chroma_entropy;
      if (chromaEnt && chromaEnt.available && chromaEnt.low_entropy) {
        flags.push('LOW_CHROMA_ENTROPY');
        details.chroma_entropy_normalized = chromaEnt.normalized;
        anomalyScore += 0.05;
      }

      const arc = forensics.energy_arc;
      if (arc && arc.available && arc.flat_arc) {
        flags.push('FLAT_ENERGY_ARC');
        details.energy_arc_variance = arc.arc_variance;
        anomalyScore += 0.06;
      }

      const checker = forensics.checkerboard;
      if (checker && checker.available && checker.has_artifacts) {
        flags.push('CHECKERBOARD_ARTIFACTS');
        details.checkerboard_cepstral_peak = checker.cepstral_peak_ratio;
        details.checkerboard_pow2_peak = checker.pow2_peak_ratio;
        anomalyScore += 0.08;
      }

      const subband = forensics.subband_energy;
      if (subband && subband.available && subband.low_entropy) {
        flags.push('LOW_SUBBAND_ENTROPY');
        details.subband_distribution_entropy = subband.distribution_entropy;
        anomalyScore += 0.05;
      }
    }

    if (forensicsV3Enabled) {
      const preEcho = forensics.pre_echo;
      if (preEcho && preEcho.available && preEcho.has_pre_echo) {
        flags.push('PRE_ECHO_DETECTED');
        details.pre_echo_ratio = preEcho.mean_pre_echo_ratio;
        details.pre_echo_slope_ratio = preEcho.positive_slope_ratio;
        anomalyScore += 0.18;
      }

      const hfPhase = forensics.hf_phase_incoherence;
      if (hfPhase && hfPhase.available && hfPhase.hf_incoherent) {
        flags.push('HF_PHASE_INCOHERENCE');
        details.hf_group_delay_variance = hfPhase.mean_group_delay_variance;
        anomalyScore += 0.20;
      }

      const msPhase = forensics.ms_phase_coherence;
      if (msPhase && msPhase.available && msPhase.ms_anomalous) {
        flags.push('MS_PHASE_ANOMALY');
        details.low_mid_sm_ratio = msPhase.low_mid_sm_ratio;
        details.sub_bass_sm_ratio = msPhase.sub_bass_sm_ratio;
        anomalyScore += 0.15;
      }

      const jitter = forensics.pitch_jitter;
      if (jitter && jitter.available && jitter.perfect_vibrato) {
        flags.push('PERFECT_VIBRATO');
        details.modulation_slope = jitter.mean_modulation_slope;
        anomalyScore += 0.12;
      }
    }
  }

  if (verbose) {
    const forensicKeys = Object.keys(forensics || {});
    const forensicFlags = flags.slice(classicFlagsCount);
    console.log(
      `   AudioAnomaly forensics: present=${Boolean(forensics)} keys=${forensicKeys.length ? forensicKeys.join(',') : 'none'} flags=${forensicFlags.length ? forensicFlags.join(',') : 'none'}`
    );
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
function checkMetadataPatterns(metadata, durationSeconds, options = {}) {
  const {
    metadataV2Enabled = false,
    crossSignalV2Enabled = false,
    analysisResult = null,
  } = options;
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
      suspicionScore += 0.02;
    }
  }

  if (metadataV2Enabled && metadata) {
    const thresholds = AI_DETECTION_CONFIG.metadataThresholdsV2;

    if (metadata.album_title && !metadata.track_number) {
      flags.push('ALBUM_WITHOUT_TRACK_NUMBER');
      suspicionScore += 0.03;
    }

    // --- Encoder / software tag scanning ---
    const fileMeta = options.fileMetadata || {};
    const encoderFields = [fileMeta.encoder, fileMeta.encoding_tool, fileMeta.software].filter(Boolean);

    let dawDetected = null;
    let aiEncoderDetected = null;

    for (const field of encoderFields) {
      if (!aiEncoderDetected) {
        for (const sig of AI_DETECTION_CONFIG.aiEncoderSignatures) {
          if (sig.pattern.test(field)) {
            aiEncoderDetected = { field, generator: sig.generator };
            break;
          }
        }
      }
      if (!dawDetected) {
        for (const daw of AI_DETECTION_CONFIG.knownDawEncoders) {
          if (daw.pattern.test(field)) {
            dawDetected = { field, daw: daw.daw };
            break;
          }
        }
      }
    }

    if (aiEncoderDetected) {
      flags.push('AI_ENCODER_SIGNATURE');
      details.encoder_match = aiEncoderDetected;
      suspicionScore += 0.20;
    } else if (dawDetected) {
      flags.push('DAW_ENCODER_DETECTED');
      details.daw_match = dawDetected;
      suspicionScore -= 0.10;
    }

    // --- Format combo: only informational, not scored independently ---
    // Standard DAW export formats (44.1kHz/32-bit, 44.1kHz/16-bit) overlap with
    // AI generators. Record the match for telemetry but don't add to score.
    const sampleRate = Number(fileMeta.sample_rate || metadata.sample_rate || 0);
    const bitDepth = Number(fileMeta.bits_per_raw_sample || fileMeta.bits_per_sample || metadata.bit_depth || 0);
    const sampleFmt = fileMeta.sample_fmt || '';
    if (sampleRate > 0 && (bitDepth > 0 || sampleFmt)) {
      for (const combo of AI_DETECTION_CONFIG.aiFormatCombos) {
        const rateMatch = combo.sample_rate === sampleRate;
        const bitsMatch = combo.bits === bitDepth;
        const fmtMatch = combo.sample_fmt && sampleFmt.includes(combo.sample_fmt);
        if (rateMatch && (bitsMatch || fmtMatch)) {
          details.format_combo_note = { sample_rate: sampleRate, bits: bitDepth, sample_fmt: sampleFmt, possible_generator: combo.generator };
          break;
        }
      }
    }

    // --- Album field: AI text scan + blank/generic detection ---
    const albumTitle = metadata.album_title || fileMeta.album || '';
    if (albumTitle) {
      const albumTextHit = scanTextForAIIndicators([albumTitle]);
      if (albumTextHit.tier) {
        flags.push('AI_ALBUM_TEXT');
        details.album_text_match = albumTextHit.matched;
        suspicionScore += albumTextHit.tier === 'strong' ? 0.12 : 0.06;
      }
      for (const pattern of AI_DETECTION_CONFIG.genericAlbumPatterns) {
        if (pattern.test(albumTitle.trim())) {
          flags.push('GENERIC_ALBUM_TITLE');
          details.album_title = albumTitle;
          suspicionScore += 0.04;
          break;
        }
      }
    } else if (!albumTitle && metadata.album_title === undefined) {
      flags.push('BLANK_ALBUM');
      suspicionScore += 0.01;
    }

    // --- Comment / description tag scanning ---
    const commentField = fileMeta.comment || metadata.comment || metadata.description || '';
    if (commentField) {
      const commentHit = scanTextForAIIndicators([commentField]);
      if (commentHit.tier) {
        flags.push('AI_COMMENT_TAG');
        details.comment_match = commentHit.matched;
        suspicionScore += commentHit.tier === 'strong' ? 0.35 : 0.15;
      }
    }

    // --- Creation date vs upload proximity ---
    const creationTime = fileMeta.creation_time || metadata.creation_time;
    if (creationTime) {
      const created = new Date(creationTime);
      const now = new Date();
      if (!isNaN(created.getTime())) {
        const gapSec = Math.abs(now.getTime() - created.getTime()) / 1000;
        if (gapSec < AI_DETECTION_CONFIG.creationUploadMaxGapSec) {
          flags.push('CREATION_UPLOAD_PROXIMITY');
          details.creation_upload_gap_sec = Math.round(gapSec);
          suspicionScore += 0.06;
        }
      }
    }

    const contributorFields = ['composers', 'writers', 'producers', 'lyricists'];
    const contributorCount = contributorFields.reduce((count, key) => {
      const value = metadata[key];
      if (Array.isArray(value)) return count + value.length;
      if (typeof value === 'string' && value.trim()) return count + 1;
      return count;
    }, 0);
    details.contributor_count = contributorCount;
    if (contributorCount < thresholds.contributorCountMin) {
      flags.push('LOW_CONTRIBUTOR_DISCLOSURE');
      suspicionScore += 0.01;
    }

    if (metadata.label && metadata.catalog_number) {
      const hasSyntheticCatalog = /^(AI|GEN|AUTO|TMP)[-_]/i.test(String(metadata.catalog_number));
      if (hasSyntheticCatalog) {
        flags.push('SYNTHETIC_LABEL_CATALOG_PATTERN');
        details.catalog_number = metadata.catalog_number;
        suspicionScore += 0.04;
      }
    }

    if (durationSeconds > 0 && durationSeconds <= thresholds.shortDurationSignatureSec) {
      flags.push('SHORT_DURATION_SIGNATURE');
      suspicionScore += 0.04;
    }
  }

  if (crossSignalV2Enabled && analysisResult) {
    const topGenre = analysisResult.genre?.[0]?.label || null;
    const vocalPresent = analysisResult.vocals?.present;
    if (topGenre && /ambient|classical|instrumental/i.test(topGenre) && vocalPresent === true) {
      flags.push('VOCAL_NATURALNESS_MISMATCH');
      details.genre_vocal_mismatch = { genre: topGenre, vocals_present: vocalPresent };
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
// SIGNAL 5: WATERMARK PRESENCE DETECTION
// ============================================================================

/**
 * Probe audio for the presence of embedded watermarks (from AI platforms
 * or ORBIT itself) and structured noise in the residual floor.
 *
 * Two sub-signals:
 * 1. SilentCipher extraction probe -- detects any neural watermark.
 *    An unknown watermark on a track claiming to be original human music
 *    is a strong AI indicator.
 * 2. Noise-floor autocorrelation (computed in Python forensics) -- detects
 *    spread-spectrum pseudo-random carriers even from watermark schemes
 *    SilentCipher doesn't know about.
 *
 * @param {string|Buffer} audioInput - Audio file path or buffer
 * @param {Object} options
 * @param {Object|null} options.forensicsResult - ai_forensics from audio analysis
 * @param {boolean} options.verbose
 * @returns {Promise<{watermarkScore: number, flags: string[], details: Object}>}
 */
async function checkWatermarkPresence(audioInput, options = {}) {
  const {
    forensicsResult = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;

  const flags = [];
  const details = {};
  let watermarkScore = 0;

  // Sub-signal 1: SilentCipher extraction probe
  if (process.env.ORBIT_SKIP_SILENTCIPHER === 'true') {
    details.silentcipher_available = false;
    details.silentcipher_error = 'skipped (ORBIT_SKIP_SILENTCIPHER)';
  } else {
    try {
      const extractResult = await silentcipher.extract(audioInput, { verbose: false });
      details.silentcipher_available = true;
      details.silentcipher_detected = extractResult.detected;
      details.silentcipher_confidence = extractResult.confidence || 0;

      if (extractResult.detected) {
        flags.push('UNKNOWN_WATERMARK_DETECTED');
        watermarkScore += 0.70;
        details.watermark_message = extractResult.message;

        if (verbose) {
          console.log('   Watermark probe: DETECTED unknown watermark');
        }
      }
    } catch (err) {
      details.silentcipher_available = false;
      details.silentcipher_error = err.message;
      if (verbose) {
        console.log(`   Watermark probe: SilentCipher unavailable (${err.message})`);
      }
    }
  }

  // Sub-signal 2: Noise-floor autocorrelation from Python forensics
  const noiseFloor = forensicsResult?.noise_floor_structure;
  if (noiseFloor && noiseFloor.available) {
    details.noise_floor_autocorr_peak = noiseFloor.residual_autocorr_peak;
    if (noiseFloor.has_structured_noise) {
      flags.push('STEGANOGRAPHIC_NOISE_FLOOR');
      watermarkScore += 0.40;
      if (verbose) {
        console.log(`   Noise floor: structured noise detected (peak=${noiseFloor.residual_autocorr_peak})`);
      }
    }
  }

  return {
    watermarkScore: Math.min(1, Math.round(watermarkScore * 1000) / 1000),
    flags,
    details,
  };
}

/**
 * Probe audio with SONICS SpecTTTra synthetic-song detector.
 *
 * @param {string|Buffer} audioInput - Audio input
 * @param {Object} options
 * @param {boolean} options.verbose
 * @returns {Promise<{sonicsScore: number|null, prediction: string|null, confidence: number, flags: string[], details: Object}>}
 */
async function checkSonicsDetection(audioInput, options = {}) {
  const {
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;

  const flags = [];
  if (process.env.ORBIT_SKIP_SONICS === 'true') {
    return {
      sonicsScore: null,
      prediction: null,
      confidence: 0,
      flags: ['SONICS_SKIPPED'],
      details: { available: false, reason: 'ORBIT_SKIP_SONICS' },
    };
  }

  try {
    const detection = await sonics.detect(audioInput, { verbose });
    const sonicsScore = detection.syntheticProbability;

    if (sonicsScore > 0.7) flags.push('SONICS_SYNTHETIC_DETECTED');
    if (sonicsScore > 0.9) flags.push('SONICS_HIGH_CONFIDENCE_SYNTHETIC');

    const details = {
      available: true,
      synthetic_probability: detection.syntheticProbability,
      real_probability: detection.realProbability,
      model_variant: detection.modelVariant,
      processing_time_ms: detection.processingTimeMs,
    };

    return {
      sonicsScore,
      prediction: detection.prediction,
      confidence: detection.confidence,
      flags,
      details,
    };
  } catch (error) {
    if (verbose) {
      console.log(`   SONICS probe unavailable: ${error.message}`);
    }
    return {
      sonicsScore: null,
      prediction: null,
      confidence: 0,
      flags: ['SONICS_UNAVAILABLE_FAIL_OPEN'],
      details: { available: false, error: error.message },
    };
  }
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
    catalogResult = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
    flags: flagOverrides = {},
  } = options;

  const featureFlags = resolveFeatureFlags(flagOverrides);
  const shouldComputeV2 = featureFlags.v2Enabled || featureFlags.shadowMode;
  const shouldComputeV3 = featureFlags.forensicsV3Enabled;
  const startTime = Date.now();

  // Auto-run audio analysis with forensics when v2/v3 is active and no analysis provided
  let analysisResult = options.analysisResult || null;
  if (!analysisResult && (shouldComputeV2 || shouldComputeV3)) {
    try {
      analysisResult = await audioAnalysis.analyze(audioInput, { aiForensics: true, maxLength: 120 });
      if (verbose) console.log('   Auto-ran audio analysis with forensics for v2');
    } catch (analysisErr) {
      if (verbose) console.log(`   ⚠️ Auto-analysis failed: ${analysisErr.message}`);
    }
  }

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
      sonics: null,
    },
    active_flags: featureFlags,
    processing_time_ms: 0,
  };

  function aggregateScores(signalScores, weightingConfig, floorInputs = null, thresholdConfig = thresholds) {
    const catalogInformative = signalScores.catalog > 0 ||
      signalScores.catalogFlags?.includes('KNOWN_WORK_METADATA_MISMATCH');
    const knnInformative = typeof signalScores.knn === 'number';
    const watermarkInformative = typeof signalScores.watermark === 'number';
    const sonicsInformative = typeof signalScores.sonics === 'number';

    let wSemantic = weightingConfig.semantic || 0;
    let wAnomaly = weightingConfig.anomaly || 0;
    let wMetadata = weightingConfig.metadata || 0;
    let wCatalog = weightingConfig.catalog || 0;
    let wKnn = weightingConfig.knn || 0;
    let wWatermark = weightingConfig.watermark || 0;
    let wSonics = weightingConfig.sonics || 0;

    if (!catalogInformative) wCatalog = 0;
    if (!knnInformative) wKnn = 0;
    if (!watermarkInformative) wWatermark = 0;
    if (!sonicsInformative) wSonics = 0;

    const sum = wSemantic + wAnomaly + wMetadata + wCatalog + wKnn + wWatermark + wSonics;
    if (sum > 0) {
      wSemantic /= sum;
      wAnomaly /= sum;
      wMetadata /= sum;
      wCatalog /= sum;
      wKnn /= sum;
      wWatermark /= sum;
      wSonics /= sum;
    }

    const weighted =
      (signalScores.semantic * wSemantic) +
      (signalScores.anomaly * wAnomaly) +
      (signalScores.metadata * wMetadata) +
      (signalScores.catalog * wCatalog) +
      ((signalScores.knn || 0) * wKnn) +
      ((signalScores.watermark || 0) * wWatermark) +
      ((signalScores.sonics || 0) * wSonics);

    let scoreFloor = 0;
    if (floorInputs) {
      const metaFlags = floorInputs.metaFlags || [];
      const anomalyFlags = floorInputs.anomalyFlags || [];
      const forensicHits = anomalyFlags.filter(f =>
        ['FREQ_CUTOFF_16K', 'LOW_PHASE_ENTROPY', 'SPECTRAL_SMEARING', 'METRONOMIC_TIMING',
         'LOW_CREST_FACTOR', 'LOW_SPECTRAL_CENTROID_VARIANCE', 'LOW_SPECTRAL_BANDWIDTH_VARIANCE',
         'LOW_SPECTRAL_FLUX_VARIANCE', 'LOW_ZCR_VARIANCE', 'LOW_MFCC_VARIANCE',
         'LOW_CHROMA_ENTROPY', 'FLAT_ENERGY_ARC', 'LOW_SUBBAND_ENTROPY',
         'HF_HARMONIC_ANOMALY', 'HIGH_TEMPO_STABILITY', 'HIGH_LOOP_REPETITION',
         'PRE_ECHO_DETECTED', 'HF_PHASE_INCOHERENCE', 'MS_PHASE_ANOMALY', 'PERFECT_VIBRATO'].includes(f));

      const watermarkFlags = floorInputs.watermarkFlags || [];
      const sonicsFlags = floorInputs.sonicsFlags || [];

      // Definitive: file metadata literally declares AI origin
      if (metaFlags.includes('AI_COMMENT_TAG') || metaFlags.includes('AI_SELF_DECLARED') || metaFlags.includes('AI_ENCODER_SIGNATURE')) {
        scoreFloor = 0.90;
      } else if (sonicsFlags.includes('SONICS_HIGH_CONFIDENCE_SYNTHETIC')) {
        scoreFloor = 0.75;
      } else if (watermarkFlags.includes('UNKNOWN_WATERMARK_DETECTED')) {
        scoreFloor = 0.65;
      } else if (metaFlags.includes('AI_TEXT_INDICATOR') && forensicHits.length >= 2) {
        scoreFloor = 0.65;
      } else if (metaFlags.includes('AI_TEXT_INDICATOR')) {
        scoreFloor = 0.55;
      } else if (forensicHits.length >= 4) {
        scoreFloor = 0.50;
      }
    }

    const finalScore = Math.max(weighted, scoreFloor);
    const roundedScore = Math.round(finalScore * 1000) / 1000;
    let recommendation = 'LIKELY_HUMAN';
    if (roundedScore >= thresholdConfig.likelyAI) {
      recommendation = 'LIKELY_AI';
    } else if (roundedScore >= thresholdConfig.review) {
      recommendation = 'REVIEW';
    }

    return {
      score: roundedScore,
      recommendation,
      weights_used: {
        semantic: wSemantic,
        anomaly: wAnomaly,
        metadata: wMetadata,
        catalog: wCatalog,
        knn: wKnn,
        watermark: wWatermark,
        sonics: wSonics,
      },
      score_floor_applied: scoreFloor > weighted ? scoreFloor : null,
    };
  }

  try {
    // Signal 1: Semantic CLAP probe (legacy baseline)
    let semanticScore = 0;
    try {
      const semanticResult = await probeAIGenerated(audioInput, { verbose, useV2Prompts: false });
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
      const anomalyResult = checkAudioAnomalies(analysisResult, { v2Enabled: false });
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
    const metadataPatterns = checkMetadataPatterns(metadata, duration, {
      metadataV2Enabled: false,
      crossSignalV2Enabled: false,
      analysisResult,
    });
    result.signals.metadata = metadataPatterns;
    const metadataScore = metadataPatterns.suspicionScore;
    
    // Signal 4: Catalog provenance mismatch
    let catalogScore = 0;
    const catalogSignal = checkCatalogProvenance(catalogResult);
    result.signals.catalog = catalogSignal;
    catalogScore = catalogSignal.provenanceScore;
    
    const legacyAggregate = aggregateScores(
      {
        semantic: semanticScore,
        anomaly: anomalyScore,
        metadata: metadataScore,
        catalog: catalogScore,
        catalogFlags: catalogSignal.flags || [],
      },
      weights,
      {
        metaFlags: metadataPatterns.flags,
        anomalyFlags: result.signals.anomalies?.flags || [],
      },
      thresholds
    );

    result.legacy = {
      score: legacyAggregate.score,
      recommendation: legacyAggregate.recommendation,
      weights_used: legacyAggregate.weights_used,
      score_floor_applied: legacyAggregate.score_floor_applied,
      signals: result.signals,
    };

    let v2Result = null;
    if (shouldComputeV2) {
      const semanticV2 = await probeAIGenerated(audioInput, {
        verbose: false,
        useV2Prompts: featureFlags.promptsV2Enabled,
      }).catch((error) => ({ aiScore: 0, error: error.message, flags: ['SEMANTIC_V2_ERROR'] }));

      const anomalyV2 = analysisResult
        ? checkAudioAnomalies(analysisResult, { v2Enabled: true })
        : { anomalyScore: 0, flags: ['NO_ANALYSIS_PROVIDED'], details: {} };

      let fileMetadata = {};
      if (featureFlags.metadataV2Enabled) {
        try {
          fileMetadata = await audioAnalysis.extractFileMetadata(audioInput);
        } catch (fmErr) {
          fileMetadata = { available: false, reason: 'extraction_error', error: fmErr.message };
        }
      }

      const metadataV2 = checkMetadataPatterns(metadata, duration, {
        metadataV2Enabled: featureFlags.metadataV2Enabled,
        crossSignalV2Enabled: featureFlags.crossSignalV2Enabled,
        analysisResult,
        fileMetadata: fileMetadata.available ? fileMetadata : {},
      });

      let adjustedAnomalyV2Score = anomalyV2.anomalyScore || 0;
      if (featureFlags.crossSignalV2Enabled) {
        const topGenre = analysisResult?.genre?.[0]?.label || null;
        const anomalyFlags = anomalyV2.flags || [];
        if (topGenre && /classical|jazz|acoustic/i.test(topGenre) && anomalyFlags.includes('METRONOMIC_TIMING')) {
          adjustedAnomalyV2Score = Math.min(1, adjustedAnomalyV2Score + 0.06);
        }
        if (topGenre && /edm|electronic|techno/i.test(topGenre) && anomalyFlags.includes('METRONOMIC_TIMING')) {
          adjustedAnomalyV2Score = Math.max(0, adjustedAnomalyV2Score - 0.04);
        }
      }

      let knnSignal = { available: false, status: 'disabled' };
      if (featureFlags.knnEnabled) {
        try {
          knnSignal = await aiKnn.classifyWithReferences(audioInput);
        } catch (knnError) {
          knnSignal = {
            available: false,
            status: 'unavailable',
            reason: 'knn_error',
            details: { error: knnError.message },
          };
        }
      }

      const sonicsV2 = await checkSonicsDetection(audioInput, { verbose: false });

      const v2Aggregate = aggregateScores(
        {
          semantic: semanticV2.aiScore || 0,
          anomaly: adjustedAnomalyV2Score,
          metadata: metadataV2.suspicionScore || 0,
          catalog: catalogScore,
          sonics: typeof sonicsV2.sonicsScore === 'number' ? sonicsV2.sonicsScore : null,
          knn: knnSignal.available ? knnSignal.aiLikelihood : null,
          catalogFlags: catalogSignal.flags || [],
        },
        AI_DETECTION_CONFIG.weightsV2,
        {
          metaFlags: metadataV2.flags || [],
          anomalyFlags: anomalyV2.flags || [],
          sonicsFlags: sonicsV2.flags || [],
        },
        AI_DETECTION_CONFIG.thresholdsV2
      );

      v2Result = {
        score: v2Aggregate.score,
        recommendation: v2Aggregate.recommendation,
        weights_used: v2Aggregate.weights_used,
        score_floor_applied: v2Aggregate.score_floor_applied,
        signals: {
          semantic: semanticV2,
          anomalies: anomalyV2,
          metadata: metadataV2,
          catalog: catalogSignal,
          sonics: sonicsV2,
          knn: knnSignal,
        },
      };

      if (knnSignal.available && knnSignal.distanceMargin > 0.06) {
        v2Result.signals.knn.flags = ['KNN_AI_REFERENCE_CLOSER'];
      } else if (knnSignal.available && knnSignal.distanceMargin < -0.06) {
        v2Result.signals.knn.flags = ['KNN_HUMAN_REFERENCE_CLOSER'];
      } else if (!knnSignal.available && featureFlags.knnEnabled) {
        v2Result.signals.knn.flags = ['KNN_UNAVAILABLE_FAIL_OPEN'];
      }
    }

    // ----- V3 Forensics Path -----
    let v3Result = null;
    if (shouldComputeV3) {
      const anomalyV3 = analysisResult
        ? checkAudioAnomalies(analysisResult, { v2Enabled: true, forensicsV3Enabled: true })
        : { anomalyScore: 0, flags: ['NO_ANALYSIS_PROVIDED'], details: {} };

      const watermarkSignal = { watermarkScore: 0, flags: [], details: { skipped: 'not_in_ai_detection_pipeline' } };

      const sonicsV3 = v2Result?.signals?.sonics || await checkSonicsDetection(audioInput, { verbose: false });

      const semanticV3 = v2Result
        ? v2Result.signals.semantic
        : await probeAIGenerated(audioInput, {
            verbose: false,
            useV2Prompts: featureFlags.promptsV2Enabled,
          }).catch((error) => ({ aiScore: 0, error: error.message, flags: ['SEMANTIC_V3_ERROR'] }));

      const metadataV3 = v2Result
        ? v2Result.signals.metadata
        : checkMetadataPatterns(metadata, duration, {
            metadataV2Enabled: featureFlags.metadataV2Enabled,
            crossSignalV2Enabled: featureFlags.crossSignalV2Enabled,
            analysisResult,
          });

      const knnV3 = v2Result?.signals?.knn || { available: false, status: 'disabled' };

      const v3Aggregate = aggregateScores(
        {
          semantic: semanticV3.aiScore || 0,
          anomaly: anomalyV3.anomalyScore || 0,
          metadata: metadataV3.suspicionScore || 0,
          catalog: catalogScore,
          knn: knnV3.available ? knnV3.aiLikelihood : null,
          watermark: watermarkSignal.watermarkScore,
          sonics: typeof sonicsV3.sonicsScore === 'number' ? sonicsV3.sonicsScore : null,
          catalogFlags: catalogSignal.flags || [],
        },
        AI_DETECTION_CONFIG.weightsV3,
        {
          metaFlags: metadataV3.flags || [],
          anomalyFlags: anomalyV3.flags || [],
          watermarkFlags: watermarkSignal.flags || [],
          sonicsFlags: sonicsV3.flags || [],
        },
        AI_DETECTION_CONFIG.thresholdsV3
      );

      v3Result = {
        score: v3Aggregate.score,
        recommendation: v3Aggregate.recommendation,
        weights_used: v3Aggregate.weights_used,
        score_floor_applied: v3Aggregate.score_floor_applied,
        signals: {
          semantic: semanticV3,
          anomalies: anomalyV3,
          metadata: metadataV3,
          catalog: catalogSignal,
          knn: knnV3,
          watermark: watermarkSignal,
          sonics: sonicsV3,
        },
      };
    }

    const activeModel = shouldComputeV3 ? 'v3' : (featureFlags.v2Enabled ? 'v2' : 'legacy');
    if (shouldComputeV3 && v3Result) {
      result.score = v3Result.score;
      result.recommendation = v3Result.recommendation;
      result.signals = v3Result.signals;
      result.weights_used = v3Result.weights_used;
      if (v3Result.score_floor_applied !== null) result.score_floor_applied = v3Result.score_floor_applied;
    } else if (featureFlags.v2Enabled && v2Result) {
      result.score = v2Result.score;
      result.recommendation = v2Result.recommendation;
      result.signals = v2Result.signals;
      result.weights_used = v2Result.weights_used;
      if (v2Result.score_floor_applied !== null) result.score_floor_applied = v2Result.score_floor_applied;
    } else {
      result.score = legacyAggregate.score;
      result.recommendation = legacyAggregate.recommendation;
      result.weights_used = legacyAggregate.weights_used;
      if (legacyAggregate.score_floor_applied !== null) result.score_floor_applied = legacyAggregate.score_floor_applied;
    }

    if (featureFlags.shadowMode && !featureFlags.v2Enabled && v2Result) {
      result.shadow = {
        legacy: {
          score: legacyAggregate.score,
          recommendation: legacyAggregate.recommendation,
        },
        v2: {
          score: v2Result.score,
          recommendation: v2Result.recommendation,
        },
      };
      result.v2 = v2Result;
    } else if (v2Result) {
      result.v2 = v2Result;
    }

    if (v3Result) {
      result.v3 = v3Result;
    }

    result.telemetry = {
      mode: activeModel,
      active_flags: featureFlags,
      legacy: {
        score: legacyAggregate.score,
        recommendation: legacyAggregate.recommendation,
        weights_used: legacyAggregate.weights_used,
      },
      v2: v2Result
        ? {
          score: v2Result.score,
          recommendation: v2Result.recommendation,
          weights_used: v2Result.weights_used,
          sonics: v2Result.signals?.sonics || null,
        }
        : null,
      v3: v3Result
        ? {
          score: v3Result.score,
          recommendation: v3Result.recommendation,
          weights_used: v3Result.weights_used,
          sonics: v3Result.signals?.sonics || null,
        }
        : null,
      per_signal_contributions: {
        legacy: {
          semantic: Math.round(semanticScore * legacyAggregate.weights_used.semantic * 1000) / 1000,
          anomaly: Math.round(anomalyScore * legacyAggregate.weights_used.anomaly * 1000) / 1000,
          metadata: Math.round(metadataScore * legacyAggregate.weights_used.metadata * 1000) / 1000,
          catalog: Math.round(catalogScore * legacyAggregate.weights_used.catalog * 1000) / 1000,
        },
        v2: v2Result
          ? {
            semantic: Math.round((v2Result.signals.semantic?.aiScore || 0) * v2Result.weights_used.semantic * 1000) / 1000,
            anomaly: Math.round((v2Result.signals.anomalies?.anomalyScore || 0) * v2Result.weights_used.anomaly * 1000) / 1000,
            metadata: Math.round((v2Result.signals.metadata?.suspicionScore || 0) * v2Result.weights_used.metadata * 1000) / 1000,
            catalog: Math.round((v2Result.signals.catalog?.provenanceScore || 0) * v2Result.weights_used.catalog * 1000) / 1000,
            sonics: Math.round(((v2Result.signals.sonics?.sonicsScore || 0) * (v2Result.weights_used.sonics || 0)) * 1000) / 1000,
            knn: Math.round(((v2Result.signals.knn?.aiLikelihood || 0) * v2Result.weights_used.knn) * 1000) / 1000,
          }
          : null,
        v3: v3Result
          ? {
            semantic: Math.round((v3Result.signals.semantic?.aiScore || 0) * v3Result.weights_used.semantic * 1000) / 1000,
            anomaly: Math.round((v3Result.signals.anomalies?.anomalyScore || 0) * v3Result.weights_used.anomaly * 1000) / 1000,
            metadata: Math.round((v3Result.signals.metadata?.suspicionScore || 0) * v3Result.weights_used.metadata * 1000) / 1000,
            catalog: Math.round((v3Result.signals.catalog?.provenanceScore || 0) * v3Result.weights_used.catalog * 1000) / 1000,
            knn: Math.round(((v3Result.signals.knn?.aiLikelihood || 0) * (v3Result.weights_used.knn || 0)) * 1000) / 1000,
            watermark: Math.round(((v3Result.signals.watermark?.watermarkScore || 0) * (v3Result.weights_used.watermark || 0)) * 1000) / 1000,
            sonics: Math.round(((v3Result.signals.sonics?.sonicsScore || 0) * (v3Result.weights_used.sonics || 0)) * 1000) / 1000,
          }
          : null,
      },
    };
    
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
      telemetry: detectionResult.telemetry || null,
      active_flags: detectionResult.active_flags || null,
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
  
  if (detectionResult.signals?.semantic?.flags) {
    flags.push(...detectionResult.signals.semantic.flags);
  }
  if (detectionResult.signals?.anomalies?.flags) {
    flags.push(...detectionResult.signals.anomalies.flags);
  }
  if (detectionResult.signals?.metadata?.flags) {
    flags.push(...detectionResult.signals.metadata.flags);
  }
  if (detectionResult.signals?.catalog?.flags) {
    flags.push(...detectionResult.signals.catalog.flags);
  }
  if (detectionResult.signals?.knn?.flags) {
    flags.push(...detectionResult.signals.knn.flags);
  }
  if (detectionResult.signals?.sonics?.flags) {
    flags.push(...detectionResult.signals.sonics.flags);
  }
  if (detectionResult.signals?.watermark?.flags) {
    flags.push(...detectionResult.signals.watermark.flags);
  }
  if (detectionResult.v2?.signals?.knn?.flags) {
    flags.push(...detectionResult.v2.signals.knn.flags);
  }
  if (detectionResult.v2?.signals?.sonics?.flags) {
    flags.push(...detectionResult.v2.signals.sonics.flags);
  }
  if (detectionResult.v3?.signals?.knn?.flags) {
    flags.push(...detectionResult.v3.signals.knn.flags);
  }
  if (detectionResult.v3?.signals?.sonics?.flags) {
    flags.push(...detectionResult.v3.signals.sonics.flags);
  }
  if (detectionResult.v3?.signals?.watermark?.flags) {
    flags.push(...detectionResult.v3.signals.watermark.flags);
  }
  
  return [...new Set(flags)];
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
  checkWatermarkPresence,
  checkSonicsDetection,
  scanTextForAIIndicators,
  
  // Utility functions
  shouldReview,
  formatForDatabase,
  getAllFlags,
  
  // Configuration (for testing/tuning)
  config: AI_DETECTION_CONFIG,
  prompts: AI_DETECTION_PROMPTS_V1,
  promptsV2: AI_DETECTION_PROMPTS_V2,
  resolveFeatureFlags,
};

