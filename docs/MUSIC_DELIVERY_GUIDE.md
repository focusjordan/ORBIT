# ORBIT Music Delivery Guide

## How ORBIT Replaces Traditional Music Distribution Workflows

**Version**: 1.0  
**Last Updated**: December 2025  
**Audience**: Distributors, Labels, DSPs, Platform Operators

---

## Introduction

This guide explains how ORBIT streamlines the three most common music delivery scenarios:

1. **Artist → Distributor/Label** — Initial content submission
2. **Distributor → DSP/Platform** — Delivery to streaming services
3. **Distributor → Distributor** — Catalog migration between distributors

For each scenario, we show:
- The traditional workflow and its pain points
- How ORBIT simplifies it
- Implementation guidance

---

## Scenario 1: Artist Uploads to Distributor/Label

### Traditional Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TRADITIONAL ARTIST → DISTRIBUTOR                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Artist uploads audio + metadata (often via web form)              │
│                                                                         │
│   2. Distributor manually reviews:                                      │
│      • Is this a duplicate? (listen/compare)                           │
│      • Is metadata complete? (manual check)                            │
│      • Does the artist own this? (trust-based)                         │
│                                                                         │
│   3. If issues found:                                                   │
│      • Email back and forth                                            │
│      • Request corrections                                              │
│      • Re-upload cycle (days/weeks)                                    │
│                                                                         │
│   4. Assign identifiers:                                                │
│      • Generate or validate ISRC                                       │
│      • Generate or validate UPC                                        │
│      • Create internal catalog ID                                      │
│                                                                         │
│   5. Store audio + metadata separately:                                 │
│      • Audio in storage (S3, etc.)                                     │
│      • Metadata in database                                            │
│      • No link between them except filename/ID                         │
│                                                                         │
│   ❌ PROBLEMS:                                                          │
│   • Duplicates caught late (after processing)                          │
│   • No proof artist actually owns content                              │
│   • Metadata can drift from audio                                      │
│   • Re-uploads hard to track                                           │
│   • Manual review bottleneck                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### ORBIT Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       ORBIT ARTIST → DISTRIBUTOR                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Artist uploads audio + basic metadata                              │
│                                                                         │
│   2. ORBIT automatically:                                               │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ ✅ Duplicate check (instant fingerprint comparison)          │  │
│      │ ✅ Auto-extract: duration, format, bitrate, sample rate      │  │
│      │ ✅ AI analysis: genre, mood, BPM, key, instruments           │  │
│      │ ✅ Embed watermark (invisible, survives compression)         │  │
│      │ ✅ Sign with platform's Ed25519 key                          │  │
│      │ ✅ Record in immutable ledger                                 │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   3. If duplicate detected:                                             │
│      • Instant rejection (409 response)                                │
│      • Show original registration details                              │
│      • No wasted processing time                                       │
│                                                                         │
│   4. If new content:                                                    │
│      • Registration ID assigned instantly                              │
│      • Watermarked audio returned                                      │
│      • Full metadata stored in ledger                                  │
│      • Cryptographic proof of registration                             │
│                                                                         │
│   ✅ BENEFITS:                                                          │
│   • Duplicates caught BEFORE processing                                │
│   • Cryptographic proof of registration                                │
│   • Audio carries its own identity                                     │
│   • AI fills metadata gaps automatically                               │
│   • No manual review for basic validation                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```javascript
// Distributor's upload endpoint
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

const orbit = new OrbitClient({
  apiUrl: process.env.ORBIT_API_URL,
  platformId: 'your-distributor-id',
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});

// Express middleware for artist uploads
app.post('/api/releases/upload',
  auth,                     // Verify artist identity
  upload.single('audio'),   // Handle file upload
  
  // ORBIT: Check for duplicates first
  async (req, res, next) => {
    try {
      const verification = await orbit.verify(req.file.buffer);
      
      if (verification.verified) {
        return res.status(409).json({
          error: 'DUPLICATE_DETECTED',
          message: 'This audio is already registered',
          original: {
            platform: verification.provenance.origin.platform,
            registered_at: verification.provenance.origin.timestamp,
            title: verification.registered_metadata.title,
            artist: verification.registered_metadata.artist
          }
        });
      }
      
      // Not a duplicate - continue
      next();
    } catch (error) {
      // If ORBIT unavailable, allow upload (graceful degradation)
      console.warn('ORBIT unavailable:', error.message);
      next();
    }
  },
  
  // ORBIT: Register the new content
  async (req, res) => {
    const registration = await orbit.register(
      req.file.buffer,
      {
        title: req.body.title,
        artist: req.body.artistName,
        isrc: req.body.isrc || null,          // Optional - can assign later
        upc: req.body.upc || null,
        primary_genre: req.body.genre,
        album_title: req.body.albumTitle,
        release_date: req.body.releaseDate,
        p_line: `${new Date().getFullYear()} ${req.body.labelName || req.body.artistName}`,
        c_line: `${new Date().getFullYear()} ${req.body.publisherName || req.body.artistName}`
      },
      req.user.id
    );
    
    // Store the watermarked audio (this is critical!)
    await saveToStorage(registration.watermarked_audio, `releases/${registration.registration_id}.wav`);
    
    // Save release record
    await Release.create({
      title: req.body.title,
      artist: req.user.id,
      audioUrl: `releases/${registration.registration_id}.wav`,
      orbit: {
        registrationId: registration.registration_id,
        fingerprintHash: registration.fingerprint_hash,
        registeredAt: new Date()
      }
    });
    
    res.json({
      success: true,
      registrationId: registration.registration_id,
      fingerprintHash: registration.fingerprint_hash,
      watermarkMethod: registration.watermark_method,  // 'silentcipher' or 'spread'
      processingTimeMs: registration.processing_time_ms
    });
  }
);
```

---

## Scenario 2: Distributor Delivers to DSP/Platform

### Traditional Workflow (DDEX)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TRADITIONAL DDEX DELIVERY                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Prepare DDEX package:                                              │
│      • Create XML metadata file (ERN format)                           │
│      • 50+ page specification to follow                                │
│      • Different DSPs want different fields                            │
│      • XML file: 5-10KB per release                                    │
│                                                                         │
│   2. Package delivery:                                                  │
│      • Audio files (WAV/FLAC)                                          │
│      • XML metadata (separate files)                                   │
│      • Artwork files                                                   │
│      • Checksum files                                                  │
│                                                                         │
│   3. SFTP upload:                                                       │
│      • Each DSP has different SFTP credentials                         │
│      • Different folder structures                                     │
│      • Different file naming conventions                               │
│                                                                         │
│   4. Wait for confirmation:                                             │
│      • Polling for status                                              │
│      • Error reports via email                                         │
│      • Manual error correction                                         │
│      • Days to weeks for full ingestion                                │
│                                                                         │
│   5. Handle rejections:                                                 │
│      • "ISRC already exists" (different version registered elsewhere)  │
│      • "Metadata mismatch" (field format issues)                       │
│      • "Audio quality issues" (discovered after upload)                │
│                                                                         │
│   ❌ PROBLEMS:                                                          │
│   • XML complexity (50+ page specs)                                    │
│   • Metadata/audio separation (can drift)                              │
│   • No proof of origin (trust-based)                                   │
│   • Slow feedback loops (days/weeks)                                   │
│   • Each DSP = different integration                                   │
│   • Schema version conflicts (ERN 3.x vs 4.x)                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### ORBIT Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ORBIT B2B DELIVERY                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Initiate transfer (one API call):                                  │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ POST /orbit/v1/transfer                                       │  │
│      │ {                                                             │  │
│      │   "registration_id": 12345,                                   │  │
│      │   "to_platform": "spotify" // or any registered platform     │  │
│      │ }                                                             │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   2. Recipient notified (webhook or polling):                           │
│      • "You have a pending transfer from distributor-x"                │
│      • Full metadata preview available                                 │
│      • Audio fingerprint for validation                                │
│                                                                         │
│   3. Recipient accepts (one API call):                                  │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ POST /orbit/v1/accept                                         │  │
│      │ { "transfer_id": 67890 }                                      │  │
│      │                                                               │  │
│      │ Response includes:                                            │  │
│      │ • new_registration_id (your platform's registration)         │  │
│      │ • Full metadata (title, artist, isrc, upc, duration_ms)      │  │
│      │ • Complete provenance chain (full_chain array)               │  │
│      │ • Entry hash and watermark hash for verification             │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   4. Instant verification:                                              │
│      • Audio is cryptographically proven to be from sender             │
│      • Metadata is signed by both parties                              │
│      • Chain of custody is immutable                                   │
│      • No "ISRC conflict" possible (fingerprint is definitive)         │
│                                                                         │
│   ✅ BENEFITS:                                                          │
│   • Binary protocol (400 bytes vs 6KB XML)                             │
│   • Audio carries its own metadata                                     │
│   • Cryptographic proof of transfer                                    │
│   • Real-time confirmation                                             │
│   • One integration works for all platforms                            │
│   • No schema version conflicts                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

**Sender (Distributor):**

```javascript
const orbit = new OrbitClient({
  apiUrl: process.env.ORBIT_API_URL,
  platformId: 'distributor-acme',
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});

// Deliver release to DSP
async function deliverToDSP(releaseId, dspPlatformId) {
  // Get our registration
  const release = await Release.findById(releaseId);
  const registrationId = release.orbit.registrationId;
  
  // Initiate transfer
  const transfer = await orbit.transfer(registrationId, dspPlatformId);
  
  console.log(`Transfer initiated: ${transfer.transfer_id}`);
  console.log(`Status: ${transfer.status}`);           // 'pending'
  console.log(`Expires: ${transfer.expires_at}`);      // 7 days default
  
  // Save transfer record
  await Delivery.create({
    release: releaseId,
    dsp: dspPlatformId,
    orbitTransferId: transfer.transfer_id,
    status: 'pending',
    initiatedAt: new Date()
  });
  
  return transfer;
}

// Check transfer status
async function checkDeliveryStatus(deliveryId) {
  const delivery = await Delivery.findById(deliveryId);
  const chain = await orbit.getChain(delivery.release.orbit.fingerprintHash);
  
  const transfer = chain.transfers.find(t => t.transfer_id === delivery.orbitTransferId);
  
  return {
    status: transfer.status,  // 'pending', 'accepted', 'expired'
    acceptedAt: transfer.accepted_at,
    recipientRegistrationId: transfer.new_registration_id
  };
}
```

**Recipient (DSP):**

```javascript
const orbit = new OrbitClient({
  apiUrl: process.env.ORBIT_API_URL,
  platformId: 'dsp-streamify',
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});

// Webhook handler for incoming transfers
app.post('/webhooks/orbit/transfer', async (req, res) => {
  const { transfer_id, from_platform, metadata_preview } = req.body;
  
  console.log(`Incoming transfer from ${from_platform}`);
  console.log(`Track: ${metadata_preview.title} by ${metadata_preview.artist}`);
  
  // Store pending transfer for review (or auto-accept based on business rules)
  await PendingTransfer.create({
    orbitTransferId: transfer_id,
    fromPlatform: from_platform,
    title: metadata_preview.title,
    artist: metadata_preview.artist,
    receivedAt: new Date()
  });
  
  res.sendStatus(200);
});

// Accept a transfer
async function acceptTransfer(pendingTransferId) {
  const pending = await PendingTransfer.findById(pendingTransferId);
  
  // Accept via ORBIT
  const result = await orbit.acceptTransfer(pending.orbitTransferId);
  
  // Note: In current v1, acceptTransfer returns metadata and chain but NOT audio.
  // You would typically already have the audio from the original delivery.
  // Future versions may include re-watermarked audio in the response.
  
  // Create our internal track record
  const track = await Track.create({
    title: result.metadata.title,
    artist: result.metadata.artist,
    isrc: result.metadata.isrc,
    orbit: {
      registrationId: result.new_registration_id,
      receivedFrom: pending.fromPlatform,
      chain: result.full_chain,
      entryHash: result.entry_hash
    }
  });
  
  console.log(`✅ Accepted transfer: ${result.new_registration_id}`);
  console.log(`   Chain: ${result.full_chain.map(c => c.platform).join(' → ')}`);
  
  return track;
}
```

---

## Scenario 3: Catalog Migration Between Distributors

### Traditional Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  TRADITIONAL CATALOG MIGRATION                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Export from old distributor:                                       │
│      • Request data export (manual process)                            │
│      • Wait for export to be prepared (days/weeks)                     │
│      • Download audio files + metadata CSV/Excel                       │
│      • Cross-reference to ensure completeness                          │
│                                                                         │
│   2. Transform metadata:                                                │
│      • Map old distributor's fields → new distributor's fields         │
│      • Handle different naming conventions                             │
│      • Resolve ISRC conflicts                                          │
│      • Manual data cleaning                                            │
│                                                                         │
│   3. Re-upload to new distributor:                                      │
│      • Upload audio files one by one (or bulk)                         │
│      • Import metadata                                                 │
│      • Link audio to metadata                                          │
│      • Resolve duplicate detection issues                              │
│                                                                         │
│   4. Verify migration:                                                  │
│      • Check all releases migrated                                     │
│      • Verify metadata accuracy                                        │
│      • Confirm streaming links still work                              │
│                                                                         │
│   5. Takedown from old distributor:                                     │
│      • Request content removal                                         │
│      • Wait for confirmation                                           │
│      • Coordinate timing to avoid double-listing                       │
│                                                                         │
│   ❌ PROBLEMS:                                                          │
│   • Weeks/months to complete                                           │
│   • Data loss during transformation                                    │
│   • Duplicate ISRC issues                                              │
│   • No proof of original registration                                  │
│   • Timing coordination nightmare                                      │
│   • Manual verification required                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### ORBIT Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ORBIT CATALOG MIGRATION                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Bulk transfer (from old distributor):                              │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ // Export all registrations for an artist/label              │  │
│      │ for (const release of catalog) {                             │  │
│      │   await oldDistributor.transfer(                             │  │
│      │     release.orbit.registrationId,                            │  │
│      │     'new-distributor-id'                                     │  │
│      │   );                                                         │  │
│      │ }                                                            │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   2. Bulk accept (at new distributor):                                  │
│      ┌──────────────────────────────────────────────────────────────┐  │
│      │ // Accept all pending transfers                              │  │
│      │ const pending = await getPendingTransfers();                 │  │
│      │ for (const transfer of pending) {                            │  │
│      │   const result = await orbit.acceptTransfer(transfer.id);    │  │
│      │   // Audio + metadata + chain all included                   │  │
│      │   await saveToCatalog(result);                               │  │
│      │ }                                                            │  │
│      └──────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   3. Instant verification:                                              │
│      • Complete chain of custody preserved                             │
│      • Original registration date maintained                           │
│      • All metadata transferred intact                                 │
│      • Cryptographic proof of legitimate migration                     │
│                                                                         │
│   4. No takedown needed:                                                │
│      • Audio carries chain: Old Dist → New Dist                        │
│      • DSPs can verify the transfer was legitimate                     │
│      • No duplicate detection issues (fingerprint unchanged)           │
│                                                                         │
│   ✅ BENEFITS:                                                          │
│   • Hours instead of weeks                                             │
│   • Zero data loss                                                     │
│   • Complete provenance preserved                                      │
│   • No duplicate/conflict issues                                       │
│   • Cryptographic proof of transfer                                    │
│   • Self-serve (no support tickets)                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation

**Exporting Distributor:**

```javascript
// Bulk transfer entire catalog
async function migrateCatalogTo(artistId, newDistributorId) {
  const releases = await Release.find({
    artist: artistId,
    'orbit.registrationId': { $exists: true }
  });
  
  const results = [];
  
  for (const release of releases) {
    try {
      const transfer = await orbit.transfer(
        release.orbit.registrationId,
        newDistributorId
      );
      
      results.push({
        releaseId: release._id,
        title: release.title,
        transferId: transfer.transfer_id,
        status: 'pending'
      });
      
      // Mark release as pending migration
      await Release.findByIdAndUpdate(release._id, {
        'migration.toPlatform': newDistributorId,
        'migration.transferId': transfer.transfer_id,
        'migration.initiatedAt': new Date()
      });
      
    } catch (error) {
      results.push({
        releaseId: release._id,
        title: release.title,
        error: error.message
      });
    }
  }
  
  return {
    total: releases.length,
    succeeded: results.filter(r => r.transferId).length,
    failed: results.filter(r => r.error).length,
    details: results
  };
}
```

**Importing Distributor:**

```javascript
// Accept bulk migration
async function acceptMigration(fromDistributorId) {
  // Get all pending transfers from specific distributor
  // (This would typically come from a webhook batch or polling)
  const pendingTransfers = await getPendingTransfersFrom(fromDistributorId);
  
  const results = [];
  
  for (const transfer of pendingTransfers) {
    try {
      const result = await orbit.acceptTransfer(transfer.id);
      
      // Create release record with full provenance
      // Note: Audio is typically received separately from the transfer flow
      const release = await Release.create({
        title: result.metadata.title,
        artist: result.metadata.artist,
        isrc: result.metadata.isrc,
        upc: result.metadata.upc,
        
        // Full ORBIT data
        orbit: {
          registrationId: result.new_registration_id,
          chain: result.full_chain,
          entryHash: result.entry_hash,
          watermarkHash: result.watermark_hash,
          receivedAt: new Date()
        }
      });
      
      results.push({
        title: result.metadata.title,
        newRegistrationId: result.new_registration_id,
        releaseId: release._id
      });
      
    } catch (error) {
      results.push({
        transferId: transfer.id,
        error: error.message
      });
    }
  }
  
  return {
    accepted: results.filter(r => r.newRegistrationId).length,
    failed: results.filter(r => r.error).length,
    details: results
  };
}
```

---

## Summary: ORBIT vs Traditional Workflows

| Aspect | Traditional | ORBIT |
|--------|-------------|-------|
| **Metadata format** | XML/CSV (5-10KB) | CBOR binary (~400 bytes) |
| **Metadata location** | Separate files | Embedded in audio |
| **Duplicate detection** | After upload (slow) | Before upload (instant) |
| **Proof of ownership** | Trust-based | Cryptographic signatures |
| **Transfer verification** | Manual confirmation | Automatic via ledger |
| **Catalog migration** | Weeks/months | Hours |
| **Data loss risk** | High | Zero (complete chain preserved) |
| **DSP integrations** | One per DSP | Universal protocol |
| **ISRC conflicts** | Common | Impossible (fingerprint = identity) |

---

## Technical Compatibility

**ORBIT is a protocol, not a platform.** It works with any tech stack:

| Your Stack | ORBIT Works With |
|------------|------------------|
| **Backend** | Express, Fastify, NestJS, Koa, Hapi, plain Node.js |
| **Database** | PostgreSQL, MySQL, MongoDB, DynamoDB, any database |
| **Storage** | S3, GCS, Azure Blob, Cloudflare R2, local filesystem |
| **Language** | JavaScript, TypeScript (Python SDK coming soon) |
| **Runtime** | Node.js 18+, Docker, serverless (Lambda, Cloud Functions) |

**No vendor lock-in.** ORBIT stores provenance in its own ledger. You just store a `registration_id` reference in your existing database.

**No GPU required.** All AI/ML processing happens on ORBIT's infrastructure.

---

## Getting Started

### For Distributors

1. **Register as ORBIT platform**: Contact support@ohnrshyp.com
2. **Integrate SDK**: `npm install @ohnrshyp/orbit-sdk`
3. **Add to upload pipeline**: Duplicate check → Register → Store watermarked audio
4. **Enable B2B transfers**: Implement transfer/accept endpoints

### For DSPs

1. **Register as ORBIT platform**: Contact support@ohnrshyp.com
2. **Integrate SDK**: `npm install @ohnrshyp/orbit-sdk`
3. **Set up webhook**: Receive transfer notifications
4. **Accept transfers**: Auto-accept or queue for review

### For Labels/Artists

1. **Use ORBIT-enabled distributor**: Your content automatically registered
2. **Verify provenance**: Any platform can verify your content is legitimate
3. **Migrate freely**: Transfer catalog between distributors without data loss

---

## Next Steps

- **[SDK Quick Start Guide](./SDK_QUICKSTART.md)** — Technical integration details
- **[Content ID & Provenance Guide](./CONTENT_ID_GUIDE.md)** — DRM replacement capabilities

---

<div align="center">

**The audio file is the message.**

*ORBIT makes music distribution as simple as sending a file.*

</div>

