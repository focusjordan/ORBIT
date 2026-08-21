'use strict';

const { Command } = require('commander');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { loadConfig, GLOBAL_CONFIG_PATH, findLocalConfig } = require('../config');
const out = require('../output');

/**
 * Resolve python executable path (checking local .venv up the tree)
 */
function resolvePython() {
  if (process.env.ORBIT_PYTHON_PATH) return process.env.ORBIT_PYTHON_PATH;
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const unixVenv = path.join(dir, '.venv', 'bin', 'python3');
    const winVenv = path.join(dir, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(unixVenv)) return unixVenv;
    if (fs.existsSync(winVenv)) return winVenv;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Safe binary check without shell interpolation
 */
function checkBinary(binName, args = ['-version']) {
  try {
    const output = execFileSync(binName, args, {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const firstLine = output.split('\n')[0].trim();
    return { available: true, version: firstLine };
  } catch (err) {
    return { available: false, error: err.code || err.message };
  }
}

const cmd = new Command('doctor')
  .description('Run system health checks and diagnose environment configuration')
  .action(async (opts, command) => {
    out.header(command, 'ORBIT System Health Check (Doctor)');
    out.progress(command, 'Inspecting runtime, tools, and connectivity');

    const report = {
      timestamp: new Date().toISOString(),
      node: {
        version: process.version,
        platform: `${process.platform} (${process.arch})`,
        healthy: parseInt(process.version.slice(1).split('.')[0], 10) >= 18,
      },
      config: {
        globalPath: GLOBAL_CONFIG_PATH,
        globalExists: fs.existsSync(GLOBAL_CONFIG_PATH),
        localPath: findLocalConfig(),
        localExists: !!findLocalConfig(),
        platformIdConfigured: false,
        privateKeyConfigured: false,
        securePermissions: true,
      },
      tools: {
        ffmpeg: checkBinary('ffmpeg', ['-version']),
        fpcalc: checkBinary('fpcalc', ['-v']),
      },
      python: {
        path: resolvePython(),
        available: false,
        version: null,
        torch: null,
        gpuAcceleration: null,
      },
      server: {
        url: null,
        reachable: false,
        latencyMs: null,
        protocol: null,
        version: null,
      },
    };

    // 1. Check Config & Permissions
    const conf = loadConfig();
    report.config.platformIdConfigured = !!conf.platformId;
    report.config.privateKeyConfigured = !!conf.privateKey;
    report.server.url = conf.apiUrl;

    if (process.platform !== 'win32') {
      if (report.config.globalExists) {
        try {
          const stat = fs.statSync(GLOBAL_CONFIG_PATH);
          if ((stat.mode & 0o777) !== 0o600) report.config.securePermissions = false;
        } catch {
          void 0;
        }
      }
      if (report.config.localExists) {
        try {
          const stat = fs.statSync(report.config.localPath);
          if ((stat.mode & 0o777) !== 0o600) report.config.securePermissions = false;
        } catch {
          void 0;
        }
      }
    }

    // 2. Check Python & PyTorch
    try {
      const pyVer = execFileSync(report.python.path, ['--version'], {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      report.python.available = true;
      report.python.version = pyVer;

      const pyCheckCode = `
import sys
try:
    import torch
    cuda = torch.cuda.is_available()
    mps = hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()
    gpu = 'CUDA' if cuda else ('Apple Silicon Metal/MPS' if mps else 'CPU only')
    print(f"{torch.__version__}|{gpu}")
except Exception as e:
    print(f"NOT_FOUND|{e}")
`;
      const pyOut = execFileSync(report.python.path, ['-c', pyCheckCode], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();

      const [torchVer, gpuType] = pyOut.split('|');
      if (torchVer && torchVer !== 'NOT_FOUND') {
        report.python.torch = torchVer;
        report.python.gpuAcceleration = gpuType;
      }
    } catch {
      report.python.available = false;
    }

    // 3. Check Server Connectivity
    const startTime = Date.now();
    try {
      const res = await fetch(`${conf.apiUrl}/orbit/v1/info`, {
        signal: AbortSignal.timeout(3000),
      });
      report.server.latencyMs = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json();
        report.server.reachable = true;
        report.server.protocol = data.data?.protocol || data.protocol || 'ORBIT';
        report.server.version = data.data?.version || data.version || 'unknown';
      }
    } catch {
      report.server.reachable = false;
    }

    out.clearProgress(command);

    out.success(command, report, (d) => {
      console.log();
      console.log(chalk.bold.underline('  Runtime Environment'));
      const nodeStatus = d.node.healthy ? chalk.green('✔') : chalk.red('✖');
      console.log(`    ${nodeStatus} Node.js:               ${d.node.version} ${chalk.dim(`(${d.node.platform})`)}`);

      console.log();
      console.log(chalk.bold.underline('  Security & Credentials'));
      const permStatus = d.config.securePermissions ? chalk.green('✔') : chalk.yellow('⚠');
      const credStatus = (d.config.platformIdConfigured && d.config.privateKeyConfigured) ? chalk.green('✔') : chalk.yellow('⚠');
      console.log(`    ${permStatus} Permissions:          ${d.config.securePermissions ? chalk.green('Owner only (0o600)') : chalk.yellow('Insecure (Run orbit init to fix)')}`);
      console.log(`    ${credStatus} Platform Credentials: ${d.config.platformIdConfigured ? chalk.green('Configured') : chalk.yellow('Missing (Run orbit init)')}`);

      console.log();
      console.log(chalk.bold.underline('  External Audio Binaries'));
      const ffmpegStatus = d.tools.ffmpeg.available ? chalk.green('✔') : chalk.yellow('⚠');
      const fpcalcStatus = d.tools.fpcalc.available ? chalk.green('✔') : chalk.yellow('⚠');
      console.log(`    ${ffmpegStatus} FFmpeg:               ${d.tools.ffmpeg.available ? chalk.green(d.tools.ffmpeg.version.slice(0, 30)) : chalk.yellow('Not found on PATH (Audio transcoding limited)')}`);
      console.log(`    ${fpcalcStatus} Chromaprint (fpcalc): ${d.tools.fpcalc.available ? chalk.green(d.tools.fpcalc.version.slice(0, 30)) : chalk.yellow('Not found on PATH (Exact fingerprinting limited)')}`);

      console.log();
      console.log(chalk.bold.underline('  Python ML Subsystem'));
      if (d.python.available) {
        console.log(`    ${chalk.green('✔')} Python Runtime:       ${d.python.version} ${chalk.dim(`(${path.basename(path.dirname(d.python.path))})`)}`);
        if (d.python.torch) {
          console.log(`    ${chalk.green('✔')} PyTorch:              v${d.python.torch} ${chalk.dim(`(Hardware: ${d.python.gpuAcceleration})`)}`);
        } else {
          console.log(`    ${chalk.yellow('⚠')} PyTorch:              ${chalk.yellow('PyTorch not installed in environment')}`);
        }
      } else {
        console.log(`    ${chalk.yellow('⚠')} Python Runtime:       ${chalk.yellow('Python virtual environment not found')}`);
      }

      console.log();
      console.log(chalk.bold.underline('  Ledger API Server'));
      if (d.server.reachable) {
        console.log(`    ${chalk.green('✔')} Endpoint:             ${d.server.url} ${chalk.green(`(${d.server.protocol} v${d.server.version}, ${d.server.latencyMs}ms)`)}`);
      } else {
        console.log(`    ${chalk.yellow('⚠')} Endpoint:             ${d.server.url} ${chalk.dim('(Server unreachable — offline mode)')}`);
      }

      console.log();
      const allGreen = d.node.healthy && d.config.securePermissions && d.tools.ffmpeg.available && d.tools.fpcalc.available;
      if (allGreen) {
        console.log(chalk.green.bold('  ✅ System is healthy and ready for ORBIT operations.\n'));
      } else {
        console.log(chalk.yellow('  ℹ Notice: Some optional tools are missing or server is offline.'));
        console.log(chalk.dim('     Run `orbit init` to configure credentials or `npm run dev` to start server.\n'));
      }
    });
  });

module.exports = cmd;
