# @ohnrshyp/metadata

**Unified hybrid neural AI audio metadata extraction pipeline.**

This package integrates multiple deep learning and digital signal processing (DSP) models to automatically extract comprehensive structural and semantic metadata tags from raw audio files. It is the intelligence layer powering the auto-tagging and verification capabilities of the ORBIT protocol.

---

## 🚀 Key AI Pipelines

* 🧠 **Zero-Shot Mood & Vocal Tagger (LAION-CLAP)**: Uses contrastive text-audio embeddings to detect acoustic mood, vocal presence, vocal gender, and singing style.
* 🎹 **Primary Instrument Identification (PANNs)**: Leverages Pretrained Audio Neural Networks (CNN14 architecture) to analyze and score 50+ instruments.
* 🏷️ **Genre Classifier (wav2vec2)**: Classifies the primary musical genre over 10 structural music classifications.
* 🧬 **2048-dim Audio Embeddings (PANNs)**: Generates highly descriptive semantic vector representations for similarity indexing in vector databases.
* ⏱️ **Classical DSP Features**: Integrates tempo (BPM), key/scale, RMS energy, and integrated loudness (dB) directly.
* 🔗 **Stem-Aware Analysis (Demucs)**: Optionally splits audio into vocal, bass, drum, and instrumental stems for isolated checking.

---

## 🔬 Model & Pipeline Architecture

The extraction orchestrator combines local JavaScript-based inferences and Python subprocess modules.

```
                    ┌─────────────────────────┐
                    │       Audio Input       │
                    └─────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   LAION-CLAP    │     │      PANNs      │     │    wav2vec2     │
│  (Transformers) │     │ (PyTorch Python)│     │  (Transformers) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
     (Mood, Vocals)     (Instruments, Tag)          (10 Genres)
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   DSP Signal Engine     │
                    │   (BPM, Key, Loudness)  │
                    └─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Unified JSON/DB      │
                    │     Metadata Object     │
                    └─────────────────────────┘
```

### 1. LAION-CLAP Inferences
CLAP models contain joint audio and text encoders trained to project audio waveforms and textual descriptions into a shared latent space. Zero-shot tags are extracted by computing the cosine similarity between the audio embedding $E_a$ and candidate text prompt embeddings $E_t$:
$$\text{Confidence}(i) = \frac{e^{S(E_a, E_{t, i}) / \tau}}{\sum_k e^{S(E_a, E_{t, k}) / \tau}}$$
This outputs mood keywords and vocal properties without retraining.

### 2. PANNs (Pretrained Audio Neural Networks)
PANNs maps the audio signal into a log-mel spectrogram and runs a CNN14 architecture trained on AudioSet (527 classes). By filtering AudioSet indices, we isolate specific instrument classes and extract the 2048-dimensional output from the global pooling layer to serve as our dense audio embedding.

---

## 📦 Installation

### Node.js (NPM Package)
```bash
npm install @ohnrshyp/metadata
```

---

## 🛠️ API Reference

### `extractMetadata(input, [options])`
Extracts comprehensive structural and semantic metadata from an audio source.

* **Parameters**:
  * `input` (`Buffer` | `string`): Raw binary buffer or absolute path to the target audio file.
  * `options` (`Object`, optional):
    * `includeEmbedding` (`boolean`): Include the 2048-dim PANNs audio vector. Default is `false`.
    * `verbose` (`boolean`): Enable diagnostic logging. Default is `false`.
    * `config` (`Object`): Advanced configuration overrides (see below).

* **Returns**: `Promise<Object>` containing the following schema:
  ```json
  {
    "genre": [
      { "label": "Electronic", "confidence": 0.8912 }
    ],
    "mood": [
      { "label": "Energetic", "confidence": 0.8412 },
      { "label": "Bright", "confidence": 0.7612 }
    ],
    "instruments": [
      { "label": "Synthesizer", "confidence": 0.912 },
      { "label": "Drum Kit", "confidence": 0.824 }
    ],
    "vocals": {
      "present": true,
      "confidence": 0.9412,
      "gender": "female"
    },
    "bpm": {
      "value": 128.0,
      "confidence": 0.8912
    },
    "key": {
      "value": "A minor",
      "confidence": 0.7412
    },
    "energy": 0.8124,
    "loudness_db": -12.42,
    "danceability": 0.8942,
    "duration": 210.42,
    "sample_rate": 22050,
    "extractionStatus": {
      "clap": "success",
      "panns": "success",
      "genreClassifier": "success",
      "audioAnalysis": "success",
      "embedding": "success"
    }
  }
  ```

### `extractClapOnly(input, [options])`
Performs only CLAP mood/vocals classification. Avoids PyTorch loading overhead, completing in $< 1$ second.

### `extractAudioAnalysisOnly(input, [options])`
Performs only CPU-only classical DSP feature extraction (BPM, key, loudness). No machine learning model is loaded.

### `checkEnvironment()`
Runs validation diagnostics across all sub-modules.
* **Returns**: `Promise<Object>` detailing availability flags.

### `formatForDatabase(result)`
Formats the extraction result into the JSON structure expected by the `ai_metadata` JSONB column in PostgreSQL.

### `formatEmbeddingForDatabase(embedding)`
Converts the Float32Array embedding vector into the PostgreSQL `pgvector` string format `"[v1,v2,...]"` for query parameters.

---

## ⚙️ Configuration Flags

Override defaults in the options parameter:
```javascript
const result = await metadata.extractMetadata(audioBuffer, {
  config: {
    enableClap: true,             // Zero-shot mood/vocals
    enablePanns: true,            // Instrument tagging
    enableGenreClassifier: true,  // wav2vec2 genre classification
    enableEmbedding: true,        // Generate 2048-dim vector
    enableAudioAnalysis: true,    // Run BPM/Key DSP
    enableDemucs: false,          // Run Demucs stem separation
    failOnError: false            // Bypass partial module failures
  }
});
```

---

## 💻 Code Examples

### Full Metadata Extraction & Database Formatting
```javascript
const metadata = require('@ohnrshyp/metadata');
const fs = require('fs');

async function run() {
  const audioBuffer = fs.readFileSync('dance-track.mp3');

  try {
    // Extract metadata including PANNs embedding
    const rawResult = await metadata.extractMetadata(audioBuffer, {
      includeEmbedding: true,
      verbose: true
    });

    console.log(`Primary Genre: ${rawResult.genre[0].label} (${(rawResult.genre[0].confidence * 100).toFixed(1)}%)`);
    console.log(`Mood Tags: ${rawResult.mood.map(m => m.label).join(', ')}`);
    console.log(`BPM: ${rawResult.bpm.value}`);

    // Format for pg/pgvector insertion
    const dbMetadataField = metadata.formatForDatabase(rawResult);
    const dbVectorParam = metadata.formatEmbeddingForDatabase(rawResult.embedding);

    console.log('Formatted pgvector String Prefix:', dbVectorParam.substring(0, 50));
    
  } catch (error) {
    console.error('Metadata extraction failed:', error.message);
  }
}

run();
```

---

## 📄 License

Licensed under the Apache License, Version 2.0 (the "License"). See [LICENSE](../../LICENSE) in the project root for details.
