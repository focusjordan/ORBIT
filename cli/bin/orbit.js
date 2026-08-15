#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

program
  .name('orbit')
  .version(pkg.version, '-v, --version')
  .description('ORBIT — Origin-Based Identity & Rights Transfer Protocol\nRegister, verify, transfer, and analyze audio provenance.')
  .option('--json', 'output results as JSON (agent-friendly)')
  .option('--quiet', 'suppress non-essential output');

// Setup & identity
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
