const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

const DEMUCS_CONFIG = {
  scriptPath: path.join(__dirname, '../../scripts/demucs_separate.py'),
  pythonCommand: process.env.ORBIT_DEMUCS_PYTHON
    || process.env.ORBIT_PYTHON_PATH
    || (fs.existsSync(path.join(__dirname, '../../.venv/bin/python3'))
      ? path.join(__dirname, '../../.venv/bin/python3')
      : 'python3'),
  timeout: 180000, // Demucs on CPU can take 30-60s+.
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
  },
};

function extractJson(output) {
  const jsonStart = output.indexOf('{');
  if (jsonStart >= 0) {
    return JSON.parse(output.slice(jsonStart));
  }
  return JSON.parse(output);
}

async function checkEnvironment() {
  return new Promise((resolve) => {
    try {
      const pythonVersion = execSync(`${DEMUCS_CONFIG.pythonCommand} --version`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (!fs.existsSync(DEMUCS_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'Demucs separation script not found',
          details: { scriptPath: DEMUCS_CONFIG.scriptPath },
        });
        return;
      }

      const proc = spawn(DEMUCS_CONFIG.pythonCommand, [
        DEMUCS_CONFIG.scriptPath,
        '--check',
        '--output', 'json',
      ], {
        cwd: path.dirname(DEMUCS_CONFIG.scriptPath),
        env: DEMUCS_CONFIG.env,
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = extractJson(stdout);
            resolve({
              available: true,
              message: result.message || 'Demucs environment ready',
              details: {
                pythonVersion,
                model: result.model || 'htdemucs',
              },
            });
          } catch (err) {
            resolve({
              available: true,
              message: 'Demucs environment ready',
              details: { pythonVersion },
            });
          }
          return;
        }

        try {
          const errorData = extractJson(stdout);
          resolve({
            available: false,
            message: errorData.message || 'Demucs check failed',
            details: errorData,
          });
        } catch (err) {
          resolve({
            available: false,
            message: `Demucs check failed: ${stderr || stdout}`,
            details: {
              pythonVersion,
              install: 'pip install demucs',
            },
          });
        }
      });

      proc.on('error', (err) => {
        resolve({
          available: false,
          message: `Python process error: ${err.message}`,
          details: { error: err.message },
        });
      });
    } catch (error) {
      resolve({
        available: false,
        message: `Python not available: ${error.message}`,
        details: {
          pythonCommand: DEMUCS_CONFIG.pythonCommand,
          install: 'Install Python 3.8+ and run: pip install demucs',
        },
      });
    }
  });
}

async function separate(input, options = {}) {
  const {
    outputDir = null,
    timeout = DEMUCS_CONFIG.timeout,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;

  let audioPath;
  let inputTempFile = null;

  if (Buffer.isBuffer(input)) {
    const ext = detectAudioExtension(input);
    inputTempFile = path.join(
      os.tmpdir(),
      `orbit-demucs-input-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
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

  const finalOutputDir = outputDir || fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-demucs-'));

  try {
    if (verbose) {
      console.log(`🎛️ Demucs: Separating ${audioPath}`);
    }

    return await new Promise((resolve, reject) => {
      const startTime = Date.now();
      const args = [
        DEMUCS_CONFIG.scriptPath,
        audioPath,
        '--output', 'json',
        '--output-dir', finalOutputDir,
      ];

      const proc = spawn(DEMUCS_CONFIG.pythonCommand, args, {
        cwd: path.dirname(DEMUCS_CONFIG.scriptPath),
        timeout,
        env: DEMUCS_CONFIG.env,
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        if (verbose) process.stderr.write(d);
      });

      proc.on('close', (code, signal) => {
        const elapsed = Date.now() - startTime;

        if (code !== 0) {
          if (signal === 'SIGKILL') {
            reject(new Error('Demucs process was killed (possible timeout or out-of-memory condition)'));
            return;
          }

          try {
            const errorData = extractJson(stdout);
            reject(new Error(`Demucs error (${errorData.error}): ${errorData.message}`));
            return;
          } catch (err) {
            reject(new Error(`Demucs process failed (code ${code}): ${stderr || stdout}`));
            return;
          }
        }

        try {
          const result = extractJson(stdout);
          if (result.error) {
            reject(new Error(`Demucs error (${result.error}): ${result.message}`));
            return;
          }

          resolve({
            stems: result.stems,
            processingTimeMs: result.processingTimeMs || elapsed,
            model: result.model || { name: 'htdemucs' },
            outputDir: result.outputDir || finalOutputDir,
          });
        } catch (parseError) {
          reject(new Error(`Failed to parse Demucs output: ${parseError.message}\nOutput: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
          reject(new Error(`Demucs timed out after ${Math.round(timeout / 1000)}s`));
        } else {
          reject(new Error(`Demucs process error: ${err.message}`));
        }
      });
    });
  } finally {
    if (inputTempFile && fs.existsSync(inputTempFile)) {
      fs.unlinkSync(inputTempFile);
    }
  }
}

function cleanup(target) {
  if (!target) return;

  if (typeof target === 'string') {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    return;
  }

  const outputDir = target.outputDir;
  if (outputDir && fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  } else if (target.stems && typeof target.stems === 'object') {
    Object.values(target.stems).forEach((stemPath) => {
      if (stemPath && fs.existsSync(stemPath)) {
        fs.unlinkSync(stemPath);
      }
    });
  }
}

const config = { ...DEMUCS_CONFIG };

module.exports = {
  separate,
  checkEnvironment,
  cleanup,
  config,
};
