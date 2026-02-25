'use strict';

const { Command } = require('commander');
const readline = require('readline');
const chalk = require('chalk');
const { loadConfig, writeConfig, GLOBAL_CONFIG_PATH } = require('../config');
const out = require('../output');

function prompt(rl, question, defaultValue) {
  const suffix = defaultValue ? chalk.dim(` [${defaultValue}]`) : '';
  return new Promise(resolve => {
    rl.question(`  ${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

const cmd = new Command('init')
  .description('Configure ORBIT CLI credentials and server URL')
  .option('--global', 'write to global ~/.orbitrc (default)')
  .option('--local', 'write to project-local .orbit/config.json')
  .option('--api-url <url>', 'ORBIT server URL')
  .option('--platform-id <id>', 'your platform ID')
  .option('--private-key <base64>', 'Ed25519 private key (base64)')
  .option('--api-key <key>', 'optional API key')
  .action(async (opts, command) => {
    const scope = opts.local ? 'local' : 'global';
    const existing = loadConfig();

    // Non-interactive mode when all required flags are provided
    if (opts.apiUrl && opts.platformId && opts.privateKey) {
      const data = {
        apiUrl: opts.apiUrl,
        platformId: opts.platformId,
        privateKey: opts.privateKey,
      };
      if (opts.apiKey) data.apiKey = opts.apiKey;
      const filePath = writeConfig(scope, data);
      out.success(command, { configured: true, scope, path: filePath }, () => {
        console.log(chalk.green.bold('\n  ORBIT configured successfully.'));
        console.log(chalk.dim(`  Config written to ${filePath}\n`));
      });
      return;
    }

    // Interactive mode
    out.header(command, 'ORBIT CLI Setup');
    out.info(command, chalk.dim('  Press Enter to keep existing values.\n'));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      const apiUrl = await prompt(rl, 'Server URL', existing.apiUrl || 'http://localhost:4000');
      const platformId = await prompt(rl, 'Platform ID', existing.platformId);
      const privateKey = await prompt(rl, 'Private Key (base64)', existing.privateKey ? '••••••••' : '');
      const apiKey = await prompt(rl, 'API Key (optional)', existing.apiKey);

      const data = { apiUrl, platformId };
      // Only overwrite private key if user entered a real value
      if (privateKey && privateKey !== '••••••••') {
        data.privateKey = privateKey;
      }
      if (apiKey) data.apiKey = apiKey;

      const filePath = writeConfig(scope, data);

      console.log();
      console.log(chalk.green.bold('  ORBIT configured successfully.'));
      console.log(chalk.dim(`  Config written to ${filePath}`));
      console.log(chalk.dim(`  Run ${chalk.white('orbit status')} to verify connectivity.\n`));
    } finally {
      rl.close();
    }
  });

module.exports = cmd;
