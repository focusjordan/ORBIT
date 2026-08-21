/**
 * OpenAI Content Provenance Engine Tests
 *
 * Tests the OpenAI Content Provenance API connector, fail-open behavior,
 * SynthID / C2PA detection responses, error handling, and AI detection integration.
 */

'use strict';

const assert = require('assert');
const openaiProvenance = require('../../src/engines/openai-provenance');
const aiDetection = require('../../src/ml/ai-detection');

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║        OpenAI Content Provenance Engine Tests            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

async function runTests() {
  const originalFetch = globalThis.fetch;
  let testCount = 0;
  let passCount = 0;

  function recordTest(name, fn) {
    testCount++;
    try {
      fn();
      passCount++;
      console.log(`  PASS ${name}`);
    } catch (err) {
      console.error(`  FAIL ${name}`);
      console.error(`       ${err.message}`);
      throw err;
    }
  }

  async function recordAsyncTest(name, fn) {
    testCount++;
    try {
      await fn();
      passCount++;
      console.log(`  PASS ${name}`);
    } catch (err) {
      console.error(`  FAIL ${name}`);
      console.error(`       ${err.message}`);
      throw err;
    }
  }

  // 1. Unconfigured API Key Fail-Open
  await recordAsyncTest('Unconfigured API key returns fail-open unconfigured status', async () => {
    const fakeAudio = Buffer.from('RIFF1234WAVEfmt ');
    const result = await openaiProvenance.checkOpenAIProvenance(fakeAudio, { apiKey: null });

    assert.strictEqual(result.checked, false);
    assert.strictEqual(result.detected, false);
    assert.strictEqual(result.status, 'unconfigured');
    assert.ok(result.error && result.error.includes('not configured'));
  });

  // 2. Empty / Invalid Audio Buffer Handling
  await recordAsyncTest('Empty audio buffer returns invalid_input status', async () => {
    const result = await openaiProvenance.checkOpenAIProvenance(Buffer.alloc(0), { apiKey: 'test-key' });

    assert.strictEqual(result.checked, false);
    assert.strictEqual(result.detected, false);
    assert.strictEqual(result.status, 'invalid_input');
  });

  // 3. Mocked SynthID Detected Response
  await recordAsyncTest('Parses positive SynthID detection response correctly', async () => {
    globalThis.fetch = async (url, options) => {
      assert.ok(options.headers.Authorization.includes('test-key'));
      return {
        ok: true,
        json: async () => ({
          status: 'detected',
          detected: true,
          signals: [{ type: 'synthid', confidence: 0.98 }],
          metadata: { model: 'tts-1-hd', created_at: 1724200000 },
        }),
      };
    };

    try {
      const fakeAudio = Buffer.from('RIFF....WAVE');
      const result = await openaiProvenance.checkOpenAIProvenance(fakeAudio, { apiKey: 'test-key' });

      assert.strictEqual(result.checked, true);
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.status, 'detected');
      assert.strictEqual(result.signal, 'synthid');
      assert.strictEqual(result.model, 'tts-1-hd');
      assert.ok(result.processing_time_ms >= 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Mocked C2PA Credentials Detected Response
  await recordAsyncTest('Parses positive C2PA detection response correctly', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'detected',
        detected: true,
        signals: [{ type: 'c2pa', confidence: 1.0 }],
        metadata: { issuer: 'OpenAI', model: 'voice-v2' },
      }),
    });

    try {
      const fakeAudio = Buffer.from('RIFF....WAVE');
      const result = await openaiProvenance.checkOpenAIProvenance(fakeAudio, { apiKey: 'test-key' });

      assert.strictEqual(result.checked, true);
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.status, 'detected');
      assert.strictEqual(result.signal, 'c2pa');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 5. Mocked Not Detected Response
  await recordAsyncTest('Parses not_detected response correctly', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'not_detected',
        detected: false,
        signals: [],
      }),
    });

    try {
      const fakeAudio = Buffer.from('RIFF....WAVE');
      const result = await openaiProvenance.checkOpenAIProvenance(fakeAudio, { apiKey: 'test-key' });

      assert.strictEqual(result.checked, true);
      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.status, 'not_detected');
      assert.strictEqual(result.signal, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 6. HTTP Error & Fail-Open Resilience
  await recordAsyncTest('Handles HTTP errors gracefully without throwing', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: { message: 'Service Unavailable' } }),
    });

    try {
      const fakeAudio = Buffer.from('RIFF....WAVE');
      const result = await openaiProvenance.checkOpenAIProvenance(fakeAudio, { apiKey: 'test-key' });

      assert.strictEqual(result.checked, false);
      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error && result.error.includes('Service Unavailable'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7. AI Detection Module Integration
  await recordAsyncTest('AI Detection activates OPENAI_SYNTHID_DETECTED and floors score at 1.0', async () => {
    const fakeAudio = Buffer.from('RIFF....WAVE');
    const mockOpenAIResult = {
      checked: true,
      detected: true,
      signal: 'synthid',
      model: 'tts-1',
      details: { signals: [{ type: 'synthid' }] },
    };

    const aiResult = await aiDetection.detectAI(fakeAudio, {
      openaiResult: mockOpenAIResult,
      analysisResult: { duration: 10, ai_forensics: {} },
      metadata: { title: 'Test Track' },
      flags: { v2Enabled: true },
      verbose: false,
    });

    assert.strictEqual(aiResult.score, 1.0);
    assert.strictEqual(aiResult.recommendation, 'LIKELY_AI');
    assert.strictEqual(aiResult.score_floor_applied, 1.0);

    const allFlags = aiDetection.getAllFlags(aiResult);
    assert.ok(allFlags.includes('OPENAI_SYNTHID_DETECTED'));
  });

  // 8. Standalone helper function export check
  recordTest('Exports checkOpenAIProvenanceSignal from ai-detection module', () => {
    assert.ok(typeof aiDetection.checkOpenAIProvenanceSignal === 'function');
  });

  console.log(`\n============================================================`);
  console.log(`OpenAI Provenance Tests: ${passCount}/${testCount} passed`);
  console.log(`============================================================\n`);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
