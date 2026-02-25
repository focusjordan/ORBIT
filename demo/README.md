# ORBIT Demo

Demo package for presenting the ORBIT audio provenance protocol. Includes a web UI and a terminal-based backup script.

## Quick Start (Web UI)

```bash
cd demo
cp .env.example .env        # then fill in your credentials
npm install
node server.js
```

Open **http://localhost:3000** in the browser.

The `.env` file is loaded automatically. It needs three values:

```
ORBIT_API_URL=https://orbit.ohnrshyp.com
ORBIT_PLATFORM_ID=your-platform-id
ORBIT_PRIVATE_KEY=your-base64-private-key
ORBIT_API_KEY=your-api-key                   # optional
```

The same env vars are picked up by the CLI (`run-demo.sh`), so one `.env` file covers both.

## What Each Tab Does

| Tab | What happens |
|-----|-------------|
| **Register** | Upload an audio file with title/artist. ORBIT fingerprints it, embeds a watermark, runs AI genre/mood/BPM analysis, checks it against ~30M known recordings via AcoustID, and runs AI-generated content detection. Returns a watermarked file for download. |
| **Verify** | Upload any audio file. ORBIT checks its fingerprint and watermark against the ledger and returns full provenance: origin platform, timestamp, signature validity, metadata, and AI detection results. |
| **Analyze** | Upload audio for standalone AI analysis. Returns genre and mood predictions with confidence scores, BPM, musical key, detected instruments, and vocal detection. |

## Terminal Demo (Backup)

If the web UI has any issues, use the terminal script:

```bash
./run-demo.sh ~/path/to/audio.wav https://orbit.ohnrshyp.com
```

Hit Enter to advance each step. Zero typing required.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Server unreachable" in UI | Check `ORBIT_API_URL` is correct and the EC2 instance is running. Try `curl $ORBIT_API_URL/health`. |
| "Failed to initialize ORBIT client" on startup | One of `ORBIT_API_URL`, `ORBIT_PLATFORM_ID`, or `ORBIT_PRIVATE_KEY` is missing. |
| Registration takes 10-15s | Normal — the server is running fingerprinting, watermarking, and GPU-accelerated AI analysis. The UI shows a loading state. |
| "Authentication failed" errors | Verify `ORBIT_PLATFORM_ID` and `ORBIT_PRIVATE_KEY` match a registered platform on the server. Run `orbit whoami` from the CLI to test. |
| Port 3000 already in use | Set `DEMO_PORT=3001 node server.js` |

## File Structure

```
demo/
  server.js              Express proxy server (SDK → EC2 API)
  package.json           Dependencies
  public/
    index.html           Single-file web UI (no build step)
  sample-release.xml     DDEX ERN 4.x sample for ingest demo
  run-demo.sh            Terminal demo script (backup plan)
```
