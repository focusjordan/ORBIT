'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const multer = require('multer');
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

const PORT = process.env.DEMO_PORT || 3000;

// ---------------------------------------------------------------------------
// SDK Client
// ---------------------------------------------------------------------------

function buildClient() {
  const apiUrl = process.env.ORBIT_API_URL;
  const platformId = process.env.ORBIT_PLATFORM_ID;
  const privateKeyB64 = process.env.ORBIT_PRIVATE_KEY;
  const apiKey = process.env.ORBIT_API_KEY || undefined;

  if (!apiUrl) throw new Error('ORBIT_API_URL is required');
  if (!platformId) throw new Error('ORBIT_PLATFORM_ID is required');
  if (!privateKeyB64) throw new Error('ORBIT_PRIVATE_KEY is required');

  const opts = { apiUrl, platformId, privateKey: Buffer.from(privateKeyB64, 'base64') };
  if (apiKey) opts.apiKey = apiKey;
  return new OrbitClient(opts);
}

let client;
try {
  client = buildClient();
  console.log(`  ORBIT SDK client initialized (server: ${process.env.ORBIT_API_URL})`);
} catch (err) {
  console.error(`\n  Failed to initialize ORBIT client: ${err.message}`);
  console.error('  Set ORBIT_API_URL, ORBIT_PLATFORM_ID, and ORBIT_PRIVATE_KEY\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Express Setup
// ---------------------------------------------------------------------------

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ---------------------------------------------------------------------------
// GET /api/status
// ---------------------------------------------------------------------------

app.get('/api/status', async (_req, res) => {
  try {
    const apiUrl = process.env.ORBIT_API_URL;
    const [healthRes, infoRes] = await Promise.all([
      fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${apiUrl}/orbit/v1/info`, { signal: AbortSignal.timeout(5000) }),
    ]);

    const health = await healthRes.json();
    const info = await infoRes.json();

    res.json({
      connected: true,
      server: apiUrl,
      health,
      info: info.data || info,
    });
  } catch (err) {
    res.status(502).json({ error: `Cannot reach ORBIT server: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/register
// ---------------------------------------------------------------------------

app.post('/api/register', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const metadata = {
      title: req.body.title,
      artist: req.body.artist,
    };
    if (req.body.isrc) metadata.isrc = req.body.isrc;
    if (req.body.genre) metadata.primary_genre = req.body.genre;

    if (!metadata.title || !metadata.artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }

    const ownerId = client.platformId;
    const result = await client.register(req.file.buffer, metadata, ownerId);

    const data = result.data || result;

    const response = {
      success: true,
      registration_id: data.registration_id,
      fingerprint_hash: data.fingerprint_hash,
      watermark_hash: data.watermark_hash,
      registered_at: data.registered_at,
      metadata: data.metadata,
      processing_time_ms: data.processing_time_ms,
      ai_detection: data.ai_detection || null,
      catalog_check: data.catalog_check || null,
    };

    if (data.watermarked_audio) {
      response.has_watermarked_audio = true;
      response.watermarked_audio_b64 = data.watermarked_audio;
    }

    res.json(response);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// POST /api/verify
// ---------------------------------------------------------------------------

app.post('/api/verify', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const result = await client.verify(req.file.buffer);
    const data = result.data || result;

    res.json({
      verified: !!data.verified,
      fingerprint_hash: data.fingerprint_hash,
      fingerprint_match: data.fingerprint_match || null,
      watermark: data.watermark || null,
      metadata: data.metadata || null,
      origin: data.origin || null,
      transfers: data.transfers || [],
      duplicate_of: data.duplicate_of || null,
      ai_detection: data.ai_detection || null,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analyze
// ---------------------------------------------------------------------------

app.post('/api/analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const result = await client.analyze(req.file.buffer);
    const data = result.data || result;

    res.json({
      analysis: data.analysis || data,
      ai_detection: data.ai_detection || null,
      processing_time_ms: data.processing_time_ms,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║   ORBIT Demo Server                       ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  ORBIT:   ${process.env.ORBIT_API_URL}`);
  console.log('');
});
