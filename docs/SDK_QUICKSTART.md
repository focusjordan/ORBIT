# ORBIT SDK Quick Start Guide

## Integrate Audio Provenance in Minutes

**Version**: 1.0  
**Last Updated**: December 2025  
**Status**: Production Ready

---

## What is ORBIT?

**ORBIT (Origin-Based Identity & Rights Transfer Protocol)** is an audio provenance system that solves a fundamental problem in digital music: *How do you prove who created an audio file, when, and where it's been?*

### The Problem Today

When you send a music file to a distributor, streaming platform, or business partner:
- **Metadata can be stripped** — ID3 tags disappear, filenames change
- **Ownership claims conflict** — Multiple parties claim they own the same track  
- **Transfer history is lost** — No record of who sent what to whom
- **Duplicate detection is inconsistent** — Same audio registered multiple times
- **Manual verification is slow** — Rights disputes take weeks to resolve

### How ORBIT Solves It

ORBIT embeds an invisible, inaudible "digital signature" directly into the audio waveform:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        WHAT ORBIT EMBEDS                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  The watermark contains a compact pointer to full provenance:        │
│                                                                      │
│  📍 Origin Platform Hash — Identifies the registering platform      │
│  🕐 Timestamp — When it was registered                              │
│  🔗 Payload Hash — Links to full metadata in the ORBIT ledger       │
│                                                                      │
│  The ledger stores the complete record:                              │
│  👤 Owner ID, title, artist, ISRC, all metadata, signatures, etc.   │
│                                                                      │
│  This information SURVIVES:                                          │
│  ✓ MP3/AAC compression    ✓ Format conversion    ✓ Streaming       │
│  ✓ File renaming          ✓ Metadata stripping   ✓ Re-uploading    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**The Core Innovation**: The audio file *IS* the message. The proof of ownership travels with the audio itself, not in a separate file that can be lost or faked.

### What's Included When You Use ORBIT

When you integrate with ORBIT via the SDK, you're accessing a complete audio provenance service:

| Capability | Technology | You Get |
|------------|------------|---------|
| **Neural Watermarking** | SilentCipher (GPU) | Invisible, compression-resistant watermarks |
| **AI Metadata Extraction** | CLAP + Librosa (GPU) | Auto-detected genre, mood, BPM, key, instruments |
| **Fingerprinting** | Chromaprint | Duplicate detection across all registered audio |
| **Similarity Search** | CLAP embeddings + pgvector | Find covers, remixes, and similar tracks |
| **Cryptographic Signing** | Ed25519 | Provable chain of custody |
| **Provenance Ledger** | PostgreSQL | Immutable registration history |

**No GPU required on your end** — ORBIT's infrastructure handles all ML operations. You just send audio, get back results.

---

## How the Protocol Works

### Registration Flow

When audio is registered with ORBIT:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │────▶│  Watermark  │────▶│ Fingerprint │────▶│   Store     │
│   Audio     │     │   Embed     │     │  Generate   │     │   Ledger    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │
      │                   ▼                   ▼                   ▼
      │            ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
      │            │ SilentCipher│     │ Chromaprint │     │ PostgreSQL  │
      │            │ (Invisible) │     │ (Identity)  │     │ + Signature │
      │            └─────────────┘     └─────────────┘     └─────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Note: Fingerprint is generated from the WATERMARKED audio.            │
│  This ensures the fingerprint matches what will actually be            │
│  distributed, enabling accurate duplicate detection.                    │
├─────────────────────────────────────────────────────────────────────────┤
│                        WHAT YOU GET BACK                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  • Watermarked audio file (sounds identical, contains proof)            │
│  • Registration ID (unique identifier in ORBIT ledger)                  │
│  • Fingerprint hash (32-byte audio identity)                           │
│  • Entry hash (cryptographic proof of registration)                     │
│  • Watermark method used ('silentcipher' or 'spread')                  │
│  • AI-extracted metadata (genre, mood, BPM, key, instruments)          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Verification Flow

When audio is verified:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Submit    │────▶│ Fingerprint │────▶│  Watermark  │────▶│   Lookup    │
│   Audio     │     │   Match     │     │   Extract   │     │   Ledger    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                   │                   │
                          ▼                   ▼                   ▼
                   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                   │  Is this    │     │  Who put    │     │  Get full   │
                   │  registered?│     │  it there?  │     │  history    │
                   └─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        VERIFICATION RESULT                               │
├─────────────────────────────────────────────────────────────────────────┤
│  • verified: true/false                                                  │
│  • Original registration details (platform, owner, timestamp)           │
│  • Full metadata (title, artist, ISRC, etc.)                           │
│  • Transfer history (chain of custody)                                  │
│  • Duplicate detection (is this a copy of another registration?)       │
│  • AI analysis (genre, mood, instruments — even if not registered)     │
└─────────────────────────────────────────────────────────────────────────┘
```

### B2B Transfer Flow

When transferring audio between platforms:

```
   SENDER (Platform A)              ORBIT                    RECIPIENT (Platform B)
         │                            │                              │
         │  1. Initiate transfer      │                              │
         │  (registration_id + sig)   │                              │
         │ ──────────────────────────▶│                              │
         │                            │                              │
         │                            │  2. Notify recipient         │
         │                            │  (webhook or polling)        │
         │                            │ ────────────────────────────▶│
         │                            │                              │
         │                            │  3. Accept transfer          │
         │                            │  (transfer_id + sig)         │
         │                            │◀──────────────────────────── │
         │                            │                              │
         │                            │  4. Return re-watermarked    │
         │                            │  audio with extended chain   │
         │                            │ ────────────────────────────▶│
         │                            │                              │
         │  5. Confirm complete       │                              │
         │◀──────────────────────────-│                              │
         │                            │                              │

  ┌───────────────────────────────────────────────────────────────────────┐
  │                      CHAIN OF CUSTODY                                  │
  ├───────────────────────────────────────────────────────────────────────┤
  │  [Origin: Platform A] ──▶ [Transfer: A→B] ──▶ [Current: Platform B]   │
  │       ✓ Signed                ✓ Both signed         ✓ Signed          │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites & Compatibility

### System Requirements

| Requirement | Details |
|-------------|---------|
| **Node.js** | v18.0.0 or higher |
| **npm/yarn/pnpm** | Any package manager |
| **Platform** | Linux, macOS, Windows, Docker |

### SDK Dependencies

The ORBIT SDK has minimal dependencies (3 packages, all MIT/Apache licensed):

| Package | Purpose | Size |
|---------|---------|------|
| `cbor` | Binary encoding for efficient payloads | ~50KB |
| `tweetnacl` | Ed25519 cryptographic signatures | ~30KB |
| `form-data` | Multipart uploads for audio files | ~20KB |

**No native binaries, no build steps, no GPU required on your end.**

### Supported Audio Formats

ORBIT accepts any audio format that FFmpeg supports (processing happens server-side):

| Format | Extensions | Notes |
|--------|------------|-------|
| WAV | `.wav` | Recommended for highest quality |
| MP3 | `.mp3` | Most common, fully supported |
| FLAC | `.flac` | Lossless, recommended for archival |
| AAC | `.aac`, `.m4a` | Apple/streaming format |
| OGG | `.ogg`, `.oga` | Open source format |
| AIFF | `.aiff`, `.aif` | Apple uncompressed |

---

## Framework Compatibility

**ORBIT is a protocol, not a platform.** The SDK is a standard Node.js library that works with any JavaScript/TypeScript codebase.

### Works With Any Backend Framework

```javascript
// Express.js
const express = require('express');
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

// Fastify
const fastify = require('fastify');
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

// NestJS
import { OrbitClient } from '@ohnrshyp/orbit-sdk';

// Koa
const Koa = require('koa');
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

// Hapi
const Hapi = require('@hapi/hapi');
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

// Plain Node.js (no framework)
const http = require('http');
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');
```

### Works With Any Database

ORBIT stores provenance in its own ledger. You just store the reference IDs in your database:

```javascript
// MongoDB / Mongoose
await Track.create({
  title: 'My Track',
  orbit: { registrationId: result.registration_id }
});

// PostgreSQL / Prisma
await prisma.track.create({
  data: { title: 'My Track', orbitRegistrationId: result.registration_id }
});

// MySQL / Sequelize
await Track.create({ title: 'My Track', orbitRegistrationId: result.registration_id });

// Redis (for caching)
await redis.set(`orbit:${trackId}`, JSON.stringify(result));

// DynamoDB
await dynamodb.put({ TableName: 'tracks', Item: { orbitId: result.registration_id } });
```

### Works With Any Cloud/Storage

```javascript
// AWS S3
await s3.putObject({ Bucket: 'audio', Key: 'track.wav', Body: result.watermarked_audio });

// Google Cloud Storage
await bucket.file('track.wav').save(result.watermarked_audio);

// Azure Blob Storage
await blockBlobClient.upload(result.watermarked_audio, result.watermarked_audio.length);

// Local filesystem
fs.writeFileSync('/storage/track.wav', result.watermarked_audio);

// Cloudflare R2
await r2.put('track.wav', result.watermarked_audio);
```

### Works With TypeScript

```typescript
import { OrbitClient } from '@ohnrshyp/orbit-sdk';

interface OrbitConfig {
  apiUrl: string;
  platformId: string;
  privateKey: Buffer;
  apiKey?: string;
}

const config: OrbitConfig = {
  apiUrl: process.env.ORBIT_API_URL!,
  platformId: process.env.ORBIT_PLATFORM_ID!,
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY!, 'base64')
};

const client = new OrbitClient(config);

// Full type safety
const result = await client.register(audioBuffer, {
  title: 'My Track',
  artist: 'Artist Name'
}, ownerId);
```

---

## Adapting to Your Codebase

ORBIT follows common patterns that map to any architecture:

### Pattern Mapping for AI/LLM Integration

If you're using an AI assistant to integrate ORBIT, here's how ORBIT concepts map to common patterns:

| Your Codebase Has | ORBIT Equivalent | Mapping |
|-------------------|------------------|---------|
| Upload endpoint | `client.register()` | Call after file upload succeeds |
| Track/Asset model | Store `registration_id` | Add a field to your model |
| User authentication | `ownerId` parameter | Pass your user's ID |
| File storage | `watermarked_audio` | Store this instead of original |
| Content validation | `client.verify()` | Call before accepting uploads |
| Partner integrations | `client.transfer()` | B2B handoff |

### Minimal Integration (3 Steps)

```javascript
// Step 1: Install
// npm install @ohnrshyp/orbit-sdk

// Step 2: Configure (once, at app startup)
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');
const orbit = new OrbitClient({
  apiUrl: process.env.ORBIT_API_URL,
  platformId: process.env.ORBIT_PLATFORM_ID,
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});

// Step 3: Use (wherever you handle audio)
const result = await orbit.register(audioBuffer, { title, artist }, userId);
// Store result.registration_id in your database
// Store result.watermarked_audio in your file storage
```

### Your Code Doesn't Change

The SDK doesn't require you to:
- Change your database schema (just add one field)
- Change your API structure
- Change your authentication system
- Change your file storage approach
- Install any system dependencies
- Run any background services

**You call ORBIT's API. We handle the complexity.**

---

## Quick Start

### Installation

```bash
npm install @ohnrshyp/orbit-sdk
```

### Configuration

```javascript
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

const client = new OrbitClient({
  apiUrl: 'https://orbit.ohnrshyp.com',      // ORBIT server URL
  platformId: 'your-platform-id',            // Your registered platform ID
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64'),
  apiKey: process.env.ORBIT_API_KEY          // Optional: for rate limiting
});
```

### Verify Audio (Check if Registered)

```javascript
const fs = require('fs');

// Load any audio file
const audioBuffer = fs.readFileSync('track.mp3');

// Verify with ORBIT
const result = await client.verify(audioBuffer);

if (result.verified) {
  console.log('✅ Audio is registered in ORBIT');
  console.log(`   Title: ${result.metadata.title}`);
  console.log(`   Artist: ${result.metadata.artist}`);
  console.log(`   Registered by: ${result.origin.platform}`);
  console.log(`   At: ${result.origin.timestamp}`);
  console.log(`   Confidence: ${result.confidence_summary.overall_verification}`);
  
  if (result.duplicate_of) {
    console.log(`   ⚠️ Duplicate of registration ${result.duplicate_of}`);
  }
  
  // V2 response also includes:
  // - result.identity (fingerprint + embedding matches)
  // - result.watermark (detection details)
  // - result.ai_extracted_metadata (genre, mood, BPM, key)
  // - result.content_analysis (similar works)
  // - result.provenance (origin + transfers)
} else {
  console.log('❌ Audio not registered in ORBIT');
}
```

### Register New Audio

```javascript
const fs = require('fs');

const audioBuffer = fs.readFileSync('new-track.wav');

const result = await client.register(audioBuffer, {
  // Required
  title: 'Midnight Drive',
  artist: 'The Neon Collective',
  
  // Recommended
  isrc: 'USRC12345678',
  primary_genre: 'Electronic',
  album_title: 'Night Visions',
  
  // Copyright
  p_line: '2024 Neon Records',
  c_line: '2024 Neon Publishing',
  
  // Optional - ORBIT auto-extracts if not provided
  // duration_ms, bitrate, sample_rate, channels, format
}, 'owner-user-uuid');

// IMPORTANT: Store the watermarked audio!
// This is the version with embedded provenance
fs.writeFileSync('track-watermarked.wav', result.watermarked_audio);

console.log(`✅ Registered as ID: ${result.registration_id}`);
console.log(`   Fingerprint: ${result.fingerprint_hash.slice(0, 16)}...`);
console.log(`   Watermark method: ${result.watermark_method}`);  // 'silentcipher' or 'spread'
console.log(`   Processing time: ${result.processing_time_ms}ms`);
console.log(`   Registered at: ${result.registered_at}`);
```

### Get Chain of Custody

```javascript
// Using fingerprint hash from registration
const chain = await client.getChain(result.fingerprint_hash);

console.log('Chain of Custody:');
chain.registrations.forEach((reg, i) => {
  console.log(`${i + 1}. Registered by ${reg.platform} at ${reg.timestamp}`);
  console.log(`   Owner: ${reg.owner_id}`);
  console.log(`   Title: ${reg.metadata.title} by ${reg.metadata.artist}`);
});

chain.transfers.forEach((xfer) => {
  console.log(`   Transferred: ${xfer.from_platform} → ${xfer.to_platform}`);
  console.log(`   Status: ${xfer.status}, Initiated: ${xfer.initiated_at}`);
});
```

### Transfer to Another Platform

```javascript
// Initiate transfer
const transfer = await client.transfer(registrationId, 'partner-platform-id');
console.log(`Transfer initiated: ${transfer.transfer_id}`);
console.log(`Expires: ${transfer.expires_at}`);

// --- On the recipient's side ---
const accepted = await recipientClient.acceptTransfer(transfer.transfer_id);

// Store the re-watermarked audio (now with extended chain)
fs.writeFileSync('received-track.wav', accepted.watermarked_audio);
console.log(`Accepted! New registration: ${accepted.new_registration_id}`);
```

---

## V2 Features: AI-Powered Analysis

ORBIT v2 adds neural audio analysis capabilities.

### Find Similar Tracks

```javascript
const audioBuffer = fs.readFileSync('query-track.mp3');

const results = await client.similar(audioBuffer, {
  threshold: 0.7,    // Minimum similarity (0-1)
  limit: 10          // Max results
});

console.log('Similar tracks:');
results.results.forEach(track => {
  const relationship = track.relationship; // EXACT_DUPLICATE, POSSIBLE_REMIX, COVER, etc.
  console.log(`  ${track.title} by ${track.artist}`);
  console.log(`    Similarity: ${(track.similarity * 100).toFixed(1)}%`);
  console.log(`    Relationship: ${relationship}`);
});
```

### Analyze Audio (Without Registration)

```javascript
const audioBuffer = fs.readFileSync('track.mp3');

const analysis = await client.analyze(audioBuffer, {
  include: ['genre', 'mood', 'bpm', 'key', 'instruments', 'vocals']
});

console.log('AI Analysis:');
console.log(`  Genre: ${analysis.analysis.genre[0].label} (${(analysis.analysis.genre[0].confidence * 100).toFixed(0)}%)`);
console.log(`  Mood: ${analysis.analysis.mood[0].label}`);
console.log(`  BPM: ${analysis.analysis.bpm.value}`);
console.log(`  Key: ${analysis.analysis.key.value}`);
console.log(`  Vocals: ${analysis.analysis.vocals.present ? 'Yes' : 'No'}`);
console.log(`  Instruments: ${analysis.analysis.instruments.map(i => i.label).join(', ')}`);
```

---

## API Reference

### Core Endpoints (v1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orbit/v1/register` | Register audio, returns watermarked file |
| `POST` | `/orbit/v1/verify` | Verify provenance, check duplicates |
| `POST` | `/orbit/v1/transfer` | Initiate B2B transfer |
| `POST` | `/orbit/v1/accept` | Accept incoming transfer |
| `GET` | `/orbit/v1/chain/:fingerprint` | Get complete custody chain |

### AI Endpoints (v2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orbit/v2/similar` | Find similar-sounding tracks |
| `POST` | `/orbit/v2/analyze` | Standalone AI analysis |

### SDK Methods

| Method | Description |
|--------|-------------|
| `client.register(audio, metadata, ownerId)` | Register new audio |
| `client.verify(audio)` | Verify audio provenance |
| `client.transfer(registrationId, toPlatform)` | Initiate transfer |
| `client.acceptTransfer(transferId)` | Accept transfer |
| `client.getChain(fingerprintHash)` | Get custody chain |
| `client.similar(audio, options)` | Find similar tracks (v2) |
| `client.analyze(audio, options)` | AI analysis (v2) |

---

## Metadata Schema

ORBIT supports **33+ metadata fields** aligned with DDEX ERN (Electronic Release Notification) standards. This enables full compatibility with DSP requirements (Spotify, Apple Music, etc.).

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Track title |
| `artist` | string | Primary artist name |

### Identifiers

| Field | Type | Description |
|-------|------|-------------|
| `isrc` | string | International Standard Recording Code (e.g., "USRC12345678") |
| `upc` | string | Universal Product Code (release-level, 12-14 digits) |
| `iswc` | string | International Standard Musical Work Code (composition, e.g., "T-123.456.789-C") |

### Copyright

| Field | Type | Description |
|-------|------|-------------|
| `p_line` | string | ℗ Sound recording copyright (e.g., "2024 Label Name") |
| `c_line` | string | © Composition copyright (e.g., "2024 Publisher Name") |

### Classification

| Field | Type | Description |
|-------|------|-------------|
| `primary_genre` | string | Primary genre (e.g., "Electronic", "Hip Hop", "Rock") |
| `secondary_genre` | string | Secondary genre for sub-classification |
| `language` | string | ISO 639-1 language code (e.g., "en", "es", "fr") |
| `parental_advisory` | string | Content advisory: "explicit", "clean", or "none" |

### Release Information

| Field | Type | Description |
|-------|------|-------------|
| `album_title` | string | Album/EP name |
| `track_number` | number | Position on album |
| `release_date` | string | Release date (ISO 8601, e.g., "2024-12-15") |
| `original_release_date` | string | For re-releases/remasters — original release date |
| `label` | string | Record label name |
| `catalog_number` | string | Label's catalog ID |
| `version` | string | Track version: "Live", "Acoustic", "Remix", "Radio Edit", etc. |

### Contributors

| Field | Type | Description |
|-------|------|-------------|
| `featured_artists` | array | Featured artist names (e.g., `["Artist A", "Artist B"]`) |
| `composers` | array | Music composers |
| `lyricists` | array | Lyric writers |
| `writers` | array | Songwriters (if not splitting composer/lyricist) |
| `producers` | array | Producers |
| `remixer` | string | Remixer name (if applicable) |
| `recording_location` | string | Studio or recording location |
| `recording_year` | number | Year of recording |

### Distribution Rights

| Field | Type | Description |
|-------|------|-------------|
| `territories` | array | ISO 3166-1 alpha-2 country codes (e.g., `["US", "GB", "WW"]`) |
| `preview_start_ms` | number | Start time for 30-second preview clip |

### Auto-Extracted Technical Fields

These are extracted automatically from the audio file if not provided:

| Field | Type | Description |
|-------|------|-------------|
| `duration_ms` | number | Duration in milliseconds |
| `bitrate` | number | Audio bitrate in kbps |
| `sample_rate` | number | Sample rate in Hz (e.g., 44100, 48000) |
| `channels` | number | Number of audio channels (1=mono, 2=stereo) |
| `format` | string | File format (mp3, wav, flac, aac) |

### AI-Extracted Fields (v2)

These are automatically populated during registration using ORBIT's GPU-powered analysis:

| Field | Type | Description |
|-------|------|-------------|
| `ai_genre` | array | Detected genres with confidence scores (e.g., `[{label: "electronic", confidence: 0.92}]`) |
| `ai_mood` | array | Detected moods (e.g., `[{label: "energetic", confidence: 0.85}]`) |
| `ai_bpm` | object | Tempo detection (e.g., `{value: 120, confidence: 0.97}`) |
| `ai_key` | object | Musical key (e.g., `{value: "A minor", confidence: 0.88}`) |
| `ai_instruments` | array | Detected instruments with confidence |
| `ai_vocals` | object | Vocal presence (e.g., `{present: true, confidence: 0.91}`) |

### DDEX ERN Alignment

ORBIT's metadata schema maps directly to DDEX ERN fields, making it easy to:
- **Import** from existing DDEX feeds
- **Export** to DSPs that require ERN format
- **Replace** verbose XML with compact CBOR (~400 bytes vs 5-10KB)

---

## Integration Patterns

### Pattern 1: Upload with Duplicate Prevention

**Use case**: Block duplicate uploads at the source

```javascript
// Express.js middleware example
const orbitDuplicateCheck = async (req, res, next) => {
  const audioBuffer = req.file.buffer;
  
  try {
    const verification = await client.verify(audioBuffer);
    
    if (verification.verified || verification.duplicate_of) {
      return res.status(409).json({
        error: 'DUPLICATE_AUDIO',
        message: 'This audio is already registered',
        original: {
          registration_id: verification.fingerprint_match?.registration_id,
          title: verification.metadata?.title,
          artist: verification.metadata?.artist,
          registered_at: verification.origin?.timestamp
        }
      });
    }
    
    next();
  } catch (error) {
    // Graceful degradation: allow upload if ORBIT unavailable
    console.warn('ORBIT unavailable, allowing upload');
    next();
  }
};
```

### Pattern 2: Auto-Registration After Upload

**Use case**: Register all uploads automatically

```javascript
// After track is saved to your database
const registerWithOrbit = async (req, res, next) => {
  if (!req.track) return next();
  
  try {
    const result = await client.register(
      req.audioBuffer,
      {
        title: req.track.title,
        artist: req.track.artistName,
        // ... other metadata
      },
      req.user.id
    );
    
    // Update your track record with ORBIT data
    await Track.findByIdAndUpdate(req.track._id, {
      'orbit.registrationId': result.registration_id,
      'orbit.fingerprintHash': result.fingerprint_hash,
      'orbit.registeredAt': new Date()
    });
    
    console.log(`✅ Track registered with ORBIT: ${result.registration_id}`);
  } catch (error) {
    console.error('ORBIT registration failed:', error.message);
    // Don't fail the upload - track can be registered later
  }
  
  next();
};
```

### Pattern 3: Verification on Ingest

**Use case**: Verify incoming audio from partners

```javascript
// When receiving audio from external source
async function verifyIncomingAudio(audioBuffer) {
  const verification = await client.verify(audioBuffer);
  
  return {
    isRegistered: verification.verified,
    isLegitimate: verification.origin?.signature_valid,
    originalOwner: verification.origin?.owner_id,
    originPlatform: verification.origin?.platform,
    transferHistory: verification.transfers,
    metadata: verification.metadata,
    
    // For suspicious content
    isDuplicate: !!verification.duplicate_of,
    similarTracks: verification.content_analysis?.similar_works || []
  };
}
```

---

## Environment Variables

```bash
# Required
ORBIT_API_URL=https://orbit.ohnrshyp.com
ORBIT_PLATFORM_ID=your-platform-id
ORBIT_PRIVATE_KEY=base64-encoded-ed25519-private-key

# Optional
ORBIT_API_KEY=your-api-key  # For rate limiting/billing
```

---

## Error Handling

```javascript
try {
  const result = await client.verify(audioBuffer);
} catch (error) {
  // HTTP status code
  if (error.status === 401) {
    console.error('Invalid credentials');
  } else if (error.status === 409) {
    console.error('Duplicate detected:', error.details);
  } else if (error.status === 429) {
    console.error('Rate limit exceeded');
  } 
  
  // ORBIT-specific error codes
  else if (error.code === 'missing_audio') {
    console.error('No audio provided');
  } else if (error.code === 'invalid_metadata') {
    console.error('Metadata validation failed:', error.details);
  } else if (error.code === 'duplicate_registration') {
    console.error('Audio already registered by your platform');
  }
  
  // Network errors
  else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    console.error('ORBIT service unavailable');
  } 
  
  else {
    console.error(`ORBIT error: ${error.message}`);
  }
}
```

---

## Platform Registration

To use ORBIT, your platform must be registered. Registration provides:

1. **Platform ID** — Your unique identifier in the ORBIT network
2. **Ed25519 Keypair** — For cryptographically signing requests
3. **API Key** — For rate limiting and usage tracking

**To register your platform**: Contact support@ohnrshyp.com

---

## Performance

**GPU-Accelerated Infrastructure**: ORBIT runs on GPU-powered servers (NVIDIA Tesla T4). When you use the ORBIT API, you're accessing neural watermarking and AI analysis capabilities without needing your own GPU infrastructure — it's included in the service.

| Operation | Typical Time | Notes |
|-----------|--------------|-------|
| Verify (fast path) | ~250ms | When no match found |
| Verify (with match) | ~500ms | Includes metadata lookup |
| Register | ~11-15s | Includes neural watermarking + AI analysis |
| Similar search | ~2-3s | Vector similarity search |
| Analyze | ~3-5s | Full AI analysis |

All ML-intensive operations (SilentCipher watermarking, CLAP embeddings, audio analysis) run on ORBIT's GPU infrastructure.

---

## Related Guides

- **[Music Delivery Guide](./MUSIC_DELIVERY_GUIDE.md)** — B2B transfer workflows for distributors and DSPs
- **[Content ID & Provenance Guide](./CONTENT_ID_GUIDE.md)** — How ORBIT replaces traditional rights management

---

## Support

- **Issues**: https://github.com/ohnrshyp/orbit/issues
- **Email**: support@ohnrshyp.com

---

<div align="center">

**The audio file is the message.**

*ORBIT embeds identity into sound itself.*

</div>

