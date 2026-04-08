const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SONICS_CONFIG = {
  scriptPath: path.join(__dirname, '../../scripts/sonics_detect.py'),
  timeoutMs: 180000,
  maxLengthSeconds: 120,
  pythonCommand: process.env.ORBIT_SONICS_PYTHON ||
    process.env.ORBIT_PYTHON_PATH ||
    (fs.existsSync(path.join(__dirname, '../../.venv/bin/python3'))
      ? path.join(__dirname, '../../.venv/bin/python3')
      : 'python3'),
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: process.env.OPENBLAS_NUM_THREADS || '1',
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '1',
    MKL_NUM_THREADS: process.env.MKL_NUM_THREADS || '1',
    VECLIB_MAXIMUM_THREADS: process.env.VECLIB_MAXIMUM_THREADS || '1',
    NUMEXPR_NUM_THREADS: process.env.NUMEXPR_NUM_THREADS || '1',
    HF_HUB_DISABLE_PROGRESS_BARS: '1',
    TRANSFORMERS_VERBOSITY: 'error',
  },
};

function parseJsonPayload(stdout) {
  const jsonStart = stdout.indexOf('{');
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
  return JSON.parse(jsonStr);
}

function resolveModelVariant() {
  if (process.env.ORBIT_SONICS_MODEL) {
    return process.env.ORBIT_SONICS_MODEL;
  }
  return 'auto';
}

function normalizeResult(pyResult) {
  const syntheticProbability = Number(pyResult.synthetic_probability || 0);
  const realProbability = Number(pyResult.real_probability || 0);
  const prediction = pyResult.prediction || (syntheticProbability >= 0.5 ? 'synthetic' : 'real');
  const confidence = Number(pyResult.confidence || 0);
  const modelVariant = pyResult.model_variant || resolveModelVariant();
  const processingTimeMs = Number(pyResult.processing_time_ms || 0);

  return {
    syntheticProbability: Math.max(0, Math.min(1, syntheticProbability)),
    realProbability: Math.max(0, Math.min(1, realProbability)),
    prediction,
    confidence: Math.max(0, Math.min(1, confidence)),
    modelVariant,
    processingTimeMs,
  };
}

async function checkEnvironment() {
  if (process.env.ORBIT_SKIP_SONICS === 'true') {
    return {
      available: false,
      message: 'SONICS skipped (ORBIT_SKIP_SONICS=true)',
      details: { skipped: true },
    };
  }

  return new Promise((resolve) => {
    try {
      const pythonVersion = execSync(`${SONICS_CONFIG.pythonCommand} --version`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (!fs.existsSync(SONICS_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'SONICS script not found',
          details: { scriptPath: SONICS_CONFIG.scriptPath },
        });
        return;
      }

      const proc = spawn(SONICS_CONFIG.pythonCommand, [
        SONICS_CONFIG.scriptPath,
        '--check',
        '--model',
        resolveModelVariant(),
        '--output',
        'json',
      ], {
        cwd: path.dirname(SONICS_CONFIG.scriptPath),
        env: SONICS_CONFIG.env,
        timeout: SONICS_CONFIG.timeoutMs,
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(parseJsonPayload(stdout));
          } catch (err) {
            resolve({
              available: true,
              message: 'SONICS environment appears ready',
              details: { pythonVersion, parseError: err.message },
            });
          }
          return;
        }

        try {
          const payload = parseJsonPayload(stdout);
          resolve({
            available: false,
            message: payload.message || 'SONICS check failed',
            details: payload,
          });
        } catch (_) {
          resolve({
            available: false,
            message: `SONICS check failed: ${stderr || stdout}`,
            details: { pythonVersion },
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          available: false,
          message: `SONICS check process error: ${err.message}`,
          details: { error: err.message },
        });
      });
    } catch (error) {
      resolve({
        available: false,
        message: `Python unavailable: ${error.message}`,
        details: {
          pythonCommand: SONICS_CONFIG.pythonCommand,
          install: 'Install Python and dependencies for SONICS',
        },
      });
    }
  });
}

async function detect(input, options = {}) {
  if (process.env.ORBIT_SKIP_SONICS === 'true') {
    throw new Error('SONICS detection skipped (ORBIT_SKIP_SONICS=true)');
  }

  const {
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
    maxLength = SONICS_CONFIG.maxLengthSeconds,
    modelVariant = resolveModelVariant(),
  } = options;

  let audioPath = null;
  let tempFile = null;

  if (Buffer.isBuffer(input)) {
    tempFile = path.join(
      os.tmpdir(),
      `orbit-sonics-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
    );
    fs.writeFileSync(tempFile, input);
    audioPath = tempFile;
  } else if (typeof input === 'string') {
    audioPath = path.resolve(input);
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }
  } else {
    throw new Error('Input must be a file path string or Buffer');
  }

  try {
    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      const proc = spawn(SONICS_CONFIG.pythonCommand, [
        SONICS_CONFIG.scriptPath,
        audioPath,
        '--model',
        modelVariant,
        '--max-length',
        String(maxLength),
        '--output',
        'json',
      ], {
        cwd: path.dirname(SONICS_CONFIG.scriptPath),
        timeout: SONICS_CONFIG.timeoutMs,
        env: SONICS_CONFIG.env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        if (verbose) process.stderr.write(d);
      });

      proc.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        if (code !== 0) {
          try {
            const errPayload = parseJsonPayload(stdout);
            reject(new Error(`SONICS error (${errPayload.error}): ${errPayload.message}`));
          } catch (_) {
            reject(new Error(`SONICS failed (code ${code}): ${stderr || stdout}`));
          }
          return;
        }

        try {
          const payload = parseJsonPayload(stdout);
          const normalized = normalizeResult(payload);
          if (!normalized.processingTimeMs) normalized.processingTimeMs = elapsed;
          resolve(normalized);
        } catch (err) {
          reject(new Error(`Failed to parse SONICS output: ${err.message}\nOutput: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
          reject(new Error(`SONICS detection timed out after ${SONICS_CONFIG.timeoutMs / 1000}s`));
        } else {
          reject(new Error(`SONICS process error: ${err.message}`));
        }
      });
    });
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

module.exports = {
  detect,
  checkEnvironment,
  config: { ...SONICS_CONFIG },
};
