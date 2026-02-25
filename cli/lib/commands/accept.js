'use strict';

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('accept')
  .description('Accept an incoming B2B transfer from another platform')
  .argument('<transfer-id>', 'transfer ID to accept')
  .option('--output <path>', 'output path for re-watermarked audio')
  .action(async (transferId, opts, command) => {
    const txId = parseInt(transferId, 10);
    if (isNaN(txId)) {
      out.fail(command, 'transfer-id must be a number');
    }

    out.header(command, 'ORBIT Accept Transfer');
    out.progress(command, 'Accepting transfer');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    try {
      const result = await client.acceptTransfer(txId);
      out.clearProgress(command);

      const data = result.data || result;

      let savedPath = null;
      if (data.watermarked_audio) {
        savedPath = opts.output || `transfer-${txId}.orbit.wav`;
        const audioData = Buffer.isBuffer(data.watermarked_audio)
          ? data.watermarked_audio
          : Buffer.from(data.watermarked_audio, 'base64');
        fs.writeFileSync(savedPath, audioData);
      }

      const output = {
        success: true,
        accepted: true,
        transfer_id: txId,
        new_registration_id: data.new_registration_id,
        watermarked_file: savedPath,
        chain_length: data.full_chain ? data.full_chain.length : null,
      };

      out.success(command, output, (d) => {
        console.log(chalk.green.bold('\n  Transfer accepted.\n'));
        out.field(command, 'Transfer ID', String(d.transfer_id));
        out.field(command, 'New Registration', String(d.new_registration_id), 'cyan');
        if (d.watermarked_file) {
          out.field(command, 'Watermarked File', d.watermarked_file, 'green');
        }
        if (d.chain_length) {
          out.field(command, 'Chain Length', String(d.chain_length));
        }
        console.log();
      });
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, `Accept failed: ${err.message}`, err.details);
    }
  });

module.exports = cmd;
