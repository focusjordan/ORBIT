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
  'Never Going Back Again (2004 Remaster).mp3': { title: 'Never Going Back Again', artist: 'Fleetwood Mac', genre: 'Rock' },
  '50 Cent - 21 Questions (Old School Vibe) [Full Version] AI cover.mp3': { title: '21 Questions (AI Jazz Cover)', artist: '50 Cent (AI Cover)', genre: 'Jazz' },
};

// ---------------------------------------------------------------------------
// DDEX Parser (imported directly -- pure transform, no heavy deps)
// ---------------------------------------------------------------------------

const ddexParser = require('../src/engines/ddex-ingest');
const DDEX_FILE = path.resolve(__dirname, 'demo-release.xml');

// ---------------------------------------------------------------------------
// SDK Clients
// ---------------------------------------------------------------------------

function buildClient(platformId, privateKeyB64, label, apiKeyOverride) {
  const apiUrl = process.env.ORBIT_API_URL;
  const apiKey = apiKeyOverride || process.env.ORBIT_API_KEY || undefined;

  if (!apiUrl) throw new Error('ORBIT_API_URL is required');
  if (!platformId) throw new Error(`${label}: platform ID is required`);
  if (!privateKeyB64) throw new Error(`${label}: private key is required`);

  const opts = { apiUrl, platformId, privateKey: Buffer.from(privateKeyB64, 'base64') };
  if (apiKey) opts.apiKey = apiKey;
  return new OrbitClient(opts);
}

// Platform A (primary)
let client;
try {
  client = buildClient(
    process.env.ORBIT_PLATFORM_ID,
    process.env.ORBIT_PRIVATE_KEY,
    'Platform A'
  );
  console.log(`  Platform A initialized: ${process.env.ORBIT_PLATFORM_ID}`);
} catch (err) {
  console.error(`\n  Failed to initialize Platform A: ${err.message}`);
  console.error('  Set ORBIT_API_URL, ORBIT_PLATFORM_ID, and ORBIT_PRIVATE_KEY\n');
  process.exit(1);
}

// Platform B (for transfer demo)
let clientB = null;
const testPlatformId = process.env.TEST_PLATFORM_ID;
const testPlatformKey = process.env.TEST_PLATFORM_PRIVATE_KEY;

if (testPlatformId && testPlatformKey) {
  try {
    clientB = buildClient(testPlatformId, testPlatformKey, 'Platform B', process.env.TEST_PLATFORM_API_KEY);
    console.log(`  Platform B initialized: ${testPlatformId}`);
  } catch (err) {
    console.warn(`  Platform B unavailable: ${err.message}`);
  }
} else {
  console.warn('  Platform B not configured (set TEST_PLATFORM_ID + TEST_PLATFORM_PRIVATE_KEY for transfer demo)');
}

// ---------------------------------------------------------------------------
// Express Setup
// ---------------------------------------------------------------------------

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ---------------------------------------------------------------------------
// GET /api/demo-tracks
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
// GET /api/demo-tracks/:filename
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
  const ext = path.extname(resolved).toLowerCase();
  const mimeTypes = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac' };
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
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
      platformA: process.env.ORBIT_PLATFORM_ID,
      platformB: testPlatformId || null,
      platformBAvailable: !!clientB,
    });
  } catch (err) {
    console.error('  Status check failed:', err.message);
    res.status(502).json({ error: `Cannot reach ORBIT server: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analyze  (with AI detection support)
// ---------------------------------------------------------------------------

app.post('/api/analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const apiUrl = process.env.ORBIT_API_URL;
    const audio64 = req.file.buffer.toString('base64');

    // Send JSON directly to ORBIT API (bypasses SDK's CBOR encoding which
    // breaks on large files). The analyze endpoint uses optionalAuth so no
    // signature is required.
    const trackMeta = {};
    if (req.body.title) trackMeta.title = req.body.title;
    if (req.body.artist) trackMeta.artist = req.body.artist;
    if (req.body.filename) trackMeta.filename = req.body.filename;

    const orbitRes = await fetch(`${apiUrl}/orbit/v2/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: audio64,
        include: ['genre', 'mood', 'bpm', 'key', 'instruments', 'vocals', 'fingerprint', 'ai_detection', 'catalog_check'],
        metadata: trackMeta,
      }),
    });

    const data = await orbitRes.json();

    if (!orbitRes.ok) {
      console.error('  [analyze] ORBIT API error:', orbitRes.status, JSON.stringify(data).slice(0, 300));
      return res.status(orbitRes.status).json({ error: data.error?.message || data.message || 'Analysis failed' });
    }

    const d = data.data || data;
    res.json({
      analysis: d.analysis || d,
      ai_detection: d.ai_detection || null,
      catalog_check: d.catalog_check || null,
      fingerprint: d.fingerprint || null,
      processing_time_ms: d.processing_time_ms,
      processing_log: d.processing_log || [],
    });
  } catch (err) {
    console.error('  [analyze] Error:', err.message);
    res.status(500).json({ error: err.message });
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
      watermark_method: data.watermark_method,
      watermark_sdr: data.watermark_sdr || null,
      entry_hash: data.entry_hash,
      registered_at: data.registered_at,
      metadata: data.metadata,
      processing_time_ms: data.processing_time_ms,
      ai_detection: data.ai_detection || null,
      catalog_check: data.catalog_check || null,
      processing_log: data.processing_log || [],
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
      processing_log: data.processing_log || [],
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ddex-document  — raw XML for display
// ---------------------------------------------------------------------------

app.get('/api/ddex-document', (_req, res) => {
  try {
    const xml = fs.readFileSync(DDEX_FILE, 'utf-8');
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: `Failed to read DDEX file: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/parse-ddex  — parse and return structured metadata
// ---------------------------------------------------------------------------

app.post('/api/parse-ddex', async (_req, res) => {
  try {
    const result = ddexParser.parseFile(DDEX_FILE);

    // Reshape tracks for the demo UI (flatten metadata + audio_filename)
    const tracks = (result.tracks || []).map(t => ({
      ...t.metadata,
      filename: t.audio_filename,
      track_number: t.track_number,
    }));

    // Reshape release metadata
    const rm = result.release_metadata || {};
    const release = {
      title: rm.album_title,
      type: rm.release_type,
      label: rm.label,
      upc: rm.upc,
      release_date: rm.release_date,
      original_release_date: rm.original_release_date,
      parental_advisory: rm.parental_advisory,
      artist: tracks.length > 0 ? tracks[0].artist : null,
      deal: rm.deal || null,
    };

    res.json({
      success: true,
      version: result.ern_version,
      tracks,
      release,
      territories: rm.territories || [],
    });
  } catch (err) {
    res.status(500).json({ error: `DDEX parse failed: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// POST /api/transfer  — initiate transfer from Platform A to Platform B
// ---------------------------------------------------------------------------

app.post('/api/transfer', express.json(), async (req, res) => {
  try {
    if (!clientB) {
      return res.status(400).json({ error: 'Platform B not configured. Set TEST_PLATFORM_ID and TEST_PLATFORM_PRIVATE_KEY.' });
    }

    const { registration_id } = req.body;
    if (!registration_id) {
      return res.status(400).json({ error: 'registration_id is required' });
    }

    const result = await client.transfer(Number(registration_id), testPlatformId);
    const data = result.data || result;

    res.json({
      success: true,
      transfer_id: data.transfer_id,
      status: data.status,
      from_platform: process.env.ORBIT_PLATFORM_ID,
      to_platform: testPlatformId,
      initiated_at: data.initiated_at,
      expires_at: data.expires_at,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// POST /api/accept-transfer  — accept transfer as Platform B
// ---------------------------------------------------------------------------

app.post('/api/accept-transfer', express.json(), async (req, res) => {
  try {
    if (!clientB) {
      return res.status(400).json({ error: 'Platform B not configured.' });
    }

    const { transfer_id } = req.body;
    if (!transfer_id) {
      return res.status(400).json({ error: 'transfer_id is required' });
    }

    const result = await clientB.acceptTransfer(Number(transfer_id));
    const data = result.data || result;

    res.json({
      success: true,
      accepted: data.accepted,
      transfer_id: data.transfer_id,
      new_registration_id: data.new_registration_id,
      metadata: data.metadata,
      full_chain: data.full_chain,
      entry_hash: data.entry_hash,
      registered_at: data.registered_at,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chain/:fingerprint_hash  — provenance chain lookup
// ---------------------------------------------------------------------------

app.get('/api/chain/:fingerprint_hash', async (req, res) => {
  try {
    const result = await client.getChain(req.params.fingerprint_hash);
    const data = result.data || result;
    res.json(data);
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
  console.log(`  Local:      http://localhost:${PORT}`);
  console.log(`  ORBIT API:  ${process.env.ORBIT_API_URL}`);
  console.log(`  Platform A: ${process.env.ORBIT_PLATFORM_ID}`);
  console.log(`  Platform B: ${testPlatformId || '(not configured)'}`);
  console.log('');
});
