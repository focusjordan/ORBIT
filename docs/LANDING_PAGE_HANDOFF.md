# ORBIT Landing Page Handoff

## For: Ohnrshyp Development Agent
## Goal: Create orbit.ohnrshyp.com

---

## Overview

ORBIT (Origin-Based Identity & Rights Transfer Protocol) is now ready for public launch. We need a landing page at `orbit.ohnrshyp.com` that serves as the entry point for developers and platforms interested in integrating ORBIT.

---

## What is ORBIT?

**One sentence**: ORBIT embeds cryptographic provenance into audio files, replacing trust-based claims with cryptographic proof.

**Tagline**: "The audio file IS the message."

**Key value props**:
1. **Proof at Source** — Register audio with embedded watermark + ledger entry
2. **Universal Verification** — Any platform can verify provenance instantly
3. **AI-Powered Metadata** — Auto-extract genre, mood, BPM, key, instruments
4. **B2B Transfer Protocol** — Replace DDEX with cryptographic transfers
5. **No GPU Required** — Platforms use our infrastructure

---

## Technical Context

- **API URL**: https://orbit.ohnrshyp.com (subdomain)
- **SDK Package**: `@ohnrshyp/orbit-sdk` (npm)
- **Technology**: Neural watermarking (SilentCipher), CLAP embeddings, Chromaprint fingerprinting
- **Backend**: Node.js, PostgreSQL with pgvector, AWS EC2 with GPU

---

## Documentation Files

Three documentation guides exist in the ORBIT repo at `/docs/`:

### 1. SDK Quick Start (`SDK_QUICKSTART.md`)
- **Audience**: Developers integrating ORBIT
- **Content**: Installation, authentication, all API methods, code examples
- **Route suggestion**: `/docs/quickstart` or `/docs/sdk`

### 2. Music Delivery Guide (`MUSIC_DELIVERY_GUIDE.md`)
- **Audience**: Distributors, labels, DSPs
- **Content**: Three B2B flows (Musician→Distro, Distro→DSP, Catalog Migration)
- **Route suggestion**: `/docs/music-delivery`

### 3. Content ID Guide (`CONTENT_ID_GUIDE.md`)
- **Audience**: Platform operators, rights managers
- **Content**: How ORBIT replaces Content ID/Rights Manager workflows
- **Route suggestion**: `/docs/content-id`

---

## Suggested Site Structure

```
orbit.ohnrshyp.com/
├── /                      # Landing page (hero, features, how it works)
├── /docs                  # Documentation index
│   ├── /docs/quickstart   # SDK Quick Start
│   ├── /docs/music-delivery  # Music Delivery Guide
│   └── /docs/content-id   # Content ID Guide
├── /api                   # API reference (optional, can link to docs)
└── /register              # Platform registration (contact form)
```

---

## Landing Page Content Suggestions

### Hero Section
```
ORBIT
Origin-Based Identity & Rights Transfer Protocol

The audio file IS the message.

Embed cryptographic provenance directly into audio.
Replace trust-based claims with cryptographic proof.

[Get Started] [View Documentation]
```

### Key Features Section

| Feature | Description |
|---------|-------------|
| **Neural Watermarking** | Invisible, inaudible watermarks survive compression, pitch-shifting, and format conversion |
| **Chromaprint Fingerprinting** | Exact duplicate detection across your catalog |
| **AI Metadata Extraction** | Auto-detect genre, mood, BPM, key, instruments, vocals |
| **CLAP Semantic Search** | Find covers, remixes, and similar tracks |
| **Cryptographic Signatures** | Ed25519 signatures prove chain of custody |
| **B2B Transfer Protocol** | Replace DDEX with one API call |

### How It Works Section

```
1. REGISTER
   Upload audio → ORBIT watermarks, fingerprints, and signs
   Returns: Watermarked audio + ledger entry

2. VERIFY
   Any platform checks audio → ORBIT returns full provenance
   Instant: No scanning, no claims, no disputes

3. TRANSFER
   Send to partner platform → Cryptographic handoff
   Chain extends with both signatures
```

### Code Example Section

```javascript
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

const orbit = new OrbitClient({
  apiUrl: 'https://orbit.ohnrshyp.com',
  platformId: 'your-platform',
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});

// Register new audio
const result = await orbit.register(audioBuffer, {
  title: 'Midnight Drive',
  artist: 'The Neon Collective'
}, ownerId);

// Verify any audio
const verification = await orbit.verify(audioBuffer);
if (verification.verified) {
  console.log(`Registered by ${verification.provenance.origin.platform}`);
}
```

### Platform Registration Section
```
Ready to integrate ORBIT?

Contact us to register your platform and receive API credentials.

[Email: support@ohnrshyp.com]

Platform Tiers:
- Basic: Standard rate limits
- Enterprise: Higher limits, priority support
```

---

## Design Direction

### Aesthetic
- Modern, technical, professional
- Dark theme recommended (matches developer tooling aesthetic)
- Code-forward design (syntax highlighting, terminal aesthetics)

### Color Palette Suggestions
- Primary: Deep purple or electric blue (differentiates from "AI slop" palettes)
- Accent: Bright cyan or green for CTAs
- Background: Near-black (#0a0a0a) or dark gradient

### Typography
- Monospace for code and technical terms
- Clean sans-serif for body (JetBrains Mono, Fira Code, or similar for code)
- Avoid: Inter, Roboto, Arial (too generic)

### Visual Elements
- Waveform graphics (audio context)
- Chain/link iconography (provenance/custody)
- Lock/signature icons (cryptographic security)
- Network diagrams (B2B transfers)

---

## Technical Implementation Notes

### Option A: Static Site with Markdown Rendering
- Pull markdown from ORBIT repo `/docs/` folder
- Use MDX or similar for rendering
- Pros: Always in sync with ORBIT repo
- Cons: Need build step

### Option B: Duplicate Content
- Copy markdown content into Ohnrshyp repo
- Convert to site components
- Pros: Full design control
- Cons: Must manually sync updates

### Subdomain Setup
- Route `orbit.ohnrshyp.com` to the landing page
- Can be same hosting as main Ohnrshyp site or separate

---

## API Endpoint Reference (for API page if needed)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/orbit/v1/register` | POST | Required | Register new audio |
| `/orbit/v1/verify` | POST | Optional | Verify audio provenance |
| `/orbit/v1/transfer` | POST | Required | Initiate B2B transfer |
| `/orbit/v1/accept` | POST | Required | Accept incoming transfer |
| `/orbit/v1/chain/:fingerprint` | GET | Optional | Get custody chain |
| `/orbit/v2/similar` | POST | Optional | Find similar tracks |
| `/orbit/v2/analyze` | POST | Optional | AI metadata extraction |

---

## Contact & Support

- **Email**: support@ohnrshyp.com
- **GitHub**: https://github.com/ohnrshyp/orbit
- **Issues**: https://github.com/ohnrshyp/orbit/issues

---

## Summary

The ORBIT landing page should:
1. ✅ Communicate the core value prop (proof at source, not detection after)
2. ✅ Provide quick access to all three documentation guides
3. ✅ Show code examples that demonstrate simplicity
4. ✅ Enable platform registration via contact form
5. ✅ Look professional and technical (not generic AI aesthetic)

The three documentation files in `/docs/` are verified accurate and ready to publish.

---

*Handoff created: December 24, 2025*
*Session 30 complete, Session 31 ready to begin*

