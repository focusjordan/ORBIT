'use strict';

const { Command } = require('commander');
const fs = require('fs');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('analyze')
  .description('AI-powered audio analysis — genre, mood, BPM, key, instruments, vocals')
  .argument('<file>', 'path to audio file')
  .option('--include <fields>', 'comma-separated list: genre,mood,bpm,key,instruments,vocals,fingerprint,embedding')
  .action(async (file, opts, command) => {
    if (!fs.existsSync(file)) {
      out.fail(command, `File not found: ${file}`);
    }

    out.header(command, 'ORBIT Analyze');
    out.info(command, `  ${chalk.dim('File')}  ${file}`);
    out.info(command, '');
    out.progress(command, 'Running AI analysis');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    const audioBuffer = fs.readFileSync(file);
    const options = {};
    if (opts.include) {
      options.include = opts.include.split(',').map(s => s.trim());
    }

    try {
      const result = await client.analyze(audioBuffer, options);
      out.clearProgress(command);

      const data = result.data || result;
      const analysis = data.analysis || data;

      out.success(command, data, (d) => {
        console.log(chalk.green.bold('\n  Analysis complete.\n'));

        if (analysis.genre && analysis.genre.length > 0) {
          const top = analysis.genre.slice(0, 3).map(g =>
            `${g.label} (${(g.confidence * 100).toFixed(0)}%)`
          ).join(', ');
          out.field(command, 'Genre', top);
        }

        if (analysis.mood && analysis.mood.length > 0) {
          const top = analysis.mood.slice(0, 3).map(m =>
            `${m.label} (${(m.confidence * 100).toFixed(0)}%)`
          ).join(', ');
          out.field(command, 'Mood', top);
        }

        if (analysis.bpm) {
          const conf = analysis.bpm.confidence
            ? ` (${(analysis.bpm.confidence * 100).toFixed(0)}%)`
            : '';
          out.field(command, 'BPM', `${analysis.bpm.value}${conf}`);
        }

        if (analysis.key) {
          const conf = analysis.key.confidence
            ? ` (${(analysis.key.confidence * 100).toFixed(0)}%)`
            : '';
          out.field(command, 'Key', `${analysis.key.value || analysis.key.label}${conf}`);
        }

        if (analysis.instruments && analysis.instruments.length > 0) {
          const list = analysis.instruments.slice(0, 5).map(i =>
            typeof i === 'string' ? i : `${i.label} (${(i.confidence * 100).toFixed(0)}%)`
          ).join(', ');
          out.field(command, 'Instruments', list);
        }

        if (analysis.vocals) {
          const v = analysis.vocals;
          const desc = v.present
            ? `detected${v.gender ? ' (' + v.gender + ')' : ''}`
            : 'none detected';
          out.field(command, 'Vocals', desc);
        }

        if (data.processing_time_ms) {
          out.field(command, 'Processing Time', `${data.processing_time_ms}ms`);
        }

        console.log();
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Analysis failed: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
