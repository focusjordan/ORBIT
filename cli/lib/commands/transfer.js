'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('transfer')
  .description('Initiate a B2B transfer of a registration to another platform')
  .argument('<registration-id>', 'registration ID to transfer')
  .requiredOption('--to <platform-id>', 'recipient platform ID')
  .action(async (registrationId, opts, command) => {
    const regId = parseInt(registrationId, 10);
    if (isNaN(regId)) {
      out.fail(command, 'registration-id must be a number');
    }

    out.header(command, 'ORBIT Transfer');
    out.progress(command, 'Initiating transfer');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    try {
      const result = await client.transfer(regId, opts.to);
      out.clearProgress(command);

      const data = result.data || result;

      const output = {
        success: true,
        transfer_id: data.transfer_id,
        status: data.status,
        from_platform: client.platformId,
        to_platform: opts.to,
        registration_id: regId,
        expires_at: data.expires_at || null,
        recipient_notified: data.recipient_notified || false,
      };

      out.success(command, output, (d) => {
        console.log(chalk.green.bold('\n  Transfer initiated.\n'));
        out.field(command, 'Transfer ID', String(d.transfer_id), 'cyan');
        out.field(command, 'Status', d.status || 'pending', 'yellow');
        out.field(command, 'From', d.from_platform);
        out.field(command, 'To', d.to_platform);
        out.field(command, 'Registration', String(d.registration_id));
        if (d.expires_at) out.field(command, 'Expires', d.expires_at);
        console.log();
        console.log(chalk.dim(`  Recipient can accept with: orbit accept ${d.transfer_id}\n`));
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Transfer failed: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
