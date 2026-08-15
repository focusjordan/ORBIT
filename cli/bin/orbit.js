#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

program
  .name('orbit')
  .version(pkg.version, '-v, --version')
  .description('ORBIT — Origin-Based Identity & Rights Transfer Protocol\nRegister, verify, transfer, and analyze audio provenance.\nEngineered for high-throughput automation & agent workflows with full human ergonomics.')
  .option('--json', 'output results as JSON (agent-friendly)')
  .option('--quiet', 'suppress non-essential output')
  .addHelpText('after', `
Quickstart Examples:
  $ orbit doctor                                # Diagnose environment & dependency health
  $ orbit status                                # Inspect server & ledger connectivity
  $ orbit register track.wav                    # Smart registration (auto-infers title/artist)
  $ orbit verify track.orbit.wav                # Verify origin, watermark, and provenance
  $ orbit detect track.mp3                      # Multi-signal AI audio detection
  $ orbit batch ./audio-dir --command verify    # Bulk process an audio catalog
`);

// Setup, diagnostics & identity
program.addCommand(require('../lib/commands/doctor'));
program.addCommand(require('../lib/commands/init'));
program.addCommand(require('../lib/commands/keygen'));
program.addCommand(require('../lib/commands/status'));
program.addCommand(require('../lib/commands/whoami'));

// Core protocol (v1)
program.addCommand(require('../lib/commands/register'));
program.addCommand(require('../lib/commands/verify'));
program.addCommand(require('../lib/commands/transfer'));
program.addCommand(require('../lib/commands/accept'));
program.addCommand(require('../lib/commands/chain'));

// Platform management
program.addCommand(require('../lib/commands/list'));
program.addCommand(require('../lib/commands/pending'));
program.addCommand(require('../lib/commands/export'));

// AI / V2
program.addCommand(require('../lib/commands/analyze'));
program.addCommand(require('../lib/commands/similar'));
program.addCommand(require('../lib/commands/detect'));

// Automation & operations
program.addCommand(require('../lib/commands/batch'));
program.addCommand(require('../lib/commands/watch'));
program.addCommand(require('../lib/commands/audit'));
program.addCommand(require('../lib/commands/ingest'));

program.parse(process.argv);

