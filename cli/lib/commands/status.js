'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const { loadConfig } = require('../config');
const out = require('../output');

const cmd = new Command('status')
  .description('Check server connectivity and display current configuration')
  .action(async (opts, command) => {
    const conf = loadConfig();

    out.header(command, 'ORBIT Status');
    out.field(command, 'Server', conf.apiUrl);
    out.field(command, 'Platform', conf.platformId || chalk.yellow('(not set)'));
    out.field(command, 'Private Key', conf.privateKey ? chalk.green('configured') : chalk.yellow('(not set)'));
    out.field(command, 'API Key', conf.apiKey ? chalk.green('configured') : chalk.dim('(not set)'));

    out.info(command, '');
    out.progress(command, 'Checking server connectivity');

    try {
      const url = `${conf.apiUrl}/orbit/v1/info`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      out.clearProgress(command);

      if (!response.ok) {
        out.fail(command, `Server returned HTTP ${response.status}`, null, 1);
        return;
      }

      const data = await response.json();

      out.success(command, {
        connected: true,
        server: conf.apiUrl,
        platform: conf.platformId,
        protocol: data.data?.protocol || data.protocol,
        version: data.data?.version || data.version,
        endpoints: (data.data?.endpoints || data.endpoints || []).length,
        credentialsConfigured: !!(conf.platformId && conf.privateKey),
      }, (result) => {
        out.field(command, 'Connection', chalk.green('OK'));
        out.field(command, 'Protocol', result.protocol || 'ORBIT');
        out.field(command, 'Version', result.version || 'unknown');
        out.field(command, 'Endpoints', String(result.endpoints));
        console.log();
        if (!result.credentialsConfigured) {
          console.log(chalk.yellow('  Credentials not fully configured. Run `orbit init` to set up.\n'));
        }
      });
    } catch (err) {
      out.clearProgress(command);
      const detail = err.code === 'ECONNREFUSED'
        ? `Cannot connect to ${conf.apiUrl}. Is the server running?`
        : err.message;
      out.fail(command, 'Server unreachable', detail, 1);
    }
  });

module.exports = cmd;
