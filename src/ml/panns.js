/**
 * ORBIT PANNs bridge module.
 *
 * Bridges Node.js to scripts/panns_inference.py for:
 * - Audio tagging (music-relevant AudioSet labels)
 * - 2048-dim embeddings for similarity search
 */

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PANNS_CONFIG = {
  scriptPath: path.join(__dirname, '../../scripts/panns_inference.py'),
  embeddingDim: 2048,
  topK: 20,
  timeout: 120000,
  pythonCommand: process.env.ORBIT_PANNS_PYTHON
    || process.env.ORBIT_PYTHON_PATH
    || (fs.existsSync(path.join(__dirname, '../../.venv/bin/python3'))
      ? path.join(__dirname, '../../.venv/bin/python3')
      : 'python3'),
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

async function runInference(audioPath, options = {}) {
  const {
    topK = PANNS_CONFIG.topK,
    includeEmbedding = false,
    verbose = process.env.ORBIT_ML_VERBOSE === 'true',
  } = options;

  return new Promise((resolve, reject) => {
    const args = [
      PANNS_CONFIG.scriptPath,
      audioPath,
      '--output', 'json',
      '--top-k', String(topK),
    ];

    if (includeEmbedding) {
      args.push('--include-embedding');
    }

    const proc = spawn(PANNS_CONFIG.pythonCommand, args, {
      timeout: PANNS_CONFIG.timeout,
      env: PANNS_CONFIG.env,
    });

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
            reject(new Error(`PANNs error (${err.error}): ${err.message}`));
            return;
          }
        } catch (e) {
          // fall through
        }
        reject(new Error(`PANNs process failed (code ${code}): ${stderr || stdout}`));
        return;
      }

      try {
        resolve(parseJsonPayload(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse PANNs output: ${error.message}\nOutput: ${stdout}`));
      }
    });

    proc.on('error', (err) => {
      if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
        reject(new Error(`PANNs timed out after ${PANNS_CONFIG.timeout / 1000}s`));
      } else {
        reject(new Error(`PANNs process error: ${err.message}`));
      }
    });
  });
}

async function tag(input, options = {}) {
  const { audioPath, tempFile } = resolveInputToPath(input, 'orbit-panns-tag');
  try {
    const output = await runInference(audioPath, {
      ...options,
      includeEmbedding: false,
    });
    return output.tags || [];
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function getEmbedding(input, options = {}) {
  const { audioPath, tempFile } = resolveInputToPath(input, 'orbit-panns-emb');
  try {
    const output = await runInference(audioPath, {
      ...options,
      includeEmbedding: true,
      topK: options.topK || PANNS_CONFIG.topK,
    });

    if (!Array.isArray(output.embedding)) {
      throw new Error('PANNs output missing embedding array');
    }

    const embedding = new Float32Array(output.embedding);
    if (embedding.length !== PANNS_CONFIG.embeddingDim) {
      throw new Error(
        `Unexpected PANNs embedding dimension: ${embedding.length} (expected ${PANNS_CONFIG.embeddingDim})`
      );
    }

    return embedding;
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function checkEnvironment() {
  return new Promise((resolve) => {
    try {
      const pythonVersion = execFileSync(PANNS_CONFIG.pythonCommand, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (!fs.existsSync(PANNS_CONFIG.scriptPath)) {
        resolve({
          available: false,
          message: 'PANNs script not found',
          details: { scriptPath: PANNS_CONFIG.scriptPath, pythonVersion },
        });
        return;
      }

      const proc = spawn(PANNS_CONFIG.pythonCommand, [
        PANNS_CONFIG.scriptPath,
        '--check',
      ], {
        env: PANNS_CONFIG.env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const result = parseJsonPayload(stdout);
            resolve(result);
            return;
          } catch (e) {
            resolve({
              available: true,
              message: 'PANNs environment ready',
              details: { pythonVersion },
            });
            return;
          }
        }

        try {
          const err = parseJsonPayload(stdout);
          resolve({
            available: false,
            message: err.message || 'PANNs check failed',
            details: { ...err, pythonVersion },
          });
        } catch (e) {
          resolve({
            available: false,
            message: `PANNs check failed: ${stderr || stdout}`,
            details: { pythonVersion },
          });
        }
      });

      proc.on('error', (error) => {
        resolve({
          available: false,
          message: `PANNs process error: ${error.message}`,
          details: { error: error.message },
        });
      });
    } catch (error) {
      resolve({
        available: false,
        message: `Python not available: ${error.message}`,
        details: {
          pythonCommand: PANNS_CONFIG.pythonCommand,
          install: 'Install Python and run: pip install panns_inference',
        },
      });
    }
  });
}

const config = { ...PANNS_CONFIG };

module.exports = {
  tag,
  getEmbedding,
  checkEnvironment,
  config,
  EMBEDDING_DIM: PANNS_CONFIG.embeddingDim,
};
