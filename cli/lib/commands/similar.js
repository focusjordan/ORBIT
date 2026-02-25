'use strict';

const { Command } = require('commander');
const fs = require('fs');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('similar')
  .description('Find similar-sounding registered tracks via AI embeddings')
  .argument('<file>', 'path to audio file')
  .option('--threshold <n>', 'similarity threshold 0-1 (default: 0.5)', parseFloat)
  .option('--limit <n>', 'max results (default: 20)', parseInt)
  .option('--no-derivatives', 'exclude covers/remixes')
  .action(async (file, opts, command) => {
    if (!fs.existsSync(file)) {
      out.fail(command, `File not found: ${file}`);
    }

    out.header(command, 'ORBIT Similar');
    out.info(command, `  ${chalk.dim('File')}  ${file}`);
    out.info(command, '');
    out.progress(command, 'Searching for similar tracks');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    const audioBuffer = fs.readFileSync(file);
    const options = {};
    if (opts.threshold != null) options.threshold = opts.threshold;
    if (opts.limit != null) options.limit = opts.limit;
    if (opts.derivatives === false) options.includeDerivatives = false;

    try {
      const result = await client.similar(audioBuffer, options);
      out.clearProgress(command);

      const data = result.data || result;
      const results = data.results || [];

      out.success(command, data, (d) => {
        if (results.length === 0) {
          console.log(chalk.yellow('\n  No similar tracks found.\n'));
          return;
        }

        console.log(chalk.green.bold(`\n  ${results.length} similar track(s) found.\n`));

        const columns = [
          { key: 'similarity', label: 'Match' },
          { key: 'title', label: 'Title' },
          { key: 'artist', label: 'Artist' },
          { key: 'platform', label: 'Platform' },
          { key: 'id', label: 'Reg ID' },
        ];

        const rows = results.map(r => ({
          similarity: ((r.similarity || 0) * 100).toFixed(1) + '%',
          title: r.title || r.metadata?.title || '?',
          artist: r.artist || r.metadata?.artist || '?',
          platform: r.platform || r.platform_id || '?',
          id: String(r.registration_id || r.id || '?'),
        }));

        out.table(command, rows, columns);
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Similarity search failed: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
