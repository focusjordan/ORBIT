/**
 * ORBIT Audio Analysis Module Wrapper
 * 
 * Session 30 Refactoring: Backwards-compatible wrapper.
 * Delegates classical DSP features to src/ml/audio-dsp.js and deep forensics
 * checks to src/ml/audio-forensics.js. Eliminates duplicate code while
 * maintaining 100% parameter and function signature parity for existing code
 * and tests.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import decoupled modules
const audioDsp = require('./audio-dsp');
const audioForensics = require('./audio-forensics');

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
 * Unified Config (Merged for backwards compatibility)
 */
const ANALYSIS_CONFIG = {
  scriptPath: path.join(__dirname, '../../scripts/audio_analysis.py'),
  maxLengthSeconds: 120,
  pythonCommand: audioDsp.config.pythonCommand,
  timeout: audioForensics.config.timeout,
  env: audioDsp.config.env,
};

/**
 * Check if Python and dependencies are available
 */
async function checkPythonEnvironment() {
  const dspEnv = await audioDsp.checkPythonEnvironment();
  const forensicsEnv = await audioForensics.checkPythonEnvironment();
  
  return {
    available: dspEnv.available && forensicsEnv.available,
    message: dspEnv.available && forensicsEnv.available 
      ? 'Python environment ready for classical DSP and AI forensics'
      : `Partial ready: DSP=${dspEnv.available}, Forensics=${forensicsEnv.available}`,
    details: {
      dsp: dspEnv,
      forensics: forensicsEnv
    }
  };
}

/**
 * Perform audio analysis (DSP + optional Forensics)
 */
async function analyze(input, options = {}) {
  const {
    maxLength = ANALYSIS_CONFIG.maxLengthSeconds,
    stemsDir = null,
    aiForensics = false,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;

  const startTime = Date.now();
  if (verbose) {
    console.log(`🎵 AudioAnalysis (Wrapper): Running DSP analysis pass...`);
  }

  // 1. Run classical DSP pass
  const dspResult = await audioDsp.analyze(input, {
    maxLength,
    stemsDir,
    verbose
  });

  const result = {
    ...dspResult
  };

  // 2. Run forensics pass only if requested
  if (aiForensics) {
    if (verbose) {
      console.log(`🤖 AudioAnalysis (Wrapper): Running AI spectral forensics pass...`);
    }
    try {
      const forensicsResult = await audioForensics.analyze(input, {
        maxLength,
        stemsDir,
        verbose
      });
      result.ai_forensics = forensicsResult;
      // Ensure traditional dynamic range is duplicated inside the forensics payload for compatibility
      result.ai_forensics.dynamic_range_db = dspResult.dynamic_range_db;
    } catch (forensicsError) {
      if (verbose) {
        console.error(`⚠️ AudioAnalysis (Wrapper) forensics pass failed: ${forensicsError.message}`);
      }
      throw forensicsError;
    }
  }

  result.processingTimeMs = Date.now() - startTime;
  return result;
}

/**
 * Helpers (Backwards-compatible API)
 */
async function getBpm(input, options = {}) {
  const res = await audioDsp.analyze(input, options);
  return res.bpm;
}

async function getKey(input, options = {}) {
  const res = await audioDsp.analyze(input, options);
  return res.key;
}

async function getEnergy(input, options = {}) {
  const res = await audioDsp.analyze(input, options);
  return res.energy;
}

function calculateDanceability(analysisResult) {
  return audioDsp.calculateDanceability(analysisResult);
}

/**
 * Extract encoder/format metadata from file or buffer via ffprobe
 */
async function extractFileMetadata(input) {
  let audioPath;
  let tempFile = null;

  if (Buffer.isBuffer(input)) {
    const ext = detectAudioExtension(input);
    tempFile = path.join(
      os.tmpdir(),
      `orbit-ffprobe-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
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

module.exports = {
  analyze,
  getBpm,
  getKey,
  getEnergy,
  checkPythonEnvironment,
  extractFileMetadata,
  calculateDanceability,
  config: { ...ANALYSIS_CONFIG },
};
