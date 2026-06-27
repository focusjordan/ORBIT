/**
 * ORBIT wav2vec2 genre classifier bridge.
 *
 * Bridges Node.js to scripts/genre_classify.py.
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function resolvePythonCommand() {
  if (process.env.ORBIT_GENRE_PYTHON) return process.env.ORBIT_GENRE_PYTHON;
  if (process.env.ORBIT_PYTHON_PATH) return process.env.ORBIT_PYTHON_PATH;
  
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

const GENRE_CONFIG = {
  scriptPath: path.join(__dirname, '../scripts/genre_classify.py'),
  topK: 3,
  timeout: 120000,
  pythonCommand: resolvePythonCommand(),
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: '1',
    OMP_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
    VECLIB_MAXIMUM_THREADS: '1',
  },
};

function parseJsonPayload(stdout) {
  let jsonStr = stdout;
  const jsonStart = stdout.indexOf('{');
  if (jsonStart > 0) {
    jsonStr = stdout.slice(jsonStart);
  }
  return JSON.parse(jsonStr);
}

function resolveInputToPath(input, prefix) {
  if (Buffer.isBuffer(input)) {
    const tempFile = path.join(
      os.tmpdir(),
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`
    );
    fs.writeFileSync(tempFile, input);
    return { audioPath: tempFile, tempFile };
  }

  if (typeof input === 'string') {
    if (!fs.existsSync(input)) {
      throw new Error(`Audio file not found: ${input}`);
    }
    return { audioPath: input, tempFile: null };
  }

  throw new Error('Input must be a file path string or Buffer');
}

async function classify(input, options = {}) {
  const {
    topK = GENRE_CONFIG.topK,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;

  const { audioPath, tempFile } = resolveInputToPath(input, 'orbit-genre-classify');

  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn(
        GENRE_CONFIG.pythonCommand,
        [
          GENRE_CONFIG.scriptPath,
          audioPath,
          '--output', 'json',
          '--top-k', String(topK),
        ],
        {
          timeout: GENRE_CONFIG.timeout,
          env: GENRE_CONFIG.env,
        }
      );

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        if (verbose) process.stderr.write(d);
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          try {
            const err = parseJsonPayload(stdout);
            if (err.error) {
              reject(new Error(`Genre classifier error (${err.error}): ${err.message}`));
              return;
            }
          } catch (e) {
            // fall through
          }
          reject(new Error(`Genre classifier process failed (code ${code}): ${stderr || stdout}`));
          return;
        }

        try {
          const output = parseJsonPayload(stdout);
          resolve(output.genres || []);
        } catch (error) {
          reject(new Error(`Failed to parse genre output: ${error.message}\nOutput: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
          reject(new Error(`Genre classifier timed out after ${GENRE_CONFIG.timeout / 1000}s`));
        } else {
          reject(new Error(`Genre classifier process error: ${err.message}`));
        }
      });
    });
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function checkEnvironment() {
  return new Promise((resolve) => {
    try {
      const pythonVersion = execFileSync(GENRE_CONFIG.pythonCommand, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (!fs.existsSync(GENRE_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'Genre classifier script not found',
          details: { scriptPath: GENRE_CONFIG.scriptPath, pythonVersion },
        });
        return;
      }

      const proc = spawn(GENRE_CONFIG.pythonCommand, [
        GENRE_CONFIG.scriptPath,
        '--check',
      ], {
        env: GENRE_CONFIG.env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(parseJsonPayload(stdout));
            return;
          } catch (e) {
            resolve({
              available: true,
              message: 'Genre classifier environment ready',
              details: { pythonVersion },
            });
            return;
          }
        }

        try {
          const err = parseJsonPayload(stdout);
          resolve({
            available: false,
            message: err.message || 'Genre classifier check failed',
            details: { ...err, pythonVersion },
          });
        } catch (e) {
          resolve({
            available: false,
            message: `Genre classifier check failed: ${stderr || stdout}`,
            details: { pythonVersion },
          });
        }
      });

      proc.on('error', (error) => {
        resolve({
          available: false,
          message: `Genre classifier process error: ${error.message}`,
          details: { error: error.message },
        });
      });
    } catch (error) {
      resolve({
        available: false,
        message: `Python not available: ${error.message}`,
        details: {
          pythonCommand: GENRE_CONFIG.pythonCommand,
          install: 'Install Python and run: pip install transformers torchaudio',
        },
      });
    }
  });
}

const config = { ...GENRE_CONFIG };

module.exports = {
  classify,
  checkEnvironment,
  config,
};
