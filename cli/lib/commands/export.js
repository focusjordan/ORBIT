'use strict';

const { Command } = require('commander');
const fs = require('fs');
const chalk = require('chalk');
const { buildClient } = require('../config');
const out = require('../output');

const cmd = new Command('export')
  .description('Export a provenance certificate for a registration')
  .argument('<fingerprint>', '64-character hex fingerprint hash')
  .option('--output <file>', 'write certificate to file (default: stdout in JSON mode)')
  .option('--format <fmt>', 'output format: json or text (default: text)', 'text')
  .action(async (fingerprint, opts, command) => {
    if (!/^[0-9a-fA-F]{64}$/.test(fingerprint)) {
      out.fail(command, 'Fingerprint must be a 64-character hex string');
    }

    out.progress(command, 'Generating provenance certificate');

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
      const registrations = data.registrations || [];
      const transfers = data.transfers || [];

      if (registrations.length === 0) {
        out.fail(command, 'No registrations found for this fingerprint', null, 2);
      }

      const primary = registrations[0];
      const certificate = {
        certificate_type: 'ORBIT Provenance Certificate',
        generated_at: new Date().toISOString(),
        generated_by: client.platformId,
        fingerprint_hash: fingerprint,
        origin: {
          registration_id: primary.registration_id,
          platform: primary.platform,
          owner_id: primary.owner_id,
          timestamp: primary.timestamp || primary.registered_at,
          signature_valid: primary.signature_valid,
        },
        metadata: primary.metadata || {},
        chain_summary: {
          total_registrations: registrations.length,
          total_transfers: transfers.length,
          platforms_involved: [...new Set([
            ...registrations.map(r => r.platform),
            ...transfers.map(t => t.from_platform),
            ...transfers.map(t => t.to_platform),
          ].filter(Boolean))],
        },
        chain_integrity: data.chain_integrity || null,
        full_chain: {
          registrations,
          transfers,
        },
      };

      if (opts.output) {
        const content = opts.format === 'text'
          ? formatTextCertificate(certificate)
          : JSON.stringify(certificate, null, 2);
        fs.writeFileSync(opts.output, content + '\n', 'utf8');
        out.info(command, chalk.green(`\n  Certificate written to ${opts.output}\n`));
      }

      out.success(command, certificate, (cert) => {
        if (!opts.output) {
          if (opts.format === 'json') {
            console.log(JSON.stringify(cert, null, 2));
          } else {
            console.log(formatTextCertificate(cert));
          }
        }
      });
    } catch (err) {
      out.clearProgress(command);
      if (err.status === 404) {
        out.fail(command, 'Fingerprint not found in ORBIT ledger', null, 2);
      } else {
        out.fail(command, `Export failed: ${err.message}`, err.details);
      }
    }
  });

function formatTextCertificate(cert) {
  const lines = [];
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║             ORBIT PROVENANCE CERTIFICATE                    ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  Generated:       ${cert.generated_at}`);
  lines.push(`  Fingerprint:     ${cert.fingerprint_hash}`);
  lines.push('');
  lines.push('  ── Origin ──────────────────────────────────────────────────');
  lines.push(`  Registration ID: ${cert.origin.registration_id}`);
  lines.push(`  Platform:        ${cert.origin.platform}`);
  lines.push(`  Owner:           ${cert.origin.owner_id}`);
  lines.push(`  Timestamp:       ${cert.origin.timestamp}`);
  lines.push(`  Signature Valid: ${cert.origin.signature_valid ? 'YES' : 'NO'}`);
  lines.push('');
  if (cert.metadata) {
    lines.push('  ── Metadata ────────────────────────────────────────────────');
    if (cert.metadata.title) lines.push(`  Title:           ${cert.metadata.title}`);
    if (cert.metadata.artist) lines.push(`  Artist:          ${cert.metadata.artist}`);
    if (cert.metadata.isrc) lines.push(`  ISRC:            ${cert.metadata.isrc}`);
    if (cert.metadata.primary_genre) lines.push(`  Genre:           ${cert.metadata.primary_genre}`);
    if (cert.metadata.album_title) lines.push(`  Album:           ${cert.metadata.album_title}`);
    if (cert.metadata.label) lines.push(`  Label:           ${cert.metadata.label}`);
    lines.push('');
  }
  lines.push('  ── Chain Summary ───────────────────────────────────────────');
  lines.push(`  Registrations:   ${cert.chain_summary.total_registrations}`);
  lines.push(`  Transfers:       ${cert.chain_summary.total_transfers}`);
  lines.push(`  Platforms:       ${cert.chain_summary.platforms_involved.join(', ')}`);
  if (cert.chain_integrity) {
    lines.push(`  Integrity:       ${cert.chain_integrity.all_signatures_valid ? 'ALL VALID' : 'CHECK REQUIRED'}`);
  }
  lines.push('');
  lines.push('  ────────────────────────────────────────────────────────────');
  lines.push('  This certificate was generated by the ORBIT protocol.');
  lines.push('  Verify at: orbit verify <audio-file>');
  lines.push('');
  return lines.join('\n');
}

module.exports = cmd;
