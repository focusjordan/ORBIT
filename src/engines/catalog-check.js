/**
 * ORBIT Catalog Check Engine
 *
 * Prevents fraudulent registration of well-known tracks by cross-referencing
 * incoming audio against AcoustID (~30M fingerprints) and MusicBrainz metadata.
 *
 * Three-step pipeline:
 *   1. AcoustID fingerprint lookup  (raw Chromaprint + duration)
 *   2. MusicBrainz metadata fetch   (recording details for top match)
 *   3. Metadata corroboration        (compare submitted vs known metadata)
 *
 * Fail-open: if AcoustID is unreachable or ACOUSTID_API_KEY is missing the
 * check returns { status: 'unavailable' } and registration proceeds normally.
 *
 * @see src/engines/fingerprint.js   – generates the Chromaprint used here
 * @see src/api/handlers/register.js – integration point (step 6a)
 */

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
 * Run the full catalog check pipeline.
 *
 * @param {Object} params
 * @param {string} params.fingerprintRaw - Raw Chromaprint string
 * @param {number} params.duration       - Duration in seconds
 * @param {Object} params.metadata       - Submitted metadata { title, artist, isrc, label }
 * @returns {Promise<Object>} Catalog check result
 */
async function check({ fingerprintRaw, duration, metadata }) {
  const startTime = Date.now();

  // Step 1: AcoustID lookup
  let acoustidResult;
  try {
    acoustidResult = await lookupAcoustID(fingerprintRaw, duration);
  } catch (err) {
    console.log(`[CatalogCheck] AcoustID lookup failed: ${err.message}`);
    return {
      status: 'unavailable',
      error: `AcoustID lookup failed: ${err.message}`,
      processing_time_ms: Date.now() - startTime,
    };
  }

  if (!acoustidResult.matched) {
    return {
      status: 'no_match',
      acoustid: { matched: false, score: acoustidResult.score || null },
      musicbrainz: null,
      corroboration: null,
      processing_time_ms: Date.now() - startTime,
    };
  }

  // Step 2: MusicBrainz metadata fetch (only for top match)
  let mbData = null;
  if (acoustidResult.recording_id) {
    try {
      mbData = await fetchMusicBrainz(acoustidResult.recording_id);
    } catch (err) {
      console.log(`[CatalogCheck] MusicBrainz fetch failed: ${err.message}`);
      // Continue without MusicBrainz data — AcoustID match alone is informative
    }
  }

  // Step 3: Corroboration (only if we have MusicBrainz data)
  let corroboration = null;
  let status = 'known_work_unverified';

  if (mbData) {
    corroboration = corroborateMetadata(metadata, mbData);
    status = corroboration.score >= CORROBORATION_THRESHOLD
      ? 'verified_known_work'
      : 'known_work_unverified';
  }

  return {
    status,
    acoustid: {
      matched: true,
      score: acoustidResult.score,
      recording_id: acoustidResult.recording_id,
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
  fetchMusicBrainz,
  corroborateMetadata,
  normalize,
  fuzzyMatch,
  CORROBORATION_THRESHOLD,
};
