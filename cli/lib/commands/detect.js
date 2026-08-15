'use strict';

const { Command } = require('commander');
const fs = require('fs');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('detect')
  .description('Detect whether audio is AI-generated (advisory, multi-signal analysis)')
  .argument('<file>', 'path to audio file')
  .action(async (file, opts, command) => {
    if (!fs.existsSync(file)) {
      out.fail(command, `File not found: ${file}`);
    }

    out.header(command, 'ORBIT AI Detection');
    out.info(command, `  ${chalk.dim('File')}  ${file}`);
    out.info(command, '');
    out.progress(command, 'Running AI detection analysis');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    const audioBuffer = fs.readFileSync(file);

    try {
      // Use the analyze endpoint — AI detection is included in registration
      // and can also be accessed via analyze with the right context.
      // The verify endpoint also returns ai_detection when the track is registered.
      // For standalone detection, we use analyze which returns the full analysis.
      const result = await client.analyze(audioBuffer, {
        include: ['genre', 'mood', 'bpm', 'key', 'instruments', 'vocals', 'ai_detection'],
      });
      out.clearProgress(command);

      const data = result.data || result;
      const analysis = data.analysis || data;
      const aiDetection = data.ai_detection || analysis.ai_detection || null;

      const output = {
        file,
        ai_detection: aiDetection,
        analysis_summary: {
          genre: analysis.genre ? analysis.genre.slice(0, 2) : null,
          bpm: analysis.bpm || null,
          key: analysis.key || null,
        },
      };

      out.success(command, output, (_d) => {
        if (aiDetection) {
          const rec = aiDetection.recommendation || aiDetection.label || 'UNKNOWN';
          const colorMap = { LIKELY_AI: 'red', REVIEW: 'yellow', LIKELY_HUMAN: 'green' };
          const color = colorMap[rec] || 'white';

          console.log();
          out.field(command, 'Verdict', chalk[color].bold(rec));
          if (aiDetection.score != null) {
            out.field(command, 'Confidence', out.confidenceBar(aiDetection.score));
          }

          if (aiDetection.signals) {
            console.log();
            console.log(chalk.dim('  Signal Breakdown:'));
            for (const [key, val] of Object.entries(aiDetection.signals)) {
              let sigScore = null;
              if (typeof val === 'number') {
                sigScore = val;
              } else if (val && typeof val === 'object') {
                sigScore =
                  val.aiScore ??
                  val.anomalyScore ??
                  val.suspicionScore ??
                  val.provenanceScore ??
                  val.watermarkScore ??
                  val.sonicsScore ??
                  null;
              }
              const displayVal = sigScore != null
                ? out.confidenceBar(sigScore)
                : (val?.available === false ? chalk.dim('unavailable') : String(val));
              out.field(command, `  ${key}`, displayVal);
            }
          }
        } else {
          console.log(chalk.yellow('\n  AI detection data not available in analysis response.'));
          console.log(chalk.dim('  AI detection runs automatically during registration.'));
          console.log(chalk.dim('  Use `orbit verify` on a registered file to see detection results.'));
        }

        if (analysis.genre && analysis.genre.length > 0) {
          console.log();
          const top = analysis.genre.slice(0, 2).map(g =>
            `${g.label} (${(g.confidence * 100).toFixed(0)}%)`
          ).join(', ');
          out.field(command, 'Genre', top);
        }
        if (analysis.bpm) {
          out.field(command, 'BPM', String(analysis.bpm.value));
        }

        console.log();
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Detection failed: ${err.message}`, err.details);
    }
  });

module.exports = cmd;

