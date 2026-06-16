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

const DEMO_AUDIO_DIR_CANDIDATES = [
  path.resolve(__dirname, '..', 'audio-under-230'),
  path.resolve(__dirname, '..', 'Audio-under-230'),
];
const DEMO_AUDIO_DIR = DEMO_AUDIO_DIR_CANDIDATES.find(p => fs.existsSync(p)) || DEMO_AUDIO_DIR_CANDIDATES[0];

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
  'Boots And Stuff.mp3':                   { title: 'Boots And Stuff',       artist: 'Suno', genre: 'AI' },
  'Guaracha Diss-Track.mp3':               { title: 'Guaracha Diss-Track',   artist: 'Suno', genre: 'AI' },
  'Happy Folk Anthem.mp3':                 { title: 'Happy Folk Anthem',     artist: 'Suno', genre: 'AI' },
  'Hard On The Beat.mp3':                  { title: 'Hard On The Beat',      artist: 'Suno', genre: 'AI' },
  'Hingey Door Horses.mp3':                { title: 'Hingey Door Horses',    artist: 'Suno', genre: 'AI' },
  'Moshpit Bleach Mist.mp3':               { title: 'Moshpit Bleach Mist',   artist: 'Suno', genre: 'AI' },
  'My Piano.mp3':                          { title: 'My Piano',              artist: 'Suno', genre: 'AI' },
  'Mythic Jingle-Jangle.mp3':              { title: 'Mythic Jingle-Jangle',  artist: 'Suno', genre: 'AI' },
  'Pants On Beat.mp3':                     { title: 'Pants On Beat',         artist: 'Suno', genre: 'AI' },
  'Party Antehm.mp3':                      { title: 'Party Antehm',          artist: 'Suno', genre: 'AI' },
  'Plastic Crowns.mp3':                    { title: 'Plastic Crowns',        artist: 'Suno', genre: 'AI' },
  'Ripped-Up Cheeseburger.mp3':            { title: 'Ripped-Up Cheeseburger', artist: 'Suno', genre: 'AI' },
};

// ---------------------------------------------------------------------------
// Result Cache — real pipeline results saved to disk on first analysis,
// served instantly on subsequent requests.  Delete demo/cache/ to recompute.
// ---------------------------------------------------------------------------

const CACHE_DIR = path.resolve(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function cacheKey(filename) {
  return path.join(CACHE_DIR, filename.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json');
}

function getCachedResult(filename) {
  const p = cacheKey(filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) { return null; }
}

function saveCachedResult(filename, result) {
  try {
    fs.writeFileSync(cacheKey(filename), JSON.stringify(result, null, 2));
  } catch (err) {
    console.warn('  [cache] Failed to save:', err.message);
  }
}

// ---------------------------------------------------------------------------

function resolvePrecomputedStemsDir(filename) {
  if (!filename) return null;
  const safeName = path.basename(filename);
  const stemsRoot = path.join(DEMO_AUDIO_DIR, 'stems');
  const stemDir = path.join(stemsRoot, path.parse(safeName).name);
  if (fs.existsSync(stemDir)) {
    return stemDir;
  }
  return null;
}

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

function getClientForRequest(req) {
  const platformOverride = req.get('x-orbit-platform-override');
  const privateKeyOverride = req.get('x-orbit-private-key-override');
  const apiKeyOverride = req.get('x-orbit-api-key-override');
  if (platformOverride && privateKeyOverride) {
    try {
      return buildClient(platformOverride, privateKeyOverride, 'Override Platform', apiKeyOverride || null);
    } catch (err) {
      console.warn(`[Proxy] Failed to build override client: ${err.message}`);
    }
  }
  return client;
}

// ---------------------------------------------------------------------------
// Express Setup
// ---------------------------------------------------------------------------

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard', express.static(path.join(__dirname, '../dashboard')));
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
let lastKnownStatus = null;
let lastStatusErrorLogged = false;

app.get('/api/status', async (req, res) => {
  const apiUrl = process.env.ORBIT_API_URL;
  try {
    const healthRes = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(10000) });
    const health = await healthRes.json();

    let info = null;
    try {
      const infoRes = await fetch(`${apiUrl}/orbit/v1/info`, { signal: AbortSignal.timeout(10000) });
      info = await infoRes.json();
    } catch (_) { /* info endpoint is optional */ }

    const activeClient = getClientForRequest(req);
    lastKnownStatus = {
      connected: true,
      server: apiUrl,
      health,
      info: info ? (info.data || info) : null,
      platformA: activeClient.platformId,
      platformB: testPlatformId || null,
      platformBAvailable: !!clientB,
    };
    lastStatusErrorLogged = false; // Reset error log flag on success
    res.json(lastKnownStatus);
  } catch (err) {
    if (!lastStatusErrorLogged) {
      console.warn('  [status] ORBIT server unreachable. Serving offline mode:', err.message);
      lastStatusErrorLogged = true;
    }
    const activeClient = getClientForRequest(req);
    res.json({
      connected: false,
      server: apiUrl,
      health: lastKnownStatus?.health || { status: 'offline' },
      info: lastKnownStatus?.info || null,
      platformA: activeClient.platformId,
      platformB: testPlatformId || null,
      platformBAvailable: !!clientB,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/catalog
// ---------------------------------------------------------------------------
app.get('/api/catalog', async (req, res) => {
  try {
    const activeClient = getClientForRequest(req);
    const result = await activeClient.listRegistrations({ limit: 100 });
    res.json(result);
  } catch (err) {
    // Log once or warnings, return empty catalog gracefully
    res.json({ platform: req.get('x-orbit-platform-override') || 'sandbox', total: 0, registrations: [] });
  }
});


// ---------------------------------------------------------------------------
// POST /api/analyze  (with AI detection support)
// ---------------------------------------------------------------------------

app.post('/api/analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const apiUrl = process.env.ORBIT_API_URL;

    const trackMeta = {};
    if (req.body.title) trackMeta.title = req.body.title;
    if (req.body.artist) trackMeta.artist = req.body.artist;
    if (req.body.filename) trackMeta.filename = req.body.filename;
    const safeFilename = req.body.filename ? path.basename(req.body.filename) : null;
    const isKnownDemoTrack = !!(
      safeFilename
      && (TRACK_META[safeFilename] || fs.existsSync(path.join(DEMO_AUDIO_DIR, safeFilename)))
    );
    const forceLive = req.query.live === 'true';

    if (isKnownDemoTrack && !forceLive) {
      const cached = getCachedResult(safeFilename);
      if (cached) {
        console.log(`  [analyze] Serving cached result for ${safeFilename}`);
        return res.json(cached);
      }
    }

    const audio64 = req.file.buffer.toString('base64');
    const stemsDir = isKnownDemoTrack ? resolvePrecomputedStemsDir(safeFilename) : null;

    const activeClient = getClientForRequest(req);
    const headers = { 'Content-Type': 'application/json' };
    headers['X-ORBIT-Platform'] = activeClient.platformId;
    if (activeClient.apiKey) {
      headers['X-ORBIT-API-Key'] = activeClient.apiKey;
    }
    const platformOverride = req.get('x-orbit-platform-override');
    const signatureOverride = req.get('x-orbit-signature-override');
    if (platformOverride && signatureOverride) {
      headers['X-ORBIT-Signature'] = signatureOverride;
    }

    const orbitRes = await fetch(`${apiUrl}/orbit/v2/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audio: audio64,
        include: ['genre', 'mood', 'bpm', 'key', 'instruments', 'vocals', 'fingerprint', 'ai_detection', 'catalog_check'],
        metadata: trackMeta,
        stemsDir: stemsDir || null,
      }),
    });

    const data = await orbitRes.json();

    if (!orbitRes.ok) {
      console.error('  [analyze] ORBIT API error:', orbitRes.status, JSON.stringify(data).slice(0, 300));
      return res.status(orbitRes.status).json({ error: data.error?.message || data.message || 'Analysis failed' });
    }

    const d = data.data || data;
    const det = d.ai_detection;
    if (det?.signals) {
      console.log('  [analyze] AI signals →',
        Object.entries(det.signals).map(([k, v]) =>
          `${k}: ${v == null ? 'NULL' : typeof v === 'object' ? (v.sonicsScore ?? v.aiScore ?? v.anomalyScore ?? v.suspicionScore ?? v.provenanceScore ?? v.watermarkScore ?? v.aiLikelihood ?? 'obj') : v}`
        ).join(', '));
    }
    const result = {
      analysis: d.analysis || d,
      ai_detection: d.ai_detection || null,
      catalog_check: d.catalog_check || null,
      fingerprint: d.fingerprint || null,
      processing_time_ms: d.processing_time_ms,
      processing_log: d.processing_log || [],
    };

    if (isKnownDemoTrack) {
      saveCachedResult(safeFilename, result);
      console.log(`  [analyze] Cached result for ${safeFilename}`);
    }

    res.json(result);
  } catch (err) {
    console.error('  [analyze] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/cache  — clear all cached results (forces live re-analysis)
// ---------------------------------------------------------------------------

app.delete('/api/cache', (_req, res) => {
  try {
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
    files.forEach(f => fs.unlinkSync(path.join(CACHE_DIR, f)));
    console.log(`  [cache] Cleared ${files.length} cached results`);
    res.json({ cleared: files.length });
  } catch (err) {
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
    const skipAi = req.body.skip_ai_detection === 'true';
    if (skipAi) metadata.skip_ai_detection = true;

    if (!metadata.title || !metadata.artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }

    const safeFilename = req.body.filename ? path.basename(req.body.filename) : null;
    const forceLive = req.query.live === 'true';

    if (safeFilename && !forceLive) {
      const cached = getCachedResult('register_' + safeFilename);
      if (cached) {
        console.log(`  [register] Serving cached result for ${safeFilename}`);
        return res.json(cached);
      }
    }

    const activeClient = getClientForRequest(req);
    const ownerId = activeClient.platformId;
    const result = await activeClient.register(req.file.buffer, metadata, ownerId);
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

    if (safeFilename) {
      saveCachedResult('register_' + safeFilename, response);
      console.log(`  [register] Cached result for ${safeFilename}`);
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

    const result = await getClientForRequest(req).verify(req.file.buffer);
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

    const { registration_id, to_platform } = req.body;
    if (!registration_id) {
      return res.status(400).json({ error: 'registration_id is required' });
    }

    const activeClient = getClientForRequest(req);
    const result = await activeClient.transfer(Number(registration_id), to_platform || testPlatformId);
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
    const { transfer_id } = req.body;
    if (!transfer_id) {
      return res.status(400).json({ error: 'transfer_id is required' });
    }

    const activeClient = getClientForRequest(req);
    const result = await activeClient.acceptTransfer(Number(transfer_id));
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
    const result = await getClientForRequest(req).getChain(req.params.fingerprint_hash);
    const data = result.data || result;
    res.json(data);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stems/:trackName/:stemName
// ---------------------------------------------------------------------------
app.get('/api/stems/:trackName/:stemName', (req, res) => {
  const trackName = path.basename(req.params.trackName);
  const stemName = path.basename(req.params.stemName);
  const filePath = path.join(DEMO_AUDIO_DIR, 'stems', trackName, stemName);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Stem not found' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/similar
// ---------------------------------------------------------------------------
app.post('/api/similar', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
    const threshold = req.body.threshold ? Number(req.body.threshold) : 0.5;
    const limit = req.body.limit ? Number(req.body.limit) : 20;
    
    const activeClient = getClientForRequest(req);
    const result = await activeClient.similar(req.file.buffer, { threshold, limit });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, details: err.details || null });
  }
});

// ---------------------------------------------------------------------------
// POST /api/login
// ---------------------------------------------------------------------------
app.post('/api/login', express.json(), async (req, res) => {
  const { platform_id, api_key, private_key } = req.body || {};
  if (!platform_id || !private_key) {
    return res.status(400).json({ error: 'platform_id and private_key are required' });
  }
  
  try {
    const tempClient = buildClient(platform_id, private_key, 'Login Test', api_key || null);
    
    const body = {};
    const cbor = require('cbor');
    const nacl = require('tweetnacl');
    const dataBuffer = cbor.encode(body);
    const signature = nacl.sign.detached(new Uint8Array(dataBuffer), new Uint8Array(tempClient.privateKey));
    
    const headers = {
      'X-ORBIT-Platform': tempClient.platformId,
      'X-ORBIT-Signature': Buffer.from(signature).toString('base64'),
      'Content-Type': 'application/cbor'
    };
    if (tempClient.apiKey) {
      headers['X-ORBIT-API-Key'] = tempClient.apiKey;
    }
    
    const response = await fetch(`${process.env.ORBIT_API_URL}/orbit/v1/auth-test`, {
      method: 'POST',
      headers,
      body: dataBuffer
    });
    
    const responseData = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: responseData.error?.message || responseData.message || 'Authentication failed' });
    }
    
    res.json({
      success: true,
      platform: responseData.platform || { id: platform_id, name: 'Custom Platform' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Platform Administration Proxy Routes
// ---------------------------------------------------------------------------

// POST /api/platforms/register
app.post('/api/platforms/register', express.json(), async (req, res) => {
  try {
    const response = await fetch(`${process.env.ORBIT_API_URL}/orbit/v1/platforms/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to proxy authenticated platform requests
async function proxyAuthPlatformRequest(req, res, pathSuffix) {
  const platformOverride = req.get('x-orbit-platform-override');
  const signatureOverride = req.get('x-orbit-signature-override');
  const apiKeyOverride = req.get('x-orbit-api-key-override');
  
  if (!platformOverride || !signatureOverride) {
    return res.status(401).json({ error: 'Authentication headers required' });
  }
  
  const headers = {
    'X-ORBIT-Platform': platformOverride,
    'X-ORBIT-Signature': signatureOverride,
    'Content-Type': 'application/cbor'
  };
  if (apiKeyOverride) {
    headers['X-ORBIT-API-Key'] = apiKeyOverride;
  }
  
  try {
    const cbor = require('cbor');
    const encodedBody = cbor.encode(req.body || {});
    
    const response = await fetch(`${process.env.ORBIT_API_URL}/orbit/v1/platforms/${pathSuffix}`, {
      method: 'POST',
      headers,
      body: encodedBody
    });
    
    let responseData;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/cbor')) {
      const responseBuffer = await response.arrayBuffer();
      responseData = cbor.decode(Buffer.from(responseBuffer));
    } else {
      responseData = await response.json();
    }
    
    return res.status(response.status).json(responseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/platforms/rotate-api-key
app.post('/api/platforms/rotate-api-key', express.json(), (req, res) => {
  return proxyAuthPlatformRequest(req, res, 'rotate-api-key');
});

// POST /api/platforms/rotate-keypair
app.post('/api/platforms/rotate-keypair', express.json(), (req, res) => {
  return proxyAuthPlatformRequest(req, res, 'rotate-keypair');
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
