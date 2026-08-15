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
 * Print an error and exit. In JSON mode, emits { error, details } to stderr.
 */
function fail(cmd, message, details, exitCode = 1) {
  const f = flags(cmd);
  if (f.json) {
    process.stderr.write(JSON.stringify({ error: message, details: details || undefined }, null, 2) + '\n');
  } else {
    console.error(chalk.red.bold('Error:'), message);
    if (details) console.error(chalk.dim(details));
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
  console.log(chalk.bold.cyan(text));
  console.log(chalk.dim('─'.repeat(Math.min(text.length + 4, 60))));
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
  process.stdout.write(chalk.dim(`  ${message}...\r`));
}

/**
 * Clear the progress line.
 */
function clearProgress(cmd) {
  const f = flags(cmd);
  if (f.quiet || f.json) return;
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
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
};
