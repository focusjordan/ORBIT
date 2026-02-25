'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const out = require('../output');
const { readAuditLog, AUDIT_FILE } = require('../audit');

const cmd = new Command('audit')
  .description('View the local CLI audit log (what operations have been performed)')
  .option('--limit <n>', 'number of recent entries to show (default: 50)', parseInt, 50)
  .option('--clear', 'clear the audit log')
  .action((opts, command) => {
    if (opts.clear) {
      const fs = require('fs');
      if (fs.existsSync(AUDIT_FILE)) {
        fs.unlinkSync(AUDIT_FILE);
        out.info(command, chalk.dim('\n  Audit log cleared.\n'));
      } else {
        out.info(command, chalk.dim('\n  No audit log found.\n'));
      }
      return;
    }

    const entries = readAuditLog(opts.limit);

    out.success(command, { entries, total: entries.length, log_path: AUDIT_FILE }, (d) => {
      out.header(command, 'ORBIT Audit Log');
      out.field(command, 'Log File', AUDIT_FILE);
      out.field(command, 'Entries', String(d.total));

      if (d.total === 0) {
        console.log(chalk.dim('\n  No audit entries found.\n'));
        return;
      }

      console.log();
      for (const entry of entries) {
        const time = entry.timestamp
          ? entry.timestamp.slice(0, 19).replace('T', ' ')
          : '?';
        const cmd = entry.command || '?';
        const action = entry.action || '?';

        const detail = [];
        if (entry.file) detail.push(`file=${entry.file}`);
        if (entry.registration_id) detail.push(`reg=${entry.registration_id}`);
        if (entry.verified !== undefined) detail.push(`verified=${entry.verified}`);
        if (entry.recommendation) detail.push(`ai=${entry.recommendation}`);
        if (entry.error) detail.push(chalk.red(`error=${entry.error}`));
        if (entry.file_count) detail.push(`files=${entry.file_count}`);
        if (entry.reason) detail.push(`reason=${entry.reason}`);
        if (entry.total !== undefined && entry.command !== undefined) detail.push(`total=${entry.total}`);

        const detailStr = detail.length > 0 ? chalk.dim(` ${detail.join(', ')}`) : '';
        console.log(`  ${chalk.dim(time)}  ${chalk.cyan(cmd.padEnd(8))} ${action.padEnd(12)}${detailStr}`);
      }
      console.log();
    });
  });

module.exports = cmd;
