# Ohnrshyp ↔ ORBIT Integration Handoff

## 🎯 Goal
Integrate ORBIT audio fingerprinting and watermarking into Ohnrshyp for:
- **Duplicate detection** on upload (prevent same track uploaded twice)
- **Provenance tracking** (who uploaded what, when)
- **Rights transfer** (when tracks change ownership)

---

## ✅ Prerequisites (Already Done)

- [x] ORBIT server deployed on AWS EC2
- [x] Ohnrshyp platform registered in ORBIT
- [x] Credentials generated

---

## 🔑 ORBIT Connection Details

**Before starting:** Start the EC2 instance and get the IP!

```
ORBIT API URL: http://<EC2-IP>:4000
Platform ID: ohnrshyp
```

### Credentials Location
SSH into EC2 and run:
```bash
cat /home/ubuntu/ORBIT/.ohnrshyp-credentials.json
```

This returns:
```json
{
  "platform_id": "ohnrshyp",
  "private_key": "<base64-encoded-ed25519-key>",
  "api_key": "<api-key>",
  ...
}
```

### Add to Ohnrshyp .env
```env
ORBIT_API_URL=http://<EC2-IP>:4000
ORBIT_PLATFORM_ID=ohnrshyp
ORBIT_PRIVATE_KEY=<private_key from credentials>
ORBIT_API_KEY=<api_key from credentials>
```

---

## 📦 Integration Options

### Option 1: Use the SDK (Recommended)
Copy the SDK from ORBIT repo:
```bash
cp -r /path/to/ORBIT/sdk /path/to/ohnrshyp/lib/orbit-sdk
```

Then in Ohnrshyp:
```javascript
const OrbitClient = require('./lib/orbit-sdk');

const orbit = new OrbitClient({
  apiUrl: process.env.ORBIT_API_URL,
  platformId: process.env.ORBIT_PLATFORM_ID,
  privateKey: process.env.ORBIT_PRIVATE_KEY,
  apiKey: process.env.ORBIT_API_KEY,
});
```

### Option 2: Use Pre-built Middleware
Copy from ORBIT examples:
```bash
cp /path/to/ORBIT/examples/ohnrshyp/orbit-middleware-ohnrshyp.js /path/to/ohnrshyp/middleware/
```

---

## 🔧 Integration Steps

### 1. Install Dependencies
```bash
npm install tweetnacl cbor
```

### 2. Add ORBIT to Track Upload Flow

**Before saving track:**
```javascript
// Check for duplicates
const duplicate = await orbit.verify(audioBuffer);
if (duplicate.verified && duplicate.registration) {
  return res.status(409).json({ 
    error: 'Duplicate track detected',
    original: duplicate.registration 
  });
}
```

**After saving track:**
```javascript
// Register with ORBIT
const registration = await orbit.register(audioBuffer, {
  title: track.title,
  artist: track.artist,
  // ... other metadata
});

// Save ORBIT data to track
track.orbit = {
  registrationId: registration.id,
  fingerprint: registration.fingerprint,
  registeredAt: registration.timestamp,
};
await track.save();
```

### 3. Update Track Model
Add to your Track schema:
```javascript
orbit: {
  registrationId: { type: Number },
  fingerprint: { type: String },
  watermarkHash: { type: String },
  registeredAt: { type: Date },
  verified: { type: Boolean, default: false },
}
```

---

## 🧪 Testing the Integration

### 1. Start ORBIT Server
```bash
# In AWS Console: Start instance
# Get IP, then SSH in:
ssh -i ~/Desktop/orbit-key.pem ubuntu@<IP>
pm2 status  # Should show 'orbit' as online
curl http://localhost:4000/health  # Should return ok
```

### 2. Test from Ohnrshyp
```javascript
// Quick test
const orbit = new OrbitClient({ /* config */ });
const health = await orbit.health();
console.log(health); // { status: 'ok', ... }
```

### 3. Test Upload Flow
1. Upload a track → Should register with ORBIT
2. Upload same track again → Should detect duplicate
3. Check track in DB → Should have `orbit` data

---

## 📁 Reference Files in ORBIT Repo

| File | Description |
|------|-------------|
| `sdk/index.js` | Full SDK implementation |
| `sdk/README.md` | SDK documentation |
| `examples/ohnrshyp/orbit-middleware-ohnrshyp.js` | Express middleware |
| `examples/ohnrshyp/track.model.extension.js` | MongoDB schema additions |
| `examples/ohnrshyp/routes.example.js` | Route integration examples |
| `examples/ohnrshyp/env-template.txt` | Environment variables |

---

## ⚠️ Important Notes

1. **EC2 IP Changes** unless Elastic IP is set up - check IP each time you start
2. **ORBIT must be running** for Ohnrshyp to connect
3. **Graceful degradation** - If ORBIT is down, uploads should still work (just without fingerprinting)
4. **Audio format** - ORBIT accepts MP3, WAV, FLAC (15+ seconds recommended)

---

## 🚀 Quick Start Commands

```bash
# 1. Start EC2 (in AWS Console or CLI)

# 2. SSH to verify ORBIT is running
ssh -i ~/Desktop/orbit-key.pem ubuntu@<IP>
pm2 status
curl http://localhost:4000/health
exit

# 3. Get credentials (if needed)
ssh -i ~/Desktop/orbit-key.pem ubuntu@<IP> "cat /home/ubuntu/ORBIT/.ohnrshyp-credentials.json"

# 4. Update Ohnrshyp .env with ORBIT_* variables

# 5. Start Ohnrshyp and test!
```

---

*Created: December 18, 2025*  
*ORBIT Server: EC2 i-083a415ff9e01864d*
