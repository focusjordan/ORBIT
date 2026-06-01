# ORBIT

**Origin-Based Identity & Rights Transfer Protocol**

A next-generation audio provenance system that embeds identity, ownership, and AI-extracted metadata directly into audio files — enabling cryptographic proof of origin across any platform.

---

## 🎯 What is ORBIT? (Simple Explanation)

**The Problem:**  
When you send a music file to someone, how do they know who made it? Today, that information lives in separate files (like spreadsheets or XML documents) that can get lost, corrupted, or faked. Streaming platforms, record labels, and distributors all have different systems that don't talk to each other.

**The Solution:**  
ORBIT hides a tiny, inaudible "digital signature" inside the actual audio — like an invisible watermark. This signature contains:
- Who created the track
- When it was registered
- Where it came from
- Every platform it's been transferred to

**What This Means:**
- 📤 **Send a song anywhere** — the proof of ownership travels with it
- 🔍 **Verify any audio file** — instantly know if it's registered and who owns it
- 🚫 **Catch duplicates** — detect if someone uploads a song that already exists
- 🤝 **Transfer between platforms** — with cryptographic proof both parties agreed
- 🤖 **Auto-extract metadata** — AI identifies genre, mood, tempo, instruments automatically

**The Big Picture:**  
Think of it like a passport for audio files. The "stamp" is invisible, survives compression (like converting to MP3), and can be verified by anyone with the right tools — but only the original owner could have created it.

---

## 🔬 Technical Overview (For Developers)

ORBIT is a protocol combining **audio steganography**, **cryptographic signing**, and **neural audio analysis** to create a comprehensive audio provenance system.

### Core Architecture

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Fingerprinting** | Chromaprint (exact) + MERT (semantic) | Identify audio content; detect duplicates and similar works |
| **Watermarking** | Spread spectrum (v1) → SilentCipher/WMCodec (v2) | Embed 64-byte payload into audio signal imperceptibly |
| **Cryptography** | Ed25519 signatures + SHA-256 hashing | Non-repudiable proof of registration and transfer |
| **Encoding** | CBOR (RFC 8949) | Compact binary serialization (~400 bytes vs 5-10KB XML) |
| **Storage** | PostgreSQL + pgvector | Ledger with vector similarity search |
| **ML Analysis** | LAION-CLAP + MERT | Zero-shot classification, semantic embeddings |

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Audio     │────▶│  Fingerprint │────▶│  AI Analysis │────▶│   Watermark  │
│    Input     │     │  (Identity)  │     │  (Metadata)  │     │   (Embed)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │                     │
                            ▼                    ▼                     ▼
                     ┌─────────────────────────────────────────────────────┐
                     │                   ORBIT LEDGER                       │
                     │  • Fingerprint hash (32 bytes)                      │
                     │  • MERT embedding (768-dim vector)                  │
                     │  • Full metadata (CBOR encoded)                     │
                     │  • Ed25519 signature (64 bytes)                     │
                     │  • AI-extracted: genre, mood, BPM, key, instruments │
                     │  • Chain of custody (append-only)                   │
                     └─────────────────────────────────────────────────────┘
```

### Key Technical Differentiators

| vs. DDEX | vs. Content ID | vs. ISRC |
|----------|----------------|----------|
| Binary (CBOR) not XML | Open API, multi-platform | Embedded, not strippable |
| Embedded in audio | B2B transfer protocol | Cryptographic proof |
| Cryptographic signatures | Self-hosted option | Chain of custody |
| Neural watermarking (99%+ survival) | Semantic similarity search | AI metadata extraction |

---

## 📦 Standalone Libraries (Open-Core Workspace)

ORBIT's core engines are completely decoupled and available as standalone, lightweight packages on NPM and PyPI. You can install and run them locally in your own applications for free:

### NPM Packages (Node.js)
* **`@ohnrshyp/dsp`** — CPU-only classical feature extraction (BPM, key, loudness, duration).
  ```bash
  npm install @ohnrshyp/dsp
  ```
* **`@ohnrshyp/forensics`** — Spectral forensics, phase entropy, and manipulation detection.
  ```bash
  npm install @ohnrshyp/forensics
  ```
* **`@ohnrshyp/watermark`** — SilentCipher neural watermark & Spread Spectrum embedding/extraction.
  ```bash
  npm install @ohnrshyp/watermark
  ```
* **`@ohnrshyp/ledger`** — CBOR encoding, Ed25519 signing, and pgvector database matching queries.
  ```bash
  npm install @ohnrshyp/ledger
  ```
* **`@ohnrshyp/metadata`** — Dynamic, lazy-loaded AI audio metadata tagger (LAION-CLAP, PANNs, Demucs).
  ```bash
  npm install @ohnrshyp/metadata
  ```

### PyPI Packages (Python)
* **`orbit-dsp`** — CPU-only feature extraction (BPM, key, loudness, duration).
  ```bash
  pip install orbit-dsp
  ```
* **`orbit-forensics`** — Spectral forensics, phase entropy, and manipulation checks.
  ```bash
  pip install orbit-forensics
  ```
* **`orbit-watermark`** — SilentCipher neural watermarking & Spread Spectrum.
  ```bash
  pip install orbit-watermark
  ```

---

## ✨ Full Feature Set

### Core Protocol (v1)
- 🔐 **Embedded Identity** — Watermark carries ownership proof inside the audio signal
- 📦 **Binary Protocol** — CBOR encoding (~400 bytes vs 5-10KB DDEX XML)
- ✍️ **Cryptographic Signatures** — Ed25519 signing for non-repudiation
- 🔍 **Duplicate Detection** — Chromaprint fingerprinting identifies exact matches
- 🔄 **B2B Transfers** — Verifiable chain of custody between platforms
- 📜 **Provenance Ledger** — Append-only PostgreSQL record with Merkle proofs

### Neural Enhancements (v2)
- 🧠 **Neural Watermarking** — SilentCipher + WMCodec with 99%+ extraction accuracy on compressed audio
- 🎵 **Semantic Fingerprinting** — MERT embeddings survive pitch shift, time stretch, and enable similarity search
- 🏷️ **Auto-Metadata Extraction** — Zero-shot AI extracts genre, mood, BPM, key, instruments, vocals
- 🔗 **Content Relationship Detection** — Identify covers, remixes, mashups, and stylistically similar works
- 🔎 **Similarity Search** — "Find songs that sound like this" via vector search
- 📊 **Confidence Scoring** — All AI outputs include reliability scores

### Platform Integration
- 🔌 **Simple REST API** — 5 core endpoints for full functionality
- 📦 **Standalone Libraries** — 5 separate scoped NPM packages and 3 PyPI modules for modular integration
- 🪝 **Middleware** — Drop-in Express middleware for upload pipelines
- 🏢 **Multi-Tenant** — Platform registration with API keys and rate limiting
- 💰 **Licensable Tiers** — Verification-only (free open-core libraries) to white-label (self-hosted)

---

## 🚀 API Endpoints

### V1 Core Protocol

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orbit/v1/register` | Register audio with metadata, returns watermarked file |
| POST | `/orbit/v1/verify` | Verify provenance, extract metadata, check for duplicates |
| POST | `/orbit/v1/transfer` | Initiate B2B transfer to another platform |
| POST | `/orbit/v1/accept` | Accept incoming transfer, extends chain of custody |
| GET | `/orbit/v1/chain/:fp` | Get full custody chain for a fingerprint |

### V2 Enhanced Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orbit/v2/similar` | Find similar-sounding registered tracks |
| POST | `/orbit/v2/analyze` | Standalone AI analysis without registration |

---

## 📦 Quick Start

```bash
# Clone and install
git clone https://github.com/focusjordan/ORBIT.git
cd ORBIT
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Start PostgreSQL (via Docker)
docker-compose up -d

# Run database migrations
npm run migrate

# Start development server
npm run dev

# Verify it's running
curl http://localhost:4000/health
curl http://localhost:4000/orbit/v1/info
```

---

## 🏗️ Project Structure

```
orbit/
├── packages/              # Standalone open-source monorepo packages
│   ├── dsp/               # @ohnrshyp/dsp classical analysis (NPM & PyPI)
│   ├── forensics/         # @ohnrshyp/forensics signal forensics (NPM & PyPI)
│   ├── watermark/         # @ohnrshyp/watermark neural watermarking (NPM & PyPI)
│   ├── ledger/            # @ohnrshyp/ledger crypto and db queries (NPM)
│   └── metadata/          # @ohnrshyp/metadata lazy-loaded AI tagger (NPM)
├── src/                   # Core platform server code (Private Dashboard & APIs)
│   ├── index.js           # Express server entry point
│   ├── config/            # Configuration and database connection
│   ├── engines/           # Core engines
│   │   ├── fingerprint.js # Chromaprint + MERT fingerprinting
│   │   ├── watermark.js   # Spread spectrum + neural watermarking
│   │   └── crypto.js      # Ed25519 signing, CBOR encoding
│   ├── api/               # REST API layer
│   │   ├── routes.js      # Route definitions
│   │   ├── handlers/      # Endpoint implementations
│   │   └── middleware/    # Auth, CBOR parsing, rate limiting
│   ├── ledger/            # Database layer
│   │   ├── models.js      # PostgreSQL schema
│   │   └── queries.js     # Fingerprint/registration queries
│   ├── ml/                # Machine learning integrations
│   │   ├── clap.js        # LAION-CLAP zero-shot classification
│   │   ├── mert.js        # MERT semantic embeddings
│   │   └── silentcipher.js # Neural watermarking
│   └── utils/             # Utilities (audio I/O, validation)
├── tests/                 # Test suites
├── scripts/               # CLI tools (migrate, package-all, generate-keypair)
└── docker-compose.yml     # PostgreSQL + pgvector
```

---

## 📋 Requirements

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| PostgreSQL | 16+ | Ledger database |
| pgvector | 0.5+ | Vector similarity search |
| Chromaprint | Any | Audio fingerprinting (`fpcalc` CLI) |
| FFmpeg | Any | Audio format conversion |
| Docker | Optional | Containerized PostgreSQL |
| Python | 3.8+ | ML model inference |

### Python ML Dependencies

ORBIT uses Python for ML features. Two virtual environments are recommended due to torch version conflicts:

```bash
# Main venv (CLAP, audio analysis, etc.) - torch 2.9+
python -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements-ml.txt

# SilentCipher venv (neural watermarking) - requires torch<=2.0.0
python -m venv .venv-watermark
source .venv-watermark/bin/activate
pip install torch==2.0.0 silentcipher librosa soundfile numpy
```

Set the environment variable to point to the watermark venv:
```bash
export ORBIT_SILENTCIPHER_PYTHON=/path/to/ORBIT/.venv-watermark/bin/python3
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Technical Specification](./ORBIT_SPECIFICATION.md) | Complete v1 architecture, API specs, code examples |
| [v2 Enhancements](./ORBIT_ENHANCEMENTS.md) | Neural watermarking, MERT, CLAP, similarity search |
| [Implementation Roadmap](./ORBIT_ROADMAP.md) | Session-by-session build guide with status tracking |

---

## 🎯 Use Cases

**For Music Platforms:**
- Verify uploaded content isn't stolen
- Auto-populate metadata from AI analysis
- Track content as it moves between services

**For Record Labels:**
- Prove ownership with cryptographic signatures
- Detect unauthorized copies across platforms
- Maintain chain of custody for licensing

**For Artists:**
- Register works with embedded proof of creation
- Find where your music has been distributed
- Detect covers, remixes, and samples of your work

**For Distributors:**
- Replace DDEX XML with lightweight binary protocol
- Verify incoming content before distribution
- Transfer verified content to partners with proof

---

## 📄 License

ISC

---

<div align="center">

**The audio file is the message.**

*ORBIT embeds identity into sound itself.*

</div>
