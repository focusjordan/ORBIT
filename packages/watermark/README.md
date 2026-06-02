# @ohnrshyp/watermark

**Robust neural audio watermarking using SilentCipher.**

This module implements digital steganographic audio watermarking. Based on Sony AI's SilentCipher, it encodes imperceptible digital payloads directly within audio waveforms. These neural watermarks are highly robust and survive lossy compression (MP3, AAC, Opus, M4A), frequency downsampling, time-stretching, and format conversions with over 99% extraction accuracy.

---

## 🚀 Key Features

* 🧠 **Neural Steganography (SilentCipher)**: Embeds a 40-bit payload into an audio signal imperceptibly (high Signal-to-Distortion Ratio / SDR).
* 🛡️ **Compression & Transcoding Survival**: Payloads remain extractable after standard music distribution pipelines and MP3 conversion.
* ⚙️ **Dual Venv Orchestration**: Automatically isolates its run environment using a dedicated virtual environment with `torch<=2.0.0` to prevent system conflicts.
* 🔍 **Prefix Match Queries**: Translates a 32-byte registration hash into a 5-byte message and verifies matches cryptographically.

---

## 🔬 Architectural & Mathematical Design

The watermarking engine bridges a Node.js child process wrapper and a high-performance Python script executing the **SilentCipher** deep model.

### 1. Neural Audio Steganography
SilentCipher utilizes a deep encoder-decoder network trained with adversarial and psychoacoustic losses. 
* The **Encoder** generates an imperceptible perturbation waveform:
$$y_{\text{watermarked}} = y_{\text{input}} + \epsilon(y_{\text{input}}, M)$$
where $M$ is the 40-bit message. The encoder is optimized to keep the Signal-to-Distortion Ratio (SDR) high ($\ge 20$ dB), satisfying strict human hearing thresholds:
$$\text{SDR} = 10 \log_{10} \left( \frac{\sum y_{\text{input}}^2}{\sum (y_{\text{watermarked}} - y_{\text{input}})^2} \right)$$
* The **Decoder** reconstructs the 40-bit message from $y_{\text{watermarked}}$ even if the signal has undergone channel distortions (clipping, compression, noise).

### 2. Message Encoding & Hash Prefixing
SilentCipher has a native capacity of 40 bits, represented as 5 bytes (unsigned 8-bit integers: `0-255` each). 
* To encode a 32-byte transaction/registration hash, ORBIT truncates it to its first 5 bytes:
$$\text{Message} = \text{Hash}[0 \dots 4]$$
* On extraction, the extracted 5-byte buffer is compared with the prefix of the expected 32-byte registration hash:
$$\text{isMatch} = (\text{Extracted Hash}[0 \dots 4] \equiv \text{Expected Hash}[0 \dots 4])$$
This prefix matching mechanism allows fast lookups in the ledger while maintaining a collision probability of only $1$ in $1.09$ trillion.

---

## 📦 Installation

### Node.js (NPM Package)
```bash
npm install @ohnrshyp/watermark
```

### Python (PyPI Package)
```bash
pip install orbit-watermark
```

### Python Isolation Setup
SilentCipher requires a specific old version of PyTorch. To avoid conflicts with your main machine learning environment, create an isolated virtual environment (`.venv-watermark/`):

```bash
# Create venv
python -m venv .venv-watermark
source .venv-watermark/bin/activate

# Install dependencies
pip install torch==2.0.0 silentcipher librosa soundfile numpy
```

Export the python path environment variable to point to this venv:
```bash
export ORBIT_SILENTCIPHER_PYTHON=/absolute/path/to/your/ORBIT/.venv-watermark/bin/python3
```

---

## 🛠️ API Reference

### `embed(input, payloadHash, [options])`
Embeds a 5-byte prefix of a 32-byte registration hash into an audio source.

* **Parameters**:
  * `input` (`Buffer` | `string`): Raw binary buffer or absolute path to the target audio.
  * `payloadHash` (`Buffer`): 32-byte registration hash buffer.
  * `options` (`Object`, optional):
    * `outputPath` (`string`): Path to save the watermarked file. If not provided, it writes to a temporary WAV file.
    * `verbose` (`boolean`): Enable diagnostic logging. Default is `false`.
* **Returns**: `Promise<Object>`:
  ```json
  {
    "success": true,
    "outputPath": "/tmp/orbit-sc-output.wav",
    "sdr": 28.51,
    "message": [161, 23, 192, 45, 99],
    "duration": 180.5,
    "processingTimeMs": 2400,
    "method": "silentcipher"
  }
  ```

### `extract(input, [options])`
Extracts the embedded watermark from an audio file.

* **Parameters**:
  * `input` (`Buffer` | `string`): Raw binary buffer or absolute path to the target audio.
  * `options` (`Object`, optional):
    * `phaseShiftDecoding` (`boolean`): Enable robust phase-shift decoding. Improves detection accuracy on cropped or time-stretched files. Default is `true`.
    * `verbose` (`boolean`): Enable diagnostics. Default is `false`.
* **Returns**: `Promise<Object>`:
  ```json
  {
    "success": true,
    "detected": true,
    "message": [161, 23, 192, 45, 99],
    "payloadHash": <Buffer a1 17 c0 2d 63>,
    "confidence": 0.9412,
    "duration": 180.5,
    "processingTimeMs": 1850,
    "method": "silentcipher"
  }
  ```

### `hashToMessage(payloadHash)`
Converts a 32-byte Buffer to a 5-element array of unsigned integers.
* **Returns**: `Array<number>`

### `messageToHash(message)`
Converts a 5-element array of unsigned integers back to a 5-byte Buffer.
* **Returns**: `Buffer`

### `hashMatches(extractedHash, expectedHash)`
Helper that returns `true` if `extractedHash` matches the first 5 bytes of `expectedHash`.
* **Returns**: `boolean`

### `checkPythonEnvironment()`
Verifies that the Python binary and dependencies are available and operational.
* **Returns**: `Promise<Object>`

---

## 💻 Code Examples

### Embedding and Verifying a Watermark
```javascript
const watermark = require('@ohnrshyp/watermark');
const fs = require('fs');

async function run() {
  const originalAudio = fs.readFileSync('input-track.wav');
  
  // A unique 32-byte registration hash from your ledger
  const registrationHash = Buffer.from('a117c02d63ef5a8b9c2d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', 'hex');

  try {
    // 1. Embed the watermark prefix
    const embedResult = await watermark.embed(originalAudio, registrationHash, {
      outputPath: 'watermarked-track.wav',
      verbose: true
    });

    console.log(`Watermark embedded successfully. SDR: ${embedResult.sdr} dB`);

    // 2. Read watermarked file back (e.g. simulating a download)
    const watermarkedAudio = fs.readFileSync('watermarked-track.wav');

    // 3. Extract the watermark
    const extractResult = await watermark.extract(watermarkedAudio, {
      verbose: true
    });

    if (extractResult.detected) {
      console.log('Watermark detected! Payload hash prefix:', extractResult.payloadHash.toString('hex'));
      
      // 4. Verify match against expected registration hash
      const isMatch = watermark.hashMatches(extractResult.payloadHash, registrationHash);
      console.log(`Payload match verification: ${isMatch}`);
    } else {
      console.log('No watermark detected in file.');
    }

  } catch (error) {
    console.error('Watermarking pipeline failed:', error.message);
  }
}

run();
```

---

## 📄 License

Licensed under the Apache License, Version 2.0 (the "License"). See [LICENSE](../../LICENSE) in the project root for details.