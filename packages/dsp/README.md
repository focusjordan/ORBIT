# @ohnrshyp/dsp

Ultra-fast, CPU-only classical audio feature extraction library.

This library extracts acoustic characteristics—such as tempo, pitch key, and loudness—using lightweight, traditional digital signal processing (DSP) algorithms. It runs efficiently on basic CPU hardware without requiring deep learning or GPU acceleration.

---

## Features

- ⏱️ **BPM Detection**: Identifies audio tempo (beats per minute) with confidence ratings.
- 🎹 **Musical Key Detection**: Identifies the musical key and scale (major/minor) using the Krumhansl-Schmuckler chromagram correlation algorithm.
- 🔊 **Loudness & Dynamics**: Measures integrated loudness (dB), dynamic range, and overall audio energy levels.
- 💃 **Danceability Scoring**: Helper utility calculating how suitable a track is for dancing based on tempo consistency and energy levels.

---

## Installation

### Node.js (NPM Package)
```bash
npm install @ohnrshyp/dsp
```

### Python (PyPI Package)
```bash
pip install orbit-dsp
```

### System Requirements
This library delegates core math tasks to a Python helper process. Ensure Python 3.8+ is installed on the host system along with:
```bash
pip install librosa numpy
```

---

## Usage

### 1. Perform Acoustic Analysis
Analyze an audio file path or Buffer:

```javascript
const dsp = require('@ohnrshyp/dsp');
const fs = require('fs');

const audioBuffer = fs.readFileSync('track.mp3');

// Run CPU-only analysis
const result = await dsp.analyze(audioBuffer, {
  maxLength: 120 // restrict processing to first 120 seconds for speed
});

console.log('Tempo (BPM):', result.bpm.value);
console.log('Tempo Confidence:', result.bpm.confidence);
console.log('Musical Key:', result.key.value);
console.log('Integrated Loudness (dB):', result.loudness_db);
console.log('Energy Level (0-1):', result.energy);
```

### 2. Calculate Danceability
Determine danceability using the extracted BPM and energy output:

```javascript
const score = dsp.calculateDanceability(result);
console.log(`Danceability Score: ${(score * 100).toFixed(1)}%`);
```

### 3. Check System Dependencies
Verify that Python and its package requirements are installed:

```javascript
const env = await dsp.checkPythonEnvironment();
if (!env.available) {
  console.error('Missing dependencies:', env.message);
  console.log('Install command:', env.details.install);
}
```

---

## File Structure

- [src/index.js](src/index.js): Node.js module wrapper and child process spawning.
- [scripts/audio_dsp.py](scripts/audio_dsp.py): Python script implementing the librosa DSP algorithms.