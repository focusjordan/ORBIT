# ORBIT Deployment & Integration Handoff

**Created**: December 15, 2025  
**Purpose**: Guide for deploying ORBIT to production and integrating with Ohnrshyp

---

## 📍 Current State Summary

### What's Built & Working
- ✅ **V1 API**: 5 endpoints (register, verify, transfer, accept, chain)
- ✅ **V2 ML Features**: CLAP, audio analysis, metadata extraction
- ✅ **SDK**: `@ohnrshyp/orbit-sdk` - ready to publish
- ✅ **Integration Docs**: Complete guides in `examples/ohnrshyp/`
- ✅ **Test Infrastructure**: Working (slow locally, will be fast with GPU)
- ✅ **GitHub Actions CI**: Created but untested

### What Requires GPU
- **SilentCipher (neural watermarking)** - Primary watermark method, crashes on Apple Silicon
- **ML inference** - Will be 3x faster with GPU

### What Works on CPU (Fallback)
- **Spread spectrum watermarking** - Works but louder, slower
- **All other features** - Fingerprinting, crypto, API, CLAP, etc.

---

## 🚀 Step 1: Deploy ORBIT to AWS EC2

### Recommended Instance
- **Instance Type**: `g4dn.xlarge` (cheapest GPU instance, ~$0.53/hour)
- **AMI**: Deep Learning AMI (Ubuntu) - comes with CUDA pre-installed
- **Storage**: 50GB gp3 (for ML models)
- **Security Group**: Open ports 4000 (ORBIT API), 22 (SSH)

### Deployment Commands

```bash
# 1. SSH into EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# 2. Clone ORBIT repo (private - use deploy key or token)
git clone https://github.com/your-username/orbit.git
cd orbit

# 3. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Install Chromaprint and FFmpeg
sudo apt-get update
sudo apt-get install -y libchromaprint-tools ffmpeg

# 5. Install Python venv for ML
sudo apt-get install -y python3-venv python3-pip
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements-ml.txt

# 6. Install Node dependencies
npm ci

# 7. Set up PostgreSQL (use RDS or local Docker)
docker run -d \
  --name orbit-postgres \
  -e POSTGRES_USER=orbit \
  -e POSTGRES_PASSWORD=secure-password \
  -e POSTGRES_DB=orbit \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 8. Configure environment
cp .env.example .env
# Edit .env with your settings:
# - DATABASE_URL=postgres://orbit:secure-password@localhost:5432/orbit
# - ORBIT_SECRET_KEY=generate-a-secure-random-key
# - ORBIT_WATERMARK_METHOD=neural  # Use neural on GPU!

# 9. Run migrations
npm run migrate

# 10. Seed Ohnrshyp platform
npm run seed:platform

# 11. Start server (use PM2 for production)
npm install -g pm2
pm2 start src/index.js --name orbit
pm2 save
pm2 startup
```

### Environment Variables for Production

```env
# Server
NODE_ENV=production
PORT=4000

# Database
DATABASE_URL=postgres://orbit:password@localhost:5432/orbit

# Security
ORBIT_SECRET_KEY=your-256-bit-secret-key

# Watermarking (use neural on GPU!)
ORBIT_WATERMARK_METHOD=neural

# Python venv for ML (auto-detected, but can override)
PYTHON_VENV_PATH=/home/ubuntu/orbit/.venv
```

### Verify Deployment

```bash
# Check health endpoint
curl http://localhost:4000/health

# Should return: {"status":"ok","version":"1.0.0"}

# Test with a sample audio file
curl -X POST http://localhost:4000/orbit/v1/verify \
  -H "Content-Type: application/cbor" \
  -H "X-ORBIT-Platform: test-platform" \
  --data-binary @tests/fixtures/test-audio.mp3
```

---

## 📦 Step 2: Publish SDK to GitHub Packages

### Prerequisites
- GitHub repo is private ✅
- You have admin access to the repo ✅

### Publishing Steps

```bash
# 1. Navigate to SDK directory
cd sdk

# 2. Update package.json for GitHub Packages
# Add this to sdk/package.json:
# "publishConfig": {
#   "registry": "https://npm.pkg.github.com"
# }

# 3. Authenticate with GitHub
npm login --registry=https://npm.pkg.github.com
# Username: your-github-username
# Password: your-personal-access-token (with write:packages scope)
# Email: your-email

# 4. Publish
npm publish
```

### Or: Use GitHub Actions for Auto-Publishing

Add this to `.github/workflows/publish-sdk.yml`:

```yaml
name: Publish SDK

on:
  push:
    tags:
      - 'sdk-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      packages: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'
      - run: cd sdk && npm ci && npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Installing the SDK in Ohnrshyp

```bash
# In Ohnrshyp project, create/update .npmrc:
echo "@ohnrshyp:registry=https://npm.pkg.github.com" >> .npmrc

# Install
npm install @ohnrshyp/orbit-sdk
```

---

## 🔗 Step 3: Integrate with Ohnrshyp

### What's Already Prepared

All integration code is in `examples/ohnrshyp/`:

| File | Purpose | Copy To |
|------|---------|---------|
| `orbit-middleware-ohnrshyp.js` | Production middleware | `middleware/orbit.middleware.js` |
| `track.model.extension.js` | MongoDB schema | Merge into `models/Track.js` |
| `routes.example.js` | Route patterns | Reference for `routes/music.routes.js` |
| `env-template.txt` | Env vars | Add to `.env` |

### Integration Steps for Next Agent

1. **Copy middleware**: `orbit-middleware-ohnrshyp.js` → Ohnrshyp's `middleware/` folder
2. **Update Track model**: Add `orbit` subdocument from `track.model.extension.js`
3. **Update upload route**: Add `orbitDuplicateCheck` and `registerWithOrbit` middleware
4. **Configure environment**: Add ORBIT env vars from `env-template.txt`
5. **Test**: Upload a track, verify duplicate detection works

### Required Environment Variables for Ohnrshyp

```env
# Add to Ohnrshyp .env
ORBIT_API_URL=http://your-ec2-ip:4000  # Or https://orbit.ohnrshyp.com with load balancer
ORBIT_PLATFORM_ID=ohnrshyp
ORBIT_PRIVATE_KEY=<base64-encoded-key-from-orbit-deployment>
ORBIT_API_KEY=<api-key-from-orbit-deployment>
```

### Getting Credentials

After deploying ORBIT:

```bash
# On EC2, run:
cd /home/ubuntu/orbit
cat .test-platform-credentials.json

# This contains:
# - platform_id
# - public_key
# - private_key (base64) ← This is ORBIT_PRIVATE_KEY
# - api_key ← This is ORBIT_API_KEY
```

---

## 🧪 Step 4: Testing the Integration

### Test Duplicate Detection

1. Start Ohnrshyp server
2. Upload a track via API or UI
3. Wait for ORBIT registration (check logs)
4. Try to upload the same audio file
5. Should get 409 error with duplicate details

### Test Graceful Degradation

1. Stop ORBIT server: `pm2 stop orbit`
2. Upload a track to Ohnrshyp
3. Should succeed with warning in logs
4. Start ORBIT: `pm2 start orbit`
5. Use manual registration endpoint

### Test Verification

```bash
curl -X POST http://localhost:3000/api/orbit/verify \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "audio=@test-track.mp3"
```

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐  │
│   │  Ohnrshyp   │────────▶│   ORBIT     │────────▶│ PostgreSQL  │  │
│   │  (App       │ HTTP/   │   API       │         │ (RDS or     │  │
│   │   Runner)   │ CBOR    │  (EC2+GPU)  │         │  local)     │  │
│   └─────────────┘         └─────────────┘         └─────────────┘  │
│         │                       │                                   │
│         │                       │                                   │
│         ▼                       ▼                                   │
│   ┌─────────────┐         ┌─────────────┐                          │
│   │    S3       │         │   ML        │                          │
│   │  (Audio     │         │  Models     │                          │
│   │   Storage)  │         │ (GPU Accel) │                          │
│   └─────────────┘         └─────────────┘                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Files Reference

### ORBIT Repository
- `src/index.js` - Main server
- `src/api/routes.js` - V1 API routes
- `src/api/v2/routes.js` - V2 API routes (similar, analyze)
- `src/engines/` - Fingerprint, watermark, crypto engines
- `src/ml/` - ML models (CLAP, audio-analysis, silentcipher)
- `sdk/index.js` - SDK implementation
- `sdk/README.md` - SDK documentation
- `examples/ohnrshyp/` - All integration code

### Core Documentation
- `ORBIT_SPECIFICATION.md` - Complete technical spec
- `ORBIT_ENHANCEMENTS.md` - V2 ML enhancements
- `ORBIT_ROADMAP.md` - Implementation roadmap

---

## ⚠️ Known Issues

### 1. Spread Spectrum Loudness
The spread spectrum watermark (CPU fallback) has audibility concerns at higher strengths. On GPU with SilentCipher (neural), this is not an issue.

### 2. Test Speed
Tests are slow locally (~25 minutes) due to watermarking. On GPU, this will be much faster.

### 3. Python Dual Venv
ORBIT uses a Python venv for ML (SilentCipher, audio analysis). The venv path is configurable via `PYTHON_VENV_PATH`.

---

## 📞 Support

- **ORBIT Docs**: This repo
- **SDK Issues**: `sdk/` directory
- **Integration Questions**: `examples/ohnrshyp/README.md`

---

## Next Steps Summary

1. **Deploy ORBIT to AWS EC2** with GPU (g4dn.xlarge)
2. **Publish SDK** to GitHub Packages
3. **Configure Ohnrshyp** with ORBIT credentials
4. **Copy integration middleware** from `examples/ohnrshyp/`
5. **Test** duplicate detection and registration
6. **Monitor** logs and ORBIT health

---

*This document provides everything needed for the next agent to deploy and integrate ORBIT.*



