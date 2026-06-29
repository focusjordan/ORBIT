# ORBIT SDK

Welcome to the official JavaScript/Node.js SDK for **ORBIT**! 👋

The ORBIT SDK provides a simple, developer-friendly interface for platforms and digital service providers (DSPs) to interact with their ORBIT Enterprise Node. It abstracts away complex cryptography and API routing, allowing you to seamlessly register, watermark, and verify the provenance of audio assets.

## Installation

```bash
npm install @ohnrshyp/orbit-sdk
```

## Quick Start

Getting started with ORBIT is easy! To use the SDK, you'll need the API URL of your ORBIT node, your assigned Platform ID, and your Ed25519 private key for cryptographic signing.

### Initialization

When initializing the `OrbitClient`, the `privateKey` strictly requires a `Buffer` of exactly 64 bytes in length. The SDK handles all cryptographic signing automatically.

```javascript
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');
const fs = require('fs');

// Initialize your ORBIT client
const client = new OrbitClient({
  apiUrl: process.env.ORBIT_API_URL, 
  platformId: process.env.ORBIT_PLATFORM_ID,
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64'),
  // apiKey is optional for rate limiting/billing
  // apiKey: process.env.ORBIT_API_KEY
});
```

### Registering Audio

Registering an audio file embeds a robust, inaudible watermark and securely records the asset's provenance on the ORBIT network.

```javascript
const audioBuffer = fs.readFileSync('track.mp3');

// Register the audio and supply its metadata alongside the owner ID
const result = await client.register(audioBuffer, {
  title: 'Midnight Drive',
  artist: 'The Neon Collective'
}, 'user-uuid-here');

// The resulting object includes your newly watermarked audio
fs.writeFileSync('track-watermarked.mp3', result.watermarked_audio);
console.log(`✅ Registered! ID: ${result.registration_id}`);
```

### Verifying Audio

You can easily check if an audio file belongs to the ORBIT network by passing it to the `verify` method. ORBIT seamlessly extracts the watermark and fingerprint to return its full provenance history.

```javascript
const unknownAudio = fs.readFileSync('unknown-track.mp3');
const result = await client.verify(unknownAudio);

if (result.verified) {
  console.log(`✅ Verified: ${result.metadata.title}`);
  console.log(`   Origin: ${result.origin.platform}`);
} else {
  console.log('❌ Not registered in ORBIT');
}
```

## Additional Capabilities

Beyond basic registration and verification, the SDK empowers you to do much more:

* **B2B Transfers**: Securely transfer custody of audio assets between different platforms (`transfer`, `acceptTransfer`) while maintaining an unbroken cryptographic chain of provenance.
* **AI Similarity**: Find similar-sounding tracks in the ORBIT network using AI-powered audio embeddings (`similar`), ideal for identifying covers or pitch-shifted versions.
* **Audio Analysis**: Run an AI-powered analysis of an audio file (`analyze`) to detect genre, mood, BPM, key, instruments, and vocals—without registering it.
* **Watermark Matching**: Quickly and efficiently confirm the presence of an ORBIT watermark (`watermarkmatch`) without performing a full fingerprint scan.
* **Provenance Chain Retrieval**: Retrieve the complete custody chain for an audio file, including all registrations, transfers, and Merkle proofs (`getChain`).
* **Platform Management**: Easily manage your platform integration, including listing registrations and pending inbound transfers (`listRegistrations`, `listPendingTransfers`).

## Support & Documentation

For complete documentation, issue tracking, and community support, please visit our main repository:

* **ORBIT Main Repository**: [https://github.com/focusjordan/ORBIT](https://github.com/focusjordan/ORBIT)

## License

Apache 2.0
