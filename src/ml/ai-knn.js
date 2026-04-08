const fs = require('fs');
const path = require('path');
const clap = require('./clap');

const DEFAULT_REFERENCE_PATH = path.join(__dirname, '../../data/ai-knn-references.json');

function cosineDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return null;
  }
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (aNorm === 0 || bNorm === 0) return null;
  const similarity = dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
  return 1 - similarity;
}

function normalizeReferenceItem(item) {
  if (Array.isArray(item)) return item;
  if (item && Array.isArray(item.embedding)) return item.embedding;
  return null;
}

function loadReferences(referencePath = DEFAULT_REFERENCE_PATH) {
  if (!fs.existsSync(referencePath)) {
    return { available: false, reason: 'reference_file_missing', path: referencePath };
  }

  const raw = fs.readFileSync(referencePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { available: false, reason: 'reference_file_invalid_json', path: referencePath, error: error.message };
  }

  const aiRefs = (parsed.ai || []).map(normalizeReferenceItem).filter(Boolean);
  const humanRefs = (parsed.human || []).map(normalizeReferenceItem).filter(Boolean);

  if (aiRefs.length === 0 || humanRefs.length === 0) {
    return {
      available: false,
      reason: 'reference_set_incomplete',
      path: referencePath,
      counts: { ai: aiRefs.length, human: humanRefs.length },
    };
  }

  return {
    available: true,
    aiRefs,
    humanRefs,
    path: referencePath,
  };
}

function nearestDistance(vector, references) {
  let best = null;
  for (const ref of references) {
    const d = cosineDistance(vector, ref);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

async function classifyWithReferences(audioInput, options = {}) {
  const references = loadReferences(options.referencePath || process.env.ORBIT_AI_KNN_REFERENCE_PATH || DEFAULT_REFERENCE_PATH);
  if (!references.available) {
    return {
      available: false,
      status: 'unavailable',
      reason: references.reason,
      details: {
        path: references.path,
        counts: references.counts || null,
        error: references.error || null,
      },
    };
  }

  const embeddingResult = await clap.getAudioEmbedding(audioInput, { verbose: false });
  const query = Array.from(embeddingResult.embedding);
  const nearestAi = nearestDistance(query, references.aiRefs);
  const nearestHuman = nearestDistance(query, references.humanRefs);

  if (nearestAi === null || nearestHuman === null) {
    return {
      available: false,
      status: 'unavailable',
      reason: 'distance_computation_failed',
      details: { nearestAi, nearestHuman },
    };
  }

  const margin = nearestHuman - nearestAi; // positive => closer to AI
  const confidence = Math.min(1, Math.max(0, Math.abs(margin) / 0.25));
  const aiLikelihood = Math.min(1, Math.max(0, 0.5 + margin / 0.5));

  return {
    available: true,
    status: 'ok',
    aiLikelihood: Math.round(aiLikelihood * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
    nearestAiDistance: Math.round(nearestAi * 10000) / 10000,
    nearestHumanDistance: Math.round(nearestHuman * 10000) / 10000,
    distanceMargin: Math.round(margin * 10000) / 10000,
    referenceCounts: {
      ai: references.aiRefs.length,
      human: references.humanRefs.length,
    },
  };
}

module.exports = {
  classifyWithReferences,
};
