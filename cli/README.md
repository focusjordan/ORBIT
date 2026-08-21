# @ohnrshyp/orbit-cli

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
  <a href="https://www.npmjs.com/package/@ohnrshyp/orbit-cli">
    <img src="https://img.shields.io/npm/v/@ohnrshyp/orbit-cli.svg?style=flat-square" alt="npm version" />
  </a>
  <a href="https://github.com/focusjordan/ORBIT/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg?style=flat-square" alt="License" />
  </a>
</p>

**Command-Line Interface & Agent Automation Tool for the ORBIT Audio Provenance Protocol.**

The ORBIT CLI enables developers, audio engineers, and automated agents to register, verify, transfer, detect, and analyze audio assets from the terminal.

---

## 📦 Installation

```bash
npm install -g @ohnrshyp/orbit-cli
```

Or run via `npx`:
```bash
npx @ohnrshyp/orbit-cli --help
```

---

## 🚀 Quick Start

### 1. Diagnose Environment Health
```bash
orbit doctor
```

### 2. Register Audio Asset
Embeds an inaudible watermark, creates cryptographic signatures, and registers origin:
```bash
orbit register track.wav --title "Midnight Drive" --artist "The Neon Collective"
```

### 3. Verify Audio Provenance
Extracts the watermark, queries the ledger, and validates the cryptographic custody chain:
```bash
orbit verify track.orbit.wav
```

### 4. Standalone Audio Analysis & AI Detection
```bash
orbit analyze track.mp3 --include genre,mood,bpm,key,ai_detection,openai_provenance
```

### 5. Multi-Signal AI Audio Detection
```bash
orbit detect track.mp3
```

---

## 🛠️ Command Summary

| Command | Description |
|---|---|
| `orbit doctor` | Diagnose environment, Python venv, and binary dependencies |
| `orbit init` | Initialize local workspace configuration (`.orbitrc.json`) |
| `orbit keygen` | Generate Ed25519 platform cryptographic keypairs |
| `orbit register <file>` | Register audio with provenance, metadata, and watermarking |
| `orbit verify <file>` | Verify audio origin, watermark, and chain integrity |
| `orbit transfer <id>` | Initiate a B2B ownership/custody transfer to another platform |
| `orbit accept <id>` | Accept an inbound transfer with cryptographic counter-signature |
| `orbit chain <hash>` | Retrieve full provenance custody chain & Merkle proofs |
| `orbit analyze <file>` | Standalone audio metadata extraction & ML analysis |
| `orbit detect <file>` | Multi-signal AI generation detection (SynthID, acoustic anomalies) |
| `orbit similar <file>` | Find similar-sounding tracks via CLAP vector embeddings |
| `orbit batch <dir>` | Batch process directories of audio files |

---

## 📄 License

Licensed under the Apache License, Version 2.0 (the "License"). See [LICENSE](../../LICENSE) in the project root for details.
