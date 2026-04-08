#!/usr/bin/env node
/**
 * ORBIT AI Detection Corpus Test Runner
 *
 * Runs the full detectAI pipeline against labeled audio files and outputs
 * a comparison table for threshold calibration.
 *
 * Usage:
 *   node scripts/test-corpus.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const aiDetection = require('../src/ml/ai-detection');
const audioAnalysis = require('../src/ml/audio-analysis');

const CORPUS = [
  { dir: path.join(__dirname, '../Suno Audio'), label: 'SUNO_AI', expected: 'ai' },
  { dir: path.join(__dirname, '../Audio-under-230'), label: 'HUMAN', expected: 'human' },
];

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg']);

const KNOWN_AI_OVERRIDES = [
  /ai\s*cover/i,
];

function discoverTracks() {
  const tracks = [];
  for (const { dir, label, expected } of CORPUS) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠ Corpus directory not found: ${dir}`);
      continue;
    }
    const files = fs.readdirSync(dir).filter(f => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()));
    for (const file of files) {
      let trackLabel = label;
      let trackExpected = expected;
      for (const re of KNOWN_AI_OVERRIDES) {
        if (re.test(file)) {
          trackLabel = 'AI_COVER';
          trackExpected = 'ai';
          break;
        }
      }
      tracks.push({
        path: path.join(dir, file),
        name: path.basename(file, path.extname(file)),
        label: trackLabel,
        expected: trackExpected,
      });
    }
  }
  return tracks;
}

async function analyzeTrack(track) {
  const audioBuffer = fs.readFileSync(track.path);

  let analysisResult = null;
  try {
    analysisResult = await audioAnalysis.analyze(audioBuffer, { maxLength: 60, aiForensics: true });
  } catch (err) {
    console.warn(`  ⚠ Audio analysis failed for ${track.name}: ${err.message}`);
  }

  const metadata = { title: track.name, filename: path.basename(track.path) };

  const result = await aiDetection.detectAI(audioBuffer, {
    metadata,
    analysisResult,
    verbose: false,
  });

  return result;
}

function colorScore(score) {
  if (score >= 0.65) return `\x1b[31m${(score * 100).toFixed(1)}%\x1b[0m`;
  if (score >= 0.40) return `\x1b[33m${(score * 100).toFixed(1)}%\x1b[0m`;
  return `\x1b[32m${(score * 100).toFixed(1)}%\x1b[0m`;
}

function colorRec(rec, expected) {
  const isCorrect = (expected === 'ai' && (rec === 'LIKELY_AI' || rec === 'REVIEW'))
                 || (expected === 'human' && (rec === 'LIKELY_HUMAN' || rec === 'REVIEW'));
  const isClear = (expected === 'ai' && rec === 'LIKELY_AI')
               || (expected === 'human' && rec === 'LIKELY_HUMAN');
  if (isClear) return `\x1b[32m${rec}\x1b[0m`;
  if (isCorrect) return `\x1b[33m${rec}\x1b[0m`;
  return `\x1b[31m${rec}\x1b[0m`;
}

async function main() {
  const tracks = discoverTracks();
  if (tracks.length === 0) {
    console.error('No tracks found. Check corpus directories.');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log('  ORBIT AI Detection — Corpus Calibration Run');
  console.log(`${'='.repeat(100)}`);
  console.log(`  Tracks discovered: ${tracks.length}`);
  console.log(`  AI tracks: ${tracks.filter(t => t.expected === 'ai').length}`);
  console.log(`  Human tracks: ${tracks.filter(t => t.expected === 'human').length}`);
  console.log(`${'='.repeat(100)}\n`);

  const results = [];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const progress = `[${i + 1}/${tracks.length}]`;
    process.stdout.write(`${progress} Analyzing: ${track.name} (${track.label})...`);

    try {
      const startMs = Date.now();
      const result = await analyzeTrack(track);
      const elapsed = Date.now() - startMs;

      const v3 = result.v3 || null;
      const scoreFloor = result.score_floor_applied || (v3 && v3.score_floor_applied) || null;

      // Raw weighted score (before floor) from per-signal contributions
      let rawScore = null;
      const contrib = result.telemetry?.per_signal_contributions?.v3;
      if (contrib) {
        rawScore = Object.values(contrib).reduce((a, b) => a + (b || 0), 0);
        rawScore = Math.round(rawScore * 1000) / 1000;
      }

      results.push({
        ...track,
        score: result.score,
        rawScore,
        scoreFloor,
        recommendation: result.recommendation,
        flags: aiDetection.getAllFlags(result),
        signals: result.signals || {},
        v3: v3,
        v2: result.v2 || null,
        legacy: result.legacy || null,
        telemetry: result.telemetry || null,
        elapsed,
      });

      const floorTag = scoreFloor ? ` \x1b[35m[floor=${(scoreFloor * 100).toFixed(0)}%]\x1b[0m` : '';
      const rawTag = rawScore != null ? ` raw=${(rawScore * 100).toFixed(1)}%` : '';
      process.stdout.write(` ${colorScore(result.score)}${rawTag}${floorTag} ${colorRec(result.recommendation, track.expected)} (${elapsed}ms)\n`);
    } catch (err) {
      process.stdout.write(` \x1b[31mERROR: ${err.message}\x1b[0m\n`);
      results.push({ ...track, score: null, recommendation: 'ERROR', flags: [], elapsed: 0, error: err.message });
    }
  }

  // Summary tables
  console.log(`\n${'='.repeat(100)}`);
  console.log('  RESULTS SUMMARY');
  console.log(`${'='.repeat(100)}\n`);

  const pad = (s, n) => String(s).padEnd(n);
  const padR = (s, n) => String(s).padStart(n);

  console.log(`${pad('Track', 35)} ${pad('Label', 10)} ${padR('Final', 7)} ${padR('Raw', 7)} ${padR('Floor', 7)} ${pad('Recommendation', 16)} ${padR('ms', 6)}  Flags`);
  console.log(`${'-'.repeat(120)}`);

  for (const r of results) {
    const flagStr = (r.flags || []).slice(0, 5).join(', ') + (r.flags && r.flags.length > 5 ? ` (+${r.flags.length - 5})` : '');
    const finalStr = r.score != null ? (r.score * 100).toFixed(1) + '%' : 'ERR';
    const rawStr = r.rawScore != null ? (r.rawScore * 100).toFixed(1) + '%' : '-';
    const floorStr = r.scoreFloor != null ? (r.scoreFloor * 100).toFixed(0) + '%' : '-';
    console.log(
      `${pad(r.name.substring(0, 34), 35)} ${pad(r.label, 10)} ${padR(finalStr, 7)} ${padR(rawStr, 7)} ${padR(floorStr, 7)} ${pad(r.recommendation, 16)} ${padR(r.elapsed, 6)}  ${flagStr}`
    );
  }

  // Group stats
  console.log(`\n${'='.repeat(100)}`);
  console.log('  GROUP STATISTICS');
  console.log(`${'='.repeat(100)}\n`);

  const groups = {};
  for (const r of results) {
    if (r.score == null) continue;
    if (!groups[r.label]) groups[r.label] = [];
    groups[r.label].push(r);
  }

  for (const [label, items] of Object.entries(groups)) {
    const scores = items.map(i => i.score);
    const rawScores = items.map(i => i.rawScore).filter(s => s != null);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const likelyAi = items.filter(i => i.recommendation === 'LIKELY_AI').length;
    const review = items.filter(i => i.recommendation === 'REVIEW').length;
    const likelyHuman = items.filter(i => i.recommendation === 'LIKELY_HUMAN').length;
    const floored = items.filter(i => i.scoreFloor != null).length;

    console.log(`  ${label} (${items.length} tracks):`);
    console.log(`    Final:  avg=${(avg * 100).toFixed(1)}%  min=${(min * 100).toFixed(1)}%  max=${(max * 100).toFixed(1)}%`);
    if (rawScores.length > 0) {
      const rawAvg = rawScores.reduce((a, b) => a + b, 0) / rawScores.length;
      const rawMin = Math.min(...rawScores);
      const rawMax = Math.max(...rawScores);
      console.log(`    Raw:    avg=${(rawAvg * 100).toFixed(1)}%  min=${(rawMin * 100).toFixed(1)}%  max=${(rawMax * 100).toFixed(1)}%`);
    }
    console.log(`    Recs:   LIKELY_AI=${likelyAi}  REVIEW=${review}  LIKELY_HUMAN=${likelyHuman}  (${floored} floored)`);

    const allFlags = {};
    for (const item of items) {
      for (const flag of (item.flags || [])) {
        allFlags[flag] = (allFlags[flag] || 0) + 1;
      }
    }
    const sorted = Object.entries(allFlags).sort((a, b) => b[1] - a[1]);
    const flagSummary = sorted.slice(0, 10).map(([f, c]) => `${f}(${c}/${items.length})`).join('  ');
    console.log(`    Flags:  ${flagSummary}`);

    // V3 signal breakdown
    const v3Signals = ['PRE_ECHO_DETECTED', 'HF_PHASE_INCOHERENCE', 'MS_PHASE_ANOMALY',
      'PERFECT_VIBRATO', 'STEGANOGRAPHIC_NOISE_FLOOR'];
    const v3Hits = v3Signals.filter(s => allFlags[s]);
    if (v3Hits.length > 0) {
      console.log(`    V3 new: ${v3Hits.map(s => `${s}(${allFlags[s]}/${items.length})`).join('  ')}`);
    } else {
      console.log(`    V3 new: (none firing)`);
    }
    console.log();
  }

  // Separation analysis
  const aiScores = results.filter(r => r.expected === 'ai' && r.score != null).map(r => r.score);
  const humanScores = results.filter(r => r.expected === 'human' && r.score != null).map(r => r.score);

  if (aiScores.length > 0 && humanScores.length > 0) {
    const aiAvg = aiScores.reduce((a, b) => a + b, 0) / aiScores.length;
    const humanAvg = humanScores.reduce((a, b) => a + b, 0) / humanScores.length;
    const gap = aiAvg - humanAvg;
    const aiMin = Math.min(...aiScores);
    const humanMax = Math.max(...humanScores);
    const overlap = humanMax > aiMin;

    console.log(`${'='.repeat(120)}`);
    console.log('  SEPARATION ANALYSIS (Final scores — includes floor)');
    console.log(`${'='.repeat(120)}\n`);
    console.log(`  AI avg score:     ${(aiAvg * 100).toFixed(1)}%`);
    console.log(`  Human avg score:  ${(humanAvg * 100).toFixed(1)}%`);
    console.log(`  Gap:              ${(gap * 100).toFixed(1)} points`);
    console.log(`  AI min:           ${(aiMin * 100).toFixed(1)}%`);
    console.log(`  Human max:        ${(humanMax * 100).toFixed(1)}%`);
    console.log(`  Overlap:          ${overlap ? `\x1b[31mYES\x1b[0m — human max (${(humanMax * 100).toFixed(1)}%) > AI min (${(aiMin * 100).toFixed(1)}%)` : '\x1b[32mNO — clean separation\x1b[0m'}`);

    const correctAi = aiScores.filter(s => s >= 0.50).length;
    const correctHuman = humanScores.filter(s => s < 0.50).length;
    const accuracy = ((correctAi + correctHuman) / (aiScores.length + humanScores.length) * 100).toFixed(1);
    console.log(`  Accuracy @50%:    ${accuracy}% (${correctAi}/${aiScores.length} AI correct, ${correctHuman}/${humanScores.length} human correct)`);

    // Raw score separation (forensics only, no floors)
    const aiRaw = results.filter(r => r.expected === 'ai' && r.rawScore != null).map(r => r.rawScore);
    const humanRaw = results.filter(r => r.expected === 'human' && r.rawScore != null).map(r => r.rawScore);
    if (aiRaw.length > 0 && humanRaw.length > 0) {
      const aiRawAvg = aiRaw.reduce((a, b) => a + b, 0) / aiRaw.length;
      const humanRawAvg = humanRaw.reduce((a, b) => a + b, 0) / humanRaw.length;
      const rawGap = aiRawAvg - humanRawAvg;
      const aiRawMin = Math.min(...aiRaw);
      const humanRawMax = Math.max(...humanRaw);
      const rawOverlap = humanRawMax > aiRawMin;

      console.log(`\n${'='.repeat(120)}`);
      console.log('  SEPARATION ANALYSIS (Raw weighted scores — NO floor, pure forensics)');
      console.log(`${'='.repeat(120)}\n`);
      console.log(`  AI avg raw:       ${(aiRawAvg * 100).toFixed(1)}%`);
      console.log(`  Human avg raw:    ${(humanRawAvg * 100).toFixed(1)}%`);
      console.log(`  Raw gap:          ${(rawGap * 100).toFixed(1)} points`);
      console.log(`  AI raw min:       ${(aiRawMin * 100).toFixed(1)}%`);
      console.log(`  Human raw max:    ${(humanRawMax * 100).toFixed(1)}%`);
      console.log(`  Raw overlap:      ${rawOverlap ? `\x1b[31mYES\x1b[0m — human max (${(humanRawMax * 100).toFixed(1)}%) > AI min (${(aiRawMin * 100).toFixed(1)}%)` : '\x1b[32mNO — clean separation\x1b[0m'}`);

      const correctAiRaw = aiRaw.filter(s => s >= 0.50).length;
      const correctHumanRaw = humanRaw.filter(s => s < 0.50).length;
      const rawAccuracy = ((correctAiRaw + correctHumanRaw) / (aiRaw.length + humanRaw.length) * 100).toFixed(1);
      console.log(`  Raw accuracy @50%: ${rawAccuracy}% (${correctAiRaw}/${aiRaw.length} AI correct, ${correctHumanRaw}/${humanRaw.length} human correct)`);
    }
    console.log();
  }

  // Write raw JSON for further analysis
  const outPath = path.join(__dirname, '../tests/corpus-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`  Raw results saved to: ${outPath}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
