# ORBIT Integration for Ohnrshyp

This directory contains production-ready code for integrating ORBIT into Ohnrshyp's S3 streaming upload architecture.

## Architecture Overview

Ohnrshyp uses a **streaming upload pattern**:
1. Browser → multer-s3 → S3 (audio streams directly, never in Node memory)
2. fileSecurityValidation downloads from S3 for validation
3. **ORBIT middleware downloads from S3 for fingerprinting** ← New
4. contentModerationMiddleware
5. Track document created

## Integration Overview

This integration provides two key features:

### Duplicate Detection (`orbitDuplicateCheck`)
- Downloads audio from S3 (same pattern as fileSecurityValidation)
- Extracts technical metadata (duration, bitrate, etc.)
- Calls ORBIT verify endpoint
- Returns 409 if duplicate, continues if new
- Graceful degradation if ORBIT unavailable

### Auto-Registration (`registerWithOrbit`)
- Runs after Track document is created
- Registers track with ORBIT
- Updates Track.orbit with registration data
- Non-blocking (response sent before registration)
- Graceful error handling (upload succeeds even if ORBIT fails)
- Reuses metadata from duplicate check when available
- Logs all actions for debugging

## Files

### Production Implementation

- **`orbit-middleware-ohnrshyp.js`** ← **USE THIS** for production
  - Implements S3 download pattern (matches Ohnrshyp architecture)
  - Extracts technical metadata with music-metadata
  - Maps Ohnrshyp fields → ORBIT schema
  - Returns 409 for duplicates
  - Graceful error handling

### Reference/Documentation

- **`orbit.middleware.js`** - Original prototype (deprecated, kept for reference)
- **`track.model.extension.js`** - Track schema additions
- **`routes.example.js`** - Integration patterns
- **`env-template.txt`** - Environment variables
- **`README.md`** - This file
- **`INTEGRATION_QUESTIONNAIRE.md`** - Technical Q&A used to build this
- **`QUICK_QUESTIONS.md`** - Simplified questionnaire
- **`SESSION_16_SUMMARY.md`** - Implementation summary

## Setup

### 1. Install Dependencies

```bash
npm install @ohnrshyp/orbit-sdk music-metadata
```

**New dependencies:**
- `music-metadata` - Extracts audio technical metadata (duration, bitrate, etc.)

### 2. Configure Environment Variables

Add to your `.env` file:

```env
# ORBIT Configuration
ORBIT_API_URL=https://orbit.ohnrshyp.com
ORBIT_PLATFORM_ID=ohnrshyp
ORBIT_PRIVATE_KEY=your_base64_encoded_private_key
ORBIT_API_KEY=your_api_key
```

**Getting Credentials:**

Contact ORBIT admin to register Ohnrshyp as a platform. You'll receive:
- Platform ID (e.g., "ohnrshyp")
- Ed25519 private key (base64-encoded)
- API key for rate limiting/billing

### 3. Update Track Model

Add ORBIT fields to your Track schema (see `track.model.extension.js`):

```javascript
// In models/Track.js
const trackSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // Add ORBIT integration
  orbit: {
    registration_id: { type: Number, index: true, sparse: true },
    fingerprint_hash: { type: Buffer, index: true, sparse: true },
    watermark_hash: { type: Buffer },
    entry_hash: { type: Buffer },
    registered_at: { type: Date },
    transfers: [/* ... */],
    auto_register: { type: Boolean, default: true },
    last_verified: { type: Date }
  }
});

// Add indexes
trackSchema.index({ 'orbit.registration_id': 1 });
trackSchema.index({ 'orbit.fingerprint_hash': 1 });
```

### 4. Integrate into Upload Route

In `routes/music.routes.js`:

```javascript
const { orbitDuplicateCheck } = require('../path/to/orbit-middleware-ohnrshyp');

const { orbitDuplicateCheck, registerWithOrbit } = require('./orbit-middleware-ohnrshyp');

router.post('/',
  auth,
  isMusician,
  uploadToS3,                    // Existing: Streams to S3
  fileSecurityValidation,        // Existing: Downloads & validates
  orbitDuplicateCheck,           // Session 16: Downloads, fingerprints, checks duplicates
  contentModerationMiddleware,   // Existing
  async (req, res, next) => {
    // Create Track document
    const track = await Track.create({
      title: req.body.title,
      artist: req.user._id,
      audioUrl: req.files.audio[0].location,
      // ... other fields ...
      
      // ORBIT subdocument (populated by registerWithOrbit)
      orbit: {
        registration_id: null,
        fingerprint_hash: null,
        registered_at: null,
        auto_register: true  // Enable auto-registration
      }
    });
    
    // ⭐ CRITICAL: Attach track for next middleware
    req.track = track;
    
    // Send response immediately (don't wait for ORBIT)
    res.json({ success: true, track });
    
    // Continue to next middleware
    next();
  },
  registerWithOrbit              // Session 17: Auto-register with ORBIT (non-blocking)
);
```

**Important:** Make sure `req.app.locals.s3Client` or `global.s3Client` is available, or adjust the middleware to import your S3 client.

## Usage Patterns

### Pattern 1: Upload with Duplicate Prevention

**Recommended for:** Primary upload endpoint

```javascript
router.post('/api/tracks',
  auth,
  artistOnly,
  upload.single('audio'),
  checkDuplicate,              // Returns 409 if duplicate
  async (req, res, next) => {
    const track = await Track.create({...});
    req.track = track;
    res.json({ success: true, track });
    next();
  },
  registerWithOrbit            // Auto-register in background
);
```

**User Experience:**
- ✅ Upload new track → Succeeds, auto-registered with ORBIT
- 🚫 Upload duplicate → Returns 409 with original registration details
- ⚠️ ORBIT down → Upload succeeds anyway (graceful degradation)

### Pattern 2: Dedicated Verification

**Recommended for:** Pre-upload checks, admin tools

```javascript
router.post('/api/orbit/verify',
  auth,
  upload.single('audio'),
  verifyAudio
);
```

**Use Cases:**
- Artist wants to check if audio is registered before uploading
- Admin investigating copyright claims
- Checking received audio from partners

### Pattern 3: Manual Registration

**Recommended for:** Existing tracks, re-registration

```javascript
router.post('/api/tracks/:trackId/orbit/register',
  auth,
  artistOnly,
  manualRegistrationHandler
);
```

**Use Cases:**
- Registering tracks uploaded before ORBIT integration
- Re-registering after failed auto-registration
- Artist explicitly requests ORBIT registration

## Error Handling

### Duplicate Detected (409)

```json
{
  "success": false,
  "error": "DUPLICATE_AUDIO",
  "message": "This audio has already been registered in ORBIT",
  "duplicate": {
    "registration_id": 12345,
    "title": "Original Track",
    "artist": "Original Artist",
    "origin": {
      "platform": "ohnrshyp",
      "owner_id": "user-abc-123",
      "registered_at": "2024-12-08T12:00:00Z"
    },
    "fingerprint_hash": "abc123...",
    "watermark_detected": true
  }
}
```

### ORBIT Unavailable

When ORBIT service is down:
- ✅ Upload proceeds normally
- ⚠️ Warning logged: "ORBIT: Service unavailable, allowing upload to proceed"
- 📝 Auto-registration can be retried later via manual registration endpoint

### Network Timeout

- Default timeout: 30 seconds (configured in SDK)
- Graceful fallback: Upload continues
- Consider: Background job to retry registration

## Testing

### Test Duplicate Detection

1. Upload a track normally
2. Try to upload the same audio file again
3. Should receive 409 with duplicate details

### Test Graceful Degradation

1. Stop ORBIT service: `docker-compose down` (in ORBIT repo)
2. Upload a track to Ohnrshyp
3. Should succeed with warning in logs
4. Restart ORBIT: `docker-compose up -d`
5. Use manual registration endpoint to register the track

### Test Verification Endpoint

```bash
curl -X POST http://localhost:3000/api/orbit/verify \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "audio=@test-track.mp3"
```

## Monitoring

### Recommended Logs

- **Duplicate detected:** Track upload attempts that were rejected
- **ORBIT unavailable:** Failed ORBIT calls during uploads
- **Registration failures:** Auto-registration errors
- **Verification requests:** Usage of verification endpoint

### Metrics to Track

- Duplicate detection rate (% of uploads rejected)
- ORBIT availability (% of successful calls)
- Auto-registration success rate
- Average verification time

## Migration Strategy

### For Existing Tracks

You have three options:

1. **Background Job:** Register all existing tracks with ORBIT
   ```javascript
   // scripts/orbit-migration.js
   const tracks = await Track.find({ 'orbit.registration_id': null });
   for (const track of tracks) {
     // Register with ORBIT
     // Update track.orbit
   }
   ```

2. **On-Demand:** Register when track is accessed
   ```javascript
   // In track GET handler
   if (!track.orbit?.registration_id && shouldRegister) {
     // Trigger background registration
   }
   ```

3. **Manual:** Let artists register via UI
   ```javascript
   // UI button: "Register with ORBIT"
   // Calls POST /api/tracks/:id/orbit/register
   ```

## Security Considerations

1. **Private Key Storage:**
   - Never commit ORBIT_PRIVATE_KEY to git
   - Use environment variables or secrets manager
   - Rotate keys periodically

2. **Rate Limiting:**
   - ORBIT API has rate limits per platform tier
   - Implement client-side throttling for batch operations
   - Use ORBIT_API_KEY for billing/tracking

3. **Access Control:**
   - Only track owners can register their tracks
   - Admins can verify any track
   - ORBIT verification endpoint requires authentication

## Support

- **ORBIT Documentation:** See main ORBIT repository
- **SDK Documentation:** `orbit/sdk/README.md`
- **Issues:** Report integration issues to ORBIT team
- **Platform Status:** Check ORBIT service health at `/health`

## Future Enhancements

- Transfer tracks to partner DSPs via ORBIT protocol
- V2 ML features (neural fingerprinting, genre detection, similarity search)
- Admin dashboard for ORBIT registration status
- Watermarked audio storage back to S3

## License

Integration code follows Ohnrshyp's license.
ORBIT SDK is licensed under Apache 2.0.
