'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.orbitrc');
const LOCAL_CONFIG_DIR = '.orbit';
const LOCAL_CONFIG_FILE = 'config.json';

/**
 * Find the project-local .orbit/config.json by walking up from cwd.
 * Returns null if not found.
 */
function findLocalConfig(startDir = process.cwd()) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, LOCAL_CONFIG_DIR, LOCAL_CONFIG_FILE);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Load config with precedence: env vars > project local > global ~/.orbitrc
 */
function loadConfig() {
  const globalConf = fs.existsSync(GLOBAL_CONFIG_PATH)
    ? readJsonSafe(GLOBAL_CONFIG_PATH)
    : {};

  const localPath = findLocalConfig();
  const localConf = localPath ? readJsonSafe(localPath) : {};

  const merged = { ...globalConf, ...localConf };

  return {
    apiUrl: process.env.ORBIT_API_URL || merged.apiUrl || 'http://localhost:4000',
    platformId: process.env.ORBIT_PLATFORM_ID || merged.platformId || '',
    privateKey: process.env.ORBIT_PRIVATE_KEY || merged.privateKey || '',
    apiKey: process.env.ORBIT_API_KEY || merged.apiKey || '',
  };
}

/**
 * Write config to the given scope.
 * @param {'global'|'local'} scope
 * @param {Object} data
 */
function writeConfig(scope, data) {
  let filePath;
  if (scope === 'local') {
    const dir = path.join(process.cwd(), LOCAL_CONFIG_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, LOCAL_CONFIG_FILE);
  } else {
    filePath = GLOBAL_CONFIG_PATH;
  }

  const existing = fs.existsSync(filePath) ? readJsonSafe(filePath) : {};
  const merged = { ...existing, ...data };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return filePath;
}

/**
 * Build an OrbitClient from the resolved config.
 * Throws with a helpful message if credentials are missing.
 */
function buildClient(flagOverrides = {}) {
  const conf = loadConfig();
  const apiUrl = flagOverrides.apiUrl || conf.apiUrl;
  const platformId = flagOverrides.platformId || conf.platformId;
  const privateKeyB64 = flagOverrides.privateKey || conf.privateKey;
  const apiKey = flagOverrides.apiKey || conf.apiKey;

  if (!platformId) {
    throw new Error('No platform ID configured. Run `orbit init` or set ORBIT_PLATFORM_ID.');
  }
  if (!privateKeyB64) {
    throw new Error('No private key configured. Run `orbit init` or set ORBIT_PRIVATE_KEY.');
  }

  const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

  const clientOpts = {
    apiUrl,
    platformId,
    privateKey: Buffer.from(privateKeyB64, 'base64'),
  };
  if (apiKey) clientOpts.apiKey = apiKey;

  return new OrbitClient(clientOpts);
}

module.exports = {
  loadConfig,
  writeConfig,
  buildClient,
  findLocalConfig,
  GLOBAL_CONFIG_PATH,
};
