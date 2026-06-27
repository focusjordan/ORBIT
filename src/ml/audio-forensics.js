/**
 * ORBIT AI Audio Forensics Connector
 * 
 * Performs high-fidelity acoustic anomaly checks using scripts/audio_forensics.py:
 * - 16kHz rolloff cutoff
 * - Shannon phase entropy on instantaneous group delay
 * - Cepstral checkerboard upsampling vocoder artifacts
 * - M/S stereo phase coherence
 * - Pre-echo transient ratios
 * - Pitch vibrato jitter frequency
 * 
 * Typically executed in asynchronous workers or deep screening pipelines.
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
 * Forensics Configuration
 */
const FORENSICS_CONFIG = {
  scriptPath: path.join(__dirname, '../../scripts/audio_forensics.py'),
  maxLengthSeconds: 120,
  pythonCommand: process.env.ORBIT_FORENSICS_PYTHON ||
    process.env.ORBIT_PYTHON_PATH ||
    (fs.existsSync(path.join(__dirname, '../../.venv/bin/python3'))
      ? path.join(__dirname, '../../.venv/bin/python3')
      : 'python3'),
  timeout: 120000, // 2 minutes for heavy ML/spectral analysis
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
      const pythonVersion = execFileSync(FORENSICS_CONFIG.pythonCommand, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      if (!fs.existsSync(FORENSICS_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'Audio Forensics script not found',
          details: { scriptPath: FORENSICS_CONFIG.scriptPath }
        });
        return;
      }
      
      const proc = spawn(FORENSICS_CONFIG.pythonCommand, [
        '-c',
        'import librosa, numpy; print("ok")'
      ], { env: FORENSICS_CONFIG.env });
      
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0 && output.includes('ok')) {
          resolve({
            available: true,
            message: 'Python environment ready for audio forensics',
            details: {
              pythonVersion,
              packages: ['librosa', 'numpy']
            }
          });
        } else {
          resolve({
            available: false,
            message: 'Missing Python dependencies for audio forensics',
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
        message: `Python not available for forensics: ${error.message}`,
        details: { pythonCommand: FORENSICS_CONFIG.pythonCommand }
      });
    }
  });
}

/**
 * Run Forensics analysis
 */
async function analyze(input, options = {}) {
  const {
    maxLength = FORENSICS_CONFIG.maxLengthSeconds,
    stemsDir = null,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  let audioPath;
  let tempFile = null;
  
  if (Buffer.isBuffer(input)) {
    const ext = detectAudioExtension(input);
    tempFile = path.join(
      os.tmpdir(),
      `orbit-forensics-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
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
      console.log(`🤖 AudioForensics: Processing ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const args = [
        FORENSICS_CONFIG.scriptPath,
        audioPath,
        '--max-length', String(maxLength),
      ];
      if (stemsDir) {
        args.push('--stems-dir', stemsDir);
      }

      const proc = spawn(FORENSICS_CONFIG.pythonCommand, args, {
        timeout: FORENSICS_CONFIG.timeout,
        env: FORENSICS_CONFIG.env,
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      
      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        
        if (code !== 0) {
          reject(new Error(`AudioForensics process failed (code ${code}): ${stderr || stdout}`));
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
            reject(new Error(`AudioForensics error (${result.error}): ${result.message}`));
            return;
          }
          
          result.processingTimeMs = elapsed;
          resolve(result);
          
        } catch (parseError) {
          reject(new Error(`Failed to parse AudioForensics output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        reject(new Error(`AudioForensics process error: ${err.message}`));
      });
    });
    
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

module.exports = {
  analyze,
  checkPythonEnvironment,
  config: { ...FORENSICS_CONFIG },
};
