/**
 * ORBIT OpenAI Content Provenance Engine
 *
 * Checks audio files for OpenAI-generated provenance signals via the official
 * OpenAI Content Provenance API (POST /v1/content_provenance_checks).
 *
 * Supported Provenance Signals:
 *   - SynthID: Imperceptible neural watermark embedded in OpenAI-generated audio
 *   - C2PA Content Credentials: Cryptographic metadata manifest
 *
 * Fail-Open Design:
 *   If OPENAI_API_KEY is not configured or the endpoint is unreachable,
 *   the check returns a safe non-blocking result allowing the pipeline
 *   to continue.
 *
 * @see https://platform.openai.com/docs/api-reference/content-provenance
 */

'use strict';

const FormData = require('form-data');
const config = require('../config');

/**
 * Check audio bytes for OpenAI provenance signals (SynthID / C2PA).
 *
 * @param {Buffer} audioBuffer - Raw audio file bytes (wav, mp3, etc.)
 * @param {Object} [options]
 * @param {string} [options.apiKey]    - Override OpenAI API key
 * @param {string} [options.baseUrl]   - Override API base URL
 * @param {string} [options.endpoint]  - Override endpoint path
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds
 * @param {string} [options.filename]  - Upload filename (default: 'sample.wav')
 * @returns {Promise<{checked: boolean, detected: boolean, status: string, signal?: string|null, confidence?: number|null, model?: string|null, details?: Object, error?: string, processing_time_ms: number}>}
 */
async function checkOpenAIProvenance(audioBuffer, options = {}) {
  const startTime = Date.now();

  const apiKey = options.apiKey || config.openai?.apiKey;
  const baseUrl = options.baseUrl || config.openai?.baseUrl || 'https://api.openai.com/v1';
  const endpoint = options.endpoint || config.openai?.endpoint || '/content_provenance_checks';
  const timeoutMs = options.timeoutMs || config.openai?.timeoutMs || 10000;
  const filename = options.filename || 'sample.wav';

  if (!apiKey) {
    return {
      checked: false,
      detected: false,
      status: 'unconfigured',
      error: 'OPENAI_API_KEY not configured',
      processing_time_ms: 0,
    };
  }

  if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    return {
      checked: false,
      detected: false,
      status: 'invalid_input',
      error: 'No audio buffer provided or audio buffer is empty',
      processing_time_ms: 0,
    };
  }

  try {
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename,
      contentType: 'audio/wav',
    });

    const url = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

    const headers = {
      ...form.getHeaders(),
      Authorization: `Bearer ${apiKey}`,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: form.getBuffer(),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      let errorMsg = `OpenAI returned HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error?.message) {
          errorMsg = `OpenAI error: ${parsed.error.message}`;
        }
      } catch {
        if (errorText) errorMsg += ` - ${errorText.slice(0, 100)}`;
      }
      throw new Error(errorMsg);
    }

    const body = await res.json();
    return parseOpenAIProvenanceResponse(body, Date.now() - startTime);

  } catch (err) {
    console.warn(`[OpenAIProvenance] Check failed (fail-open): ${err.message}`);
    return {
      checked: false,
      detected: false,
      status: 'error',
      error: err.message,
      processing_time_ms: Date.now() - startTime,
    };
  }
}

/**
 * Parse and normalize the OpenAI Content Provenance API JSON response.
 *
 * @param {Object} body - Parsed JSON response from OpenAI API
 * @param {number} processingTimeMs - Execution time in milliseconds
 * @returns {Object} Normalized provenance result
 */
function parseOpenAIProvenanceResponse(body, processingTimeMs) {
  const resultStatus = body.status || (body.detected ? 'detected' : 'not_detected');
  const isDetected = resultStatus === 'detected' || body.detected === true;

  // Extract detected signal types (SynthID, C2PA, etc.)
  let signalType = null;
  if (isDetected) {
    if (body.signals && Array.isArray(body.signals) && body.signals.length > 0) {
      signalType = body.signals[0].type || body.signals[0];
    } else if (body.provenance?.type) {
      signalType = body.provenance.type;
    } else if (body.signal) {
      signalType = body.signal;
    } else {
      signalType = 'synthid'; // Default signal for audio
    }
  }

  return {
    checked: true,
    detected: isDetected,
    status: isDetected ? 'detected' : 'not_detected',
    signal: signalType,
    confidence: body.confidence !== undefined ? body.confidence : (isDetected ? 1.0 : 0.0),
    model: body.model || body.metadata?.model || null,
    created_at: body.created_at || body.createdAt || null,
    details: {
      signals: body.signals || [],
      metadata: body.metadata || body.provenance || null,
      raw_status: body.status || null,
    },
    processing_time_ms: processingTimeMs,
  };
}

module.exports = {
  checkOpenAIProvenance,
  parseOpenAIProvenanceResponse,
};
