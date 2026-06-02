/**
 * ORBIT SilentCipher Neural Watermarking
 * 
 * Neural watermarking with SilentCipher (Sony AI)
 * 
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ✅ LICENSE: MIT (Commercially Licensable)                               ║
 * ║                                                                          ║
 * ║  SilentCipher is released under the MIT License by Sony AI.              ║
 * ║  This allows unrestricted commercial use, modification, and              ║
 * ║  distribution.                                                           ║
 * ║                                                                          ║
 * ║  Source: https://github.com/sony/silentcipher                            ║
 * ║  Paper: INTERSPEECH 2024                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * SilentCipher provides robust neural watermarking that survives:
 * - MP3/AAC compression (even 128kbps)
 * - Streaming quality (Opus 64k)
 * - Minor time stretching
 * - Audio editing
 * 
 * Architecture:
 * - Uses Python bridge (scripts/silentcipher_watermark.py) for model inference
 * - Message capacity: 5 bytes (40 bits) - embeds truncated payload hash
 * - Lazy loading - model downloaded on first use (~100MB)
 * 
 * Integration Strategy:
 * - SilentCipher is PRIMARY watermarking method
 * - Spread spectrum (engines/watermark.js) is FALLBACK when neural fails
 * 
 * @see ORBIT_SPECIFICATION.md Section 7.2 (Watermark Engine)
 * @see ORBIT_ENHANCEMENTS.md Section 1 (Neural Watermarking)
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

/**
 * SilentCipher Configuration
 * 
 * NOTE: SilentCipher requires torch<=2.0.0, which conflicts with newer torch versions
 * used by other ORBIT ML components. Use a separate virtual environment:
 * 
 *   python -m venv .venv-watermark
 *   source .venv-watermark/bin/activate
 *   pip install torch==2.0.0 silentcipher librosa soundfile numpy
 * 
 * Then set ORBIT_SILENTCIPHER_PYTHON=/path/to/ORBIT/.venv-watermark/bin/python3
 */
const SILENTCIPHER_CONFIG = {
  // Path to Python watermarking script
  scriptPath: path.join(__dirname, '../../scripts/silentcipher_watermark.py'),
  
  // Message capacity: 5 bytes (SilentCipher's native format)
  messageBytes: 5,
  
  // Target sample rate for processing
  sampleRate: 44100,
  
  // Python command - SilentCipher needs separate venv due to torch<=2.0.0 requirement
  // Priority: ORBIT_SILENTCIPHER_PYTHON > .venv-watermark > ORBIT_PYTHON_PATH > .venv > python3
  pythonCommand: process.env.ORBIT_SILENTCIPHER_PYTHON || 
    (fs.existsSync(path.join(__dirname, '../../.venv-watermark/bin/python3')) 
      ? path.join(__dirname, '../../.venv-watermark/bin/python3')
      : process.env.ORBIT_PYTHON_PATH || 
        (fs.existsSync(path.join(__dirname, '../../.venv/bin/python3')) 
          ? path.join(__dirname, '../../.venv/bin/python3')
          : 'python3')),
  
  // Timeout for operations (ms)
  embedTimeout: 180000,  // 3 minutes (model download + embed)
  extractTimeout: 120000, // 2 minutes
  
  // Confidence threshold for valid extraction
  confidenceThreshold: 0.5,

  // Limit BLAS/OpenMP threads to prevent stack-overflow crashes on Apple Silicon
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  },
};

/**
 * Convert a Buffer/hash to SilentCipher's 5-byte message format
 * 
 * We take the first 5 bytes of the payload hash to create a lookup key.
 * This is enough to uniquely identify the payload in the ledger
 * (5 bytes = 40 bits = 1 trillion combinations).
 * 
 * @param {Buffer} payloadHash - Full payload hash (typically 16-32 bytes)
 * @returns {number[]} Array of 5 integers (0-255)
 */
function hashToMessage(payloadHash) {
  if (!Buffer.isBuffer(payloadHash)) {
    throw new Error('payloadHash must be a Buffer');
  }
  
  // Take first 5 bytes
  const truncated = payloadHash.slice(0, SILENTCIPHER_CONFIG.messageBytes);
  
  // Convert to array of integers
  return Array.from(truncated);
}

/**
 * Convert SilentCipher's 5-byte message back to Buffer
 * 
 * @param {number[]} message - Array of 5 integers (0-255)
 * @returns {Buffer} 5-byte buffer
 */
function messageToHash(message) {
  if (!Array.isArray(message) || message.length !== SILENTCIPHER_CONFIG.messageBytes) {
    throw new Error(`Message must be array of ${SILENTCIPHER_CONFIG.messageBytes} integers`);
  }
  
  return Buffer.from(message);
}

/**
 * Check if Python and SilentCipher are available
 * 
 * @returns {Promise<{available: boolean, message: string, details?: Object}>}
 */
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    try {
      // Check Python is available
      const pythonVersion = execSync(`${SILENTCIPHER_CONFIG.pythonCommand} --version`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      // Check if our script exists
      if (!fs.existsSync(SILENTCIPHER_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'SilentCipher watermark script not found',
          details: { scriptPath: SILENTCIPHER_CONFIG.scriptPath }
        });
        return;
      }
      
      // Run the check command
      const proc = spawn(SILENTCIPHER_CONFIG.pythonCommand, [
        SILENTCIPHER_CONFIG.scriptPath,
        'check'
      ], {
        cwd: path.dirname(SILENTCIPHER_CONFIG.scriptPath),
        env: SILENTCIPHER_CONFIG.env,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (e) {
            resolve({
              available: true,
              message: 'SilentCipher environment ready',
              details: { pythonVersion }
            });
          }
        } else {
          // Try to parse error from stdout
          try {
            const errorData = JSON.parse(stdout);
            resolve({
              available: false,
              message: errorData.message || 'SilentCipher check failed',
              details: errorData
            });
          } catch (e) {
            resolve({
              available: false,
              message: `SilentCipher check failed: ${stderr || stdout}`,
              details: {
                pythonVersion,
                install: 'pip install silentcipher librosa soundfile numpy'
              }
            });
          }
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
          pythonCommand: SILENTCIPHER_CONFIG.pythonCommand,
          install: 'Install Python 3.8+ and run: pip install silentcipher librosa soundfile numpy'
        }
      });
    }
  });
}

/**
 * Embed watermark into audio file using SilentCipher
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Buffer} payloadHash - Full payload hash (we use first 5 bytes)
 * @param {Object} options - Options
 * @param {string} options.outputPath - Path to save watermarked audio (optional, uses temp if not provided)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<{success: boolean, outputPath: string, sdr: number, message: number[], error?: string}>}
 * 
 * @example
 * const payloadHash = crypto.createHash('sha256').update(cborPayload).digest();
 * const result = await embed('/path/to/audio.wav', payloadHash);
 * // result.outputPath contains the watermarked audio
 */
async function embed(input, payloadHash, options = {}) {
  const {
    outputPath = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  // Handle buffer input - write to temp file
  let audioPath;
  let inputTempFile = null;
  
  if (Buffer.isBuffer(input)) {
    inputTempFile = path.join(
      os.tmpdir(),
      `orbit-sc-input-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
    );
    fs.writeFileSync(inputTempFile, input);
    audioPath = inputTempFile;
  } else if (typeof input === 'string') {
    audioPath = input;
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
  } else {
    throw new Error('Input must be a file path string or Buffer');
  }
  
  // Create output path
  const finalOutputPath = outputPath || path.join(
    os.tmpdir(),
    `orbit-sc-output-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
  );
  
  // Convert payload hash to message
  const message = hashToMessage(payloadHash);
  const messageStr = message.join(',');
  
  try {
    if (verbose) {
      console.log(`[SilentCipher] Embedding watermark into ${audioPath}`);
      console.log(`   Message: [${messageStr}]`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const proc = spawn(SILENTCIPHER_CONFIG.pythonCommand, [
        SILENTCIPHER_CONFIG.scriptPath,
        'embed',
        audioPath,
        finalOutputPath,
        '--message', messageStr,
        '--sample-rate', String(SILENTCIPHER_CONFIG.sampleRate),
      ], {
        cwd: path.dirname(SILENTCIPHER_CONFIG.scriptPath),
        timeout: SILENTCIPHER_CONFIG.embedTimeout,
        env: SILENTCIPHER_CONFIG.env,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (verbose) {
          process.stderr.write(data);
        }
      });
      
      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        
        if (code !== 0) {
          // Try to parse error
          try {
            const errorData = JSON.parse(stdout);
            reject(new Error(`SilentCipher embed error (${errorData.error}): ${errorData.message}`));
          } catch (e) {
            reject(new Error(`SilentCipher embed failed (code ${code}): ${stderr || stdout}`));
          }
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          
          if (verbose) {
            console.log(`[SilentCipher] Embedded in ${(elapsed / 1000).toFixed(1)}s (SDR: ${result.sdr?.toFixed(1)}dB)`);
          }
          
          resolve({
            success: true,
            outputPath: finalOutputPath,
            sdr: result.sdr,
            message: result.message,
            duration: result.duration,
            processingTimeMs: elapsed,
            method: 'silentcipher',
          });
          
        } catch (parseError) {
          reject(new Error(`Failed to parse SilentCipher output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
          reject(new Error(`SilentCipher embed timed out after ${SILENTCIPHER_CONFIG.embedTimeout / 1000}s`));
        } else {
          reject(new Error(`SilentCipher process error: ${err.message}`));
        }
      });
    });
    
  } finally {
    // Clean up input temp file
    if (inputTempFile && fs.existsSync(inputTempFile)) {
      fs.unlinkSync(inputTempFile);
    }
  }
}

/**
 * Extract watermark from audio file using SilentCipher
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {boolean} options.phaseShiftDecoding - Enable for better robustness to crops (default: true)
 * @param {boolean} options.verbose - Log progress
 * @returns {Promise<{success: boolean, detected: boolean, message: number[]|null, payloadHash: Buffer|null, confidence: number}>}
 * 
 * @example
 * const result = await extract('/path/to/watermarked.mp3');
 * if (result.detected) {
 *   console.log('Payload hash prefix:', result.payloadHash.toString('hex'));
 * }
 */
async function extract(input, options = {}) {
  const {
    phaseShiftDecoding = true,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  // Handle buffer input - write to temp file
  let audioPath;
  let tempFile = null;
  
  if (Buffer.isBuffer(input)) {
    tempFile = path.join(
      os.tmpdir(),
      `orbit-sc-extract-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
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
      console.log(`[SilentCipher] Extracting watermark from ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const args = [
        SILENTCIPHER_CONFIG.scriptPath,
        'extract',
        audioPath,
        '--sample-rate', String(SILENTCIPHER_CONFIG.sampleRate),
      ];
      
      if (!phaseShiftDecoding) {
        args.push('--no-phase-shift');
      }
      
      const proc = spawn(SILENTCIPHER_CONFIG.pythonCommand, args, {
        cwd: path.dirname(SILENTCIPHER_CONFIG.scriptPath),
        timeout: SILENTCIPHER_CONFIG.extractTimeout,
        env: SILENTCIPHER_CONFIG.env,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (verbose) {
          process.stderr.write(data);
        }
      });
      
      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        
        if (code !== 0) {
          // Try to parse error
          try {
            const errorData = JSON.parse(stdout);
            reject(new Error(`SilentCipher extract error (${errorData.error}): ${errorData.message}`));
          } catch (e) {
            reject(new Error(`SilentCipher extract failed (code ${code}): ${stderr || stdout}`));
          }
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          
          // Convert message back to buffer if detected
          let payloadHash = null;
          if (result.detected && result.message) {
            payloadHash = messageToHash(result.message);
          }
          
          const detected = result.detected && 
                          result.confidence >= SILENTCIPHER_CONFIG.confidenceThreshold;
          
          if (verbose) {
            if (detected) {
              console.log(`[SilentCipher] Detected watermark (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
            } else {
              console.log(`[SilentCipher] No watermark detected`);
            }
          }
          
          resolve({
            success: true,
            detected,
            message: result.message,
            payloadHash,
            confidence: result.confidence || 0,
            duration: result.duration,
            processingTimeMs: elapsed,
            method: 'silentcipher',
          });
          
        } catch (parseError) {
          reject(new Error(`Failed to parse SilentCipher output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
          reject(new Error(`SilentCipher extract timed out after ${SILENTCIPHER_CONFIG.extractTimeout / 1000}s`));
        } else {
          reject(new Error(`SilentCipher process error: ${err.message}`));
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
 * Check if extracted payload hash matches expected hash
 * 
 * Since we only embed 5 bytes of the hash, we compare the prefix.
 * 
 * @param {Buffer} extractedHash - 5-byte hash from extraction
 * @param {Buffer} expectedHash - Full payload hash to compare
 * @returns {boolean}
 */
function hashMatches(extractedHash, expectedHash) {
  if (!extractedHash || !expectedHash) return false;
  
  // Compare first 5 bytes
  const expectedPrefix = expectedHash.slice(0, SILENTCIPHER_CONFIG.messageBytes);
  return extractedHash.equals(expectedPrefix);
}

/**
 * Read watermarked audio file and return as Buffer
 * Helper function for API integration
 * 
 * @param {string} filePath - Path to watermarked audio file
 * @returns {Buffer}
 */
function readWatermarkedAudio(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Watermarked audio file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

// Export configuration for testing/debugging
const config = { ...SILENTCIPHER_CONFIG };

module.exports = {
  // Core functions
  embed,
  extract,
  checkPythonEnvironment,
  
  // Hash conversion utilities
  hashToMessage,
  messageToHash,
  hashMatches,
  
  // Helper functions
  readWatermarkedAudio,
  
  // Configuration
  config,
  MESSAGE_BYTES: SILENTCIPHER_CONFIG.messageBytes,
};
