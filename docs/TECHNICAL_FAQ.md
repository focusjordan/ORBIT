# ORBIT Technical FAQ

Prepared for Rostrum Records technical review.

---

## 1. What is ORBIT?

ORBIT (Origin-Based Identity & Rights Transfer Protocol) is a catalog acquisition and distribution intelligence platform. Forward-deploy it to any catalog you're acquiring — the CLI handles everything: screens for AI-generated content, verifies against 130M+ references, enriches metadata, watermarks every track, and cryptographically transfers custody to your platform. Automated, end-to-end.

---

## 2. How do we integrate ORBIT?

Two packages, both Node 18+:

- **CLI** (`@ohnrshyp/orbit-cli`): Command-line automation. Point at a folder, ORBIT processes everything.
- **SDK** (`@ohnrshyp/orbit-sdk`): 9 methods for integrating into your own tools and dashboards.

### Setup (under 10 minutes)

```
npm install @ohnrshyp/orbit-cli -g
orbit init --api-url <url> --platform-id <id> --private-key <key>
orbit watch /intake --command register
```

That's it. ORBIT polls the intake folder, and every new audio file is watermarked, fingerprinted, analyzed, and registered automatically.

### Batch processing an existing catalog

```
orbit batch /catalog --command register --recursive
```

### DDEX ingest (backwards compatibility)

```
orbit ingest /deliveries/ern.xml --audio-dir /audio
```

Parses ERN 3.x and 4.x. Extracts tracks, metadata, deal terms, territories, contributors — registers everything through ORBIT.

### Dashboard integration

The SDK exposes: `register`, `verify`, `transfer`, `acceptTransfer`, `getChain`, `analyze`, `similar`, `listRegistrations`, `listPendingTransfers`. Every method returns structured JSON. A developer (or a coding agent like Cursor) can wire ORBIT into existing dashboards in hours.

---

## 3. What ML models does ORBIT use?

### AI Music Detection (5-signal ensemble)

| Signal | Model | What it does |
|--------|-------|-------------|
| Semantic Probe | CLAP (`Xenova/clap-htsat-unfused`) | Zero-shot audio-text similarity. Compares audio against AI artifact descriptions. Runs in Node.js via Transformers.js. |
| Spectral Forensics | Librosa (Python) | 20+ spectral checks: phase coherence, checkerboard artifacts, energy arc, onset regularity, tempo stability, M/S phase anomalies, noise floor structure, spectral flux, and more. |
| Metadata Intelligence | Rule-based + MiniLM embeddings | Scans metadata for AI indicators: blank albums, missing contributors, AI tags in comments, typical AI durations. |
| Catalog Provenance | AcoustID + ACRCloud + MusicBrainz | Cross-references against 130M+ registered works. No match = consistent with AI-generated content. |
| SONICS SpecTTTra | HuggingFace (`awsaf49/sonics-spectttra-*`) | Neural classifier trained to distinguish synthetic vs. real audio. Multiple model variants (alpha, beta, gamma). Runs as Python subprocess with GPU support. |

These five signals are weighted and aggregated into a single score with a recommendation: `LIKELY_AI`, `REVIEW`, or `LIKELY_HUMAN`.

### Audio Analysis & Metadata Enrichment

| Capability | Model / Method |
|-----------|---------------|
| Genre classification | PANNs (Cnn14, trained on AudioSet) — primary. wav2vec2 (`m3hrdadfi/wav2vec2-base-100k-gtzan-music-genres`) — corroboration. |
| Mood / tags | CLAP zero-shot classification against mood/tag label sets |
| BPM | Librosa `beat_track` + tempogram analysis |
| Key | Chroma CQT + Krumhansl-Schmuckler key profiles |
| Instruments | PANNs top-K AudioSet tags, filtered to instrument categories |
| Vocals | CLAP zero-shot vocal detection |
| Energy / Loudness | Librosa RMS, LUFS approximation, dynamic range |
| Danceability | Composite of beat regularity, energy distribution, onset patterns |

### Catalog Intelligence (fingerprinting & verification)

| Service | What it does |
|---------|-------------|
| Chromaprint / AcoustID | Audio fingerprint generation (SHA-256 hash). Lookup against AcoustID's 130M+ recording database. |
| ACRCloud | Commercial audio identification. HMAC-SHA1 authenticated. Identifies known recordings within seconds. |
| MusicBrainz | Open music metadata. Queried for artist, release, and ISRC data after AcoustID match. |

### Neural Watermarking

| Component | Detail |
|-----------|--------|
| Primary | Sony SilentCipher — neural watermark. 5-byte (40-bit) message embedded in the waveform at 44.1kHz. Survives transcoding, re-upload, and format conversion. |
| Fallback | Spread-spectrum watermark for environments where neural embedding isn't available. |
| SDR | Typical signal-to-distortion ratio: ~48 dB (inaudible). |

---

## 4. How does the catalog transfer actually work?

This is the core of ORBIT — replacing DDEX as the way music moves between platforms.

### The flow

**Step 1 — Seller registers their catalog**

The seller (or ORBIT on their behalf via `orbit watch` / `orbit batch`) registers every track. Each registration:
- Embeds a neural watermark carrying provenance identity
- Generates a Chromaprint fingerprint (SHA-256 hash)
- Signs the registration with the seller's Ed25519 private key
- Records everything on the ORBIT ledger

**Step 2 — Seller initiates transfer**

```
orbit transfer <registration-id> --to <acquirer-platform-id>
```

The seller's private key signs the transfer request. ORBIT verifies ownership and creates a pending transfer record.

**Step 3 — Acquirer accepts**

```
orbit accept <transfer-id> --output ./received/track.wav
```

The acquirer's private key signs the acceptance. ORBIT:
- Creates a new registration under the acquirer's identity
- Chains it cryptographically to the original (entry hash links to previous)
- Returns the watermarked audio file
- Both signatures (seller's and acquirer's) are stored as proof of consent

**Step 4 — Verification (anytime, anywhere)**

```
orbit verify <any-copy-of-the-file>
```

Extracts the watermark, matches the fingerprint, and returns the full chain of title — who registered it, when it transferred, and who owns it now.

### What makes this different from DDEX

| | DDEX | ORBIT |
|---|------|-------|
| Metadata delivery | XML sidecar sent separately from audio | Signed on the ledger, embedded in the waveform |
| Audio delivery | SFTP file drop, manually matched to XML | API-based transfer, audio and metadata move together |
| Chain of title | Spreadsheets, email threads | Ed25519 cryptographic signatures, immutable chain |
| Verification | Trust-based | Extract watermark from any copy, verify against ledger |
| AI screening | Not included | Built-in 5-signal detection on every registration |
| Metadata enrichment | Manual entry | Automated: genre, mood, BPM, key, instruments from audio |

ORBIT's DDEX parser (`orbit ingest`) exists as a backwards-compatibility layer so existing workflows don't break during transition.

---

## 5. What cryptography does ORBIT use?

| Component | Implementation |
|-----------|---------------|
| Signatures | Ed25519 via `tweetnacl`. 32-byte public keys, 64-byte private keys, 64-byte signatures. |
| Hashing | SHA-256 (Node.js `crypto` module) for fingerprints, entry hashes, and API keys. |
| Payload encoding | CBOR (Concise Binary Object Representation) for metadata payloads. |
| Entry hash chain | Each registration's entry hash = `SHA-256(previous_entry_hash + CBOR(fingerprint, platform, timestamp, payload))`. Genesis entries chain from 32 zero bytes. Tamper-proof — changing any entry breaks the chain. |
| API authentication | Platform ID + Ed25519 signature on every request. Optional API key (32 random bytes, base64url). |

Private keys never leave the client. Platforms sign their own requests. The server validates signatures using public keys from the database.

---

## 6. What infrastructure is required?

### For API clients (labels, distributors, DSPs)

- Node.js 18+
- `npm install @ohnrshyp/orbit-cli -g` and/or `@ohnrshyp/orbit-sdk`
- 3 environment variables: API URL, platform ID, private key
- No GPU, no database, no Python — ORBIT is a hosted API

### ORBIT server (hosted by Ohnrshyp)

- Express 5.x on Node.js 18+
- PostgreSQL 16 with pgvector extension (vector similarity for audio embeddings)
- Python 3.8+ with PyTorch for ML models
- GPU optional but recommended (CUDA support for SONICS, wav2vec2, SilentCipher)
- Currently deployed on AWS EC2

---

## 7. What DDEX versions are supported?

ERN 3.x and 4.x (including 4.3). The parser handles `NewReleaseMessage` with full extraction of:
- Sound recordings (title, artist, ISRC, duration, genre, language, parental advisory)
- Contributors (composers, lyricists, producers, writers)
- Technical specs (codec, sample rate, bit depth, channels)
- Release metadata (album title, UPC, label, catalog number, release type)
- Deal terms (commercial model, usage type, territory, dates)
- Rights lines (P-line, C-line)
- Territory restrictions

---

## 8. How accurate is the AI detection?

The 5-signal ensemble achieves 95.2% corpus accuracy across test datasets. Each signal contributes independently:

- **Semantic Probe**: Detects AI-characteristic audio patterns via CLAP embeddings
- **Spectral Forensics**: Catches artifacts that AI generators leave in the frequency domain (checkerboard patterns, phase coherence anomalies, unnatural energy arcs)
- **Metadata Intelligence**: Flags missing contributors, blank albums, AI tags, and typical AI durations — these alone can push confidence to 90%+ when present
- **Catalog Provenance**: If a track has no match in 130M+ registered works, that's a signal
- **SONICS**: Neural classifier specifically trained on synthetic vs. real audio

Signals that agree reinforce each other. Signals that disagree are weighted accordingly. The system favors specificity over sensitivity — it would rather flag something for review than miss an AI track.

---

## 9. How long does processing take?

| Operation | Typical time |
|-----------|-------------|
| Full analysis (all modules) | 2–3 minutes per track (on GPU) |
| Registration + watermark (no AI detection) | 10–15 seconds |
| Fingerprint generation | < 1 second |
| Catalog check (AcoustID + ACRCloud + MusicBrainz) | 2–5 seconds |
| Transfer initiate | < 1 second |
| Transfer accept | < 1 second |
| DDEX parse (full ERN) | < 1 second |
| Batch processing | Configurable concurrency. 1,000 tracks at concurrency 4 ≈ 8–12 hours with full analysis, or ~3 hours registration-only. |

Processing time scales with GPU capacity. Upgrading from a single T4 to an A10G or A100 significantly reduces ML inference time.

---

## 10. What happens to our existing catalog?

Nothing changes on day one. ORBIT integrates alongside your existing systems:

1. **DDEX deliveries continue as-is** — `orbit ingest` parses them automatically
2. **Existing catalog**: `orbit batch /catalog --command register --recursive` processes your entire library
3. **New acquisitions**: Forward-deploy ORBIT to the seller. `orbit watch` automates the full pipeline.
4. **Gradual transition**: Labels you work with can keep sending DDEX. ORBIT ingests it. Over time, they adopt ORBIT natively and skip the XML entirely.

---

## 11. Is the watermark audible?

No. Sony SilentCipher operates at approximately 48 dB SDR (signal-to-distortion ratio). This is well below the threshold of human perception. The watermark survives:
- Lossy compression (MP3, AAC, OGG)
- Format conversion (WAV → FLAC → MP3)
- Re-upload and re-encoding
- Transcoding between sample rates

---

## 12. Can ORBIT verify a track we didn't register?

Yes, partially:
- **Fingerprint verification**: `orbit verify` generates a Chromaprint fingerprint and checks it against all ORBIT registrations. If the track was registered by anyone on the network, you'll get the chain of title.
- **Watermark extraction**: If the track was watermarked through ORBIT, the watermark is extractable from any copy — even transcoded or compressed versions.
- **Catalog intelligence**: Even without prior registration, `orbit analyze` checks against AcoustID (130M+ recordings), ACRCloud, and MusicBrainz to identify known works.

---

## 13. How does ORBIT handle scale?

- **CLI automation**: `orbit watch` runs as a daemon, polling for new files. `orbit batch` handles one-shot processing with configurable concurrency.
- **API rate limits**: Default 100 requests/minute, 10/minute for GPU-intensive operations. Configurable per platform.
- **Database**: PostgreSQL with pgvector. Vector similarity search (512-dim CLAP embeddings) for duplicate detection and similar-track queries.
- **Horizontal scaling**: ML inference can be distributed across multiple GPU instances. The API server is stateless — add instances behind a load balancer.

---

## 14. What data does ORBIT store?

ORBIT's ledger stores:
- Fingerprint hash (SHA-256 of Chromaprint)
- Watermark hash
- Metadata (title, artist, ISRC, UPC, duration, genre, etc.)
- Audio embeddings (512-dim CLAP, 384-dim MiniLM for metadata)
- Ed25519 signatures
- Entry hashes (chained)
- Transfer records (from_platform, to_platform, signatures, timestamps)

ORBIT does **not** store the original audio files long-term. The watermarked audio is returned to the caller during registration and transfer — storage is the platform's responsibility.

---

## 15. What does it cost?

| | |
|---|---|
| Setup | $1,500 one-time |
| Platform | $8,000/mo (all six modules) |
| Pilot | $4,000/mo first month |

Replaces $20K+/mo in separate vendors + headcount across AI detection, audio analysis, fingerprinting, watermarking, DDEX parsing, and chain-of-title management.
