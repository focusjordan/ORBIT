/**
 * ORBIT Audio Analysis Module
 * 
 * Session 21 - Signal processing for BPM and key detection
 * 
 * This module provides audio analysis features using a Python bridge to librosa:
 * - BPM (tempo) detection with confidence scores
 * - Musical key detection using Krumhansl-Schmuckler algorithm
 * - Energy level calculation
 * - Loudness measurement
 * 
 * Architecture:
 * - Uses Python bridge (scripts/audio_analysis.py) for librosa-based analysis
 * - Follows same pattern as MERT module (mert.js)
 * - All results include confidence scores
 * 
 * @see ORBIT_ENHANCEMENTS.md Section 3 (Zero-Shot Metadata Auto-Extraction)
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Audio Analysis Configuration
 */
const ANALYSIS_CONFIG = {
  // Path to Python analysis script
  scriptPath: path.join(__dirname, '../../scripts/audio_analysis.py'),
  
  // Max audio length to analyze (seconds) - for efficiency
  maxLengthSeconds: 120,
  
  // Python command - prefer virtual environment if it exists
  pythonCommand: process.env.ORBIT_PYTHON_PATH || 
    (fs.existsSync(path.join(__dirname, '../../.venv/bin/python3')) 
      ? path.join(__dirname, '../../.venv/bin/python3')
      : 'python3'),
  
  // Timeout for analysis (ms)
  timeout: 60000, // 1 minute

  // Environment for Python subprocesses — limit BLAS/OpenMP threads to
  // prevent stack-overflow crashes on Apple Silicon (M1, 8 GB).
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  },
};

/**
 * Check if Python and required dependencies are available
 * @returns {Promise<{available: boolean, message: string, details?: Object}>}
 */
async function checkPythonEnvironment() {
  return new Promise((resolve) => {
    try {
      // Check Python is available
      const pythonVersion = execSync(`${ANALYSIS_CONFIG.pythonCommand} --version`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      
      // Check if our script exists
      if (!fs.existsSync(ANALYSIS_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'Audio analysis script not found',
          details: { scriptPath: ANALYSIS_CONFIG.scriptPath }
        });
        return;
      }
      
      // Quick dependency check
      const proc = spawn(ANALYSIS_CONFIG.pythonCommand, [
        '-c',
        'import librosa, numpy; print("ok")'
      ], { env: ANALYSIS_CONFIG.env });
      
      let output = '';
      let errorOutput = '';
      
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { errorOutput += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0 && output.includes('ok')) {
          resolve({
            available: true,
            message: 'Python environment ready for audio analysis',
            details: {
              pythonVersion,
              packages: ['librosa', 'numpy']
            }
          });
        } else {
          resolve({
            available: false,
            message: 'Missing Python dependencies for audio analysis',
            details: {
              pythonVersion,
              install: 'pip install librosa numpy',
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
          pythonCommand: ANALYSIS_CONFIG.pythonCommand,
          install: 'Install Python 3.8+ and run: pip install librosa numpy'
        }
      });
    }
  });
}

/**
 * Analyze audio for BPM, key, energy, and loudness
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @param {number} options.maxLength - Max audio length in seconds (default: 120)
 * @param {boolean} options.verbose - Log progress (default: false)
 * @returns {Promise<Object>} Analysis results with confidence scores
 * @throws {Error} If Python not available, dependencies missing, or processing fails
 * 
 * @example
 * const result = await analyze('/path/to/audio.mp3');
 * console.log(result.bpm);  // { value: 120, confidence: 0.95 }
 * console.log(result.key);  // { value: 'A minor', key: 'A', mode: 'minor', confidence: 0.88 }
 */
async function analyze(input, options = {}) {
  const {
    maxLength = ANALYSIS_CONFIG.maxLengthSeconds,
    aiForensics = false,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;
  
  // Handle buffer input - write to temp file
  let audioPath;
  let tempFile = null;
  
  if (Buffer.isBuffer(input)) {
    tempFile = path.join(
      os.tmpdir(),
      `orbit-analysis-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`
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
      console.log(`🎵 AudioAnalysis: Processing ${audioPath}`);
    }
    
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const args = [
        ANALYSIS_CONFIG.scriptPath,
        audioPath,
        '--output', 'json',
        '--max-length', String(maxLength),
      ];
      if (aiForensics) args.push('--ai-forensics');

      const proc = spawn(ANALYSIS_CONFIG.pythonCommand, args, {
        timeout: ANALYSIS_CONFIG.timeout,
        env: ANALYSIS_CONFIG.env,
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
          // Try to parse error from stdout
          try {
            let jsonStr = stdout;
            const jsonStart = stdout.indexOf('{');
            if (jsonStart >= 0) {
              jsonStr = stdout.slice(jsonStart);
            }
            const errorData = JSON.parse(jsonStr);
            if (errorData.error) {
              reject(new Error(`AudioAnalysis error (${errorData.error}): ${errorData.message}`));
              return;
            }
          } catch (e) {
            // Not JSON, use raw output
          }
          reject(new Error(`AudioAnalysis process failed (code ${code}): ${stderr || stdout}`));
          return;
        }
        
        try {
          // Extract JSON from stdout (may have warnings before it)
          let jsonStr = stdout;
          const jsonStart = stdout.indexOf('{');
          if (jsonStart > 0) {
            jsonStr = stdout.slice(jsonStart);
          }
          
          const result = JSON.parse(jsonStr);
          
          if (result.error) {
            reject(new Error(`AudioAnalysis error (${result.error}): ${result.message}`));
            return;
          }
          
          if (verbose) {
            console.log(`✅ AudioAnalysis: Completed in ${(elapsed / 1000).toFixed(1)}s`);
            console.log(`   BPM: ${result.bpm.value} (${(result.bpm.confidence * 100).toFixed(0)}% confidence)`);
            console.log(`   Key: ${result.key.value} (${(result.key.confidence * 100).toFixed(0)}% confidence)`);
          }
          
          // Add processing time to result
          result.processingTimeMs = elapsed;
          
          resolve(result);
          
        } catch (parseError) {
          reject(new Error(`Failed to parse AudioAnalysis output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });
      
      proc.on('error', (err) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
          reject(new Error(`AudioAnalysis timed out after ${ANALYSIS_CONFIG.timeout / 1000}s`));
        } else {
          reject(new Error(`AudioAnalysis process error: ${err.message}`));
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
 * Get only BPM from audio
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<{value: number, confidence: number}>}
 */
async function getBpm(input, options = {}) {
  const result = await analyze(input, options);
  return result.bpm;
}

/**
 * Get only key from audio
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<{value: string, key: string, mode: string, confidence: number}>}
 */
async function getKey(input, options = {}) {
  const result = await analyze(input, options);
  return result.key;
}

/**
 * Get energy level from audio
 * 
 * @param {string|Buffer} input - Audio file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<number>} Energy level 0-1
 */
async function getEnergy(input, options = {}) {
  const result = await analyze(input, options);
  return result.energy;
}

/**
 * Calculate danceability score based on BPM and energy
 * 
 * Danceability is derived from:
 * - BPM in the "danceable" range (100-130 BPM optimal)
 * - Energy level
 * - Beat strength (from BPM confidence)
 * 
 * @param {Object} analysisResult - Result from analyze()
 * @returns {number} Danceability score 0-1
 */
function calculateDanceability(analysisResult) {
  const { bpm, energy } = analysisResult;
  
  // BPM contribution: 100-130 BPM is most danceable
  // Use a Gaussian-like curve centered at 115 BPM
  const optimalBpm = 115;
  const bpmDiff = Math.abs(bpm.value - optimalBpm);
  const bpmScore = Math.exp(-(bpmDiff * bpmDiff) / (2 * 400)); // sigma = 20
  
  // Combine BPM score, energy, and beat confidence
  const danceability = (bpmScore * 0.4) + (energy * 0.4) + (bpm.confidence * 0.2);
  
  return Math.round(danceability * 10000) / 10000;
}

/**
 * Extract encoder/format metadata from an audio file or buffer via ffprobe.
 * Returns encoder tag, format name, bit depth, sample rate, and comment fields.
 *
 * @param {string|Buffer} input - Audio file path or buffer
 * @returns {Promise<Object>} Extracted file-level metadata
 */
async function extractFileMetadata(input) {
  let audioPath;
  let tempFile = null;

  if (Buffer.isBuffer(input)) {
    tempFile = path.join(
      os.tmpdir(),
      `orbit-ffprobe-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`
    );
    fs.writeFileSync(tempFile, input);
    audioPath = tempFile;
  } else if (typeof input === 'string') {
    audioPath = input;
  } else {
    return { available: false, reason: 'invalid_input' };
  }

  try {
    return await new Promise((resolve) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        audioPath,
      ];
      const proc = spawn('ffprobe', args, { timeout: 10000 });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ available: false, reason: 'ffprobe_failed', error: stderr || `exit ${code}` });
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const fmt = data.format || {};
          const tags = fmt.tags || {};
          const audioStream = (data.streams || []).find(s => s.codec_type === 'audio') || {};

          resolve({
            available: true,
            encoder: tags.encoder || tags.ENCODER || null,
            encoding_tool: tags.encoding_tool || tags.ENCODING_TOOL || null,
            software: tags.software || tags.SOFTWARE || null,
            comment: tags.comment || tags.COMMENT || tags.description || tags.DESCRIPTION || null,
            album: tags.album || tags.ALBUM || null,
            creation_time: tags.creation_time || tags.date || tags.DATE || null,
            format_name: fmt.format_name || null,
            bit_rate: fmt.bit_rate ? parseInt(fmt.bit_rate, 10) : null,
            sample_rate: audioStream.sample_rate ? parseInt(audioStream.sample_rate, 10) : null,
            bits_per_raw_sample: audioStream.bits_per_raw_sample ? parseInt(audioStream.bits_per_raw_sample, 10) : null,
            bits_per_sample: audioStream.bits_per_sample ? parseInt(audioStream.bits_per_sample, 10) : null,
            sample_fmt: audioStream.sample_fmt || null,
            codec_name: audioStream.codec_name || null,
          });
        } catch (parseErr) {
          resolve({ available: false, reason: 'parse_failed', error: parseErr.message });
        }
      });
      proc.on('error', (err) => {
        resolve({ available: false, reason: 'ffprobe_not_found', error: err.message });
      });
    });
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

// Export configuration for testing
const config = { ...ANALYSIS_CONFIG };

module.exports = {
  // Core functions
  analyze,
  getBpm,
  getKey,
  getEnergy,
  checkPythonEnvironment,
  extractFileMetadata,
  
  // Derived metrics
  calculateDanceability,
  
  // Configuration
  config,
};
