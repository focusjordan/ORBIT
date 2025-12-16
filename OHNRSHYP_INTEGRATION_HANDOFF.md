# ORBIT + Ohnrshyp Integration Handoff

## Context

**ORBIT** (Origin-Based Identity & Rights Transfer Protocol) is an audio provenance system built to:
- Register audio with cryptographic proof of ownership
- Embed invisible watermarks containing the ownership chain
- Detect duplicates before upload
- Extract AI metadata (genre, mood, BPM, key)
- Enable B2B rights transfer between platforms

**Ohnrshyp** is a music platform that will integrate ORBIT for:
- Automatic registration of uploaded tracks
- Duplicate detection before upload
- AI-powered metadata population
- Provenance display on track pages

---

## Prerequisites Before Integration

### ⚠️ ORBIT Must Be Deployed First

Ohnrshyp cannot integrate with ORBIT until ORBIT is running in production.

**Deployment Target**: AWS EC2 with GPU (for SilentCipher neural watermarking)
- Instance type: `g4dn.xlarge` or similar (NVIDIA GPU required)
- Recommended endpoint: `api.orbit.ohnrshyp.com`

**Deployment involves:**
1. Set up EC2 instance with GPU
2. Install Python 3.10+ with CUDA support
3. Deploy ORBIT Node.js server
4. Set up PostgreSQL with pgvector extension
5. Configure SSL/domain
6. Run health checks

**If ORBIT is not yet deployed**, that must happen first. See `DEPLOYMENT_HANDOFF.md` in the ORBIT repo.

---

## Part 1: ORBIT SDK Installation

### 1.1 Install SDK

The SDK is published to GitHub Packages (private):

```bash
# In Ohnrshyp project
npm install @ohnrshyp/orbit-sdk
```

If not yet published, install from local path or git:
```bash
npm install ../ORBIT/sdk
# or
npm install git+https://github.com/yourusername/ORBIT.git#main
```

### 1.2 Environment Variables

Add to Ohnrshyp's `.env`:

```env
# ORBIT Configuration
ORBIT_API_URL=https://api.orbit.ohnrshyp.com  # Production ORBIT endpoint
ORBIT_PLATFORM_ID=ohnrshyp                     # Your platform ID in ORBIT
ORBIT_PRIVATE_KEY=<base64-ed25519-key>         # For signing registrations
ORBIT_PUBLIC_KEY=<base64-ed25519-key>          # For verification
```

---

## Part 2: Middleware Integration

### 2.1 Create ORBIT Service

Create `lib/orbit.js` (or wherever services live):

```javascript
const { OrbitClient } = require('@ohnrshyp/orbit-sdk');

let orbitClient = null;

function getOrbitClient() {
  if (!orbitClient) {
    orbitClient = new OrbitClient({
      baseUrl: process.env.ORBIT_API_URL,
      platformId: process.env.ORBIT_PLATFORM_ID,
      privateKey: process.env.ORBIT_PRIVATE_KEY,
    });
  }
  return orbitClient;
}

module.exports = { getOrbitClient };
```

### 2.2 Duplicate Check Middleware

Add BEFORE file upload is saved:

```javascript
const { getOrbitClient } = require('../lib/orbit');

async function checkDuplicate(req, res, next) {
  try {
    const orbit = getOrbitClient();
    const audioBuffer = req.file.buffer;
    
    // Check if audio already registered
    const result = await orbit.verify(audioBuffer);
    
    if (result.exists && result.registration) {
      // Audio already registered by someone
      return res.status(409).json({
        error: 'duplicate_detected',
        message: 'This audio is already registered',
        original_registration: {
          id: result.registration.id,
          registered_at: result.registration.created_at,
          platform: result.registration.platform_id,
        }
      });
    }
    
    next();
  } catch (error) {
    console.error('ORBIT duplicate check failed:', error);
    // Fail open - allow upload if ORBIT is down
    next();
  }
}
```

### 2.3 Auto-Registration Middleware

Add AFTER file upload is saved:

```javascript
async function registerWithOrbit(req, res, next) {
  try {
    const orbit = getOrbitClient();
    const track = req.savedTrack; // Assuming track was saved
    const audioPath = track.audioPath;
    
    // Read audio file
    const audioBuffer = fs.readFileSync(audioPath);
    
    // Build metadata
    const metadata = {
      title: track.title,
      artist: track.artist || req.user.displayName,
      isrc: track.isrc || undefined,
      iswc: track.iswc || undefined,
      rights_holder: {
        name: req.user.displayName,
        email: req.user.email,
      },
    };
    
    // Register with ORBIT
    const result = await orbit.register(audioBuffer, metadata);
    
    // Save ORBIT data to track
    track.orbitId = result.registration_id;
    track.orbitFingerprint = result.fingerprint;
    track.aiMetadata = result.ai_metadata; // Genre, mood, BPM, key
    await track.save();
    
    // Replace audio file with watermarked version
    if (result.watermarked_audio) {
      fs.writeFileSync(audioPath, result.watermarked_audio);
    }
    
    next();
  } catch (error) {
    console.error('ORBIT registration failed:', error);
    // Fail open - track is saved even if ORBIT is down
    next();
  }
}
```

### 2.4 Wire Into Upload Route

```javascript
// routes/tracks.js or similar
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload',
  authenticate,
  upload.single('audio'),
  checkDuplicate,        // 1. Check for duplicates
  saveTrackToStorage,    // 2. Save audio file
  saveTrackToDatabase,   // 3. Create track record
  registerWithOrbit,     // 4. Register with ORBIT
  (req, res) => {
    res.json({ 
      success: true, 
      track: req.savedTrack,
      orbit: {
        registered: !!req.savedTrack.orbitId,
        ai_metadata: req.savedTrack.aiMetadata,
      }
    });
  }
);
```

---

## Part 3: Display Integration

### 3.1 Track Model Updates

Add ORBIT fields to your Track model:

```javascript
// Mongoose example
const TrackSchema = new Schema({
  // ... existing fields ...
  
  // ORBIT fields
  orbitId: { type: String, index: true },
  orbitFingerprint: { type: String },
  aiMetadata: {
    genre: [String],
    mood: [String],
    bpm: Number,
    key: String,
    instrument_tags: [String],
  },
  provenanceChain: [{
    platform: String,
    timestamp: Date,
    signature: String,
  }],
});
```

### 3.2 Track Detail Page

Show AI metadata and provenance:

```jsx
// React component example
function TrackDetails({ track }) {
  return (
    <div>
      <h1>{track.title}</h1>
      
      {/* AI-Extracted Metadata */}
      {track.aiMetadata && (
        <div className="ai-metadata">
          <h3>AI Analysis</h3>
          <p>Genre: {track.aiMetadata.genre?.join(', ')}</p>
          <p>Mood: {track.aiMetadata.mood?.join(', ')}</p>
          <p>BPM: {track.aiMetadata.bpm}</p>
          <p>Key: {track.aiMetadata.key}</p>
        </div>
      )}
      
      {/* Provenance Badge */}
      {track.orbitId && (
        <div className="provenance-badge">
          <span>✓ Verified by ORBIT Protocol</span>
          <small>Registered: {track.createdAt}</small>
        </div>
      )}
    </div>
  );
}
```

---

## Part 4: ORBIT Landing Page

### Option A: Subdomain (Recommended)
`orbit.ohnrshyp.com`

- Separate DNS record pointing to same server
- Clean separation of concerns
- Better for SEO if ORBIT becomes its own product

### Option B: Path
`ohnrshyp.com/orbit`

- Simpler setup (just add route)
- Benefits from Ohnrshyp's domain authority

### Landing Page Content

```
┌────────────────────────────────────────────────────────┐
│                    ORBIT Protocol                       │
│         Audio Provenance for the Modern Web             │
├────────────────────────────────────────────────────────┤
│                                                         │
│  • Cryptographic Proof of Ownership                    │
│  • Invisible Watermarking                              │
│  • AI-Powered Metadata                                 │
│  • B2B Rights Transfer                                 │
│                                                         │
│  [Get Started]  [Documentation]  [GitHub]              │
│                                                         │
├────────────────────────────────────────────────────────┤
│  Used by Ohnrshyp    |    Open Source    |    Free SDK  │
└────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

After integration, verify:

- [ ] Upload new track → appears in ORBIT registry
- [ ] Upload duplicate → blocked with clear error message
- [ ] Track page shows AI metadata (genre, mood, BPM, key)
- [ ] Track page shows provenance badge
- [ ] Audio file contains invisible watermark (verify via ORBIT API)
- [ ] If ORBIT is down, uploads still work (graceful degradation)

---

## Troubleshooting

### "Cannot connect to ORBIT"
→ Check `ORBIT_API_URL` is correct and ORBIT is deployed

### "Authentication failed"
→ Check `ORBIT_PLATFORM_ID` and keys match what's registered in ORBIT

### "Watermarking failed"
→ Audio might be too short (minimum ~11 seconds for spread spectrum)

### "AI metadata missing"
→ ML models might not be loaded. Check ORBIT server logs.

---

## Files to Modify in Ohnrshyp

1. `package.json` - Add SDK dependency
2. `.env` - Add ORBIT environment variables
3. `lib/orbit.js` - Create ORBIT service (new file)
4. `middleware/orbit.js` - Create middleware (new file)
5. `routes/tracks.js` - Wire middleware into upload
6. `models/Track.js` - Add ORBIT fields
7. Track detail component - Show AI metadata + provenance

---

## Order of Operations

1. **First**: Deploy ORBIT to AWS EC2 (GPU)
2. **Then**: Install SDK in Ohnrshyp
3. **Then**: Add middleware and model fields
4. **Then**: Test locally against production ORBIT
5. **Then**: Deploy Ohnrshyp changes
6. **Finally**: Create landing page

---

*Generated from ORBIT Session 27 - December 2024*

