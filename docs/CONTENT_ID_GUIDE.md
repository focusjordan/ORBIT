# ORBIT Content ID & Provenance Guide

## How ORBIT Replaces Traditional Rights Management Workflows

**Version**: 1.0  
**Last Updated**: December 2025  
**Audience**: Platform Operators, Rights Managers, DSPs, Content ID Administrators

---

## Introduction

This guide explains how ORBIT addresses the core challenges that Content ID systems (YouTube, Meta Rights Manager, etc.) are designed to solve — but with a fundamentally different approach.

**Current Model**: Detect unauthorized content *after* it's uploaded  
**ORBIT Model**: Prove ownership *before* content is distributed

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     THE FUNDAMENTAL DIFFERENCE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  CONTENT ID:                                                            │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐                │
│  │ User    │──▶│ Platform│──▶│ Scan vs │──▶│ Claim   │                │
│  │ Uploads │   │ Ingests │   │ Database│   │ If Match│                │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘                │
│                                    ▲                                    │
│                          Reference files                                │
│                          uploaded separately                            │
│                                                                         │
│  ORBIT:                                                                 │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐                │
│  │ Creator │──▶│ ORBIT   │──▶│ Proof   │──▶│ Any     │                │
│  │ Finishes│   │Registers│   │ IN File │   │ Platform│                │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘                │
│                     │              │              │                     │
│                     ▼              ▼              ▼                     │
│               Fingerprint    Watermark      Platform                   │
│               + Signature    embedded       verifies                   │
│               in ledger      in audio       instantly                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Current Systems Explained

### YouTube Content Management System

YouTube's rights management has three core components:

| Component | Purpose | What You Upload |
|-----------|---------|-----------------|
| **Asset** | Ownership + policy rules | Metadata, ownership %, territories |
| **Reference** | Fingerprint for matching | Media file (audio/video) |
| **Video** | Public representation | Same media file with public metadata |

**Key Limitation**: These are managed *separately*. You must create and link all three for each piece of IP.

### Meta Rights Manager

Similar architecture:
- Upload reference files
- System matches against user content
- Apply actions: Monetize, Block, Track
- Handle disputes through queues

### Common Queue Types (Both Systems)

| Queue | What It Contains | Why Manual Review Needed |
|-------|------------------|-------------------------|
| **Ownership Conflicts** | Multiple parties claim 100% in same territory | No authoritative proof of who owns it |
| **Reference Overlaps** | Fingerprints from different owners match same content | Unclear who has exclusive rights |
| **Disputes & Appeals** | Users contest claims | No cryptographic evidence |
| **Potential Claims** | Low-confidence matches | Need human judgment |
| **Invalid References** | Segments not eligible for matching | Quality/format issues |

---

## How ORBIT Intercepts These Problems

### The Unified Registration Model

ORBIT collapses Asset + Reference into a single atomic registration:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    YOUTUBE: THREE SEPARATE OBJECTS                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐                                                       │
│  │    ASSET     │◀── You create this with ownership info               │
│  │  (Ownership) │                                                       │
│  └──────┬───────┘                                                       │
│         │ link                                                          │
│         ▼                                                               │
│  ┌──────────────┐                                                       │
│  │  REFERENCE   │◀── You upload this separately                        │
│  │ (Fingerprint)│                                                       │
│  └──────┬───────┘                                                       │
│         │ link                                                          │
│         ▼                                                               │
│  ┌──────────────┐                                                       │
│  │    VIDEO     │◀── You upload this for public display                │
│  │  (Public)    │                                                       │
│  └──────────────┘                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    ORBIT: SINGLE REGISTRATION                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     orbit.register(audio, metadata, ownerId)      │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │  Creates ALL of these atomically:                                │  │
│  │                                                                   │  │
│  │  ✅ Asset (ownership)     → owner_id + Ed25519 signature         │  │
│  │  ✅ Reference (matching)  → Chromaprint fingerprint              │  │
│  │  ✅ Semantic fingerprint  → CLAP 512-dim embedding               │  │
│  │  ✅ Proof in file         → Neural watermark in audio            │  │
│  │  ✅ Metadata (33+ fields) → ERN-aligned, CBOR-encoded            │  │
│  │  ✅ Chain of custody      → Immutable ledger entry               │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Video (public display) = Platform's responsibility                     │
│  Policy (monetize/track/block) = Platform's business decision          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Problem-by-Problem Solutions

### 1. Ownership Conflicts

**Current Problem**: Multiple content owners claim 100% ownership in the same territory. Manual review required because there's no authoritative proof.

**ORBIT Solution**: Ownership is cryptographically signed at registration time. The ledger shows definitively who registered when.

```javascript
// Platform queries ORBIT for ownership evidence
const chain = await orbit.getChain(fingerprintHash);

// The ledger is authoritative:
console.log('Registration history:');
chain.registrations.forEach((reg, index) => {
  console.log(`${index + 1}. Platform: ${reg.platform}`);
  console.log(`   Owner: ${reg.owner_id}`);
  console.log(`   Registered: ${reg.timestamp}`);
  console.log(`   Signature valid: ${reg.signature_valid}`);
});

// chain.registrations[0] = FIRST registrant (cryptographically proven)
// No "conflict" - just clear, signed sequence
```

**Platform Implementation**:

```javascript
// When ownership dispute arises
async function resolveOwnershipDispute(contentId) {
  const content = await Content.findById(contentId);
  const chain = await orbit.getChain(content.orbit.fingerprintHash);
  
  if (chain.registrations.length === 1) {
    // Single registrant - no conflict
    return { status: 'CLEAR', owner: chain.registrations[0] };
  }
  
  // Multiple registrations exist
  const firstRegistration = chain.registrations[0];
  
  return {
    status: 'MULTIPLE_REGISTRATIONS',
    first_registrant: {
      platform: firstRegistration.platform,
      owner_id: firstRegistration.owner_id,
      timestamp: firstRegistration.timestamp,
      signature_valid: firstRegistration.signature_valid
    },
    all_registrations: chain.registrations,
    recommendation: 'First valid signature wins, unless license proves otherwise'
  };
}
```

### 2. Reference Overlaps

**Current Problem**: Multiple content owners upload reference files with overlapping segments. Manual segment-by-segment review needed.

**ORBIT Solution**: Single canonical fingerprint per audio. Same audio = same fingerprint. Chain shows all parties who registered, in sequence.

```
Content ID:                          ORBIT:
┌─────────────┐                      ┌─────────────┐
│ Reference A │──┐                   │  Single     │
│ (Owner 1)   │  │                   │ Fingerprint │
└─────────────┘  │  ┌─────────┐      │ (from audio)│
                 ├─▶│ OVERLAP │      └──────┬──────┘
┌─────────────┐  │  │ QUEUE   │             │
│ Reference B │──┘  └─────────┘      ┌──────▼──────┐
│ (Owner 2)   │                      │  Ledger     │
└─────────────┘                      │  Shows:     │
                                     │  1. Owner A │
Which segment                        │  2. Owner B │
belongs to whom?                     │  (sequence) │
                                     └─────────────┘
                                     
                                     No overlap to resolve
```

### 3. Disputes and Appeals

**Current Problem**: Users contest claims. Multi-day back-and-forth process. Revenue held during dispute. No definitive evidence.

**ORBIT Solution**: The watermark IN the audio proves origin. The ledger provides cryptographic chain of custody. Resolution can be instant.

```javascript
// When a user disputes a claim
async function handleDispute(disputeId) {
  const dispute = await Dispute.findById(disputeId);
  const content = await Content.findById(dispute.contentId);
  
  // Get cryptographic evidence from ORBIT
  const verification = await orbit.verify(content.audioBuffer);
  const chain = await orbit.getChain(content.orbit.fingerprintHash);
  
  const evidence = {
    // Watermark proves origin
    watermark: {
      detected: verification.watermark.detected,
      valid: verification.watermark.valid,
      method: verification.watermark.method,
      payload_hash: verification.watermark.payload_hash
    },
    
    // Signature proves authenticity
    signature: {
      valid: verification.provenance.origin.signature_valid,
      platform: verification.provenance.origin.platform,
      owner_id: verification.provenance.origin.owner_id
    },
    
    // Chain shows complete history
    chain_of_custody: chain.chain,
    
    // Confidence assessment
    confidence: verification.confidence_summary.overall_verification
  };
  
  // Platform makes decision based on cryptographic evidence
  if (evidence.watermark.valid && evidence.signature.valid) {
    // Strong evidence - claim is legitimate
    return {
      recommendation: 'UPHOLD_CLAIM',
      confidence: 'HIGH',
      reason: 'Cryptographic watermark and signature verify origin',
      evidence
    };
  } else if (evidence.watermark.detected && !evidence.signature.valid) {
    // Watermark present but signature issue
    return {
      recommendation: 'MANUAL_REVIEW',
      confidence: 'MEDIUM',
      reason: 'Watermark detected but signature verification failed',
      evidence
    };
  } else {
    // No watermark found
    return {
      recommendation: 'INVESTIGATE',
      confidence: 'LOW',
      reason: 'No ORBIT watermark detected - may be pre-ORBIT content',
      evidence
    };
  }
}
```

### 4. Potential Claims (Low-Confidence Matches)

**Current Problem**: Short or low-confidence matches need manual review before claims are active.

**ORBIT Solution**: CLAP embeddings provide relationship classification with confidence scores. Platforms can set thresholds.

```javascript
// ORBIT's similarity detection with relationship classification
const similar = await orbit.similar(audioBuffer, {
  threshold: 0.5,
  limit: 10
});

// Each result includes relationship type
similar.results.forEach(match => {
  console.log(`${match.title} by ${match.artist}`);
  console.log(`  Similarity: ${(match.similarity * 100).toFixed(1)}%`);
  console.log(`  Relationship: ${match.relationship}`);
  console.log(`  Confidence: ${match.confidence}`);
});

// Relationship types (from most to least similar):
// - EXACT_DUPLICATE (95%+): Same file or transcoded
// - LIKELY_DUPLICATE (85-94%): Pitch-shifted, minor edits
// - POSSIBLE_REMIX (75-84%): Remix or significant edit
// - POSSIBLE_COVER (65-74%): Same song, different recording
// - STYLISTICALLY_SIMILAR (55-64%): Similar genre/style
// - DIFFERENT_WORK (<55%): Unrelated
```

**Platform Implementation**:

```javascript
// Platform sets policy thresholds
const POLICY_THRESHOLDS = {
  AUTO_CLAIM: ['EXACT_DUPLICATE', 'LIKELY_DUPLICATE'],
  MANUAL_REVIEW: ['POSSIBLE_REMIX', 'POSSIBLE_COVER'],
  TRACK_ONLY: ['STYLISTICALLY_SIMILAR'],
  IGNORE: ['DIFFERENT_WORK']
};

async function processUpload(audioBuffer) {
  const similar = await orbit.similar(audioBuffer, { threshold: 0.55 });
  
  for (const match of similar.results) {
    if (POLICY_THRESHOLDS.AUTO_CLAIM.includes(match.relationship)) {
      // Automatic claim - high confidence
      await createClaim(match, 'auto');
    } 
    else if (POLICY_THRESHOLDS.MANUAL_REVIEW.includes(match.relationship)) {
      // Route to review queue
      await addToReviewQueue(match, 'potential_derivative');
    }
    else if (POLICY_THRESHOLDS.TRACK_ONLY.includes(match.relationship)) {
      // Track but don't claim
      await trackContent(match);
    }
    // DIFFERENT_WORK: no action needed
  }
}
```

### 5. Invalid References

**Current Problem**: Reference segments that aren't eligible for Content ID matching sit in a queue pending review.

**ORBIT Solution**: Validation happens at registration time. Audio that can't be processed fails immediately — no lingering invalid state.

```javascript
// ORBIT validates during registration
try {
  const result = await orbit.register(audioBuffer, metadata, ownerId);
  // Success: Audio is valid, watermarked, fingerprinted, signed
  console.log(`Registered: ${result.registration_id}`);
} catch (error) {
  // Immediate failure - no "pending invalid" state
  if (error.code === 'audio_too_short') {
    console.error('Audio must be at least 5 seconds');
  } else if (error.code === 'invalid_audio') {
    console.error('Audio format not supported');
  } else if (error.code === 'watermark_failed') {
    console.error('Could not embed watermark');
  }
}
```

---

## Policy Separation: ORBIT vs Platform

A key architectural difference: **ORBIT provides proof, not policy.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    YOUTUBE CONTENT ID MODEL                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ASSET = Ownership + Policy bundled together                            │
│                                                                         │
│  When match found → YouTube applies the policy automatically            │
│  Policy options: Monetize | Track | Block                              │
│  Territory-specific rules embedded in asset                            │
│                                                                         │
│  Platform-specific: Only works on YouTube                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        ORBIT MODEL                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ORBIT provides:              Platform decides:                         │
│  ┌────────────────────┐       ┌────────────────────┐                   │
│  │ • Ownership proof  │       │ • What to do       │                   │
│  │ • Chain of custody │       │ • Monetize/Block   │                   │
│  │ • Fingerprint      │       │ • Territory rules  │                   │
│  │ • Watermark        │       │ • Revenue sharing  │                   │
│  │ • Similarity data  │       │ • User interface   │                   │
│  └────────────────────┘       └────────────────────┘                   │
│                                                                         │
│  Universal: Same proof works on YouTube, Spotify, TikTok, anywhere     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Why this matters**:
- Platforms retain full control over their business logic
- No vendor lock-in to a single platform's policy model
- Same registration works everywhere — register once, prove anywhere

---

## Implementation Patterns

### Pattern 1: Ingest Verification

Check all incoming content against ORBIT before accepting:

```javascript
// Middleware for content ingest
async function verifyIncomingContent(req, res, next) {
  const audioBuffer = req.file.buffer;
  
  try {
    const verification = await orbit.verify(audioBuffer);
    
    if (verification.verified) {
      // Content is registered in ORBIT
      req.orbit = {
        registered: true,
        origin: verification.provenance.origin,
        metadata: verification.registered_metadata,
        chain: verification.provenance,
        confidence: verification.confidence_summary
      };
      
      // Platform applies their policy
      const policy = await getPlatformPolicy(verification.provenance.origin);
      req.orbitPolicy = policy;
    } else {
      // Content not in ORBIT
      req.orbit = { registered: false };
    }
    
    next();
  } catch (error) {
    // ORBIT unavailable - graceful degradation
    console.warn('ORBIT verification failed:', error.message);
    req.orbit = { registered: false, error: error.message };
    next();
  }
}
```

### Pattern 2: Rights Management Dashboard API

Build your own Content Manager interface using ORBIT data:

```javascript
// API endpoints for rights management UI

// GET /api/rights/issues - List all items needing review
app.get('/api/rights/issues', async (req, res) => {
  const issues = [];
  
  // Get content flagged for review
  const flaggedContent = await Content.find({ 'review.needed': true });
  
  for (const content of flaggedContent) {
    const chain = await orbit.getChain(content.orbit.fingerprintHash);
    const similar = await orbit.similar(content.audioBuffer, { threshold: 0.65 });
    
    issues.push({
      id: content._id,
      title: content.title,
      issue_type: determineIssueType(chain, similar),
      registrations: chain.registrations.length,
      similar_works: similar.results.length,
      has_ownership_conflict: chain.registrations.length > 1,
      has_derivatives: similar.summary.has_derivatives,
      created_at: content.createdAt
    });
  }
  
  res.json({ issues });
});

// GET /api/rights/issues/:id - Get detailed issue data
app.get('/api/rights/issues/:id', async (req, res) => {
  const content = await Content.findById(req.params.id);
  const chain = await orbit.getChain(content.orbit.fingerprintHash);
  const verification = await orbit.verify(content.audioBuffer);
  const similar = await orbit.similar(content.audioBuffer, { threshold: 0.55 });
  
  res.json({
    content: {
      id: content._id,
      title: content.title,
      artist: content.artist
    },
    
    // Ownership evidence
    ownership: {
      registrations: chain.registrations,
      first_registrant: chain.registrations[0],
      conflict: chain.registrations.length > 1
    },
    
    // Watermark evidence
    watermark: {
      detected: verification.watermark.detected,
      valid: verification.watermark.valid,
      method: verification.watermark.method
    },
    
    // Signature verification
    signature: {
      valid: verification.provenance.origin.signature_valid,
      platform: verification.provenance.origin.platform
    },
    
    // Related content
    similar_works: similar.results.map(s => ({
      registration_id: s.registration_id,
      title: s.title,
      artist: s.artist,
      similarity: s.similarity,
      relationship: s.relationship
    })),
    
    // Chain of custody
    chain_of_custody: chain.chain,
    
    // Confidence summary
    confidence: verification.confidence_summary
  });
});

// POST /api/rights/issues/:id/resolve - Resolve an issue
app.post('/api/rights/issues/:id/resolve', async (req, res) => {
  const { decision, policy, notes } = req.body;
  const content = await Content.findById(req.params.id);
  
  // Apply platform's policy decision
  await Content.findByIdAndUpdate(req.params.id, {
    'review.needed': false,
    'review.resolved_at': new Date(),
    'review.decision': decision,
    'policy.action': policy, // 'monetize', 'track', 'block'
    'policy.notes': notes
  });
  
  res.json({ success: true, message: 'Issue resolved' });
});
```

### Pattern 3: Dispute Resolution Workflow

```javascript
// Dispute handling with ORBIT evidence

// POST /api/disputes - User files a dispute
app.post('/api/disputes', async (req, res) => {
  const { claim_id, reason, evidence_description } = req.body;
  
  const claim = await Claim.findById(claim_id);
  const content = await Content.findById(claim.content_id);
  
  // Gather ORBIT evidence immediately
  const orbitEvidence = await gatherOrbitEvidence(content);
  
  const dispute = await Dispute.create({
    claim_id,
    filed_by: req.user.id,
    reason,
    evidence_description,
    orbit_evidence: orbitEvidence,
    status: 'pending'
  });
  
  res.json({ dispute_id: dispute._id, status: 'pending' });
});

async function gatherOrbitEvidence(content) {
  const verification = await orbit.verify(content.audioBuffer);
  const chain = await orbit.getChain(content.orbit.fingerprintHash);
  
  return {
    gathered_at: new Date(),
    
    watermark: {
      detected: verification.watermark.detected,
      valid: verification.watermark.valid
    },
    
    origin: {
      platform: verification.provenance.origin.platform,
      owner_id: verification.provenance.origin.owner_id,
      timestamp: verification.provenance.origin.timestamp,
      signature_valid: verification.provenance.origin.signature_valid
    },
    
    chain_length: chain.registrations.length,
    first_registration: chain.registrations[0],
    transfers: chain.transfers,
    
    confidence: verification.confidence_summary.overall_verification
  };
}

// GET /api/disputes/:id - Get dispute with evidence
app.get('/api/disputes/:id', async (req, res) => {
  const dispute = await Dispute.findById(req.params.id);
  
  // Evidence was gathered at filing time
  // Platform can make decision based on cryptographic proof
  
  res.json({
    dispute,
    recommendation: generateRecommendation(dispute.orbit_evidence)
  });
});

function generateRecommendation(evidence) {
  if (evidence.watermark.valid && evidence.origin.signature_valid) {
    return {
      action: 'UPHOLD_CLAIM',
      confidence: 'HIGH',
      reason: 'Cryptographic evidence supports claimant'
    };
  } else if (evidence.watermark.detected) {
    return {
      action: 'REVIEW',
      confidence: 'MEDIUM', 
      reason: 'Watermark present but signature issue'
    };
  } else {
    return {
      action: 'INVESTIGATE',
      confidence: 'LOW',
      reason: 'No ORBIT watermark - may be pre-ORBIT content'
    };
  }
}
```

---

## What Platforms Need to Build

ORBIT provides the infrastructure. Platforms build the experience:

| ORBIT Provides | Platform Builds |
|----------------|-----------------|
| Registration API | Upload UI |
| Verification API | Matching dashboard |
| Chain of custody lookup | Rights management interface |
| Similarity search | Policy configuration UI |
| Cryptographic evidence | Dispute resolution workflow |
| Relationship classification | Revenue sharing logic |

### Minimal Integration (Day 1)

```javascript
// Just verify incoming content
const verification = await orbit.verify(audioBuffer);
if (verification.verified) {
  // Show provenance to user, apply platform policy
}
```

### Full Integration

```javascript
// 1. Verify all incoming content
// 2. Register original content from your creators
// 3. Store watermarked audio
// 4. Build review queues using chain + similar APIs
// 5. Resolve disputes with cryptographic evidence
// 6. Transfer content to partners via B2B protocol
```

---

## Comparison Summary

| Aspect | Content ID / Rights Manager | ORBIT |
|--------|----------------------------|-------|
| **When proof is created** | After upload to platform | At time of creation |
| **Where proof lives** | Platform's database | In the audio itself + ledger |
| **Ownership basis** | Trust (who claimed first) | Cryptographic signature |
| **Conflict resolution** | Manual queue, days/weeks | Query ledger, seconds |
| **Platform scope** | YouTube only / Meta only | Universal (any platform) |
| **Reference management** | Separate upload + linking | Automatic at registration |
| **Derivative detection** | Fingerprint matching | Semantic similarity (covers, remixes) |
| **Evidence type** | "We detected a match" | "Here's the cryptographic proof" |
| **Policy bundling** | Attached to asset | Platform's decision |

---

## Technical Compatibility

ORBIT integrates with any tech stack:

| Your Stack | ORBIT Works With |
|------------|------------------|
| **Backend** | Express, Fastify, NestJS, Koa, Hapi, plain Node.js |
| **Database** | PostgreSQL, MySQL, MongoDB, DynamoDB |
| **Storage** | S3, GCS, Azure Blob, R2, local filesystem |
| **Language** | JavaScript, TypeScript (Python SDK coming soon) |
| **Runtime** | Node.js 18+, Docker, serverless |

**No GPU required on your end** — all ML processing runs on ORBIT's infrastructure.

---

## Getting Started

### For Platforms

1. **Register as ORBIT platform**: Contact support@ohnrshyp.com
2. **Install SDK**: `npm install @ohnrshyp/orbit-sdk`
3. **Add verification to ingest**: Check uploads against ORBIT
4. **Build your policy layer**: Decide monetize/track/block rules
5. **Create your UI**: Build rights management dashboard using ORBIT APIs

### For Rights Holders

1. **Work with ORBIT-enabled distributor**: Content automatically registered
2. **Verify provenance anywhere**: Any platform can verify your content
3. **Resolve disputes faster**: Cryptographic proof eliminates uncertainty

---

## API Reference

### Core Endpoints for Rights Management

| Endpoint | Purpose | Use Case |
|----------|---------|----------|
| `POST /orbit/v1/verify` | Check if audio is registered | Ingest verification |
| `GET /orbit/v1/chain/:fingerprint` | Get complete custody chain | Ownership disputes |
| `POST /orbit/v2/similar` | Find related content | Derivative detection |
| `POST /orbit/v1/register` | Register new content | Rights holder registration |

### SDK Methods

```javascript
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

const orbit = new OrbitClient({
  apiUrl: 'https://orbit.ohnrshyp.com',
  platformId: 'your-platform-id',
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});

// Verify content provenance
const verification = await orbit.verify(audioBuffer);

// Get chain of custody
const chain = await orbit.getChain(fingerprintHash);

// Find similar content
const similar = await orbit.similar(audioBuffer, { threshold: 0.65 });

// Register new content
const registration = await orbit.register(audioBuffer, metadata, ownerId);
```

---

## Future: ORBIT Platform UI

While platforms currently build their own interfaces, a centralized ORBIT dashboard is planned for future development. This would provide:

- Cross-platform visibility for rights holders
- Inter-platform communication for transfers
- Unified dispute resolution interface
- Analytics across all ORBIT-enabled platforms

For now, the API-first approach ensures:
- No dependency on ORBIT's UI timeline
- Full customization for each platform's needs
- Immediate integration capability

---

## Related Guides

- **[SDK Quick Start Guide](./SDK_QUICKSTART.md)** — Technical integration details
- **[Music Delivery Guide](./MUSIC_DELIVERY_GUIDE.md)** — B2B transfer workflows

---

## Support

- **Issues**: https://github.com/ohnrshyp/orbit/issues
- **Email**: support@ohnrshyp.com

---

<div align="center">

**Proof at source, not detection after.**

*ORBIT replaces "we detected a match" with "here's the cryptographic proof."*

</div>

