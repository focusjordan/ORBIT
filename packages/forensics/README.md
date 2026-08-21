# @ohnrshyp/forensics

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
  <a href="https://www.npmjs.com/package/@ohnrshyp/forensics">
    <img src="https://img.shields.io/npm/v/@ohnrshyp/forensics.svg?style=flat-square" alt="npm version" />
  </a>
  <a href="https://github.com/focusjordan/ORBIT/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache--2.0-green.svg?style=flat-square" alt="License" />
  </a>
</p>

**High-fidelity audio signal forensics, tampering detection, and content provenance library.**

This module runs a deep, signal-level acoustic forensics suite to detect structural manipulations, lossy audio transcoding, synthetic phase alignments, and periodic upsampling artifacts common in AI-generated audio. It also provides a zero-dependency client connector for the **OpenAI Content Provenance API** (SynthID and C2PA credentials).

---

## 🚀 Key Forensic Diagnostics

* 🛡️ **OpenAI Content Provenance (SynthID + C2PA)**: Checks audio files directly against OpenAI's Content Provenance service to detect imperceptible SynthID watermarks and C2PA manifest provenance signals.
* 📐 **Phase Entropy (Instantaneous Group Delay)**: Estimates the Shannon phase entropy of the signal to catch artificial vocoding, pitch correction (autotune), or synthetic phase shifts.
* 📉 **Spectral Cutoff Check**: Detects brick-wall frequency rolloff cutoffs (e.g. at 16kHz or 20kHz) indicating low-bitrate MP3/AAC compression transcodes or training-data restrictions.
* 🧩 **Upsampling/Checkerboard Artifact Detector**: Captures periodic cepstral peak ratios associated with checkerboard spectral upsampling artifacts left behind by generative networks.
* 🔀 **Stereo Mid/Side (M/S) Coherence**: Analyzes stereo channel phase and energy distributions to flag artificial stereo widening or phase cancellations.
* ⚡ **Pre-echo Transient Check**: Analyzes onset transients to expose temporal smearing and pre-echo artifacts typical of frame-based audio codecs.
* 🎹 **Pitch Jitter & Modulation (Vibrato Jitter)**: Scans pitch contours to flag perfectly linear pitch modulations indicating synthesized vocoder vibratos.
* 📜 **Chroma & Flux Variance**: Measures timbral/spectral evolution variance (flux, centroid, zero-crossing rate) to flag abnormally static synthesis.

---

## 🔬 Architectural & Mathematical Design

The library couples a Node.js child process connector with a scientific python script leveraging **Librosa**, **NumPy**, and **SciPy**.

### 1. Phase Entropy
Instantaneous group delay describes the derivative of the phase spectrum along the frequency axis. A Short-Time Fourier Transform (STFT) yields complex matrix $D(f, t)$:
$$\text{Phase}(f, t) = \angle D(f, t)$$
$$\text{Instantaneous Frequency}(f, t) = \text{Phase}(f, t) - \text{Phase}(f, t-1)$$
For a series of frequency bins, the histogram of instantaneous frequency changes is computed. Shannon entropy is calculated over the histogram probabilities $p_i$:
$$H = -\sum_{i} p_i \log_2(p_i)$$
Natural audio yields high entropy ($H \ge 4.5$) due to complex harmonic variance. Artificial alignment or vocoder synthesis yields highly structured phase sequences, leading to abnormally low entropy ($H < 3.5$).

### 2. Cepstral Checkerboard peak ratio
To detect upsampling artifacts common in neural vocoders, the mean log-magnitude spectrum is computed:
$$\bar{S}(f) = \frac{1}{T} \sum_{t} \log |D(f, t)|$$
The real cepstrum is calculated by taking the inverse FFT of the log spectrum:
$$\text{Cepstrum} = \text{Real}(\text{IFFT}(\bar{S}(f)))$$
Periodic upsampling artifacts create distinct peaks in the high-quefrency region of the cepstrum. The ratio of the maximum peak amplitude to the average cepstral envelope amplitude exposes these vocoder structures.

---

## 📦 Installation

### Node.js (NPM Package)
```bash
npm install @ohnrshyp/forensics
```

### Python (PyPI Package)
```bash
pip install orbit-forensics
```

### Host Dependencies
This package delegates spectral processing to Python. Ensure Python 3.8+ is installed on the host along with:
```bash
pip install librosa numpy scipy
```

---

## 🛠️ Node.js API Reference

### `analyze(input, [options])`
Performs deep spectral forensics checks.

* **Parameters**:
  * `input` (`Buffer` | `string`): Raw binary buffer or absolute path to the target audio file.
  * `options` (`Object`, optional):
    * `maxLength` (`number`): Limit analysis to the first $N$ seconds of the file. Default is `120`.
    * `stemsDir` (`string` | `null`): Optional path to a directory containing separated stems (e.g. Demucs vocal/bass/other stems) to perform advanced stem-aware forensics (e.g., vocal-specific cutoff, instrumental bleed check).
    * `verbose` (`boolean`): Enable diagnostic logging. Default is `false`.

* **Returns**: `Promise<Object>` containing the following schema:
  ```json
  {
    "spectral_cutoff": {
      "available": true,
      "has_16k_cutoff": false,
      "energy_ratio_above_16k": 0.0412,
      "energy_below_16k": 12.421,
      "energy_16k_to_20k": 0.512
    },
    "phase_entropy": {
      "mean_entropy": 4.892,
      "std_entropy": 0.241,
      "normalized_entropy": 0.815,
      "low_entropy": false
    },
    "checkerboard": {
      "available": true,
      "cepstral_peak_ratio": 3.412,
      "has_artifacts": false
    },
    "pre_echo": {
      "available": true,
      "mean_pre_echo_ratio": 0.081,
      "has_pre_echo": false
    },
    "ms_phase_coherence": {
      "available": true,
      "sub_bass_sm_ratio": 0.091,
      "low_mid_sm_ratio": 0.241,
      "ms_anomalous": false
    },
    "pitch_jitter": {
      "available": true,
      "perfect_vibrato": false
    },
    "processingTimeMs": 1420
  }
  ```

### `checkOpenAIProvenance(audioBuffer, [options])`
Queries OpenAI's Content Provenance API to detect imperceptible SynthID audio watermarks or C2PA manifest provenance signals. Runs natively in Node.js with zero Python dependencies.

* **Parameters**:
  * `audioBuffer` (`Buffer`): Raw binary audio file buffer.
  * `options` (`Object`, optional):
    * `apiKey` (`string`): OpenAI API key (defaults to `process.env.OPENAI_API_KEY`).
    * `baseUrl` (`string`): API base URL (defaults to `https://api.openai.com/v1`).
    * `timeoutMs` (`number`): Network timeout in milliseconds (defaults to `10000`).
    * `filename` (`string`): File upload name (defaults to `'sample.wav'`).

* **Returns**: `Promise<Object>`:
  ```json
  {
    "checked": true,
    "detected": true,
    "status": "detected",
    "signal": "synthid",
    "confidence": 1.0,
    "model": "tts-1-hd",
    "created_at": 1724200000,
    "details": {
      "signals": [{ "type": "synthid", "confidence": 0.98 }]
    },
    "processing_time_ms": 340
  }
  ```

---

## 📊 Diagnostic Interpretation Matrix

Combine these metrics to diagnose the structural state of your audio:

| Diagnostic Metric | Pristine Master | Lossy Transcode (MP3/AAC) | AI-Generated (Vocoder/Synthesis) |
|---|---|---|---|
| **OpenAI Provenance (`detected`)** | `false` | `false` | `true` (SynthID / C2PA watermark) |
| **Phase Entropy (`normalized_entropy`)** | High ($\ge 0.75$) | Moderate ($0.65 - 0.75$) | Low ($< 0.55$) |
| **Spectral Cutoff (`has_16k_cutoff`)** | `false` | `true` (if transcode is $< 192$ kbps) | `true` (if trained on MP3 datasets) |
| **Checkerboard Artifacts (`has_artifacts`)**| `false` | `false` | `true` (periodic cepstral peak) |
| **Pre-echo (`has_pre_echo`)** | `false` | `true` (temporal framing artifacts) | `false` / `true` (varies by vocoder) |
| **M/S Stereo Coherence (`ms_anomalous`)**| `false` | `false` | `true` (artificial spatialization smearing) |

---

## 💻 Code Examples

### 1. Analyzing audio for AI generation or compression anomalies
```javascript
const forensics = require('@ohnrshyp/forensics');
const fs = require('fs');

async function verifyAudio() {
  const audioBuffer = fs.readFileSync('uploaded-track.wav');

  try {
    const report = await forensics.analyze(audioBuffer, {
      maxLength: 60, // inspect first 60 seconds
      verbose: true
    });

    console.log('--- Forensic Report ---');
    console.log(`Phase Entropy: ${report.phase_entropy.mean_entropy} (Low: ${report.phase_entropy.low_entropy})`);
    console.log(`Brickwall 16kHz Cutoff: ${report.spectral_cutoff.has_16k_cutoff}`);
    console.log(`Neural Vocoder Upsampling Peak: ${report.checkerboard.has_artifacts}`);
    console.log(`Stereo Phase Anomaly: ${report.ms_phase_coherence.ms_anomalous}`);

    if (report.phase_entropy.low_entropy && report.checkerboard.has_artifacts) {
      console.warn('⚠️ WARNING: Audio exhibits characteristics of neural synthesis/AI vocoding!');
    } else if (report.spectral_cutoff.has_16k_cutoff) {
      console.warn('⚠️ WARNING: Audio has been heavily compressed or transcoded from an MP3 source.');
    } else {
      console.log('✅ PASS: Audio file signal matches a pristine original master.');
    }

  } catch (error) {
    console.error('Forensics check failed:', error.message);
  }
}

verifyAudio();
```

### 2. Checking OpenAI Content Provenance (SynthID / C2PA)
```javascript
const forensics = require('@ohnrshyp/forensics');
const fs = require('fs');

async function checkOpenAI() {
  const audioBuffer = fs.readFileSync('voice-sample.wav');

  const provenance = await forensics.checkOpenAIProvenance(audioBuffer, {
    apiKey: process.env.OPENAI_API_KEY
  });

  if (provenance.detected) {
    console.log(`🤖 OpenAI Provenance Detected! Signal: ${provenance.signal}, Model: ${provenance.model}`);
    console.log(`   Confidence: ${(provenance.confidence * 100).toFixed(1)}%`);
  } else if (provenance.checked) {
    console.log('✅ No OpenAI SynthID or C2PA watermarks detected.');
  } else {
    console.log(`ℹ️ Check skipped / unconfigured: ${provenance.status}`);
  }
}

checkOpenAI();
```

---

## 📄 License

Licensed under the Apache License, Version 2.0 (the "License"). See [LICENSE](../../LICENSE) in the project root for details.