'use strict';

const { Command } = require('commander');
const nacl = require('tweetnacl');
const chalk = require('chalk');
const out = require('../output');
const { writeConfig } = require('../config');

const cmd = new Command('keygen')
  .description('Generate a new Ed25519 keypair for ORBIT platform authentication')
  .option('--save', 'save the private key to your ORBIT config')
  .option('--global', 'when used with --save, write to global config')
  .option('--local', 'when used with --save, write to project-local config')
  .action((opts, command) => {
    const keypair = nacl.sign.keyPair();
    const publicKeyB64 = Buffer.from(keypair.publicKey).toString('base64');
    const privateKeyB64 = Buffer.from(keypair.secretKey).toString('base64');

    const result = {
      publicKey: publicKeyB64,
      privateKey: privateKeyB64,
    };

    if (opts.save) {
      const scope = opts.local ? 'local' : 'global';
      writeConfig(scope, { privateKey: privateKeyB64 });
    }

    out.success(command, result, (data) => {
      out.header(command, 'ORBIT Keypair Generated');
      out.field(command, 'Public Key', data.publicKey, 'green');
      out.field(command, 'Private Key', data.privateKey, 'yellow');
      console.log();
      console.log(chalk.dim('  Store these securely. The private key cannot be recovered.'));
      console.log(chalk.dim('  Send your public key to Ohnrshyp to register your platform'));
      console.log(chalk.dim('  and receive your API key.'));
      if (opts.save) {
        console.log(chalk.dim(`  Private key saved to config (${opts.local ? 'local' : 'global'}).`));
      }
      console.log();
    });
  });

module.exports = cmd;
