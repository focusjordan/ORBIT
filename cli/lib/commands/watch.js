'use strict';

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');
const { auditLog } = require('../audit');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma']);

const cmd = new Command('watch')
  .description('Watch a directory and auto-process new audio files (agent daemon mode)')
  .argument('<directory>', 'directory to watch')
  .requiredOption('--command <cmd>', 'action on new files: register, verify, analyze, detect')
  .option('--max-files <n>', 'stop after processing N files (safety limit)', parseInt)
  .option('--interval <ms>', 'poll interval in milliseconds (default: 5000)', parseInt, 5000)
  .option('--dry-run', 'show what would be processed without executing')
  .option('--meta-from <source>', 'metadata source for register: "filename" (default)', 'filename')
  .option('--owner-id <id>', 'owner UUID for register')
  .option('--output-dir <dir>', 'directory for output files')
  .action(async (directory, opts, command) => {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      out.fail(command, `Not a directory: ${directory}`);
    }

    const validCommands = ['register', 'verify', 'analyze', 'detect'];
    if (!validCommands.includes(opts.command)) {
      out.fail(command, `Invalid command: ${opts.command}. Must be one of: ${validCommands.join(', ')}`);
    }

    if (opts.dryRun) {
      out.header(command, `ORBIT Watch (DRY RUN) — ${opts.command}`);
    } else {
      out.header(command, `ORBIT Watch — ${opts.command}`);
    }

    let client;
    if (!opts.dryRun) {
      try {
        client = buildClient();
      } catch (err) {
        out.fail(command, err.message);
      }
    }

    if (opts.outputDir && !fs.existsSync(opts.outputDir)) {
      fs.mkdirSync(opts.outputDir, { recursive: true });
    }

    const processed = new Set();
    let totalProcessed = 0;

    out.info(command, `  ${chalk.dim('Directory')}   ${directory}`);
    out.info(command, `  ${chalk.dim('Command')}     ${opts.command}`);
    out.info(command, `  ${chalk.dim('Interval')}    ${opts.interval}ms`);
    if (opts.maxFiles) out.info(command, `  ${chalk.dim('Max Files')}   ${opts.maxFiles}`);
    if (opts.dryRun) out.info(command, chalk.yellow('  DRY RUN — no operations will be executed'));
    out.info(command, '');
    out.info(command, chalk.dim('  Watching for new audio files... (Ctrl+C to stop)\n'));

    const poll = async () => {
      try {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        const audioFiles = entries
          .filter(e => e.isFile() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
          .map(e => e.name)
          .filter(name => !processed.has(name));

        for (const filename of audioFiles) {
          if (opts.maxFiles && totalProcessed >= opts.maxFiles) {
            out.info(command, chalk.yellow(`\n  Max files limit reached (${opts.maxFiles}). Stopping.\n`));
            auditLog('watch', 'stopped', { reason: 'max_files_reached', total: totalProcessed });
            process.exit(0);
          }

          const filePath = path.join(directory, filename);
          processed.add(filename);
          totalProcessed++;

          const timestamp = new Date().toISOString().slice(11, 19);
          out.info(command, `  ${chalk.dim(timestamp)} ${chalk.cyan('new')} ${filename}`);

          if (opts.dryRun) {
            out.info(command, chalk.dim(`           would run: orbit ${opts.command} "${filePath}"`));
            auditLog('watch', 'dry_run', { file: filename, command: opts.command });
            continue;
          }

          try {
            const audioBuffer = fs.readFileSync(filePath);

            switch (opts.command) {
              case 'register': {
                const name = path.basename(filename, path.extname(filename));
                const parts = name.split(/\s*-\s*/);
                const meta = parts.length >= 2
                  ? { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() }
                  : { artist: 'Unknown', title: name.trim() };

                const result = await client.register(audioBuffer, meta, opts.ownerId || client.platformId);
                const regData = result.data || result;

                if (regData.watermarked_audio) {
                  const ext = path.extname(filename);
                  const base = path.basename(filename, ext);
                  const outDir = opts.outputDir || directory;
                  const outPath = path.join(outDir, `${base}.orbit${ext}`);
                  const audioData = Buffer.isBuffer(regData.watermarked_audio)
                    ? regData.watermarked_audio
                    : Buffer.from(regData.watermarked_audio, 'base64');
                  fs.writeFileSync(outPath, audioData);
                }

                out.info(command, chalk.green(`           registered (ID: ${regData.registration_id})`));
                auditLog('watch', 'register', { file: filename, registration_id: regData.registration_id });
                break;
              }
              case 'verify': {
                const result = await client.verify(audioBuffer);
                const d = result.data || result;
                const label = d.verified ? chalk.green('verified') : chalk.yellow('not registered');
                out.info(command, `           ${label}`);
                auditLog('watch', 'verify', { file: filename, verified: !!d.verified });
                break;
              }
              case 'analyze': {
                const result = await client.analyze(audioBuffer);
                const d = (result.data || result).analysis || result.data || result;
                const genre = d.genre?.[0]?.label || 'unknown';
                out.info(command, chalk.green(`           ${genre}`));
                auditLog('watch', 'analyze', { file: filename, genre });
                break;
              }
              case 'detect': {
                const result = await client.analyze(audioBuffer, { include: ['genre', 'mood'] });
                const d = result.data || result;
                const ai = d.ai_detection || d.analysis?.ai_detection;
                const rec = ai?.recommendation || 'N/A';
                const colorMap = { LIKELY_AI: 'red', REVIEW: 'yellow', LIKELY_HUMAN: 'green' };
                out.info(command, chalk[colorMap[rec] || 'white'](`           ${rec}`));
                auditLog('watch', 'detect', { file: filename, recommendation: rec });
                break;
              }
            }
          } catch (err) {
            out.info(command, chalk.red(`           error: ${err.message}`));
            auditLog('watch', 'error', { file: filename, error: err.message });
          }
        }
      } catch (err) {
        out.info(command, chalk.red(`  Poll error: ${err.message}`));
      }
    };

    // Initial scan
    await poll();

    // Continuous polling
    const interval = setInterval(poll, opts.interval);

    // Graceful shutdown
    process.on('SIGINT', () => {
      clearInterval(interval);
      out.info(command, `\n  ${chalk.dim('Watch stopped.')} Processed ${totalProcessed} file(s).\n`);
      auditLog('watch', 'stopped', { reason: 'user_interrupt', total: totalProcessed });
      process.exit(0);
    });
  });

module.exports = cmd;
