/**
 * ORBIT Perth Neural Watermarking Fallback Engine (OrbitPerth)
 * 
 * Perceptual neural audio watermarking with Resemble AI PerTh:
 * - Implicit neural watermarking for tamper-resistant presence verification
 * - Seamless fallback when primary AudioSeal is not configured or fails
 * 
 * @module engines/perth
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const idEngine = require('../utils/id');

/**
 * Resolve python command path for Perth
 */
function resolvePythonCommand() {
  if (process.env.ORBIT_PERTH_PYTHON) {
    return process.env.ORBIT_PERTH_PYTHON;
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

const PERTH_CONFIG = {
  scriptPath: path.join(__dirname, '../../scripts/perth_watermark.py'),
  sampleRate: 16000,
  pythonCommand: resolvePythonCommand(),
  embedTimeout: 180000,
  extractTimeout: 120000,
  confidenceThreshold: 0.5,
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  },
};

/**
 * Check if Python and Perth are available
 * @returns {Promise<{available: boolean, message: string, details?: Object}>}
 */
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    try {
      const pythonVersion = execFileSync(PERTH_CONFIG.pythonCommand, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      if (!fs.existsSync(PERTH_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'Perth watermark script not found',
          details: { scriptPath: PERTH_CONFIG.scriptPath }
        });
        return;
      }
      
      const proc = spawn(PERTH_CONFIG.pythonCommand, [
        PERTH_CONFIG.scriptPath,
        'check'
      ], {
        cwd: path.dirname(PERTH_CONFIG.scriptPath),
        env: PERTH_CONFIG.env,
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
              message: 'Perth environment ready',
              details: { pythonVersion }
            });
          }
        } else {
          resolve({
            available: false,
            message: `Perth check failed: ${stderr || stdout}`,
            details: { pythonVersion, install: 'pip install resemble-perth soundfile librosa' }
          });
        }
      });
      
      proc.on('error', (err) => {
        resolve({
          available: false,
          message: `Perth Python process error: ${err.message}`,
          details: { error: err.message }
        });
      });
      
    } catch (error) {
      resolve({
        available: false,
        message: `Python not available: ${error.message}`,
        details: {
          pythonCommand: PERTH_CONFIG.pythonCommand,
          install: 'pip install resemble-perth soundfile librosa'
        }
      });
    }
  });
}

/**
 * Embed Perth neural watermark into audio
 * @param {Buffer|string} input - Audio Buffer or file path
 * @param {Object} options - Embed options
 * @returns {Promise<Object>}
 */
async function embed(input, options = {}) {
  const {
    outputPath = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  let audioPath;
  let inputTempFile = null;
  
  if (Buffer.isBuffer(input)) {
    inputTempFile = path.join(
      os.tmpdir(),
      idEngine.tempAudioFilename('orbit-perth-input', '.wav')
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
    idEngine.tempAudioFilename('orbit-perth-output', '.wav')
  );
  
  try {
    if (verbose) {
      console.log(`[Perth] Embedding perceptual watermark into ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const proc = spawn(PERTH_CONFIG.pythonCommand, [
        PERTH_CONFIG.scriptPath,
        'embed',
        audioPath,
        finalOutputPath,
        '--sample-rate', String(PERTH_CONFIG.sampleRate),
      ], {
        cwd: path.dirname(PERTH_CONFIG.scriptPath),
        timeout: PERTH_CONFIG.embedTimeout,
        env: PERTH_CONFIG.env,
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
            reject(new Error(`Perth embed error (${errorData.error}): ${errorData.message}`));
          } catch (e) {
            reject(new Error(`Perth embed failed (code ${code}): ${stderr || stdout}`));
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
            duration: result.duration,
            processingTimeMs: elapsed,
            method: 'perth',
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse Perth output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`Perth process error: ${err.message}`));
      });
    });
  } finally {
    if (inputTempFile && fs.existsSync(inputTempFile)) {
      try { fs.unlinkSync(inputTempFile); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Extract watermark from audio using Perth
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
      idEngine.tempAudioFilename('orbit-perth-extract', '.wav')
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
      console.log(`[Perth] Extracting watermark from ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const proc = spawn(PERTH_CONFIG.pythonCommand, [
        PERTH_CONFIG.scriptPath,
        'extract',
        audioPath,
        '--sample-rate', String(PERTH_CONFIG.sampleRate),
      ], {
        cwd: path.dirname(PERTH_CONFIG.scriptPath),
        timeout: PERTH_CONFIG.extractTimeout,
        env: PERTH_CONFIG.env,
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
            reject(new Error(`Perth extract error (${errorData.error}): ${errorData.message}`));
          } catch (e) {
            reject(new Error(`Perth extract failed (code ${code}): ${stderr || stdout}`));
          }
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          const detected = !!result.detected && (result.confidence >= PERTH_CONFIG.confidenceThreshold);
          
          resolve({
            success: true,
            detected,
            confidence: result.confidence || 0,
            duration: result.duration,
            processingTimeMs: elapsed,
            method: 'perth',
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse Perth output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`Perth process error: ${err.message}`));
      });
    });
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
    }
  }
}

module.exports = {
  embed,
  extract,
  checkPythonEnvironment,
  config: { ...PERTH_CONFIG },
};
