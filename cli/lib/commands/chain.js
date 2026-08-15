'use strict';

const { Command } = require('commander');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('chain')
  .description('Get the full custody chain for a fingerprint')
  .argument('<fingerprint>', '64-character hex fingerprint hash')
  .action(async (fingerprint, opts, command) => {
    if (!/^[0-9a-fA-F]{64}$/.test(fingerprint)) {
      out.fail(command, 'Fingerprint must be a 64-character hex string');
    }

    out.header(command, 'ORBIT Chain of Custody');
    out.progress(command, 'Looking up chain');

    let client;
    try {
      client = buildClient();
    } catch (err) {
      out.clearProgress(command);
      out.fail(command, err.message);
    }

    try {
      const result = await client.getChain(fingerprint);
      out.clearProgress(command);

      const data = result.data || result;

      const output = {
        fingerprint_hash: fingerprint,
        registrations: data.registrations || [],
        transfers: data.transfers || [],
        merkle_proof: data.merkle_proof || null,
      };

      out.success(command, output, (d) => {
        console.log();
        out.field(command, 'Fingerprint', fingerprint.slice(0, 16) + '...');
        out.field(command, 'Registrations', String(d.registrations.length), 'cyan');
        out.field(command, 'Transfers', String(d.transfers.length), 'cyan');

        if (d.registrations.length > 0) {
          const columns = [
            { key: 'id', label: 'ID' },
            { key: 'platform', label: 'Platform' },
            { key: 'title', label: 'Title' },
            { key: 'artist', label: 'Artist' },
            { key: 'registered_at', label: 'Registered' },
          ];

          const rows = d.registrations.map(r => ({
            id: r.id || r.registration_id || '?',
            platform: r.platform_id || r.origin?.platform || '?',
            title: r.metadata?.title || r.title || '?',
            artist: r.metadata?.artist || r.artist || '?',
            registered_at: r.registered_at || r.created_at || '?',
          }));

          out.table(command, rows, columns);
        }

        if (d.transfers.length > 0) {
          const txColumns = [
            { key: 'id', label: 'Transfer ID' },
            { key: 'from', label: 'From' },
            { key: 'to', label: 'To' },
            { key: 'status', label: 'Status' },
            { key: 'created_at', label: 'Date' },
          ];

          const txRows = d.transfers.map(t => ({
            id: t.id || t.transfer_id || '?',
            from: t.from_platform || '?',
            to: t.to_platform || '?',
            status: t.status || '?',
            created_at: t.created_at || '?',
          }));

          out.table(command, txRows, txColumns);
        }
      });
    } catch (err) {
      out.clearProgress(command);
      if (err.status === 404) {
        out.fail(command, 'Fingerprint not found in ORBIT ledger', null, 2);
      } else {
        out.fail(command, `Chain lookup failed: ${err.message}`, err.details);
      }
    }
  });

module.exports = cmd;
