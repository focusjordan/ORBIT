/**
 * ORBIT AI Audio Forensics Standalone Connector
 * 
 * Performs high-fidelity acoustic anomaly checks using package-local scripts/audio_forensics.py:
 * - 16kHz rolloff cutoff
 * - Shannon phase entropy on instantaneous group delay
 * - Cepstral checkerboard upsampling vocoder artifacts
 * - M/S stereo phase coherence
 * - Pre-echo transient ratios
 * - Pitch vibrato jitter frequency
 */

const { spawn, execSync } = require('child_process');
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
 * Forensics Configuration
 */
const FORENSICS_CONFIG = {
  scriptPath: path.join(__dirname, '../scripts/audio_forensics.py'),
  maxLengthSeconds: 120,
  pythonCommand: resolvePythonCommand(),
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
      const pythonVersion = execSync(`${FORENSICS_CONFIG.pythonCommand} --version`, {
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
      console.log(`[AudioForensics] Processing ${audioPath}`);
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

/**
 * Calculates a basic AI probability score based on the raw boolean flags 
 * returned by the forensics analysis.
 * Returns a number between 0.0 (likely human) and 1.0 (likely AI).
 */
function calculateAiProbability(results) {
  if (!results) return 0;
  
  const anomalyFlags = [
    results.spectral_cutoff?.has_16k_cutoff,
    results.tempo_regularity?.metronomic,
    results.pitch_jitter?.perfect_vibrato,
    results.checkerboard?.has_checkerboard_artifacts,
    results.phase_entropy?.unnatural_phase,
    results.onset_regularity?.unnatural_onsets,
    results.noise_floor_structure?.structured_noise,
    results.pre_echo?.has_pre_echo,
    results.stem_forensics?.vocal_instrumental_bleed?.high_bleed,
    results.hf_phase_incoherence?.incoherent_hf_phase,
    results.harmonicity?.unnatural_harmonicity
  ];
  
  let validFlags = 0;
  let trueFlags = 0;
  
  for (const flag of anomalyFlags) {
    if (typeof flag === 'boolean') {
      validFlags++;
      if (flag) trueFlags++;
    }
  }
  
  if (validFlags === 0) return 0;
  return trueFlags / validFlags;
}

module.exports = {
  analyze,
  checkPythonEnvironment,
  config: { ...FORENSICS_CONFIG },
  calculateAiProbability
};
