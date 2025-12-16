/**
 * ORBIT Test Configuration
 * 
 * Centralized test settings for audio files, timeouts, and fixtures.
 * All tests should import this module for consistent configuration.
 * 
 * Usage:
 *   const { getTestAudioPath, getWatermarkedFixturePath, TEST_CONFIG } = require('../test-config');
 *   const audioBuffer = fs.readFileSync(getTestAudioPath());
 */

const path = require('path');
const fs = require('fs');

// Determine test mode from environment (set by run-tests.js)
const TEST_MODE = process.env.TEST_AUDIO_MODE || 'fast';

/**
 * Test configuration based on mode
 */
const TEST_CONFIG = {
  fast: {
    // 15-second audio - minimum for spread spectrum (needs 11.6s at 44.1kHz)
    // Still 2x faster than full 30-second tests
    audioFile: 'test-audio-short.mp3',
    audioDuration: 15,
    expectedWatermarkTime: 45000,  // ~45 seconds expected
    testTimeout: 120000,           // 2 minute timeout
    description: 'Fast mode (15-second audio)',
  },
  full: {
    // 30-second audio for thorough testing
    audioFile: 'test-audio.mp3',
    audioDuration: 30,
    expectedWatermarkTime: 120000, // ~2 minutes expected
    testTimeout: 600000,           // 10 minute timeout
    description: 'Full mode (30-second audio)',
  },
};

/**
 * Get the current test configuration
 */
function getConfig() {
  return TEST_CONFIG[TEST_MODE] || TEST_CONFIG.fast;
}

/**
 * Get path to the appropriate test audio file
 * @returns {string} Absolute path to test audio
 */
function getTestAudioPath() {
  const config = getConfig();
  const audioPath = path.join(__dirname, 'fixtures', config.audioFile);
  
  // Fallback to 30-second audio if 5-second doesn't exist
  if (!fs.existsSync(audioPath)) {
    const fallbackPath = path.join(__dirname, 'fixtures', 'test-audio.mp3');
    if (fs.existsSync(fallbackPath)) {
      console.warn(`⚠️  ${config.audioFile} not found, using test-audio.mp3`);
      return fallbackPath;
    }
    throw new Error(`Test audio not found: ${audioPath}`);
  }
  
  return audioPath;
}

/**
 * Get path to a pre-watermarked fixture (for verify tests)
 * These are cached from previous runs to speed up verify tests
 * 
 * @param {string} name - Fixture name (e.g., 'basic', 'full-metadata')
 * @returns {string|null} Path to fixture, or null if not cached
 */
function getWatermarkedFixturePath(name = 'basic') {
  const fixtureName = TEST_MODE === 'fast' 
    ? `test-watermarked-${name}-15sec.wav`
    : `test-watermarked-${name}.wav`;
  
  const fixturePath = path.join(__dirname, 'fixtures', 'cached', fixtureName);
  
  if (fs.existsSync(fixturePath)) {
    return fixturePath;
  }
  
  return null;
}

/**
 * Save a watermarked fixture for future test runs
 * 
 * @param {Buffer} audioBuffer - Watermarked audio data
 * @param {string} name - Fixture name
 */
function cacheWatermarkedFixture(audioBuffer, name = 'basic') {
  const cacheDir = path.join(__dirname, 'fixtures', 'cached');
  
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const fixtureName = TEST_MODE === 'fast'
    ? `test-watermarked-${name}-15sec.wav`
    : `test-watermarked-${name}.wav`;
  
  const fixturePath = path.join(cacheDir, fixtureName);
  fs.writeFileSync(fixturePath, audioBuffer);
  
  console.log(`📦 Cached watermarked fixture: ${fixtureName}`);
  return fixturePath;
}

/**
 * Check if we should use cached fixtures
 * @returns {boolean}
 */
function shouldUseCache() {
  // Always try to use cache unless explicitly disabled
  return process.env.ORBIT_TEST_NO_CACHE !== '1';
}

/**
 * Log test mode at start of test file
 */
function logTestMode(testName) {
  const config = getConfig();
  console.log(`\n🧪 ${testName}`);
  console.log(`   Mode: ${config.description}`);
  console.log(`   Audio: ${config.audioFile} (${config.audioDuration}s)\n`);
}

module.exports = {
  TEST_CONFIG,
  TEST_MODE,
  getConfig,
  getTestAudioPath,
  getWatermarkedFixturePath,
  cacheWatermarkedFixture,
  shouldUseCache,
  logTestMode,
};

