# @ohnrshyp/dsp

**Ultra-fast, CPU-only classical audio feature extraction library.**

This module provides high-speed, lightweight audio signal processing utilities. It runs efficiently on standard CPU hardware without demanding GPU execution or deep learning models, making it ideal for high-throughput batch upload pipelines.

---

## 🚀 Key Features

* ⏱️ **BPM & Tempo Tracking**: Identifies the audio tempo (beats per minute) alongside a temporal stability-based confidence score.
* 🎹 **Musical Key & Scale Detection**: Recognizes the global pitch center and scale mode (Major/Minor) using the Krumhansl-Schmuckler chromagram correlation algorithm.
* 🔊 **RMS Energy & Loudness**: Computes integrated root-mean-square (RMS) energy and estimated loudness levels in decibels (dB).
* 📊 **Dynamic Range**: Calculates the dB spread between the 95th and 10th percentiles of frame-wise RMS energy.
* 💃 **Danceability Estimator**: Computes a composite danceability index based on tempo stability and acoustic energy distribution.

---

## 🧬 Architectural & Mathematical Design

The core processing pipeline bridges a Node.js child-process wrapper and a high-performance Python DSP engine utilizing **Librosa** and **NumPy**.

### 1. Tempo (BPM) & Confidence
The BPM estimation pipeline computes the onset strength envelope of the input signal:
$$\text{Onset Strength}(t) = \sum_{f} \max(0, S(f, t) - S(f, t-1))$$
where $S(f, t)$ is the log-mel spectrogram. It then runs a Fourier-based tempogram or auto-correlation:
$$\text{Tempogram}(\tau, t) = \sum_{n} \text{Onset Strength}(n) \cdot W(n - t) \cdot e^{-j 2\pi \tau n}$$
The dominant peak yields the primary BPM. The confidence score measures the dominance of the selected tempo frequency relative to the average spectral energy across the tempogram.

### 2. Krumhansl-Schmuckler Key Detection
A Constant-Q Transform (CQT) translates the audio signal into a 12-bin chromagram (pitch class profile). The average energy across time forms a 12-dimensional chroma vector $C$. This vector is normalized and rotated $12$ times (for each semitone shift) to correlate against major and minor key templates defined by Krumhansl & Schmuckler:
* **Major Profile**: `[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]`
* **Minor Profile**: `[6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]`

The Pearson correlation coefficient $r$ is computed for each pitch class rotation $i$:
$$r_i = \frac{\sum (C_i - \bar{C_i})(T - \bar{T})}{\sqrt{\sum (C_i - \bar{C_i})^2 \sum (T - \bar{T})^2}}$$
The profile rotation that maximizes $r_i$ defines the musical key and scale mode. The confidence represents the correlation normalized to a $[0, 1]$ range.

---

## 📦 Installation

### Node.js (NPM Package)
```bash
npm install @ohnrshyp/dsp
```

### Python (PyPI Package)
```bash
pip install orbit-dsp
```

### Host Dependencies
This package delegates core DSP tasks to a local Python executable. Ensure Python 3.8+ is installed on the host along with the required libraries:
```bash
pip install librosa numpy scipy
```

---

## 🛠️ Node.js API Reference

### `analyze(input, [options])`
Performs comprehensive acoustic analysis of the input audio source.

* **Parameters**:
  * `input` (`Buffer` | `string`): Raw binary buffer or absolute path to the target audio file.
  * `options` (`Object`, optional):
    * `maxLength` (`number`): Limit processing to the first $N$ seconds of the file. Default is `120`.
    * `stemsDir` (`string` | `null`): Optional path to a directory containing separated stems (e.g. Demucs vocal/bass/other stems) to significantly improve pitch key resolution.
    * `verbose` (`boolean`): Enable diagnostic logging. Default is `false`.

* **Returns**: `Promise<Object>` containing the following schema:
  ```json
  {
    "bpm": {
      "value": 128.0,
      "confidence": 0.8415
    },
    "key": {
      "value": "A minor",
      "key": "A",
      "mode": "minor",
      "confidence": 0.7912
    },
    "energy": 0.6843,
    "loudness_db": -14.21,
    "dynamic_range_db": 11.45,
    "duration": 240.5,
    "sample_rate": 22050,
    "analyzed_length": 120.0,
    "key_detection_source": "mix_hpss",
    "processingTimeMs": 420
  }
  ```

### `calculateDanceability(analysisResult)`
Estimates danceability from the extracted BPM and energy metrics using a normalized sigmoid correlation.
* **Parameters**:
  * `analysisResult` (`Object`): The JSON output returned from `analyze()`.
* **Returns**: `number` between `0` and `1`.

### `checkPythonEnvironment()`
Verifies that the Python binary and dependencies (`librosa`, `numpy`) are available and operational.
* **Returns**: `Promise<Object>`:
  ```json
  {
    "available": true,
    "message": "Python environment ready for audio DSP analysis",
    "details": {
      "pythonVersion": "Python 3.10.8",
      "packages": ["librosa", "numpy"]
    }
  }
  ```

---

## 💻 Code Examples

### Analyzing raw audio buffer and determining danceability
```javascript
const dsp = require('@ohnrshyp/dsp');
const fs = require('fs');

async function run() {
  // Check host environment first
  const env = await dsp.checkPythonEnvironment();
  if (!env.available) {
    console.error('Environment check failed:', env.message);
    console.log('Please run:', env.details?.install);
    return;
  }

  const audioBuffer = fs.readFileSync('house-track.mp3');
  
  try {
    const analysis = await dsp.analyze(audioBuffer, {
      maxLength: 90, // process only first 90s for ultra-fast response
      verbose: true
    });

    const danceScore = dsp.calculateDanceability(analysis);

    console.log(`BPM: ${analysis.bpm.value} (Confidence: ${analysis.bpm.confidence})`);
    console.log(`Key: ${analysis.key.value}`);
    console.log(`Loudness: ${analysis.loudness_db} dB`);
    console.log(`Estimated Danceability: ${(danceScore * 100).toFixed(1)}%`);
  } catch (error) {
    console.error('Analysis failed:', error.message);
  }
}

run();
```

---

## 📄 License

Licensed under the Apache License, Version 2.0 (the "License"). See [LICENSE](../../LICENSE) in the project root for details.