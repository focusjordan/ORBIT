# @ohnrshyp/watermark

Robust neural audio watermarking library using SilentCipher.

This package embeds and extracts imperceptible digital signatures (up to 5 bytes / 40 bits) directly within audio waveforms. Based on Sony AI's SilentCipher, these neural watermarks survive lossy audio compression (MP3, AAC, Opus), frequency downsampling, and format transcodes with over 99% extraction reliability.

---

## Features

- 🧠 **Neural Steganography**: Embeds a 40-bit payload into an audio signal imperceptibly (high Signal-to-Distortion Ratio / SDR).
- 🛡️ **Compression Survival**: Signatures remain retrievable even after streaming transmission, MP3 compression, or time stretching.
- ⚙️ **Dual Venv Compatibility**: Designed to execute in a decoupled environment. If necessary, it points to a dedicated virtual environment using `torch<=2.0.0` to avoid conflicts with newer PyTorch installations.

---

## Installation

### Node.js (NPM Package)
```bash
npm install @ohnrshyp/watermark
```

### Python (PyPI Package)
```bash
pip install orbit-watermark
```

### Python Environment Setup
SilentCipher requires a specific version of PyTorch. It is highly recommended to isolate it in a dedicated Python virtual environment (e.g., `.venv-watermark/`):

```bash
python -m venv .venv-watermark
source .venv-watermark/bin/activate
pip install torch==2.0.0 silentcipher librosa soundfile numpy
```

Configure your Node app to use this venv by exporting the environment variable:
```bash
export ORBIT_SILENTCIPHER_PYTHON=/absolute/path/to/your/ORBIT/.venv-watermark/bin/python3
```

---

## Usage

### 1. Embed a Signature Payload
Convert a 32-byte payload hash (e.g., from an entry registration) to a 5-byte SilentCipher message, and embed it:

```javascript
const watermark = require('@ohnrshyp/watermark');
const fs = require('fs');

const originalAudio = fs.readFileSync('track.wav');
const payloadHash = Buffer.from('a1b2c3d4e5...', 'hex'); // Your unique 32-byte registration hash

// Embed the watermark
const result = await watermark.embed(originalAudio, payloadHash, {
  outputPath: 'watermarked-track.wav',
  verbose: true
});

console.log('Watermark embedded successfully:', result.success);
console.log('Signal-to-Distortion Ratio (SDR):', result.sdr, 'dB');
```

### 2. Extract a Signature Payload
Retrieve the embedded payload from any audio file:

```javascript
const watermark = require('@ohnrshyp/watermark');
const fs = require('fs');

const distributedAudio = fs.readFileSync('track-compressed.mp3');

const result = await watermark.extract(distributedAudio);

if (result.detected) {
  console.log('Watermark found!');
  console.log('Extracted Hash Buffer:', result.payloadHash);
  console.log('Confidence Score:', result.confidence);
} else {
  console.log('No watermark detected.');
}
```

### 3. Check System Dependencies
Verify that your Python binary and PyTorch environment are ready to perform neural watermarking:

```javascript
const env = await watermark.checkPythonEnvironment();
if (!env.available) {
  console.error('SilentCipher environment not ready:', env.message);
  console.log('Install command:', env.details.install);
}
```

### 4. Matching Helpers
Helper functions to translate raw payloads:

```javascript
// Truncate a 32-byte hash to SilentCipher's 5-byte format
const fiveByteMsg = watermark.hashToMessage(payloadHash);

// Reconstruct a 5-byte message array back to a Buffer
const extractedBuffer = watermark.messageToHash([1, 2, 3, 4, 5]);

// Verify if an extracted watermark matches a known hash prefix
const isMatch = watermark.hashMatches(extractedBuffer, originalPayloadHash);
```

---

## File Structure

- [src/index.js](src/index.js): Node.js module wrapper and child process spawning.
- [scripts/silentcipher_watermark.py](scripts/silentcipher_watermark.py): Python wrapper invoking the SilentCipher encoder/decoder pipeline.