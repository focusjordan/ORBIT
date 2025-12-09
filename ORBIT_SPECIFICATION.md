# ORBIT: Origin-Based Identity & Rights Transfer Protocol

## Complete Technical Specification & Implementation Guide

**Version**: 1.0.0  
**Created**: December 8, 2025  
**Status**: In Development - Phase 2 (API Layer) In Progress  
**Parent Project**: Ohnrshyp Music Platform  
**Target Timeline**: 1-3 Months  
**Implementation Progress**: Sessions 1-9 complete (Phase 1 Core Engines + Phase 2 API foundation with Express server and CBOR middleware)  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem We're Solving](#2-the-problem-were-solving)
3. [How We Arrived at This Solution](#3-how-we-arrived-at-this-solution)
4. [Core Philosophy & Principles](#4-core-philosophy--principles)
5. [Stated Goals & Verification](#5-stated-goals--verification)
6. [System Architecture](#6-system-architecture)
7. [Technical Components](#7-technical-components)
8. [API Specification](#8-api-specification)
9. [Database Schema](#9-database-schema)
10. [Code Implementation](#10-code-implementation)
11. [Ohnrshyp Integration](#11-ohnrshyp-integration)
12. [Zero-Shot ML Enhancements](#12-zero-shot-ml-enhancements)
13. [Development Timeline](#13-development-timeline)
14. [Licensing & Business Model](#14-licensing--business-model)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Testing Strategy](#16-testing-strategy)
17. [Future Considerations](#17-future-considerations)
18. [Appendix: Ohnrshyp Context](#18-appendix-ohnrshyp-context)

---

## 1. Executive Summary

### What is ORBIT?

ORBIT (Origin-Based Identity & Rights Transfer Protocol) is a novel audio provenance and metadata transfer system that:

- **Embeds identity directly into audio files** via algorithmic watermarking
- **Replaces DDEX/XML** with a simpler binary protocol (CBOR)
- **Proves chain of custody** through cryptographic signatures
- **Enables B2B transfers** between platforms without schema negotiation
- **Detects duplicates** via acoustic fingerprinting
- **Requires no model training** — uses pre-trained models for optional semantic search

### The Core Innovation

**The audio file IS the message.**

Unlike DDEX (where metadata travels in separate XML files) or Content ID (where fingerprints exist only in a central database), ORBIT embeds a cryptographically-signed payload directly into the audio signal. The audio carries its own identity, ownership, and transfer history wherever it travels.

### Why This Matters

1. **For Ohnrshyp**: Native integration provides provenance verification for all uploads, duplicate detection, and creates market leverage if widely adopted
2. **For the Industry**: A simpler, modern alternative to DDEX's 50+ page XML specifications
3. **For Partners**: Licensable API/SDK enables any platform to verify and transfer audio with cryptographic proof

### Key Differentiators

| Feature | DDEX | Content ID | ORBIT |
|---------|------|------------|-------|
| Format | XML (verbose, 5-10KB) | Proprietary | **CBOR binary (~400 bytes)** |
| Metadata location | Sidecar file | Reference DB only | **Embedded in audio** |
| Duplicate detection | ISRC lookup | Fingerprint | **Fingerprint + watermark** |
| Chain of custody | Trust-based | YouTube-only | **Cryptographic proof** |
| Schema evolution | Breaking changes | N/A | **Version field, backward compatible** |
| Open standard | Consortium-controlled | Closed | **Open verification SDK** |
| Semantic search | ❌ | ❌ | **✅ (zero-shot ML)** |

---

## 2. The Problem We're Solving

### DDEX Limitations

DDEX (Digital Data Exchange) is the industry standard for music metadata exchange, but it has significant problems:

1. **Complexity**: ERN (Electronic Release Notification) specifications run 50+ pages of XML schema documentation
2. **Verbosity**: A single release's metadata can be 5-10KB of XML
3. **Schema Hell**: Different versions (ERN 3.x, 4.x) cause compatibility nightmares
4. **No Embedded Identity**: Metadata travels separately from audio — can be lost, corrupted, or stripped
5. **Trust-Based**: No cryptographic verification of who sent what
6. **Consortium-Controlled**: Slow evolution, expensive compliance

### ISRC/UPC Fragility

Current identifiers have fundamental problems:

- **Strippable**: ISRCs live in ID3 tags — easily removed or corrupted
- **Duplicable**: Same ISRC assigned to multiple recordings (happens frequently)
- **No Provenance**: An ISRC tells you nothing about who uploaded a file or when
- **No Chain**: No record of how a file traveled between systems

### Content ID Limitations

YouTube's Content ID solves some problems but creates others:

- **Closed System**: Only works within YouTube
- **No Embedded Data**: Fingerprints are external, audio carries nothing
- **No Transfer Protocol**: Can't send verified audio between platforms
- **Not Licensable**: Can't use it for your own platform

### The Gap ORBIT Fills

There's no existing system that:
1. Embeds identity INTO the audio
2. Uses cryptographic signatures for proof
3. Works across platforms via open API
4. Replaces complex XML with simple binary
5. Provides semantic similarity search

**ORBIT fills this gap.**

---

## 3. How We Arrived at This Solution

### Synthesis Journey

This specification emerged from a structured analysis:

#### Step 1: Understanding the Landscape

We researched:
- **DDEX**: XML-based B2B metadata exchange standard
- **Content ID**: YouTube's fingerprinting + policy enforcement system
- **Audio Watermarking**: Steganographic embedding of data into audio signals
- **Chromaprint/AcoustID**: Open-source audio fingerprinting
- **ISRC/UPC**: Current identifier systems and their limitations

#### Step 2: Identifying the Novel Opportunity

The insight: **No system combines all of these**:
- Fingerprinting (what the audio IS)
- Watermarking (what's embedded IN the audio)
- Cryptographic signing (who put it there)
- Binary protocol (simple, not XML/JSON)
- Open API (licensable, multi-platform)

#### Step 3: Eliminating Complexity

Original concepts included:
- Custom-trained neural fingerprint models
- Neural metadata codec (autoencoder for metadata compression)
- Complex Merkle tree implementations

We simplified to:
- **Chromaprint**: Battle-tested, algorithmic, no training
- **CBOR**: Binary format, RFC standard, existing libraries
- **Spread Spectrum**: Pure signal processing, no ML dependencies
- **Simple append-only ledger**: PostgreSQL with periodic Merkle roots

#### Step 4: Ensuring Feasibility

Constraints applied:
- 1-3 month development timeline
- No custom model training
- No Meta/Facebook dependencies
- MERN stack compatibility with Ohnrshyp
- Must be licensable as standalone product

#### Step 5: Finalizing Design

The result: A system using only:
- **Chromaprint** (algorithmic fingerprinting)
- **Spread Spectrum** (algorithmic watermarking)
- **CBOR** (binary encoding)
- **Ed25519** (cryptographic signing)
- **PostgreSQL** (ledger storage)
- **LAION CLAP** (optional zero-shot semantic search)

---

## 4. Core Philosophy & Principles

### Principle 1: The Audio IS the Message

No sidecar files. No external metadata documents. The audio file carries:
- Its fingerprint (inherent to the audio content)
- Its identity payload (watermarked into the signal)
- Its ownership proof (cryptographic signature in payload)

### Principle 2: Binary, Not Text

CBOR instead of JSON/XML:
- 30-50% smaller
- No parsing ambiguity
- Native binary data support
- Self-describing (no external schema required)

### Principle 3: Cryptographic Proof, Not Trust

Every registration and transfer is signed with Ed25519:
- Platform signs registrations with its private key
- Transfers require signatures from both parties
- Anyone can verify with public keys
- Ledger provides non-repudiation

### Principle 4: Simple API Surface

Five endpoints cover 95% of use cases:
1. `POST /register` — Register new audio
2. `POST /verify` — Verify audio provenance
3. `POST /transfer` — Initiate B2B transfer
4. `POST /accept` — Accept incoming transfer
5. `GET /chain/:fingerprint` — Get full custody chain

### Principle 5: No Training Required

All ML is inference-only on pre-trained models:
- LAION CLAP for semantic audio similarity
- Sentence Transformers for metadata search
- Models downloaded once, used forever

### Principle 6: Graceful Degradation

If watermark is damaged:
- Fingerprint still identifies the audio
- Ledger lookup still works
- Only embedded chain is lost (ledger chain remains)

---

## 5. Stated Goals & Verification

### Original Objectives

These goals were explicitly stated during design:

| # | Goal | Solution | Status |
|---|------|----------|--------|
| 1 | Verify file provenance, detect duplicates | Chromaprint fingerprint + ledger lookup | ✅ |
| 2 | Fingerprint across internal and B2B channels | Same algorithm everywhere, shared ledger | ✅ |
| 3 | Embed metadata readable by receiving system | CBOR in spread spectrum watermark | ✅ |
| 4 | Provable chain of custody (simpler than DDEX) | Ed25519 signatures, append-only ledger | ✅ |
| 5 | Avoid DDEX/JSON, use ML/AI enhancements | CBOR binary, zero-shot CLAP | ✅ |
| 6 | Simple, safe, secure, novel | 5 endpoints, standard crypto, unique approach | ✅ |
| 7 | Ohnrshyp integration + market leverage | Native middleware, licensable tiers | ✅ |
| 8 | Avoid Meta dependencies | Spread spectrum (no AudioSeal), LAION CLAP | ✅ |
| 9 | No model training required | All ML is inference-only | ✅ |
| 10 | 1-3 month timeline | Phased delivery, MVP in month 1 | ✅ |
| 11 | Transfer core metadata (ISRC, UPC, etc.) | Full schema defined | ✅ |
| 12 | Licensable API/Portal | Tiered model defined | ✅ |

### Metadata Fields Supported

These fields align with DDEX ERN standards and DSP requirements (Spotify, Apple Music, etc.).

**Core (Required)**:
| Field | Type | Description |
|-------|------|-------------|
| `isrc` | String | International Standard Recording Code |
| `upc` | String | Universal Product Code (release-level) |
| `title` | String | Track title |
| `artist` | String | Primary artist name |
| `duration_ms` | Integer | Duration in milliseconds |
| `p_line` | String | ℗ Sound recording copyright (e.g., "2024 Label Name") |
| `c_line` | String | © Composition copyright (e.g., "2024 Publisher") |
| `primary_genre` | String | Primary genre classification |
| `language` | String | ISO 639-1 language code (e.g., "en", "es") |

**Technical (Auto-extracted)**:
| Field | Type | Description |
|-------|------|-------------|
| `bitrate` | Integer | Audio bitrate in kbps |
| `sample_rate` | Integer | Sample rate in Hz (e.g., 44100) |
| `channels` | Integer | Number of audio channels (1=mono, 2=stereo) |
| `format` | String | File format (flac, wav, mp3, aac) |

**Ownership**:
| Field | Type | Description |
|-------|------|-------------|
| `owner_id` | UUID | Unique identifier of the registering owner |
| `origin_platform` | String | Platform ID where first registered |
| `origin_timestamp` | Timestamp | When originally registered |
| `origin_signature` | Bytes | Ed25519 signature (64 bytes) |

**Extended (Optional)**:
| Field | Type | Description |
|-------|------|-------------|
| `album_title` | String | Album/EP name |
| `track_number` | Integer | Position on album |
| `secondary_genre` | String | Additional genre |
| `release_date` | String | Original release date (ISO 8601) |
| `original_release_date` | String | For re-releases/remasters |
| `label` | String | Record label name |
| `catalog_number` | String | Label catalog ID |
| `version` | String | Track version ("Live", "Acoustic", "Remix", etc.) |
| `parental_advisory` | String | "explicit", "clean", or "none" |

**Contributors (Optional Arrays)**:
| Field | Type | Description |
|-------|------|-------------|
| `featured_artists` | Array | Featured artist names |
| `composers` | Array | Music composers |
| `lyricists` | Array | Lyric writers |
| `writers` | Array | Songwriters (if not splitting composer/lyricist) |
| `producers` | Array | Producers |
| `remixer` | String | Remixer name (if applicable) |
| `recording_location` | String | Studio or recording location |
| `recording_year` | Integer | Year of recording |

**Rights & Distribution (Optional)**:
| Field | Type | Description |
|-------|------|-------------|
| `iswc` | String | International Standard Musical Work Code (composition) |
| `territories` | Array | ISO 3166-1 alpha-2 country codes for availability |
| `preview_start_ms` | Integer | Start time for 30-second preview |

**AI-Extracted (v2, Auto-populated)**:
| Field | Type | Description |
|-------|------|-------------|
| `ai_genre` | Array | AI-detected genres with confidence scores |
| `ai_mood` | Array | AI-detected moods with confidence scores |
| `ai_bpm` | Object | `{value: 120, confidence: 0.95}` |
| `ai_key` | Object | `{value: "A minor", confidence: 0.88}` |
| `ai_instruments` | Array | Detected instruments with confidence |
| `ai_vocals` | Object | `{present: true, confidence: 0.92}` |

---

## 6. System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORBIT SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         ORBIT CORE                                   │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │                                                                     │  │
│   │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │  │
│   │  │ FINGERPRINT │   │  WATERMARK  │   │   CRYPTO    │              │  │
│   │  │   ENGINE    │   │   ENGINE    │   │   ENGINE    │              │  │
│   │  │             │   │             │   │             │              │  │
│   │  │ Chromaprint │   │  Spread     │   │  Ed25519    │              │  │
│   │  │ (Algorithm) │   │  Spectrum   │   │  CBOR       │              │  │
│   │  │             │   │  (Algorithm)│   │  SHA-256    │              │  │
│   │  └─────────────┘   └─────────────┘   └─────────────┘              │  │
│   │         │                 │                 │                      │  │
│   │         └─────────────────┴─────────────────┘                      │  │
│   │                           │                                        │  │
│   │                   ┌───────┴───────┐                               │  │
│   │                   │  ORBIT LEDGER │                               │  │
│   │                   │  (PostgreSQL) │                               │  │
│   │                   └───────────────┘                               │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                       ORBIT API LAYER                               │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │                                                                     │  │
│   │  POST /orbit/v1/register     - Register new audio                  │  │
│   │  POST /orbit/v1/verify       - Verify audio provenance             │  │
│   │  POST /orbit/v1/transfer     - Initiate B2B transfer               │  │
│   │  POST /orbit/v1/accept       - Accept incoming transfer            │  │
│   │  GET  /orbit/v1/chain/:fp    - Get full custody chain              │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    ZERO-SHOT ML LAYER (Optional)                    │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │                                                                     │  │
│   │  ┌─────────────┐   ┌─────────────┐                                │  │
│   │  │    CLAP     │   │  Sentence   │   Pre-trained, inference only  │  │
│   │  │   (LAION)   │   │ Transformers│   No Meta dependencies         │  │
│   │  │             │   │             │                                │  │
│   │  │  Semantic   │   │  Metadata   │                                │  │
│   │  │  Similarity │   │  Embedding  │                                │  │
│   │  └─────────────┘   └─────────────┘                                │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Registration

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Audio   │────▶│  Fingerprint │────▶│   Watermark  │────▶│   Ledger     │
│  Upload  │     │   Engine     │     │   Engine     │     │   Write      │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                        │                    │                     │
                        ▼                    ▼                     ▼
                 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                 │  Chromaprint │     │ Embed CBOR   │     │  Store Full  │
                 │  Hash (32B)  │     │ Payload      │     │  Metadata    │
                 └──────────────┘     └──────────────┘     └──────────────┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │  Watermarked │
                                      │  Audio Out   │
                                      └──────────────┘
```

### Data Flow: Verification

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Audio   │────▶│  Fingerprint │────▶│   Watermark  │────▶│   Ledger     │
│  Input   │     │   Extract    │     │   Extract    │     │   Lookup     │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                        │                    │                     │
                        ▼                    ▼                     ▼
                 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                 │  Match Hash  │     │ Decode CBOR  │     │  Get Chain   │
                 │  In Ledger   │     │ Verify Sig   │     │  History     │
                 └──────────────┘     └──────────────┘     └──────────────┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │  Provenance  │
                                      │  Report      │
                                      └──────────────┘
```

### Data Flow: B2B Transfer

```
   SENDER                      ORBIT                     RECIPIENT
     │                           │                           │
     │  1. Initiate transfer     │                           │
     │  (registration_id, sig)   │                           │
     │ ─────────────────────────▶│                           │
     │                           │                           │
     │                           │  2. Notify recipient      │
     │                           │  (webhook)                │
     │                           │ ─────────────────────────▶│
     │                           │                           │
     │                           │  3. Accept transfer       │
     │                           │  (transfer_id, sig)       │
     │                           │◀───────────────────────── │
     │                           │                           │
     │                           │  4. Re-watermark with     │
     │                           │  extended chain           │
     │                           │ ─────────────────────────▶│
     │                           │                           │
     │  5. Confirm complete      │                           │
     │◀───────────────────────── │                           │
     │                           │                           │
```

---

## 7. Technical Components

### 7.1 Fingerprint Engine (Chromaprint)

**Technology**: Chromaprint — algorithmic audio fingerprinting

**Why Chromaprint**:
- Battle-tested (powers AcoustID/MusicBrainz with 100M+ fingerprints)
- Pure DSP algorithm (no ML, no training)
- Open source (LGPL 2.1)
- Survives: compression, transcoding, minor edits, noise
- Generates compact hashes for efficient comparison

**How It Works**:
1. Resample audio to mono 11,025 Hz
2. Divide into overlapping frames
3. Apply FFT to extract frequency components
4. Compute chroma features (pitch class representation)
5. Generate 32-bit sub-fingerprint per frame
6. Combine into final fingerprint string

**Installation**:
```bash
# macOS
brew install chromaprint

# Ubuntu/Debian
apt-get install libchromaprint-tools

# Verify installation
fpcalc -version
```

**Output**:
- Raw fingerprint: Variable-length string of 32-bit integers
- Duration: Audio length in seconds
- For ORBIT: SHA-256 hash of raw fingerprint (32 bytes) for indexing

---

### 7.2 Watermark Engine (Spread Spectrum)

**Technology**: Spread Spectrum Watermarking — pure signal processing

**Why Spread Spectrum (Not AudioSeal)**:
- No external dependencies (no Meta/Facebook)
- Well-documented academic technique
- Patent-free (original patents expired)
- Implementable from scratch in ~200 lines
- Proven robustness against compression/transcoding

**How It Works**:
1. Generate pseudo-random noise sequence from secret key (unique per offset)
2. Multiply noise by payload bit value (+1 or -1)
3. Add low-amplitude noise to audio samples
4. Repeat embedding at intervals (every 30 seconds) for redundancy
5. To extract: Correlate audio with same noise sequence at multiple offsets
6. Correlation sign reveals original bit value
7. Offset search enables detection in clips/snippets

**Parameters**:
- **Chip Rate**: 1000 samples per bit (tunable)
- **Embed Strength**: 0.005 amplitude (loudness-aware, adaptive)
- **Repeat Interval**: 30 seconds (embeds watermark multiple times)
- **Search Interval**: 5 seconds (offset search granularity)
- **At 44.1kHz**: ~44 bits/second = ~5 bytes/second
- **3-minute track**: ~900 bytes capacity, 6 embedded instances

**Watermark Payload Structure** (64-128 bytes):

```
┌─────────────────────────────────────────────────────────────┐
│              ORBIT WATERMARK PAYLOAD                        │
├─────────────────────────────────────────────────────────────┤
│ Magic bytes: "ORBT" (4 bytes)                               │
│ Version: uint8 (1 byte)                                     │
│ Payload hash: SHA-256 truncated (16 bytes)                  │
│ Origin platform ID hash (8 bytes)                           │
│ Timestamp: uint48 (6 bytes)                                 │
│ Checksum: CRC16 (2 bytes)                                   │
├─────────────────────────────────────────────────────────────┤
│ Total: 37 bytes minimum                                     │
│ Links to full metadata in ORBIT Ledger                      │
└─────────────────────────────────────────────────────────────┘
```

---

### 7.3 Crypto Engine

**Technologies**:
- **Ed25519**: Digital signatures (via TweetNaCl)
- **SHA-256**: Hashing
- **CBOR**: Binary encoding (RFC 8949)

**Why Ed25519**:
- Fast (sign: 15,000/sec, verify: 8,000/sec)
- Secure (128-bit security level)
- Small keys (32 bytes public, 64 bytes private)
- Small signatures (64 bytes)
- Deterministic (same message + key = same signature)
- Widely supported (TweetNaCl, libsodium, OpenSSL)

**Why CBOR (Not JSON)**:
- Binary (not text) — 30-50% smaller
- Native binary data — no Base64 bloat
- Self-describing — no external schema required
- RFC 8949 standard — not proprietary
- Libraries in every language

**Payload Encoding**:

```javascript
// CBOR-encoded ORBIT payload (full example)
{
  _v: 1,                              // Protocol version
  _t: 'registration',                 // Message type
  
  // Core metadata (required)
  isrc: 'USRC12345678',
  upc: '012345678901',
  title: 'Midnight Drive',
  artist: 'The Neon Collective',
  duration_ms: 234567,
  p_line: '2024 Neon Records',
  c_line: '2024 Neon Publishing',
  primary_genre: 'Electronic',
  language: 'en',
  
  // Technical (auto-extracted)
  bitrate: 320,
  sample_rate: 44100,
  channels: 2,
  format: 'flac',
  
  // Extended (optional, included if provided)
  album_title: 'Night Visions',
  track_number: 3,
  secondary_genre: 'Synthwave',
  release_date: '2024-12-15',
  label: 'Neon Records',
  version: null,                      // Not a remix/live version
  parental_advisory: 'none',
  
  // Contributors
  featured_artists: ['Guest Singer'],
  composers: ['J. Smith', 'A. Jones'],
  lyricists: ['J. Smith'],
  producers: ['M. Producer'],
  
  // Rights
  territories: ['US', 'GB', 'DE', 'FR', 'WW'],  // WW = worldwide
  preview_start_ms: 45000,
  
  // Ownership
  owner_id: <16-byte UUID>,
  origin_platform: 'ohnrshyp',
  origin_timestamp: 1733680000000,
  
  // Fingerprint
  fingerprint: <32-byte hash>,
  
  // AI-extracted (v2, added automatically)
  ai: {
    genre: [{label: 'electronic', confidence: 0.92}],
    mood: [{label: 'energetic', confidence: 0.85}],
    bpm: {value: 120, confidence: 0.97},
    key: {value: 'A minor', confidence: 0.88},
    instruments: [{label: 'synthesizer', confidence: 0.94}],
    vocals: {present: true, confidence: 0.91}
  },
  
  // Signature (added last, signs everything above)
  signature: <64-byte Ed25519 signature>
}

// Encoded size: ~600-800 bytes with full metadata (vs ~6KB+ DDEX XML)
```

---

### 7.4 Ledger (PostgreSQL)

**Why PostgreSQL (Not MongoDB)**:
- ACID transactions for append-only integrity
- Sequential IDs for Merkle chain ordering
- pgvector extension for similarity search
- Better suited for audit/financial-style logs
- Ohnrshyp continues using MongoDB for its data; ORBIT has separate DB

**Key Tables**:
1. `orbit_platforms` — Registered platforms with public keys
2. `orbit_registrations` — Audio registrations with full metadata
3. `orbit_transfers` — Transfer events between platforms
4. `orbit_merkle_roots` — Periodic integrity checkpoints

**Merkle Root Calculation**:
- Computed periodically (daily or on-demand)
- Published to public record for external verification
- Provides proof of inclusion for any registration

---

## 8. API Specification

### Content Type

All requests and responses use `Content-Type: application/cbor`

For debugging, `Accept: application/cbor-diagnostic` returns human-readable CBOR.

### Authentication

```
Headers:
  X-ORBIT-Platform: <platform_id>
  X-ORBIT-Signature: <ed25519_signature_of_request_body>
  X-ORBIT-API-Key: <api_key>  (for rate limiting/billing)
```

### Endpoints

#### POST /orbit/v1/register

Register new audio with ORBIT.

**Request**:
```cbor
{
  audio: <binary>,              // Raw audio file bytes
  metadata: {
    // Core (required)
    title: "Track Name",
    artist: "Artist Name",
    duration_ms: 234567,
    p_line: "2024 Label Name",
    c_line: "2024 Publisher Name",
    primary_genre: "Electronic",
    language: "en",
    
    // Identifiers (recommended)
    isrc: "USRC12345678",
    upc: "012345678901",
    
    // Technical (auto-extracted if not provided)
    bitrate: 320,
    sample_rate: 44100,
    channels: 2,
    format: "flac",
    
    // Extended (all optional)
    album_title: "Album Name",
    track_number: 1,
    secondary_genre: "Synthwave",
    release_date: "2024-12-08",
    label: "Independent",
    catalog_number: "NEON-001",
    version: null,              // "Live", "Acoustic", "Remix", etc.
    parental_advisory: "none",  // "explicit", "clean", "none"
    
    // Contributors (optional)
    featured_artists: ["Featured Artist"],
    composers: ["Composer 1"],
    lyricists: ["Lyricist 1"],
    writers: ["Writer 1"],
    producers: ["Producer 1"],
    
    // Rights (optional)
    territories: ["US", "GB", "WW"],
    preview_start_ms: 30000
  },
  owner_id: <uuid>              // Owner's user ID
}
```

**Response**:
```cbor
{
  success: true,
  registration_id: 12345,
  fingerprint_hash: <32 bytes>,
  watermark_hash: <16 bytes>,
  watermarked_audio: <binary>,  // Audio with embedded payload
  entry_hash: <32 bytes>,
  registered_at: "2024-12-08T12:00:00Z"
}
```

---

#### POST /orbit/v1/verify

Verify audio provenance and extract metadata.

**Request**:
```cbor
{
  audio: <binary>               // Audio file to verify
}
```

**Response**:
```cbor
{
  verified: true,
  fingerprint_hash: <32 bytes>,
  fingerprint_match: {
    registration_id: 12345,
    similarity: 0.98            // 1.0 = exact match
  },
  watermark: {
    detected: true,
    valid: true,
    payload_hash: <16 bytes>
  },
  metadata: {
    isrc: "USRC12345678",
    title: "Track Name",
    artist: "Artist Name",
    // ... full metadata
  },
  origin: {
    platform: "ohnrshyp",
    owner_id: <uuid>,
    timestamp: "2024-12-08T12:00:00Z",
    signature_valid: true
  },
  transfers: [
    {
      from: "ohnrshyp",
      to: "partner_dsp",
      timestamp: "2024-12-09T10:00:00Z",
      from_signature_valid: true,
      to_signature_valid: true
    }
  ],
  duplicate_of: null            // or registration_id if duplicate
}
```

---

#### POST /orbit/v1/transfer

Initiate B2B transfer to another platform.

**Request**:
```cbor
{
  registration_id: 12345,
  to_platform: "recipient_platform_id"
}
```

**Response**:
```cbor
{
  success: true,
  transfer_id: 67890,
  status: "pending",
  expires_at: "2024-12-15T12:00:00Z",
  recipient_notified: true
}
```

---

#### POST /orbit/v1/accept

Accept incoming transfer.

**Request**:
```cbor
{
  transfer_id: 67890
}
```

**Response**:
```cbor
{
  success: true,
  accepted: true,
  new_registration_id: 12346,
  watermarked_audio: <binary>,  // Re-watermarked with updated chain
  metadata: { ... },
  full_chain: [
    { platform: "ohnrshyp", timestamp: "...", type: "origin" },
    { platform: "recipient", timestamp: "...", type: "transfer" }
  ]
}
```

---

#### GET /orbit/v1/chain/:fingerprint_hash

Get full custody chain for a fingerprint.

**Response**:
```cbor
{
  fingerprint_hash: <32 bytes>,
  registrations: [
    {
      registration_id: 12345,
      platform: "ohnrshyp",
      timestamp: "2024-12-08T12:00:00Z",
      metadata: { ... },
      signature_valid: true
    }
  ],
  transfers: [
    {
      transfer_id: 67890,
      from: "ohnrshyp",
      to: "recipient",
      timestamp: "2024-12-09T10:00:00Z",
      status: "accepted"
    }
  ],
  merkle_proof: {
    root_hash: <32 bytes>,
    path: [ ... ],              // Proof of inclusion
    root_published_at: "2024-12-08T00:00:00Z"
  }
}
```

---

## 9. Database Schema

### PostgreSQL Schema

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- For ML similarity search

-- Platform registry (licensed partners)
CREATE TABLE orbit_platforms (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  public_key BYTEA NOT NULL,              -- Ed25519 public key (32 bytes)
  api_key_hash BYTEA NOT NULL,            -- Hashed API key
  webhook_url VARCHAR(512),               -- For transfer notifications
  tier VARCHAR(16) DEFAULT 'basic',       -- basic, partner, full, enterprise
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  
  CONSTRAINT valid_tier CHECK (tier IN ('basic', 'partner', 'full', 'enterprise'))
);

-- Audio registrations
CREATE TABLE orbit_registrations (
  id BIGSERIAL PRIMARY KEY,
  
  -- Fingerprint
  fingerprint_hash BYTEA NOT NULL,        -- 32-byte SHA-256 of Chromaprint
  fingerprint_raw TEXT,                   -- Full Chromaprint for precise matching
  
  -- Watermark reference
  watermark_hash BYTEA NOT NULL,          -- Hash of embedded payload (16 bytes)
  
  -- Core metadata (indexed for search)
  isrc VARCHAR(12),
  upc VARCHAR(14),
  title VARCHAR(512) NOT NULL,
  artist VARCHAR(512) NOT NULL,
  duration_ms INTEGER NOT NULL,
  p_line VARCHAR(256),                    -- ℗ Sound recording copyright
  c_line VARCHAR(256),                    -- © Composition copyright
  primary_genre VARCHAR(64),
  language VARCHAR(8),                    -- ISO 639-1 code
  
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
  version VARCHAR(64),                    -- "Live", "Acoustic", "Remix", etc.
  parental_advisory VARCHAR(16),          -- "explicit", "clean", "none"
  
  -- Contributors (JSONB for flexibility)
  featured_artists JSONB,                 -- ["Artist 1", "Artist 2"]
  composers JSONB,                        -- ["Composer 1"]
  lyricists JSONB,                        -- ["Lyricist 1"]
  writers JSONB,                          -- ["Writer 1"]
  producers JSONB,                        -- ["Producer 1"]
  remixer VARCHAR(256),
  recording_location VARCHAR(256),
  recording_year SMALLINT,
  
  -- Rights & Distribution
  iswc VARCHAR(15),                       -- T-123.456.789-C format
  territories JSONB,                      -- ["US", "GB", "DE", ...]
  preview_start_ms INTEGER,
  
  -- Ownership
  owner_id UUID NOT NULL,
  origin_platform VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  origin_timestamp TIMESTAMPTZ NOT NULL,
  origin_signature BYTEA NOT NULL,        -- Ed25519 signature (64 bytes)
  
  -- Full CBOR payload (contains all metadata for verification)
  payload_cbor BYTEA NOT NULL,
  
  -- Chain integrity
  prev_entry_hash BYTEA,                  -- Hash of previous entry (for chain)
  entry_hash BYTEA NOT NULL,              -- Hash of this entry
  
  -- ML embeddings (v2, for similarity search)
  audio_embedding vector(512),            -- CLAP embedding
  metadata_embedding vector(384),         -- Sentence transformer embedding
  mert_embedding vector(768),             -- MERT semantic fingerprint
  
  -- AI-extracted metadata (v2, JSONB for flexibility)
  ai_metadata JSONB,                      -- {genre: [...], mood: [...], bpm: {...}, ...}
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_fingerprint_platform UNIQUE (fingerprint_hash, origin_platform),
  CONSTRAINT valid_parental_advisory CHECK (parental_advisory IN ('explicit', 'clean', 'none') OR parental_advisory IS NULL)
);

-- Indexes for fast lookup
CREATE INDEX idx_orbit_fingerprint ON orbit_registrations(fingerprint_hash);
CREATE INDEX idx_orbit_isrc ON orbit_registrations(isrc) WHERE isrc IS NOT NULL;
CREATE INDEX idx_orbit_upc ON orbit_registrations(upc) WHERE upc IS NOT NULL;
CREATE INDEX idx_orbit_owner ON orbit_registrations(owner_id);
CREATE INDEX idx_orbit_platform ON orbit_registrations(origin_platform);
CREATE INDEX idx_orbit_title_artist ON orbit_registrations(title, artist);

-- Vector indexes for similarity search (if using ML features)
CREATE INDEX idx_orbit_audio_embedding ON orbit_registrations 
  USING ivfflat (audio_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_orbit_metadata_embedding ON orbit_registrations 
  USING ivfflat (metadata_embedding vector_cosine_ops) WITH (lists = 100);

-- Transfer events
CREATE TABLE orbit_transfers (
  id BIGSERIAL PRIMARY KEY,
  registration_id BIGINT NOT NULL REFERENCES orbit_registrations(id),
  
  from_platform VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  to_platform VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  
  from_signature BYTEA NOT NULL,          -- Sender's Ed25519 signature
  to_signature BYTEA,                     -- Recipient's signature (null until accepted)
  
  status VARCHAR(16) DEFAULT 'pending',
  
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  
  -- New registration created for recipient upon acceptance
  new_registration_id BIGINT REFERENCES orbit_registrations(id),
  
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  CONSTRAINT different_platforms CHECK (from_platform != to_platform)
);

CREATE INDEX idx_orbit_transfer_status ON orbit_transfers(status, to_platform);
CREATE INDEX idx_orbit_transfer_pending ON orbit_transfers(to_platform) 
  WHERE status = 'pending';

-- Merkle tree roots (published periodically for external verification)
CREATE TABLE orbit_merkle_roots (
  id BIGSERIAL PRIMARY KEY,
  root_hash BYTEA NOT NULL,
  first_entry_id BIGINT NOT NULL,
  last_entry_id BIGINT NOT NULL,
  entry_count BIGINT NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  published_to VARCHAR(512)               -- URL or identifier where published
);

-- API usage tracking (for billing)
CREATE TABLE orbit_api_usage (
  id BIGSERIAL PRIMARY KEY,
  platform_id VARCHAR(32) NOT NULL REFERENCES orbit_platforms(id),
  endpoint VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  response_time_ms INTEGER
);

CREATE INDEX idx_orbit_usage_platform_month ON orbit_api_usage(platform_id, timestamp);
```

---

## 10. Code Implementation

### Project Structure

```
orbit/
├── src/
│   ├── index.js                    # Main entry point
│   ├── config/
│   │   ├── index.js                # Configuration loader
│   │   └── database.js             # PostgreSQL connection
│   ├── engines/
│   │   ├── fingerprint.js          # Chromaprint wrapper
│   │   ├── watermark.js            # Spread spectrum implementation
│   │   └── crypto.js               # Ed25519 + CBOR utilities
│   ├── api/
│   │   ├── routes.js               # Express routes
│   │   ├── middleware/
│   │   │   ├── auth.js             # Platform authentication
│   │   │   ├── cbor.js             # CBOR body parser
│   │   │   └── rateLimit.js        # Rate limiting
│   │   └── handlers/
│   │       ├── register.js         # Registration handler
│   │       ├── verify.js           # Verification handler
│   │       ├── transfer.js         # Transfer handlers
│   │       └── chain.js            # Chain lookup handler
│   ├── ledger/
│   │   ├── models.js               # PostgreSQL models
│   │   ├── merkle.js               # Merkle tree utilities
│   │   └── queries.js              # Database queries
│   ├── ml/                         # Optional ML features
│   │   ├── clap.js                 # LAION CLAP integration
│   │   └── similarity.js           # Similarity search
│   └── utils/
│       ├── audio.js                # Audio processing utilities
│       ├── validation.js           # Input validation
│       └── errors.js               # Error handling
├── sdk/                            # Publishable SDK
│   ├── index.js                    # SDK entry point
│   ├── verify.js                   # Verification-only client
│   └── package.json                # SDK package config
├── scripts/
│   ├── migrate.js                  # Database migrations
│   ├── generate-keypair.js         # Platform keypair generation
│   └── calculate-merkle.js         # Merkle root calculation
├── tests/
│   ├── engines/
│   ├── api/
│   └── integration/
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

### Core Engine Implementations

#### fingerprint.js

```javascript
/**
 * ORBIT Fingerprint Engine
 * Wraps Chromaprint (fpcalc) for audio fingerprinting
 */

const { execSync, execFile } = require('child_process');
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
      tempFile = path.join(os.tmpdir(), `orbit-${Date.now()}-${Math.random().toString(36).slice(2)}.audio`);
      fs.writeFileSync(tempFile, input);
      audioPath = tempFile;
    } else {
      audioPath = input;
    }
    
    try {
      // Run fpcalc
      const result = execSync(
        `fpcalc -json -length ${length} "${audioPath}"`,
        { 
          encoding: 'utf8', 
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000 // 60 second timeout
        }
      );
      
      const { fingerprint, duration } = JSON.parse(result);
      
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
    return hash1.equals(hash2);
  }
  
  /**
   * Find similar fingerprints in database
   * @param {Buffer} hash - Fingerprint hash to search for
   * @param {Object} db - Database connection
   * @returns {Promise<Array>} Matching registrations
   */
  static async findMatches(hash, db) {
    const result = await db.query(
      `SELECT id, fingerprint_hash, title, artist, origin_platform, owner_id
       FROM orbit_registrations
       WHERE fingerprint_hash = $1`,
      [hash]
    );
    return result.rows;
  }
}

module.exports = OrbitFingerprint;
```

#### watermark.js

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
    this.secretKey = secretKey;
    this.CHIP_RATE = options.chipRate || 1000;       // Samples per bit
    this.EMBED_STRENGTH = options.strength || 0.005; // Amplitude (tuned for imperceptibility)
    this.MAGIC = Buffer.from('ORBT');                // Magic bytes
    this.VERSION = 1;
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
      // Use HMAC-SHA256 as PRNG
      const hmac = crypto.createHmac('sha256', this.secretKey);
      hmac.update(`${seed}:${Math.floor(counter / 32)}`);
      const hash = hmac.digest();
      
      // Each byte of hash gives us one spread value
      for (let i = 0; i < hash.length && counter < length; i++) {
        sequence[counter] = (hash[i] & 1) ? 1 : -1;
        counter++;
      }
    }
    
    return sequence;
  }
  
  /**
   * Convert bytes to bits array
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
   * Create watermark payload from metadata
   * @param {Object} data - Payload data
   * @returns {Buffer} Binary payload
   */
  createPayload(data) {
    const payload = Buffer.alloc(64); // Fixed size payload
    let offset = 0;
    
    // Magic bytes (4)
    this.MAGIC.copy(payload, offset);
    offset += 4;
    
    // Version (1)
    payload.writeUInt8(this.VERSION, offset);
    offset += 1;
    
    // Flags (1)
    payload.writeUInt8(0, offset);
    offset += 1;
    
    // Timestamp (6 bytes - milliseconds since epoch, fits until year 10000+)
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
    
    // Full payload hash pointer (16 bytes - truncated SHA-256 of full CBOR payload)
    const payloadHash = data.payloadHash || crypto.randomBytes(16);
    if (Buffer.isBuffer(payloadHash)) {
      payloadHash.slice(0, 16).copy(payload, offset);
    }
    offset += 16;
    
    // Reserved space for future use
    // offset += (64 - offset); // Remainder is zeros
    
    // CRC16 checksum of payload (last 2 bytes)
    const crc = this._crc16(payload.slice(0, 62));
    payload.writeUInt16BE(crc, 62);
    
    return payload;
  }
  
  /**
   * CRC16 implementation
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
   * Verify CRC16 of payload
   */
  _verifyCrc(payload) {
    const storedCrc = payload.readUInt16BE(62);
    const calculatedCrc = this._crc16(payload.slice(0, 62));
    return storedCrc === calculatedCrc;
  }
  
  /**
   * Embed payload into audio samples
   * @param {Float32Array} audioSamples - PCM audio samples (mono, normalized -1 to 1)
   * @param {Buffer} payload - Binary payload to embed
   * @returns {Float32Array} Watermarked audio samples
   */
  embed(audioSamples, payload) {
    const bits = this._bytesToBits(payload);
    const requiredSamples = bits.length * this.CHIP_RATE;
    
    if (audioSamples.length < requiredSamples) {
      throw new Error(`Audio too short. Need ${requiredSamples} samples, got ${audioSamples.length}`);
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
   * Extract payload from watermarked audio
   * @param {Float32Array} audioSamples - Watermarked PCM samples
   * @param {number} payloadBytes - Expected payload size in bytes (default 64)
   * @returns {{payload: Buffer, confidence: number, valid: boolean}}
   */
  extract(audioSamples, payloadBytes = 64) {
    const bitCount = payloadBytes * 8;
    const requiredSamples = bitCount * this.CHIP_RATE;
    
    if (audioSamples.length < requiredSamples) {
      return { payload: null, confidence: 0, valid: false };
    }
    
    const bits = [];
    const confidences = [];
    
    // Generate same spreading sequence
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
    const hasMagic = payload.slice(0, 4).equals(this.MAGIC);
    const hasValidCrc = this._verifyCrc(payload);
    
    return {
      payload,
      confidence: avgConfidence,
      valid: hasMagic && hasValidCrc
    };
  }
  
  /**
   * Parse extracted payload
   * @param {Buffer} payload - Extracted payload
   * @returns {Object} Parsed payload data
   */
  parsePayload(payload) {
    if (!payload || payload.length < 64) {
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
}

module.exports = OrbitWatermark;
```

#### crypto.js

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
    
    return nacl.sign.detached.verify(
      new Uint8Array(dataBuffer),
      new Uint8Array(signature),
      new Uint8Array(publicKey)
    );
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
   * @returns {string} Base64-encoded API key
   */
  static generateApiKey() {
    return crypto.randomBytes(32).toString('base64url');
  }
  
  /**
   * Create entry hash for ledger chain
   * @param {Object} entry - Registration entry
   * @param {Buffer} prevHash - Previous entry hash
   * @returns {Buffer} 32-byte hash
   */
  static createEntryHash(entry, prevHash) {
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

---

## 11. Ohnrshyp Integration

### Overview

ORBIT integrates with Ohnrshyp as an external service that Ohnrshyp calls via HTTP API or npm package.

**Integration Points**:
1. Upload middleware — auto-register and watermark on artist upload
2. Verification endpoint — check provenance of any audio
3. Duplicate detection — prevent re-upload of registered audio
4. B2B distribution — transfer to partner platforms

### Ohnrshyp Current Stack Reference

From `package.json` and `server.js`:
- **Runtime**: Node.js + Express
- **Database**: MongoDB (Mongoose)
- **Auth**: JWT + bcrypt
- **Storage**: AWS S3
- **File Upload**: Multer
- **Audio Processing**: FFmpeg (ffmpeg-static), music-metadata

### Integration Code

#### orbit.middleware.js (for Ohnrshyp)

```javascript
/**
 * ORBIT middleware for Ohnrshyp
 * Auto-registers and watermarks uploads
 */

const axios = require('axios');
const FormData = require('form-data');

const ORBIT_API_URL = process.env.ORBIT_API_URL || 'http://localhost:4000';
const ORBIT_PLATFORM_ID = 'ohnrshyp';
const ORBIT_PRIVATE_KEY = Buffer.from(process.env.ORBIT_PRIVATE_KEY || '', 'base64');

// Import signing from orbit-sdk (or implement locally)
const { OrbitCrypto } = require('@ohnrshyp/orbit-sdk');

/**
 * Middleware to check for duplicates before allowing upload
 */
const checkDuplicate = async (req, res, next) => {
  if (!req.file) return next();
  
  try {
    const response = await axios.post(
      `${ORBIT_API_URL}/orbit/v1/verify`,
      { audio: req.file.buffer.toString('base64') },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-ORBIT-Platform': ORBIT_PLATFORM_ID
        },
        timeout: 30000
      }
    );
    
    const verification = response.data;
    
    if (verification.duplicate_of) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate audio detected',
        message: 'This audio has already been registered',
        original: {
          registrationId: verification.duplicate_of,
          platform: verification.origin?.platform,
          owner: verification.origin?.owner_id,
          registeredAt: verification.origin?.timestamp
        }
      });
    }
    
    // Attach fingerprint for use in registration
    req.orbitFingerprint = verification.fingerprint_hash;
    next();
    
  } catch (error) {
    console.error('ORBIT duplicate check failed:', error.message);
    // Continue without ORBIT if service is unavailable
    next();
  }
};

/**
 * Middleware to register audio with ORBIT after successful upload
 */
const registerWithOrbit = async (req, res, next) => {
  // Only run after successful track creation
  if (!req.track || !req.file) return next();
  
  try {
    const metadata = {
      isrc: req.body.isrc || null,
      upc: req.body.upc || null,
      title: req.track.title,
      artist: req.user.artistName || req.user.username,
      duration: req.track.duration,
      bitrate: req.body.bitrate || 320,
      sample_rate: 44100,
      channels: 2,
      format: req.file.mimetype.split('/')[1] || 'mp3',
      genre: req.body.genre,
      album_title: req.body.album
    };
    
    const payload = {
      audio: req.file.buffer.toString('base64'),
      metadata,
      owner_id: req.user._id.toString()
    };
    
    // Sign the request
    const signature = OrbitCrypto.sign(payload, ORBIT_PRIVATE_KEY);
    
    const response = await axios.post(
      `${ORBIT_API_URL}/orbit/v1/register`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-ORBIT-Platform': ORBIT_PLATFORM_ID,
          'X-ORBIT-Signature': signature.toString('base64')
        },
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024 // 100MB
      }
    );
    
    const orbitData = response.data;
    
    // Update track with ORBIT metadata
    await Track.findByIdAndUpdate(req.track._id, {
      orbit: {
        registrationId: orbitData.registration_id,
        fingerprintHash: orbitData.fingerprint_hash,
        entryHash: orbitData.entry_hash,
        registeredAt: new Date()
      }
    });
    
    // If watermarked audio returned, could optionally re-upload to S3
    // For now, just store the registration info
    
    console.log(`✅ ORBIT: Registered track ${req.track._id} as ${orbitData.registration_id}`);
    
    next();
    
  } catch (error) {
    console.error('ORBIT registration failed:', error.message);
    // Don't fail the upload if ORBIT is unavailable
    next();
  }
};

/**
 * Route handler to verify any audio file
 */
const verifyAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided'
      });
    }
    
    const response = await axios.post(
      `${ORBIT_API_URL}/orbit/v1/verify`,
      { audio: req.file.buffer.toString('base64') },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-ORBIT-Platform': ORBIT_PLATFORM_ID
        }
      }
    );
    
    res.json({
      success: true,
      provenance: response.data
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Verification failed',
      message: error.message
    });
  }
};

module.exports = {
  checkDuplicate,
  registerWithOrbit,
  verifyAudio
};
```

#### Track Model Extension

```javascript
// Add to models/track.model.js

// In the schema definition, add:
orbit: {
  registrationId: { type: Number },
  fingerprintHash: { type: Buffer },
  watermarkHash: { type: Buffer },
  entryHash: { type: Buffer },
  registeredAt: { type: Date },
  transfers: [{
    toPlatform: { type: String },
    transferId: { type: Number },
    timestamp: { type: Date },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'] }
  }]
}
```

#### Routes Integration

```javascript
// In routes/music.routes.js

const { checkDuplicate, registerWithOrbit, verifyAudio } = require('../middleware/orbit.middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Add duplicate check to upload route
router.post('/',
  auth,
  artistOnly,
  upload.single('audio'),
  checkDuplicate,      // NEW: Check for duplicates
  validateAudioFile,
  async (req, res, next) => {
    // ... existing upload logic ...
    req.track = createdTrack;  // Attach for next middleware
    next();
  },
  registerWithOrbit    // NEW: Register with ORBIT
);

// Add verification endpoint
router.post('/verify',
  auth,
  upload.single('audio'),
  verifyAudio
);
```

---

## 12. Zero-Shot ML Enhancements

### Overview

These features use pre-trained models — NO TRAINING REQUIRED. Models are downloaded once on first use.

### 12.1 Semantic Audio Similarity (LAION CLAP)

Find tracks that **sound similar**, even if fingerprints don't match exactly.

```javascript
/**
 * orbit/ml/clap.js
 * Semantic audio similarity using LAION CLAP
 */

// Using transformers.js for browser/Node.js compatibility
const { pipeline } = require('@xenova/transformers');

class CLAPSimilarity {
  constructor() {
    this.model = null;
    this.initialized = false;
  }
  
  async initialize() {
    if (this.initialized) return;
    
    console.log('Loading CLAP model (first time may take a minute)...');
    
    // Load pre-trained CLAP model from HuggingFace
    // Model: laion/clap-htsat-unfused (~600MB)
    this.model = await pipeline(
      'feature-extraction',
      'Xenova/clap-htsat-unfused'
    );
    
    this.initialized = true;
    console.log('CLAP model loaded');
  }
  
  /**
   * Get 512-dim embedding for audio
   * @param {string} audioPath - Path to audio file
   * @returns {Float32Array}
   */
  async getEmbedding(audioPath) {
    await this.initialize();
    
    const result = await this.model(audioPath, {
      pooling: 'mean',
      normalize: true
    });
    
    return result.data;
  }
  
  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

module.exports = new CLAPSimilarity();
```

### 12.2 Metadata Similarity Search

```javascript
/**
 * orbit/ml/similarity.js
 * Text-based metadata similarity using Sentence Transformers
 */

const { pipeline } = require('@xenova/transformers');

class MetadataSimilarity {
  constructor() {
    this.model = null;
    this.initialized = false;
  }
  
  async initialize() {
    if (this.initialized) return;
    
    // all-MiniLM-L6-v2: Fast, good quality, ~80MB
    this.model = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    
    this.initialized = true;
  }
  
  /**
   * Create searchable embedding from metadata
   * @param {Object} metadata 
   * @returns {Float32Array} 384-dim embedding
   */
  async embedMetadata(metadata) {
    await this.initialize();
    
    // Construct natural language description
    const text = [
      metadata.title,
      `by ${metadata.artist}`,
      metadata.genre ? `Genre: ${metadata.genre}` : '',
      metadata.label ? `Label: ${metadata.label}` : '',
      metadata.album_title ? `Album: ${metadata.album_title}` : ''
    ].filter(Boolean).join('. ');
    
    const result = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });
    
    return result.data;
  }
  
  /**
   * Find similar tracks by metadata
   * @param {Object} db - Database connection
   * @param {Float32Array} embedding - Query embedding
   * @param {number} threshold - Minimum similarity (0-1)
   * @param {number} limit - Max results
   */
  async findSimilar(db, embedding, threshold = 0.7, limit = 10) {
    // Using pgvector's <=> operator for cosine distance
    const result = await db.query(`
      SELECT 
        id,
        title,
        artist,
        isrc,
        origin_platform,
        1 - (metadata_embedding <=> $1) as similarity
      FROM orbit_registrations
      WHERE metadata_embedding IS NOT NULL
        AND 1 - (metadata_embedding <=> $1) > $2
      ORDER BY similarity DESC
      LIMIT $3
    `, [JSON.stringify(Array.from(embedding)), threshold, limit]);
    
    return result.rows;
  }
}

module.exports = new MetadataSimilarity();
```

### 12.3 Database Setup for Vector Search

```sql
-- Run after creating orbit_registrations table
-- Requires pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns
ALTER TABLE orbit_registrations
ADD COLUMN IF NOT EXISTS audio_embedding vector(512),
ADD COLUMN IF NOT EXISTS metadata_embedding vector(384);

-- Create IVFFlat indexes for approximate nearest neighbor search
-- lists = 100 is good for up to ~1M records
CREATE INDEX IF NOT EXISTS idx_audio_embedding 
ON orbit_registrations 
USING ivfflat (audio_embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_metadata_embedding 
ON orbit_registrations 
USING ivfflat (metadata_embedding vector_cosine_ops) 
WITH (lists = 100);
```

---

## 13. Development Timeline

### Phase 1: Core System (Month 1)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | Project setup, PostgreSQL schema, Chromaprint integration | Fingerprint engine working |
| 2 | Spread spectrum watermark implementation (embed/extract) | Watermark engine working |
| 3 | CBOR encoding, Ed25519 signing, payload structure | Crypto engine working |
| 4 | REST API (register/verify), ledger writes | MVP API deployed |

**Milestone**: Can register audio with metadata, verify provenance, detect exact duplicates.

### Phase 2: B2B Protocol (Month 2)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | Transfer initiate/accept flow, status management | Transfer protocol working |
| 2 | Re-watermarking with chain extension | Chain updates on transfer |
| 3 | Platform registration, API key management | Partner onboarding flow |
| 4 | Ohnrshyp integration (middleware, routes) | Live integration |

**Milestone**: Full B2B transfer working, integrated into Ohnrshyp uploads.

### Phase 3: ML & Polish (Month 3)

| Week | Tasks | Deliverables |
|------|-------|--------------|
| 1 | CLAP semantic similarity integration | Similarity search API |
| 2 | pgvector setup, embedding storage | Vector search working |
| 3 | Admin dashboard, provenance viewer UI | Management interface |
| 4 | Documentation, SDK packaging, testing | Production-ready release |

**Milestone**: Full system deployed with semantic search, documented, SDK published.

---

## 14. Licensing & Business Model

### Tier Structure

| Tier | Name | Price | Features |
|------|------|-------|----------|
| 1 | Ohnrshyp Internal | Free | Full access, unlimited operations |
| 2 | Verification Partner | $500/mo | Verify Ohnrshyp audio, accept transfers, 10k ops/mo |
| 3 | Full Platform | $2,500/mo | Register own audio, full API, 50k ops/mo |
| 4 | White-Label | Custom | Self-hosted, private ledger, unlimited |
| 5 | Open Source SDK | Free (Apache 2.0) | Verification-only, drives adoption |

### Revenue Projections (Conservative)

- 10 Verification Partners: $5,000/mo
- 5 Full Platforms: $12,500/mo
- 2 White-Label: $10,000/mo (estimated)
- **Total**: ~$27,500/mo potential

### Open Source Strategy

The **verification SDK** is open source to drive adoption:
- Any platform can verify ORBIT-registered audio
- Registration requires paid API access
- Creates network effect — more verifiers = more value

---

## 15. Deployment Architecture

### Recommended Setup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │   CloudFlare    │────▶│   AWS App       │────▶│   PostgreSQL    │      │
│   │   (CDN/WAF)     │     │   Runner        │     │   (RDS)         │      │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘      │
│                                  │                                          │
│                                  │                                          │
│                           ┌──────┴──────┐                                   │
│                           │   S3        │                                   │
│                           │ (Audio      │                                   │
│                           │  Storage)   │                                   │
│                           └─────────────┘                                   │
│                                                                             │
│   ORBIT API: orbit.ohnrshyp.com                                            │
│   Ohnrshyp: app.ohnrshyp.com (separate deployment)                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:20-slim

# Install Chromaprint
RUN apt-get update && apt-get install -y \
    libchromaprint-tools \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 4000

CMD ["node", "src/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  orbit:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:pass@db:5432/orbit
      - ORBIT_SECRET_KEY=${ORBIT_SECRET_KEY}
    depends_on:
      - db
    
  db:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_USER=orbit
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=orbit
    volumes:
      - orbit_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  orbit_data:
```

---

## 16. Testing Strategy

### Unit Tests

```javascript
// tests/engines/fingerprint.test.js
const OrbitFingerprint = require('../../src/engines/fingerprint');
const path = require('path');

describe('OrbitFingerprint', () => {
  const testAudioPath = path.join(__dirname, '../fixtures/test-audio.mp3');
  
  test('generates fingerprint from audio file', async () => {
    const result = await OrbitFingerprint.generate(testAudioPath);
    
    expect(result.raw).toBeDefined();
    expect(result.hash).toBeInstanceOf(Buffer);
    expect(result.hash.length).toBe(32);
    expect(result.duration).toBeGreaterThan(0);
  });
  
  test('same audio produces same fingerprint', async () => {
    const result1 = await OrbitFingerprint.generate(testAudioPath);
    const result2 = await OrbitFingerprint.generate(testAudioPath);
    
    expect(result1.hash.equals(result2.hash)).toBe(true);
  });
});
```

```javascript
// tests/engines/watermark.test.js
const OrbitWatermark = require('../../src/engines/watermark');

describe('OrbitWatermark', () => {
  const watermark = new OrbitWatermark('test-secret-key');
  
  test('embeds and extracts payload', () => {
    // Create test audio (1 second of silence at 44100Hz)
    const audioSamples = new Float32Array(44100);
    
    const payload = watermark.createPayload({
      timestamp: Date.now(),
      platform: 'test',
      payloadHash: Buffer.alloc(16).fill(0xAB)
    });
    
    const watermarked = watermark.embed(audioSamples, payload);
    const extracted = watermark.extract(watermarked, 64);
    
    expect(extracted.valid).toBe(true);
    expect(extracted.payload.slice(0, 4).toString()).toBe('ORBT');
  });
  
  test('survives minor noise addition', () => {
    const audioSamples = new Float32Array(44100);
    const payload = watermark.createPayload({ platform: 'test' });
    const watermarked = watermark.embed(audioSamples, payload);
    
    // Add small random noise
    for (let i = 0; i < watermarked.length; i++) {
      watermarked[i] += (Math.random() - 0.5) * 0.001;
    }
    
    const extracted = watermark.extract(watermarked, 64);
    expect(extracted.valid).toBe(true);
  });
});
```

### Integration Tests

```javascript
// tests/integration/api.test.js
const request = require('supertest');
const app = require('../../src/index');
const fs = require('fs');
const path = require('path');

describe('ORBIT API', () => {
  const testAudio = fs.readFileSync(
    path.join(__dirname, '../fixtures/test-audio.mp3')
  );
  
  test('POST /orbit/v1/register creates registration', async () => {
    const response = await request(app)
      .post('/orbit/v1/register')
      .set('Content-Type', 'application/json')
      .set('X-ORBIT-Platform', 'test')
      .set('X-ORBIT-Signature', 'test-signature')
      .send({
        audio: testAudio.toString('base64'),
        metadata: {
          title: 'Test Track',
          artist: 'Test Artist',
          duration: 180000,
          format: 'mp3'
        },
        owner_id: '550e8400-e29b-41d4-a716-446655440000'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.registration_id).toBeDefined();
    expect(response.body.fingerprint_hash).toBeDefined();
    expect(response.body.watermarked_audio).toBeDefined();
  });
  
  test('POST /orbit/v1/verify identifies registered audio', async () => {
    // First register
    const registerResponse = await request(app)
      .post('/orbit/v1/register')
      .send({ /* ... */ });
    
    // Then verify
    const verifyResponse = await request(app)
      .post('/orbit/v1/verify')
      .send({
        audio: registerResponse.body.watermarked_audio
      });
    
    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.verified).toBe(true);
    expect(verifyResponse.body.watermark.valid).toBe(true);
  });
});
```

---

## 17. Future Considerations

### Potential Enhancements (Post-Launch)

1. **Blockchain Anchoring**: Publish Merkle roots to public blockchain for maximum trust
2. **Multi-Platform Federation**: Allow ORBIT instances to share ledger data
3. **Mobile SDK**: Native iOS/Android verification libraries
4. **Real-Time Streaming Verification**: Identify ORBIT audio in live streams
5. **Rights Expression Language**: Machine-readable licensing in metadata
6. **AI-Generated Audio Detection**: Identify synthetic vs. human-created audio

### Standards Alignment

ORBIT could eventually:
- Submit to DDEX as alternative standard
- Align with W3C Web Audio standards
- Integrate with emerging Music NFT protocols
- Support Verifiable Credentials for rights claims

---

## 18. Appendix: Ohnrshyp Context

### Platform Overview

Ohnrshyp is a direct-to-fan music platform for independent artists.

**Core Value Proposition**:
- Artists receive payments directly via Stripe Connect
- Fans get high-quality streaming and purchases
- No intermediaries between artist and listener

### Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Tailwind CSS, Flowbite, Framer Motion |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas (Mongoose ODM) |
| Auth | JWT, bcrypt |
| Payments | Stripe (Standard Connect) |
| Storage | AWS S3 |
| Deployment | AWS App Runner (Docker) |
| Monitoring | AWS CloudWatch |

### Key Models

**User**: Artists and listeners, role-based access
**Track**: Individual songs with audio files in S3
**Album**: Collection of tracks
**Playlist**: User-created collections
**Transaction**: Payment records

### Current File Handling

- Uploads via Multer to memory
- Validation: format, size, magic numbers
- Storage: AWS S3 with presigned URLs
- Audio metadata: `music-metadata` package
- Processing: FFmpeg for format conversion

### Integration Points for ORBIT

1. **Upload Flow** (`routes/music.routes.js`): Add ORBIT middleware after multer
2. **Track Model** (`models/track.model.js`): Add orbit field for registration data
3. **Verification Endpoint**: New route for provenance checking
4. **Admin Dashboard**: Display ORBIT registration status
5. **Distribution Flow**: Initiate transfers to partner DSPs

### Environment Variables (ORBIT-related)

```env
# Add to Ohnrshyp .env
ORBIT_API_URL=https://orbit.ohnrshyp.com
ORBIT_PLATFORM_ID=ohnrshyp
ORBIT_PRIVATE_KEY=<base64-encoded-ed25519-private-key>
ORBIT_API_KEY=<api-key-for-rate-limiting>
```

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12-08 | Initial specification |

---

## Quick Start Checklist

When starting development in the new ORBIT repository:

- [ ] Create new repository: `github.com/yourorg/orbit`
- [ ] Initialize Node.js project with TypeScript (optional)
- [ ] Install dependencies: `express`, `cbor`, `tweetnacl`, `pg`, `@xenova/transformers`
- [ ] Set up PostgreSQL with pgvector extension
- [ ] Install Chromaprint (`brew install chromaprint`)
- [ ] Implement engines: fingerprint → watermark → crypto
- [ ] Implement API routes: register → verify → transfer
- [ ] Write tests for each engine
- [ ] Deploy to AWS App Runner (separate from Ohnrshyp)
- [ ] Generate keypair for Ohnrshyp platform
- [ ] Integrate with Ohnrshyp via middleware
- [ ] Test end-to-end flow

---

**This document contains everything needed to build ORBIT from scratch.**

*The audio file is the message. Let's make it speak.*
