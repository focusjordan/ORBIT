/**
 * ORBIT CLAP Zero-Shot Classification
 * 
 * CLAP (Contrastive Language-Audio Pretraining) enables zero-shot classification
 * by comparing audio embeddings against text prompt embeddings. This allows
 * classification without any training on the specific labels.
 * 
 * Architecture:
 * - Uses @xenova/transformers with 'zero-shot-audio-classification' task
 * - Audio → CLAP audio encoder → 512-dim embedding
 * - Text prompts → CLAP text encoder → 512-dim embeddings
 * - Softmax over cosine similarities → classification scores
 * 
 * @see ORBIT_SPECIFICATION.md Section 12 (Zero-Shot ML Enhancements)
 * @see ORBIT_ENHANCEMENTS.md Section 3 (Zero-Shot Metadata Auto-Extraction)
 */

// Import audio utilities for Node.js audio processing
const AudioUtils = require('../utils/audio');

/**
 * CLAP Configuration
 */
const CLAP_CONFIG = {
  // Model identifier
  model: 'Xenova/clap-htsat-unfused',
  
  // Pipeline task
  task: 'zero-shot-audio-classification',
  
  // Output embedding dimension
  embeddingDim: 512,
  
  // CLAP expects 48kHz audio
  sampleRate: 48000,
  
  // Default confidence threshold for multi-label classification
  defaultThreshold: 0.15,
  
  // Number of top results to return for single-label classification
  topK: 3,
};

// Pipeline cache
let _pipeline = null;
let _pipelinePromise = null;

// Model/processor/tokenizer cache for direct embedding extraction
let _clapModel = null;
let _clapProcessor = null;
let _clapTokenizer = null;
let _modelLoadPromise = null;

// ==========================================
// PROMPT DEFINITIONS
// ==========================================

/**
 * Genre classification prompts
 * Natural language descriptions that CLAP can match against audio
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 3 (Zero-Shot Genre Classification)
 */
const GENRE_PROMPTS = [
  { label: 'electronic', prompt: 'electronic dance music with synthesizers and beats' },
  { label: 'hip_hop', prompt: 'hip hop and rap music with beats and rhymes' },
  { label: 'rock', prompt: 'rock and alternative music with guitars and drums' },
  { label: 'pop', prompt: 'pop music with catchy melodies and vocals' },
  { label: 'jazz', prompt: 'jazz music with improvisation and swing' },
  { label: 'classical', prompt: 'classical orchestral music with strings and piano' },
  { label: 'country', prompt: 'country and folk music with acoustic guitar' },
  { label: 'rnb', prompt: 'rhythm and blues soul music with smooth vocals' },
  { label: 'metal', prompt: 'heavy metal music with distorted guitars and loud drums' },
  { label: 'ambient', prompt: 'ambient and experimental atmospheric music' },
  { label: 'reggae', prompt: 'reggae music with offbeat rhythms and bass' },
  { label: 'latin', prompt: 'latin music with percussion and dance rhythms' },
  { label: 'world', prompt: 'world music with ethnic instruments and traditional sounds' },
  { label: 'blues', prompt: 'blues music with guitar and soulful expression' },
  { label: 'funk', prompt: 'funk music with groovy bass and rhythmic patterns' },
];

/**
 * Mood/emotion classification prompts
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 3 (Zero-Shot Mood Classification)
 */
const MOOD_PROMPTS = [
  { label: 'happy', prompt: 'happy and uplifting cheerful music' },
  { label: 'sad', prompt: 'sad and melancholic sorrowful music' },
  { label: 'energetic', prompt: 'energetic and exciting high-energy music' },
  { label: 'calm', prompt: 'calm and relaxing peaceful music' },
  { label: 'aggressive', prompt: 'aggressive and intense powerful music' },
  { label: 'romantic', prompt: 'romantic and sensual love music' },
  { label: 'dark', prompt: 'dark and mysterious ominous music' },
  { label: 'nostalgic', prompt: 'nostalgic and emotional reflective music' },
  { label: 'hopeful', prompt: 'hopeful and inspiring uplifting music' },
  { label: 'anxious', prompt: 'anxious and tense suspenseful music' },
  { label: 'dreamy', prompt: 'dreamy and ethereal floating music' },
  { label: 'groovy', prompt: 'groovy and danceable rhythmic music' },
];

/**
 * Instrument detection prompts
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 3 (Instrument Detection)
 */
const INSTRUMENT_PROMPTS = [
  { label: 'guitar', prompt: 'music with guitar playing' },
  { label: 'piano', prompt: 'music with piano playing' },
  { label: 'drums', prompt: 'music with drums and percussion' },
  { label: 'bass', prompt: 'music with bass guitar or bass' },
  { label: 'synthesizer', prompt: 'music with synthesizer and electronic sounds' },
  { label: 'strings', prompt: 'music with violin, cello, or string instruments' },
  { label: 'brass', prompt: 'music with trumpet, saxophone, or brass instruments' },
  { label: 'woodwinds', prompt: 'music with flute, clarinet, or woodwind instruments' },
  { label: 'vocals', prompt: 'music with singing and human voice' },
  { label: 'choir', prompt: 'music with choir or multiple voices singing' },
  { label: 'acoustic_guitar', prompt: 'music with acoustic guitar' },
  { label: 'electric_guitar', prompt: 'music with electric guitar' },
  { label: 'organ', prompt: 'music with organ playing' },
  { label: 'harmonica', prompt: 'music with harmonica' },
];

/**
 * Vocal presence detection prompts
 */
const VOCAL_PROMPTS = [
  { label: 'vocals_present', prompt: 'human voice singing words and lyrics over music' },
  { label: 'vocals_present', prompt: 'vocal melody with lyrics over instrumental accompaniment' },
  { label: 'vocals_present', prompt: 'a person singing along to music' },
  { label: 'vocals_present', prompt: 'background vocals or harmonies in a song' },
  { label: 'vocals_present', prompt: 'spoken word or voice over a musical beat' },
  { label: 'instrumental', prompt: 'instrumental music without any singing or human voice' },
  { label: 'instrumental', prompt: 'purely instrumental performance with no vocals' },
  { label: 'male_vocals', prompt: 'male voice singing or rapping' },
  { label: 'female_vocals', prompt: 'female voice singing or crooning' },
];

// ==========================================
// CORE FUNCTIONS
// ==========================================

/**
 * Get the CLAP zero-shot-audio-classification pipeline
 * Uses singleton pattern to avoid loading model multiple times
 * @private
 * @returns {Promise<Function>} CLAP pipeline
 */
async function _getClapPipeline() {
  // Return cached pipeline if available
  if (_pipeline) {
    return _pipeline;
  }
  
  // Return existing loading promise if loading
  if (_pipelinePromise) {
    return _pipelinePromise;
  }
  
  // Start loading
  _pipelinePromise = (async () => {
    const verbose = process.env.ORBIT_ML_VERBOSE === 'true';
    
    if (verbose) {
      console.log(`[CLAP] Loading ${CLAP_CONFIG.model}...`);
    }
    
    // Dynamic import for ESM compatibility
    const { pipeline } = await import('@xenova/transformers');
    
    // Create the zero-shot-audio-classification pipeline
    const classifier = await pipeline(
      CLAP_CONFIG.task,
      CLAP_CONFIG.model
    );
    
    if (verbose) {
      console.log(`[CLAP] Model loaded`);
    }
    
    _pipeline = classifier;
    return classifier;
  })();
  
  return _pipelinePromise;
}

/**
 * Load audio and convert to format expected by CLAP
 * CLAP expects Float32Array at 48kHz
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<Float32Array>} Audio samples at 48kHz
 */
async function _loadAudioForClap(input, options = {}) {
  const { verbose = false } = options;
  
  if (verbose) {
    console.log(`[CLAP] Loading audio...`);
  }
  
  // Use AudioUtils to load and convert audio
  const { samples, sampleRate } = await AudioUtils.loadAudioSamples(input, {
    targetSampleRate: CLAP_CONFIG.sampleRate
  });
  
  if (verbose) {
    const duration = samples.length / sampleRate;
    console.log(`[CLAP] Loaded ${duration.toFixed(1)}s audio at ${sampleRate}Hz`);
  }
  
  return samples;
}

// ==========================================
// AUDIO EMBEDDING EXTRACTION
// ==========================================

/**
 * Load CLAP model, processor, and tokenizer for direct embedding extraction
 * @private
 */
async function _loadClapModel() {
  if (_clapModel && _clapProcessor && _clapTokenizer) {
    return { model: _clapModel, processor: _clapProcessor, tokenizer: _clapTokenizer };
  }
  
  if (_modelLoadPromise) {
    return _modelLoadPromise;
  }
  
  _modelLoadPromise = (async () => {
    const verbose = process.env.ORBIT_ML_VERBOSE === 'true';
    
    if (verbose) {
      console.log(`[CLAP] Loading model for embedding extraction...`);
    }
    
    const { ClapModel, AutoProcessor, AutoTokenizer } = await import('@xenova/transformers');
    
    _clapModel = await ClapModel.from_pretrained(CLAP_CONFIG.model);
    _clapProcessor = await AutoProcessor.from_pretrained(CLAP_CONFIG.model);
    _clapTokenizer = await AutoTokenizer.from_pretrained(CLAP_CONFIG.model);
    
    if (verbose) {
      console.log(`[CLAP] Model loaded for embeddings`);
    }
    
    return { model: _clapModel, processor: _clapProcessor, tokenizer: _clapTokenizer };
  })();
  
  return _modelLoadPromise;
}

/**
 * Extract audio embedding for similarity comparison
 * 
 * This function generates a 512-dimensional embedding that captures
 * the acoustic/semantic content of audio. These embeddings can be
 * compared via cosine similarity to detect:
 * - Pitch-shifted duplicates
 * - Covers (same song, different recording)
 * - Remixes
 * - Similar-sounding tracks
 * 
 * LICENSE: Apache 2.0 (commercially licensable)
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log progress (default: false)
 * @param {boolean} options.normalize - L2 normalize embedding (default: true)
 * @returns {Promise<{embedding: Float32Array, duration: number}>}
 * 
 * @example
 * const { embedding: emb1 } = await getAudioEmbedding('song1.mp3');
 * const { embedding: emb2 } = await getAudioEmbedding('song1_pitched.mp3');
 * const similarity = cosineSimilarity(emb1, emb2);
 * // similarity > 0.85 indicates likely same song
 */
async function getAudioEmbedding(input, options = {}) {
  const { 
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
    normalize = true,
  } = options;
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log(`[CLAP] Extracting audio embedding...`);
  }
  
  // Load audio samples at CLAP's expected sample rate (48kHz)
  const audioSamples = await _loadAudioForClap(input, { verbose });
  const duration = audioSamples.length / CLAP_CONFIG.sampleRate;
  
  // Load model, processor, and tokenizer
  const { model, processor, tokenizer } = await _loadClapModel();
  
  // Process audio through CLAP processor
  const audioInputs = await processor(audioSamples, {
    sampling_rate: CLAP_CONFIG.sampleRate,
  });
  
  // CLAP requires text input - use dummy text (we only want audio embeddings)
  const textInputs = await tokenizer(['audio'], { padding: true, truncation: true });
  
  // Combine inputs and run model
  const allInputs = { ...audioInputs, ...textInputs };
  const { audio_embeds } = await model(allInputs);
  
  // Extract embedding as Float32Array
  let embedding = new Float32Array(audio_embeds.data);
  
  // L2 normalize if requested (for cosine similarity)
  if (normalize) {
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }
  }
  
  const elapsed = Date.now() - startTime;
  
  if (verbose) {
    console.log(`[CLAP] Extracted ${embedding.length}-dim embedding in ${(elapsed / 1000).toFixed(1)}s`);
  }
  
  return {
    embedding,
    duration,
    embeddingDim: embedding.length,
    processingTimeMs: elapsed,
    model: CLAP_CONFIG.model,
  };
}

/**
 * Classify relationship between two audio files based on embedding similarity
 * 
 * @param {number} similarity - Cosine similarity score (0-1)
 * @returns {{relationship: string, confidence: string}}
 * 
 * Thresholds (calibrated for CLAP):
 * - 0.95-1.00: EXACT_DUPLICATE (same file or transcoded)
 * - 0.85-0.95: LIKELY_DUPLICATE (pitch-shifted, minor edits)
 * - 0.70-0.85: POSSIBLE_COVER (same song, different recording)
 * - 0.55-0.70: STYLISTICALLY_SIMILAR
 * - < 0.55: DIFFERENT_WORK
 */
function classifyRelationship(similarity) {
  if (similarity >= 0.95) {
    return { relationship: 'EXACT_DUPLICATE', confidence: 'very_high' };
  }
  if (similarity >= 0.85) {
    return { relationship: 'LIKELY_DUPLICATE', confidence: 'high' };
  }
  if (similarity >= 0.70) {
    return { relationship: 'POSSIBLE_COVER', confidence: 'medium' };
  }
  if (similarity >= 0.55) {
    return { relationship: 'STYLISTICALLY_SIMILAR', confidence: 'low' };
  }
  return { relationship: 'DIFFERENT_WORK', confidence: 'high' };
}

// ==========================================
// CLASSIFICATION FUNCTIONS
// ==========================================

/**
 * Classify audio against a set of candidate labels
 * This is the core classification function used by all classifiers
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {string[]} candidateLabels - Array of text labels to classify against
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<Array<{label: string, score: number}>>}
 */
async function classifyWithLabels(input, candidateLabels, options = {}) {
  const { verbose = process.env.ORBIT_ML_VERBOSE === 'true' } = options;
  
  if (verbose) {
    console.log(`[CLAP] Classifying against ${candidateLabels.length} labels`);
  }
  
  const startTime = Date.now();
  
  // Load audio samples (handles both file paths and buffers)
  const audioSamples = await _loadAudioForClap(input, { verbose });
  
  // Get the classifier pipeline
  const classifier = await _getClapPipeline();
  
  // Run zero-shot classification with raw audio samples
  // transformers.js accepts Float32Array directly for Node.js
  const results = await classifier(audioSamples, candidateLabels);
  
  const elapsed = Date.now() - startTime;
  
  if (verbose) {
    console.log(`[CLAP] Classification completed in ${(elapsed / 1000).toFixed(1)}s`);
  }
  
  // Results are already sorted by score in descending order
  // Format: [{ label: 'rock music', score: 0.45 }, ...]
  return results.map(r => ({
    label: r.label,
    confidence: r.score,
  }));
}

/**
 * Calculate cosine similarity between two embeddings
 * (Utility function for comparing embeddings if needed)
 * 
 * @param {Float32Array|number[]} embedding1 
 * @param {Float32Array|number[]} embedding2 
 * @returns {number} Similarity score in range [-1, 1]
 */
function cosineSimilarity(embedding1, embedding2) {
  if (embedding1.length !== embedding2.length) {
    throw new Error(`Embedding dimension mismatch: ${embedding1.length} vs ${embedding2.length}`);
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  
  // Handle zero vectors
  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// ==========================================
// CLASSIFICATION FUNCTIONS
// ==========================================

/**
 * Classify genre using zero-shot classification
 * 
 * @param {string|Buffer} input - Audio path or buffer
 * @param {Object} options - Options
 * @param {number} options.topK - Number of top results to return (default: 3)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<Array<{label: string, confidence: number}>>}
 * 
 * @example
 * const genres = await classifyGenre('/path/to/audio.mp3');
 * // [{ label: 'electronic', confidence: 0.89 }, { label: 'pop', confidence: 0.45 }, ...]
 */
async function classifyGenre(input, options = {}) {
  const { topK = CLAP_CONFIG.topK, verbose = false } = options;
  
  // Extract just the prompt texts for classification
  const candidateLabels = GENRE_PROMPTS.map(p => p.prompt);
  
  // Run classification
  const results = await classifyWithLabels(input, candidateLabels, { verbose });
  
  // Map back to our labels
  const mappedResults = results.map(r => {
    const promptEntry = GENRE_PROMPTS.find(p => p.prompt === r.label);
    return {
      label: promptEntry ? promptEntry.label : r.label,
      confidence: r.confidence,
    };
  });
  
  // Return top K results
  return mappedResults.slice(0, topK);
}

/**
 * Classify mood/emotion using zero-shot classification
 * 
 * @param {string|Buffer} input - Audio path or buffer
 * @param {Object} options - Options
 * @param {number} options.topK - Number of top results to return (default: 3)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<Array<{label: string, confidence: number}>>}
 * 
 * @example
 * const moods = await classifyMood('/path/to/audio.mp3');
 * // [{ label: 'energetic', confidence: 0.82 }, { label: 'happy', confidence: 0.65 }, ...]
 */
async function classifyMood(input, options = {}) {
  const { topK = CLAP_CONFIG.topK, verbose = false } = options;
  
  // Extract just the prompt texts for classification
  const candidateLabels = MOOD_PROMPTS.map(p => p.prompt);
  
  // Run classification
  const results = await classifyWithLabels(input, candidateLabels, { verbose });
  
  // Map back to our labels
  const mappedResults = results.map(r => {
    const promptEntry = MOOD_PROMPTS.find(p => p.prompt === r.label);
    return {
      label: promptEntry ? promptEntry.label : r.label,
      confidence: r.confidence,
    };
  });
  
  // Return top K results
  return mappedResults.slice(0, topK);
}

/**
 * Detect instruments using multi-label classification
 * Returns all instruments above the confidence threshold
 * 
 * @param {string|Buffer} input - Audio path or buffer
 * @param {Object} options - Options
 * @param {number} options.threshold - Confidence threshold (default: 0.15)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<Array<{label: string, confidence: number}>>}
 * 
 * @example
 * const instruments = await detectInstruments('/path/to/audio.mp3');
 * // [{ label: 'synthesizer', confidence: 0.94 }, { label: 'drums', confidence: 0.91 }, ...]
 */
async function detectInstruments(input, options = {}) {
  const { threshold = CLAP_CONFIG.defaultThreshold, verbose = false } = options;
  
  // Extract just the prompt texts for classification
  const candidateLabels = INSTRUMENT_PROMPTS.map(p => p.prompt);
  
  // Run classification
  const results = await classifyWithLabels(input, candidateLabels, { verbose });
  
  // Map back to our labels and filter by threshold
  const mappedResults = results.map(r => {
    const promptEntry = INSTRUMENT_PROMPTS.find(p => p.prompt === r.label);
    return {
      label: promptEntry ? promptEntry.label : r.label,
      confidence: r.confidence,
    };
  });
  
  // Return all instruments above threshold
  return mappedResults.filter(r => r.confidence >= threshold);
}

/**
 * Detect vocal presence and characteristics
 * 
 * @param {string|Buffer} input - Audio path or buffer
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<{present: boolean, confidence: number, gender?: string, genderConfidence?: number}>}
 * 
 * @example
 * const vocals = await detectVocals('/path/to/audio.mp3');
 * // { present: true, confidence: 0.92, gender: 'female', genderConfidence: 0.78 }
 */
async function detectVocals(input, options = {}) {
  const { verbose = false } = options;
  
  // Extract just the prompt texts for classification
  const candidateLabels = VOCAL_PROMPTS.map(p => p.prompt);
  
  // Run classification
  const results = await classifyWithLabels(input, candidateLabels, { verbose });
  
  // Aggregate scores by label (take max across prompts sharing a label)
  const mappedResults = {};
  for (const r of results) {
    const promptEntry = VOCAL_PROMPTS.find(p => p.prompt === r.label);
    if (promptEntry) {
      const prev = mappedResults[promptEntry.label] || 0;
      mappedResults[promptEntry.label] = Math.max(prev, r.confidence);
    }
  }
  
  const vocalScore = mappedResults.vocals_present || 0;
  const instrumentalScore = mappedResults.instrumental || 0;
  const maleScore = mappedResults.male_vocals || 0;
  const femaleScore = mappedResults.female_vocals || 0;
  
  // Determine if vocals are present
  const ratio = vocalScore / (vocalScore + instrumentalScore + 0.001);
  const present = ratio > 0.35;
  const confidence = present ? vocalScore : instrumentalScore;
  
  // Determine gender if vocals present
  let gender = null;
  let genderConfidence = null;
  
  if (present && (maleScore > 0.15 || femaleScore > 0.15)) {
    gender = maleScore > femaleScore ? 'male' : 'female';
    genderConfidence = Math.max(maleScore, femaleScore);
  }
  
  return {
    present,
    confidence,
    ratio,
    gender,
    genderConfidence,
  };
}

// ==========================================
// CONVENIENCE FUNCTIONS
// ==========================================

/**
 * Analyze audio and return all classifications at once
 * 
 * Note: With the zero-shot-audio-classification approach, each classification
 * requires a separate model call. This function runs them sequentially to
 * avoid memory pressure, but still provides a convenient single-call interface.
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {number} options.genreTopK - Number of top genres (default: 3)
 * @param {number} options.moodTopK - Number of top moods (default: 3)
 * @param {number} options.instrumentThreshold - Instrument detection threshold (default: 0.15)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<Object>} Complete classification results
 * 
 * @example
 * const analysis = await analyzeAudio('/path/to/audio.mp3');
 * // {
 * //   genre: [{ label: 'electronic', confidence: 0.89 }, ...],
 * //   mood: [{ label: 'energetic', confidence: 0.82 }, ...],
 * //   instruments: [{ label: 'synthesizer', confidence: 0.94 }, ...],
 * //   vocals: { present: true, confidence: 0.92, gender: 'female', ... }
 * // }
 */
async function analyzeAudio(input, options = {}) {
  const {
    genreTopK = CLAP_CONFIG.topK,
    moodTopK = CLAP_CONFIG.topK,
    instrumentThreshold = CLAP_CONFIG.defaultThreshold,
    verbose = false,
  } = options;
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log('[CLAP] Starting full audio analysis...');
  }
  
  // Run classifications sequentially to manage memory
  // Each classification function handles audio loading internally
  const genre = await classifyGenre(input, { topK: genreTopK, verbose });
  const mood = await classifyMood(input, { topK: moodTopK, verbose: false });
  const instruments = await detectInstruments(input, { threshold: instrumentThreshold, verbose: false });
  const vocals = await detectVocals(input, { verbose: false });
  
  const totalTime = Date.now() - startTime;
  
  if (verbose) {
    console.log(`[CLAP] Full analysis completed in ${(totalTime / 1000).toFixed(1)}s`);
  }
  
  return {
    genre,
    mood,
    instruments,
    vocals,
    processingTimeMs: totalTime,
  };
}

/**
 * Unload the CLAP model from memory
 * Useful for freeing resources when classification is complete
 */
function unload() {
  _pipeline = null;
  _pipelinePromise = null;
  _clapModel = null;
  _clapProcessor = null;
  _clapTokenizer = null;
  _modelLoadPromise = null;
}

/**
 * Format embedding for PostgreSQL vector type
 * (Same format as MERT for consistency)
 * 
 * @param {Float32Array|number[]} embedding 
 * @returns {string} PostgreSQL vector string format: '[0.1,0.2,...]'
 */
function embeddingToPostgres(embedding) {
  const formatted = Array.from(embedding)
    .map(v => v.toFixed(8))
    .join(',');
  return `[${formatted}]`;
}

/**
 * Parse PostgreSQL vector string to Float32Array
 * 
 * @param {string} vectorString - PostgreSQL vector format '[0.1,0.2,...]'
 * @returns {Float32Array}
 */
function postgresVectorToEmbedding(vectorString) {
  if (!vectorString) return null;
  
  const values = vectorString
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(parseFloat);
  
  return new Float32Array(values);
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Audio embedding extraction (for similarity/duplicate detection)
  // LICENSE: Apache 2.0 - commercially licensable
  getAudioEmbedding,
  classifyRelationship,
  
  // Core classification function
  classifyWithLabels,
  
  // High-level classification functions
  classifyGenre,
  classifyMood,
  detectInstruments,
  detectVocals,
  
  // Convenience functions
  analyzeAudio,
  unload,
  
  // Utility functions
  cosineSimilarity,
  
  // Serialization helpers
  embeddingToPostgres,
  postgresVectorToEmbedding,
  
  // Configuration and prompts (for testing/extension)
  config: CLAP_CONFIG,
  prompts: {
    GENRE_PROMPTS,
    MOOD_PROMPTS,
    INSTRUMENT_PROMPTS,
    VOCAL_PROMPTS,
  },
  
  // Constants
  EMBEDDING_DIM: CLAP_CONFIG.embeddingDim,
};
