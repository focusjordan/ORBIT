/**
 * ORBIT Content Relationship Detection
 * 
 * Session 24 - Detects covers, remixes, and similar works using CLAP embeddings
 * 
 * This module analyzes content relationships between audio files by:
 * 1. Computing CLAP embeddings (512-dim, Apache 2.0 licensed)
 * 2. Querying pgvector for similar existing registrations
 * 3. Classifying relationships based on calibrated thresholds
 * 
 * Relationship Types (ordered by similarity):
 * - EXACT_DUPLICATE: Same file or transcoded (>=0.95)
 * - LIKELY_DUPLICATE: Pitch-shifted, minor edits (>=0.85)
 * - POSSIBLE_REMIX: Remix or significant edit (>=0.75)
 * - POSSIBLE_COVER: Same song, different recording (>=0.65)
 * - STYLISTICALLY_SIMILAR: Similar genre/style (>=0.55)
 * - DIFFERENT_WORK: Unrelated content (<0.55)
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 4 (Content Relationship Detection)
 * @see src/ml/clap.js for embedding extraction
 * @see src/ledger/queries.js for database queries
 */

const clap = require('./clap');
const queries = require('../ledger/queries');

// ============================================================================
// SIMILARITY THRESHOLDS
// ============================================================================

/**
 * Calibrated similarity thresholds for CLAP 512-dim embeddings
 * 
 * These thresholds are tuned for CLAP's embedding space and may need
 * adjustment based on real-world testing with various content types.
 * 
 * Note: CLAP uses cosine similarity where:
 * - 1.0 = identical embeddings
 * - 0.0 = orthogonal (unrelated)
 * - -1.0 = opposite (rare for audio)
 */
const SIMILARITY_THRESHOLDS = {
  EXACT_DUPLICATE: 0.95,      // Same file or transcoded
  LIKELY_DUPLICATE: 0.85,     // Pitch-shifted, minor edits
  POSSIBLE_REMIX: 0.75,       // Remix or significant edit  
  POSSIBLE_COVER: 0.65,       // Same song, different recording
  STYLISTICALLY_SIMILAR: 0.55, // Similar genre/style
  // Anything below 0.55 is DIFFERENT_WORK
};

/**
 * Default minimum threshold for including results
 * Results below this are considered unrelated
 */
const DEFAULT_MIN_THRESHOLD = 0.50;

/**
 * Default maximum results to return
 */
const DEFAULT_LIMIT = 10;

// ============================================================================
// RELATIONSHIP CLASSIFICATION
// ============================================================================

/**
 * Classify the relationship between two audio files based on similarity score
 * 
 * @param {number} similarity - Cosine similarity score (0-1)
 * @returns {{relationship: string, confidence: string, description: string}}
 */
function classifyRelationship(similarity) {
  if (similarity >= SIMILARITY_THRESHOLDS.EXACT_DUPLICATE) {
    return {
      relationship: 'EXACT_DUPLICATE',
      confidence: 'very_high',
      description: 'Same file or transcoded version'
    };
  }
  
  if (similarity >= SIMILARITY_THRESHOLDS.LIKELY_DUPLICATE) {
    return {
      relationship: 'LIKELY_DUPLICATE',
      confidence: 'high',
      description: 'Pitch-shifted or minor edits'
    };
  }
  
  if (similarity >= SIMILARITY_THRESHOLDS.POSSIBLE_REMIX) {
    return {
      relationship: 'POSSIBLE_REMIX',
      confidence: 'medium',
      description: 'Possible remix or significant edit'
    };
  }
  
  if (similarity >= SIMILARITY_THRESHOLDS.POSSIBLE_COVER) {
    return {
      relationship: 'POSSIBLE_COVER',
      confidence: 'medium',
      description: 'Possibly same song, different recording'
    };
  }
  
  if (similarity >= SIMILARITY_THRESHOLDS.STYLISTICALLY_SIMILAR) {
    return {
      relationship: 'STYLISTICALLY_SIMILAR',
      confidence: 'low',
      description: 'Similar genre or style'
    };
  }
  
  return {
    relationship: 'DIFFERENT_WORK',
    confidence: 'high',
    description: 'Unrelated content'
  };
}

/**
 * Check if a relationship type indicates potential derivative work
 * 
 * @param {string} relationship - Relationship type
 * @returns {boolean}
 */
function isDerivativeRelationship(relationship) {
  return [
    'EXACT_DUPLICATE',
    'LIKELY_DUPLICATE',
    'POSSIBLE_REMIX',
    'POSSIBLE_COVER'
  ].includes(relationship);
}

// ============================================================================
// CONTENT ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Find related content for an audio file
 * 
 * This function:
 * 1. Extracts CLAP embedding from the audio
 * 2. Queries pgvector for similar embeddings in the database
 * 3. Classifies each match by relationship type
 * 4. Returns sorted results with relationship metadata
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {number} options.threshold - Minimum similarity threshold (default: 0.50)
 * @param {number} options.limit - Maximum results (default: 10)
 * @param {number} options.excludeId - Registration ID to exclude (for self-matching)
 * @param {boolean} options.verbose - Log progress (default: false)
 * @returns {Promise<Object>} Content analysis results
 * 
 * @example
 * const analysis = await findRelatedContent('/path/to/audio.mp3');
 * // {
 * //   embedding_extracted: true,
 * //   is_derivative: true,
 * //   similar_works: [...],
 * //   query_embedding: <512-dim vector>,
 * //   processing_time_ms: 1234
 * // }
 */
async function findRelatedContent(input, options = {}) {
  const {
    threshold = DEFAULT_MIN_THRESHOLD,
    limit = DEFAULT_LIMIT,
    excludeId = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log(`📊 ContentAnalysis: Starting content relationship detection...`);
  }
  
  // Step 1: Extract CLAP embedding from input audio
  let embeddingResult;
  try {
    embeddingResult = await clap.getAudioEmbedding(input, { verbose });
  } catch (error) {
    console.error(`[ContentAnalysis] Embedding extraction failed: ${error.message}`);
    return {
      embedding_extracted: false,
      error: `Embedding extraction failed: ${error.message}`,
      is_derivative: false,
      similar_works: [],
      processing_time_ms: Date.now() - startTime
    };
  }
  
  const { embedding } = embeddingResult;
  
  if (verbose) {
    console.log(`📊 ContentAnalysis: Embedding extracted (${embedding.length}-dim)`);
  }
  
  // Step 2: Convert embedding to PostgreSQL format
  const pgEmbedding = clap.embeddingToPostgres(embedding);
  
  // Step 3: Query database for similar embeddings
  let similarResults;
  try {
    similarResults = await queries.findSimilarByEmbedding(pgEmbedding, {
      threshold,
      limit,
      excludeId
    });
    
    if (verbose) {
      console.log(`📊 ContentAnalysis: Found ${similarResults.length} similar registrations`);
    }
  } catch (error) {
    console.error(`[ContentAnalysis] Database query failed: ${error.message}`);
    return {
      embedding_extracted: true,
      error: `Database query failed: ${error.message}`,
      is_derivative: false,
      similar_works: [],
      query_embedding_dim: embedding.length,
      processing_time_ms: Date.now() - startTime
    };
  }
  
  // Step 4: Classify each result by relationship type
  const similarWorks = similarResults.map(result => {
    const classification = classifyRelationship(result.similarity);
    
    return {
      registration_id: result.id,
      title: result.title,
      artist: result.artist,
      isrc: result.isrc || null,
      origin_platform: result.origin_platform,
      owner_id: result.owner_id,
      registered_at: result.created_at,
      similarity: parseFloat(result.similarity.toFixed(4)),
      relationship: classification.relationship,
      confidence: classification.confidence,
      description: classification.description,
    };
  });
  
  // Step 5: Determine if any derivative relationships exist
  const isDerivative = similarWorks.some(
    work => isDerivativeRelationship(work.relationship)
  );
  
  // Step 6: Count relationship types
  const relationshipCounts = {};
  for (const work of similarWorks) {
    relationshipCounts[work.relationship] = (relationshipCounts[work.relationship] || 0) + 1;
  }
  
  const processingTime = Date.now() - startTime;
  
  if (verbose) {
    console.log(`📊 ContentAnalysis: Complete in ${processingTime}ms, is_derivative=${isDerivative}`);
  }
  
  return {
    embedding_extracted: true,
    is_derivative: isDerivative,
    similar_works: similarWorks,
    relationship_counts: relationshipCounts,
    threshold_used: threshold,
    total_found: similarWorks.length,
    processing_time_ms: processingTime,
  };
}

/**
 * Analyze content relationships between two specific audio files
 * 
 * @param {string|Buffer} audio1 - First audio file path or buffer
 * @param {string|Buffer} audio2 - Second audio file path or buffer
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<Object>} Direct comparison results
 */
async function compareAudioFiles(audio1, audio2, options = {}) {
  const { verbose = false } = options;
  const startTime = Date.now();
  
  if (verbose) {
    console.log(`📊 ContentAnalysis: Comparing two audio files...`);
  }
  
  // Extract embeddings for both files
  const [emb1Result, emb2Result] = await Promise.all([
    clap.getAudioEmbedding(audio1, { verbose }),
    clap.getAudioEmbedding(audio2, { verbose })
  ]);
  
  // Calculate similarity
  const similarity = clap.cosineSimilarity(emb1Result.embedding, emb2Result.embedding);
  const classification = classifyRelationship(similarity);
  
  return {
    similarity: parseFloat(similarity.toFixed(4)),
    relationship: classification.relationship,
    confidence: classification.confidence,
    description: classification.description,
    is_derivative: isDerivativeRelationship(classification.relationship),
    audio1_duration: emb1Result.duration,
    audio2_duration: emb2Result.duration,
    processing_time_ms: Date.now() - startTime
  };
}

/**
 * Analyze content from a pre-computed embedding
 * 
 * Useful when embedding is already available (e.g., during registration)
 * 
 * @param {Float32Array|number[]} embedding - Pre-computed CLAP embedding
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Content analysis results
 */
async function findRelatedFromEmbedding(embedding, options = {}) {
  const {
    threshold = DEFAULT_MIN_THRESHOLD,
    limit = DEFAULT_LIMIT,
    excludeId = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  const startTime = Date.now();
  
  if (verbose) {
    console.log(`📊 ContentAnalysis: Finding related content from pre-computed embedding...`);
  }
  
  // Convert embedding to PostgreSQL format
  const pgEmbedding = clap.embeddingToPostgres(embedding);
  
  // Query database for similar embeddings
  let similarResults;
  try {
    similarResults = await queries.findSimilarByEmbedding(pgEmbedding, {
      threshold,
      limit,
      excludeId
    });
  } catch (error) {
    return {
      error: `Database query failed: ${error.message}`,
      is_derivative: false,
      similar_works: [],
      processing_time_ms: Date.now() - startTime
    };
  }
  
  // Classify each result
  const similarWorks = similarResults.map(result => {
    const classification = classifyRelationship(result.similarity);
    
    return {
      registration_id: result.id,
      title: result.title,
      artist: result.artist,
      similarity: parseFloat(result.similarity.toFixed(4)),
      relationship: classification.relationship,
      confidence: classification.confidence,
    };
  });
  
  const isDerivative = similarWorks.some(
    work => isDerivativeRelationship(work.relationship)
  );
  
  return {
    is_derivative: isDerivative,
    similar_works: similarWorks,
    total_found: similarWorks.length,
    processing_time_ms: Date.now() - startTime,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main analysis functions
  findRelatedContent,
  compareAudioFiles,
  findRelatedFromEmbedding,
  
  // Classification functions
  classifyRelationship,
  isDerivativeRelationship,
  
  // Configuration (exported for testing/tuning)
  SIMILARITY_THRESHOLDS,
  DEFAULT_MIN_THRESHOLD,
  DEFAULT_LIMIT,
};


