# Testing the Register Endpoint

## Prerequisites

1. **Database Running**
   ```bash
   docker-compose up -d
   ```

2. **Run Migrations**
   ```bash
   npm run migrate
   ```

3. **Seed Test Platform**
   ```bash
   npm run seed:platform
   ```
   
   This will output a TEST_PLATFORM_PRIVATE_KEY. Copy it and export:
   ```bash
   export TEST_PLATFORM_PRIVATE_KEY="<paste-key-here>"
   ```

4. **Start the Server**
   ```bash
   npm run dev
   ```
   
   Leave this running in one terminal.

## Running the Test

In a second terminal:

```bash
npm run test:register
```

## Expected Output

```
🧪 Testing POST /orbit/v1/register

📁 Loading test audio...
   Loaded 123456 bytes

📦 Building registration request...
   Metadata: "Test Track" by Test Artist

🚀 Sending registration request...
   Response status: 200
   Request time: 2500ms

✅ Registration successful!

📋 Response:
   Registration ID: 1
   Fingerprint Hash: abc123...
   Watermark Hash: def456...
   Entry Hash: 789ghi...
   Registered At: 2025-12-09T...
   Processing Time: 2450ms
   Watermarked Audio: 98765 bytes (base64)

💾 Saving watermarked audio...
   Saved to: tests/fixtures/test-audio-watermarked.wav

🔄 Testing duplicate detection...
✅ Duplicate correctly detected!
   Original registration ID: 1
   Title: Test Track
   Artist: Test Artist

✨ All tests passed!

📊 Summary:
   ✅ Registration successful
   ✅ Watermark embedded
   ✅ Duplicate detection working
   ✅ Response structure valid
```

## What Gets Tested

1. ✅ **Audio Processing**: Decodes MP3 to samples
2. ✅ **Fingerprint Generation**: Creates Chromaprint hash
3. ✅ **CBOR Payload**: Encodes metadata to binary format
4. ✅ **Signature**: Signs payload with platform key
5. ✅ **Watermark Embedding**: Embeds payload into audio
6. ✅ **Database Storage**: Saves complete registration
7. ✅ **Duplicate Detection**: Prevents re-registration
8. ✅ **Response Format**: Returns all required fields

## Troubleshooting

### "TEST_PLATFORM_PRIVATE_KEY not set"
Run `npm run seed:platform` and export the key.

### "Connection refused"
Make sure the server is running (`npm run dev`).

### "Test audio not found"
The test audio should exist at `tests/fixtures/test-audio.mp3`. Check it's there.

### "FFmpeg conversion failed"
Install FFmpeg: `brew install ffmpeg`

### "Chromaprint not found"
Install Chromaprint: `brew install chromaprint`

## Next Steps

After the register endpoint is working, the next endpoint to implement is:
- **Session 12**: POST /orbit/v1/verify (verification endpoint)

