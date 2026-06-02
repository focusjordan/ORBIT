# @ohnrshyp/metadata

Unified zero-shot AI audio metadata extraction pipeline. 

This package integrates multiple deep learning and digital signal processing (DSP) models to automatically extract comprehensive metadata tags from raw audio files. It is the core intelligence layer powering ORBIT registration.

---

## Features

- 🧠 **Zero-shot Mood & Vocal Detection**: Uses LAION-CLAP embeddings to detect acoustic sentiment and vocal characteristics (vocals present, gender, etc.).
- 🎵 **Instrument Classification**: Uses PANNs (Pretrained Audio Neural Networks) to isolate and rank primary instruments.
- 🏷️ **Genre Identification**: Uses a specialized wav2vec2 model to classify musical genres.
- 📊 **Signal Features**: Extracts BPM, musical key, loudness, energy levels, and dynamic range.
- 🧬 **Acoustic Embeddings**: Generates 2048-dimensional PANNs semantic vector embeddings for audio similarity indexing.

---

## Installation

Install via npm:
```bash
npm install @ohnrshyp/metadata
```

### System Requirements
This package runs hybrid inferences:
1. **Local JS Inference**: Uses `@xenova/transformers` for on-device/CPU execution of CLAP and genre classification models.
2. **Background Python Inference**: Spawns Python scripts for heavy feature extraction (Librosa) and neural separation (Demucs). Ensure Python 3.8+ is installed with `librosa`, `soundfile`, and `numpy`.

---

## Usage

### 1. Extract Full Metadata
Run the entire AI pipeline on an audio file or Buffer:

```javascript
const metadata = require('@ohnrshyp/metadata');
const fs = require('fs');

const audioBuffer = fs.readFileSync('track.mp3');

// Run the unified extraction pipeline
const result = await metadata.extractMetadata(audioBuffer, {
  includeEmbedding: true, // Generate 2048-dim PANNs vector
  verbose: true
});

console.log('AI Genre:', result.genre);
console.log('Detected BPM:', result.bpm.value);
console.log('Key:', result.key.value);
console.log('Energy:', result.energy);
console.log('Instruments:', result.instruments);
```

### 2. Fast / Specialized Extraction
If you don't need the full pipeline, run faster specialized routes:

```javascript
// CLAP-only (Fast mood/instrument classification, no signal processing)
const clapMetadata = await metadata.extractClapOnly(audioBuffer);

// Audio Analysis-only (Fastest, CPU-only DSP key/BPM detection, no ML models loaded)
const dspMetadata = await metadata.extractAudioAnalysisOnly(audioBuffer);
```

### 3. Check System Dependencies
Verify if Python and the necessary ML packages are available:

```javascript
const env = await metadata.checkEnvironment();
console.log('CLAP Available:', env.clap.available);
console.log('Audio Analysis Available:', env.audioAnalysis.available);
console.log('PANNs Available:', env.panns.available);
```

### 4. Database Format Helper
Format extraction output to fit the `ai_metadata` JSONB schema and generate a text vector representation for `pgvector` database storage:

```javascript
const dbPayload = metadata.formatForDatabase(result);
const vectorString = metadata.formatEmbeddingForDatabase(result.embedding); // Returns "[0.02,-0.12,...]"
```

---

## Configuration

Configure custom options by passing a config object in the options parameter:

| Config Option | Default | Description |
|---|---|---|
| `enableClap` | `true` | Enable LAION-CLAP mood and vocal detection. |
| `enablePanns` | `true` | Enable PANNs instrument tagging. |
| `enableGenreClassifier` | `true` | Enable wav2vec2 genre classification. |
| `enableEmbedding` | `true` | Enable PANNs 2048-dimensional embedding generation. |
| `enableAudioAnalysis` | `true` | Enable BPM, Key, energy, and loudness detection. |
| `failOnError` | `false` | If true, errors in sub-modules cause the main extraction to fail. |

```javascript
const result = await metadata.extractMetadata(audioBuffer, {
  config: {
    enableClap: true,
    enablePannsEmbedding: false // disable vector generation for speed
  }
});
```

---

## File Structure

- [src/index.js](src/index.js): Unified entry point and orchestration layer.
- [src/clap.js](src/clap.js): CLAP zero-shot classification interface.
- [src/panns.js](src/panns.js): PANNs instrumentation tagger and embedding runner.
- [src/genre-classifier.js](src/genre-classifier.js): wav2vec2 genre classification.
- [src/audio-analysis.js](src/audio-analysis.js): Subprocess interface to CPU-only librosa features.
