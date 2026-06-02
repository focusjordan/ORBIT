# @ohnrshyp/forensics

High-fidelity audio signal forensics and tampering detection library.

This library analyzes acoustic properties to identify structural manipulations, synthetic upsampling, compression degradation, and phase alterations. It helps verify the physical integrity of audio assets before registration or transfer.

---

## Features

- 📐 **Phase Entropy**: Calculates Shannon phase entropy over instantaneous group delays to flag synthetic phase alignment or vocoder alterations.
- 📉 **Frequency Rolloff**: Detects the high-frequency cutoff (e.g., 16kHz limit) to identify lossy compression transcodes (like low-bitrate MP3 or AAC).
- 🧩 **Upsampling Checker**: Checks for checkerboard upsampling spectral artifacts common in neural vocoder generators (AI-generated audio).
- 🔀 **Stereo Coherence**: Analyzes Mid/Side (M/S) stereo channel phase alignment to detect phase cancellation or artificial spatialization.
- ⚡ **Pre-echo Transients**: Measures transient ratios to identify temporal compression artifacts or pre-echo noise.

---

## Installation

### Node.js (NPM Package)
```bash
npm install @ohnrshyp/forensics
```

### Python (PyPI Package)
```bash
pip install orbit-forensics
```

### System Requirements
This library delegates spectral signal processing to a Python helper script. Ensure Python 3.8+ is installed on the host system along with:
```bash
pip install librosa numpy
```

---

## Usage

### 1. Perform Forensics Check
Analyze an audio file path or Buffer:

```javascript
const forensics = require('@ohnrshyp/forensics');
const fs = require('fs');

const audioBuffer = fs.readFileSync('suspect-track.mp3');

// Run forensics pipeline
const result = await forensics.analyze(audioBuffer, {
  maxLength: 120 // inspect first 120 seconds
});

console.log('Shannon Phase Entropy:', result.phase_entropy);
console.log('Frequency Rolloff Cutoff:', result.rolloff_cutoff_hz);
console.log('Upsampling Artifacts Detected:', result.upsampling_artifacts);
console.log('Stereo Phase Coherence Score:', result.stereo_coherence);
```

### 2. Verify Python Subprocess
Check if the local Python environment has the necessary tools to perform forensics:

```javascript
const env = await forensics.checkPythonEnvironment();
if (!env.available) {
  console.warn('Forensics module cannot run:', env.message);
  console.log('Install command:', env.details.install);
}
```

---

## File Structure

- [src/index.js](src/index.js): Node.js module wrapper and child process spawning.
- [scripts/audio_forensics.py](scripts/audio_forensics.py): Python script implementing the spectral forensics algorithms.