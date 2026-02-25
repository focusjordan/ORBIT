/**
 * ORBIT Watermark Match Handler
 * POST /orbit/v1/watermarkmatch
 *
 * Stripped-down verification: extracts watermark from audio and looks up
 * the matching registration in the ledger. No fingerprinting, no AI
 * metadata, no crypto — just the watermark round-trip.
 *
 * SilentCipher embeds 5 bytes (first 5 of the 16-byte watermark_hash).
 * This endpoint extracts those 5 bytes and finds registrations whose
 * stored watermark_hash starts with that prefix.
 */

const { UnifiedWatermark } = require('../../engines/watermark-unified');
const queries = require('../../ledger/queries');
const config = require('../../config');

async function watermarkmatchHandler(req, res) {
  const startTime = Date.now();

  try {
    const { audio } = req.body;

    if (!audio) {
      return res.orbitError('missing_audio', 'audio (base64) is required', 400);
    }

    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audio, 'base64');
    } catch (e) {
      return res.orbitError('invalid_audio', 'audio must be valid base64', 400);
    }

    if (audioBuffer.length === 0) {
      return res.orbitError('empty_audio', 'audio buffer is empty', 400);
    }

    console.log(`[WatermarkMatch] Processing ${audioBuffer.length} bytes`);

    // 1. Extract watermark
    const watermark = new UnifiedWatermark(config.orbit.secretKey);
    const extracted = await watermark.extract(audioBuffer, {
      verbose: true,
      tryBothMethods: true,
    });

    console.log(`[WatermarkMatch] Extraction result:`, JSON.stringify({
      detected: extracted.detected,
      method: extracted.method,
      confidence: extracted.confidence,
      payloadHash: extracted.payloadHash?.toString('hex') || null,
    }));

    if (!extracted.detected) {
      return res.orbit({
        watermark_detected: false,
        method: null,
        confidence: 0,
        match: null,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // 2. Look up registration by watermark hash prefix
    let match = null;

    if (extracted.payloadHash) {
      const rows = await queries.findByWatermarkHashPrefix(extracted.payloadHash);
      if (rows.length > 0) {
        match = {
          registration_id: rows[0].id,
          title: rows[0].title,
          artist: rows[0].artist,
          origin_platform: rows[0].origin_platform,
          owner_id: rows[0].owner_id,
          registered_at: rows[0].created_at,
          watermark_hash: rows[0].watermark_hash?.toString('hex') || null,
          total_matches: rows.length,
        };
      }
    }

    return res.orbit({
      watermark_detected: true,
      method: extracted.method,
      confidence: extracted.confidence,
      extracted_hash: extracted.payloadHash?.toString('hex') || null,
      parsed_payload: extracted.parsedPayload || null,
      match,
      processing_time_ms: Date.now() - startTime,
    });

  } catch (error) {
    console.error('[WatermarkMatch] Error:', error);
    return res.orbitError(
      'watermarkmatch_error',
      `Watermark match failed: ${error.message}`,
      500
    );
  }
}

module.exports = watermarkmatchHandler;
