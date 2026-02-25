'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('list')
  .description('List registrations for your platform')
  .option('--limit <n>', 'max results (1-100, default 50)', parseInt)
  .option('--offset <n>', 'pagination offset (default 0)', parseInt)
  .action(async (opts, command) => {
    out.header(command, 'ORBIT Registrations');
    out.progress(command, 'Loading registrations');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    const options = {};
    if (opts.limit != null) options.limit = opts.limit;
    if (opts.offset != null) options.offset = opts.offset;

    try {
      const result = await client.listRegistrations(options);
      out.clearProgress(command);

      const data = result.data || result;
      const registrations = data.registrations || [];

      out.success(command, data, (d) => {
        out.field(command, 'Platform', d.platform || client.platformId);
        out.field(command, 'Total', String(d.total || 0), 'cyan');
        out.field(command, 'Showing', `${registrations.length} (offset ${d.offset || 0})`);

        if (registrations.length === 0) {
          console.log(chalk.dim('\n  No registrations found.\n'));
          return;
        }

        const columns = [
          { key: 'id', label: 'ID' },
          { key: 'title', label: 'Title' },
          { key: 'artist', label: 'Artist' },
          { key: 'genre', label: 'Genre' },
          { key: 'isrc', label: 'ISRC' },
          { key: 'registered_at', label: 'Registered' },
        ];

        const rows = registrations.map(r => ({
          id: String(r.registration_id || r.id || '?'),
          title: (r.title || '?').slice(0, 30),
          artist: (r.artist || '?').slice(0, 20),
          genre: (r.primary_genre || '-').slice(0, 15),
          isrc: r.isrc || '-',
          registered_at: r.registered_at
            ? new Date(r.registered_at).toISOString().slice(0, 10)
            : '?',
        }));

        out.table(command, rows, columns);
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Failed to list registrations: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
