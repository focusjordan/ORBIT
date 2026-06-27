/**
 * ORBIT Classical DSP Audio Analysis Standalone Connector
 * 
 * Performs fast, traditional audio analysis using package-local scripts/audio_dsp.py:
 * - BPM (tempo) detection with confidence scores
 * - Musical key detection using Krumhansl-Schmuckler algorithm
 * - Energy level calculation
 * - Loudness measurement
 * - Dynamic range
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Detect audio format from buffer magic bytes
 */
function detectAudioExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return '.wav';
  const head = buffer.slice(0, 12);
  if (head.slice(0, 4).toString('ascii') === 'RIFF') return '.wav';
  if (head.slice(0, 4).toString('ascii') === 'fLaC') return '.flac';
  if (head.slice(0, 4).toString('ascii') === 'OggS') return '.ogg';
  if (head.slice(0, 3).toString('ascii') === 'ID3') return '.mp3';
  if (head[0] === 0xFF && (head[1] & 0xE0) === 0xE0) return '.mp3';
  if (head.slice(4, 8).toString('ascii') === 'ftyp') return '.m4a';
  if (head.slice(0, 4).toString('ascii') === 'FORM') return '.aiff';
  return '.wav';
}

/**
 * Resolve python command path by checking up to parent directories for a virtual environment.
 */
function resolvePythonCommand() {
  if (process.env.ORBIT_PYTHON_PATH) {
    return process.env.ORBIT_PYTHON_PATH;
  }
  const isWin = process.platform === 'win32';
  let currentDir = __dirname;
  for (let i = 0; i < 4; i++) {
    const unixVenv = path.join(currentDir, '.venv', 'bin', 'python3');
    const winVenv = path.join(currentDir, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(unixVenv)) return unixVenv;
    if (fs.existsSync(winVenv)) return winVenv;
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return isWin ? 'python' : 'python3';
}

/**
 * Classical DSP Configuration (Self-contained)
 */
const DSP_CONFIG = {
  // Script is relative to this file inside the installed packages directory
  scriptPath: path.join(__dirname, '../scripts/audio_dsp.py'),
  maxLengthSeconds: 120,
  pythonCommand: resolvePythonCommand(),
  timeout: 30000, 
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  },
};

/**
 * Check if Python and dependencies are available
 */
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    try {
      const pythonVersion = execFileSync(DSP_CONFIG.pythonCommand, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      if (!fs.existsSync(DSP_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'Audio DSP script not found',
          details: { scriptPath: DSP_CONFIG.scriptPath }
        });
        return;
      }
      
      const proc = spawn(DSP_CONFIG.pythonCommand, [
        '-c',
        'import librosa, numpy; print("ok")'
      ], { env: DSP_CONFIG.env });
      
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0 && output.includes('ok')) {
          resolve({
            available: true,
            message: 'Python environment ready for audio DSP analysis',
            details: {
              pythonVersion,
              packages: ['librosa', 'numpy']
            }
          });
        } else {
          resolve({
            available: false,
            message: 'Missing Python dependencies for audio DSP',
            details: {
              pythonVersion,
              install: 'pip install librosa numpy',
              error: errorOutput || 'Import check failed'
            }
          });
        }
      });
      
    } catch (error) {
      resolve({
        available: false,
        message: `Python not available: ${error.message}`,
        details: { pythonCommand: DSP_CONFIG.pythonCommand }
      });
    }
  });
}

/**
 * Run DSP analysis
 */
async function analyze(input, options = {}) {
  const {
    maxLength = DSP_CONFIG.maxLengthSeconds,
    stemsDir = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  let audioPath;
  let tempFile = null;
  
  if (Buffer.isBuffer(input)) {
    const ext = detectAudioExtension(input);
    tempFile = path.join(
      os.tmpdir(),
      `orbit-dsp-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
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
      console.log(`[AudioDSP] Processing ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const args = [
        DSP_CONFIG.scriptPath,
        audioPath,
        '--output', 'json',
        '--max-length', String(maxLength),
      ];
      if (stemsDir) {
        args.push('--stems-dir', stemsDir);
      }

      const proc = spawn(DSP_CONFIG.pythonCommand, args, {
        timeout: DSP_CONFIG.timeout,
        env: DSP_CONFIG.env,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      
      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        
        if (code !== 0) {
          reject(new Error(`AudioDSP process failed (code ${code}): ${stderr || stdout}`));
          return;
        }
        
        try {
          let jsonStr = stdout;
          const jsonStart = stdout.indexOf('{');
          if (jsonStart > 0) {
            jsonStr = stdout.slice(jsonStart);
          }
          
          const result = JSON.parse(jsonStr);
          if (result.error) {
            reject(new Error(`AudioDSP error (${result.error}): ${result.message}`));
            return;
          }
          
          result.processingTimeMs = elapsed;
          resolve(result);
          
        } catch (parseError) {
          reject(new Error(`Failed to parse AudioDSP output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`AudioDSP process error: ${err.message}`));
      });
    });
    
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

/**
 * Helper to compute danceability score from classical DSP features
 */
function calculateDanceability(analysisResult) {
  const { bpm, energy } = analysisResult;
  const optimalBpm = 115;
  const bpmDiff = Math.abs(bpm.value - optimalBpm);
  const bpmScore = Math.exp(-(bpmDiff * bpmDiff) / (2 * 400));
  const danceability = (bpmScore * 0.4) + (energy * 0.4) + (bpm.confidence * 0.2);
  return Math.round(danceability * 10000) / 10000;
}

module.exports = {
  analyze,
  checkPythonEnvironment,
  calculateDanceability,
  config: { ...DSP_CONFIG },
};
