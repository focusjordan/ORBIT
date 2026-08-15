'use strict';

const { Command } = require('commander');
const fs = require('fs');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('verify')
  .description('Verify audio provenance — check fingerprint, watermark, and origin')
  .argument('<file>', 'path to audio file to verify')
  .action(async (file, opts, command) => {
    if (!fs.existsSync(file)) {
      out.fail(command, `File not found: ${file}`);
    }

    out.header(command, 'ORBIT Verify');
    out.info(command, `  ${chalk.dim('File')}  ${file}`);
    out.info(command, '');
    out.progress(command, 'Verifying audio provenance');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    const audioBuffer = fs.readFileSync(file);

    try {
      const result = await client.verify(audioBuffer);
      out.clearProgress(command);

      const data = result.data || result;

      const output = {
        verified: !!data.verified,
        fingerprint_hash: data.fingerprint_hash,
        fingerprint_match: data.fingerprint_match || null,
        watermark: data.watermark || null,
        metadata: data.metadata || null,
        origin: data.origin || null,
        transfers: data.transfers || [],
        duplicate_of: data.duplicate_of || null,
        ai_detection: data.ai_detection || null,
        processing_time_ms: data.processing_time_ms || null,
      };

      if (!output.verified) {
        out.success(command, output, () => {
          console.log(chalk.yellow.bold('\n  Audio not registered in ORBIT.\n'));
          if (output.fingerprint_hash) {
            out.field(command, 'Fingerprint', String(output.fingerprint_hash).slice(0, 16) + '...');
          }
          console.log();
        });
        process.exit(2);
      }

      out.success(command, output, (d) => {
        console.log(chalk.green.bold('\n  Audio verified.\n'));
        out.field(command, 'Verified', 'YES', 'green');

        if (d.origin) {
          out.field(command, 'Origin Platform', d.origin.platform || 'N/A');
          out.field(command, 'Registered', d.origin.timestamp || 'N/A');
          out.field(command, 'Signature Valid', d.origin.signature_valid ? chalk.green('YES') : chalk.red('NO'));
        }

        if (d.metadata) {
          out.field(command, 'Title', d.metadata.title || 'N/A');
          out.field(command, 'Artist', d.metadata.artist || 'N/A');
          if (d.metadata.isrc) out.field(command, 'ISRC', d.metadata.isrc);
          if (d.metadata.primary_genre) out.field(command, 'Genre', d.metadata.primary_genre);
        }

        if (d.watermark) {
          out.field(command, 'Watermark', d.watermark.detected ? chalk.green('detected') : chalk.yellow('not detected'));
          if (d.watermark.detected) {
            out.field(command, 'Watermark Valid', d.watermark.valid ? chalk.green('YES') : chalk.red('NO'));
          }
        }

        if (d.fingerprint_match) {
          out.field(command, 'Registration ID', String(d.fingerprint_match.registration_id));
          if (d.fingerprint_match.similarity != null) {
            out.field(command, 'Match Confidence', (d.fingerprint_match.similarity * 100).toFixed(1) + '%');
          }
        }

        if (d.duplicate_of) {
          out.field(command, 'Duplicate Of', chalk.yellow(String(d.duplicate_of)));
        }

        if (d.transfers && d.transfers.length > 0) {
          out.field(command, 'Transfers', String(d.transfers.length));
        }

        if (d.ai_detection) {
          const det = d.ai_detection;
          const label = det.recommendation || det.label || 'N/A';
          const color = label === 'LIKELY_AI' ? 'red' : label === 'REVIEW' ? 'yellow' : 'green';
          out.field(command, 'AI Detection', chalk[color](label));
          if (det.score != null) out.field(command, 'AI Score', (det.score * 100).toFixed(1) + '%');
        }

        console.log();
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Verification failed: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
