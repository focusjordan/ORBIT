# ORBIT Technical FAQ

Prepared for Rostrum Records technical review.

---

## 1. What does our team actually need to run this?

Very little. ORBIT is a hosted API. Your team installs a CLI or SDK package via npm and provides three environment variables: an API URL, a platform ID, and a private key. That's it — no database to manage, no ML infrastructure, no Python environment on your end.

Node.js 18+ is the only runtime requirement.

---

## 2. How does the integration work?

Two packages:

- **CLI** (`@ohnrshyp/orbit-cli`): Command-line automation. Point it at a folder and it handles everything.
- **SDK** (`@ohnrshyp/orbit-sdk`): Nine methods for integrating ORBIT into your own tools and dashboards.

### Basic setup

```
npm install @ohnrshyp/orbit-cli -g
orbit init --api-url <url> --platform-id <id> --private-key <key>
orbit watch /intake --command register
```

Once configured, `orbit watch` runs as a background process. Every new audio file dropped into the intake folder is automatically watermarked, fingerprinted, analyzed, and registered — no manual steps.

### Existing catalog

```
orbit batch /catalog --command register --recursive
```

### DDEX ingest

```
orbit ingest /deliveries/ern.xml --audio-dir /audio
```

Parses ERN 3.x and 4.x with full extraction of tracks, contributors, deal terms, territories, and rights lines.

---

## 3. How accurate is the AI detection?

The detection system runs a multi-signal ensemble — several independent analytical methods that each evaluate the audio from a different angle. Signals that agree reinforce each other; disagreement is weighted accordingly.

Ensemble accuracy: **95.2%** across test datasets.

The system is tuned for specificity over sensitivity — it would rather flag something for human review than silently pass an AI-generated track. Every track gets one of three outputs: `LIKELY_AI`, `REVIEW`, or `LIKELY_HUMAN`.

---

## 4. How does the catalog transfer work?

**Registration**: The seller registers their catalog. Each track is watermarked, fingerprinted, and signed with the seller's private key. A registration record is written to the ORBIT ledger.

**Transfer**: The seller initiates a transfer to your platform ID. Their private key signs the transfer request. You accept it with your private key. Both signatures are recorded — consent from both parties, cryptographically.

**Chain of title**: Each registration is cryptographically chained to the previous one. The entire provenance history — who registered it, when it transferred, and who holds it now — is immutable and verifiable at any time.

**Verification**: Run `orbit verify` against any copy of the file. ORBIT extracts the watermark, matches the fingerprint, and returns the full chain of title — even if the file has been transcoded, compressed, or re-uploaded.

---

## 5. Why does this approach matter — what does it solve that contracts and DDEX don't?

Today, catalog transfers rely on contracts, emails, and spreadsheets to establish who owned what and when. DDEX moves metadata as an XML sidecar, matched manually to audio delivered over SFTP. Ownership is asserted, not proven — and when disputes arise, resolving them means digging through filing cabinets and legal threads.

ORBIT's approach changes the foundation:

- **Consent is embedded in the record.** Both the seller's and acquirer's signatures are stored on the ledger at the moment of transfer. There's no ambiguity about whether a handoff was authorized — it either happened cryptographically or it didn't.
- **The file carries its own documentation.** Because provenance identity is embedded in the waveform via watermark, the chain of title travels with the audio — through transcoding, re-upload, format conversion, or re-distribution. You can verify ownership from any copy of the file, at any point in the future, without relying on an external system being available.
- **Disputes about delivery and ownership become verifiable questions.** "Did the seller deliver this track?" and "Do we hold rights to it?" have cryptographic answers, not just contractual ones.
- **It scales without operational overhead.** Every additional track transferred through the protocol costs the same as the first. There's no human in the loop for each transaction — at catalog scale, that's the difference between a manageable process and a bottleneck.

DDEX is still supported — `orbit ingest` parses ERN deliveries automatically. But for new acquisitions, ORBIT replaces the entire XML-plus-SFTP-plus-manual-matching workflow with a signed, verified, automated transfer.

---

## 6. How is the chain of title secured?

Private keys never leave the client. Platforms sign their own requests; ORBIT validates signatures server-side using public keys on record. Nothing is trusted implicitly — every operation requires a valid signature from the platform that owns the asset.

The ledger is tamper-proof by construction: altering any registration breaks the cryptographic chain, making tampering immediately detectable.

---

## 7. Is the watermark audible? What does it survive?

No — the watermark is inaudible. It's embedded at a signal-to-distortion ratio of approximately 48 dB, well below the threshold of human perception.

It survives:
- Lossy compression (MP3, AAC, OGG)
- Format conversion (WAV → FLAC → MP3)
- Re-upload and re-encoding
- Transcoding between sample rates

---

## 8. What happens to our existing catalog and DDEX workflows?

Nothing changes on day one. ORBIT integrates alongside your existing systems:

- **DDEX deliveries continue as-is** — `orbit ingest` parses them automatically
- **Existing catalog**: `orbit batch` processes your full library in one shot
- **New acquisitions**: Forward-deploy ORBIT to the seller. `orbit watch` automates the full pipeline
- **Gradual transition**: Labels can keep sending DDEX. ORBIT ingests it. Over time, they adopt ORBIT natively and skip the XML entirely

---

## 9. What data does ORBIT store? Do you hold our audio?

ORBIT does **not** store original audio files. The ledger holds fingerprint hashes, watermark identifiers, metadata, cryptographic signatures, and transfer records. The watermarked audio is returned to you during registration and transfer — storage is your responsibility.

---

## 10. How does ORBIT handle scale?

- **Batch processing**: Configurable concurrency. 1,000 tracks at concurrency 4 takes approximately 8–12 hours with full AI analysis, or ~3 hours for registration-only.
- **API rate limits**: Default 100 requests/minute (10/minute for compute-intensive operations). Configurable per platform.
- **The API server is stateless** — additional capacity can be added horizontally without architectural changes.

---

## 11. What are the processing time SLAs?

| Operation | Typical time |
|-----------|-------------|
| Registration + watermark (no AI detection) | 10–15 seconds |
| Fingerprint generation | < 1 second |
| Catalog identification check | 2–5 seconds |
| Full AI analysis | 2–3 minutes per track |
| Transfer initiate / accept | < 1 second |
| DDEX parse (full ERN) | < 1 second |

Full AI analysis is the compute-heavy step. Registration-only workflows are fast.

---

## 12. What if we want to verify a track we didn't register?

`orbit analyze` checks any audio file against 130M+ registered works across multiple commercial identification services to determine if it's a known recording — regardless of whether it was registered through ORBIT. If it was registered on the ORBIT network by anyone, you'll also get the full chain of title.

---

## 13. What does it cost?

| | |
|---|---|
| Setup | $1,500 one-time |
| Platform | $8,000/mo (all modules) |
| Pilot | $4,000/mo first month |

Replaces $20K+/mo across separate vendors for AI detection, audio analysis, fingerprinting, watermarking, DDEX parsing, and chain-of-title management.
