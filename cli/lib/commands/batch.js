'use strict';

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');
const { auditLog } = require('../audit');

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma']);

// Safety threshold: require confirmation for batches above this size
const CONFIRM_THRESHOLD = 25;

function discoverAudioFiles(dir, recursive) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...discoverAudioFiles(fullPath, recursive));
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function metaFromFilename(filePath) {
  const name = path.basename(filePath, path.extname(filePath));
  const parts = name.split(/\s*-\s*/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: 'Unknown', title: name.trim() };
}

function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

const cmd = new Command('batch')
  .description('Process a directory of audio files in bulk')
  .argument('<directory>', 'directory containing audio files')
  .requiredOption('--command <cmd>', 'command to run: register, verify, analyze, detect')
  .option('--recursive', 'include subdirectories')
  .option('--meta-from <source>', 'metadata source for register: "filename" or path to JSON mapping', 'filename')
  .option('--owner-id <id>', 'owner UUID for register (defaults to platform ID)')
  .option('--concurrency <n>', 'parallel operations (default: 1)', parseInt, 1)
  .option('--output-dir <dir>', 'directory for output files (watermarked audio, etc.)')
  .option('--dry-run', 'preview what would be processed without executing')
  .option('--max-files <n>', 'safety limit: stop after processing N files', parseInt)
  .option('--yes', 'skip confirmation prompt for large batches')
  .action(async (directory, opts, command) => {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      out.fail(command, `Not a directory: ${directory}`);
    }

    const validCommands = ['register', 'verify', 'analyze', 'detect'];
    if (!validCommands.includes(opts.command)) {
      out.fail(command, `Invalid command: ${opts.command}. Must be one of: ${validCommands.join(', ')}`);
    }

    const isDryRun = !!opts.dryRun;

    out.header(command, `ORBIT Batch${isDryRun ? ' (DRY RUN)' : ''} — ${opts.command}`);
    out.progress(command, 'Discovering audio files');

    let files = discoverAudioFiles(directory, opts.recursive);
    out.clearProgress(command);

    if (files.length === 0) {
      out.fail(command, `No audio files found in ${directory}`);
    }

    // Apply max-files safety limit
    if (opts.maxFiles && files.length > opts.maxFiles) {
      out.info(command, chalk.yellow(`  Found ${files.length} files, capping to --max-files ${opts.maxFiles}\n`));
      files = files.slice(0, opts.maxFiles);
    }

    out.info(command, `  ${chalk.cyan(String(files.length))} audio file(s) to process\n`);

    // Confirmation prompt for large batches (skipped in --json, --yes, or --dry-run mode)
    const f = out.flags(command);
    if (!isDryRun && !opts.yes && !f.json && files.length > CONFIRM_THRESHOLD) {
      const ok = await confirm(
        chalk.yellow(`  This will ${opts.command} ${files.length} files. Continue? (y/N) `)
      );
      if (!ok) {
        out.info(command, chalk.dim('\n  Batch cancelled.\n'));
        auditLog('batch', 'cancelled', { file_count: files.length, command: opts.command });
        process.exit(0);
      }
    }

    auditLog('batch', 'start', {
      directory,
      command: opts.command,
      file_count: files.length,
      dry_run: isDryRun,
      max_files: opts.maxFiles || null,
    });

    // Dry run: just list files and exit
    if (isDryRun) {
      const dryResults = files.map(file => ({
        file: path.basename(file),
        path: file,
        would_run: `orbit ${opts.command}`,
      }));

      for (const r of dryResults) {
        out.info(command, `  ${chalk.dim('would process')} ${r.file}`);
      }

      out.info(command, '');
      out.success(command, { dry_run: true, total: files.length, files: dryResults }, (d) => {
        console.log(chalk.dim(`\n  Dry run complete. ${d.total} file(s) would be processed.\n`));
      });
      auditLog('batch', 'dry_run_complete', { file_count: files.length });
      return;
    }

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.fail(command, err.message);
    }

    let metaMapping = null;
    if (opts.command === 'register' && opts.metaFrom !== 'filename' && fs.existsSync(opts.metaFrom)) {
      metaMapping = JSON.parse(fs.readFileSync(opts.metaFrom, 'utf8'));
    }

    if (opts.outputDir && !fs.existsSync(opts.outputDir)) {
      fs.mkdirSync(opts.outputDir, { recursive: true });
    }

    const results = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = path.basename(file);
      const progress = `[${i + 1}/${files.length}]`;

      out.info(command, `  ${chalk.dim(progress)} ${filename}`);

      try {
        const audioBuffer = fs.readFileSync(file);
        let result;

        switch (opts.command) {
          case 'register': {
            const meta = metaMapping
              ? (metaMapping[filename] || metaMapping[path.basename(file, path.extname(file))] || metaFromFilename(file))
              : metaFromFilename(file);

            if (!meta.title || !meta.artist) {
              throw new Error('Could not determine title/artist');
            }

            const ownerId = opts.ownerId || client.platformId;
            result = await client.register(audioBuffer, meta, ownerId);

            const regData = result.data || result;

            if (regData.watermarked_audio) {
              const ext = path.extname(file);
              const base = path.basename(file, ext);
              const outDir = opts.outputDir || path.dirname(file);
              const outPath = path.join(outDir, `${base}.orbit${ext}`);
              const audioData = Buffer.isBuffer(regData.watermarked_audio)
                ? regData.watermarked_audio
                : Buffer.from(regData.watermarked_audio, 'base64');
              fs.writeFileSync(outPath, audioData);
            }

            results.push({ file: filename, status: 'ok', registration_id: regData.registration_id });
            out.info(command, chalk.green(`           registered (ID: ${regData.registration_id})`));
            auditLog('batch', 'register', { file: filename, registration_id: regData.registration_id });
            break;
          }

          case 'verify': {
            result = await client.verify(audioBuffer);
            const verData = result.data || result;
            results.push({
              file: filename,
              status: 'ok',
              verified: !!verData.verified,
              registration_id: verData.fingerprint_match?.registration_id || null,
            });
            const label = verData.verified ? chalk.green('verified') : chalk.yellow('not registered');
            out.info(command, `           ${label}`);
            auditLog('batch', 'verify', { file: filename, verified: !!verData.verified });
            break;
          }

          case 'analyze': {
            result = await client.analyze(audioBuffer);
            const anaData = (result.data || result).analysis || result.data || result;
            const genre = anaData.genre?.[0]?.label || 'unknown';
            const bpm = anaData.bpm?.value || '?';
            results.push({ file: filename, status: 'ok', genre, bpm });
            out.info(command, chalk.green(`           ${genre}, ${bpm} BPM`));
            auditLog('batch', 'analyze', { file: filename, genre });
            break;
          }

          case 'detect': {
            result = await client.analyze(audioBuffer, {
              include: ['genre', 'mood', 'bpm', 'key'],
            });
            const detData = result.data || result;
            const ai = detData.ai_detection || detData.analysis?.ai_detection;
            const rec = ai?.recommendation || 'N/A';
            results.push({ file: filename, status: 'ok', ai_detection: rec, score: ai?.score });
            const colorMap = { LIKELY_AI: 'red', REVIEW: 'yellow', LIKELY_HUMAN: 'green' };
            out.info(command, chalk[colorMap[rec] || 'white'](`           ${rec}`));
            auditLog('batch', 'detect', { file: filename, recommendation: rec });
            break;
          }
        }

        succeeded++;
      } catch (err) {
        failed++;
        results.push({ file: filename, status: 'error', error: err.message });
        out.info(command, chalk.red(`           failed: ${err.message}`));
        auditLog('batch', 'error', { file: filename, error: err.message });
      }
    }

    const summary = {
      total: files.length,
      succeeded,
      failed,
      results,
    };

    auditLog('batch', 'complete', { total: files.length, succeeded, failed });

    out.info(command, '');
    out.success(command, summary, (d) => {
      console.log(chalk.bold(`\n  Batch complete: ${chalk.green(d.succeeded + ' succeeded')}, ${d.failed > 0 ? chalk.red(d.failed + ' failed') : chalk.dim('0 failed')}\n`));
    });

    if (failed > 0) process.exit(1);
  });

module.exports = cmd;
