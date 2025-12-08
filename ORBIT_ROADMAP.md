# ORBIT Implementation Roadmap

## For Humans & AI Agents

**Document Purpose**: Step-by-step implementation guide for building ORBIT from scratch  
**Created**: December 8, 2025  
**Complements**: `ORBIT_SPECIFICATION.md`, `ORBIT_ENHANCEMENTS.md`  

---

## Quick Reference

| Phase | Sessions | Focus | Status |
|-------|----------|-------|--------|
| Phase 0 | 1-2 | Project Setup | 🟡 In Progress |
| Phase 1 | 3-8 | Core Engines (v1) | ⬜ Not Started |
| Phase 2 | 9-14 | API Layer (v1) | ⬜ Not Started |
| Phase 3 | 15-17 | Ohnrshyp Integration | ⬜ Not Started |
| Phase 4 | 18-24 | Neural Enhancements (v2) | ⬜ Not Started |
| Phase 5 | 25-28 | Polish & SDK | ⬜ Not Started |

**Current Session**: Ready for Session 2  
**Last Commit**: `chore: initial project setup`  
**Last Updated**: December 8, 2025  
**Prerequisites Met**: ✅ Docker Desktop installed and running

---

## 🔗 Enhancement → Session Cross-Reference

This table maps `ORBIT_ENHANCEMENTS.md` sections to their implementing sessions.

| Enhancement Section | What It Adds | Implementing Session(s) | Supersedes |
|---------------------|--------------|------------------------|------------|
| §1 Neural Watermarking - SilentCipher | 99%+ extraction accuracy on compressed audio | Session 22 | Session 6-7 (spread spectrum becomes fallback) |
| §1 Neural Watermarking - WMCodec | Codec-aware fallback watermark | Session 23 | — (additive) |
| §2 Neural Fingerprinting (MERT) | Pitch/speed invariant matching, similarity search | Session 19 | Session 3-4 (Chromaprint becomes exact-match only) |
| §3 Zero-Shot CLAP Classification | Auto-extract genre, mood, instruments | Session 20 | — (new capability) |
| §3 Auto-Metadata Pipeline | BPM, key, combined AI metadata | Session 21 | — (new capability) |
| §4 Content Relationship Detection | Detect covers, remixes, mashups | Session 24 | — (new capability) |
| §5 Enhanced V2 Verify Response | Rich verification with AI metadata | Session 25 | Session 12 (v1 verify enhanced) |
| §7 `POST /orbit/v2/similar` | Find similar-sounding tracks | Session 26 | — (new endpoint) |
| §7 `POST /orbit/v2/analyze` | Standalone audio analysis | Session 26 | — (new endpoint) |

### ⚠️ V1 → V2 Upgrade Notes

When building these v1 sessions, keep implementations **minimal and modular** — they'll be enhanced or become fallbacks in v2:

| V1 Session | What to Build | V2 Fate | Implementation Guidance |
|------------|---------------|---------|------------------------|
| **Session 6-7** (Watermark) | Spread spectrum embed/extract | Becomes **fallback** when neural fails | Keep simple, ensure clean interface for swapping |
| **Session 3-4** (Fingerprint) | Chromaprint exact matching | Becomes **exact-match layer** under MERT | Don't over-optimize; MERT adds semantic layer |
| **Session 12** (Verify) | Basic verification response | **Enhanced** with AI metadata in v2 | Design response as extensible object |
| **Session 11** (Register) | Basic registration | **Enhanced** with auto-metadata in v2 | Make metadata injection pluggable |

---

## 🔄 Session Start Protocol

**Run this checklist at the beginning of every session:**

### For AI Agents

1. **Read these files in order:**
   - `ORBIT_ROADMAP.md` (this file) - Check current session and status
   - `ORBIT_SPECIFICATION.md` - Core architecture reference
   - `ORBIT_ENHANCEMENTS.md` - V2 ML enhancements (only if Session 18+)

2. **Check current state:**
   - Look at "Current Session" field above
   - Review the session's tasks and dependencies
   - Check if previous session's "Verify" step was completed

3. **Understand the codebase:**
   - List `src/` directory to see what exists
   - Read any files relevant to current session
   - Check `package.json` for installed dependencies

4. **Before writing code:**
   - Confirm with user which session we're working on
   - Verify all dependencies from previous sessions exist
   - Ask about any blockers or changes to requirements

### For Humans

1. **Update this file** with current session number
2. **Run `git status`** to see uncommitted work
3. **Run `npm test`** (if tests exist) to verify nothing is broken
4. **Tell the AI agent** which session you're on

---

## 📋 Session Tracking

Update this section as you complete sessions:

```
Session 1:  ✅ Complete
Session 2:  ⬜ Not Started
Session 3:  ⬜ Not Started
Session 4:  ⬜ Not Started
Session 5:  ⬜ Not Started
Session 6:  ⬜ Not Started
Session 7:  ⬜ Not Started
Session 8:  ⬜ Not Started
Session 9:  ⬜ Not Started
Session 10: ⬜ Not Started
Session 11: ⬜ Not Started
Session 12: ⬜ Not Started
Session 13: ⬜ Not Started
Session 14: ⬜ Not Started
Session 15: ⬜ Not Started
Session 16: ⬜ Not Started
Session 17: ⬜ Not Started
Session 18: ⬜ Not Started
Session 19: ⬜ Not Started
Session 20: ⬜ Not Started
Session 21: ⬜ Not Started
Session 22: ⬜ Not Started
Session 23: ⬜ Not Started
Session 24: ⬜ Not Started
Session 25: ⬜ Not Started
Session 26: ⬜ Not Started
Session 27: ⬜ Not Started
Session 28: ⬜ Not Started
```

**Status Legend:**
- ⬜ Not Started
- 🟡 In Progress
- ✅ Complete
- ⚠️ Complete with Issues (see notes)

---

## Phase 0: Project Foundation

### Session 1: Repository & Project Setup

**Goal**: Empty project with proper structure, ready for development

**Prerequisites**: None (this is the first session)

**Tasks**:
- [ ] Create GitHub repository (`orbit` or `orbit-protocol`)
- [ ] Clone locally and navigate to directory
- [ ] Initialize Node.js project: `npm init -y`
- [ ] Create folder structure (see below)
- [ ] Create `.gitignore` with Node defaults + `.env`
- [ ] Create `.env.example` with placeholder variables
- [ ] Install base dependencies
- [ ] Create minimal `src/index.js`
- [ ] Create `README.md` with project description
- [ ] Initial commit

**Folder Structure to Create**:
```
orbit/
├── src/
│   ├── index.js              # Express app entry point
│   ├── config/
│   │   └── .gitkeep
│   ├── engines/
│   │   └── .gitkeep
│   ├── api/
│   │   ├── handlers/
│   │   │   └── .gitkeep
│   │   ├── middleware/
│   │   │   └── .gitkeep
│   │   └── routes.js
│   ├── ledger/
│   │   └── .gitkeep
│   ├── ml/
│   │   └── .gitkeep
│   └── utils/
│       └── .gitkeep
├── tests/
│   ├── fixtures/
│   │   └── .gitkeep
│   ├── engines/
│   │   └── .gitkeep
│   └── api/
│       └── .gitkeep
├── scripts/
│   └── .gitkeep
├── sdk/
│   └── .gitkeep
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

**Dependencies to Install**:
```bash
npm install express pg dotenv cbor tweetnacl
npm install --save-dev nodemon
```

**.env.example Contents**:
```env
# Server
PORT=4000
NODE_ENV=development

# Database
DATABASE_URL=postgres://orbit:orbit@localhost:5432/orbit_dev

# ORBIT
ORBIT_SECRET_KEY=replace-with-random-secret-for-watermark
ORBIT_PLATFORM_ID=ohnrshyp

# Logging
LOG_LEVEL=debug
```

**.gitignore Contents**:
```
node_modules/
.env
*.log
.DS_Store
coverage/
dist/
*.local
.cursor/
```

**Minimal src/index.js**:
```javascript
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 4000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'orbit' });
});

app.listen(PORT, () => {
  console.log(`🛰️  ORBIT server running on port ${PORT}`);
});

module.exports = app;
```

**package.json Scripts**:
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```

**Commit Message**: `chore: initial project setup`

**Verify**:
```bash
npm install          # Should complete without errors
npm start            # Server starts on port 4000
curl localhost:4000/health   # Returns {"status":"ok","service":"orbit"}
```

**Notes for Next Session**: Database setup requires PostgreSQL installed locally or via Docker.

---

### Session 2: Database Setup

**Goal**: PostgreSQL running with ORBIT schema, connection verified

**Prerequisites**: 
- Session 1 complete
- PostgreSQL installed (local or Docker)
- pgvector extension available

**Tasks**:
- [ ] Start PostgreSQL (or create docker-compose.yml)
- [ ] Create database `orbit_dev`
- [ ] Install pgvector extension
- [ ] Create `src/config/database.js` with connection pool
- [ ] Create `scripts/migrate.js` with full schema
- [ ] Run migration, verify tables created
- [ ] Write connection test in `src/config/database.js`

**Docker Option** (docker-compose.yml):
```yaml
version: '3.8'

services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: orbit
      POSTGRES_PASSWORD: orbit
      POSTGRES_DB: orbit_dev
    ports:
      - "5432:5432"
    volumes:
      - orbit_data:/var/lib/postgresql/data

volumes:
  orbit_data:
```

**src/config/database.js**:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Connection test
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connected:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

module.exports = { pool, testConnection };
```

**scripts/migrate.js** (Full Schema):
```javascript
require('dotenv').config();
const { pool } = require('../src/config/database');

const schema = `
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Platform registry (licensed partners)
CREATE TABLE IF NOT EXISTS orbit_platforms (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  public_key BYTEA NOT NULL,
  api_key_hash BYTEA NOT NULL,
  webhook_url VARCHAR(512),
  tier VARCHAR(16) DEFAULT 'basic',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  
  CONSTRAINT valid_tier CHECK (tier IN ('basic', 'partner', 'full', 'enterprise'))
);

-- Audio registrations
CREATE TABLE IF NOT EXISTS orbit_registrations (
  id BIGSERIAL PRIMARY KEY,
  
  -- Fingerprint
  fingerprint_hash BYTEA NOT NULL,
  fingerprint_raw TEXT,
  
  -- Watermark reference
  watermark_hash BYTEA NOT NULL,
  
  -- Core metadata
  isrc VARCHAR(12),
  upc VARCHAR(14),
  title VARCHAR(512) NOT NULL,
  artist VARCHAR(512) NOT NULL,
  duration_ms INTEGER NOT NULL,
  bitrate INTEGER,
  sample_rate INTEGER,
  channels SMALLINT,
  format VARCHAR(8),
  
  -- Extended metadata (CBOR blob)
  extended_metadata BYTEA,
  
  -- Ownership
  owner_id UUID NOT NULL,
  origin_platform VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  origin_timestamp TIMESTAMPTZ NOT NULL,
  origin_signature BYTEA NOT NULL,
  
  -- Full CBOR payload
  payload_cbor BYTEA NOT NULL,
  
  -- Chain integrity
  prev_entry_hash BYTEA,
  entry_hash BYTEA NOT NULL,
  
  -- ML embeddings (optional)
  audio_embedding vector(512),
  metadata_embedding vector(384),
  mert_embedding vector(768),
  
  -- AI-extracted metadata (v2)
  ai_metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_fingerprint_platform UNIQUE (fingerprint_hash, origin_platform)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_orbit_fingerprint ON orbit_registrations(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_orbit_isrc ON orbit_registrations(isrc) WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orbit_upc ON orbit_registrations(upc) WHERE upc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orbit_owner ON orbit_registrations(owner_id);
CREATE INDEX IF NOT EXISTS idx_orbit_platform ON orbit_registrations(origin_platform);
CREATE INDEX IF NOT EXISTS idx_orbit_title_artist ON orbit_registrations(title, artist);

-- Transfer events
CREATE TABLE IF NOT EXISTS orbit_transfers (
  id BIGSERIAL PRIMARY KEY,
  registration_id BIGINT NOT NULL REFERENCES orbit_registrations(id),
  
  from_platform VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  to_platform VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  
  from_signature BYTEA NOT NULL,
  to_signature BYTEA,
  
  status VARCHAR(16) DEFAULT 'pending',
  
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  
  new_registration_id BIGINT REFERENCES orbit_registrations(id),
  
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  CONSTRAINT different_platforms CHECK (from_platform != to_platform)
);

CREATE INDEX IF NOT EXISTS idx_orbit_transfer_status ON orbit_transfers(status, to_platform);
CREATE INDEX IF NOT EXISTS idx_orbit_transfer_pending ON orbit_transfers(to_platform) WHERE status = 'pending';

-- Merkle tree roots
CREATE TABLE IF NOT EXISTS orbit_merkle_roots (
  id BIGSERIAL PRIMARY KEY,
  root_hash BYTEA NOT NULL,
  first_entry_id BIGINT NOT NULL,
  last_entry_id BIGINT NOT NULL,
  entry_count BIGINT NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  published_to VARCHAR(512)
);

-- API usage tracking
CREATE TABLE IF NOT EXISTS orbit_api_usage (
  id BIGSERIAL PRIMARY KEY,
  platform_id VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  endpoint VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  response_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orbit_usage_platform_month ON orbit_api_usage(platform_id, timestamp);

-- Note: Vector indexes created after data exists (need tuning for data size)
-- CREATE INDEX idx_orbit_audio_embedding ON orbit_registrations 
--   USING ivfflat (audio_embedding vector_cosine_ops) WITH (lists = 100);
`;

async function migrate() {
  console.log('🚀 Running ORBIT database migration...');
  
  try {
    await pool.query(schema);
    console.log('✅ Migration complete!');
    
    // Verify tables exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'orbit_%'
    `);
    
    console.log('📋 Created tables:');
    tables.rows.forEach(row => console.log(`   - ${row.table_name}`));
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
```

**Add to package.json Scripts**:
```json
{
  "scripts": {
    "migrate": "node scripts/migrate.js"
  }
}
```

**Commit Message**: `feat: database schema and connection`

**Verify**:
```bash
# If using Docker:
docker-compose up -d

# Run migration
npm run migrate

# Should output:
# 🚀 Running ORBIT database migration...
# ✅ Migration complete!
# 📋 Created tables:
#    - orbit_platforms
#    - orbit_registrations
#    - orbit_transfers
#    - orbit_merkle_roots
#    - orbit_api_usage
```

**Notes for Next Session**: Chromaprint CLI tool (`fpcalc`) must be installed.

---

## Phase 1: Core Engines (v1)

### Session 3: Fingerprint Engine - Chromaprint Integration

**Goal**: Can generate fingerprint hash from any audio file

**Prerequisites**:
- Session 2 complete
- Chromaprint installed: `brew install chromaprint` (macOS) or `apt install libchromaprint-tools` (Linux)

> ⚠️ **V2 Note**: Chromaprint provides **exact-match detection** only. In Session 19, MERT adds semantic fingerprinting that survives pitch/speed changes and enables similarity search. Chromaprint remains valuable for fast exact-duplicate detection.

**Verify Chromaprint Installed**:
```bash
fpcalc -version
# Should output version number
```

**Tasks**:
- [ ] Create `src/engines/fingerprint.js`
- [ ] Implement `OrbitFingerprint.generate(input, options)`
- [ ] Handle file path input
- [ ] Handle Buffer input (write to temp file)
- [ ] Return `{ raw, hash, duration }`
- [ ] Add error handling for missing fpcalc
- [ ] Create test file `tests/engines/fingerprint.test.js`
- [ ] Add test audio file to `tests/fixtures/`

**src/engines/fingerprint.js**:
```javascript
/**
 * ORBIT Fingerprint Engine
 * Wraps Chromaprint (fpcalc) for audio fingerprinting
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

class OrbitFingerprint {
  /**
   * Generate fingerprint from audio buffer or file path
   * @param {Buffer|string} input - Audio buffer or file path
   * @param {Object} options - Options
   * @param {number} options.length - Max audio length to analyze (seconds, default 120)
   * @returns {Promise<{raw: string, hash: Buffer, duration: number}>}
   */
  static async generate(input, options = {}) {
    const { length = 120 } = options;
    
    let audioPath;
    let tempFile = null;
    
    // If input is a buffer, write to temp file
    if (Buffer.isBuffer(input)) {
      tempFile = path.join(
        os.tmpdir(), 
        `orbit-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`
      );
      fs.writeFileSync(tempFile, input);
      audioPath = tempFile;
    } else if (typeof input === 'string') {
      audioPath = input;
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }
    } else {
      throw new Error('Input must be a Buffer or file path string');
    }
    
    try {
      // Verify fpcalc is available
      try {
        execSync('fpcalc -version', { stdio: 'pipe' });
      } catch {
        throw new Error(
          'Chromaprint (fpcalc) not found. Install with: brew install chromaprint'
        );
      }
      
      // Run fpcalc
      const result = execSync(
        `fpcalc -json -length ${length} "${audioPath}"`,
        { 
          encoding: 'utf8', 
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000
        }
      );
      
      const { fingerprint, duration } = JSON.parse(result);
      
      if (!fingerprint) {
        throw new Error('Failed to generate fingerprint - no output from fpcalc');
      }
      
      // Create 32-byte hash for compact storage/comparison
      const hash = crypto.createHash('sha256')
        .update(fingerprint)
        .digest();
      
      return {
        raw: fingerprint,
        hash: hash,
        duration: duration
      };
      
    } finally {
      // Clean up temp file
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
  
  /**
   * Compare two fingerprint hashes
   * @param {Buffer} hash1 
   * @param {Buffer} hash2 
   * @returns {boolean} True if identical
   */
  static hashesMatch(hash1, hash2) {
    if (!Buffer.isBuffer(hash1) || !Buffer.isBuffer(hash2)) {
      return false;
    }
    return hash1.equals(hash2);
  }
}

module.exports = OrbitFingerprint;
```

**Test File (tests/engines/fingerprint.test.js)**:
```javascript
const OrbitFingerprint = require('../../src/engines/fingerprint');
const path = require('path');
const fs = require('fs');

// Simple test runner (replace with Jest later)
async function runTests() {
  const testAudio = path.join(__dirname, '../fixtures/test-audio.mp3');
  
  console.log('🧪 Running Fingerprint Engine Tests\n');
  
  // Test 1: Generate from file path
  try {
    console.log('Test 1: Generate fingerprint from file path');
    const result = await OrbitFingerprint.generate(testAudio);
    
    console.assert(result.raw, 'Should have raw fingerprint');
    console.assert(Buffer.isBuffer(result.hash), 'Hash should be Buffer');
    console.assert(result.hash.length === 32, 'Hash should be 32 bytes');
    console.assert(result.duration > 0, 'Duration should be positive');
    
    console.log('   ✅ Passed');
    console.log(`   Raw length: ${result.raw.length} chars`);
    console.log(`   Hash: ${result.hash.toString('hex').slice(0, 16)}...`);
    console.log(`   Duration: ${result.duration}s\n`);
  } catch (error) {
    console.log('   ❌ Failed:', error.message, '\n');
  }
  
  // Test 2: Same file produces same hash
  try {
    console.log('Test 2: Same audio produces same fingerprint');
    const result1 = await OrbitFingerprint.generate(testAudio);
    const result2 = await OrbitFingerprint.generate(testAudio);
    
    console.assert(
      OrbitFingerprint.hashesMatch(result1.hash, result2.hash),
      'Hashes should match'
    );
    
    console.log('   ✅ Passed\n');
  } catch (error) {
    console.log('   ❌ Failed:', error.message, '\n');
  }
  
  // Test 3: Generate from Buffer
  try {
    console.log('Test 3: Generate fingerprint from Buffer');
    const audioBuffer = fs.readFileSync(testAudio);
    const result = await OrbitFingerprint.generate(audioBuffer);
    
    console.assert(result.raw, 'Should have raw fingerprint');
    console.assert(Buffer.isBuffer(result.hash), 'Hash should be Buffer');
    
    console.log('   ✅ Passed\n');
  } catch (error) {
    console.log('   ❌ Failed:', error.message, '\n');
  }
  
  // Test 4: Non-existent file throws error
  try {
    console.log('Test 4: Non-existent file throws error');
    await OrbitFingerprint.generate('/nonexistent/file.mp3');
    console.log('   ❌ Failed: Should have thrown error\n');
  } catch (error) {
    console.assert(error.message.includes('not found'), 'Should mention file not found');
    console.log('   ✅ Passed (correctly threw error)\n');
  }
  
  console.log('🧪 Tests complete');
}

runTests().catch(console.error);
```

**Test Audio File**:
- Place any MP3 file (10+ seconds) at `tests/fixtures/test-audio.mp3`
- Can use any royalty-free audio for testing

**Add to package.json Scripts**:
```json
{
  "scripts": {
    "test:fingerprint": "node tests/engines/fingerprint.test.js"
  }
}
```

**Commit Message**: `feat: fingerprint engine with Chromaprint`

**Verify**:
```bash
npm run test:fingerprint
# Should show all tests passing
```

**Notes for Next Session**: We'll add database lookup capability to the fingerprint engine.

---

### Session 4: Fingerprint Engine - Database Lookup

**Goal**: Can store and find fingerprints in database

**Prerequisites**: Sessions 2-3 complete

**Tasks**:
- [ ] Create `src/ledger/queries.js` with fingerprint queries
- [ ] Add `OrbitFingerprint.findMatches(hash, db)` method
- [ ] Add `OrbitFingerprint.store(data, db)` method (helper for testing)
- [ ] Test insert and lookup workflow
- [ ] Test exact match detection

**src/ledger/queries.js**:
```javascript
/**
 * ORBIT Ledger Database Queries
 */

const { pool } = require('../config/database');

const queries = {
  /**
   * Find registrations by fingerprint hash
   */
  findByFingerprint: async (fingerprintHash) => {
    const result = await pool.query(
      `SELECT id, fingerprint_hash, title, artist, origin_platform, owner_id, created_at
       FROM orbit_registrations
       WHERE fingerprint_hash = $1`,
      [fingerprintHash]
    );
    return result.rows;
  },
  
  /**
   * Check if fingerprint exists
   */
  fingerprintExists: async (fingerprintHash) => {
    const result = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM orbit_registrations WHERE fingerprint_hash = $1
      ) as exists`,
      [fingerprintHash]
    );
    return result.rows[0].exists;
  },
  
  /**
   * Insert a new registration
   */
  insertRegistration: async (data) => {
    const result = await pool.query(
      `INSERT INTO orbit_registrations (
        fingerprint_hash, fingerprint_raw, watermark_hash,
        title, artist, duration_ms, format,
        owner_id, origin_platform, origin_timestamp, origin_signature,
        payload_cbor, entry_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, created_at`,
      [
        data.fingerprint_hash,
        data.fingerprint_raw,
        data.watermark_hash,
        data.title,
        data.artist,
        data.duration_ms,
        data.format,
        data.owner_id,
        data.origin_platform,
        data.origin_timestamp,
        data.origin_signature,
        data.payload_cbor,
        data.entry_hash
      ]
    );
    return result.rows[0];
  },
  
  /**
   * Get registration by ID
   */
  getRegistration: async (id) => {
    const result = await pool.query(
      `SELECT * FROM orbit_registrations WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  },
  
  /**
   * Create or get test platform
   */
  ensureTestPlatform: async () => {
    const testPlatform = {
      id: 'test-platform',
      name: 'Test Platform',
      public_key: Buffer.alloc(32).fill(1),
      api_key_hash: Buffer.alloc(32).fill(2)
    };
    
    await pool.query(
      `INSERT INTO orbit_platforms (id, name, public_key, api_key_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [testPlatform.id, testPlatform.name, testPlatform.public_key, testPlatform.api_key_hash]
    );
    
    return testPlatform;
  }
};

module.exports = queries;
```

**Update src/engines/fingerprint.js** (add findMatches method):
```javascript
// Add at the end of the class, before module.exports:

  /**
   * Find matching registrations in database
   * @param {Buffer} hash - Fingerprint hash to search for
   * @param {Object} queries - Database queries module
   * @returns {Promise<Array>} Matching registrations
   */
  static async findMatches(hash, queries) {
    return await queries.findByFingerprint(hash);
  }
  
  /**
   * Check if fingerprint already exists
   * @param {Buffer} hash - Fingerprint hash
   * @param {Object} queries - Database queries module
   * @returns {Promise<boolean>}
   */
  static async exists(hash, queries) {
    return await queries.fingerprintExists(hash);
  }
```

**Test File (tests/engines/fingerprint-db.test.js)**:
```javascript
require('dotenv').config();
const OrbitFingerprint = require('../../src/engines/fingerprint');
const queries = require('../../src/ledger/queries');
const { pool } = require('../../src/config/database');
const path = require('path');
const crypto = require('crypto');

async function runTests() {
  console.log('🧪 Running Fingerprint Database Tests\n');
  
  const testAudio = path.join(__dirname, '../fixtures/test-audio.mp3');
  
  try {
    // Setup: Ensure test platform exists
    await queries.ensureTestPlatform();
    
    // Test 1: Generate fingerprint
    console.log('Test 1: Generate fingerprint for database test');
    const fp = await OrbitFingerprint.generate(testAudio);
    console.log('   ✅ Generated fingerprint\n');
    
    // Test 2: Check if exists (should not)
    console.log('Test 2: Fingerprint should not exist yet');
    const existsBefore = await OrbitFingerprint.exists(fp.hash, queries);
    console.assert(!existsBefore, 'Should not exist before insert');
    console.log('   ✅ Confirmed not in database\n');
    
    // Test 3: Insert registration
    console.log('Test 3: Insert test registration');
    const registration = await queries.insertRegistration({
      fingerprint_hash: fp.hash,
      fingerprint_raw: fp.raw,
      watermark_hash: crypto.randomBytes(16),
      title: 'Test Track',
      artist: 'Test Artist',
      duration_ms: Math.floor(fp.duration * 1000),
      format: 'mp3',
      owner_id: '550e8400-e29b-41d4-a716-446655440000',
      origin_platform: 'test-platform',
      origin_timestamp: new Date(),
      origin_signature: crypto.randomBytes(64),
      payload_cbor: Buffer.from('test'),
      entry_hash: crypto.randomBytes(32)
    });
    console.log(`   ✅ Inserted with ID: ${registration.id}\n`);
    
    // Test 4: Check if exists (should now)
    console.log('Test 4: Fingerprint should exist now');
    const existsAfter = await OrbitFingerprint.exists(fp.hash, queries);
    console.assert(existsAfter, 'Should exist after insert');
    console.log('   ✅ Confirmed in database\n');
    
    // Test 5: Find matches
    console.log('Test 5: Find matching registrations');
    const matches = await OrbitFingerprint.findMatches(fp.hash, queries);
    console.assert(matches.length > 0, 'Should find matches');
    console.assert(matches[0].title === 'Test Track', 'Should match title');
    console.log(`   ✅ Found ${matches.length} match(es)\n`);
    
    // Cleanup: Delete test registration
    await pool.query('DELETE FROM orbit_registrations WHERE id = $1', [registration.id]);
    console.log('🧹 Cleaned up test data\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
  
  console.log('🧪 Database tests complete');
}

runTests();
```

**Add to package.json Scripts**:
```json
{
  "scripts": {
    "test:fingerprint:db": "node tests/engines/fingerprint-db.test.js"
  }
}
```

**Commit Message**: `feat: fingerprint database lookup`

**Verify**:
```bash
npm run test:fingerprint:db
# Should show all tests passing, data cleaned up
```

**Notes for Next Session**: We'll build the crypto engine for signing and CBOR encoding.

---

### Session 5: Crypto Engine - Signing & Encoding

**Goal**: Can sign data with Ed25519, encode/decode CBOR

**Prerequisites**: Sessions 1-4 complete

**Tasks**:
- [ ] Create `src/engines/crypto.js`
- [ ] Implement `generateKeypair()`
- [ ] Implement `sign(data, privateKey)`
- [ ] Implement `verify(data, signature, publicKey)`
- [ ] Implement `encode(data)` / `decode(buffer)` for CBOR
- [ ] Implement `hash(data)` for SHA-256
- [ ] Implement `generateApiKey()` and `hashApiKey()`
- [ ] Implement `createEntryHash(entry, prevHash)`
- [ ] Create `scripts/generate-keypair.js` utility
- [ ] Write unit tests

**src/engines/crypto.js**:
```javascript
/**
 * ORBIT Crypto Engine
 * Ed25519 signing and CBOR encoding
 */

const nacl = require('tweetnacl');
const cbor = require('cbor');
const crypto = require('crypto');

class OrbitCrypto {
  /**
   * Generate new Ed25519 keypair for a platform
   * @returns {{publicKey: Buffer, privateKey: Buffer}}
   */
  static generateKeypair() {
    const keypair = nacl.sign.keyPair();
    return {
      publicKey: Buffer.from(keypair.publicKey),
      privateKey: Buffer.from(keypair.secretKey)
    };
  }
  
  /**
   * Sign data with Ed25519 private key
   * @param {Buffer|Object} data - Data to sign (will be CBOR encoded if object)
   * @param {Buffer} privateKey - 64-byte Ed25519 private key
   * @returns {Buffer} 64-byte signature
   */
  static sign(data, privateKey) {
    let dataBuffer;
    
    if (Buffer.isBuffer(data)) {
      dataBuffer = data;
    } else if (typeof data === 'object') {
      // Remove signature field if present, then encode
      const { signature, ...unsigned } = data;
      dataBuffer = cbor.encode(unsigned);
    } else {
      throw new Error('Data must be Buffer or Object');
    }
    
    const signature = nacl.sign.detached(
      new Uint8Array(dataBuffer),
      new Uint8Array(privateKey)
    );
    
    return Buffer.from(signature);
  }
  
  /**
   * Verify Ed25519 signature
   * @param {Buffer|Object} data - Original data
   * @param {Buffer} signature - 64-byte signature
   * @param {Buffer} publicKey - 32-byte public key
   * @returns {boolean}
   */
  static verify(data, signature, publicKey) {
    let dataBuffer;
    
    if (Buffer.isBuffer(data)) {
      dataBuffer = data;
    } else if (typeof data === 'object') {
      const { signature: _, ...unsigned } = data;
      dataBuffer = cbor.encode(unsigned);
    } else {
      throw new Error('Data must be Buffer or Object');
    }
    
    try {
      return nacl.sign.detached.verify(
        new Uint8Array(dataBuffer),
        new Uint8Array(signature),
        new Uint8Array(publicKey)
      );
    } catch {
      return false;
    }
  }
  
  /**
   * Encode data to CBOR
   * @param {Object} data 
   * @returns {Buffer}
   */
  static encode(data) {
    return cbor.encode(data);
  }
  
  /**
   * Decode CBOR data
   * @param {Buffer} buffer 
   * @returns {Object}
   */
  static decode(buffer) {
    return cbor.decode(buffer);
  }
  
  /**
   * SHA-256 hash
   * @param {Buffer|string} data 
   * @returns {Buffer} 32-byte hash
   */
  static hash(data) {
    return crypto.createHash('sha256').update(data).digest();
  }
  
  /**
   * Generate random bytes
   * @param {number} length 
   * @returns {Buffer}
   */
  static randomBytes(length) {
    return crypto.randomBytes(length);
  }
  
  /**
   * Hash API key for storage
   * @param {string} apiKey 
   * @returns {Buffer}
   */
  static hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest();
  }
  
  /**
   * Generate a new API key
   * @returns {string} Base64url-encoded API key
   */
  static generateApiKey() {
    return crypto.randomBytes(32).toString('base64url');
  }
  
  /**
   * Create entry hash for ledger chain
   * @param {Object} entry - Registration entry
   * @param {Buffer} prevHash - Previous entry hash (null for first entry)
   * @returns {Buffer} 32-byte hash
   */
  static createEntryHash(entry, prevHash = null) {
    const hashInput = Buffer.concat([
      prevHash || Buffer.alloc(32),
      cbor.encode({
        fingerprint_hash: entry.fingerprint_hash,
        origin_platform: entry.origin_platform,
        origin_timestamp: entry.origin_timestamp,
        payload_cbor: entry.payload_cbor
      })
    ]);
    
    return this.hash(hashInput);
  }
}

module.exports = OrbitCrypto;
```

**scripts/generate-keypair.js**:
```javascript
#!/usr/bin/env node

/**
 * Generate Ed25519 keypair for a new ORBIT platform
 */

const OrbitCrypto = require('../src/engines/crypto');

const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
const apiKey = OrbitCrypto.generateApiKey();

console.log('🔐 ORBIT Platform Keypair Generated\n');
console.log('PUBLIC KEY (share this):');
console.log(publicKey.toString('base64'));
console.log('\nPRIVATE KEY (keep secret!):');
console.log(privateKey.toString('base64'));
console.log('\nAPI KEY:');
console.log(apiKey);
console.log('\n⚠️  Store these securely! The private key cannot be recovered.\n');
```

**Test File (tests/engines/crypto.test.js)**:
```javascript
const OrbitCrypto = require('../../src/engines/crypto');

function runTests() {
  console.log('🧪 Running Crypto Engine Tests\n');
  
  // Test 1: Generate keypair
  console.log('Test 1: Generate keypair');
  const { publicKey, privateKey } = OrbitCrypto.generateKeypair();
  console.assert(publicKey.length === 32, 'Public key should be 32 bytes');
  console.assert(privateKey.length === 64, 'Private key should be 64 bytes');
  console.log('   ✅ Keypair generated\n');
  
  // Test 2: Sign and verify object
  console.log('Test 2: Sign and verify object');
  const data = { title: 'Test', artist: 'Artist', timestamp: Date.now() };
  const signature = OrbitCrypto.sign(data, privateKey);
  console.assert(signature.length === 64, 'Signature should be 64 bytes');
  
  const isValid = OrbitCrypto.verify(data, signature, publicKey);
  console.assert(isValid, 'Signature should be valid');
  console.log('   ✅ Signature verified\n');
  
  // Test 3: Tampered data fails verification
  console.log('Test 3: Tampered data fails verification');
  const tamperedData = { ...data, title: 'Tampered' };
  const isInvalid = OrbitCrypto.verify(tamperedData, signature, publicKey);
  console.assert(!isInvalid, 'Tampered signature should fail');
  console.log('   ✅ Tampered data correctly rejected\n');
  
  // Test 4: CBOR encode/decode
  console.log('Test 4: CBOR encode/decode');
  const original = { 
    title: 'Test', 
    binary: Buffer.from([1, 2, 3]),
    number: 12345 
  };
  const encoded = OrbitCrypto.encode(original);
  console.assert(Buffer.isBuffer(encoded), 'Encoded should be Buffer');
  
  const decoded = OrbitCrypto.decode(encoded);
  console.assert(decoded.title === original.title, 'Title should match');
  console.assert(decoded.number === original.number, 'Number should match');
  console.log(`   ✅ CBOR round-trip successful (${encoded.length} bytes)\n`);
  
  // Test 5: Hash function
  console.log('Test 5: SHA-256 hash');
  const hash = OrbitCrypto.hash('test data');
  console.assert(hash.length === 32, 'Hash should be 32 bytes');
  
  const hash2 = OrbitCrypto.hash('test data');
  console.assert(hash.equals(hash2), 'Same input should produce same hash');
  console.log('   ✅ Hash function working\n');
  
  // Test 6: API key generation
  console.log('Test 6: API key generation');
  const apiKey = OrbitCrypto.generateApiKey();
  console.assert(typeof apiKey === 'string', 'API key should be string');
  console.assert(apiKey.length > 20, 'API key should be reasonably long');
  
  const hashedKey = OrbitCrypto.hashApiKey(apiKey);
  console.assert(hashedKey.length === 32, 'Hashed API key should be 32 bytes');
  console.log('   ✅ API key generation working\n');
  
  // Test 7: Entry hash chain
  console.log('Test 7: Entry hash chain');
  const entry1 = {
    fingerprint_hash: OrbitCrypto.randomBytes(32),
    origin_platform: 'test',
    origin_timestamp: new Date().toISOString(),
    payload_cbor: OrbitCrypto.encode({ test: 1 })
  };
  
  const hash1 = OrbitCrypto.createEntryHash(entry1, null);
  console.assert(hash1.length === 32, 'Entry hash should be 32 bytes');
  
  const entry2 = { ...entry1, payload_cbor: OrbitCrypto.encode({ test: 2 }) };
  const hash2Chain = OrbitCrypto.createEntryHash(entry2, hash1);
  console.assert(!hash1.equals(hash2Chain), 'Different entries should have different hashes');
  console.log('   ✅ Entry hash chain working\n');
  
  console.log('🧪 All crypto tests passed!');
}

runTests();
```

**Add to package.json Scripts**:
```json
{
  "scripts": {
    "generate:keypair": "node scripts/generate-keypair.js",
    "test:crypto": "node tests/engines/crypto.test.js"
  }
}
```

**Commit Message**: `feat: crypto engine with Ed25519 and CBOR`

**Verify**:
```bash
npm run test:crypto
# Should show all tests passing

npm run generate:keypair
# Should output a keypair and API key
```

**Notes for Next Session**: We'll build the watermark engine for embedding payloads.

---

### Session 6: Watermark Engine - Spread Spectrum Embed

**Goal**: Can embed a payload into audio samples

**Prerequisites**: Session 5 complete

> ⚠️ **V2 Note**: This spread spectrum implementation becomes a **fallback** in Sessions 22-23 when neural watermarking (SilentCipher/WMCodec) is added. Keep the interface clean and simple — don't over-optimize.

**Tasks**:
- [ ] Create `src/engines/watermark.js`
- [ ] Implement `OrbitWatermark` class constructor
- [ ] Implement `_generateSpreadSequence(seed, length)`
- [ ] Implement `_bytesToBits()` / `_bitsToBytes()`
- [ ] Implement `_crc16()` for checksum
- [ ] Implement `createPayload(data)` with magic bytes and CRC
- [ ] Implement `embed(audioSamples, payload)`
- [ ] Test embedding into audio samples

**src/engines/watermark.js**:
```javascript
/**
 * ORBIT Watermark Engine
 * Spread spectrum audio watermarking implementation
 */

const crypto = require('crypto');

class OrbitWatermark {
  /**
   * @param {string} secretKey - Secret key for spreading sequence generation
   * @param {Object} options - Configuration options
   */
  constructor(secretKey, options = {}) {
    if (!secretKey) {
      throw new Error('Secret key is required for watermarking');
    }
    
    this.secretKey = secretKey;
    this.CHIP_RATE = options.chipRate || 1000;       // Samples per bit
    this.EMBED_STRENGTH = options.strength || 0.005; // Amplitude
    this.MAGIC = Buffer.from('ORBT');                // Magic bytes
    this.VERSION = 1;
    this.PAYLOAD_SIZE = 64;                          // Fixed payload size in bytes
  }
  
  /**
   * Generate pseudo-random spreading sequence using HMAC
   * @param {string} seed - Seed for PRNG
   * @param {number} length - Sequence length
   * @returns {Float32Array} Spreading sequence (-1 or +1 values)
   */
  _generateSpreadSequence(seed, length) {
    const sequence = new Float32Array(length);
    let counter = 0;
    
    while (counter < length) {
      const hmac = crypto.createHmac('sha256', this.secretKey);
      hmac.update(`${seed}:${Math.floor(counter / 32)}`);
      const hash = hmac.digest();
      
      for (let i = 0; i < hash.length && counter < length; i++) {
        sequence[counter] = (hash[i] & 1) ? 1 : -1;
        counter++;
      }
    }
    
    return sequence;
  }
  
  /**
   * Convert bytes to bits array
   * @param {Buffer} buffer
   * @returns {number[]}
   */
  _bytesToBits(buffer) {
    const bits = [];
    for (const byte of buffer) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }
    return bits;
  }
  
  /**
   * Convert bits array to bytes
   * @param {number[]} bits
   * @returns {Buffer}
   */
  _bitsToBytes(bits) {
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8 && i + j < bits.length; j++) {
        byte = (byte << 1) | (bits[i + j] > 0 ? 1 : 0);
      }
      bytes.push(byte);
    }
    return Buffer.from(bytes);
  }
  
  /**
   * CRC16 implementation (CCITT)
   * @param {Buffer} buffer
   * @returns {number}
   */
  _crc16(buffer) {
    let crc = 0xFFFF;
    for (const byte of buffer) {
      crc ^= byte << 8;
      for (let i = 0; i < 8; i++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
      }
    }
    return crc & 0xFFFF;
  }
  
  /**
   * Create watermark payload from metadata
   * @param {Object} data - Payload data
   * @param {string} data.platform - Platform ID
   * @param {number} data.timestamp - Unix timestamp in ms
   * @param {Buffer} data.payloadHash - Hash of full CBOR payload (16 bytes)
   * @returns {Buffer} 64-byte binary payload
   */
  createPayload(data) {
    const payload = Buffer.alloc(this.PAYLOAD_SIZE);
    let offset = 0;
    
    // Magic bytes (4)
    this.MAGIC.copy(payload, offset);
    offset += 4;
    
    // Version (1)
    payload.writeUInt8(this.VERSION, offset);
    offset += 1;
    
    // Flags (1) - reserved for future use
    payload.writeUInt8(0, offset);
    offset += 1;
    
    // Timestamp (8 bytes - milliseconds since epoch)
    const timestamp = BigInt(data.timestamp || Date.now());
    payload.writeBigUInt64BE(timestamp, offset);
    offset += 8;
    
    // Platform ID hash (8 bytes - truncated SHA-256)
    const platformHash = crypto.createHash('sha256')
      .update(data.platform || 'unknown')
      .digest()
      .slice(0, 8);
    platformHash.copy(payload, offset);
    offset += 8;
    
    // Full payload hash pointer (16 bytes)
    const payloadHash = data.payloadHash || crypto.randomBytes(16);
    if (Buffer.isBuffer(payloadHash)) {
      payloadHash.slice(0, 16).copy(payload, offset);
    }
    offset += 16;
    
    // Reserved space (24 bytes) - for future use
    // Already zeros from Buffer.alloc
    offset += 24;
    
    // CRC16 checksum of payload (last 2 bytes, at position 62-63)
    const crc = this._crc16(payload.slice(0, 62));
    payload.writeUInt16BE(crc, 62);
    
    return payload;
  }
  
  /**
   * Embed payload into audio samples
   * @param {Float32Array} audioSamples - PCM audio samples (mono, normalized -1 to 1)
   * @param {Buffer} payload - Binary payload to embed (64 bytes)
   * @returns {Float32Array} Watermarked audio samples
   */
  embed(audioSamples, payload) {
    if (payload.length !== this.PAYLOAD_SIZE) {
      throw new Error(`Payload must be ${this.PAYLOAD_SIZE} bytes`);
    }
    
    const bits = this._bytesToBits(payload);
    const requiredSamples = bits.length * this.CHIP_RATE;
    
    if (audioSamples.length < requiredSamples) {
      throw new Error(
        `Audio too short. Need ${requiredSamples} samples (${(requiredSamples / 44100).toFixed(1)}s at 44.1kHz), ` +
        `got ${audioSamples.length} samples`
      );
    }
    
    const output = new Float32Array(audioSamples);
    
    // Generate spreading sequence
    const spreadSeq = this._generateSpreadSequence('embed', bits.length * this.CHIP_RATE);
    
    // Embed each bit using spread spectrum
    for (let bitIdx = 0; bitIdx < bits.length; bitIdx++) {
      const bitValue = bits[bitIdx] ? 1 : -1;
      const startSample = bitIdx * this.CHIP_RATE;
      
      for (let chip = 0; chip < this.CHIP_RATE; chip++) {
        const sampleIdx = startSample + chip;
        const spreadIdx = bitIdx * this.CHIP_RATE + chip;
        
        // Add spread value to sample
        output[sampleIdx] += spreadSeq[spreadIdx] * bitValue * this.EMBED_STRENGTH;
        
        // Clip to valid range
        output[sampleIdx] = Math.max(-1, Math.min(1, output[sampleIdx]));
      }
    }
    
    return output;
  }
  
  /**
   * Get required sample count for embedding
   * @returns {number} Minimum samples needed
   */
  getRequiredSamples() {
    return this.PAYLOAD_SIZE * 8 * this.CHIP_RATE;
  }
  
  /**
   * Get minimum audio duration in seconds (at 44.1kHz)
   * @returns {number}
   */
  getMinimumDuration() {
    return this.getRequiredSamples() / 44100;
  }
}

module.exports = OrbitWatermark;
```

**Test File (tests/engines/watermark-embed.test.js)**:
```javascript
const OrbitWatermark = require('../../src/engines/watermark');
const crypto = require('crypto');

function runTests() {
  console.log('🧪 Running Watermark Embed Tests\n');
  
  const watermark = new OrbitWatermark('test-secret-key');
  
  // Test 1: Create payload
  console.log('Test 1: Create watermark payload');
  const payload = watermark.createPayload({
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash: crypto.randomBytes(16)
  });
  
  console.assert(payload.length === 64, 'Payload should be 64 bytes');
  console.assert(payload.slice(0, 4).toString() === 'ORBT', 'Should have magic bytes');
  console.assert(payload.readUInt8(4) === 1, 'Version should be 1');
  console.log(`   ✅ Payload created (${payload.length} bytes)\n`);
  
  // Test 2: Check minimum duration
  console.log('Test 2: Check minimum audio duration');
  const minDuration = watermark.getMinimumDuration();
  const minSamples = watermark.getRequiredSamples();
  console.log(`   Required: ${minSamples} samples (${minDuration.toFixed(2)}s at 44.1kHz)`);
  console.assert(minDuration > 0, 'Should require some duration');
  console.log('   ✅ Duration requirements calculated\n');
  
  // Test 3: Embed into silence
  console.log('Test 3: Embed payload into audio samples');
  const sampleCount = Math.ceil(minSamples * 1.1); // 10% buffer
  const audioSamples = new Float32Array(sampleCount); // Silence
  
  const watermarked = watermark.embed(audioSamples, payload);
  
  console.assert(watermarked.length === audioSamples.length, 'Output length should match input');
  console.log('   ✅ Embedding complete\n');
  
  // Test 4: Verify watermark modifies signal
  console.log('Test 4: Verify watermark modifies signal');
  let differences = 0;
  let maxDiff = 0;
  
  for (let i = 0; i < minSamples; i++) {
    const diff = Math.abs(watermarked[i] - audioSamples[i]);
    if (diff > 0) differences++;
    if (diff > maxDiff) maxDiff = diff;
  }
  
  console.assert(differences > 0, 'Some samples should be modified');
  console.assert(maxDiff < 0.02, 'Max difference should be small (imperceptible)');
  console.log(`   Modified samples: ${differences}`);
  console.log(`   Max amplitude change: ${maxDiff.toFixed(6)}`);
  console.log('   ✅ Signal modified within acceptable range\n');
  
  // Test 5: Audio too short throws error
  console.log('Test 5: Audio too short throws error');
  const shortAudio = new Float32Array(1000);
  try {
    watermark.embed(shortAudio, payload);
    console.log('   ❌ Should have thrown error');
  } catch (error) {
    console.assert(error.message.includes('too short'), 'Should mention audio too short');
    console.log('   ✅ Correctly rejected short audio\n');
  }
  
  // Test 6: Different payloads produce different watermarks
  console.log('Test 6: Different payloads produce different watermarks');
  const payload2 = watermark.createPayload({
    platform: 'other-platform',
    timestamp: Date.now() + 1000
  });
  
  const watermarked2 = watermark.embed(new Float32Array(sampleCount), payload2);
  
  let samplesDifferent = 0;
  for (let i = 0; i < 1000; i++) {
    if (watermarked[i] !== watermarked2[i]) samplesDifferent++;
  }
  
  console.assert(samplesDifferent > 0, 'Different payloads should produce different watermarks');
  console.log(`   ✅ Different payloads produce different outputs\n`);
  
  console.log('🧪 All embed tests passed!');
}

runTests();
```

**Add to package.json Scripts**:
```json
{
  "scripts": {
    "test:watermark:embed": "node tests/engines/watermark-embed.test.js"
  }
}
```

**Commit Message**: `feat: watermark engine - embedding`

**Verify**:
```bash
npm run test:watermark:embed
# Should show all tests passing
```

**Notes for Next Session**: We'll add the extraction capability to recover the payload.

---

### Session 7: Watermark Engine - Spread Spectrum Extract

**Goal**: Can extract payload from watermarked audio

**Prerequisites**: Session 6 complete

**Tasks**:
- [ ] Add `extract(audioSamples, payloadBytes)` method
- [ ] Add `_verifyCrc(payload)` method
- [ ] Add `parsePayload(payload)` method
- [ ] Test round-trip: embed → extract
- [ ] Test with added noise (robustness check)

**Add to src/engines/watermark.js** (inside the class, before the closing brace):
```javascript
  /**
   * Verify CRC16 of payload
   * @param {Buffer} payload
   * @returns {boolean}
   */
  _verifyCrc(payload) {
    if (payload.length < this.PAYLOAD_SIZE) return false;
    const storedCrc = payload.readUInt16BE(62);
    const calculatedCrc = this._crc16(payload.slice(0, 62));
    return storedCrc === calculatedCrc;
  }
  
  /**
   * Extract payload from watermarked audio
   * @param {Float32Array} audioSamples - Watermarked PCM samples
   * @param {number} payloadBytes - Expected payload size in bytes (default 64)
   * @returns {{payload: Buffer|null, confidence: number, valid: boolean}}
   */
  extract(audioSamples, payloadBytes = 64) {
    const bitCount = payloadBytes * 8;
    const requiredSamples = bitCount * this.CHIP_RATE;
    
    if (audioSamples.length < requiredSamples) {
      return { payload: null, confidence: 0, valid: false };
    }
    
    const bits = [];
    const confidences = [];
    
    // Generate same spreading sequence used for embedding
    const spreadSeq = this._generateSpreadSequence('embed', bitCount * this.CHIP_RATE);
    
    // Correlate to extract each bit
    for (let bitIdx = 0; bitIdx < bitCount; bitIdx++) {
      let correlation = 0;
      const startSample = bitIdx * this.CHIP_RATE;
      
      for (let chip = 0; chip < this.CHIP_RATE; chip++) {
        const sampleIdx = startSample + chip;
        const spreadIdx = bitIdx * this.CHIP_RATE + chip;
        
        correlation += audioSamples[sampleIdx] * spreadSeq[spreadIdx];
      }
      
      // Normalize correlation
      const normalizedCorrelation = correlation / this.CHIP_RATE;
      
      bits.push(correlation > 0 ? 1 : 0);
      confidences.push(Math.abs(normalizedCorrelation));
    }
    
    const payload = this._bitsToBytes(bits);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    
    // Verify magic bytes and CRC
    const hasMagic = payload.length >= 4 && payload.slice(0, 4).equals(this.MAGIC);
    const hasValidCrc = this._verifyCrc(payload);
    
    return {
      payload,
      confidence: avgConfidence,
      valid: hasMagic && hasValidCrc
    };
  }
  
  /**
   * Parse extracted payload into structured data
   * @param {Buffer} payload - Extracted payload
   * @returns {Object|null} Parsed payload data, or null if invalid
   */
  parsePayload(payload) {
    if (!payload || payload.length < this.PAYLOAD_SIZE) {
      return null;
    }
    
    const hasMagic = payload.slice(0, 4).equals(this.MAGIC);
    if (!hasMagic) {
      return null;
    }
    
    return {
      magic: payload.slice(0, 4).toString(),
      version: payload.readUInt8(4),
      flags: payload.readUInt8(5),
      timestamp: Number(payload.readBigUInt64BE(6)),
      platformHash: payload.slice(14, 22),
      payloadHash: payload.slice(22, 38),
      crcValid: this._verifyCrc(payload)
    };
  }
  
  /**
   * Check if audio contains a valid ORBIT watermark
   * @param {Float32Array} audioSamples
   * @returns {{detected: boolean, confidence: number}}
   */
  detect(audioSamples) {
    const result = this.extract(audioSamples);
    return {
      detected: result.valid,
      confidence: result.confidence
    };
  }
```

**Test File (tests/engines/watermark-extract.test.js)**:
```javascript
const OrbitWatermark = require('../../src/engines/watermark');
const crypto = require('crypto');

function runTests() {
  console.log('🧪 Running Watermark Extract Tests\n');
  
  const watermark = new OrbitWatermark('test-secret-key');
  
  // Setup: Create test payload and embed
  const originalPayload = watermark.createPayload({
    platform: 'test-platform',
    timestamp: Date.now(),
    payloadHash: crypto.randomBytes(16)
  });
  
  const sampleCount = Math.ceil(watermark.getRequiredSamples() * 1.1);
  const audioSamples = new Float32Array(sampleCount);
  const watermarked = watermark.embed(audioSamples, originalPayload);
  
  // Test 1: Extract payload from watermarked audio
  console.log('Test 1: Extract payload from watermarked audio');
  const extracted = watermark.extract(watermarked);
  
  console.assert(extracted.valid, 'Extraction should be valid');
  console.assert(extracted.confidence > 0, 'Confidence should be positive');
  console.assert(extracted.payload !== null, 'Payload should be extracted');
  console.log(`   Confidence: ${(extracted.confidence * 1000).toFixed(3)}`);
  console.log('   ✅ Payload extracted successfully\n');
  
  // Test 2: Extracted payload matches original
  console.log('Test 2: Extracted payload matches original');
  console.assert(
    extracted.payload.equals(originalPayload),
    'Extracted payload should match original'
  );
  console.log('   ✅ Payload matches original\n');
  
  // Test 3: Parse extracted payload
  console.log('Test 3: Parse extracted payload');
  const parsed = watermark.parsePayload(extracted.payload);
  
  console.assert(parsed !== null, 'Should parse successfully');
  console.assert(parsed.magic === 'ORBT', 'Magic should be ORBT');
  console.assert(parsed.version === 1, 'Version should be 1');
  console.assert(parsed.crcValid, 'CRC should be valid');
  console.log(`   Magic: ${parsed.magic}`);
  console.log(`   Version: ${parsed.version}`);
  console.log(`   Timestamp: ${new Date(parsed.timestamp).toISOString()}`);
  console.log('   ✅ Payload parsed correctly\n');
  
  // Test 4: Audio without watermark
  console.log('Test 4: Audio without watermark returns invalid');
  const cleanAudio = new Float32Array(sampleCount); // No watermark
  const noWatermark = watermark.extract(cleanAudio);
  
  console.assert(!noWatermark.valid, 'Clean audio should not have valid watermark');
  console.log('   ✅ Correctly identified as no watermark\n');
  
  // Test 5: Survives minor noise
  console.log('Test 5: Survives minor noise addition');
  const noisyAudio = new Float32Array(watermarked);
  for (let i = 0; i < noisyAudio.length; i++) {
    noisyAudio[i] += (Math.random() - 0.5) * 0.001; // Very small noise
  }
  
  const noisyExtract = watermark.extract(noisyAudio);
  console.assert(noisyExtract.valid, 'Should survive minor noise');
  console.assert(
    noisyExtract.payload.equals(originalPayload),
    'Payload should still match after noise'
  );
  console.log(`   Confidence after noise: ${(noisyExtract.confidence * 1000).toFixed(3)}`);
  console.log('   ✅ Survived minor noise\n');
  
  // Test 6: Detect method
  console.log('Test 6: Detect watermark presence');
  const detected = watermark.detect(watermarked);
  console.assert(detected.detected, 'Should detect watermark');
  
  const notDetected = watermark.detect(cleanAudio);
  console.assert(!notDetected.detected, 'Should not detect in clean audio');
  console.log('   ✅ Detection working correctly\n');
  
  // Test 7: Different secret key cannot extract
  console.log('Test 7: Different secret key fails extraction');
  const wrongKeyWatermark = new OrbitWatermark('wrong-secret-key');
  const wrongExtract = wrongKeyWatermark.extract(watermarked);
  
  console.assert(!wrongExtract.valid, 'Wrong key should fail');
  console.log('   ✅ Wrong key correctly rejected\n');
  
  // Test 8: Audio too short returns error gracefully
  console.log('Test 8: Short audio handled gracefully');
  const shortAudio = new Float32Array(1000);
  const shortResult = watermark.extract(shortAudio);
  
  console.assert(!shortResult.valid, 'Short audio should be invalid');
  console.assert(shortResult.payload === null, 'Short audio should return null payload');
  console.log('   ✅ Short audio handled correctly\n');
  
  console.log('🧪 All extract tests passed!');
}

runTests();
```

**Add to package.json Scripts**:
```json
{
  "scripts": {
    "test:watermark:extract": "node tests/engines/watermark-extract.test.js",
    "test:watermark": "npm run test:watermark:embed && npm run test:watermark:extract"
  }
}
```

**Commit Message**: `feat: watermark engine - extraction`

**Verify**:
```bash
npm run test:watermark
# Should show all embed and extract tests passing
```

**Notes for Next Session**: We'll add audio file loading/saving utilities.

---

### Session 8: Audio Utilities

**Goal**: Can load audio files and convert to Float32Array samples

**Prerequisites**: Session 7 complete

**Tasks**:
- [ ] Install audio processing dependencies
- [ ] Create `src/utils/audio.js`
- [ ] Implement `loadAudioSamples(filePath)` → Float32Array
- [ ] Implement `saveAudioSamples(samples, filePath, sampleRate)`
- [ ] Handle WAV format natively
- [ ] Support other formats via FFmpeg conversion
- [ ] Test with real audio files

**Install Dependencies**:
```bash
npm install wav-decoder wav-encoder
```

**src/utils/audio.js**:
```javascript
/**
 * ORBIT Audio Utilities
 * Load and save audio files as Float32Array samples
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const wavDecoder = require('wav-decoder');
const wavEncoder = require('wav-encoder');

class AudioUtils {
  /**
   * Load audio file and return mono Float32Array samples
   * @param {string|Buffer} input - File path or Buffer
   * @param {Object} options
   * @param {number} options.targetSampleRate - Target sample rate (default: 44100)
   * @returns {Promise<{samples: Float32Array, sampleRate: number, duration: number}>}
   */
  static async loadAudioSamples(input, options = {}) {
    const { targetSampleRate = 44100 } = options;
    
    let audioPath;
    let tempFile = null;
    let shouldConvert = false;
    
    // Handle Buffer input
    if (Buffer.isBuffer(input)) {
      tempFile = path.join(os.tmpdir(), `orbit-${Date.now()}.audio`);
      fs.writeFileSync(tempFile, input);
      audioPath = tempFile;
      shouldConvert = true; // Unknown format, convert to WAV
    } else {
      audioPath = input;
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }
      // Check if already WAV
      const ext = path.extname(audioPath).toLowerCase();
      shouldConvert = ext !== '.wav';
    }
    
    let wavPath = audioPath;
    let convertedFile = null;
    
    try {
      // Convert to WAV if needed
      if (shouldConvert) {
        convertedFile = path.join(os.tmpdir(), `orbit-${Date.now()}-converted.wav`);
        
        try {
          execSync(
            `ffmpeg -i "${audioPath}" -ar ${targetSampleRate} -ac 1 -y "${convertedFile}"`,
            { stdio: 'pipe', timeout: 60000 }
          );
          wavPath = convertedFile;
        } catch (error) {
          throw new Error(
            'FFmpeg conversion failed. Ensure FFmpeg is installed: brew install ffmpeg'
          );
        }
      }
      
      // Read WAV file
      const wavBuffer = fs.readFileSync(wavPath);
      const audioData = await wavDecoder.decode(wavBuffer);
      
      // Convert to mono if stereo
      let samples;
      if (audioData.channelData.length === 1) {
        samples = audioData.channelData[0];
      } else {
        // Average channels to mono
        const left = audioData.channelData[0];
        const right = audioData.channelData[1];
        samples = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          samples[i] = (left[i] + right[i]) / 2;
        }
      }
      
      const duration = samples.length / audioData.sampleRate;
      
      return {
        samples,
        sampleRate: audioData.sampleRate,
        duration
      };
      
    } finally {
      // Cleanup temp files
      if (tempFile && fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (convertedFile && fs.existsSync(convertedFile)) {
        fs.unlinkSync(convertedFile);
      }
    }
  }
  
  /**
   * Save Float32Array samples to WAV file
   * @param {Float32Array} samples - Audio samples
   * @param {string} filePath - Output file path
   * @param {number} sampleRate - Sample rate (default: 44100)
   * @returns {Promise<void>}
   */
  static async saveAudioSamples(samples, filePath, sampleRate = 44100) {
    const audioData = {
      sampleRate,
      channelData: [samples]
    };
    
    const wavBuffer = await wavEncoder.encode(audioData);
    fs.writeFileSync(filePath, Buffer.from(wavBuffer));
  }
  
  /**
   * Convert any audio format to WAV
   * @param {string} inputPath - Input file path
   * @param {string} outputPath - Output WAV path
   * @param {Object} options
   * @param {number} options.sampleRate - Target sample rate
   * @param {number} options.channels - Number of channels (1 for mono)
   */
  static async convertToWav(inputPath, outputPath, options = {}) {
    const { sampleRate = 44100, channels = 1 } = options;
    
    try {
      execSync(
        `ffmpeg -i "${inputPath}" -ar ${sampleRate} -ac ${channels} -y "${outputPath}"`,
        { stdio: 'pipe', timeout: 60000 }
      );
    } catch (error) {
      throw new Error('FFmpeg conversion failed: ' + error.message);
    }
  }
  
  /**
   * Get audio file info without loading full samples
   * @param {string} filePath
   * @returns {{duration: number, format: string}}
   */
  static getAudioInfo(filePath) {
    try {
      const result = execSync(
        `ffprobe -v quiet -print_format json -show_format "${filePath}"`,
        { encoding: 'utf8', timeout: 30000 }
      );
      
      const info = JSON.parse(result);
      return {
        duration: parseFloat(info.format.duration),
        format: info.format.format_name,
        bitrate: parseInt(info.format.bit_rate),
        size: parseInt(info.format.size)
      };
    } catch {
      throw new Error('Could not read audio info. Ensure FFmpeg/FFprobe is installed.');
    }
  }
  
  /**
   * Check if FFmpeg is available
   * @returns {boolean}
   */
  static isFFmpegAvailable() {
    try {
      execSync('ffmpeg -version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = AudioUtils;
```

**Test File (tests/utils/audio.test.js)**:
```javascript
const AudioUtils = require('../../src/utils/audio');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function runTests() {
  console.log('🧪 Running Audio Utilities Tests\n');
  
  const testAudio = path.join(__dirname, '../fixtures/test-audio.mp3');
  
  // Test 0: Check FFmpeg
  console.log('Test 0: Check FFmpeg availability');
  const hasFFmpeg = AudioUtils.isFFmpegAvailable();
  if (!hasFFmpeg) {
    console.log('   ⚠️ FFmpeg not available, some tests will be skipped');
    console.log('   Install with: brew install ffmpeg\n');
  } else {
    console.log('   ✅ FFmpeg available\n');
  }
  
  // Test 1: Get audio info
  if (hasFFmpeg && fs.existsSync(testAudio)) {
    console.log('Test 1: Get audio file info');
    try {
      const info = AudioUtils.getAudioInfo(testAudio);
      console.assert(info.duration > 0, 'Duration should be positive');
      console.log(`   Duration: ${info.duration.toFixed(2)}s`);
      console.log(`   Format: ${info.format}`);
      console.log('   ✅ Got audio info\n');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  // Test 2: Load audio samples from MP3
  if (hasFFmpeg && fs.existsSync(testAudio)) {
    console.log('Test 2: Load audio samples from MP3');
    try {
      const audio = await AudioUtils.loadAudioSamples(testAudio);
      
      console.assert(audio.samples instanceof Float32Array, 'Should be Float32Array');
      console.assert(audio.samples.length > 0, 'Should have samples');
      console.assert(audio.sampleRate > 0, 'Should have sample rate');
      console.assert(audio.duration > 0, 'Should have duration');
      
      console.log(`   Samples: ${audio.samples.length}`);
      console.log(`   Sample rate: ${audio.sampleRate}Hz`);
      console.log(`   Duration: ${audio.duration.toFixed(2)}s`);
      console.log('   ✅ Loaded MP3 samples\n');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  // Test 3: Save and reload samples
  console.log('Test 3: Save and reload samples');
  try {
    const outputPath = path.join(os.tmpdir(), `orbit-test-${Date.now()}.wav`);
    
    // Create test samples (1 second sine wave)
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
    }
    
    // Save
    await AudioUtils.saveAudioSamples(samples, outputPath, sampleRate);
    console.assert(fs.existsSync(outputPath), 'File should exist');
    
    // Reload
    const reloaded = await AudioUtils.loadAudioSamples(outputPath);
    console.assert(reloaded.samples.length === samples.length, 'Sample count should match');
    
    // Check samples are similar (allow small rounding differences)
    let maxDiff = 0;
    for (let i = 0; i < Math.min(1000, samples.length); i++) {
      maxDiff = Math.max(maxDiff, Math.abs(samples[i] - reloaded.samples[i]));
    }
    console.assert(maxDiff < 0.01, 'Samples should be very similar');
    
    // Cleanup
    fs.unlinkSync(outputPath);
    
    console.log(`   Saved and reloaded ${samples.length} samples`);
    console.log(`   Max sample difference: ${maxDiff.toFixed(6)}`);
    console.log('   ✅ Round-trip successful\n');
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}\n`);
  }
  
  // Test 4: Load from Buffer
  if (hasFFmpeg && fs.existsSync(testAudio)) {
    console.log('Test 4: Load from Buffer');
    try {
      const buffer = fs.readFileSync(testAudio);
      const audio = await AudioUtils.loadAudioSamples(buffer);
      
      console.assert(audio.samples.length > 0, 'Should have samples');
      console.log(`   Loaded ${audio.samples.length} samples from Buffer`);
      console.log('   ✅ Buffer loading works\n');
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}\n`);
    }
  }
  
  console.log('🧪 Audio utilities tests complete!');
}

runTests().catch(console.error);
```

**Add to package.json Scripts**:
```json
{
  "scripts": {
    "test:audio": "node tests/utils/audio.test.js"
  }
}
```

**Commit Message**: `feat: audio file utilities`

**Verify**:
```bash
npm run test:audio
# Should show tests passing (some may skip without FFmpeg)
```

**Phase 1 Complete Checkpoint**:
```bash
# Run all engine tests
npm run test:fingerprint
npm run test:crypto
npm run test:watermark
npm run test:audio
```

**Notes for Next Session**: We'll start building the API layer with Express server setup.

---

## Phase 2: API Layer (v1)

### Session 9: Express Server & CBOR Middleware

**Goal**: Express server running with CBOR body parsing

**Prerequisites**: Session 8 complete

**Tasks**:
- [ ] Update `src/index.js` with full Express setup
- [ ] Create `src/config/index.js` for environment configuration
- [ ] Create `src/api/middleware/cbor.js` for CBOR request/response handling
- [ ] Create `src/api/routes.js` with router structure
- [ ] Add `GET /health` endpoint
- [ ] Add `GET /orbit/v1/info` returning protocol version
- [ ] Test server starts and responds to requests

**Key Implementation**: See `ORBIT_SPECIFICATION.md` Section 8 (API Specification)

**Commit Message**: `feat: express server with CBOR middleware`

**Verify**:
```bash
npm run dev
curl localhost:4000/health
curl localhost:4000/orbit/v1/info
```

---

### Session 10: Platform Authentication Middleware

**Goal**: Can authenticate API requests with platform ID + signature

**Prerequisites**: Session 9 complete

**Tasks**:
- [ ] Create `src/api/middleware/auth.js`
- [ ] Implement platform lookup from `X-ORBIT-Platform` header
- [ ] Verify Ed25519 signature from `X-ORBIT-Signature` header
- [ ] Attach platform info to `req.platform` if valid
- [ ] Return 401 on invalid/missing auth
- [ ] Create script to seed a test platform in database
- [ ] Test authenticated vs unauthenticated requests

**Key Implementation**: Uses `OrbitCrypto.verify()` from Session 5

**Commit Message**: `feat: platform authentication middleware`

**Verify**:
- Request without headers → 401
- Request with valid signature → 200
- Request with bad signature → 401

---

### Session 11: Register Endpoint

**Goal**: `POST /orbit/v1/register` fully working

**Prerequisites**: Session 10 complete

> ⚠️ **V2 Note**: In Session 21, registration is enhanced with auto-metadata extraction (genre, mood, BPM, key via CLAP/MERT). Design the metadata handling to be **extensible** — use a modular approach so AI metadata can be injected into the pipeline later.

**Tasks**:
- [ ] Create `src/api/handlers/register.js`
- [ ] Accept audio (base64) + metadata in request body
- [ ] Generate fingerprint using `OrbitFingerprint`
- [ ] Check for duplicate via fingerprint lookup
- [ ] Create CBOR payload with all metadata
- [ ] Sign payload with platform key
- [ ] Create watermark payload and embed into audio
- [ ] Insert registration into database with entry hash
- [ ] Return registration ID, fingerprint hash, watermarked audio

**Key Implementation**: See `ORBIT_SPECIFICATION.md` Section 10 (register.js example)

**Commit Message**: `feat: register endpoint`

**Verify**:
```bash
# Create test request with audio + metadata
# Should return registration_id, fingerprint_hash, watermarked_audio
```

---

### Session 12: Verify Endpoint

**Goal**: `POST /orbit/v1/verify` fully working

**Prerequisites**: Session 11 complete

> ⚠️ **V2 Note**: Session 25 enhances verification with AI-extracted metadata, content relationship detection, and confidence scores. Design the response object to be **extensible** — use a structure that can accommodate additional sections without breaking v1 clients.

**Tasks**:
- [ ] Create `src/api/handlers/verify.js`
- [ ] Accept audio in request body
- [ ] Generate fingerprint and search database
- [ ] Extract watermark and verify CRC/magic bytes
- [ ] Look up payload hash in ledger
- [ ] Verify origin signature against platform public key
- [ ] Build verification response with all provenance data
- [ ] Flag as duplicate if fingerprint exists from different owner

**Key Implementation**: See `ORBIT_SPECIFICATION.md` Section 8 (verify response format)

**Commit Message**: `feat: verify endpoint`

**Verify**:
- Verify registered file → full provenance returned
- Verify unregistered file → `verified: false`
- Verify duplicate → shows original registration

---

### Session 13: Transfer Endpoints (Initiate & Accept)

**Goal**: B2B transfer flow working

**Prerequisites**: Session 12 complete

**Tasks**:
- [ ] Create `src/api/handlers/transfer.js`
- [ ] Implement `POST /orbit/v1/transfer`:
  - Verify sender owns registration
  - Verify recipient platform exists
  - Create pending transfer record
  - Set 7-day expiration
- [ ] Implement `POST /orbit/v1/accept`:
  - Verify caller is target platform
  - Verify transfer not expired
  - Add recipient signature
  - Create new registration for recipient
  - Re-watermark with extended chain
  - Update transfer status to 'accepted'
- [ ] Create second test platform for transfer testing

**Key Implementation**: See `ORBIT_SPECIFICATION.md` Section 8 (transfer flow diagram)

**Commit Message**: `feat: transfer endpoints`

**Verify**:
- Platform A initiates → gets transfer_id, status: pending
- Platform B accepts → gets new registration with chain A→B

---

### Session 14: Chain Lookup Endpoint

**Goal**: `GET /orbit/v1/chain/:fingerprint` working

**Prerequisites**: Session 13 complete

**Tasks**:
- [ ] Create `src/api/handlers/chain.js`
- [ ] Parse fingerprint hash from URL parameter
- [ ] Query all registrations with matching fingerprint
- [ ] Query all transfers involving those registrations
- [ ] Build chronological chain array
- [ ] Include Merkle proof if available
- [ ] Return complete chain response

**Key Implementation**: See `ORBIT_SPECIFICATION.md` Section 8 (chain response format)

**Commit Message**: `feat: chain lookup endpoint`

**Verify**:
- Chain for fresh registration → shows origin only
- Chain for transferred file → shows full history

**🏁 Phase 2 Complete**: All 5 core API endpoints working

---

## Phase 3: Ohnrshyp Integration

### Session 15: ORBIT SDK Package

**Goal**: Publishable SDK that Ohnrshyp can `npm install`

**Prerequisites**: Session 14 complete (full API working)

**Tasks**:
- [ ] Create `sdk/package.json` with name `@ohnrshyp/orbit-sdk`
- [ ] Create `sdk/index.js` exporting `OrbitClient` class
- [ ] Implement `OrbitClient` constructor (apiUrl, platformId, privateKey)
- [ ] Implement `client.register(audioBuffer, metadata, ownerId)`
- [ ] Implement `client.verify(audioBuffer)`
- [ ] Implement `client.transfer(registrationId, toPlatform)`
- [ ] Implement `client.getChain(fingerprintHash)`
- [ ] Include signing utilities from crypto engine
- [ ] Add JSDoc comments for all methods
- [ ] Test SDK against running ORBIT server

**Key Implementation**: Wraps HTTP calls to API endpoints with signing

**Commit Message**: `feat: orbit SDK package`

**Verify**:
```javascript
const { OrbitClient } = require('./sdk');
const client = new OrbitClient({ apiUrl: 'http://localhost:4000', ... });
const result = await client.verify(audioBuffer);
```

---

### Session 16: Ohnrshyp Middleware (Duplicate Check)

**Goal**: Middleware that checks duplicates before upload completes

**Prerequisites**: Session 15 complete

**Tasks**:
- [ ] Create `examples/ohnrshyp/orbit.middleware.js`
- [ ] Implement `checkDuplicate` middleware function
- [ ] Call ORBIT verify endpoint with uploaded audio
- [ ] If duplicate found: return 409 with original info
- [ ] If new: attach fingerprint to request, call next()
- [ ] Handle ORBIT unavailable gracefully (allow upload)
- [ ] Document integration point in Ohnrshyp routes

**Key Implementation**: See `ORBIT_SPECIFICATION.md` Section 11 (middleware example)

**Commit Message**: `feat: ohnrshyp duplicate check middleware`

**Verify**:
- Upload new file → passes through
- Upload known duplicate → returns 409 with details

---

### Session 17: Ohnrshyp Middleware (Auto-Registration)

**Goal**: Auto-register uploads with ORBIT after track creation

**Prerequisites**: Session 16 complete

**Tasks**:
- [ ] Add `registerWithOrbit` middleware function
- [ ] Runs after successful track creation in Ohnrshyp
- [ ] Extract metadata from request and created track
- [ ] Call ORBIT register endpoint
- [ ] Update Track model with ORBIT data (registration_id, etc.)
- [ ] Handle ORBIT errors gracefully (don't fail upload)
- [ ] Log successful registrations
- [ ] Document Track model schema extension

**Key Implementation**: See `ORBIT_SPECIFICATION.md` Section 11 (registerWithOrbit example)

**Commit Message**: `feat: ohnrshyp auto-registration middleware`

**Verify**:
- Upload track → Track document has `orbit.registrationId`
- ORBIT ledger contains matching entry
- ORBIT down → upload still succeeds

**🏁 Phase 3 Complete**: Ohnrshyp integration ready

---

## Phase 4: Neural Enhancements (v2)

### Session 18: Model Management Infrastructure

**Goal**: Lazy-loading model manager for ML models

**Prerequisites**: Session 17 complete

**Tasks**:
- [ ] Create `src/ml/models.js` with `ModelManager` class
- [ ] Implement singleton pattern
- [ ] Implement lazy loading (load on first use, cache thereafter)
- [ ] Add download progress logging for large models
- [ ] Create model cache directory (`./models/` or configurable)
- [ ] Add configuration for GPU vs CPU inference
- [ ] Test model loading lifecycle

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 8 (Model Loading Strategy)

**New Dependencies**:
```bash
npm install @xenova/transformers
```

**Commit Message**: `feat: ML model management infrastructure`

**Verify**:
- First model request → logs download progress
- Second request → returns cached instantly

---

### Session 19: MERT Fingerprinting

**Goal**: Generate semantic embeddings with MERT

**Prerequisites**: Session 18 complete

**Tasks**:
- [ ] Create `src/ml/mert.js`
- [ ] Load MERT model via ModelManager
- [ ] Implement `getEmbedding(audioPath)` → 768-dim Float32Array
- [ ] Add `mert_embedding` column to registrations (already in schema)
- [ ] Update registration flow to compute and store MERT embedding
- [ ] Implement cosine similarity helper function
- [ ] Test similarity between same/different tracks

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 2 (MERT integration)

**Commit Message**: `feat: MERT semantic fingerprinting`

**Verify**:
- Same track → similarity ~0.99
- Similar genre → similarity 0.6-0.8
- Different genre → similarity < 0.5

---

### Session 20: CLAP Integration

**Goal**: Zero-shot genre/mood/instrument classification

**Prerequisites**: Session 19 complete

**Tasks**:
- [ ] Create `src/ml/clap.js`
- [ ] Load LAION-CLAP model via ModelManager
- [ ] Implement `getEmbedding(audioPath)` → 512-dim vector
- [ ] Implement `classifyGenre(embedding)` with prompt comparison
- [ ] Implement `classifyMood(embedding)`
- [ ] Implement `detectInstruments(embedding)`
- [ ] Define prompt lists for each classification
- [ ] Return results with confidence scores

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 3 (CLAP prompts and classification)

**Commit Message**: `feat: CLAP zero-shot classification`

**Verify**:
- Electronic track → genre includes "electronic"
- Sad ballad → mood includes "sad" or "melancholic"
- Guitar track → instruments includes "guitar"

---

### Session 21: Auto-Metadata Extraction Pipeline

**Goal**: Registration auto-extracts all AI metadata

**Prerequisites**: Session 20 complete

**Tasks**:
- [ ] Create `src/ml/metadata-extractor.js`
- [ ] Combine CLAP classification (genre, mood, instruments)
- [ ] Add MERT-derived features
- [ ] Add signal processing (BPM, key detection via librosa/essentia or JS equivalent)
- [ ] Return complete AI metadata object with confidence scores
- [ ] Update `ai_metadata` JSONB column on registration
- [ ] Integrate into registration flow (optional, configurable)
- [ ] Update registration response to include `ai_extracted_metadata`

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 3 (auto-extraction pipeline)

**New Dependencies** (optional, for BPM/key):
```bash
npm install essentia.js  # Or use Python subprocess
```

**Commit Message**: `feat: auto-metadata extraction pipeline`

**Verify**:
- Registration response includes `ai_extracted_metadata`
- Genre, mood, BPM, key all populated with confidence scores

---

### Session 22: Neural Watermarking (SilentCipher)

**Goal**: Integrate neural watermarking for improved robustness

**Prerequisites**: Session 21 complete

**Tasks**:
- [ ] Research SilentCipher availability (may need Python service)
- [ ] Create `src/ml/silentcipher.js` (or Python bridge via subprocess)
- [ ] Implement `embed(audioSamples, payload)` 
- [ ] Implement `extract(audioSamples)`
- [ ] Test robustness against MP3 128kbps compression
- [ ] Compare extraction accuracy vs spread spectrum
- [ ] Update registration to use neural watermark (configurable)
- [ ] Keep spread spectrum as fallback

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 1 (Neural Watermarking)

**Commit Message**: `feat: SilentCipher neural watermarking`

**Verify**:
- Embed → compress to MP3 128k → extract → payload intact
- Confidence score > 0.95

---

### Session 23: WMCodec Fallback

**Goal**: Dual watermarking system with fallback

**Prerequisites**: Session 22 complete

**Tasks**:
- [ ] Integrate WMCodec as secondary watermarker
- [ ] Create `src/ml/wmcodec.js`
- [ ] Update registration to embed both watermarks
- [ ] Update extraction to try SilentCipher first
- [ ] Fall back to WMCodec if primary fails
- [ ] Return which method succeeded in response
- [ ] Test with heavily compressed audio

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 1 (fallback architecture)

**Commit Message**: `feat: WMCodec watermark fallback`

**Verify**:
- Normal extraction → uses SilentCipher
- Heavy compression → falls back to WMCodec
- Response shows `method: "silentcipher"` or `method: "wmcodec"`

---

### Session 24: Content Relationship Detection

**Goal**: Detect covers, remixes, and similar works

**Prerequisites**: Session 23 complete

**Tasks**:
- [ ] Create `src/ml/content-analysis.js`
- [ ] Define similarity thresholds for relationship types
- [ ] Query pgvector for similar MERT embeddings
- [ ] Classify relationships: EXACT_DUPLICATE, TRANSCODED, POSSIBLE_REMIX, POSSIBLE_COVER, STYLISTICALLY_SIMILAR
- [ ] Integrate into verify response as `content_analysis`
- [ ] Create vector index if not exists (for performance)
- [ ] Test with actual similar/cover tracks if available

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 4 (relationship detection)

**Commit Message**: `feat: content relationship detection`

**Verify**:
- Exact duplicate → "EXACT_DUPLICATE"
- Pitch-shifted → "TRANSCODED"
- Different recording, same song → "POSSIBLE_COVER"

**🏁 Phase 4 Complete**: All v2 ML features implemented

---

## Phase 5: Polish & SDK

### Session 25: Enhanced V2 Verification Response

**Goal**: Verification returns full rich v2 response

**Prerequisites**: Session 24 complete

**Tasks**:
- [ ] Update verify handler for v2 response format
- [ ] Add `identity` section (both fingerprint types)
- [ ] Add `watermark` section (method, confidence)
- [ ] Add `registered_metadata` section
- [ ] Add `ai_extracted_metadata` section
- [ ] Add `content_analysis` section (similar works)
- [ ] Add `confidence_summary` section
- [ ] Maintain backward compatibility with v1 clients

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 5 (v2 response format)

**Commit Message**: `feat: enhanced v2 verification response`

**Verify**:
- Response matches full v2 schema
- All sections populated with real data
- v1 clients still work

---

### Session 26: V2 Search & Analysis Endpoints

**Goal**: `POST /orbit/v2/similar` and `POST /orbit/v2/analyze` endpoints

**Prerequisites**: Session 25 complete

**Tasks**:
- [ ] Create `src/api/v2/routes.js` for v2 endpoints
- [ ] **Similarity Search (`POST /orbit/v2/similar`)**:
  - [ ] Accept audio, threshold, limit, include_derivatives parameters
  - [ ] Generate MERT embedding for query audio
  - [ ] Query pgvector for similar embeddings
  - [ ] Return similar works with relationship types and similarity scores
  - [ ] Include query audio's extracted metadata
- [ ] **Standalone Analysis (`POST /orbit/v2/analyze`)**:
  - [ ] Accept audio and optional `include` array (genre, mood, bpm, key, instruments, vocals)
  - [ ] Run CLAP + MERT analysis without registration
  - [ ] Return analysis results with confidence scores
  - [ ] Return embeddings and fingerprint hash
  - [ ] Useful for pre-registration analysis or third-party tools
- [ ] Add both endpoints to API documentation

**Key Implementation**: See `ORBIT_ENHANCEMENTS.md` Section 7 (both endpoints)

**Commit Message**: `feat: v2 similarity search and analysis endpoints`

**Verify**:
- `/similar`: Upload track → get list of similar registered tracks with scores
- `/analyze`: Upload track → get full AI metadata without registration

---

### Session 27: Testing Suite

**Goal**: Comprehensive test suite for CI/CD

**Prerequisites**: Session 26 complete

**Tasks**:
- [ ] Set up Jest as test framework
- [ ] Write unit tests for all engines (fingerprint, watermark, crypto)
- [ ] Write unit tests for ML modules
- [ ] Write integration tests for all API endpoints
- [ ] Create comprehensive test fixtures (audio files)
- [ ] Add `npm test` script
- [ ] Create GitHub Actions workflow for CI
- [ ] Add test coverage reporting

**Install**:
```bash
npm install --save-dev jest supertest
```

**Commit Message**: `test: comprehensive test suite`

**Verify**:
```bash
npm test                    # All tests pass
npm run test:coverage       # Coverage report generated
```

---

### Session 28: Documentation & SDK Publishing

**Goal**: Ready for partners to integrate

**Prerequisites**: Session 27 complete

**Tasks**:
- [ ] Complete README.md with quick start guide
- [ ] Document all API endpoints with examples
- [ ] Document SDK with code samples
- [ ] Create `CONTRIBUTING.md`
- [ ] Update SDK version to 1.0.0
- [ ] Prepare for npm publish (or private registry)
- [ ] Create Dockerfile for easy deployment
- [ ] Create docker-compose.yml for full stack
- [ ] Final code review and cleanup
- [ ] Tag release v1.0.0

**Commit Message**: `docs: complete documentation and SDK v1.0.0`

**Verify**:
- New developer can follow README
- `npm install @ohnrshyp/orbit-sdk` works
- `docker-compose up` spins up full system

**🏁 Phase 5 Complete**: ORBIT v1.0.0 ready for production

---

## Session Reference Card

| Session | Phase | Goal | Spec Reference |
|---------|-------|------|----------------|
| 1 | Setup | Repository & structure | — |
| 2 | Setup | Database & schema | Spec §9 |
| 3 | Core | Fingerprint (Chromaprint) | Spec §7.1 |
| 4 | Core | Fingerprint DB lookup | Spec §9 |
| 5 | Core | Crypto (Ed25519 + CBOR) | Spec §7.3 |
| 6 | Core | Watermark embed | Spec §7.2 |
| 7 | Core | Watermark extract | Spec §7.2 |
| 8 | Core | Audio utilities | — |
| 9 | API | Express + CBOR | Spec §8 |
| 10 | API | Auth middleware | Spec §8 |
| 11 | API | Register endpoint | Spec §8, §10 |
| 12 | API | Verify endpoint | Spec §8 |
| 13 | API | Transfer endpoints | Spec §8 |
| 14 | API | Chain endpoint | Spec §8 |
| 15 | Integration | SDK package | Spec §11 |
| 16 | Integration | Duplicate middleware | Spec §11 |
| 17 | Integration | Registration middleware | Spec §11 |
| 18 | ML | Model infrastructure | Enhance §8 |
| 19 | ML | MERT fingerprinting | Enhance §2 |
| 20 | ML | CLAP classification | Enhance §3 |
| 21 | ML | Auto-metadata extraction | Enhance §3 |
| 22 | ML | SilentCipher watermark | Enhance §1 |
| 23 | ML | WMCodec fallback | Enhance §1 |
| 24 | ML | Content relationship | Enhance §4 |
| 25 | Polish | V2 verify response | Enhance §5 |
| 26 | Polish | Similarity endpoint | Enhance §7 |
| 27 | Polish | Testing suite | — |
| 28 | Polish | Docs & publish | — |

---

## 🔧 Troubleshooting Guide

### Common Issues

| Issue | Solution |
|-------|----------|
| `fpcalc: command not found` | Install Chromaprint: `brew install chromaprint` |
| `ffmpeg: command not found` | Install FFmpeg: `brew install ffmpeg` |
| `Cannot connect to database` | Check PostgreSQL is running, verify DATABASE_URL |
| `pgvector extension not found` | Use `pgvector/pgvector:pg16` Docker image |
| `CBOR decode error` | Ensure Content-Type is `application/cbor` |
| `Signature verification failed` | Check keys are proper Buffers, not strings |
| `Watermark extraction fails` | Verify same secret key used for embed/extract |

### Required External Tools

```bash
# macOS
brew install chromaprint ffmpeg postgresql@16

# Ubuntu/Debian
apt-get install libchromaprint-tools ffmpeg postgresql-16
```

---

## 📝 Session Notes

_Use this section to track notes, blockers, or decisions made during implementation:_

### Session 1 Notes (December 8, 2025)

**Completed:**
- Initialized Node.js project with package.json
- Created full folder structure (src/, tests/, scripts/, sdk/)
- Created .gitignore, .env.example, README.md
- Created Express server with /health and /orbit/v1/info endpoints
- Installed dependencies: express, pg, dotenv, cbor, tweetnacl, nodemon
- Set up GitHub repository and pushed initial commit
- Installed GitHub CLI (`gh`) for authentication
- Installed Docker Desktop for Session 2

**Issues Encountered:**
- npm cache had root-owned files (fixed with full permissions)
- Git created `master` branch while GitHub had `main` (resolved by force-pushing to main and deleting master)
- Docker install needed sudo password in terminal

**Decisions Made:**
- Using Docker for PostgreSQL (scalable, isolated, reproducible)
- Using `main` branch (modern convention)

**Carry Forward:**
- Docker Desktop ready for Session 2
- Next: Create docker-compose.yml with PostgreSQL + pgvector

---

### Session Notes Template:
```
## Session X Notes (Date)

**Completed:**
- 

**Issues Encountered:**
- 

**Decisions Made:**
- 

**Carry Forward:**
- 
```

---

## Document Maintenance

**Update this document when:**
- Completing a session (change status to ✅)
- Encountering blockers (add to troubleshooting)
- Making architectural decisions (add to notes)
- Changing dependencies (update install commands)

**Last Updated**: _Update this date when modifying the roadmap_

---

*This roadmap is the source of truth for ORBIT implementation progress.*

