# ORBIT Generic Integration

Platform-agnostic ORBIT middleware that works with any music platform architecture.

## Overview

This directory contains a **generic template** for integrating ORBIT into any platform. The implementation uses an **adapter pattern** that lets you customize how audio is accessed and metadata is mapped.

## Quick Start

### 1. Choose Your Adapter Pattern

#### Pattern A: Memory Upload (Simple)

```javascript
const { MemoryUploadAdapter, createOrbitDuplicateCheck } = require('./orbit-middleware-generic');

const adapter = new MemoryUploadAdapter();
const orbitMiddleware = createOrbitDuplicateCheck(adapter);

router.post('/upload',
  auth,
  upload.single('audio'),    // multer memoryStorage
  orbitMiddleware,           // ORBIT duplicate check
  createTrackHandler
);
```

**Use when:**
- Audio is uploaded to backend memory first
- Using multer with `memoryStorage()`
- Files are small-medium size (<50MB)

#### Pattern B: S3 Streaming (Scalable)

```javascript
const { S3StreamingAdapter, createOrbitDuplicateCheck } = require('./orbit-middleware-generic');
const { s3Client } = require('./config/s3');

const adapter = new S3StreamingAdapter(s3Client);
const orbitMiddleware = createOrbitDuplicateCheck(adapter);

router.post('/upload',
  auth,
  uploadToS3,                // multer-s3 streaming
  orbitMiddleware,           // ORBIT duplicate check
  createTrackHandler
);
```

**Use when:**
- Audio streams directly to S3 (like Ohnrshyp)
- Using multer-s3
- Large files (>50MB)
- Want to minimize memory usage

### 2. Configure Environment

```env
ORBIT_API_URL=https://orbit.your-domain.com
ORBIT_PLATFORM_ID=your-platform-id
ORBIT_PRIVATE_KEY=base64_encoded_private_key
ORBIT_API_KEY=optional_api_key
```

### 3. Install Dependencies

```bash
npm install @ohnrshyp/orbit-sdk music-metadata
# If using S3:
npm install @aws-sdk/client-s3
```

## Custom Adapter

Create your own adapter for your specific architecture:

```javascript
const { PlatformAdapter, createOrbitDuplicateCheck } = require('./orbit-middleware-generic');

class MyPlatformAdapter extends PlatformAdapter {
  /**
   * Get audio buffer from your storage
   */
  async getAudioBuffer(req) {
    // Example: Fetch from your CDN
    const audioUrl = req.body.audioUrl;
    const response = await fetch(audioUrl);
    return Buffer.from(await response.arrayBuffer());
    
    // Example: Read from disk
    // return fs.readFileSync(req.file.path);
    
    // Example: Get from database
    // const record = await AudioFile.findById(req.body.audioId);
    // return record.data;
  }
  
  /**
   * Map your platform's metadata to ORBIT schema
   */
  mapMetadata(req, technicalMetadata) {
    return {
      // Required fields
      title: req.body.trackName,        // Your field names
      artist: req.user.name,            // Your user structure
      duration_ms: technicalMetadata.duration_ms,
      
      // Optional fields (adjust to what you collect)
      isrc: req.body.isrcCode || null,
      upc: req.body.barcode || null,
      primary_genre: req.body.mainGenre,
      p_line: req.body.soundCopyright,
      c_line: req.body.compCopyright,
      
      // Technical (auto-extracted)
      bitrate: technicalMetadata.bitrate,
      sample_rate: technicalMetadata.sample_rate,
      channels: technicalMetadata.channels,
      format: technicalMetadata.format
    };
  }
}

// Use your adapter
const adapter = new MyPlatformAdapter();
const orbitMiddleware = createOrbitDuplicateCheck(adapter);
```

## Metadata Mapping

ORBIT has a flexible schema. Map what you have, leave the rest null:

### Required (must provide)
```javascript
{
  title: string,
  artist: string,
  duration_ms: number
}
```

### Recommended (if available)
```javascript
{
  isrc: string,
  upc: string,
  primary_genre: string,
  p_line: string,  // ℗ Sound recording copyright
  c_line: string   // © Composition copyright
}
```

### Technical (auto-extracted from audio)
```javascript
{
  bitrate: number,
  sample_rate: number,
  channels: number,
  format: string
}
```

### Optional (nice to have)
```javascript
{
  album_title: string,
  track_number: number,
  release_date: string,
  label: string,
  writers: string[],
  producers: string[],
  // ... many more fields supported
}
```

## Response Handling

### Success (New Audio)
```javascript
// Middleware calls next()
// req.orbit is populated:
{
  verified: false,
  fingerprint_hash: Buffer,
  metadata: {...},
  technical_metadata: {...},
  checked_at: "2025-12-10T...",
  duration_ms: 150
}
```

### Duplicate Detected (409)
```javascript
{
  success: false,
  error: 'DUPLICATE_AUDIO',
  message: 'This audio has already been registered in ORBIT',
  duplicate: {
    registration_id: 12345,
    title: "Original Track",
    artist: "Original Artist",
    origin: {
      platform: "other-platform",
      owner_id: "user-123",
      registered_at: "2024-11-15T..."
    },
    fingerprint_hash: "abc123...",
    watermark_detected: true,
    transfers: []
  }
}
```

### ORBIT Unavailable (Graceful)
```javascript
// Middleware logs warning and calls next()
// Upload proceeds normally
⚠️  ORBIT: Service unavailable, allowing upload
```

## Architecture Patterns

### Pattern 1: Pre-Upload Check
```
User → Upload → ORBIT Check → Create Record
                    ↓
              If duplicate: 409
```

Best for: Preventing duplicates before database writes

### Pattern 2: Post-Upload Check
```
User → Upload → Create Record → ORBIT Check (async)
                                    ↓
                              Flag for review
```

Best for: When you want all uploads to succeed

### Pattern 3: Hybrid
```
User → Upload → Quick ORBIT Check → Create Record → Full ORBIT Registration
                    ↓                                     ↓
              If duplicate: 409                    Update with ORBIT ID
```

Best for: Balance between UX and verification

## Error Handling

The middleware uses **graceful degradation**:

```javascript
try {
  await orbitClient.verify(audioBuffer);
} catch (error) {
  // Network timeout → Upload proceeds
  // ORBIT down → Upload proceeds
  // S3 error → Upload proceeds
  // Parse error → Upload proceeds
  
  // All errors logged for monitoring
  console.warn('ORBIT check failed, allowing upload');
  next();
}
```

**Why:** ORBIT adds value but shouldn't break your core upload flow.

## Testing

```javascript
// Test with real ORBIT server
const adapter = new MemoryUploadAdapter();
const middleware = createOrbitDuplicateCheck(adapter);

// Mock request
const req = {
  file: {
    buffer: fs.readFileSync('test-audio.mp3')
  },
  body: {
    title: 'Test Track',
    genre: 'Electronic'
  },
  user: {
    username: 'testuser'
  }
};

const res = {
  status: (code) => ({
    json: (data) => console.log(code, data)
  })
};

const next = () => console.log('Continued to next middleware');

await middleware(req, res, next);
```

## Platform Examples

See the `/examples` directory for specific integrations:

- **`/ohnrshyp/`** - S3 streaming upload pattern
- **`/generic/`** - This directory (template)
- **`/memory-upload/`** - Simple memory storage pattern
- **`/api-integration/`** - API-to-API B2B integration

## Support

- **ORBIT Docs:** See main repository README
- **SDK Docs:** `orbit/sdk/README.md`
- **API Spec:** `ORBIT_SPECIFICATION.md`
- **Issues:** Report to ORBIT team

## License

Example code provided as integration reference.
ORBIT SDK licensed under Apache 2.0.
