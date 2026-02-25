# ORBIT Benchmark Handoff

**Date:** Feb 23, 2026
**Demo date:** Feb 26, 2026 (Thursday)
**Benchmark publish target:** Feb 25, 2026 (Wednesday)

---

## Context

We are building a benchmark suite for ORBIT (Origin-Based Identity & Rights Transfer Protocol) ahead of a live demo. The benchmarks must contain **zero hallucinated data** — every number must come from an actual command execution with real output.

## What Has Been Completed

### Environment Verified
- **ffmpeg 8.0.1** installed at `/opt/homebrew/bin/ffmpeg`
- **Node v22.16.0** installed at `/usr/local/bin/node`
- **CLI dependencies** installed at `cli/node_modules/`
- **Root dependencies** installed at `node_modules/`
- **EC2 instance** confirmed running at `100.28.223.14:4000`
  - Health endpoint responds: `{"status":"ok","service":"orbit","version":"1.0.0","environment":"production"}`
- **CLI connectivity** confirmed — `orbit status` returns OK, 5 endpoints, protocol version 1.0.0
- **demo/.env** updated to point at current IP `http://100.28.223.14:4000`

### Credentials (in demo/.env)
```
ORBIT_API_URL=http://100.28.223.14:4000
ORBIT_PLATFORM_ID=ohnrshyp
ORBIT_PRIVATE_KEY=lMsSM2LlgOhdQ/YAphw1+iypbvcyHeonPKjEdcfuPBBKmukOihCkMJuH2RWDthXwMPIGobI4artbeWotLYIdyA==
ORBIT_API_KEY=-xsa4UA9VAELJPPcl0YjGgI9-yLkJFDDZ_pa8hXAJ3Y
```

The CLI reads env vars directly. To run any CLI command:
```bash
cd /Users/jordankugler/Cursor/ORBIT
export ORBIT_API_URL=http://100.28.223.14:4000
export ORBIT_PLATFORM_ID=ohnrshyp
export ORBIT_PRIVATE_KEY="lMsSM2LlgOhdQ/YAphw1+iypbvcyHeonPKjEdcfuPBBKmukOihCkMJuH2RWDthXwMPIGobI4artbeWotLYIdyA=="
export ORBIT_API_KEY="-xsa4UA9VAELJPPcl0YjGgI9-yLkJFDDZ_pa8hXAJ3Y"
node cli/bin/orbit.js <command>
```

### Directory Created
- `benchmarks/audio/` exists and is empty (invalid downloads were cleaned up)

### What Failed
- **Attempted to download 5 real audio tracks from Internet Archive** — ALL URLs were hallucinated/guessed. Every download returned an HTML page, not audio. These were deleted.
- `yt-dlp` is NOT installed on the machine.
- **Decision:** All test audio will be generated locally via ffmpeg. No network downloads. This makes the corpus fully deterministic, reproducible, and immune to hallucinated URLs.

---

## What Needs To Be Done

### Step 1: Build the Test Audio Corpus (21 tracks)

The corpus consists of 1 real audio track and 20 ffmpeg-generated synthetic tracks. The synthetic tracks require zero network dependencies and are fully reproducible — anyone can regenerate the identical corpus from the commands below. All tracks stay under 2:30 to avoid the T4 GPU OOM limit.

**Real Track (1 track)**

| File | Duration | Size | Notes |
|------|----------|------|-------|
| `benchmarks/audio/shake_it_demo.wav` | 2:28 (148.15s) | 37 MB | Original track ("Shake It" demo, 2-8-26) provided by the author. Near the OOM ceiling — serves as a stress test for the watermarking pipeline. |

Source file: `2-8-26-Shake It-Demo.wav` (project root). Already copied to `benchmarks/audio/shake_it_demo.wav`.

**Synthetic Tracks (20 tracks, all ffmpeg-generated)**

**Group A: 5 Complex Synthetic Tracks (simulate real music characteristics, 60s-120s)**
```bash
# Harmonic chord with amplitude envelope (simulates strummed instrument)
ffmpeg -f lavfi -i "sine=frequency=220:duration=90" -f lavfi -i "sine=frequency=330:duration=90" -f lavfi -i "sine=frequency=440:duration=90" -f lavfi -i "sine=frequency=550:duration=90" -filter_complex "[0][1][2][3]amix=inputs=4,tremolo=f=3:d=0.4" -t 90 benchmarks/audio/complex_harmonic_90s.wav

# Layered frequency sweep with pink noise bed (simulates full-spectrum mix)
ffmpeg -f lavfi -i "sine=frequency=200:duration=120" -f lavfi -i "sine=frequency=800:duration=120" -f lavfi -i "anoisesrc=d=120:c=pink:a=0.03" -filter_complex "[1]tremolo=f=0.5:d=1[t1];[0][t1][2]amix=inputs=3" -t 120 benchmarks/audio/complex_fullmix_120s.wav

# Rhythmic pulse with tonal melody (simulates beat + melody)
ffmpeg -f lavfi -i "sine=frequency=80:duration=90" -f lavfi -i "sine=frequency=660:duration=90" -f lavfi -i "sine=frequency=440:duration=90" -filter_complex "[0]tremolo=f=4:d=1[t0];[1]tremolo=f=2:d=1[t1];[t0][t1][2]amix=inputs=3" -t 90 benchmarks/audio/complex_rhythm_90s.wav

# Polyphonic voices with detuning (simulates ensemble/chorus)
ffmpeg -f lavfi -i "sine=frequency=261:duration=60" -f lavfi -i "sine=frequency=263:duration=60" -f lavfi -i "sine=frequency=329:duration=60" -f lavfi -i "sine=frequency=391:duration=60" -f lavfi -i "anoisesrc=d=60:c=pink:a=0.01" -filter_complex "[0][1][2][3][4]amix=inputs=5" -t 60 benchmarks/audio/complex_chorus_60s.wav

# Dynamic range test — quiet-to-loud swell with harmonics
ffmpeg -f lavfi -i "sine=frequency=110:duration=120" -f lavfi -i "sine=frequency=220:duration=120" -f lavfi -i "sine=frequency=440:duration=120" -filter_complex "[0][1][2]amix=inputs=3,afade=t=in:st=0:d=60,afade=t=out:st=90:d=30" -t 120 benchmarks/audio/complex_swell_120s.wav
```

**Group B: 5 Moderate Synthetic Tracks (structured audio, 30s-120s)**
```bash
# Simple chord progression (A major triad)
ffmpeg -f lavfi -i "sine=frequency=440:duration=60" -f lavfi -i "sine=frequency=554:duration=60" -f lavfi -i "sine=frequency=659:duration=60" -filter_complex "[0][1][2]amix=inputs=3" -t 60 benchmarks/audio/synth_chords_60s.wav

# Drum-like pulses
ffmpeg -f lavfi -i "sine=frequency=100:duration=90" -filter_complex "[0]tremolo=f=4:d=1" -t 90 benchmarks/audio/synth_pulse_90s.wav

# Polyphonic + noise floor
ffmpeg -f lavfi -i "sine=frequency=261:duration=90" -f lavfi -i "sine=frequency=329:duration=90" -f lavfi -i "anoisesrc=d=90:a=0.02" -filter_complex "[0][1][2]amix=inputs=3" -t 90 benchmarks/audio/synth_poly_noise_90s.wav

# Bass + melody simulation
ffmpeg -f lavfi -i "sine=frequency=110:duration=120" -f lavfi -i "sine=frequency=880:duration=120" -f lavfi -i "sine=frequency=220:duration=120" -filter_complex "[2]tremolo=f=2:d=1[t2];[0][1][t2]amix=inputs=3" -t 120 benchmarks/audio/synth_full_120s.wav

# Quiet ambient pad
ffmpeg -f lavfi -i "anoisesrc=d=30:c=pink:a=0.01" -t 30 benchmarks/audio/synth_ambient_30s.wav
```

**Group C: 10 Simple Synthetic Tracks (sine waves, noise, edge cases)**
```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=15" benchmarks/audio/sine_440hz_15s.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=30" benchmarks/audio/sine_440hz_30s.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=60" benchmarks/audio/sine_440hz_60s.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=120" benchmarks/audio/sine_440hz_120s.wav
ffmpeg -f lavfi -i "anoisesrc=d=30:c=white:a=0.5" benchmarks/audio/noise_white_30s.wav
ffmpeg -f lavfi -i "anoisesrc=d=60:c=white:a=0.5" benchmarks/audio/noise_white_60s.wav
ffmpeg -f lavfi -i "sine=frequency=20:duration=30,afreqshift=shift=666" benchmarks/audio/sweep_30s.wav
ffmpeg -f lavfi -i "anullsrc=d=30" -t 30 benchmarks/audio/silence_30s.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=30" -af "volume=-40dB" benchmarks/audio/sine_quiet_30s.wav
ffmpeg -f lavfi -i "sine=frequency=440:duration=60" -f lavfi -i "sine=frequency=554:duration=60" -f lavfi -i "sine=frequency=659:duration=60" -filter_complex "[0][1][2]amix=inputs=3" -t 60 benchmarks/audio/chord_amaj_60s.wav
```

After generating, verify ALL files:
```bash
for f in benchmarks/audio/*.wav; do echo "$f"; ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1 "$f"; done
```

### Step 2: Warm Up the Server

The first request after server cold start is significantly slower due to model loading (SilentCipher, CLAP, AI detection). Run a throwaway cycle before collecting benchmark data:
```bash
node cli/bin/orbit.js register benchmarks/audio/sine_440hz_15s.wav --title "warmup" --artist "ORBIT Benchmark" --genre "Test" --json
node cli/bin/orbit.js verify benchmarks/audio/sine_440hz_15s.orbit.wav --json
```
Discard these results. Wait a few seconds, then proceed to Step 3.

### Step 3: Run Benchmark Suite

For each track, run these commands and capture `processing_time_ms` from the JSON output:

```bash
# Register (use --json flag for parseable output)
node cli/bin/orbit.js register <file> --title "<name>" --artist "ORBIT Benchmark" --genre "Test" --json

# Verify the watermarked file (created at <name>.orbit.wav by register)
node cli/bin/orbit.js verify <watermarked-file> --json

# Verify an unregistered file (fast path)
node cli/bin/orbit.js verify <different-unregistered-file> --json

# Analyze
node cli/bin/orbit.js analyze <file> --json
```

**Important notes:**
- The server-side `processing_time_ms` is in the response JSON for register and analyze
- The CLI `register` command does NOT display timing by default (only JSON mode returns it)
- For verify, the server returns `processing_time_ms` but the CLI drops it — use `--json`
- Registration takes ~10-15s per track. Budget ~60-90 minutes for all 21 tracks × 4 operations
- Run each timing-critical benchmark (register, verify-known, verify-unknown) at least 3 times for reliability
- Step 2 (warm-up) MUST be completed before collecting any benchmark data
- Tracks over 2:30 will OOM on the T4 GPU during SilentCipher watermarking

### Step 4: Write benchmarks.md

Create `/Users/jordankugler/Cursor/ORBIT/benchmarks.md` with:

1. **Methodology section** — instance type, GPU, what was tested, how many runs. Note that 20 of 21 tracks are synthetic (ffmpeg-generated) for reproducibility, plus 1 real audio track as a real-world reference point. Include the generation commands or link to this handoff doc
2. **Results table** — latency per operation per track, with p50 values
3. **Pipeline breakdown** — if the JSON responses include sub-timings (they do for catalog_check.processing_time_ms, ai_detection.processing_time_ms, embedding.processing_time_ms)
4. **Duration vs. latency** — chart-ready data showing how processing time scales with audio length
5. **Watermark integrity** — did register → verify roundtrip succeed for every track?
6. **Known limitations** — VRAM limit at ~2:30, first-request cold start time

---

## Architecture Reference (for context)

### What ORBIT Does
Audio provenance protocol: fingerprint + watermark + AI analysis + cryptographic signing + database ledger.

### Registration Pipeline (what happens during `orbit register`)
1. Validate input (audio + metadata)
2. Load audio, extract technical metadata (duration, sample rate, channels)
3. Embed watermark (SilentCipher neural → spread spectrum fallback) — **GPU**
4. Generate fingerprint from watermarked audio (Chromaprint/fpcalc) — **CPU**
5. Check for duplicates in database
6. Catalog check: AcoustID (~30M fingerprints) + MusicBrainz metadata corroboration — **Network**
7. Build CBOR payload with all metadata
8. Sign payload (Ed25519) — **CPU**
9. Insert into PostgreSQL
10. Optionally compute CLAP embedding — **CPU** (ONNX Runtime)
11. AI detection (human vs AI-generated) — **CPU**
12. Return registration ID + watermarked audio

### Verification Pipeline (`orbit verify`)
- Unknown track (fast path): fingerprint → DB lookup → no match → return (~1s)
- Known track (slow path): fingerprint → DB lookup → match → watermark extraction → AI metadata → signature verification → content analysis → confidence summary

### Key Config Notes
- `ACOUSTID_API_KEY` may or may not be set on the EC2 instance. If catalog check returns `status: 'unavailable'`, the key is missing. This is non-fatal.
- `ORBIT_WATERMARK_METHOD` defaults to 'auto' (try neural first, fall back to spread spectrum)
- CLAP model (~600MB) runs on CPU via ONNX Runtime, NOT GPU
- SilentCipher runs on GPU via Python subprocess (PyTorch)

### CLI Notes
- CLI binary: `cli/bin/orbit.js`
- Uses `commander.js`, each command in `cli/lib/commands/`
- `--json` flag outputs machine-parseable JSON
- `--quiet` suppresses non-essential output
- Config precedence: env vars > `.orbit/config.json` (local) > `~/.orbitrc` (global)

---

## Files of Interest
- `demo/.env` — credentials (UPDATED to current IP)
- `demo/run-demo.sh` — 8-step demo script for the Thursday presentation
- `demo/server.js` — web UI proxy server
- `src/api/handlers/register.js` — registration handler (returns processing_time_ms)
- `src/api/handlers/verify.js` — verification handler
- `src/engines/catalog-check.js` — AcoustID + MusicBrainz integration
- `scripts/silentcipher_watermark.py` — Python neural watermarking (GPU)
- `cli/lib/commands/register.js` — CLI register command
- `benchmarks/audio/` — empty directory ready for test corpus
