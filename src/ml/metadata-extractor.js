/**
 * ORBIT Metadata Extractor
 * 
 * Session 21 - Unified AI metadata extraction pipeline
 * 
 * This module combines all ML/signal analysis capabilities into a single
 * extraction pipeline that auto-populates the `ai_metadata` field during
 * registration.
 * 
 * Components Integrated:
 * - CLAP (clap.js): Genre, mood, instruments, vocals detection
 * - MERT (mert.js): Semantic embedding for similarity search
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
const mert = require('./mert');
const audioAnalysis = require('./audio-analysis');

/**
 * Metadata Extractor Configuration
 */
const EXTRACTOR_CONFIG = {
  // Enable/disable individual extractors
  enableClap: true,
  enableMert: true,
  enableAudioAnalysis: true,
  
  // CLAP configuration
  clapGenreTopK: 3,
  clapMoodTopK: 3,
  clapInstrumentThreshold: 0.15,
  
  // Audio analysis configuration
  audioAnalysisMaxLength: 120,
  
  // MERT configuration
  mertMaxLength: 30,
  
  // Whether to fail on partial extraction errors
  failOnError: false,
};

/**
 * Extract all AI metadata from an audio file
 * 
 * This is the main entry point that combines all extractors:
 * - CLAP: genre, mood, instruments, vocals
 * - Audio Analysis: BPM, key, energy, loudness, danceability
 * - MERT: semantic embedding (for storage/similarity)
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {boolean} options.includeEmbedding - Include MERT embedding in response (default: false)
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
 * //   extractionStatus: { clap: 'success', audioAnalysis: 'success', mert: 'success' }
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
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log('🎵 MetadataExtractor: Starting full extraction...');
  }
  
  // Track extraction status for each component
  const extractionStatus = {
    clap: 'pending',
    audioAnalysis: 'pending',
    mert: 'pending',
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
    danceability: null,
    duration: null,
  };
  
  // Optional embedding storage
  let mertEmbedding = null;
  
  // ==========================================
  // CLAP Extraction (genre, mood, instruments, vocals)
  // ==========================================
  if (cfg.enableClap) {
    try {
      if (verbose) {
        console.log('   → CLAP: Extracting genre, mood, instruments, vocals...');
      }
      
      const clapResult = await clap.analyzeAudio(input, {
        genreTopK: cfg.clapGenreTopK,
        moodTopK: cfg.clapMoodTopK,
        instrumentThreshold: cfg.clapInstrumentThreshold,
        verbose: false, // Suppress CLAP's own verbose output
      });
      
      result.genre = clapResult.genre;
      result.mood = clapResult.mood;
      result.instruments = clapResult.instruments;
      result.vocals = clapResult.vocals;
      
      extractionStatus.clap = 'success';
      
      if (verbose) {
        console.log(`   ✓ CLAP: Complete (${clapResult.processingTimeMs}ms)`);
      }
      
    } catch (error) {
      extractionStatus.clap = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   ✗ CLAP: Failed - ${error.message}`);
      }
      
      if (cfg.failOnError) {
        throw error;
      }
    }
  } else {
    extractionStatus.clap = 'disabled';
  }
  
  // ==========================================
  // Audio Analysis (BPM, key, energy, loudness)
  // ==========================================
  if (cfg.enableAudioAnalysis) {
    try {
      if (verbose) {
        console.log('   → AudioAnalysis: Extracting BPM, key, energy...');
      }
      
      const analysisResult = await audioAnalysis.analyze(input, {
        maxLength: cfg.audioAnalysisMaxLength,
        verbose: false,
      });
      
      result.bpm = analysisResult.bpm;
      result.key = analysisResult.key;
      result.energy = analysisResult.energy;
      result.loudness_db = analysisResult.loudness_db;
      result.duration = analysisResult.duration;
      
      // Calculate danceability from BPM and energy
      result.danceability = audioAnalysis.calculateDanceability(analysisResult);
      
      extractionStatus.audioAnalysis = 'success';
      
      if (verbose) {
        console.log(`   ✓ AudioAnalysis: Complete (${analysisResult.processingTimeMs}ms)`);
      }
      
    } catch (error) {
      extractionStatus.audioAnalysis = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   ✗ AudioAnalysis: Failed - ${error.message}`);
      }
      
      if (cfg.failOnError) {
        throw error;
      }
    }
  } else {
    extractionStatus.audioAnalysis = 'disabled';
  }
  
  // ==========================================
  // MERT Embedding (for storage and similarity)
  // ==========================================
  if (cfg.enableMert) {
    try {
      if (verbose) {
        console.log('   → MERT: Generating semantic embedding...');
      }
      
      const mertResult = await mert.getEmbedding(input, {
        maxLength: cfg.mertMaxLength,
        verbose: false,
      });
      
      mertEmbedding = mertResult.embedding;
      
      // If duration wasn't set by audio analysis, use MERT's duration
      if (result.duration === null) {
        result.duration = mertResult.duration;
      }
      
      extractionStatus.mert = 'success';
      
      if (verbose) {
        console.log(`   ✓ MERT: Complete (${mertResult.processingTimeMs}ms)`);
      }
      
    } catch (error) {
      extractionStatus.mert = `error: ${error.message}`;
      
      if (verbose) {
        console.log(`   ✗ MERT: Failed - ${error.message}`);
      }
      
      if (cfg.failOnError) {
        throw error;
      }
    }
  } else {
    extractionStatus.mert = 'disabled';
  }
  
  // ==========================================
  // Finalize Result
  // ==========================================
  const totalTime = Date.now() - startTime;
  
  result.processingTimeMs = totalTime;
  result.extractionStatus = extractionStatus;
  
  // Include embedding if requested
  if (includeEmbedding && mertEmbedding) {
    result.mertEmbedding = mertEmbedding;
  }
  
  if (verbose) {
    console.log(`✅ MetadataExtractor: Complete in ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`   Status: CLAP=${extractionStatus.clap}, AudioAnalysis=${extractionStatus.audioAnalysis}, MERT=${extractionStatus.mert}`);
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
      enableMert: false,
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
      enableMert: false,
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
    mert: { available: false, message: '' },
    audioAnalysis: { available: false, message: '' },
    overall: { available: false, message: '' },
  };
  
  // Check CLAP (requires @xenova/transformers)
  try {
    // CLAP uses transformers.js which is a JS dependency
    // Just check if the module loads
    status.clap = {
      available: true,
      message: 'CLAP module loaded',
    };
  } catch (error) {
    status.clap = {
      available: false,
      message: `CLAP error: ${error.message}`,
    };
  }
  
  // Check MERT (requires Python + dependencies)
  try {
    const mertStatus = await mert.checkPythonEnvironment();
    status.mert = {
      available: mertStatus.available,
      message: mertStatus.message,
      details: mertStatus.details,
    };
  } catch (error) {
    status.mert = {
      available: false,
      message: `MERT error: ${error.message}`,
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
  
  // Overall status
  const allAvailable = status.clap.available && status.mert.available && status.audioAnalysis.available;
  const partialAvailable = status.clap.available || status.mert.available || status.audioAnalysis.available;
  
  if (allAvailable) {
    status.overall = {
      available: true,
      message: 'All extraction components available',
    };
  } else if (partialAvailable) {
    const unavailable = [];
    if (!status.clap.available) unavailable.push('CLAP');
    if (!status.mert.available) unavailable.push('MERT');
    if (!status.audioAnalysis.available) unavailable.push('AudioAnalysis');
    
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
    danceability: extractionResult.danceability,
    extracted_at: new Date().toISOString(),
    processing_time_ms: extractionResult.processingTimeMs,
    extraction_status: extractionResult.extractionStatus,
  };
}

/**
 * Format MERT embedding for PostgreSQL vector storage
 * 
 * @param {Float32Array|null} embedding - MERT embedding
 * @returns {string|null} PostgreSQL vector format or null
 */
function formatEmbeddingForDatabase(embedding) {
  if (!embedding) return null;
  return mert.embeddingToPostgres(embedding);
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
    mert,
    audioAnalysis,
  },
};
