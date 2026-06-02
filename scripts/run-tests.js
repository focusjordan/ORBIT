#!/usr/bin/env node

/**
 * ORBIT Test Runner
 * 
 * Runs all ORBIT tests in the correct order, handling prerequisites gracefully.
 * 
 * Usage:
 *   npm test              - Run all tests (V1 + safe V2) with SHORT audio (fast)
 *   npm run test:full     - Run all tests with LONG audio (thorough)
 *   npm run test:v1       - Run V1 core tests only
 *   npm run test:v2:safe  - Run V2 tests that don't need DB state
 *   npm run test:unit     - Run unit tests only (no DB/server needed)
 * 
 * Flags:
 *   --fast                - Use 5-second audio (default, ~6x faster)
 *   --full                - Use 30-second audio (thorough validation)
 *   --skip-ml             - Skip ML tests (faster CI)
 * 
 * Environment:
 *   SKIP_API_TESTS=1      - Skip tests that need running server
 *   SKIP_ML_TESTS=1       - Skip ML model tests (slow, need downloads)
 *   VERBOSE=1             - Show detailed output
 *   TEST_AUDIO_MODE=fast  - Use short audio (5 sec) - DEFAULT
 *   TEST_AUDIO_MODE=full  - Use long audio (30 sec)
 */

// Load environment variables from .env file
require('dotenv').config();

// Parse command line flags
const args = process.argv.slice(2);
const isFastMode = args.includes('--fast') || !args.includes('--full');
const isFullMode = args.includes('--full');
const skipMLFlag = args.includes('--skip-ml');

// Set test audio mode (default to fast for better developer experience)
if (isFullMode) {
  process.env.TEST_AUDIO_MODE = 'full';
  console.log('[INFO] Running in FULL mode (30-second audio) - thorough but slow\n');
} else {
  process.env.TEST_AUDIO_MODE = 'fast';
  console.log('[INFO] Running in FAST mode (5-second audio) - quick development iteration\n');
}

if (skipMLFlag) {
  process.env.SKIP_ML_TESTS = '1';
}

// IMPORTANT: Force spread spectrum watermarking for tests
// SilentCipher neural watermarking requires GPU and crashes on Apple Silicon
// This is documented in ORBIT_ROADMAP.md and must be set for tests to run properly
process.env.ORBIT_WATERMARK_METHOD = 'spread';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Auto-load test platform credentials if available
const credentialsPath = path.join(process.cwd(), '.test-platform-credentials.json');
if (fs.existsSync(credentialsPath) && !process.env.TEST_PLATFORM_PRIVATE_KEY) {
  try {
    const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    process.env.TEST_PLATFORM_PRIVATE_KEY = creds.private_key;
    process.env.TEST_PLATFORM_API_KEY = creds.api_key;
    console.log('[INFO] Loaded credentials from .test-platform-credentials.json');
  } catch (e) {
    // Ignore, will be handled by prerequisite check
  }
}

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Test categories
const TEST_SUITES = {
  // V1 Unit Tests - No external dependencies (except fpcalc/ffmpeg)
  'v1:unit': [
    { name: 'Crypto Engine', file: 'tests/engines/crypto.test.js' },
    { name: 'Watermark Embed', file: 'tests/engines/watermark-embed.test.js' },
    { name: 'Watermark Extract', file: 'tests/engines/watermark-extract.test.js' },
    { name: 'Audio Utils', file: 'tests/utils/audio.test.js' },
  ],
  
  // V1 Tests that need Chromaprint (fpcalc)
  'v1:fingerprint': [
    { name: 'Fingerprint Engine', file: 'tests/engines/fingerprint.test.js' },
  ],
  
  // V1 Tests that need PostgreSQL
  'v1:db': [
    { name: 'Fingerprint DB', file: 'tests/engines/fingerprint-db.test.js' },
  ],
  
  // V1 API Tests - Need running server + DB + seeded platform
  'v1:api': [
    { name: 'Auth Middleware', file: 'tests/api/auth.test.js' },
    { name: 'Register Endpoint', file: 'tests/api/register.test.js' },
    { name: 'Register Full Metadata', file: 'tests/api/register-full-metadata.test.js' },
    { name: 'Verify Endpoint', file: 'tests/api/verify.test.js' },
    { name: 'Chain Endpoint', file: 'tests/api/chain.test.js' },
  ],
  
  // V1 Unified Watermark (may use neural if available)
  'v1:watermark-unified': [
    { name: 'Watermark Unified', file: 'tests/engines/watermark-unified.test.js' },
  ],
  
  // V2 Safe Tests - Need ML models but NO database state
  'v2:safe': [
    { name: 'ML Models Manager', file: 'tests/ml/models.test.js' },
    { name: 'CLAP Classification', file: 'tests/ml/clap.test.js' },
    { name: 'Audio Analysis (BPM/Key)', file: 'tests/ml/audio-analysis.test.js' },
    { name: 'Metadata Extractor', file: 'tests/ml/metadata-extractor.test.js' },
  ],
  
  // V2 Tests that need DB state - Skip in automated runs
  'v2:db-dependent': [
    { name: 'Content Analysis', file: 'tests/ml/content-analysis.test.js', skip: true, reason: 'Needs registered tracks' },
    { name: 'V2 API Endpoints', file: 'tests/api/v2-endpoints.test.js', skip: true, reason: 'Needs DB state' },
  ],
  
  // Tests that require special environment - Always skip in CI
  'skip:gpu': [
    { name: 'SilentCipher', file: 'tests/ml/silentcipher.test.js', skip: true, reason: 'Requires GPU' },
  ],
  
  // Disabled tests
  'skip:disabled': [
    { name: 'MERT', file: 'tests/ml/mert.test.js', skip: true, reason: 'MERT disabled (license)' },
  ],
};

// Run a single test file
async function runTest(testPath, name) {
  const fullPath = path.join(process.cwd(), testPath);
  
  if (!fs.existsSync(fullPath)) {
    log(colors.yellow, `  [WARN] ${name}: File not found (${testPath})`);
    return { status: 'skipped', reason: 'file not found' };
  }
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn('node', [fullPath], {
      stdio: process.env.VERBOSE ? 'inherit' : 'pipe',
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    
    let output = '';
    if (!process.env.VERBOSE) {
      child.stdout?.on('data', (data) => { output += data.toString(); });
      child.stderr?.on('data', (data) => { output += data.toString(); });
    }
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      if (code === 0) {
        log(colors.green, `  PASS ${name} (${duration}ms)`);
        resolve({ status: 'passed', duration });
      } else {
        log(colors.red, `  FAIL ${name} (exit code ${code})`);
        if (!process.env.VERBOSE && output) {
          // Show last few lines of output on failure
          const lines = output.trim().split('\n').slice(-10);
          console.log(colors.yellow + '     Last output:' + colors.reset);
          lines.forEach(line => console.log('     ' + line));
        }
        resolve({ status: 'failed', code, duration });
      }
    });
    
    child.on('error', (err) => {
      log(colors.red, `  ERROR ${name}: ${err.message}`);
      resolve({ status: 'error', error: err.message });
    });
  });
}

// Run a suite of tests
async function runSuite(suiteName, tests, options = {}) {
  log(colors.cyan, `\n[SUITE] ${suiteName}`);
  log(colors.cyan, '─'.repeat(50));
  
  const results = { passed: 0, failed: 0, skipped: 0 };
  
  for (const test of tests) {
    if (test.skip || options.skip) {
      log(colors.yellow, `  SKIP ${test.name} (skipped: ${test.reason || options.skipReason || 'user request'})`);
      results.skipped++;
      continue;
    }
    
    const result = await runTest(test.file, test.name);
    
    if (result.status === 'passed') {
      results.passed++;
    } else if (result.status === 'skipped') {
      results.skipped++;
    } else {
      results.failed++;
    }
  }
  
  return results;
}

// Check prerequisites
async function checkPrerequisites() {
  const checks = {
    fpcalc: false,
    ffmpeg: false,
    postgres: false,
    server: false,
    testAudio: false,
  };
  
  // Check fpcalc
  try {
    const { execSync } = require('child_process');
    execSync('fpcalc -version', { stdio: 'pipe' });
    checks.fpcalc = true;
  } catch {}
  
  // Check ffmpeg
  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'pipe' });
    checks.ffmpeg = true;
  } catch {}
  
  // Check test audio
  const hasFullAudio = fs.existsSync(path.join(process.cwd(), 'tests/fixtures/test-audio.mp3'));
  const hasShortAudio = fs.existsSync(path.join(process.cwd(), 'tests/fixtures/test-audio-short.mp3'));
  checks.testAudio = isFastMode ? hasShortAudio : hasFullAudio;
  
  // Check PostgreSQL (try to connect)
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('SELECT 1');
    await pool.end();
    checks.postgres = true;
  } catch {}
  
  // Check if server is running
  try {
    const response = await fetch('http://localhost:4000/health');
    checks.server = response.ok;
  } catch {}
  
  return checks;
}

// Main runner
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';
  
  console.log(colors.bright + colors.blue);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                  ORBIT Test Runner                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  // Check prerequisites
  log(colors.cyan, '[CHECK] Checking prerequisites...');
  const prereqs = await checkPrerequisites();
  
  console.log(`   fpcalc (Chromaprint): ${prereqs.fpcalc ? 'OK' : 'NOT FOUND'}`);
  console.log(`   ffmpeg:               ${prereqs.ffmpeg ? 'OK' : 'NOT FOUND'}`);
  console.log(`   PostgreSQL:           ${prereqs.postgres ? 'OK' : 'NOT FOUND'}`);
  console.log(`   Server (localhost):   ${prereqs.server ? 'OK' : 'NOT FOUND'}`);
  console.log(`   Test audio files:     ${prereqs.testAudio ? 'OK' : 'NOT FOUND'}`);
  
  const totals = { passed: 0, failed: 0, skipped: 0 };
  
  // Determine what to run based on mode
  const skipApi = process.env.SKIP_API_TESTS === '1' || !prereqs.server;
  const skipML = process.env.SKIP_ML_TESTS === '1';
  const skipDb = !prereqs.postgres;
  
  if (mode === 'all' || mode === 'v1' || mode === 'unit') {
    // V1 Unit Tests
    const unitResults = await runSuite('V1 Unit Tests', TEST_SUITES['v1:unit']);
    totals.passed += unitResults.passed;
    totals.failed += unitResults.failed;
    totals.skipped += unitResults.skipped;
  }
  
  if (mode === 'all' || mode === 'v1') {
    // V1 Fingerprint Tests
    const fpResults = await runSuite('V1 Fingerprint Tests', TEST_SUITES['v1:fingerprint'], {
      skip: !prereqs.fpcalc,
      skipReason: 'fpcalc not installed',
    });
    totals.passed += fpResults.passed;
    totals.failed += fpResults.failed;
    totals.skipped += fpResults.skipped;
    
    // V1 DB Tests
    const dbResults = await runSuite('V1 Database Tests', TEST_SUITES['v1:db'], {
      skip: skipDb,
      skipReason: 'PostgreSQL not available',
    });
    totals.passed += dbResults.passed;
    totals.failed += dbResults.failed;
    totals.skipped += dbResults.skipped;
    
    // V1 API Tests
    const apiResults = await runSuite('V1 API Tests', TEST_SUITES['v1:api'], {
      skip: skipApi,
      skipReason: 'Server not running or SKIP_API_TESTS=1',
    });
    totals.passed += apiResults.passed;
    totals.failed += apiResults.failed;
    totals.skipped += apiResults.skipped;
    
    // V1 Unified Watermark
    const wmResults = await runSuite('V1 Unified Watermark', TEST_SUITES['v1:watermark-unified']);
    totals.passed += wmResults.passed;
    totals.failed += wmResults.failed;
    totals.skipped += wmResults.skipped;
  }
  
  if ((mode === 'all' || mode === 'v2' || mode === 'v2:safe') && !skipML) {
    // V2 Safe Tests
    const v2SafeResults = await runSuite('V2 Metadata Extraction (Safe)', TEST_SUITES['v2:safe']);
    totals.passed += v2SafeResults.passed;
    totals.failed += v2SafeResults.failed;
    totals.skipped += v2SafeResults.skipped;
  }
  
  // Always report skipped tests
  if (mode === 'all') {
    log(colors.yellow, '\nSkipped Test Suites:');
    for (const test of [...TEST_SUITES['v2:db-dependent'], ...TEST_SUITES['skip:gpu'], ...TEST_SUITES['skip:disabled']]) {
      log(colors.yellow, `   - ${test.name}: ${test.reason}`);
    }
  }
  
  // Summary
  console.log(colors.bright);
  console.log('\n' + '═'.repeat(60));
  console.log('                      TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(colors.reset);
  console.log(`   ${colors.green}Passed:${colors.reset}  ${totals.passed}`);
  console.log(`   ${colors.red}Failed:${colors.reset}  ${totals.failed}`);
  console.log(`   ${colors.yellow}Skipped:${colors.reset} ${totals.skipped}`);
  console.log('─'.repeat(60));
  
  if (totals.failed > 0) {
    log(colors.red, '\n[FAIL] Some tests failed!');
    process.exit(1);
  } else {
    log(colors.green, '\n[PASS] All tests passed!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});

