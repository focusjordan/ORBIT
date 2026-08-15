'use strict';

const chalk = require('chalk');

/**
 * Resolve whether --json or --quiet is active from the root program options.
 */
function flags(cmd) {
  const root = cmd.parent ? cmd.parent : cmd;
  const opts = root.opts ? root.opts() : {};
  return {
    json: !!opts.json,
    quiet: !!opts.quiet,
  };
}

/**
 * Print a success result. In JSON mode, emits structured JSON to stdout.
 * In human mode, prints formatted output.
 */
function success(cmd, data, humanFormatter) {
  const f = flags(cmd);
  if (f.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }
  if (humanFormatter) {
    humanFormatter(data);
  } else {
    console.log(data);
  }
}

/**
 * Print an error and exit. In JSON mode, emits { error, details, hint } to stderr.
 * In human mode, prints formatted diagnostics with actionable hints.
 */
function fail(cmd, message, details, exitCode = 1, hint = null) {
  clearProgress(cmd);
  const f = flags(cmd);

  // Auto-deduce helpful hints for common error patterns if not explicitly provided
  let deducedHint = hint;
  if (!deducedHint) {
    const combined = `${message} ${details || ''}`;
    if (combined.includes('ECONNREFUSED') || combined.includes('fetch failed') || combined.includes('Server unreachable')) {
      deducedHint = "Ensure the ORBIT server is running (e.g. 'npm run dev') or run 'orbit doctor' to inspect connectivity.";
    } else if (combined.includes('No platform ID') || combined.includes('No private key') || combined.includes('not configured')) {
      deducedHint = "Run 'orbit init' to configure your platform credentials, or set ORBIT_PLATFORM_ID and ORBIT_PRIVATE_KEY.";
    } else if (combined.includes('File not found') || combined.includes('Not a directory')) {
      deducedHint = "Check that the path is spelled correctly and accessible from the current directory.";
    } else if (combined.includes('Fingerprint must be')) {
      deducedHint = "ORBIT fingerprints are 64-character hexadecimal SHA-256 / Chromaprint hashes.";
    }
  }

  if (f.json) {
    process.stderr.write(JSON.stringify({
      error: message,
      details: details || undefined,
      hint: deducedHint || undefined,
    }, null, 2) + '\n');
  } else {
    console.error();
    console.error(`  ${chalk.red.bold('✖ Error:')} ${chalk.red(message)}`);
    if (details) {
      console.error(`  ${chalk.dim('Details:')} ${chalk.dim(details)}`);
    }
    if (deducedHint) {
      console.error(`  ${chalk.cyan.bold('💡 Hint:')}    ${chalk.cyan(deducedHint)}`);
    }
    console.error();
  }
  process.exit(exitCode);
}

/**
 * Print an informational line (suppressed in --quiet mode).
 */
function info(cmd, ...args) {
  const f = flags(cmd);
  if (f.quiet || f.json) return;
  console.log(...args);
}

/**
 * Print a styled header banner.
 */
function header(cmd, text) {
  const f = flags(cmd);
  if (f.quiet || f.json) return;
  console.log();
  console.log(chalk.bold.cyan(`  ${text}`));
  console.log(chalk.dim(`  ${'─'.repeat(Math.max(text.length + 4, 45))}`));
}

/**
 * Print a key-value pair with label alignment.
 */
function field(cmd, label, value, color) {
  const f = flags(cmd);
  if (f.quiet || f.json) return;
  const colorFn = color ? chalk[color] || chalk.white : chalk.white;
  console.log(`  ${chalk.dim(label.padEnd(20))} ${colorFn(value)}`);
}

/**
 * Render a visual ANSI meter bar for confidence or score (e.g. [████████░░] 80.0%).
 */
function confidenceBar(score, width = 12) {
  if (score == null || isNaN(score)) return chalk.dim('[──────────] N/A');
  const clamped = Math.max(0, Math.min(1, score));
  const filledCount = Math.round(clamped * width);
  const emptyCount = width - filledCount;
  const filled = '█'.repeat(filledCount);
  const empty = '░'.repeat(emptyCount);
  const pct = (clamped * 100).toFixed(1).padStart(5, ' ') + '%';

  let color = 'green';
  if (clamped < 0.4) color = 'red';
  else if (clamped < 0.7) color = 'yellow';

  return `${chalk[color](`[${filled}${empty}]`)} ${chalk.bold(pct)}`;
}

/**
 * Print a simple table from an array of objects.
 */
function table(cmd, rows, columns) {
  const f = flags(cmd);
  if (f.json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    return;
  }
  if (f.quiet) return;

  const widths = {};
  for (const col of columns) {
    widths[col.key] = col.label.length;
    for (const row of rows) {
      const val = String(row[col.key] ?? '');
      if (val.length > widths[col.key]) widths[col.key] = val.length;
    }
  }

  const headerLine = columns.map(c => chalk.bold(c.label.padEnd(widths[c.key]))).join('  ');
  const separator = columns.map(c => chalk.dim('─'.repeat(widths[c.key]))).join('  ');

  console.log();
  console.log('  ' + headerLine);
  console.log('  ' + separator);
  for (const row of rows) {
    const line = columns.map(c => {
      const val = String(row[c.key] ?? '');
      return val.padEnd(widths[c.key]);
    }).join('  ');
    console.log('  ' + line);
  }
  console.log();
}

/**
 * Print a progress/spinner message (suppressed in json/quiet mode).
 */
function progress(cmd, message) {
  const f = flags(cmd);
  if (f.quiet || f.json) return;
  process.stdout.write(chalk.dim(`  ⏳ ${message}...\r`));
}

/**
 * Clear the progress line completely.
 */
function clearProgress(cmd) {
  const f = flags(cmd);
  if (f.quiet || f.json) return;
  process.stdout.write('\r' + ' '.repeat(100) + '\r');
}

module.exports = {
  flags,
  success,
  fail,
  info,
  header,
  field,
  table,
  progress,
  clearProgress,
  confidenceBar,
};

