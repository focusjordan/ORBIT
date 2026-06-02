# @ohnrshyp/ledger

ORBIT Standalone Ledger, Cryptography, and Database Query Package.

This package manages the serialization, signature validation, and database operations for the ORBIT append-only chain of custody ledger.

---

## Features

- 🔐 **Ed25519 Cryptography**: Generates keypairs, signs registration payloads, and validates provenance transactions.
- 📦 **CBOR Serialization**: Encodes structured transaction data into compact binary payloads (~400 bytes, RFC 8949 compliant) for embedding or low-bandwidth transfer.
- 🐘 **Database Interface**: Comprehensive PostgreSQL query wrappers for managing platform identities, registrations, transfers, and vector indexes.
- 🔍 **Vector Search**: Integrated support for `pgvector` similarity lookup queries (e.g., finding tracks matching a given audio embedding).

---

## Installation

Install via npm:
```bash
npm install @ohnrshyp/ledger
```

---

## Usage

### 1. Configure the Database
The package operates on an active PostgreSQL database. Set the active `pg` Pool dynamically at application startup:

```javascript
const ledger = require('@ohnrshyp/ledger');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize database pool
ledger.setPool(pool);
```

### 2. Querying Registrations
Perform standard database lookups:

```javascript
// Find registrations by exact audio fingerprint hash
const entries = await ledger.queries.findByFingerprint(fingerprintBuffer);

// Insert a new registration entry
const newReg = await ledger.queries.insertRegistration({
  fingerprint_hash: fingerprintBuffer,
  title: 'Midnight Drive',
  artist: 'Neon',
  owner_id: 'user-uuid',
  origin_platform: 'platform-id',
  origin_signature: signatureBuffer,
  payload_cbor: cborBuffer,
  entry_hash: entryHashBuffer
});
```

### 3. Vector Similarity Queries
Perform vector search via `pgvector`:

```javascript
const similarTracks = await ledger.queries.findSimilarByEmbedding(embeddingArray, {
  threshold: 0.7, // minimum similarity score
  limit: 5
});
```

### 4. Cryptography Operations
Sign payloads and verify platform identities:

```javascript
const { crypto } = require('@ohnrshyp/ledger');

// Encode metadata to binary CBOR representation
const cborPayload = crypto.encodeCBOR({ title: 'Song', artist: 'Artist' });

// Sign the payload using a 64-byte Ed25519 private key
const signature = crypto.signPayload(cborPayload, privateKeyBuffer);

// Verify signature authenticity
const isValid = crypto.verifySignature(cborPayload, signature, publicKeyBuffer);
```

---

## File Structure

- [src/index.js](src/index.js): Main configuration (`setPool`) and PostgreSQL query mapping.
- [src/crypto.js](src/crypto.js): CBOR encoding helpers and Ed25519 signature wrappers.
