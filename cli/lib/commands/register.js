'use strict';

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('register')
  .description('Register audio with ORBIT — embed watermark and record provenance')
  .argument('<file>', 'path to audio file (MP3, WAV, FLAC, etc.)')
  .requiredOption('--title <title>', 'track title')
  .requiredOption('--artist <artist>', 'artist name')
  .option('--owner-id <id>', 'owner UUID (defaults to platform ID)')
  .option('--isrc <code>', 'ISRC code')
  .option('--upc <code>', 'UPC code')
  .option('--genre <genre>', 'primary genre')
  .option('--album <title>', 'album title')
  .option('--label <name>', 'record label')
  .option('--p-line <text>', 'sound recording copyright')
  .option('--c-line <text>', 'composition copyright')
  .option('--release-date <date>', 'release date (ISO 8601)')
  .option('--meta <file>', 'JSON file with additional metadata fields')
  .option('--output <path>', 'output path for watermarked file')
  .option('--no-save', 'do not save watermarked audio to disk')
  .action(async (file, opts, command) => {
    if (!fs.existsSync(file)) {
      out.fail(command, `File not found: ${file}`);
    }

    out.header(command, 'ORBIT Register');
    out.progress(command, 'Connecting');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    const audioBuffer = fs.readFileSync(file);
    const ext = path.extname(file);
    const basename = path.basename(file, ext);

    // Build metadata from flags + optional JSON sidecar
    let meta = {};
    if (opts.meta) {
      if (!fs.existsSync(opts.meta)) out.fail(command, `Metadata file not found: ${opts.meta}`);
      meta = JSON.parse(fs.readFileSync(opts.meta, 'utf8'));
    }

    meta.title = opts.title || meta.title;
    meta.artist = opts.artist || meta.artist;
    if (opts.isrc) meta.isrc = opts.isrc;
    if (opts.upc) meta.upc = opts.upc;
    if (opts.genre) meta.primary_genre = opts.genre;
    if (opts.album) meta.album_title = opts.album;
    if (opts.label) meta.label = opts.label;
    if (opts.pLine) meta.p_line = opts.pLine;
    if (opts.cLine) meta.c_line = opts.cLine;
    if (opts.releaseDate) meta.release_date = opts.releaseDate;

    const ownerId = opts.ownerId || client.platformId;

    out.info(command, `  ${chalk.dim('File')}     ${file}`);
    out.info(command, `  ${chalk.dim('Title')}    ${meta.title}`);
    out.info(command, `  ${chalk.dim('Artist')}   ${meta.artist}`);
    out.info(command, '');
    out.progress(command, 'Registering audio (fingerprint + watermark + AI analysis)');

    try {
      const result = await client.register(audioBuffer, meta, ownerId);
      out.clearProgress(command);

      // Save watermarked audio
      let savedPath = null;
      if (opts.save !== false && result.watermarked_audio) {
        savedPath = opts.output || path.join(path.dirname(file), `${basename}.orbit${ext}`);
        const watermarkedData = Buffer.isBuffer(result.watermarked_audio)
          ? result.watermarked_audio
          : Buffer.from(result.watermarked_audio, 'base64');
        fs.writeFileSync(savedPath, watermarkedData);
      }

      const output = {
        success: true,
        registration_id: result.registration_id || result.data?.registration_id,
        fingerprint_hash: result.fingerprint_hash || result.data?.fingerprint_hash,
        watermark_hash: result.watermark_hash || result.data?.watermark_hash,
        watermark_method: result.watermark_method || result.data?.watermark_method || null,
        registered_at: result.registered_at || result.data?.registered_at,
        watermarked_file: savedPath,
        processing_time_ms: result.processing_time_ms || result.data?.processing_time_ms || null,
        ai_detection: result.ai_detection || result.data?.ai_detection || null,
        catalog_check: result.catalog_check || result.data?.catalog_check || null,
      };

      out.success(command, output, (data) => {
        console.log(chalk.green.bold('\n  Registration successful.\n'));
        out.field(command, 'Registration ID', String(data.registration_id), 'cyan');
        out.field(command, 'Fingerprint', data.fingerprint_hash ? String(data.fingerprint_hash).slice(0, 16) + '...' : 'N/A');
        out.field(command, 'Registered At', data.registered_at || 'N/A');
        if (data.watermarked_file) {
          out.field(command, 'Watermarked File', data.watermarked_file, 'green');
        }
        console.log();
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Registration failed: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
