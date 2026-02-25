'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const multer = require('multer');
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

const fs = require('fs');
const PORT = process.env.DEMO_PORT || 3000;

// ---------------------------------------------------------------------------
// Demo Track Library
// ---------------------------------------------------------------------------

const DEMO_AUDIO_DIR = path.resolve(__dirname, '..', 'audio-under-230');

const TRACK_META = {
  'Symphony.wav':                          { title: 'Symphony',              artist: 'Jordan Kugler', genre: 'Orchestral' },
  'lil bounce.wav':                        { title: 'Lil Bounce',            artist: 'Jordan Kugler', genre: 'Hip-Hop' },
  '9-29-23-It\'s A Dirty Job.wav':         { title: "It's A Dirty Job",      artist: 'Jordan Kugler', genre: 'Hip-Hop' },
  '7-4-21-One Two One Two.wav':            { title: 'One Two One Two',       artist: 'Jordan Kugler', genre: 'Hip-Hop' },
  '7-1-2023-I Can\'t Believe It Snippet.wav': { title: "I Can't Believe It", artist: 'Jordan Kugler', genre: 'R&B' },
  '7-2-19-She A Bop.wav':                  { title: 'She A Bop',             artist: 'Jordan Kugler', genre: 'Pop' },
  '11-4-19-The Birds Instrumental.wav':    { title: 'The Birds',             artist: 'Jordan Kugler', genre: 'Instrumental' },
};

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
// GET /api/demo-tracks — list available demo audio files
// ---------------------------------------------------------------------------

app.get('/api/demo-tracks', (_req, res) => {
  try {
    if (!fs.existsSync(DEMO_AUDIO_DIR)) {
      return res.json({ tracks: [] });
    }
    const files = fs.readdirSync(DEMO_AUDIO_DIR)
      .filter(f => /\.(wav|mp3|flac)$/i.test(f))
      .sort();

    const tracks = files.map(filename => {
      const meta = TRACK_META[filename] || {};
      const stat = fs.statSync(path.join(DEMO_AUDIO_DIR, filename));
      return {
        filename,
        title: meta.title || filename.replace(/\.\w+$/, ''),
        artist: meta.artist || '',
        genre: meta.genre || '',
        size_mb: (stat.size / (1024 * 1024)).toFixed(1),
      };
    });

    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/demo-tracks/:filename — serve a demo audio file
// ---------------------------------------------------------------------------

app.get('/api/demo-tracks/:filename', (req, res) => {
  const filePath = path.join(DEMO_AUDIO_DIR, req.params.filename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(DEMO_AUDIO_DIR) + path.sep)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  fs.createReadStream(resolved).pipe(res);
});

// ---------------------------------------------------------------------------
// GET /api/status
// ---------------------------------------------------------------------------

app.get('/api/status', async (_req, res) => {
  const apiUrl = process.env.ORBIT_API_URL;
  try {
    const healthRes = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(10000) });
    const health = await healthRes.json();

    let info = null;
    try {
      const infoRes = await fetch(`${apiUrl}/orbit/v1/info`, { signal: AbortSignal.timeout(10000) });
      info = await infoRes.json();
    } catch (_) { /* info endpoint is optional */ }

    res.json({
      connected: true,
      server: apiUrl,
      health,
      info: info ? (info.data || info) : null,
    });
  } catch (err) {
    console.error('  Status check failed:', err.message);
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
