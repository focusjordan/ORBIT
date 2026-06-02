/**
 * ORBIT Metadata Extractor
 * 
 * Unified AI metadata extraction pipeline
 * 
 * This module combines all ML/signal analysis capabilities into a single
 * extraction pipeline that auto-populates the `ai_metadata` field during
 * registration.
 * 
 * Components Integrated:
 * - CLAP (clap.js): Mood, vocals, and fallback genre/instrument detection
 * - PANNs (panns.js): Primary instruments + 2048-dim embeddings
 * - wav2vec2 genre classifier (genre-classifier.js): Primary genre detection
 * - Audio Analysis (audio-analysis.js): BPM, key, energy, loudness
 * 
 * Output follows ORBIT_ENHANCEMENTS.md Section 5 (Enhanced Verification Response)
 * 
 * @see ORBIT_SPECIFICATION.md Section 12 (Zero-Shot ML Enhancements)
 * @see ORBIT_ENHANCEMENTS.md Section 3 (Zero-Shot Metadata Auto-Extraction)
 */

const path = require('path');
const fs = require('fs');

// Import ML modules
const clap = require('./clap');
const panns = require('./panns');
const genreClassifier = require('./genre-classifier');
// MERT DISABLED - CC BY-NC 4.0 license incompatible with commercial use
// const mert = require('./mert');
const audioAnalysis = require('./audio-analysis');
const demucs = require('./demucs');

/**
 * Metadata Extractor Configuration
 */
const EXTRACTOR_CONFIG = {
  // Enable/disable individual extractors
  enableClap: true,
  enablePanns: true,
  enableGenreClassifier: true,
  enablePannsEmbedding: true, // PANNs 2048-dim embeddings
  enableEmbedding: true, // Backward-compatible alias (mapped to enablePannsEmbedding)
  enableAudioAnalysis: true,
  enableDemucs: false,
  stemsDir: null,
  
  // CLAP configuration
  clapGenreTopK: 3,
  clapMoodTopK: 3,
  clapInstrumentThreshold: 0.15,

  // PANNs / genre classifier configuration
  pannsTopK: 20,
  genreTopK: 3,
  
  // Audio analysis configuration
  audioAnalysisMaxLength: 120,
  aiForensics: false,
  
  // Embedding configuration (PANNs 2048-dim)
  embeddingMaxLength: 30,
  
  // Whether to fail on partial extraction errors
  failOnError: false,
};

/**
 * Extract all AI metadata from an audio file
 * 
 * This is the main entry point that combines all extractors:
 * - wav2vec2 genre: primary genre detection
 * - PANNs: primary instrument tags + optional 2048-dim embedding
 * - CLAP: mood, vocals, and fallback genre/instrument detection
 * - Audio Analysis: BPM, key, energy, loudness, danceability
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {boolean} options.includeEmbedding - Include audio embedding in response (default: false)
 * @param {boolean} options.verbose - Log progress (default: false)
 * @param {Object} options.config - Override default configuration
 * @returns {Promise<Object>} Complete AI metadata object
 * 
 * @example
 * const metadata = await extractMetadata('/path/to/audio.mp3');
 * // {
 * //   genre: [{ label: 'electronic', confidence: 0.89 }, ...],
 * //   mood: [{ label: 'energetic', confidence: 0.82 }, ...],
 * //   instruments: [{ label: 'synthesizer', confidence: 0.94 }, ...],
 * //   vocals: { present: true, confidence: 0.92, gender: 'female', ... },
 * //   bpm: { value: 120, confidence: 0.95 },
 * //   key: { value: 'A minor', confidence: 0.88 },
 * //   energy: 0.78,
 * //   loudness_db: -14.2,
 * //   danceability: 0.85,
 * //   duration: 180.5,
 * //   processingTimeMs: 12500,
 * //   extractionStatus: { clap: 'success', audioAnalysis: 'success', embedding: 'success' }
 * // }
 */
async function extractMetadata(input, options = {}) {
  const {
    includeEmbedding = false,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
    config = {},
  } = options;
  
  // Merge configuration
  const cfg = { ...EXTRACTOR_CONFIG, ...config };
  // Backward compatibility: enableEmbedding drives PANNs embedding toggle.
  cfg.enablePannsEmbedding = cfg.enablePannsEmbedding && cfg.enableEmbedding;
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log('[MetadataExtractor] Starting full extraction...');
  }
  
  // Track extraction status for each component
  const extractionStatus = {
    clap: 'pending',
    audioAnalysis: 'pending',
    demucs: 'pending',
    panns: 'pending',
    genreClassifier: 'pending',
    embedding: 'pending',
  };
  
  // Results container
  const result = {
    genre: null,
    mood: null,
    instruments: null,
    vocals: null,
    bpm: null,
    key: null,
    energy: null,
    loudness_db: null,
    dynamic_range_db: null,
    danceability: null,
    duration: null,
    sample_rate: null,
    key_detection_source: null,
    panns_tags: null,
    genre_corroboration: null,
  };
  
  // Optional embedding storage (PANNs - 2048 dim)
  let audioEmbedding = null;
  let shouldUseClapGenreFallback = true;
  let shouldUseClapInstrumentFallback = true;
  let pannsVocalTags = [];
  let stemsDir = cfg.stemsDir || null;
  let demucsResult = null;
  let shouldCleanupDemucs = false;
  
  // ==========================================
  // Genre Classifier Extraction (wav2vec2)
  // ==========================================
  if (cfg.enableGenreClassifier) {
    try {
      if (verbose) {
        console.log('   -> GenreClassifier: Classifying top genres...');
      }
      
      result.genre = await genreClassifier.classify(input, {
        topK: cfg.genreTopK,
        verbose: false,
      });
      
      extractionStatus.genreClassifier = 'success';
      shouldUseClapGenreFallback = !result.genre || result.genre.length === 0;
      
    } catch (error) {
      extractionStatus.genreClassifier = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   [FAIL] GenreClassifier: Failed - ${error.message}`);
      }
    }
  } else {
    extractionStatus.genreClassifier = 'disabled';
  }
  
  // ==========================================
  // PANNs Extraction (music tags, instruments)
  // ==========================================
  if (cfg.enablePanns) {
    try {
      if (verbose) {
        console.log('   -> PANNs: Extracting music tags...');
      }
      
      const tags = await panns.tag(input, {
        topK: cfg.pannsTopK,
        verbose: false,
      });

      const fullPannsTags = tags.map((tag) => ({
        label: tag.label,
        confidence: tag.confidence,
      }));
      result.panns_tags = fullPannsTags;

      const instrumentTags = filterPannsInstrumentTags(fullPannsTags);
      if (instrumentTags.length > 0) {
        result.instruments = instrumentTags;
        shouldUseClapInstrumentFallback = false;
      }

      pannsVocalTags = filterPannsVocalTags(fullPannsTags);
      const genreTags = filterPannsGenreTags(fullPannsTags);
      if (genreTags.length > 0) {
        result.genre_corroboration = genreTags.slice(0, 5);
      }
      
      extractionStatus.panns = 'success';
      
      if (verbose) {
        console.log(`   [OK] PANNs: Complete (${tags.length} tags, ${instrumentTags.length} instruments)`);
      }
      
    } catch (error) {
      extractionStatus.panns = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   [FAIL] PANNs: Failed - ${error.message}`);
      }
    }
  } else {
    extractionStatus.panns = 'disabled';
  }
  
  // ==========================================
  // CLAP Extraction (mood, vocals + fallback genre/instruments)
  // ==========================================
  if (cfg.enableClap) {
    try {
      if (verbose) {
        console.log('   -> CLAP: Extracting mood/vocals (+ fallbacks)...');
      }
      
      result.mood = await clap.classifyMood(input, {
        topK: cfg.clapMoodTopK,
        verbose: false,
      });
      
      result.vocals = await clap.detectVocals(input, {
        verbose: false,
      });

      if (result.vocals && !result.vocals.present && pannsVocalTags.length > 0) {
        const topVocal = pannsVocalTags[0];
        if (topVocal.confidence >= 0.25) {
          result.vocals.present = true;
          result.vocals.confidence = topVocal.confidence;
          result.vocals.source = 'panns_boost';
          result.vocals.panns_tag = topVocal.label;
        }
      }
      
      if (shouldUseClapGenreFallback) {
        result.genre = await clap.classifyGenre(input, {
          topK: cfg.clapGenreTopK,
          verbose: false,
        });
      }
      
      if (shouldUseClapInstrumentFallback) {
        result.instruments = await clap.detectInstruments(input, {
          threshold: cfg.clapInstrumentThreshold,
          verbose: false,
        });
      }
      
      extractionStatus.clap = 'success';
      
      if (verbose) {
        const fallbackInfo = [
          shouldUseClapGenreFallback ? 'genre fallback used' : 'genre from wav2vec2',
          shouldUseClapInstrumentFallback ? 'instruments fallback used' : 'instruments from PANNs',
        ].join(', ');
        console.log(`   [OK] CLAP: Complete (${fallbackInfo})`);
      }
      
    } catch (error) {
      extractionStatus.clap = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   [FAIL] CLAP: Failed - ${error.message}`);
      }
      
      if (cfg.failOnError) {
        throw error;
      }
    }
  } else {
    extractionStatus.clap = 'disabled';
  }
  
  // ==========================================
  // Demucs Separation (optional, for stem-aware analysis)
  // ==========================================
  if (cfg.enableAudioAnalysis) {
    if (stemsDir) {
      extractionStatus.demucs = fs.existsSync(stemsDir)
        ? 'success'
        : `error: stemsDir not found (${stemsDir})`;
      if (!fs.existsSync(stemsDir)) {
        stemsDir = null;
      }
    } else if (cfg.enableDemucs) {
      try {
        if (verbose) {
          console.log('   -> Demucs: Separating stems for stem-aware analysis...');
        }
        demucsResult = await demucs.separate(input, { verbose: false });
        stemsDir = demucsResult.outputDir;
        shouldCleanupDemucs = true;
        extractionStatus.demucs = 'success';
      } catch (error) {
        extractionStatus.demucs = `error: ${error.message}`;
        if (verbose) {
          console.log(`   [FAIL] Demucs: Failed - ${error.message}`);
        }
      }
    } else {
      extractionStatus.demucs = 'disabled';
    }
  } else {
    extractionStatus.demucs = 'disabled';
  }

  // ==========================================
  // Audio Analysis (BPM, key, energy, loudness)
  // ==========================================
  if (cfg.enableAudioAnalysis) {
    try {
      if (verbose) {
        console.log('   -> AudioAnalysis: Extracting BPM, key, energy...');
      }
      
      const analysisResult = await audioAnalysis.analyze(input, {
        maxLength: cfg.audioAnalysisMaxLength,
        stemsDir,
        aiForensics: cfg.aiForensics,
        verbose,
      });
      
      result.bpm = analysisResult.bpm;
      result.key = analysisResult.key;
      result.energy = analysisResult.energy;
      result.loudness_db = analysisResult.loudness_db;
      result.dynamic_range_db = analysisResult.dynamic_range_db;
      result.duration = analysisResult.duration;
      result.sample_rate = analysisResult.sample_rate;
      result.key_detection_source = analysisResult.key_detection_source;
      
      // Propagate AI forensic data if available
      if (analysisResult.ai_forensics) {
        result.ai_forensics = analysisResult.ai_forensics;
      }
      if (verbose) {
        const forensicKeys = Object.keys(analysisResult.ai_forensics || {});
        console.log(
          `   AudioAnalysis forensics payload: present=${Boolean(analysisResult.ai_forensics)} keys=${forensicKeys.length ? forensicKeys.join(',') : 'none'}`
        );
      }
      
      // Calculate danceability from BPM and energy
      result.danceability = audioAnalysis.calculateDanceability(analysisResult);
      
      extractionStatus.audioAnalysis = 'success';
      
      if (verbose) {
        console.log(`   [OK] AudioAnalysis: Complete (${analysisResult.processingTimeMs}ms)`);
      }
      
    } catch (error) {
      extractionStatus.audioAnalysis = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   [FAIL] AudioAnalysis: Failed - ${error.message}`);
      }
      
      if (cfg.failOnError) {
        throw error;
      }
    } finally {
      if (shouldCleanupDemucs && demucsResult && demucsResult.outputDir) {
        demucs.cleanup(demucsResult.outputDir);
      }
    }
  } else {
    extractionStatus.audioAnalysis = 'disabled';
  }
  
  // ==========================================
  // Audio Embedding (PANNs - MIT, 2048-dim)
  // NOTE: DB pgvector column must be migrated from 512 -> 2048 dims.
  // Do not change schema here; migration handled separately.
  // ==========================================
  if (cfg.enablePannsEmbedding && cfg.enablePanns) {
    try {
      if (verbose) {
        console.log('   -> PANNs: Generating audio embedding...');
      }
      
      const embeddingResult = await panns.getEmbedding(input, {
        verbose: false,
      });
      
      audioEmbedding = embeddingResult;
      
      extractionStatus.embedding = 'success';
      
      if (verbose) {
        console.log(`   [OK] PANNs Embedding: Complete (${audioEmbedding.length}-dim)`);
      }
      
    } catch (error) {
      extractionStatus.embedding = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   [FAIL] PANNs Embedding: Failed - ${error.message}`);
      }
      
      if (cfg.failOnError) {
        throw error;
      }
    }
  } else {
    extractionStatus.embedding = 'disabled';
  }
  
  // ==========================================
  // Finalize Result
  // ==========================================
  const totalTime = Date.now() - startTime;
  
  result.processingTimeMs = totalTime;
  result.extractionStatus = extractionStatus;
  
  // Include embedding if requested
  if (includeEmbedding && audioEmbedding) {
    result.embedding = audioEmbedding;
    result.embeddingDim = audioEmbedding.length;
  }
  
  if (verbose) {
    console.log(`[MetadataExtractor] Complete in ${(totalTime / 1000).toFixed(1)}s`);
    console.log(
      `   Status: CLAP=${extractionStatus.clap}, PANNs=${extractionStatus.panns}, `
      + `GenreClassifier=${extractionStatus.genreClassifier}, `
      + `Demucs=${extractionStatus.demucs}, `
      + `AudioAnalysis=${extractionStatus.audioAnalysis}, Embedding=${extractionStatus.embedding}`
    );
  }
  
  return result;
}

/**
 * Extract metadata with only CLAP (faster, no signal analysis)
 * 
 * Useful when you only need genre/mood/instruments classification
 * without BPM/key detection.
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<Object>} CLAP-only metadata
 */
async function extractClapOnly(input, options = {}) {
  return extractMetadata(input, {
    ...options,
    config: {
      enableClap: true,
      enableEmbedding: false,
      enablePannsEmbedding: false,
      enablePanns: false,
      enableGenreClassifier: false,
      enableAudioAnalysis: false,
    },
  });
}

/**
 * Extract metadata with only audio analysis (fastest, no ML)
 * 
 * Useful for quick BPM/key detection without ML overhead.
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<Object>} Audio analysis only metadata
 */
async function extractAudioAnalysisOnly(input, options = {}) {
  return extractMetadata(input, {
    ...options,
    config: {
      enableClap: false,
      enableEmbedding: false,
      enablePannsEmbedding: false,
      enablePanns: false,
      enableGenreClassifier: false,
      enableAudioAnalysis: true,
    },
  });
}

/**
 * Check if all required dependencies are available
 * 
 * @returns {Promise<Object>} Status of each extraction component
 */
async function checkEnvironment() {
  const status = {
    clap: { available: false, message: '' },
    audioAnalysis: { available: false, message: '' },
    panns: { available: false, message: '' },
    genreClassifier: { available: false, message: '' },
    overall: { available: false, message: '' },
  };
  
  // Check CLAP (requires @xenova/transformers)
  try {
    status.clap = {
      available: true,
      message: 'CLAP module loaded (classification + embeddings)',
    };
  } catch (error) {
    status.clap = {
      available: false,
      message: `CLAP error: ${error.message}`,
    };
  }
  
  // Check Audio Analysis (requires Python + librosa)
  try {
    const analysisStatus = await audioAnalysis.checkPythonEnvironment();
    status.audioAnalysis = {
      available: analysisStatus.available,
      message: analysisStatus.message,
      details: analysisStatus.details,
    };
  } catch (error) {
    status.audioAnalysis = {
      available: false,
      message: `AudioAnalysis error: ${error.message}`,
    };
  }
  
  // Check PANNs
  try {
    const pannsStatus = await panns.checkEnvironment();
    status.panns = {
      available: !!pannsStatus.available,
      message: pannsStatus.message || 'PANNs check completed',
      details: pannsStatus.details,
    };
  } catch (error) {
    status.panns = {
      available: false,
      message: `PANNs error: ${error.message}`,
    };
  }
  
  // Check wav2vec2 genre classifier
  try {
    const genreStatus = await genreClassifier.checkEnvironment();
    status.genreClassifier = {
      available: !!genreStatus.available,
      message: genreStatus.message || 'Genre classifier check completed',
      details: genreStatus.details,
    };
  } catch (error) {
    status.genreClassifier = {
      available: false,
      message: `GenreClassifier error: ${error.message}`,
    };
  }
  
  // Overall status
  const availabilityFlags = [
    status.clap.available,
    status.audioAnalysis.available,
    status.panns.available,
    status.genreClassifier.available,
  ];
  const allAvailable = availabilityFlags.every(Boolean);
  const partialAvailable = availabilityFlags.some(Boolean);
  
  if (allAvailable) {
    status.overall = {
      available: true,
      message: 'All extraction components available',
    };
  } else if (partialAvailable) {
    const unavailable = [];
    if (!status.clap.available) unavailable.push('CLAP');
    if (!status.audioAnalysis.available) unavailable.push('AudioAnalysis');
    if (!status.panns.available) unavailable.push('PANNs');
    if (!status.genreClassifier.available) unavailable.push('GenreClassifier');
    
    status.overall = {
      available: true,
      message: `Partial availability - unavailable: ${unavailable.join(', ')}`,
      partial: true,
    };
  } else {
    status.overall = {
      available: false,
      message: 'No extraction components available',
    };
  }
  
  return status;
}

/**
 * Format AI metadata for database storage
 * 
 * Converts the extraction result to the format expected by the
 * `ai_metadata` JSONB column in orbit_registrations.
 * 
 * @param {Object} extractionResult - Result from extractMetadata()
 * @returns {Object} Formatted for database storage
 */
function formatForDatabase(extractionResult) {
  return {
    genre: extractionResult.genre,
    mood: extractionResult.mood,
    instruments: extractionResult.instruments,
    vocals: extractionResult.vocals,
    bpm: extractionResult.bpm,
    key: extractionResult.key,
    energy: extractionResult.energy,
    loudness_db: extractionResult.loudness_db,
    dynamic_range_db: extractionResult.dynamic_range_db,
    duration: extractionResult.duration,
    sample_rate: extractionResult.sample_rate,
    key_detection_source: extractionResult.key_detection_source,
    panns_tags: extractionResult.panns_tags,
    genre_corroboration: extractionResult.genre_corroboration,
    danceability: extractionResult.danceability,
    extracted_at: new Date().toISOString(),
    processing_time_ms: extractionResult.processingTimeMs,
    extraction_status: extractionResult.extractionStatus,
  };
}

/**
 * Format audio embedding for PostgreSQL vector storage
 * Uses PANNs 2048-dim embeddings.
 *
 * IMPORTANT:
 * - Registration similarity search still stores CLAP 512-dim vectors in
 *   `audio_embedding`.
 * - This formatter is for metadata-extractor embedding output only.
 * - Persisting PANNs embeddings requires a separate schema/index migration.
 * 
 * @param {Float32Array|null} embedding - Audio embedding
 * @returns {string|null} PostgreSQL vector format or null
 */
function formatEmbeddingForDatabase(embedding) {
  if (!embedding) return null;
  const formatted = Array.from(embedding)
    .map(v => Number(v).toFixed(8))
    .join(',');
  return `[${formatted}]`;
}

const PANNS_INSTRUMENT_LABELS = new Set([
  'accordion',
  'acoustic guitar',
  'banjo',
  'bass drum',
  'bass guitar',
  'cello',
  'clarinet',
  'cymbal',
  'didgeridoo',
  'drum',
  'drum kit',
  'electric guitar',
  'flute',
  'french horn',
  'glockenspiel',
  'gong',
  'guitar',
  'harmonica',
  'harp',
  'harpsichord',
  'hi-hat',
  'keyboard (musical)',
  'mandolin',
  'maraca',
  'marimba, xylophone',
  'musical instrument',
  'organ',
  'percussion',
  'piano',
  'sampler',
  'saxophone',
  'sitar',
  'snare drum',
  'steel guitar, slide guitar',
  'string section',
  'synthesizer',
  'tabla',
  'tambourine',
  'timpani',
  'trombone',
  'trumpet',
  'ukulele',
  'violin, fiddle',
  'vibraphone',
]);

function filterPannsInstrumentTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag) => PANNS_INSTRUMENT_LABELS.has(String(tag.label || '').toLowerCase()))
    .map((tag) => ({
      label: tag.label,
      confidence: tag.confidence,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

const PANNS_VOCAL_LABELS = new Set([
  'singing',
  'vocal music',
  'choir',
  'rapping',
  'song',
  'opera',
]);

function filterPannsVocalTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag) => PANNS_VOCAL_LABELS.has(String(tag.label || '').toLowerCase()))
    .map((tag) => ({
      label: tag.label,
      confidence: tag.confidence,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

const PANNS_GENRE_LABELS = new Set([
  'classical music',
  'electronic music',
  'folk music',
  'funk',
  'gospel music',
  'heavy metal',
  'hip hop music',
  'jazz',
  'new-age music',
  'opera',
  'pop music',
  'progressive rock',
  'punk rock',
  'reggae',
  'rhythm and blues',
  'rock and roll',
  'salsa music',
  'soul music',
  'techno',
]);

function filterPannsGenreTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag) => PANNS_GENRE_LABELS.has(String(tag.label || '').toLowerCase()))
    .map((tag) => ({
      label: tag.label,
      confidence: tag.confidence,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

// Export configuration for testing
const config = { ...EXTRACTOR_CONFIG };

module.exports = {
  // Main extraction function
  extractMetadata,
  
  // Specialized extraction functions
  extractClapOnly,
  extractAudioAnalysisOnly,
  
  // Utility functions
  checkEnvironment,
  formatForDatabase,
  formatEmbeddingForDatabase,
  
  // Configuration
  config,
  
  // Re-export component modules for direct access if needed
  components: {
    clap,
    panns,
    genreClassifier,
    audioAnalysis,
  },
};
