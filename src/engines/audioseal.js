/**
 * ORBIT AudioSeal Neural Watermarking Engine (OrbitSeal)
 * 
 * High-fidelity neural audio watermarking with Meta FAIR AudioSeal:
 * - 40-bit (5-byte) Time-Division Slot Multiplexing Protocol (1.0s fixed intervals)
 * - Full 40-bit BLAKE3 hash capacity with CRC-2 integrity validation
 * - High SNR / SDR (34dB+) and robust compression resilience
 * 
 * @module engines/audioseal
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const idEngine = require('../utils/id');

/**
 * Resolve python command path for AudioSeal by traversing parent directories
 */
function resolvePythonCommand() {
  if (process.env.ORBIT_AUDIOSEAL_PYTHON) {
    return process.env.ORBIT_AUDIOSEAL_PYTHON;
  }
  if (process.env.ORBIT_PYTHON_PATH) {
    return process.env.ORBIT_PYTHON_PATH;
  }
  
  const isWin = process.platform === 'win32';
  let currentDir = __dirname;
  
  for (let i = 0; i < 4; i++) {
    const venvUnix = path.join(currentDir, '.venv', 'bin', 'python3');
    const venvWin = path.join(currentDir, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvUnix)) return venvUnix;
    if (fs.existsSync(venvWin)) return venvWin;
    
    const wmUnix = path.join(currentDir, '.venv-watermark', 'bin', 'python3');
    const wmWin = path.join(currentDir, '.venv-watermark', 'Scripts', 'python.exe');
    if (fs.existsSync(wmUnix)) return wmUnix;
    if (fs.existsSync(wmWin)) return wmWin;
    
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  
  return isWin ? 'python' : 'python3';
}

const AUDIOSEAL_CONFIG = {
  scriptPath: path.join(__dirname, '../../scripts/audioseal_watermark.py'),
  messageBytes: 5, // 40 bits
  sampleRate: 16000,
  pythonCommand: resolvePythonCommand(),
  embedTimeout: 180000,
  extractTimeout: 120000,
  confidenceThreshold: 0.45,
  env: {
    ...process.env,
    NO_TORCH_COMPILE: '1',
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  },
};

/**
 * Convert Buffer/hash to 5-byte BLAKE3 payload format
 * @param {Buffer} payloadHash 
 * @returns {Buffer} 5-byte Buffer
 */
function hashToPayload(payloadHash) {
  if (!Buffer.isBuffer(payloadHash)) {
    throw new Error('payloadHash must be a Buffer');
  }
  return payloadHash.slice(0, AUDIOSEAL_CONFIG.messageBytes);
}

/**
 * Check if Python and AudioSeal are available
 * @returns {Promise<{available: boolean, message: string, details?: Object}>}
 */
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    try {
      const pythonVersion = execFileSync(AUDIOSEAL_CONFIG.pythonCommand, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      if (!fs.existsSync(AUDIOSEAL_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'AudioSeal watermark script not found',
          details: { scriptPath: AUDIOSEAL_CONFIG.scriptPath }
        });
        return;
      }
      
      const proc = spawn(AUDIOSEAL_CONFIG.pythonCommand, [
        AUDIOSEAL_CONFIG.scriptPath,
        'check'
      ], {
        cwd: path.dirname(AUDIOSEAL_CONFIG.scriptPath),
        env: AUDIOSEAL_CONFIG.env,
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
              message: 'AudioSeal environment ready',
              details: { pythonVersion }
            });
          }
        } else {
          resolve({
            available: false,
            message: `AudioSeal check failed: ${stderr || stdout}`,
            details: { pythonVersion, install: 'pip install audioseal soundfile librosa blake3' }
          });
        }
      });
      
      proc.on('error', (err) => {
        resolve({
          available: false,
          message: `AudioSeal Python process error: ${err.message}`,
          details: { error: err.message }
        });
      });
      
    } catch (error) {
      resolve({
        available: false,
        message: `Python not available: ${error.message}`,
        details: {
          pythonCommand: AUDIOSEAL_CONFIG.pythonCommand,
          install: 'pip install audioseal soundfile librosa blake3'
        }
      });
    }
  });
}

/**
 * Embed watermark into audio using AudioSeal 40-bit frame multiplexing
 * @param {Buffer|string} input - Audio Buffer or file path
 * @param {Buffer} payloadHash - 5-byte (or full) BLAKE3 hash Buffer
 * @param {Object} options - Embed options
 * @returns {Promise<Object>}
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
      idEngine.tempAudioFilename('orbit-as-input', '.wav')
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
    idEngine.tempAudioFilename('orbit-as-output', '.wav')
  );
  
  const payload5 = hashToPayload(payloadHash);
  const payloadHex = payload5.toString('hex');
  
  try {
    if (verbose) {
      console.log(`[AudioSeal] Embedding 40-bit watermark (${payloadHex}) into ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const proc = spawn(AUDIOSEAL_CONFIG.pythonCommand, [
        AUDIOSEAL_CONFIG.scriptPath,
        'embed',
        audioPath,
        finalOutputPath,
        '--payload', payloadHex,
        '--sample-rate', String(AUDIOSEAL_CONFIG.sampleRate),
      ], {
        cwd: path.dirname(AUDIOSEAL_CONFIG.scriptPath),
        timeout: AUDIOSEAL_CONFIG.embedTimeout,
        env: AUDIOSEAL_CONFIG.env,
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
            reject(new Error(`AudioSeal embed error (${errorData.error}): ${errorData.message}`));
          } catch (e) {
            reject(new Error(`AudioSeal embed failed (code ${code}): ${stderr || stdout}`));
          }
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          const watermarkedAudio = fs.readFileSync(finalOutputPath);
          
          if (!outputPath) {
            try { fs.unlinkSync(finalOutputPath); } catch (e) { /* ignore */ }
          }
          
          resolve({
            success: true,
            outputPath: finalOutputPath,
            watermarkedAudio,
            sdr: result.sdr,
            payloadHash: payload5,
            payloadHex: result.payload_hex,
            duration: result.duration,
            processingTimeMs: elapsed,
            method: 'audioseal',
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse AudioSeal output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`AudioSeal process error: ${err.message}`));
      });
    });
  } finally {
    if (inputTempFile && fs.existsSync(inputTempFile)) {
      try { fs.unlinkSync(inputTempFile); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Extract watermark from audio using AudioSeal
 * @param {Buffer|string} input - Audio Buffer or file path
 * @param {Object} options - Extract options
 * @returns {Promise<Object>}
 */
async function extract(input, options = {}) {
  const {
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  let audioPath;
  let tempFile = null;
  
  if (Buffer.isBuffer(input)) {
    tempFile = path.join(
      os.tmpdir(),
      idEngine.tempAudioFilename('orbit-as-extract', '.wav')
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
      console.log(`[AudioSeal] Extracting watermark from ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const proc = spawn(AUDIOSEAL_CONFIG.pythonCommand, [
        AUDIOSEAL_CONFIG.scriptPath,
        'extract',
        audioPath,
        '--sample-rate', String(AUDIOSEAL_CONFIG.sampleRate),
      ], {
        cwd: path.dirname(AUDIOSEAL_CONFIG.scriptPath),
        timeout: AUDIOSEAL_CONFIG.extractTimeout,
        env: AUDIOSEAL_CONFIG.env,
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
            reject(new Error(`AudioSeal extract error (${errorData.error}): ${errorData.message}`));
          } catch (e) {
            reject(new Error(`AudioSeal extract failed (code ${code}): ${stderr || stdout}`));
          }
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          let payloadHash = null;
          if (result.payload_hex) {
            payloadHash = Buffer.from(result.payload_hex, 'hex');
          }
          
          const detected = !!result.detected && (result.confidence >= AUDIOSEAL_CONFIG.confidenceThreshold || result.crc_valid);
          
          resolve({
            success: true,
            detected,
            payloadHash,
            payloadHex: result.payload_hex || null,
            confidence: result.confidence || 0,
            crcValid: result.crc_valid || false,
            duration: result.duration,
            slotsDetected: result.slots_detected || [],
            processingTimeMs: elapsed,
            method: 'audioseal',
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse AudioSeal output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`AudioSeal process error: ${err.message}`));
      });
    });
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Compare extracted hash against expected hash
 * @param {Buffer} extractedHash 
 * @param {Buffer} expectedHash 
 * @returns {boolean}
 */
function hashMatches(extractedHash, expectedHash) {
  if (!extractedHash || !expectedHash) return false;
  const expectedPrefix = expectedHash.slice(0, AUDIOSEAL_CONFIG.messageBytes);
  return extractedHash.slice(0, AUDIOSEAL_CONFIG.messageBytes).equals(expectedPrefix);
}

module.exports = {
  embed,
  extract,
  checkPythonEnvironment,
  hashToPayload,
  hashMatches,
  config: { ...AUDIOSEAL_CONFIG },
  MESSAGE_BYTES: AUDIOSEAL_CONFIG.messageBytes,
};
