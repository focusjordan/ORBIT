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

-- Audio registrations (full B2B metadata schema)
CREATE TABLE IF NOT EXISTS orbit_registrations (
  id BIGSERIAL PRIMARY KEY,
  
  -- Fingerprint
  fingerprint_hash BYTEA NOT NULL,
  fingerprint_raw TEXT,
  
  -- Watermark reference
  watermark_hash BYTEA NOT NULL,
  
  -- Core metadata (indexed for search)
  isrc VARCHAR(12),
  upc VARCHAR(14),
  title VARCHAR(512) NOT NULL,
  artist VARCHAR(512) NOT NULL,
  duration_ms INTEGER NOT NULL,
  p_line VARCHAR(256),                    -- ℗ Sound recording copyright
  c_line VARCHAR(256),                    -- © Composition copyright
  primary_genre VARCHAR(64),
  language VARCHAR(8),                    -- ISO 639-1
  
  -- Technical metadata
  bitrate INTEGER,
  sample_rate INTEGER,
  channels SMALLINT,
  format VARCHAR(8),
  
  -- Extended metadata
  album_title VARCHAR(512),
  track_number SMALLINT,
  secondary_genre VARCHAR(64),
  release_date DATE,
  original_release_date DATE,
  label VARCHAR(256),
  catalog_number VARCHAR(64),
  version VARCHAR(64),                    -- "Live", "Remix", etc.
  parental_advisory VARCHAR(16),          -- "explicit", "clean", "none"
  
  -- Contributors (JSONB arrays)
  featured_artists JSONB,
  composers JSONB,
  lyricists JSONB,
  writers JSONB,
  producers JSONB,
  remixer VARCHAR(256),
  recording_location VARCHAR(256),
  recording_year SMALLINT,
  
  -- Rights & Distribution
  iswc VARCHAR(15),
  territories JSONB,                      -- ["US", "GB", "WW", ...]
  preview_start_ms INTEGER,
  
  -- Ownership (TEXT to support various ID formats: UUIDs, MongoDB ObjectIds, etc.)
  owner_id TEXT NOT NULL,
  origin_platform VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  origin_timestamp TIMESTAMPTZ NOT NULL,
  origin_signature BYTEA NOT NULL,
  
  -- Full CBOR payload
  payload_cbor BYTEA NOT NULL,
  
  -- Chain integrity
  prev_entry_hash BYTEA,
  entry_hash BYTEA NOT NULL,
  
  -- ML embeddings (v2)
  audio_embedding vector(512),            -- CLAP
  metadata_embedding vector(384),         -- Sentence transformer
  mert_embedding vector(768),             -- MERT semantic fingerprint
  
  -- AI-extracted metadata (v2)
  ai_metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_fingerprint_platform UNIQUE (fingerprint_hash, origin_platform),
  CONSTRAINT valid_parental_advisory CHECK (parental_advisory IN ('explicit', 'clean', 'none') OR parental_advisory IS NULL)
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

-- Vector indexes for similarity search (Session 24)
-- Using IVFFlat for approximate nearest neighbor search
-- Note: For best performance, rebuild after loading initial data:
--   REINDEX INDEX idx_orbit_mert_embedding;
CREATE INDEX IF NOT EXISTS idx_orbit_mert_embedding ON orbit_registrations 
  USING ivfflat (mert_embedding vector_cosine_ops) WITH (lists = 100);
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
      ORDER BY table_name
    `);
    
    console.log('\n📋 Created tables:');
    tables.rows.forEach(row => console.log(`   - ${row.table_name}`));
    
    // Verify extensions
    const extensions = await pool.query(`
      SELECT extname 
      FROM pg_extension 
      WHERE extname IN ('uuid-ossp', 'pgcrypto', 'vector')
      ORDER BY extname
    `);
    
    console.log('\n🔌 Installed extensions:');
    extensions.rows.forEach(row => console.log(`   - ${row.extname}`));
    
    console.log('\n✨ Database ready for ORBIT operations!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
