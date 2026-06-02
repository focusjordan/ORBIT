/**
 * ORBIT SilentCipher Neural Watermarking Standalone Connector
 * 
 * Performs robust neural watermarking using package-local scripts/silentcipher_watermark.py:
 * - SilentCipher (Sony AI) INTERSPEECH 2024 neural watermarking
 * - High-fidelity sample embedding (survives AAC, MP3, Opus downsampling)
 * - Message capacity: 5 bytes (40 bits)
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Resolve python command path for SilentCipher by traversing parent directories to find virtual environments.
 */
function resolvePythonCommand() {
  if (process.env.ORBIT_SILENTCIPHER_PYTHON) {
    return process.env.ORBIT_SILENTCIPHER_PYTHON;
  }
  let currentDir = __dirname;
  for (let i = 0; i < 4; i++) {
    const watermarkVenv = path.join(currentDir, '.venv-watermark/bin/python3');
    if (fs.existsSync(watermarkVenv)) {
      return watermarkVenv;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  if (process.env.ORBIT_PYTHON_PATH) {
    return process.env.ORBIT_PYTHON_PATH;
  }
  currentDir = __dirname;
  for (let i = 0; i < 4; i++) {
    const standardVenv = path.join(currentDir, '.venv/bin/python3');
    if (fs.existsSync(standardVenv)) {
      return standardVenv;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return 'python3';
}

/**
 * SilentCipher Configuration
 */
const SILENTCIPHER_CONFIG = {
  // Path to Python watermarking script relative to this file inside installed package
  scriptPath: path.join(__dirname, '../scripts/silentcipher_watermark.py'),
  
  // Message capacity: 5 bytes (SilentCipher's native format)
  messageBytes: 5,
  
  // Target sample rate for processing
  sampleRate: 44100,
  
  // Python command - SilentCipher needs separate venv due to torch<=2.0.0 requirement
  pythonCommand: resolvePythonCommand(),
  
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
 */
function hashToMessage(payloadHash) {
  if (!Buffer.isBuffer(payloadHash)) {
    throw new Error('payloadHash must be a Buffer');
  }
  const truncated = payloadHash.slice(0, SILENTCIPHER_CONFIG.messageBytes);
  return Array.from(truncated);
}

/**
 * Convert SilentCipher's 5-byte message back to Buffer
 */
function messageToHash(message) {
  if (!Array.isArray(message) || message.length !== SILENTCIPHER_CONFIG.messageBytes) {
    throw new Error(`Message must be array of ${SILENTCIPHER_CONFIG.messageBytes} integers`);
  }
  return Buffer.from(message);
}

/**
 * Check if Python and SilentCipher are available
 */
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    try {
      const pythonVersion = execSync(`${SILENTCIPHER_CONFIG.pythonCommand} --version`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      if (!fs.existsSync(SILENTCIPHER_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'SilentCipher watermark script not found',
          details: { scriptPath: SILENTCIPHER_CONFIG.scriptPath }
        });
        return;
      }
      
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
 */
async function embed(input, payloadHash, options = {}) {
  const {
    outputPath = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
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
  
  const finalOutputPath = outputPath || path.join(
    os.tmpdir(),
    `orbit-sc-output-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
  );
  
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
      
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (verbose) process.stderr.write(data);
      });
      
      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        
        if (code !== 0) {
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
    if (inputTempFile && fs.existsSync(inputTempFile)) {
      fs.unlinkSync(inputTempFile);
    }
  }
}

/**
 * Extract watermark from audio file using SilentCipher
 */
async function extract(input, options = {}) {
  const {
    phaseShiftDecoding = true,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
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
      
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (verbose) process.stderr.write(data);
      });
      
      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        
        if (code !== 0) {
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
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

function hashMatches(extractedHash, expectedHash) {
  if (!extractedHash || !expectedHash) return false;
  const expectedPrefix = expectedHash.slice(0, SILENTCIPHER_CONFIG.messageBytes);
  return extractedHash.equals(expectedPrefix);
}

function readWatermarkedAudio(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Watermarked audio file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

module.exports = {
  embed,
  extract,
  checkPythonEnvironment,
  hashToMessage,
  messageToHash,
  hashMatches,
  readWatermarkedAudio,
  config: { ...SILENTCIPHER_CONFIG },
  MESSAGE_BYTES: SILENTCIPHER_CONFIG.messageBytes,
};
