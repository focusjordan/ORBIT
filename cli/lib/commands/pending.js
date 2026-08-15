'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('pending')
  .description('List pending inbound transfers waiting for your acceptance')
  .action(async (opts, command) => {
    out.header(command, 'ORBIT Pending Transfers');
    out.progress(command, 'Checking for pending transfers');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    try {
      const result = await client.listPendingTransfers();
      out.clearProgress(command);

      const data = result.data || result;
      const transfers = data.transfers || [];

      out.success(command, data, (d) => {
        out.field(command, 'Platform', d.platform || client.platformId);
        out.field(command, 'Pending', String(d.total || 0), d.total > 0 ? 'yellow' : 'green');

        if (transfers.length === 0) {
          console.log(chalk.dim('\n  No pending transfers.\n'));
          return;
        }

        const columns = [
          { key: 'id', label: 'Transfer ID' },
          { key: 'reg_id', label: 'Reg ID' },
          { key: 'from', label: 'From' },
          { key: 'initiated', label: 'Initiated' },
          { key: 'expires', label: 'Expires' },
        ];

        const rows = transfers.map(t => ({
          id: String(t.transfer_id || t.id || '?'),
          reg_id: String(t.registration_id || '?'),
          from: t.from_platform || '?',
          initiated: t.initiated_at
            ? new Date(t.initiated_at).toISOString().slice(0, 16).replace('T', ' ')
            : '?',
          expires: t.expires_at
            ? new Date(t.expires_at).toISOString().slice(0, 16).replace('T', ' ')
            : '?',
        }));

        out.table(command, rows, columns);

        console.log(chalk.dim(`  Accept a transfer with: orbit accept <transfer-id>\n`));
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Failed to list pending transfers: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
