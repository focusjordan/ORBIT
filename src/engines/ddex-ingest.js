/**
 * ORBIT DDEX ERN Ingestion Engine
 *
 * Parses DDEX Electronic Release Notification (ERN) XML — both 3.x and 4.x —
 * and maps the contents to ORBIT's registration metadata schema.
 *
 * Supported versions:
 *   - ERN 4.x  (NewReleaseMessage, xmlns containing "ern/4")
 *   - ERN 3.x  (ern:NewReleaseMessage, xmlns containing "ern/3")
 *
 * The parser is pure transformation with no side effects — it takes XML text
 * in and returns an array of ORBIT-ready metadata objects out.
 *
 * @see src/api/handlers/register.js  – registration handler these feed into
 * @see cli/lib/commands/ingest.js    – CLI command that drives bulk import
 */

const { XMLParser } = require('fast-xml-parser');

// ============================================================================
// XML PARSER SETUP
// ============================================================================

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Preserve leading zeros on identifiers (UPC, ISRC, EAN)
  parseTagValue: false,
  isArray: (name) => {
    const alwaysArray = [
      'SoundRecording', 'Release', 'ReleaseDeal', 'Deal',
      'DealTerms', 'RightsController', 'Contributor',
      'DisplayArtist', 'ResourceGroupContentItem', 'TrackRelease',
      'Territory', 'TerritoryCode', 'ISRC', 'Genre',
      'PLine', 'CLine', 'LabelName', 'TechnicalSoundRecordingDetails',
      'File', 'ReleaseId', 'SoundRecordingId',
      'ResourceGroup', 'ResourceGroupContentItem',
    ];
    return alwaysArray.includes(name);
  },
};

// ============================================================================
// ISO 8601 DURATION PARSER
// ============================================================================

/**
 * Convert ISO 8601 duration (PT3M45S, PT1H2M3S, etc.) to milliseconds.
 */
function parseDuration(iso) {
  if (!iso) return null;
  if (typeof iso === 'number') return iso;

  const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseFloat(match[3] || '0');

  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

/**
 * Map DDEX ParentalWarningType to ORBIT's parental_advisory values.
 */
function mapParentalWarning(ddexValue) {
  if (!ddexValue) return null;
  const v = String(ddexValue).toLowerCase();
  if (v.includes('notexplicit') || v.includes('noadvice') || v === 'unknown') return 'none';
  if (v.includes('explicit')) return 'explicit';
  if (v.includes('clean') || v.includes('edited')) return 'clean';
  return null;
}

/**
 * Safely get a value that may be a string or an object with #text.
 */
function textOf(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val['#text'] != null) return String(val['#text']);
  return null;
}

/**
 * Coerce a value to an array.
 */
function toArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

// ============================================================================
// ERN VERSION DETECTION
// ============================================================================

/**
 * Detect DDEX ERN version from parsed XML root.
 * @returns {'4.x'|'3.x'|null}
 */
function detectVersion(root) {
  const msg = root.NewReleaseMessage;
  if (!msg) return null;

  const xmlns = msg['@_xmlns'] || msg['@_xmlns:ern'] || '';

  if (/ern\/4/i.test(xmlns) || /ern\/43/i.test(xmlns)) return '4.x';
  if (/ern\/3/i.test(xmlns) || /ern\/38/i.test(xmlns)) return '3.x';

  // Heuristic: if ResourceList exists, assume 4.x as the more common modern format
  if (msg.ResourceList) return '4.x';

  return null;
}

// ============================================================================
// SOUND RECORDING EXTRACTION
// ============================================================================

/**
 * Extract track metadata from a SoundRecording element.
 */
function extractSoundRecording(sr) {
  const ids = toArray(sr.SoundRecordingId);
  const isrc = ids.reduce((found, id) => found || textOf(id.ISRC?.[0] || id.ISRC), null);

  const title = textOf(sr.ReferenceTitle?.TitleText)
    || textOf(sr.Title?.TitleText)
    || textOf(sr.DisplayTitle);

  // Artist: try DisplayArtistName first (simple string), then structured DisplayArtist
  let artist = textOf(sr.DisplayArtistName);
  if (!artist) {
    const artists = toArray(sr.DisplayArtist);
    artist = artists
      .map(a => textOf(a.PartyName?.FullName) || textOf(a.PartyName))
      .filter(Boolean)
      .join(', ') || null;
  }

  const duration = parseDuration(textOf(sr.Duration));

  // Territory-specific details (genre, language, technical details)
  const details = sr.SoundRecordingDetailsByTerritory || sr;

  const genres = toArray(details.Genre || sr.Genre);
  const primaryGenre = genres.length > 0 ? textOf(genres[0].GenreText || genres[0]) : null;

  const language = textOf(sr.LanguageOfPerformance) || textOf(details.LanguageOfPerformance) || null;

  // Copyright lines
  const pLines = toArray(sr.PLine);
  const pLine = pLines.length > 0 ? textOf(pLines[0].PLineText) : null;
  const cLines = toArray(sr.CLine);
  const cLine = cLines.length > 0 ? textOf(cLines[0].CLineText) : null;

  // Sound recording type (e.g., "MusicalWorkSoundRecording")
  const soundRecordingType = textOf(sr.SoundRecordingType) || null;

  // Track-level parental advisory
  const trackParentalAdvisory = mapParentalWarning(textOf(sr.ParentalWarningType));

  // Audio file reference + technical details
  const techDetails = toArray(details.TechnicalSoundRecordingDetails || sr.TechnicalSoundRecordingDetails);
  let audioFilename = null;
  let audioCodec = null;
  let channels = null;
  let sampleRate = null;
  let bitsPerSample = null;
  if (techDetails.length > 0) {
    const td = techDetails[0];
    const files = toArray(td.File);
    if (files.length > 0) {
      audioFilename = textOf(files[0].FileName) || textOf(files[0].URI) || null;
    }
    audioCodec = textOf(td.AudioCodecType) || null;
    channels = textOf(td.NumberOfChannels) ? parseInt(textOf(td.NumberOfChannels), 10) : null;
    sampleRate = textOf(td.SamplingRate) ? parseInt(textOf(td.SamplingRate), 10) : null;
    bitsPerSample = textOf(td.BitsPerSample) ? parseInt(textOf(td.BitsPerSample), 10) : null;
  }

  // Contributors by role
  const contributors = toArray(sr.Contributor || details.Contributor);
  const composers = [];
  const lyricists = [];
  const producers = [];
  const writers = [];

  for (const c of contributors) {
    const name = textOf(c.PartyName?.FullName) || textOf(c.PartyName);
    if (!name) continue;

    const roles = toArray(c.Role || c.ContributorRole).map(r =>
      (textOf(r) || '').toLowerCase()
    );

    for (const role of roles) {
      if (role.includes('composer') || role.includes('music')) composers.push(name);
      else if (role.includes('lyricist') || role.includes('author')) lyricists.push(name);
      else if (role.includes('producer')) producers.push(name);
      else if (role.includes('writer') || role.includes('songwriter')) writers.push(name);
    }
  }

  // Resource reference key (used to link tracks to releases)
  const resourceRef = textOf(sr.ResourceReference) || textOf(sr['@_ResourceReference']) || null;

  // Human-readable duration (e.g., "2:28")
  let durationDisplay = null;
  if (duration) {
    const totalSec = Math.round(duration / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    durationDisplay = m + ':' + String(s).padStart(2, '0');
  }

  return {
    resourceRef,
    metadata: {
      title,
      artist,
      isrc,
      duration_ms: duration,
      duration_display: durationDisplay,
      p_line: pLine,
      c_line: cLine,
      primary_genre: primaryGenre,
      language,
      parental_advisory: trackParentalAdvisory,
      sound_recording_type: soundRecordingType,
      audio_codec: audioCodec,
      channels,
      sample_rate: sampleRate,
      bits_per_sample: bitsPerSample,
      composers: composers.length > 0 ? composers : null,
      lyricists: lyricists.length > 0 ? lyricists : null,
      producers: producers.length > 0 ? producers : null,
      writers: writers.length > 0 ? writers : null,
    },
    audio_filename: audioFilename,
  };
}

// ============================================================================
// RELEASE EXTRACTION
// ============================================================================

/**
 * Extract release-level metadata from a Release element.
 */
function extractRelease(rel) {
  const ids = toArray(rel.ReleaseId);
  let upc = null;
  for (const id of ids) {
    upc = textOf(id.ICPN) || textOf(id.UPC) || textOf(id.EAN) || upc;
  }

  const details = rel.ReleaseDetailsByTerritory || rel;
  const labels = toArray(details.LabelName || rel.LabelName);
  const label = labels.length > 0 ? textOf(labels[0]) : null;

  const catalogNumber = textOf(details.CatalogNumber) || textOf(rel.CatalogNumber) || null;

  const releaseDate = textOf(rel.ReleaseDate || details.OriginalReleaseDate)
    || textOf(rel.GlobalReleaseDate) || null;
  const originalReleaseDate = textOf(details.OriginalReleaseDate) || textOf(rel.OriginalReleaseDate) || null;

  const parentalWarning = mapParentalWarning(
    textOf(rel.ParentalWarningType) || textOf(details.ParentalWarningType)
  );

  const albumTitle = textOf(rel.ReferenceTitle?.TitleText)
    || textOf(rel.Title?.TitleText)
    || textOf(rel.DisplayTitle) || null;

  const releaseType = textOf(rel.ReleaseType) || null;

  // Track ordering from ResourceGroup
  const trackOrder = {};
  const resourceGroups = toArray(rel.ResourceGroup);
  for (const rg of resourceGroups) {
    const items = toArray(rg.ResourceGroupContentItem);
    for (const item of items) {
      const ref = textOf(item.ReleaseResourceReference) || textOf(item.ResourceGroupContentItemReference);
      const seq = parseInt(textOf(item.SequenceNumber), 10);
      if (ref && !isNaN(seq)) {
        trackOrder[ref] = seq;
      }
    }
    // Also check nested ResourceGroups (disc > tracks)
    const nestedGroups = toArray(rg.ResourceGroup);
    for (const ng of nestedGroups) {
      const nestedItems = toArray(ng.ResourceGroupContentItem);
      for (const item of nestedItems) {
        const ref = textOf(item.ReleaseResourceReference) || textOf(item.ResourceGroupContentItemReference);
        const seq = parseInt(textOf(item.SequenceNumber), 10);
        if (ref && !isNaN(seq)) {
          trackOrder[ref] = seq;
        }
      }
    }
  }

  // Also try TrackRelease for track sequencing
  const trackReleases = toArray(rel.TrackRelease);
  for (const tr of trackReleases) {
    const ref = textOf(tr.ReleaseResourceReference);
    const seq = parseInt(textOf(tr.SequenceNumber), 10);
    if (ref && !isNaN(seq)) {
      trackOrder[ref] = seq;
    }
  }

  return {
    upc,
    label,
    catalog_number: catalogNumber,
    release_date: releaseDate,
    original_release_date: originalReleaseDate,
    parental_advisory: parentalWarning,
    album_title: albumTitle,
    release_type: releaseType,
    trackOrder,
  };
}

// ============================================================================
// TERRITORY EXTRACTION
// ============================================================================

/**
 * Extract territory codes from DealList.
 */
function extractTerritories(dealList) {
  if (!dealList) return null;

  const codes = new Set();
  const deals = toArray(dealList.ReleaseDeal);

  for (const rd of deals) {
    const innerDeals = toArray(rd.Deal || rd.DealTerms);
    for (const d of innerDeals) {
      const terms = d.DealTerms || d;
      const territories = toArray(terms.Territory || terms.TerritoryCode);
      for (const t of territories) {
        const codes2 = toArray(t.TerritoryCode || t);
        for (const c of codes2) {
          const code = textOf(c);
          if (code && code.length >= 2) codes.add(code);
        }
      }
    }
  }

  return codes.size > 0 ? Array.from(codes) : null;
}

// ============================================================================
// DEAL TERMS EXTRACTION
// ============================================================================

/**
 * Extract deal terms (commercial model, validity period) from DealList.
 */
function extractDealTerms(dealList) {
  if (!dealList) return null;

  const deals = toArray(dealList.ReleaseDeal);
  if (deals.length === 0) return null;

  const terms = toArray(deals[0].Deal || deals[0].DealTerms);
  if (terms.length === 0) return null;

  const dt = terms[0].DealTerms || terms[0];
  const commercialModel = textOf(dt.CommercialModelType) || null;

  let startDate = null;
  if (dt.ValidityPeriod) {
    startDate = textOf(dt.ValidityPeriod.StartDate) || null;
  }

  return {
    commercial_model: commercialModel,
    start_date: startDate,
  };
}

// ============================================================================
// MAIN PARSE FUNCTION
// ============================================================================

/**
 * Parse a DDEX ERN XML string and return ORBIT-ready metadata.
 *
 * @param {string} xml - DDEX ERN XML content
 * @returns {{release_metadata: Object, tracks: Array, ern_version: string, parsed_at: string}}
 */
function parse(xml) {
  const parser = new XMLParser(parserOptions);
  const root = parser.parse(xml);

  const version = detectVersion(root);
  if (!version) {
    throw new Error(
      'Unrecognized DDEX ERN format. Expected NewReleaseMessage with ERN 3.x or 4.x namespace.'
    );
  }

  const msg = root.NewReleaseMessage;

  // Extract sound recordings
  const soundRecordings = toArray(msg.ResourceList?.SoundRecording);
  if (soundRecordings.length === 0) {
    throw new Error('No SoundRecording elements found in ResourceList');
  }

  const tracksByRef = new Map();
  const tracks = [];

  for (const sr of soundRecordings) {
    const extracted = extractSoundRecording(sr);
    tracksByRef.set(extracted.resourceRef, extracted);
    tracks.push(extracted);
  }

  // Extract releases (use the first main release for release-level metadata)
  const releases = toArray(msg.ReleaseList?.Release);
  let releaseMetadata = {
    upc: null, label: null, catalog_number: null,
    release_date: null, original_release_date: null,
    parental_advisory: null, album_title: null, release_type: null,
    trackOrder: {},
  };

  if (releases.length > 0) {
    // Prefer the main release (ReleaseType = Album/Single) over track releases
    const mainRelease = releases.find(r => {
      const rt = textOf(r.ReleaseType);
      return rt && !rt.toLowerCase().includes('track');
    }) || releases[0];

    releaseMetadata = extractRelease(mainRelease);
  }

  // Extract territories and deal terms
  const territories = extractTerritories(msg.DealList);
  const dealTerms = extractDealTerms(msg.DealList);

  // Merge release-level metadata into each track.
  // Track-level parental_advisory takes precedence over release-level.
  const enrichedTracks = tracks.map(t => {
    const trackNumber = releaseMetadata.trackOrder[t.resourceRef] || null;

    return {
      metadata: {
        ...t.metadata,
        parental_advisory: t.metadata.parental_advisory || releaseMetadata.parental_advisory,
        album_title: releaseMetadata.album_title,
        label: releaseMetadata.label,
        catalog_number: releaseMetadata.catalog_number,
        release_date: releaseMetadata.release_date,
        original_release_date: releaseMetadata.original_release_date,
        territories,
        deal: dealTerms,
        track_number: trackNumber,
      },
      audio_filename: t.audio_filename,
      track_number: trackNumber,
    };
  });

  // Sort by track number if available
  enrichedTracks.sort((a, b) => (a.track_number || 999) - (b.track_number || 999));

  const releaseClean = { ...releaseMetadata };
  delete releaseClean.trackOrder;

  return {
    release_metadata: { ...releaseClean, territories, deal: dealTerms },
    tracks: enrichedTracks,
    ern_version: version,
    parsed_at: new Date().toISOString(),
  };
}

/**
 * Parse a DDEX ERN XML file from disk.
 *
 * @param {string} filePath - Path to .xml file
 * @returns {Object} Same as parse()
 */
function parseFile(filePath) {
  const fs = require('fs');
  const xml = fs.readFileSync(filePath, 'utf8');
  return parse(xml);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  parse,
  parseFile,
  parseDuration,
  mapParentalWarning,
  detectVersion,
  extractSoundRecording,
  extractRelease,
  extractTerritories,
  extractDealTerms,
};
