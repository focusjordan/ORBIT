/**
 * ORBIT Catalog Check Engine
 *
 * Prevents fraudulent registration of well-known tracks by cross-referencing
 * incoming audio against multiple catalogs:
 *   - AcoustID (~30M fingerprints, open/free)
 *   - ACRCloud (~100M+ tracks, commercial catalog via paid API)
 *   - MusicBrainz metadata (recording details for corroboration)
 *
 * Pipeline:
 *   1. Parallel fingerprint lookup (AcoustID + ACRCloud)
 *   2. MusicBrainz metadata fetch  (recording details for AcoustID match)
 *   3. Metadata corroboration      (merge all sources, compare vs submitted)
 *
 * Fail-open: if any service is unreachable or unconfigured, the check
 * returns partial results and registration proceeds normally.
 *
 * @see src/engines/fingerprint.js   – generates the Chromaprint used here
 * @see src/api/handlers/register.js – integration point (step 6a)
 */

const crypto = require('crypto');
const FormData = require('form-data');
const config = require('../config');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CORROBORATION_THRESHOLD = 0.6;

// ============================================================================
// ACOUSTID LOOKUP
// ============================================================================

/**
 * Query AcoustID for a Chromaprint fingerprint.
 *
 * @param {string} fingerprintRaw - Raw Chromaprint string from fpcalc
 * @param {number} duration       - Audio duration in seconds
 * @returns {Promise<{matched: boolean, score?: number, recording_id?: string, recordings?: Array}>}
 */
async function lookupAcoustID(fingerprintRaw, duration) {
  const apiKey = config.acoustid?.apiKey;
  if (!apiKey) {
    return { matched: false, error: 'ACOUSTID_API_KEY not configured' };
  }

  const baseUrl = config.acoustid?.baseUrl || 'https://api.acoustid.org/v2';
  const minScore = config.acoustid?.minScore ?? 0.7;

  const params = new URLSearchParams({
    client: apiKey,
    fingerprint: fingerprintRaw,
    duration: String(Math.round(duration)),
    meta: 'recordings releasegroups releases',
  });

  const url = `${baseUrl}/lookup?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`AcoustID returned HTTP ${res.status}`);
  }

  const body = await res.json();

  if (body.status !== 'ok' || !body.results || body.results.length === 0) {
    return { matched: false };
  }

  const top = body.results[0];
  if (top.score < minScore) {
    return { matched: false, score: top.score };
  }

  const recordings = top.recordings || [];
  const bestRecording = recordings[0];

  return {
    matched: true,
    score: top.score,
    recording_id: bestRecording?.id || null,
    recordings,
  };
}

// ============================================================================
// ACRCLOUD LOOKUP
// ============================================================================

/**
 * Build HMAC-SHA1 signature for ACRCloud API authentication.
 *
 * @param {string} accessKey    - Project access key
 * @param {string} accessSecret - Project access secret
 * @param {number} timestamp    - Unix timestamp in seconds
 * @returns {string} Base64-encoded HMAC-SHA1 signature
 */
function buildACRCloudSignature(accessKey, accessSecret, timestamp) {
  const stringToSign = [
    'POST',
    '/v1/identify',
    accessKey,
    'audio',
    '1',
    String(timestamp),
  ].join('\n');

  return crypto
    .createHmac('sha1', accessSecret)
    .update(Buffer.from(stringToSign, 'utf-8'))
    .digest('base64');
}

/**
 * Query ACRCloud for an audio fingerprint match.
 *
 * Sends raw audio bytes to ACRCloud's identification API, which matches
 * against their commercial catalog (~100M+ tracks across major and indie
 * distributors).
 *
 * @param {Buffer} audioBuffer - Raw audio file bytes (mp3, wav, etc.)
 * @returns {Promise<{matched: boolean, score?: number, title?: string, artist?: string, album?: string, isrc?: string, label?: string, release_date?: string, acrid?: string}>}
 */
async function lookupACRCloud(audioBuffer) {
  const accessKey = config.acrcloud?.accessKey;
  const accessSecret = config.acrcloud?.accessSecret;
  const host = config.acrcloud?.host;

  if (!accessKey || !accessSecret) {
    return { matched: false, error: 'ACRCLOUD credentials not configured' };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildACRCloudSignature(accessKey, accessSecret, timestamp);

  const form = new FormData();
  form.append('access_key', accessKey);
  form.append('data_type', 'audio');
  form.append('signature', signature);
  form.append('signature_version', '1');
  form.append('timestamp', String(timestamp));
  form.append('sample_bytes', String(audioBuffer.length));
  form.append('sample', audioBuffer, {
    filename: 'sample.wav',
    contentType: 'audio/wav',
  });

  const url = `https://${host}/v1/identify`;

  const res = await fetch(url, {
    method: 'POST',
    headers: form.getHeaders(),
    body: form.getBuffer(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`ACRCloud returned HTTP ${res.status}`);
  }

  const body = await res.json();

  if (body.status?.code !== 0 || !body.metadata?.music?.length) {
    return { matched: false, status_code: body.status?.code, status_msg: body.status?.msg };
  }

  const top = body.metadata.music[0];

  return {
    matched: true,
    score: top.score / 100,
    acrid: top.acrid || null,
    title: top.title || null,
    artist: top.artists?.map(a => a.name).join(', ') || null,
    album: top.album?.name || null,
    isrc: top.external_ids?.isrc || null,
    upc: top.external_ids?.upc || null,
    label: top.label || null,
    release_date: top.release_date || null,
    genres: top.genres?.map(g => g.name) || [],
    duration_ms: top.duration_in_ms || null,
  };
}

// ============================================================================
// MUSICBRAINZ METADATA FETCH
// ============================================================================

/**
 * Fetch recording metadata from MusicBrainz.
 *
 * @param {string} recordingId - MusicBrainz recording UUID
 * @returns {Promise<{title: string, artist: string, isrc: string|null, release: string|null, label: string|null}>}
 */
async function fetchMusicBrainz(recordingId) {
  const baseUrl = config.musicbrainz?.baseUrl || 'https://musicbrainz.org/ws/2';
  const userAgent = config.musicbrainz?.userAgent || 'ORBIT/1.0.0 (orbit-protocol)';

  const url = `${baseUrl}/recording/${recordingId}?inc=artists+releases+isrcs+release-groups&fmt=json`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`MusicBrainz returned HTTP ${res.status}`);
  }

  const data = await res.json();

  const artist = data['artist-credit']
    ?.map(ac => ac.artist?.name || ac.name)
    .join(', ') || null;

  const firstRelease = data.releases?.[0];
  const label = firstRelease?.['label-info']?.[0]?.label?.name || null;

  const isrcs = data.isrcs || [];

  return {
    title: data.title || null,
    artist,
    isrc: isrcs[0] || null,
    release: firstRelease?.title || null,
    label,
  };
}

// ============================================================================
// METADATA CORROBORATION
// ============================================================================

/**
 * Normalize a string for fuzzy comparison: lowercase, strip punctuation,
 * collapse whitespace.
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check whether two strings are a fuzzy match after normalization.
 * Uses inclusion and word-overlap as secondary signals so:
 *   "Whitney Houston" matches "Whitney Elizabeth Houston"
 *   "Jay-Z" matches "Jay Z"
 */
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  // Word-overlap: if all words from the shorter string appear in the longer one
  const wordsA = na.split(' ').filter(Boolean);
  const wordsB = nb.split(' ').filter(Boolean);
  const [shorter, longer] = wordsA.length <= wordsB.length
    ? [wordsA, wordsB] : [wordsB, wordsA];

  if (shorter.length > 0 && shorter.every(w => longer.includes(w))) return true;

  return false;
}

/**
 * Compare submitted metadata against MusicBrainz known metadata and produce
 * a corroboration score (0-1) plus per-field match booleans.
 *
 * Weights: ISRC exact match is the strongest signal because it means the
 * registrant has access to real distribution metadata.
 *
 * @param {Object} submitted  - { title, artist, isrc, label }
 * @param {Object} known      - MusicBrainz metadata from fetchMusicBrainz()
 * @returns {{score: number, isrc_match: boolean, title_match: boolean, artist_match: boolean, label_match: boolean}}
 */
function corroborateMetadata(submitted, known) {
  const fields = {
    isrc_match: !!(submitted.isrc && known.isrc &&
      submitted.isrc.replace(/[-\s]/g, '').toUpperCase() ===
      known.isrc.replace(/[-\s]/g, '').toUpperCase()),
    title_match: fuzzyMatch(submitted.title, known.title),
    artist_match: fuzzyMatch(submitted.artist, known.artist),
    label_match: fuzzyMatch(submitted.label, known.label),
  };

  // Weighted scoring — ISRC is strongest because it proves distribution access
  const weights = { isrc_match: 0.40, title_match: 0.20, artist_match: 0.20, label_match: 0.20 };
  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (fields[key]) score += weight;
  }

  return { score: parseFloat(score.toFixed(2)), ...fields };
}

// ============================================================================
// MAIN CHECK FUNCTION
// ============================================================================

/**
 * Merge known metadata from MusicBrainz and ACRCloud into a single object
 * for corroboration. ACRCloud is preferred when both sources provide a field,
 * because its commercial catalog is more complete.
 */
function mergeKnownMetadata(mbData, acrResult) {
  if (!mbData && !acrResult?.matched) return null;

  const mb = mbData || {};
  const acr = (acrResult?.matched && acrResult) || {};

  return {
    title:   acr.title   || mb.title   || null,
    artist:  acr.artist  || mb.artist  || null,
    isrc:    acr.isrc    || mb.isrc    || null,
    label:   acr.label   || mb.label   || null,
    album:   acr.album   || mb.release || null,
    release_date: acr.release_date || null,
  };
}

/**
 * Run the full catalog check pipeline.
 *
 * Step 1: Fire AcoustID and ACRCloud lookups in parallel
 * Step 2: If AcoustID matched, fetch MusicBrainz metadata
 * Step 3: Merge all sources and corroborate against submitted metadata
 *
 * @param {Object} params
 * @param {string}  params.fingerprintRaw - Raw Chromaprint string
 * @param {number}  params.duration       - Duration in seconds
 * @param {Object}  params.metadata       - Submitted metadata { title, artist, isrc, label }
 * @param {Buffer} [params.audioBuffer]   - Raw audio bytes (required for ACRCloud)
 * @returns {Promise<Object>} Catalog check result
 */
async function check({ fingerprintRaw, duration, metadata, audioBuffer }) {
  const startTime = Date.now();

  // Step 1: Parallel lookups — AcoustID (fingerprint) + ACRCloud (audio)
  const acoustidPromise = lookupAcoustID(fingerprintRaw, duration)
    .catch(err => {
      console.log(`[CatalogCheck] AcoustID lookup failed: ${err.message}`);
      return { matched: false, error: err.message };
    });

  const acrPromise = audioBuffer
    ? lookupACRCloud(audioBuffer).catch(err => {
        console.log(`[CatalogCheck] ACRCloud lookup failed: ${err.message}`);
        return { matched: false, error: err.message };
      })
    : Promise.resolve({ matched: false, error: 'No audio buffer provided' });

  const [acoustidResult, acrResult] = await Promise.all([acoustidPromise, acrPromise]);

  const anyMatch = acoustidResult.matched || acrResult.matched;

  if (!anyMatch) {
    return {
      status: 'no_match',
      acoustid: { matched: false, score: acoustidResult.score || null },
      acrcloud: { matched: false },
      musicbrainz: null,
      corroboration: null,
      processing_time_ms: Date.now() - startTime,
    };
  }

  // Step 2: MusicBrainz metadata fetch (only if AcoustID matched)
  let mbData = null;
  if (acoustidResult.matched && acoustidResult.recording_id) {
    try {
      mbData = await fetchMusicBrainz(acoustidResult.recording_id);
    } catch (err) {
      console.log(`[CatalogCheck] MusicBrainz fetch failed: ${err.message}`);
    }
  }

  // Step 3: Merge known metadata from all sources and corroborate
  const knownMetadata = mergeKnownMetadata(mbData, acrResult);

  let corroboration = null;
  let status = 'known_work_unverified';

  if (knownMetadata) {
    corroboration = corroborateMetadata(metadata, knownMetadata);

    // ACRCloud high-confidence matches (score >= 0.7) boost the result —
    // their commercial catalog is authoritative for distributed music.
    if (acrResult.matched && acrResult.score >= 0.7) {
      corroboration.acrcloud_boost = true;
      corroboration.score = Math.min(1, corroboration.score + 0.15);
    }

    status = corroboration.score >= CORROBORATION_THRESHOLD
      ? 'verified_known_work'
      : 'known_work_unverified';
  }

  return {
    status,
    acoustid: {
      matched: acoustidResult.matched,
      score: acoustidResult.score || null,
      recording_id: acoustidResult.recording_id || null,
    },
    acrcloud: {
      matched: acrResult.matched,
      score: acrResult.score || null,
      acrid: acrResult.acrid || null,
      title: acrResult.title || null,
      artist: acrResult.artist || null,
      album: acrResult.album || null,
      isrc: acrResult.isrc || null,
      label: acrResult.label || null,
    },
    musicbrainz: mbData,
    corroboration,
    processing_time_ms: Date.now() - startTime,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  check,
  lookupAcoustID,
  lookupACRCloud,
  buildACRCloudSignature,
  fetchMusicBrainz,
  mergeKnownMetadata,
  corroborateMetadata,
  normalize,
  fuzzyMatch,
  CORROBORATION_THRESHOLD,
};
