'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const AUDIT_DIR = path.join(os.homedir(), '.orbit');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.log');

// Max audit file size before rotation (5MB)
const MAX_AUDIT_SIZE = 5 * 1024 * 1024;

/**
 * Append an entry to the local audit log.
 * The audit log is append-only and records every CLI operation.
 * This provides traceability for what an agent or user has done.
 * 
 * The log is NOT a security boundary — the real audit trail is server-side
 * in the append-only ledger. This is for local debugging and accountability.
 */
function auditLog(command, action, details = {}) {
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
      try {
        fs.chmodSync(AUDIT_DIR, 0o700);
      } catch {
        void 0;
      }
    }

    // Rotate if file is too large
    if (fs.existsSync(AUDIT_FILE)) {
      const stats = fs.statSync(AUDIT_FILE);
      if (stats.size > MAX_AUDIT_SIZE) {
        const rotated = AUDIT_FILE + '.' + Date.now();
        fs.renameSync(AUDIT_FILE, rotated);
      }
    }

    // Scrub sensitive fields
    const safeDetails = { ...details };
    delete safeDetails.privateKey;
    delete safeDetails.private_key;
    delete safeDetails.apiKey;
    delete safeDetails.api_key;
    delete safeDetails.signature;

    const entry = {
      timestamp: new Date().toISOString(),
      command,
      action,
      pid: process.pid,
      ...safeDetails,
    };

    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', {
      encoding: 'utf8',
      mode: 0o600
    });
    try {
      fs.chmodSync(AUDIT_FILE, 0o600);
    } catch {
      void 0;
    }
  } catch {
    // Audit logging should never crash the CLI
  }
}

/**
 * Read recent audit log entries.
 * @param {number} limit - Max entries to return (from end of file)
 * @returns {Array<Object>} Parsed audit entries
 */
function readAuditLog(limit = 50) {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const content = fs.readFileSync(AUDIT_FILE, 'utf8').trim();
    if (!content) return [];

    const lines = content.split('\n');
    const recent = lines.slice(-limit);
    return recent.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { auditLog, readAuditLog, AUDIT_FILE };
