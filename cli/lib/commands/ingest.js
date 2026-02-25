'use strict';

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');
const { auditLog } = require('../audit');

const CONFIRM_THRESHOLD = 10;

function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

/**
 * Find DDEX ERN XML files in a directory (non-recursive).
 * Looks for .xml files whose content contains NewReleaseMessage.
 */
function findDdexFiles(dir) {
  const xmlFiles = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
      const fullPath = path.join(dir, entry.name);
      const head = fs.readFileSync(fullPath, 'utf8').slice(0, 2000);
      if (head.includes('NewReleaseMessage')) {
        xmlFiles.push(fullPath);
      }
    }
  }
  return xmlFiles;
}

const cmd = new Command('ingest')
  .description('Import a DDEX ERN package — parse XML metadata and register tracks with ORBIT')
  .argument('<path>', 'path to DDEX ERN XML file or directory containing a DDEX package')
  .requiredOption('--owner-id <id>', 'owner UUID for all tracks in this release')
  .option('--audio-dir <dir>', 'directory containing audio files (default: same directory as XML)')
  .option('--output-dir <dir>', 'directory for watermarked output files')
  .option('--dry-run', 'parse and display release contents without registering')
  .option('--yes', 'skip confirmation prompt')
  .action(async (inputPath, opts, command) => {
    if (!fs.existsSync(inputPath)) {
      out.fail(command, `Path not found: ${inputPath}`);
    }

    const isDryRun = !!opts.dryRun;
    out.header(command, `ORBIT DDEX Ingest${isDryRun ? ' (DRY RUN)' : ''}`);

    // Resolve XML file(s)
    let xmlFiles = [];
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
      xmlFiles = findDdexFiles(inputPath);
      if (xmlFiles.length === 0) {
        out.fail(command, `No DDEX ERN XML files found in ${inputPath}`);
      }
    } else {
      xmlFiles = [path.resolve(inputPath)];
    }

    out.info(command, `  ${chalk.cyan(String(xmlFiles.length))} DDEX file(s) found\n`);

    // The DDEX parser lives server-side in src/engines but is also a pure
    // function we can call directly from the CLI for parsing.
    let ddexIngest;
    try {
      ddexIngest = require('../../../src/engines/ddex-ingest');
    } catch (err) {
      out.fail(command, `Failed to load DDEX parser: ${err.message}`);
    }

    // Parse all XML files and collect tracks
    const allTracks = [];

    for (const xmlPath of xmlFiles) {
      out.info(command, `  ${chalk.dim('Parsing')} ${path.basename(xmlPath)}`);

      let parsed;
      try {
        parsed = ddexIngest.parseFile(xmlPath);
      } catch (err) {
        out.info(command, chalk.red(`    Parse error: ${err.message}`));
        auditLog('ingest', 'parse_error', { file: xmlPath, error: err.message });
        continue;
      }

      const audioDir = opts.audioDir
        ? path.resolve(opts.audioDir)
        : path.dirname(xmlPath);

      out.info(command, `    ERN ${parsed.ern_version} — ${chalk.bold(parsed.release_metadata.album_title || 'Untitled Release')}`);
      if (parsed.release_metadata.upc) {
        out.info(command, `    UPC: ${parsed.release_metadata.upc}`);
      }
      if (parsed.release_metadata.label) {
        out.info(command, `    Label: ${parsed.release_metadata.label}`);
      }
      out.info(command, `    ${parsed.tracks.length} track(s):\n`);

      for (const track of parsed.tracks) {
        const num = track.track_number ? `${track.track_number}.` : '-';
        out.info(command, `      ${chalk.dim(num)} ${track.metadata.title || '?'} — ${track.metadata.artist || '?'}`);
        if (track.metadata.isrc) {
          out.info(command, `         ISRC: ${track.metadata.isrc}`);
        }

        // Resolve audio file path
        let audioPath = null;
        if (track.audio_filename) {
          const candidate = path.resolve(audioDir, track.audio_filename);
          if (fs.existsSync(candidate)) {
            audioPath = candidate;
          } else {
            // Try just the basename in the audio dir
            const baseName = path.basename(track.audio_filename);
            const candidate2 = path.resolve(audioDir, baseName);
            if (fs.existsSync(candidate2)) {
              audioPath = candidate2;
            }
          }
        }

        if (!audioPath) {
          out.info(command, chalk.yellow(`         Audio file not found: ${track.audio_filename || '(no filename in XML)'}`));
        }

        allTracks.push({
          metadata: track.metadata,
          audioPath,
          xmlFile: path.basename(xmlPath),
          releaseMetadata: parsed.release_metadata,
        });
      }

      out.info(command, '');
    }

    if (allTracks.length === 0) {
      out.fail(command, 'No tracks found in DDEX package(s)');
    }

    const tracksWithAudio = allTracks.filter(t => t.audioPath);
    const tracksMissing = allTracks.filter(t => !t.audioPath);

    out.info(command, `  ${chalk.cyan(String(tracksWithAudio.length))} track(s) ready to register`);
    if (tracksMissing.length > 0) {
      out.info(command, `  ${chalk.yellow(String(tracksMissing.length))} track(s) skipped (no audio file)`);
    }
    out.info(command, '');

    auditLog('ingest', 'parsed', {
      xml_files: xmlFiles.length,
      total_tracks: allTracks.length,
      tracks_with_audio: tracksWithAudio.length,
      dry_run: isDryRun,
    });

    // Dry run: show summary and exit
    if (isDryRun) {
      const dryResults = allTracks.map(t => ({
        title: t.metadata.title,
        artist: t.metadata.artist,
        isrc: t.metadata.isrc || null,
        audio_found: !!t.audioPath,
      }));

      out.success(command, { dry_run: true, total: allTracks.length, tracks: dryResults }, (d) => {
        console.log(chalk.dim(`\n  Dry run complete. ${d.total} track(s) parsed.\n`));
      });
      auditLog('ingest', 'dry_run_complete', { track_count: allTracks.length });
      return;
    }

    if (tracksWithAudio.length === 0) {
      out.fail(command, 'No tracks have matching audio files — cannot register');
    }

    // Confirmation prompt for non-trivial batches
    const f = out.flags(command);
    if (!opts.yes && !f.json && tracksWithAudio.length > CONFIRM_THRESHOLD) {
      const ok = await confirm(
        chalk.yellow(`  Register ${tracksWithAudio.length} tracks with ORBIT? (y/N) `)
      );
      if (!ok) {
        out.info(command, chalk.dim('\n  Ingest cancelled.\n'));
        auditLog('ingest', 'cancelled', { track_count: tracksWithAudio.length });
        process.exit(0);
      }
    }

    // Build SDK client
    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.fail(command, err.message);
    }

    if (opts.outputDir && !fs.existsSync(opts.outputDir)) {
      fs.mkdirSync(opts.outputDir, { recursive: true });
    }

    // Register each track
    const results = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < tracksWithAudio.length; i++) {
      const track = tracksWithAudio[i];
      const progress = `[${i + 1}/${tracksWithAudio.length}]`;
      const label = `${track.metadata.title} — ${track.metadata.artist}`;

      out.info(command, `  ${chalk.dim(progress)} ${label}`);

      try {
        const audioBuffer = fs.readFileSync(track.audioPath);
        const result = await client.register(audioBuffer, track.metadata, opts.ownerId);

        const regData = result.data || result;

        // Save watermarked audio if requested
        if (regData.watermarked_audio && opts.outputDir) {
          const ext = path.extname(track.audioPath);
          const base = path.basename(track.audioPath, ext);
          const outPath = path.join(opts.outputDir, `${base}.orbit${ext}`);
          const audioData = Buffer.isBuffer(regData.watermarked_audio)
            ? regData.watermarked_audio
            : Buffer.from(regData.watermarked_audio, 'base64');
          fs.writeFileSync(outPath, audioData);
        }

        results.push({
          title: track.metadata.title,
          artist: track.metadata.artist,
          isrc: track.metadata.isrc || null,
          status: 'ok',
          registration_id: regData.registration_id,
          catalog_check: regData.catalog_check?.status || null,
        });

        const catalogStatus = regData.catalog_check?.status;
        let statusLabel = chalk.green('registered');
        if (catalogStatus === 'verified_known_work') {
          statusLabel += chalk.cyan(' (verified known work)');
        } else if (catalogStatus === 'known_work_unverified') {
          statusLabel += chalk.yellow(' (known work - unverified)');
        }

        out.info(command, `           ${statusLabel} (ID: ${regData.registration_id})`);
        auditLog('ingest', 'register', {
          title: track.metadata.title,
          registration_id: regData.registration_id,
          catalog_status: catalogStatus,
        });

        succeeded++;
      } catch (err) {
        failed++;
        results.push({
          title: track.metadata.title,
          artist: track.metadata.artist,
          status: 'error',
          error: err.message,
        });
        out.info(command, chalk.red(`           failed: ${err.message}`));
        auditLog('ingest', 'error', { title: track.metadata.title, error: err.message });
      }
    }

    const summary = {
      total: tracksWithAudio.length,
      succeeded,
      failed,
      skipped_no_audio: tracksMissing.length,
      results,
    };

    auditLog('ingest', 'complete', { total: tracksWithAudio.length, succeeded, failed });

    out.info(command, '');
    out.success(command, summary, (d) => {
      console.log(chalk.bold(
        `\n  Ingest complete: ${chalk.green(d.succeeded + ' registered')}, ` +
        `${d.failed > 0 ? chalk.red(d.failed + ' failed') : chalk.dim('0 failed')}` +
        `${d.skipped_no_audio > 0 ? chalk.yellow(', ' + d.skipped_no_audio + ' skipped (no audio)') : ''}\n`
      ));
    });

    if (failed > 0) process.exit(1);
  });

module.exports = cmd;
