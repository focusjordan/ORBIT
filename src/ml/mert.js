/**
 * ORBIT MERT Semantic Fingerprinting
 * 
 * Neural fingerprinting with MERT
 * 
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  LICENSE WARNING: MERT IS NON-COMMERCIAL USE ONLY (CC BY-NC 4.0)     ║
 * ║                                                                          ║
 * ║  The MERT model weights are licensed under Creative Commons              ║
 * ║  Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).             ║
 * ║                                                                          ║
 * ║  For COMMERCIAL deployments, use CLAP embeddings instead:                ║
 * ║  - Set ORBIT_EMBEDDING_PROVIDER=clap (default)                           ║
 * ║  - CLAP is Apache 2.0 licensed (commercially licensable)                 ║
 * ║                                                                          ║
 * ║  MERT is available for:                                                  ║
 * ║  - Research and development                                              ║
 * ║  - Internal testing                                                      ║
 * ║  - Non-commercial applications                                           ║
 * ║                                                                          ║
 * ║  Set ORBIT_EMBEDDING_PROVIDER=mert to explicitly enable (non-commercial) ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * MERT (Music Embedding Representation Transformer) generates 768-dimensional
 * semantic embeddings that are invariant to pitch shifts, speed changes,
 * and other audio transformations that break traditional fingerprinting.
 * 
 * Architecture:
 * - Uses Python bridge (scripts/mert_embed.py) for PyTorch model inference
 * - Lazy loading - model downloaded on first use (~400MB)
 * - Embeddings are L2-normalized for cosine similarity
 * 
 * Dual Fingerprint Strategy (see ORBIT_ENHANCEMENTS.md Section 2):
 * 1. Chromaprint: Fast exact-match detection (95% of cases)
 * 2. MERT/CLAP (this module or clap.js): Semantic similarity for edge cases
 * 
 * @see ORBIT_SPECIFICATION.md Section 12 (Zero-Shot ML Enhancements)
 * @see ORBIT_ENHANCEMENTS.md Section 2 (Neural Fingerprinting)
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * MERT Configuration
 */
const MERT_CONFIG = {
  // Path to Python embedding script
  scriptPath: path.join(__dirname, '../../scripts/mert_embed.py'),
  
  // Model identifier
  model: 'm-a-p/MERT-v1-95M',
  
  // Output embedding dimension
  embeddingDim: 768,
  
  // Max audio length to process (seconds) - for memory efficiency
  maxLengthSeconds: 30,
  
  // Python command - prefer virtual environment if it exists
  pythonCommand: process.env.ORBIT_PYTHON_PATH || 
    (require('fs').existsSync(require('path').join(__dirname, '../../.venv/bin/python3')) 
      ? require('path').join(__dirname, '../../.venv/bin/python3')
      : 'python3'),
  
  // Timeout for embedding generation (ms)
  timeout: 120000, // 2 minutes (model download can take time on first run)
};

/**
 * Check if Python and required dependencies are available
 * @returns {Promise<{available: boolean, message: string, details?: Object}>}
 */
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    try {
      // Check Python is available
      const pythonVersion = execFileSync(MERT_CONFIG.pythonCommand, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      // Check if our script exists
      if (!fs.existsSync(MERT_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'MERT embedding script not found',
          details: { scriptPath: MERT_CONFIG.scriptPath }
        });
        return;
      }
      
      // Quick dependency check using the script's built-in check
      const proc = spawn(MERT_CONFIG.pythonCommand, [
        '-c',
        'import torch, transformers, librosa, numpy; print("ok")'
      ]);
      
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0 && output.includes('ok')) {
          resolve({
            available: true,
            message: 'Python environment ready',
            details: {
              pythonVersion,
              packages: ['torch', 'transformers', 'librosa', 'numpy']
            }
          });
        } else {
          resolve({
            available: false,
            message: 'Missing Python dependencies for MERT',
            details: {
              pythonVersion,
              install: 'pip install -r scripts/requirements-ml.txt',
              error: errorOutput || 'Import check failed'
            }
          });
        }
      });
      
      proc.on('error', (err) => {
        resolve({
          available: false,
          message: `Python process error: ${err.message}`,
          details: { error: err.message }
        });
      });
      
    } catch (error) {
      resolve({
        available: false,
        message: `Python not available: ${error.message}`,
        details: {
          pythonCommand: MERT_CONFIG.pythonCommand,
          install: 'Install Python 3.8+ and run: pip install -r scripts/requirements-ml.txt'
        }
      });
    }
  });
}

/**
 * Generate MERT embedding for an audio file
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {number} options.maxLength - Max audio length in seconds (default: 30)
 * @param {boolean} options.verbose - Log progress (default: false)
 * @returns {Promise<{embedding: Float32Array, duration: number, model: string}>}
 * @throws {Error} If Python not available, dependencies missing, or processing fails
 * 
 * @example
 * const { embedding, duration } = await getEmbedding('/path/to/audio.mp3');
 * console.log(`Generated ${embedding.length}-dim embedding for ${duration}s audio`);
 */
async function getEmbedding(input, options = {}) {
  const {
    maxLength = MERT_CONFIG.maxLengthSeconds,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  // Handle buffer input - write to temp file
  let audioPath;
  let tempFile = null;
  
  if (Buffer.isBuffer(input)) {
    tempFile = path.join(
      os.tmpdir(),
      `orbit-mert-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`
    );
    fs.writeFileSync(tempFile, input);
    audioPath = tempFile;
  } else if (typeof input === 'string') {
    audioPath = input;
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
  } else {
    throw new Error('Input must be a file path string or Buffer');
  }
  
  try {
    if (verbose) {
      console.log(`[MERT] Processing ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // Set cache dir environment variable
      const env = { ...process.env };
      if (process.env.ORBIT_MODEL_CACHE_DIR) {
        env.ORBIT_MODEL_CACHE_DIR = process.env.ORBIT_MODEL_CACHE_DIR;
      }
      
      const proc = spawn(MERT_CONFIG.pythonCommand, [
        MERT_CONFIG.scriptPath,
        audioPath,
        '--output', 'json',
        '--max-length', String(maxLength),
        '--model', MERT_CONFIG.model,
      ], {
        env,
        timeout: MERT_CONFIG.timeout,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (verbose) {
          // Python progress messages go to stderr
          process.stderr.write(data);
        }
      });
      
      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        
        if (code !== 0) {
          // Try to parse error from stdout (our script outputs JSON errors)
          try {
            // Extract JSON from stdout - may have warnings before it
            let jsonStr = stdout;
            const jsonStart = stdout.indexOf('{');
            if (jsonStart >= 0) {
              jsonStr = stdout.slice(jsonStart);
            }
            const errorData = JSON.parse(jsonStr);
            if (errorData.error) {
              reject(new Error(`MERT error (${errorData.error}): ${errorData.message}`));
              return;
            }
          } catch (e) {
            // Not JSON, use raw output
          }
          reject(new Error(`MERT process failed (code ${code}): ${stderr || stdout}`));
          return;
        }
        
        try {
          // Extract JSON from stdout - the MERT model may print warnings before the JSON
          // Look for the first '{' which starts our JSON output
          let jsonStr = stdout;
          const jsonStart = stdout.indexOf('{');
          if (jsonStart > 0) {
            // There's text before the JSON (e.g., warnings from the model)
            jsonStr = stdout.slice(jsonStart);
          }
          
          const result = JSON.parse(jsonStr);
          
          if (result.error) {
            reject(new Error(`MERT error (${result.error}): ${result.message}`));
            return;
          }
          
          // Convert embedding array to Float32Array
          const embedding = new Float32Array(result.embedding);
          
          if (verbose) {
            console.log(`[MERT] Generated ${embedding.length}-dim embedding in ${(elapsed / 1000).toFixed(1)}s`);
          }
          
          resolve({
            embedding,
            duration: result.duration,
            model: result.model,
            embeddingDim: result.embedding_dim,
            device: result.device,
            processingTimeMs: elapsed,
          });
          
        } catch (parseError) {
          reject(new Error(`Failed to parse MERT output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
          reject(new Error(`MERT processing timed out after ${MERT_CONFIG.timeout / 1000}s`));
        } else {
          reject(new Error(`MERT process error: ${err.message}`));
        }
      });
    });
    
  } finally {
    // Clean up temp file
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * 
 * Both embeddings should be L2-normalized (as MERT outputs are).
 * For normalized vectors, cosine similarity = dot product.
 * 
 * @param {Float32Array|number[]} embedding1 - First embedding (768-dim)
 * @param {Float32Array|number[]} embedding2 - Second embedding (768-dim)
 * @returns {number} Similarity score in range [-1, 1], typically [0, 1] for audio
 * 
 * @example
 * const sim = cosineSimilarity(embedding1, embedding2);
 * if (sim > 0.85) console.log('Possible duplicate or remix');
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

/**
 * Classify relationship between two tracks based on similarity
 * 
 * @param {number} similarity - Cosine similarity score
 * @returns {{relationship: string, confidence: string}}
 * 
 * Thresholds (from ORBIT_ENHANCEMENTS.md Section 4):
 * - 0.99-1.00: EXACT_DUPLICATE
 * - 0.95-0.99: TRANSCODED (same recording, different format)
 * - 0.85-0.95: POSSIBLE_REMIX
 * - 0.70-0.85: POSSIBLE_COVER
 * - 0.50-0.70: STYLISTICALLY_SIMILAR
 * - < 0.50: DIFFERENT_WORK
 */
function classifyRelationship(similarity) {
  if (similarity >= 0.99) {
    return { relationship: 'EXACT_DUPLICATE', confidence: 'very_high' };
  }
  if (similarity >= 0.95) {
    return { relationship: 'TRANSCODED', confidence: 'high' };
  }
  if (similarity >= 0.85) {
    return { relationship: 'POSSIBLE_REMIX', confidence: 'medium' };
  }
  if (similarity >= 0.70) {
    return { relationship: 'POSSIBLE_COVER', confidence: 'medium' };
  }
  if (similarity >= 0.50) {
    return { relationship: 'STYLISTICALLY_SIMILAR', confidence: 'low' };
  }
  return { relationship: 'DIFFERENT_WORK', confidence: 'high' };
}

/**
 * Serialize Float32Array to Buffer for database storage
 * @param {Float32Array} embedding 
 * @returns {Buffer}
 */
function embeddingToBuffer(embedding) {
  return Buffer.from(embedding.buffer);
}

/**
 * Deserialize Buffer to Float32Array
 * @param {Buffer} buffer 
 * @returns {Float32Array}
 */
function bufferToEmbedding(buffer) {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
}

/**
 * Format embedding for PostgreSQL vector type
 * Uses fixed precision to avoid floating-point representation issues
 * @param {Float32Array|number[]} embedding 
 * @returns {string} PostgreSQL vector string format: '[0.1,0.2,...]'
 */
function embeddingToPostgres(embedding) {
  // Use 8 decimal places - sufficient precision for ML embeddings
  // while avoiding Float32 representation artifacts
  const formatted = Array.from(embedding)
    .map(v => v.toFixed(8))
    .join(',');
  return `[${formatted}]`;
}

/**
 * Parse PostgreSQL vector string to Float32Array
 * @param {string} vectorString - PostgreSQL vector format '[0.1,0.2,...]'
 * @returns {Float32Array}
 */
function postgresVectorToEmbedding(vectorString) {
  // Handle null/undefined
  if (!vectorString) return null;
  
  // Remove brackets and split
  const values = vectorString
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(parseFloat);
  
  return new Float32Array(values);
}

// Export configuration for testing/debugging
const config = { ...MERT_CONFIG };

module.exports = {
  // Core functions
  getEmbedding,
  cosineSimilarity,
  classifyRelationship,
  checkPythonEnvironment,
  
  // Serialization helpers
  embeddingToBuffer,
  bufferToEmbedding,
  embeddingToPostgres,
  postgresVectorToEmbedding,
  
  // Configuration
  config,
  EMBEDDING_DIM: MERT_CONFIG.embeddingDim,
};
