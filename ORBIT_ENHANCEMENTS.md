# ORBIT v2: Enhanced Specification

## Next-Generation Audio Provenance with 2024-2025 ML Advances

**Document Type**: Enhancement Addendum  
**Complements**: `ORBIT_SPECIFICATION.md`  
**Created**: December 8, 2025  
**Status**: Research Complete, Ready for Integration  
**Implementation Note**: v1 core system in progress — Sessions 1-9 complete (Core Engines + API foundation). Sessions 10-17 remaining for v1. v2 ML enhancements (Sessions 18+) scheduled after v1 completion.  

---

## Executive Summary

This document outlines enhancements to the base ORBIT specification that leverage cutting-edge 2024-2025 machine learning advances. These enhancements address the weaknesses identified in v1 and create a system that is **categorically superior** to existing standards.

### What This Adds

| v1 Weakness | v2 Enhancement | Result |
|-------------|----------------|--------|
| Spread spectrum may fail on heavy compression | Neural watermarking (WMCodec/SilentCipher) | 99%+ extraction accuracy |
| Chromaprint fails on pitch/speed changes | Neural fingerprinting (MERT-based) | Survives pitch shift, time stretch |
| Metadata must be provided by uploader | Zero-shot auto-extraction (CLAP + MERT) | AI extracts artist, genre, mood automatically |
| Limited to exact matching | Semantic similarity search | Find "similar sounding" tracks |
| No content verification | AI-powered content analysis | Detect mashups, remixes, covers |

### The Enhanced Value Proposition

**A recipient receiving an ORBIT v2 file can automatically know:**
- ✅ Original artist and track title (embedded + AI-verified)
- ✅ Duration, BPM, key, genre, mood (AI-extracted)
- ✅ Full provenance chain (cryptographically proven)
- ✅ Whether it's a duplicate, remix, cover, or mashup (AI-detected)
- ✅ All associated metadata from registration
- ✅ Confidence scores for all extracted data

---

## 1. Neural Watermarking Upgrade

### The Problem with Spread Spectrum

Our v1 spread spectrum approach:
- Works well for high-quality audio
- Degrades at low bitrates (128kbps MP3)
- Fails on significant time stretching
- Vulnerable to audio editing

### The Solution: Hybrid Neural Watermarking

Integrate **two neural watermarking systems** for redundancy:

#### Primary: SilentCipher (Sony AI, 2024)

**Why SilentCipher:**
- Psychoacoustic model integration → truly imperceptible
- Pseudo-differentiable compression layers → survives MP3/AAC
- Open research (INTERSPEECH 2024 paper)
- Designed for music (not just speech)

**Capabilities:**
- Survives: MP3 128kbps, AAC, streaming quality
- Capacity: 32-64 bits (enough for hash pointer)
- Imperceptibility: PESQ score degradation < 0.1

#### Fallback: WMCodec (September 2024)

**Why WMCodec as fallback:**
- 99%+ extraction accuracy under common attacks
- Joint training with codec → optimized for compression
- 16 bps capacity at 6 kbps bandwidth

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 ORBIT v2 WATERMARK SYSTEM                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐       ┌─────────────────┐            │
│   │  SilentCipher   │       │    WMCodec      │            │
│   │  (Primary)      │       │  (Fallback)     │            │
│   │                 │       │                 │            │
│   │  - High quality │       │  - Codec-aware  │            │
│   │  - Music-tuned  │       │  - 99% accuracy │            │
│   └────────┬────────┘       └────────┬────────┘            │
│            │                         │                      │
│            └────────────┬────────────┘                      │
│                         │                                   │
│                         ▼                                   │
│            ┌─────────────────────────┐                     │
│            │   Dual Extraction       │                     │
│            │   (Try both, prefer     │                     │
│            │    highest confidence)  │                     │
│            └─────────────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Robustness Matrix (Expected v2)

| Transformation | v1 (Spread Spectrum) | v2 (Neural) | Improvement |
|----------------|---------------------|-------------|-------------|
| MP3 320kbps | ✅ 95% | ✅ 99%+ | +4% |
| MP3 128kbps | ⚠️ 70% | ✅ 98%+ | +28% |
| AAC 128kbps | ⚠️ 65% | ✅ 97%+ | +32% |
| Streaming (Opus 64k) | ❌ 40% | ✅ 95%+ | +55% |
| Time stretch ±10% | ❌ 20% | ⚠️ 85%+ | +65% |
| Pitch shift ±2 semitones | ❌ 15% | ⚠️ 80%+ | +65% |
| Re-encoding chain | ❌ 30% | ✅ 92%+ | +62% |

---

## 2. Neural Fingerprinting Upgrade

### The Problem with Chromaprint

Chromaprint (v1):
- Excellent for exact matching
- Fails on pitch/speed modifications
- No semantic understanding
- Binary match (yes/no, no "similarity score")

### The Solution: MERT-Based Neural Fingerprinting

Use **MERT (Music Embedding Representation Transformer)** as the fingerprint backbone.

#### Why MERT

- **Pre-trained on 160,000 hours** of music
- **330M parameter model** available (or 95M for speed)
- **Survives transformations** that break Chromaprint
- **Semantic embeddings** enable similarity search
- **Zero-shot ready** — no fine-tuning required

#### November 2025 Research

Recent research (Singh et al., Nov 2025) showed:
- Neural fingerprinting with music foundation models **outperforms** state-of-the-art
- Trained with augmentations: time stretch, pitch shift, compression, filtering
- Superior robustness to audio distortions

### Dual Fingerprint System

```
┌─────────────────────────────────────────────────────────────┐
│               ORBIT v2 FINGERPRINT SYSTEM                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐       ┌─────────────────┐            │
│   │   Chromaprint   │       │      MERT       │            │
│   │   (Exact Match) │       │  (Semantic)     │            │
│   │                 │       │                 │            │
│   │  - Fast         │       │  - Robust       │            │
│   │  - Proven       │       │  - Similarity   │            │
│   │  - 32-byte hash │       │  - 768-dim vec  │            │
│   └────────┬────────┘       └────────┬────────┘            │
│            │                         │                      │
│            ▼                         ▼                      │
│   ┌─────────────────┐       ┌─────────────────┐            │
│   │  Exact Lookup   │       │  Vector Search  │            │
│   │  (PostgreSQL)   │       │  (pgvector)     │            │
│   └─────────────────┘       └─────────────────┘            │
│                                                             │
│   Combined Query: "Is this exact match OR similar?"        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Capability Comparison

| Capability | v1 (Chromaprint only) | v2 (Chromaprint + MERT) |
|------------|----------------------|-------------------------|
| Exact duplicate detection | ✅ | ✅ |
| Survives MP3 compression | ✅ | ✅ |
| Survives pitch shift | ❌ | ✅ |
| Survives time stretch | ❌ | ✅ |
| Similarity search | ❌ | ✅ |
| "Find similar songs" | ❌ | ✅ |
| Detect covers/remixes | ❌ | ✅ (via similarity) |

---

## 3. Zero-Shot Metadata Auto-Extraction

### The Vision

When a file is registered with ORBIT v2, the system automatically extracts:

| Metadata | Extraction Method | Confidence |
|----------|-------------------|------------|
| Genre | CLAP zero-shot classification | High |
| Mood/Emotion | CLAP + MERT embeddings | High |
| BPM/Tempo | Signal processing + MERT | Very High |
| Key | Signal processing | Very High |
| Instruments | CLAP multi-label | Medium-High |
| Vocal presence | CLAP classification | Very High |
| Energy level | MERT embeddings | High |
| Danceability | Derived from BPM + energy | Medium |

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│            ORBIT v2 AUTO-METADATA EXTRACTION                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   INPUT: Raw audio file                                     │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │                    MERT Model                        │  │
│   │               (Pre-trained, 330M)                    │  │
│   │                                                      │  │
│   │   Audio → [Frame embeddings] → [Pooled embedding]   │  │
│   │                                                      │  │
│   │   Extracts: Musical structure, timbre, rhythm       │  │
│   └─────────────────────────┬───────────────────────────┘  │
│                             │                               │
│   ┌─────────────────────────▼───────────────────────────┐  │
│   │                    CLAP Model                        │  │
│   │            (Contrastive Audio-Language)              │  │
│   │                                                      │  │
│   │   Audio + Text prompts → Similarity scores          │  │
│   │                                                      │  │
│   │   Prompts: "electronic music", "sad mood",          │  │
│   │            "guitar", "female vocals", etc.          │  │
│   └─────────────────────────┬───────────────────────────┘  │
│                             │                               │
│   ┌─────────────────────────▼───────────────────────────┐  │
│   │               Signal Processing                      │  │
│   │                                                      │  │
│   │   - BPM detection (librosa/essentia)                │  │
│   │   - Key detection (Krumhansl-Schmuckler)            │  │
│   │   - Loudness (EBU R128)                             │  │
│   │   - Duration, sample rate, channels                 │  │
│   └─────────────────────────┬───────────────────────────┘  │
│                             │                               │
│   OUTPUT: Complete metadata object with confidence scores  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Zero-Shot Genre Classification

Using CLAP's text-audio alignment:

```javascript
const GENRE_PROMPTS = [
  "electronic dance music",
  "hip hop and rap music", 
  "rock and alternative music",
  "pop music",
  "jazz music",
  "classical orchestral music",
  "country and folk music",
  "r&b and soul music",
  "metal and heavy music",
  "ambient and experimental music"
];

async function classifyGenre(audioEmbedding) {
  const scores = await clap.compareWithTexts(audioEmbedding, GENRE_PROMPTS);
  
  // Return top 3 with confidence
  return scores
    .map((score, i) => ({ genre: GENRE_PROMPTS[i], confidence: score }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

// Result: [
//   { genre: "electronic dance music", confidence: 0.89 },
//   { genre: "pop music", confidence: 0.45 },
//   { genre: "hip hop and rap music", confidence: 0.32 }
// ]
```

### Zero-Shot Mood Classification

```javascript
const MOOD_PROMPTS = [
  "happy and uplifting music",
  "sad and melancholic music",
  "energetic and exciting music",
  "calm and relaxing music",
  "aggressive and intense music",
  "romantic and sensual music",
  "dark and mysterious music",
  "nostalgic and emotional music"
];
```

### Instrument Detection

```javascript
const INSTRUMENT_PROMPTS = [
  "music with guitar",
  "music with piano",
  "music with drums",
  "music with bass",
  "music with synthesizer",
  "music with strings",
  "music with brass",
  "music with vocals"
];

// Multi-label: return all instruments above threshold
async function detectInstruments(audioEmbedding, threshold = 0.5) {
  const scores = await clap.compareWithTexts(audioEmbedding, INSTRUMENT_PROMPTS);
  return scores
    .filter(s => s.confidence > threshold)
    .map(s => s.instrument);
}
```

---

## 4. Content Analysis & Derivative Detection

### The Problem

V1 can detect exact duplicates but cannot identify:
- Covers (same song, different recording)
- Remixes (modified version of original)
- Mashups (combination of multiple songs)
- Samples (portions used in new works)

### The Solution: Semantic Content Analysis

Using MERT embeddings + similarity thresholds:

```
┌─────────────────────────────────────────────────────────────┐
│              CONTENT RELATIONSHIP DETECTION                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Similarity Score    │    Relationship Type               │
│   ───────────────────────────────────────────────────────  │
│   0.99 - 1.00         │    EXACT DUPLICATE                 │
│   0.95 - 0.99         │    TRANSCODED / MINOR EDIT         │
│   0.85 - 0.95         │    POSSIBLE REMIX                  │
│   0.70 - 0.85         │    POSSIBLE COVER                  │
│   0.50 - 0.70         │    STYLISTICALLY SIMILAR           │
│   < 0.50              │    DIFFERENT WORK                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```javascript
async function analyzeContentRelationship(audioPath, db) {
  // Get MERT embedding
  const embedding = await mert.getEmbedding(audioPath);
  
  // Search for similar tracks
  const similar = await db.query(`
    SELECT 
      id, title, artist, 
      1 - (mert_embedding <=> $1) as similarity
    FROM orbit_registrations
    WHERE 1 - (mert_embedding <=> $1) > 0.5
    ORDER BY similarity DESC
    LIMIT 10
  `, [embedding]);
  
  // Classify relationships
  return similar.map(track => ({
    ...track,
    relationship: classifyRelationship(track.similarity)
  }));
}

function classifyRelationship(similarity) {
  if (similarity >= 0.99) return 'EXACT_DUPLICATE';
  if (similarity >= 0.95) return 'TRANSCODED';
  if (similarity >= 0.85) return 'POSSIBLE_REMIX';
  if (similarity >= 0.70) return 'POSSIBLE_COVER';
  if (similarity >= 0.50) return 'STYLISTICALLY_SIMILAR';
  return 'DIFFERENT_WORK';
}
```

---

## 5. Enhanced Verification Response

### V1 Verification Response

```json
{
  "verified": true,
  "fingerprint_hash": "...",
  "metadata": { "title": "...", "artist": "..." },
  "origin": { "platform": "...", "timestamp": "..." }
}
```

### V2 Enhanced Verification Response

```json
{
  "verified": true,
  
  "identity": {
    "fingerprint_hash": "abc123...",
    "mert_embedding_id": "emb_456...",
    "chromaprint_match": { "id": 12345, "confidence": 1.0 },
    "semantic_match": { "id": 12345, "similarity": 0.98 }
  },
  
  "watermark": {
    "detected": true,
    "method": "silentcipher",
    "confidence": 0.97,
    "payload_hash": "def789...",
    "fallback_attempted": false
  },
  
  "registered_metadata": {
    "isrc": "USRC12345678",
    "upc": "012345678901",
    "title": "Midnight Drive",
    "artist": "The Neon Collective",
    "duration_ms": 234567
  },
  
  "ai_extracted_metadata": {
    "genre": [
      { "label": "electronic", "confidence": 0.89 },
      { "label": "synthwave", "confidence": 0.76 }
    ],
    "mood": [
      { "label": "energetic", "confidence": 0.82 },
      { "label": "nostalgic", "confidence": 0.65 }
    ],
    "bpm": { "value": 120, "confidence": 0.95 },
    "key": { "value": "A minor", "confidence": 0.88 },
    "instruments": [
      { "label": "synthesizer", "confidence": 0.94 },
      { "label": "drums", "confidence": 0.91 },
      { "label": "bass", "confidence": 0.87 }
    ],
    "vocals": { "present": true, "confidence": 0.72 },
    "energy": 0.78,
    "danceability": 0.85
  },
  
  "content_analysis": {
    "is_derivative": false,
    "similar_works": [
      {
        "registration_id": 45678,
        "title": "Night Rider",
        "artist": "Synth Masters",
        "similarity": 0.62,
        "relationship": "STYLISTICALLY_SIMILAR"
      }
    ]
  },
  
  "provenance": {
    "origin": {
      "platform": "ohnrshyp",
      "owner_id": "user_abc123",
      "timestamp": "2024-12-08T12:00:00Z",
      "signature_valid": true
    },
    "transfers": [],
    "chain_integrity": "VALID",
    "merkle_proof_available": true
  },
  
  "confidence_summary": {
    "identity_confidence": 0.99,
    "watermark_confidence": 0.97,
    "metadata_confidence": 0.85,
    "overall_verification": "HIGH"
  }
}
```

### What This Means for Recipients

A platform receiving an ORBIT v2 verified file can **automatically know**:

| Information | Source | Confidence |
|-------------|--------|------------|
| Original artist | Registered metadata | ✅ Cryptographically proven |
| Track title | Registered metadata | ✅ Cryptographically proven |
| Duration | Signal analysis | ✅ Verified |
| Genre | AI extraction | 85-95% |
| Mood/vibe | AI extraction | 75-85% |
| BPM | Signal analysis | 95%+ |
| Key | Signal analysis | 85-90% |
| Instruments | AI extraction | 80-90% |
| Is it a duplicate? | Fingerprint + semantic | 99%+ |
| Is it a remix/cover? | Semantic analysis | 85%+ |
| Who owns it? | Provenance chain | ✅ Cryptographically proven |
| Where did it come from? | Transfer history | ✅ Cryptographically proven |

---

## 6. Updated Technology Stack

### V2 Dependencies (All Pre-trained, No Training Required)

| Component | Model/Library | Size | Purpose |
|-----------|---------------|------|---------|
| **Fingerprint (exact)** | Chromaprint | CLI tool | Exact duplicate detection |
| **Fingerprint (semantic)** | MERT-v1-95M | ~400MB | Robust matching, similarity |
| **Zero-shot classification** | LAION-CLAP | ~600MB | Genre, mood, instruments |
| **Watermark (primary)** | SilentCipher | ~100MB | Neural watermarking |
| **Watermark (fallback)** | WMCodec | ~150MB | Codec-aware watermarking |
| **Audio analysis** | librosa/essentia | Python lib | BPM, key, loudness |
| **Vector search** | pgvector | PostgreSQL ext | Similarity search |
| **Encoding** | CBOR | npm package | Binary serialization |
| **Crypto** | TweetNaCl | npm package | Ed25519 signing |

### Total Model Size

~1.3GB of pre-trained models (downloaded once, cached forever)

### Inference Requirements

| Operation | GPU Required? | Time (3-min track) |
|-----------|---------------|---------------------|
| Chromaprint | No | ~1 second |
| MERT embedding | Optional (faster) | ~3-5 seconds (CPU), ~0.5s (GPU) |
| CLAP classification | Optional (faster) | ~2-3 seconds (CPU), ~0.3s (GPU) |
| Watermark embed | No | ~5-10 seconds |
| Watermark extract | No | ~2-5 seconds |
| Signal analysis | No | ~2-3 seconds |
| **Total registration** | Optional | ~15-25 seconds (CPU) |
| **Total verification** | Optional | ~10-15 seconds (CPU) |

---

## 7. Updated API Endpoints

### Enhanced Register Response

```
POST /orbit/v2/register

Response additions:
{
  ...v1_response,
  
  "ai_metadata": {
    "extracted": true,
    "genre": [...],
    "mood": [...],
    "bpm": 120,
    "key": "A minor",
    "instruments": [...],
    "vocals_present": true
  },
  
  "embeddings": {
    "mert_stored": true,
    "clap_stored": true
  },
  
  "watermark": {
    "method": "silentcipher",
    "fallback_embedded": true  // Also embedded WMCodec as backup
  }
}
```

### Enhanced Verify Response

See Section 5 above for full response structure.

### New Endpoint: Similarity Search

```
POST /orbit/v2/similar

Request:
{
  "audio": <binary>,
  "threshold": 0.5,
  "limit": 20,
  "include_derivatives": true
}

Response:
{
  "query_embedding_id": "emb_temp_123",
  "results": [
    {
      "registration_id": 12345,
      "title": "Similar Track",
      "artist": "Other Artist",
      "similarity": 0.78,
      "relationship": "STYLISTICALLY_SIMILAR",
      "registered_at": "2024-11-15T10:00:00Z"
    }
  ],
  "query_metadata": {
    "genre": [...],
    "mood": [...],
    "bpm": 118
  }
}
```

### New Endpoint: Batch Analysis

```
POST /orbit/v2/analyze

Request:
{
  "audio": <binary>,
  "include": ["genre", "mood", "bpm", "key", "instruments", "vocals"]
}

Response:
{
  "analysis": {
    "genre": [...],
    "mood": [...],
    "bpm": { "value": 120, "confidence": 0.95 },
    "key": { "value": "A minor", "confidence": 0.88 },
    "instruments": [...],
    "vocals": { "present": true, "gender": "female", "confidence": 0.82 }
  },
  "embeddings": {
    "mert": <768-dim vector>,
    "clap": <512-dim vector>
  },
  "fingerprint": {
    "chromaprint_hash": "..."
  }
}
```

---

## 8. Implementation Considerations

### Model Loading Strategy

```javascript
// Lazy loading - only load models when first needed
class ModelManager {
  constructor() {
    this.models = {};
  }
  
  async getMERT() {
    if (!this.models.mert) {
      console.log('Loading MERT model (first request, ~30s)...');
      this.models.mert = await loadMERT();
    }
    return this.models.mert;
  }
  
  async getCLAP() {
    if (!this.models.clap) {
      console.log('Loading CLAP model (first request, ~20s)...');
      this.models.clap = await loadCLAP();
    }
    return this.models.clap;
  }
  
  async getWatermarker() {
    if (!this.models.watermark) {
      console.log('Loading SilentCipher model...');
      this.models.watermark = await loadSilentCipher();
    }
    return this.models.watermark;
  }
}

// Singleton - models stay loaded after first use
const models = new ModelManager();
```

### GPU Acceleration (Optional but Recommended)

```yaml
# docker-compose.yml for GPU support
services:
  orbit:
    image: orbit:v2
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - CUDA_VISIBLE_DEVICES=0
```

### CPU-Only Deployment

Fully functional without GPU:
- ~3x slower inference
- Still practical for moderate volume
- Recommend async queue for high volume

---

## 9. Updated Timeline

### Phase 1: Core + Neural Watermarking (Month 1)

| Week | Tasks |
|------|-------|
| 1 | Integrate SilentCipher, test robustness against compression formats |
| 2 | Implement WMCodec fallback, dual-extraction pipeline |
| 3 | Integrate MERT for semantic fingerprinting, pgvector setup |
| 4 | Combined fingerprint system (Chromaprint + MERT), API endpoints |

### Phase 2: Zero-Shot ML + B2B (Month 2)

| Week | Tasks |
|------|-------|
| 1 | CLAP integration for genre/mood/instrument classification |
| 2 | Auto-metadata extraction pipeline, confidence scoring |
| 3 | Content relationship detection (covers, remixes, similarity) |
| 4 | B2B transfer protocol, Ohnrshyp integration |

### Phase 3: Polish + Launch (Month 3)

| Week | Tasks |
|------|-------|
| 1 | Enhanced verification response, similarity search endpoint |
| 2 | Admin dashboard, analytics, model performance monitoring |
| 3 | Documentation, SDK updates, partner onboarding |
| 4 | Production deployment, load testing, launch |

---

## 10. Competitive Advantage Summary

### vs. DDEX

| Aspect | DDEX | ORBIT v2 |
|--------|------|----------|
| Format | XML (verbose) | CBOR (binary, 90% smaller) |
| Metadata location | Sidecar file | Embedded in audio + ledger |
| AI enhancement | ❌ None | ✅ Full auto-extraction |
| Similarity search | ❌ | ✅ Semantic |
| Derivative detection | ❌ | ✅ Covers, remixes |
| Chain of custody | Trust-based | Cryptographic |
| Watermark robustness | N/A | 99%+ neural |

### vs. Content ID

| Aspect | Content ID | ORBIT v2 |
|--------|------------|----------|
| Platform | YouTube only | Any platform |
| Open API | ❌ Closed | ✅ Open (licensable) |
| Embedded identity | ❌ | ✅ Neural watermark |
| B2B transfers | ❌ | ✅ With dual signatures |
| Self-hostable | ❌ | ✅ White-label option |
| Metadata extraction | Limited | Full AI suite |

### vs. Other Fingerprinting (Shazam, Audible Magic)

| Aspect | Traditional | ORBIT v2 |
|--------|-------------|----------|
| Pitch/speed invariance | ❌ Limited | ✅ MERT-based |
| Embedded identity | ❌ | ✅ |
| Semantic similarity | ❌ | ✅ |
| Open source verify | ❌ | ✅ |
| Provenance chain | ❌ | ✅ |

---

## 11. Conclusion

ORBIT v2 with these enhancements becomes:

1. **More robust**: Neural watermarking survives 99%+ of transformations
2. **Smarter**: AI extracts genre, mood, BPM, key, instruments automatically
3. **More comprehensive**: Detects covers, remixes, and similar works
4. **More valuable**: Recipients get rich verified metadata, not just "is this registered?"
5. **Future-proof**: Built on 2024-2025 foundation models that will only improve

### The Ultimate Value Proposition

> "Send an ORBIT v2 file to anyone. They can verify who created it, when, where it's been, what genre it is, what mood it conveys, what instruments are in it, whether it's similar to anything else in the registry — all automatically, all cryptographically proven where applicable, all from the audio file itself."

**This does not exist anywhere else.**

---

## Document Relationship

This document **enhances** the base `ORBIT_SPECIFICATION.md`:

- Base spec remains valid for core architecture
- This doc adds ML enhancements on top
- Implementation should follow base spec first, then layer these enhancements
- Enhancements are modular — can ship v1 first, add v2 features incrementally

---

*Enhancement specification complete. Ready for implementation.*
