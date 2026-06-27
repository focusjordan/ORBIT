'use strict';

const { Command } = require('commander');
const chalk = require('chalk');
const { loadConfig } = require('../config');
const out = require('../output');

/**
 * Identity verification command.
 * Shows who the CLI is authenticated as WITHOUT exposing secrets.
 * An agent uses this to confirm context before operating.
 */
const cmd = new Command('whoami')
  .description('Show current authenticated identity (never exposes secrets)')
  .action(async (opts, command) => {
    const conf = loadConfig();

    const identity = {
      platform_id: conf.platformId || null,
      server: conf.apiUrl,
      has_private_key: !!conf.privateKey,
      has_api_key: !!conf.apiKey,
      authenticated: false,
      platform_name: null,
      tier: null,
    };

    if (!conf.platformId || !conf.privateKey) {
      out.success(command, identity, () => {
        out.header(command, 'ORBIT Identity');
        out.field(command, 'Platform', chalk.yellow('NOT CONFIGURED'));
        out.field(command, 'Server', conf.apiUrl);
        out.field(command, 'Private Key', chalk.yellow('missing'));
        console.log();
        console.log(chalk.yellow('  Run `orbit init` to configure credentials.\n'));
      });
      process.exit(2);
    }

    // Attempt to authenticate against the server
    out.progress(command, 'Verifying identity with server');

    try {
      // Use the auth-test endpoint to verify identity
      const url = `${conf.apiUrl}/orbit/v1/auth-test`;
      const nacl = require('tweetnacl');
      const cbor = require('cbor');

      const body = {};
      const bodyBuffer = cbor.encode(body);
      const privateKey = Buffer.from(conf.privateKey, 'base64');
      const signature = nacl.sign.detached(new Uint8Array(bodyBuffer), new Uint8Array(privateKey));

      const headers = {
        'Content-Type': 'application/cbor',
        'X-ORBIT-Platform': conf.platformId,
        'X-ORBIT-Signature': Buffer.from(signature).toString('base64'),
      };
      if (conf.apiKey) headers['X-ORBIT-API-Key'] = conf.apiKey;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyBuffer,
        signal: AbortSignal.timeout(5000),
      });

      out.clearProgress(command);

      if (response.ok) {
        const data = await response.json();
        const platformInfo = data.data?.platform || data.platform || {};

        identity.authenticated = true;
        identity.platform_name = platformInfo.name || null;
        identity.tier = platformInfo.tier || null;
      }
    } catch {
      out.clearProgress(command);
    }

    out.success(command, identity, (d) => {
      out.header(command, 'ORBIT Identity');
      out.field(command, 'Platform ID', d.platform_id, 'cyan');
      out.field(command, 'Server', d.server);
      out.field(command, 'Private Key', chalk.green('configured'));
      out.field(command, 'API Key', d.has_api_key ? chalk.green('configured') : chalk.dim('not set'));

      if (d.authenticated) {
        out.field(command, 'Auth Status', chalk.green('VERIFIED'));
        if (d.platform_name) out.field(command, 'Platform Name', d.platform_name);
        if (d.tier) out.field(command, 'Tier', d.tier);
      } else {
        out.field(command, 'Auth Status', chalk.yellow('could not verify (server unreachable?)'));
      }
      console.log();
    });
  });

module.exports = cmd;
