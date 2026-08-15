# ORBIT

<p align="center">
  <a href="https://github.com/focusjordan/ORBIT/actions/workflows/test.yml">
    <img src="https://github.com/focusjordan/ORBIT/actions/workflows/test.yml/badge.svg" alt="CI Status" />
  </a>
  <a href="https://www.bestpractices.dev/projects/14095">
    <img src="https://www.bestpractices.dev/projects/14095/badge" alt="OpenSSF Best Practices" />
  </a>
  <a href="https://api.scorecard.dev/projects/github.com/focusjordan/ORBIT">
    <img src="https://api.scorecard.dev/projects/github.com/focusjordan/ORBIT/badge" alt="OpenSSF Scorecard" />
  </a>
  <a href="https://slsa.dev">
    <img src="https://img.shields.io/badge/SLSA-Level%201-blue.svg?style=flat-square" alt="SLSA Level 1" />
  </a>
  <a href="https://codecov.io/gh/focusjordan/ORBIT">
    <img src="https://codecov.io/gh/focusjordan/ORBIT/branch/main/graph/badge.svg" alt="Codecov" />
  </a>
  <a href="docs/INTEGRATING_OHNRSCRIPT_INTO_ORBIT.md">
    <img src="https://img.shields.io/badge/Runtime-Ohnrscript%20DOD-ff6600.svg?style=flat-square" alt="Powered by Ohnrscript" />
  </a>
  <a href="docs/RELEASE_NOTES_v2.0.0.md">
    <img src="https://img.shields.io/badge/version-v2.0.0-blue.svg?style=flat-square" alt="Version 2.0.0" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg?style=flat-square" alt="License" />
  </a>
</p>

**Origin-Based Identity & Rights Transfer Protocol**

> 🤖 **LLM & Agent Friendly Repo**: We maintain a machine-readable directory and integration guide of this project in [llms.txt](llms.txt) to help AI assistants install our packages and leverage our systems easily.

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
| **Systems Runtime** | Ohnrscript (AOT LLVM / V8) | Zero-allocation DOD engine powering DSP, CBOR, UUIDs, and vector math |
| **Watermarking** | AudioSeal (40-bit) + PERTH (perceptual) | Embed imperceptible, tamper-resistant neural payloads into audio waveforms |
| **Fingerprinting** | Chromaprint (exact) + MERT (semantic) | Identify audio content; detect duplicates and similar works |
| **Cryptography** | Ed25519 signatures + SHA-256 / BLAKE3 hashing | Non-repudiable proof of registration and transfer |
| **Encoding** | CBOR (RFC 8949) via `@cbor` AOT | Compact binary serialization (~400 bytes vs 5-10KB XML) with zero memory churn |
| **Storage** | PostgreSQL + pgvector | Ledger with vector similarity search |
| **ML Analysis** | LAION-CLAP + MERT + Demucs | Zero-shot classification, semantic embeddings, and stem separation |

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Audio     │────▶│  Fingerprint │────▶│  AI Analysis │────▶│   Watermark  │
│    Input     │     │  (Identity)  │     │  (Metadata)  │     │ (AudioSeal)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │                     │
                            ▼                    ▼                     ▼
                     ┌─────────────────────────────────────────────────────┐
                     │                   ORBIT LEDGER                       │
                     │  • Fingerprint hash (32 bytes)                      │
                     │  • MERT embedding (768-dim vector)                  │
                     │  • Full metadata (CBOR encoded via Ohnrscript)      │
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
| Neural watermarking (AudioSeal + PERTH) | Semantic similarity search | AI metadata extraction |
| Zero-allocation Ohnrscript runtime | 2.56B audio samples/sec DSP | 75% cloud compute reduction |

---

## ⚡ Ohnrscript High-Performance Acceleration

ORBIT's core computational hot paths are powered by **Ohnrscript** (`.ohn`), an Ahead-Of-Time (AOT) compiled systems language designed around strict **Data-Oriented Design (DOD)**:

* **Zero-Allocation CBOR (`src/utils/cbor.ohn`):** 208,000 tx/sec with a 91x reduction in memory overhead (370MB down to 4MB), enabling **1 server to do the work of 4.3 servers** (75% cloud cost reduction).
* **Single-Pass Audio DSP (`src/utils/audio_dsp.ohn`):** Analyzes **2.56 Billion audio samples/sec** (16+ hours of uncompressed audio per second on a single core) via ARM NEON (`fmla.4s`) and AVX-512 vectorization.
* **Zero-Heap UUIDs (`src/utils/id.ohn`):** Generates **8.45 Million raw UUIDs/sec** with zero temporary string allocations.
* **Vector Similarity Matching (`src/utils/vector.ohn`):** Performs **1.23 Million vector comparisons/sec** for in-memory CLAP/MERT embedding searches.
* **Eliminating the AI "Host Tax":** Reduces Linux minor page faults by **270.6x** and steady-state GPU ingestion latency by **132x**, eliminating GPU data starvation.

---

## 📦 Standalone Libraries (Open-Core Workspace)

ORBIT's core engines are completely decoupled and available as standalone, lightweight packages on NPM and PyPI:

### NPM Packages (Node.js)
* **`@ohnrshyp/dsp`** — CPU-only classical feature extraction (BPM, key, loudness, duration).
  ```bash
  npm install @ohnrshyp/dsp
  ```
* **`@ohnrshyp/forensics`** — Spectral forensics, phase entropy, and manipulation detection.
  ```bash
  npm install @ohnrshyp/forensics
  ```
* **`@ohnrshyp/watermark`** — AudioSeal & PERTH neural watermarking + forensic extraction.
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
* **`orbit-watermark`** — AudioSeal & PERTH neural watermarking.
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
- 🧠 **Neural Watermarking** — AudioSeal (40-bit Meta FAIR) with PERTH (Resemble AI) fallback, featuring sub-second sample-accurate localization
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
# Clone repository
git clone https://github.com/focusjordan/ORBIT.git
cd ORBIT

# Install Node.js dependencies
npm install

# Set up Python ML environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

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
│   │   ├── audioseal.js   # Primary 40-bit neural watermarking (AudioSeal)
│   │   ├── perth.js       # Fallback perceptual watermarking (PERTH)
│   │   ├── watermark-unified.js # Unified watermark traffic controller
│   │   └── crypto.js      # Ed25519 signing, BLAKE3, CBOR encoding
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
│   │   └── metadata-extractor.js # AI metadata extraction
│   └── utils/             # Utilities (audio I/O, validation, Ohnrscript engines)
│       ├── audio_dsp.ohn  # 2.56B sample/sec DSP analysis
│       ├── cbor.ohn       # Zero-allocation CBOR serialization
│       ├── id.ohn         # Zero-heap UUID generation
│       └── vector.ohn     # High-speed vector similarity
├── tests/                 # Test suites
├── scripts/               # CLI tools (migrate, watermark, test runners)
├── requirements.txt       # Unified Python ML & Watermarking dependencies
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
| Python | 3.9+ | ML model inference (AudioSeal, PERTH, CLAP, MERT) |

### Python ML Dependencies

ORBIT uses modern PyTorch for neural watermarking and embedding inference. Install via the unified `requirements.txt`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

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

Apache 2.0

---

<div align="center">

**The audio file is the message.**

*ORBIT embeds identity into sound itself.*

</div>
