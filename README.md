# ORBIT

**Origin-Based Identity & Rights Transfer Protocol**

A novel audio provenance and metadata transfer system that embeds identity directly into audio files via algorithmic watermarking, replacing complex DDEX/XML with a simpler binary protocol.

## The Core Innovation

**The audio file IS the message.**

Unlike DDEX (where metadata travels in separate XML files) or Content ID (where fingerprints exist only in a central database), ORBIT embeds a cryptographically-signed payload directly into the audio signal. The audio carries its own identity, ownership, and transfer history wherever it travels.

## Key Features

- 🔐 **Embedded Identity** — Watermark carries ownership proof inside the audio
- 📦 **Binary Protocol** — CBOR encoding (~400 bytes vs 5-10KB DDEX XML)
- ✍️ **Cryptographic Signatures** — Ed25519 for non-repudiation
- 🔍 **Duplicate Detection** — Chromaprint fingerprinting
- 🔄 **B2B Transfers** — Verifiable chain of custody between platforms
- 🤖 **AI-Enhanced** — Zero-shot metadata extraction (v2)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev

# Verify it's running
curl http://localhost:4000/health
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orbit/v1/register` | Register new audio with metadata |
| POST | `/orbit/v1/verify` | Verify audio provenance |
| POST | `/orbit/v1/transfer` | Initiate B2B transfer |
| POST | `/orbit/v1/accept` | Accept incoming transfer |
| GET | `/orbit/v1/chain/:fp` | Get full custody chain |

## Project Structure

```
orbit/
├── src/
│   ├── index.js           # Express server entry point
│   ├── config/            # Configuration and database
│   ├── engines/           # Core engines (fingerprint, watermark, crypto)
│   ├── api/               # API routes and handlers
│   ├── ledger/            # Database models and queries
│   ├── ml/                # ML integrations (CLAP, MERT)
│   └── utils/             # Utility functions
├── tests/                 # Test suites
├── scripts/               # CLI utilities
├── sdk/                   # Publishable SDK package
└── docs/                  # Additional documentation
```

## Requirements

- Node.js 18+
- PostgreSQL 16+ with pgvector extension
- Chromaprint (`fpcalc` CLI tool)
- FFmpeg (for audio format conversion)

## Documentation

- [Technical Specification](./ORBIT_SPECIFICATION.md)
- [v2 Enhancements](./ORBIT_ENHANCEMENTS.md)
- [Implementation Roadmap](./ORBIT_ROADMAP.md)

## License

ISC

---

*The audio file is the message. Let's make it speak.*
