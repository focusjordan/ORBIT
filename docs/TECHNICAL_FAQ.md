# ORBIT Technical FAQ

Comprehensive technical questions and architectural answers for software engineers, rights administrators, DSP operators, music distributors, and enterprise platform integrators.

---

## 1. What does an organization need to run ORBIT?

ORBIT supports two operational models depending on your infrastructure requirements:

### A. Managed API Integration (Client / Edge)
* **Runtime:** Node.js 18+ or any HTTP/JSON-compatible client environment.
* **Requirements:** Install `@ohnrshyp/orbit-cli` or `@ohnrshyp/orbit-sdk` via npm and configure three environment variables:
  * `ORBIT_API_URL` — Endpoint of your ORBIT node or hosted cluster.
  * `ORBIT_PLATFORM_ID` — Your unique Ed25519-backed platform identity.
  * `ORBIT_PLATFORM_PRIVATE_KEY` — Your cryptographic signing key (never leaves your client).
* **Compute Footprint:** Minimal client CPU/memory. Audio processing, ML inference, and ledger transactions are handled by the node.

### B. Self-Hosted Full Node (On-Premises / Private Cloud)
* **Runtime:** Node.js 20+ LTS, Python 3.10+, and PostgreSQL 16+ with the `pgvector` extension.
* **Dependencies:** FFmpeg (`ffmpeg`) and Chromaprint (`fpcalc`) for acoustic fingerprinting.
* **GPU Acceleration (Optional):** NVIDIA CUDA or Apple Silicon MPS for accelerated PyTorch 2.0+ neural audio watermarking and ML inference.
* **Docker Deployment:** Complete single-command orchestration via `docker compose up -d`.

---

## 2. How does platform integration work?

ORBIT provides two official client interfaces for integrating with audio pipelines and internal tooling:

* **CLI (`@ohnrshyp/orbit-cli`):** High-throughput automation and terminal tooling designed for server jobs, watch folders, and CI/CD pipelines.
* **SDK (`@ohnrshyp/orbit-sdk`):** Type-safe JavaScript/TypeScript library for embedding registration, verification, transfers, and metadata queries into internal dashboards and web applications.

### Watch Folder Automation
```bash
npm install -g @ohnrshyp/orbit-cli
orbit init --api-url https://orbit.yourdomain.com --platform-id <id> --private-key <key>
orbit watch /intake --command register
```
`orbit watch` runs as a persistent background daemon. Every incoming audio master dropped into the monitored directory is automatically watermarked, fingerprinted, analyzed for AI signals, and registered to the cryptographic ledger with zero manual intervention.

### Bulk Catalog Ingestion
```bash
orbit batch /catalog --command register --recursive
```

### Supply-Chain DDEX Ingestion
```bash
orbit ingest /deliveries/ern.xml --audio-dir /audio
```
Parses DDEX ERN 3.x and 4.x XML delivery suites, automatically extracting multi-track packages, contributors, ISRC/ISWC identifiers, deal territories, rights lines, and associated media assets.

---

## 3. How does AI music detection work and how accurate is it?

ORBIT employs a multi-signal ensemble architecture that evaluates audio across multiple independent forensic, acoustic, and cryptographic dimensions:

* **Spectral & Acoustic Forensics:** High-frequency phase entropy analysis, stereo correlation anomalies, repetition periodicity, and dynamic range quantization typical of diffusion/autoregressive models.
* **Deep Neural Embeddings:** CLAP and MERT latent representations comparing structural audio features against synthetic and human-composed training distributions.
* **OpenAI Content Provenance (SynthID & C2PA):** Native checks for imperceptible SynthID neural watermarks embedded in OpenAI audio generation models and cryptographic C2PA provenance credentials.

### Accuracy & Classification Output
* **Ensemble Accuracy:** **95.2%+** across comprehensive benchmark validation datasets.
* **Deterministic Flags:** Detection of cryptographic C2PA manifests or verified SynthID watermarks immediately locks the score floor to `1.0` (`LIKELY_AI`).
* **Advisory Outputs:** Every analyzed track receives an actionable status:
  * `LIKELY_HUMAN` — No synthetic anomalies or provenance signatures detected.
  * `REVIEW` — Marginal anomalies detected; flagged for human editorial or legal review.
  * `LIKELY_AI` — High-confidence synthetic acoustic patterns or positive provenance matches identified.

---

## 4. How does cryptographic catalog transfer work?

ORBIT replaces email threads, PDF agreements, and manual SFTP matching with dual-signed cryptographic transfers:

1. **Registration:** The originating rights holder registers the master. The audio is embedded with a neural watermark, fingerprinted, and signed using their Ed25519 private key. The record is committed to the ledger.
2. **Transfer Initiation:** The seller initiates a transfer specifying the recipient's platform ID. The transfer payload is signed with the seller's private key.
3. **Acceptance:** The acquiring platform accepts the transfer using their private key. The ledger cryptographically validates and records both signatures, guaranteeing non-repudiable consent.
4. **Chain of Title:** Each registration points to the cryptographic hash of the preceding record. The complete ownership lineage — original registrant, transfer dates, and current holder — is immutable and publicly or privately verifiable.
5. **Verification:** Running `orbit verify` on any copy of the file extracts the embedded watermark, matches the acoustic fingerprint, and returns the authenticated chain of title.

---

## 5. What problems does ORBIT solve over traditional DDEX and contracts?

Modern catalog management and asset delivery rely on disconnected contracts, spreadsheets, and metadata XML files separated from the actual media files:

| Challenge | Traditional Industry Approach | ORBIT Protocol Approach |
| :--- | :--- | :--- |
| **Proof of Authorization** | Dispersed PDF contracts and email chains | **Cryptographic Dual-Consent:** Transfers require Ed25519 signatures from both parties on-chain |
| **Transcoded / Re-uploaded Assets** | Lost metadata sidecars; requires manual rematching | **Embedded Waveform Provenance:** Watermarks survive compression, format conversion, and streaming distribution |
| **Dispute Resolution** | Lengthy legal investigations into delivery records | **Instant Cryptographic Verification:** Direct verification from any copy of the audio file |
| **Scalability** | Manual QA per delivery; operational bottlenecks | **Automated Zero-Touch Pipelines:** Constant-time verification regardless of catalog volume |

DDEX remains fully supported via `orbit ingest`, but ORBIT anchors the DDEX metadata directly into the audio waveform.

---

## 6. How is the cryptographic chain of title secured?

* **Zero-Knowledge Private Key Management:** Private keys are generated client-side via Ed25519 and never transmitted over the network.
* **Server-Side Signature Validation:** The node verifies each request against the public key registered to the platform ID.
* **Tamper-Evident Ledger:** Transaction payloads are encoded via zero-allocation RFC 8949 CBOR and hashed using BLAKE3. Modifying any historical entry breaks the hash chain and invalidates downstream signatures immediately.

---

## 7. Is the watermark audible? What distortions does it survive?

The neural watermark is psychoacoustically inaudible, operating at a Signal-to-Distortion Ratio (**SDR $\ge 34$–$48$ dB**), well below the threshold of human hearing.

### Survival Characteristics
* **Lossy Compression:** Survives MP3 (down to 96 kbps), AAC, OGG, and Opus encoding.
* **Transcoding & Conversions:** Resilient across sample-rate resampling (44.1 kHz $\leftrightarrow$ 48 kHz $\leftrightarrow$ 96 kHz) and bit-depth changes (24-bit $\rightarrow$ 16-bit).
* **Acoustic Distortions:** Robust against bandpass filtering, modest pitch-shifting, time-stretching, and analog-to-digital re-recording.

---

## 8. What data does ORBIT store? Is proprietary audio retained?

**ORBIT does not store master audio files.** 

The ledger stores only:
* Acoustic fingerprint hashes (Chromaprint/AcoustID vectors).
* Neural embedding vectors (512-dimensional CLAP/MERT vectors in `pgvector`).
* Watermark payload identifiers (40-bit tokens).
* Track and contributor metadata.
* Cryptographic public keys and Ed25519 signatures.

The watermarked master file is returned directly to the client upon registration; storage and asset distribution remain under the rights holder's control.

---

## 9. How does ORBIT handle enterprise scale and throughput?

* **High-Performance DOD Runtime (Ohnrscript):**
  * **CBOR Serialization:** Up to **208,000 tx/sec** with zero-heap allocation overhead.
  * **Audio DSP Streaming:** **2.56 Billion samples/sec** single-core processing via ARM NEON and AVX-512 vectorization.
  * **Vector Similarity Matching:** Over **1.23 Million vector comparisons/sec** in memory for neural catalog deduplication.
* **Stateless API Clustering:** Nodes scale horizontally behind load balancers with shared PostgreSQL read-replicas.
* **Configurable Batch Concurrency:** CLI batch workers adjust concurrency dynamically to maximize multi-core CPU and GPU utilization.

---

## 10. What are the typical processing SLAs?

| Operation | Typical Latency | Notes |
| :--- | :--- | :--- |
| **Fingerprint Generation** | $< 500$ ms | Single-pass Chromaprint extraction |
| **Acoustic Catalog Lookup** | $1$–$3$ sec | Vector similarity check via `pgvector` |
| **Watermark Embedding (AudioSeal)** | $3$–$8$ sec | PyTorch neural generator pass |
| **OpenAI Provenance Check** | $1$–$3$ sec | SynthID and C2PA API verification |
| **Full Forensic & AI Analysis** | $30$–$90$ sec | Comprehensive multi-signal neural ensemble |
| **Ledger Registration / Transfer** | $< 100$ ms | Fast CBOR serialization and Ed25519 verification |
| **DDEX ERN Ingest** | $< 1$ sec | XML parsing and relational structure mapping |

---

## 11. Can ORBIT verify audio registered by external parties?

Yes. `orbit verify` and `orbit analyze` inspect incoming audio against all registered fingerprints and watermark payloads on the network. 

If the track was registered by any authorized platform, ORBIT resolves the public key, returns the verified chain of title, and outputs all embedded metadata. If the track is unregistered, ORBIT performs commercial database matching (covering 130M+ commercial works) to identify known releases.

---

## 12. Licensing and Deployment Models

* **Open Source Core (Apache-2.0):** The ORBIT core protocol, server node, modular NPM packages (`@ohnrshyp/*`), Python ML engines, and CLI are fully open source under the Apache 2.0 license for self-hosting and private deployments.
* **Enterprise & Managed Cloud:** High-availability managed nodes, SLA-backed hosted infrastructure, dedicated GPU clustering, and custom rights-management workflows are available for enterprise DSPs, aggregators, and major catalogs.
