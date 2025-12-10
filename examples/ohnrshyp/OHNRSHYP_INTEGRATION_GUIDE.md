# ORBIT Integration Guide for Ohnrshyp

**Purpose**: Step-by-step instructions to integrate ORBIT duplicate detection into Ohnrshyp's upload flow.

**Session**: 16 (Duplicate Check) + 17 (Auto-Registration)

---

## Prerequisites

- ORBIT server running at `http://localhost:4000` (or deployed URL)
- ORBIT credentials (Platform ID, Private Key, API Key)
- Ohnrshyp codebase with existing upload flow

---

## Step 1: Install Dependencies

```bash
npm install music-metadata
```

**Why**: Extracts audio technical metadata (duration, bitrate, sample rate).

---

## Step 2: Copy Middleware File

From ORBIT repo, copy this file into your Ohnrshyp repo:

**Source**: `/path/to/ORBIT/examples/ohnrshyp/orbit-middleware-ohnrshyp.js`  
**Destination**: `middleware/orbit-duplicate-check.js`

Or copy the entire file contents and create a new file.

---

## Step 3: Configure Environment Variables

Add to `.env`:

```env
# ORBIT Configuration
ORBIT_API_URL=http://localhost:4000
ORBIT_PLATFORM_ID=ohnrshyp
ORBIT_PRIVATE_KEY=<your_base64_encoded_private_key>
ORBIT_API_KEY=<your_optional_api_key>
```

**Getting credentials**: Contact ORBIT admin or use test credentials from ORBIT repo.

---

## Step 4: Make S3 Client Available to Middleware

The middleware needs access to your S3 client to download audio.

### Option A: App Locals (Recommended)

In `server.js` (or wherever you initialize Express):

```javascript
const { s3Client } = require('./config/s3.config');

const app = express();

// Make S3 client available to all middleware
app.locals.s3Client = s3Client;
```

### Option B: Modify Middleware Import

In `middleware/orbit-duplicate-check.js`, add at the top:

```javascript
const { s3Client } = require('../config/s3.config');
```

Then change line ~140 from:
```javascript
const s3Client = req.app.locals.s3Client || global.s3Client;
```

To:
```javascript
// Use imported s3Client directly
```

---

## Step 5: Add ORBIT Field to Track Model

In `models/track.model.js`, add to your schema:

```javascript
// Add this to your Track schema
orbit: {
  registrationId: {
    type: Number,
    index: true
  },
  fingerprintHash: {
    type: Buffer
  },
  watermarkHash: {
    type: Buffer
  },
  registeredAt: {
    type: Date
  },
  transfers: [{
    toPlatform: String,
    transferId: Number,
    timestamp: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired']
    }
  }]
}
```

**Note**: This follows your existing pattern of subdocuments (s3Metadata, securityValidation, etc.).

---

## Step 6: Integrate into Upload Route

In `routes/music.routes.js`:

### 6.1: Import the Middleware

Add at the top of the file:

```javascript
const { orbitDuplicateCheck } = require('../middleware/orbit-duplicate-check');
```

### 6.2: Add to Route

Find your upload route (probably around line 33):

```javascript
router.post('/',
  auth,
  isMusician,
  uploadToS3,                    // Existing
  fileSecurityValidation,        // Existing
  orbitDuplicateCheck,           // ← NEW: Add this line
  contentModerationMiddleware,   // Existing
  async (req, res) => {
    // Your existing track creation code
  }
);
```

### 6.3: Add ORBIT Field to Track Creation

In the track creation handler (around line 270), add the orbit field:

```javascript
const track = new Track({
  title: req.body.title,
  artist: req.user._id,
  audioUrl: req.files.audio[0].location,
  // ... all your existing fields ...
  
  // NEW: Add ORBIT subdocument (will be populated in Session 17)
  orbit: {
    registrationId: null,
    fingerprintHash: null,
    watermarkHash: null,
    registeredAt: null,
    transfers: []
  }
});

await track.save();
```

---

## Step 7: Test Duplicate Detection

### 7.1: Start ORBIT Server

In the ORBIT repo:

```bash
npm start
```

Should start on `http://localhost:4000`

### 7.2: Start Ohnrshyp

In the Ohnrshyp repo:

```bash
npm start
```

### 7.3: Test Upload Flow

1. **Upload a new track** via Ohnrshyp frontend
   - Should succeed normally
   - Check logs for: `✅ ORBIT: New audio, proceeding with upload`

2. **Upload the SAME audio file again**
   - Should return 409 Conflict
   - Response should include duplicate details:

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
      "registered_at": "2025-12-10T..."
    }
  }
}
```

### 7.4: Test ORBIT Unavailable (Graceful Degradation)

1. Stop ORBIT server
2. Upload a track
3. Should succeed with warning in logs: `⚠️  ORBIT: Service unavailable, allowing upload to proceed`

---

## Step 8: Monitor and Verify

### Check Logs

Look for these log messages:

**Success**:
```
🔍 ORBIT: Checking for duplicates...
   ✅ Downloaded from S3 (5120 KB)
   ✅ Extracted metadata (duration: 180000ms)
   ✅ ORBIT verification complete (150ms)
   ✅ New audio, proceeding with upload
```

**Duplicate**:
```
🔍 ORBIT: Checking for duplicates...
   ✅ Downloaded from S3 (5120 KB)
   ✅ Extracted metadata (duration: 180000ms)
   ✅ ORBIT verification complete (150ms)
   🚫 DUPLICATE detected (registration 12345)
```

**ORBIT Down**:
```
🔍 ORBIT: Checking for duplicates...
⚠️  ORBIT: Duplicate check failed (30000ms): connect ECONNREFUSED
⚠️  ORBIT: Service unavailable, allowing upload to proceed
```

### Check Database

After successful upload, check Track document:

```javascript
{
  title: "Test Track",
  artist: ObjectId("..."),
  audioUrl: "https://...",
  orbit: {
    registrationId: null,     // Will be populated in Session 17
    fingerprintHash: null,    // Will be populated in Session 17
    registeredAt: null        // Will be populated in Session 17
  }
}
```

---

## Troubleshooting

### "S3 client not available"

**Cause**: Middleware can't access S3 client.

**Fix**: Make sure you completed Step 4. Check that `req.app.locals.s3Client` exists:

```javascript
// Temporary debug in your route:
console.log('S3 Client available:', !!req.app.locals.s3Client);
```

### "ORBIT: Not configured, skipping duplicate check"

**Cause**: Missing environment variables.

**Fix**: Check `.env` has:
- `ORBIT_API_URL`
- `ORBIT_PLATFORM_ID`
- `ORBIT_PRIVATE_KEY` (base64-encoded)

### Uploads Still Succeed on Duplicates

**Cause**: Middleware might not be in the right position or returning early.

**Fix**: Check that:
1. Middleware is imported correctly
2. Middleware is in route BEFORE track creation
3. Check logs to see if middleware is running

### Performance Issues

**Cause**: Downloading from S3 adds latency.

**Fix**: This is expected. Average time:
- S3 download: ~100-500ms (depends on file size)
- ORBIT verification: ~150ms
- Total added: ~200-700ms

**Note**: This matches the existing `fileSecurityValidation` pattern, so it's consistent with current architecture.

---

## Session 17: Auto-Registration (Next Step)

After Session 16 is working, Session 17 will add:

**What it does**: After Track is created, automatically register with ORBIT in the background.

**Where it goes**: Another middleware AFTER track creation:

```javascript
router.post('/',
  auth,
  isMusician,
  uploadToS3,
  fileSecurityValidation,
  orbitDuplicateCheck,           // Session 16
  contentModerationMiddleware,
  async (req, res) => {
    const track = await Track.create({...});
    req.track = track;
    res.json({ success: true, track });
    next();  // Continue to next middleware
  },
  registerWithOrbit              // ← Session 17 (to be added)
);
```

**What it will do**:
1. Download audio from S3 again (or reuse if cached)
2. Call ORBIT `register()` endpoint
3. Update `Track.orbit` with registration ID and fingerprint
4. Runs in background (user already got response)

---

## Summary Checklist

- [ ] Installed `music-metadata` package
- [ ] Copied `orbit-middleware-ohnrshyp.js` to `middleware/orbit-duplicate-check.js`
- [ ] Added ORBIT environment variables to `.env`
- [ ] Made S3 client available to middleware (app.locals or direct import)
- [ ] Added `orbit` subdocument to Track schema
- [ ] Imported middleware in `routes/music.routes.js`
- [ ] Added middleware to upload route (after fileSecurityValidation)
- [ ] Added `orbit` field to Track creation
- [ ] Started ORBIT server
- [ ] Tested upload flow (new track succeeds)
- [ ] Tested duplicate detection (same track returns 409)
- [ ] Tested graceful degradation (ORBIT down, upload still works)
- [ ] Checked logs for ORBIT messages
- [ ] Verified Track documents have `orbit` subdocument

---

## Need Help?

**ORBIT Documentation**: See `ORBIT_SPECIFICATION.md` in ORBIT repo  
**SDK Documentation**: See `sdk/README.md` in ORBIT repo  
**Middleware Source**: `examples/ohnrshyp/orbit-middleware-ohnrshyp.js`  
**S3 Setup**: See `examples/ohnrshyp/S3_CLIENT_SETUP.md` for alternative configurations

---

**Session 16 Integration Complete!** Ready for Session 17 when you are.
