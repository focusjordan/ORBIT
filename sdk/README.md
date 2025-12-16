# ORBIT SDK

Official JavaScript/Node.js SDK for the ORBIT audio provenance protocol.

## Installation

```bash
npm install @ohnrshyp/orbit-sdk
```

Or for local development:

```bash
cd /path/to/orbit/sdk
npm link

# In your project
npm link @ohnrshyp/orbit-sdk
```

## Quick Start

```javascript
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');
const fs = require('fs');

// Initialize client
const client = new OrbitClient({
  apiUrl: 'https://orbit.ohnrshyp.com',
  platformId: 'your-platform-id',
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});

// Verify audio provenance
const audioBuffer = fs.readFileSync('track.mp3');
const result = await client.verify(audioBuffer);

if (result.verified) {
  console.log(`✅ Verified: ${result.metadata.title} by ${result.metadata.artist}`);
  console.log(`   Registered by: ${result.origin.platform}`);
  console.log(`   At: ${result.origin.timestamp}`);
} else {
  console.log('❌ Not registered in ORBIT');
}
```

## API Reference

### Constructor

```javascript
new OrbitClient(config)
```

**Parameters:**
- `config.apiUrl` (string) - Base URL of ORBIT API (e.g., `'https://orbit.ohnrshyp.com'`)
- `config.platformId` (string) - Your registered platform ID
- `config.privateKey` (Buffer) - Your Ed25519 private key (64 bytes)
- `config.apiKey` (string, optional) - Optional API key for rate limiting/billing

**Example:**
```javascript
const client = new OrbitClient({
  apiUrl: process.env.ORBIT_API_URL,
  platformId: process.env.ORBIT_PLATFORM_ID,
  privateKey: Buffer.from(process.env.ORBIT_PRIVATE_KEY, 'base64')
});
```

---

### `register(audioBuffer, metadata, ownerId)`

Register new audio with ORBIT, embedding watermark and recording provenance.

**Parameters:**
- `audioBuffer` (Buffer) - Binary audio data (MP3, WAV, FLAC, etc.)
- `metadata` (Object) - Audio metadata
  - `title` (string, required) - Track title
  - `artist` (string, required) - Artist name
  - `duration_ms` (number, required) - Duration in milliseconds
  - `isrc` (string) - International Standard Recording Code
  - `upc` (string) - Universal Product Code
  - `primary_genre` (string) - Primary genre
  - `album_title` (string) - Album/EP name
  - `p_line` (string) - ℗ Sound recording copyright
  - `c_line` (string) - © Composition copyright
  - [see full metadata schema in docs]
- `ownerId` (string) - UUID of the owner (user/artist ID from your system)

**Returns:** Promise<Object>
- `success` (boolean) - Whether registration succeeded
- `registration_id` (number) - Unique registration ID
- `fingerprint_hash` (Buffer) - 32-byte fingerprint hash
- `watermarked_audio` (Buffer) - Audio with embedded watermark
- `registered_at` (string) - ISO 8601 timestamp

**Example:**
```javascript
const audioBuffer = fs.readFileSync('track.mp3');

const result = await client.register(audioBuffer, {
  title: 'Midnight Drive',
  artist: 'The Neon Collective',
  duration_ms: 234567,
  isrc: 'USRC12345678',
  primary_genre: 'Electronic',
  album_title: 'Night Visions',
  p_line: '2024 Neon Records',
  c_line: '2024 Neon Publishing'
}, 'user-uuid-here');

// Store the watermarked audio
fs.writeFileSync('track-watermarked.mp3', result.watermarked_audio);

console.log(`✅ Registered as ID: ${result.registration_id}`);
```

---

### `verify(audioBuffer)`

Verify audio provenance by checking fingerprint and watermark.

**Parameters:**
- `audioBuffer` (Buffer) - Binary audio data to verify

**Returns:** Promise<Object>
- `verified` (boolean) - Whether audio is registered
- `fingerprint_hash` (Buffer) - Generated fingerprint
- `fingerprint_match` (Object) - Match details
  - `registration_id` (number) - ID of matching registration
  - `similarity` (number) - Match confidence (0-1)
- `watermark` (Object) - Watermark extraction result
  - `detected` (boolean) - Whether watermark was found
  - `valid` (boolean) - Whether watermark is valid
- `metadata` (Object) - Registered metadata
- `origin` (Object) - Origin information
  - `platform` (string) - Platform where registered
  - `timestamp` (string) - Registration timestamp
  - `signature_valid` (boolean) - Signature validity
- `transfers` (Array) - Transfer history
- `duplicate_of` (number|null) - Registration ID if duplicate

**Example:**
```javascript
const audioBuffer = fs.readFileSync('unknown-track.mp3');
const result = await client.verify(audioBuffer);

if (result.verified) {
  console.log(`✅ Verified: ${result.metadata.title}`);
  console.log(`   Origin: ${result.origin.platform}`);
  console.log(`   Registered: ${result.origin.timestamp}`);
  
  if (result.duplicate_of) {
    console.log(`⚠️  Duplicate of registration ${result.duplicate_of}`);
  }
} else {
  console.log('❌ Not registered in ORBIT');
}
```

---

### `transfer(registrationId, toPlatform)`

Initiate B2B transfer to another platform.

**Parameters:**
- `registrationId` (number) - ID of registration to transfer
- `toPlatform` (string) - Platform ID of recipient

**Returns:** Promise<Object>
- `success` (boolean) - Whether transfer was initiated
- `transfer_id` (number) - Unique transfer ID
- `status` (string) - Transfer status ('pending')
- `expires_at` (string) - ISO 8601 expiration timestamp
- `recipient_notified` (boolean) - Whether recipient was notified

**Example:**
```javascript
const result = await client.transfer(12345, 'partner-dsp');

console.log(`✅ Transfer initiated: ${result.transfer_id}`);
console.log(`   Status: ${result.status}`);
console.log(`   Expires: ${result.expires_at}`);
```

---

### `acceptTransfer(transferId)`

Accept an incoming transfer from another platform.

**Parameters:**
- `transferId` (number) - ID of pending transfer

**Returns:** Promise<Object>
- `success` (boolean) - Whether transfer was accepted
- `new_registration_id` (number) - Your new registration ID
- `watermarked_audio` (Buffer) - Re-watermarked audio
- `metadata` (Object) - Full metadata
- `full_chain` (Array) - Complete custody chain

**Example:**
```javascript
// After receiving notification of pending transfer
const result = await client.acceptTransfer(67890);

// Store the re-watermarked audio
fs.writeFileSync('received-track.mp3', result.watermarked_audio);

console.log(`✅ Transfer accepted`);
console.log(`   New registration: ${result.new_registration_id}`);
console.log(`   Chain length: ${result.full_chain.length}`);
```

---

### `getChain(fingerprintHash)`

Get complete custody chain for a fingerprint.

**Parameters:**
- `fingerprintHash` (Buffer|string) - Fingerprint hash (32 bytes as Buffer or 64-char hex string)

**Returns:** Promise<Object>
- `fingerprint_hash` (Buffer) - Fingerprint hash
- `registrations` (Array) - All registrations with this fingerprint
- `transfers` (Array) - All transfers
- `merkle_proof` (Object) - Merkle proof of inclusion

**Example:**
```javascript
// Using fingerprint hash from registration
const chain = await client.getChain(result.fingerprint_hash);

// Or using hex string
const chain = await client.getChain('a1b2c3d4e5f6...');

console.log(`${chain.registrations.length} registration(s)`);
console.log(`${chain.transfers.length} transfer(s)`);

// Display chain
chain.registrations.forEach((reg, i) => {
  console.log(`${i + 1}. ${reg.metadata.title} - ${reg.origin.platform}`);
});
```

## Error Handling

The SDK throws errors for invalid inputs and API failures:

```javascript
try {
  const result = await client.verify(audioBuffer);
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error(`Status: ${error.status}`);
  console.error(`Code: ${error.code}`);
  
  if (error.code === 'not_found') {
    console.log('Audio not registered in ORBIT');
  } else if (error.code === 'unauthorized') {
    console.log('Invalid platform credentials');
  }
}
```

## Environment Variables

Recommended `.env` setup:

```env
ORBIT_API_URL=https://orbit.ohnrshyp.com
ORBIT_PLATFORM_ID=your-platform-id
ORBIT_PRIVATE_KEY=base64-encoded-ed25519-private-key
ORBIT_API_KEY=optional-api-key
```

## Platform Registration

To use ORBIT, you need to register your platform and receive:
1. **Platform ID** - Your unique identifier
2. **Ed25519 Keypair** - For signing requests
3. **API Key** (optional) - For rate limiting/billing

Contact Ohnrshyp to register: hello@ohnrshyp.com

## Development

Running tests:

```bash
# Start ORBIT server
cd /path/to/orbit
npm run dev

# In another terminal
cd /path/to/orbit/sdk
npm test
```

## License

MIT

## Support

- **Issues**: https://github.com/ohnrshyp/orbit/issues
- **Email**: hello@ohnrshyp.com
- **Docs**: https://orbit.ohnrshyp.com/docs



