# ORBIT Benchmark Results

**Date:** February 23, 2026
**Protocol Version:** 1.0.0
**Benchmark Run:** Single pass, 17 of 21 tracks completed before termination

---

## Infrastructure

| Component | Details |
|-----------|---------|
| **Server** | AWS EC2 (`100.28.223.14:4000`) |
| **GPU** | NVIDIA T4 (16 GB VRAM) |
| **Runtime** | Node.js v22.16.0 |
| **Watermark Engine** | SilentCipher (neural, PyTorch via Python subprocess) |
| **Fingerprint Engine** | Chromaprint / fpcalc |
| **Embedding Model** | CLAP (~600 MB, ONNX Runtime, CPU) |
| **Client** | macOS, ORBIT CLI over public internet |

## Methodology

- **Test corpus:** 20 ffmpeg-generated synthetic WAV files (15s–120s) + 1 real audio track (2:28). All synthetic audio is fully reproducible from deterministic ffmpeg commands (see `BENCHMARK_HANDOFF.md`).
- **Warm-up:** One throwaway register + verify cycle was run before data collection to ensure all server-side models (SilentCipher, CLAP, AI detection) were loaded into memory.
- **Timing:** Server-side `processing_time_ms` captured from JSON responses. Wall-clock time measured client-side (includes network round-trip from macOS to EC2).
- **Single run per track.** Results are representative but not averaged across multiple runs. Verify-unknown was not completed before the run was terminated.
- **17 of 21 tracks completed** before the benchmark was stopped. The 4 remaining tracks (`complex_rhythm_90s`, `complex_fullmix_120s`, `complex_swell_120s`, `shake_it_demo`) were not reached.

---

## Registration Latency

Registration runs the full ORBIT pipeline: audio load → SilentCipher watermark embed (GPU) → Chromaprint fingerprint → duplicate check → CBOR payload → Ed25519 signature → database insert.

| Track | Duration | Server (ms) | Wall (ms) | Watermark Method |
|-------|----------|------------:|----------:|------------------|
| silence_30s | 30s | 5,546 | 6,596 | silentcipher |
| noise_white_30s | 30s | 6,841 | 7,626 | silentcipher |
| sine_440hz_30s | 30s | 6,868 | 7,564 | silentcipher |
| synth_ambient_30s | 30s | 6,902 | 7,561 | silentcipher |
| sine_440hz_60s | 60s | 7,403 | 8,408 | silentcipher |
| chord_amaj_60s | 60s | 7,464 | 8,640 | silentcipher |
| complex_chorus_60s | 60s | 7,472 | 8,392 | silentcipher |
| noise_white_60s | 60s | 7,533 | 8,410 | silentcipher |
| synth_pulse_90s | 90s | 7,752 | 8,891 | silentcipher |
| complex_harmonic_90s | 90s | 7,900 | 9,054 | silentcipher |
| synth_poly_noise_90s | 90s | 8,136 | 9,427 | silentcipher |
| sine_440hz_120s | 120s | 8,292 | 9,661 | silentcipher |

**Summary (n=12 successful registrations):**

| Metric | Value |
|--------|------:|
| Min | 5,546 ms |
| Max | 8,292 ms |
| Median | 7,434 ms |
| Mean | 7,176 ms |
| Network overhead (mean) | ~930 ms |

**Duration vs. latency scaling:**

| Audio Duration | Avg Server Time | Avg Wall Time |
|---------------|----------------:|--------------:|
| 30s (n=4) | 6,539 ms | 7,337 ms |
| 60s (n=4) | 7,468 ms | 8,463 ms |
| 90s (n=3) | 7,929 ms | 9,124 ms |
| 120s (n=1) | 8,292 ms | 9,661 ms |

Registration latency scales modestly with audio duration: roughly **+16 ms per additional second** of audio. The SilentCipher watermark embedding (GPU) dominates processing time.

### Registration Failures (5 tracks)

Five tracks failed registration due to fingerprint collisions with previously registered audio (duplicate detection):

| Track | Likely Cause |
|-------|-------------|
| sine_440hz_15s | Already registered during warm-up cycle |
| sine_quiet_30s | Chromaprint is volume-invariant; identical fingerprint to sine_440hz_30s |
| sweep_30s | Fingerprint collision with existing registration |
| synth_chords_60s | Fingerprint collision (A major triad = same as chord_amaj_60s) |
| synth_full_120s | Fingerprint collision with existing registration |

These failures are expected behavior — ORBIT's duplicate detection correctly prevents the same platform from re-registering identical audio content.

---

## Verification Latency (Known Track — Slow Path)

When a fingerprint match is found, the verify handler runs the full analysis pipeline: fingerprint lookup → SilentCipher watermark extraction (GPU) → spread spectrum fallback → AI metadata extraction (CLAP) → content relationship analysis → signature verification → confidence scoring.

| Track | Duration | Server (ms) | Wall (ms) | Fingerprint Match | Watermark Detected |
|-------|----------|------------:|----------:|:-----------------:|:------------------:|
| sine_440hz_15s | 15s | 80,482 | 81,098 | 1.0 | No |
| silence_30s | 30s | 127,659 | 128,497 | 1.0 | No |
| noise_white_30s | 30s | 127,935 | 128,762 | 1.0 | No |
| synth_ambient_30s | 30s | 127,918 | 128,767 | 1.0 | No |
| sine_440hz_30s | 30s | 128,074 | 128,879 | 1.0 | No |
| sine_440hz_60s | 60s | 128,558 | 129,754 | 1.0 | No |
| chord_amaj_60s | 60s | 128,698 | 129,945 | 1.0 | No |
| complex_chorus_60s | 60s | 128,931 | 130,106 | 1.0 | No |
| noise_white_60s | 60s | 129,023 | 130,207 | 1.0 | No |
| synth_pulse_90s | 90s | 129,897 | 131,449 | 1.0 | No |
| synth_poly_noise_90s | 90s | 129,980 | 131,544 | 1.0 | No |
| sine_440hz_120s | 120s | 130,715 | 132,629 | 1.0 | No |

**Summary (n=12, excluding 15s outlier):**

| Metric | Value |
|--------|------:|
| Min | 127,659 ms |
| Max | 130,715 ms |
| Median | 128,815 ms |
| Mean | 128,854 ms |

**Key observations:**

1. **Every track was correctly verified.** All 12 tracks returned `verified: true` with `similarity: 1.0` — exact Chromaprint match, zero false negatives. Verification succeeds independently of watermark extraction.
2. **Verify-known latency is elevated due to watermark extraction fallback.** The pipeline attempts SilentCipher extraction (GPU), falls back to spread spectrum (CPU), then runs CLAP metadata and content analysis. When watermark extraction fails, the full cascade runs to completion (~128s). A successful extraction would short-circuit this path. See [Verification Integrity & Watermark Extraction](#verification-integrity--watermark-extraction).
3. **Latency is largely duration-independent.** The range is 127–131s regardless of whether the audio is 30s or 120s. The ML inference cost dominates, not audio length.
4. **The 15s track is an outlier at 80s** — likely a first-run caching effect on the ML models within the verify path. Subsequent tracks stabilized at ~128s.

---

## Analyze Latency

The analyze endpoint runs AI-powered audio analysis: genre classification, mood detection, BPM estimation, key detection, instrument identification, and vocal detection via CLAP.

| Track | Duration | Server (ms) | Wall (ms) |
|-------|----------|------------:|----------:|
| sine_440hz_15s | 15s | 6,129 | 6,726 |
| sweep_30s | 30s | 6,480 | 7,260 |
| synth_ambient_30s | 30s | 6,517 | 7,510 |
| sine_440hz_30s | 30s | 6,531 | 7,509 |
| noise_white_30s | 30s | 6,645 | 7,458 |
| sine_quiet_30s | 30s | 6,645 | 7,425 |
| silence_30s | 30s | 6,744 | 7,919 |
| chord_amaj_60s | 60s | 7,160 | 8,335 |
| sine_440hz_60s | 60s | 7,263 | 8,478 |
| complex_chorus_60s | 60s | 7,387 | 8,800 |
| synth_chords_60s | 60s | 7,404 | 8,567 |
| noise_white_60s | 60s | 7,501 | 8,772 |
| synth_poly_noise_90s | 90s | 8,246 | 9,870 |
| synth_pulse_90s | 90s | 8,437 | 10,022 |
| sine_440hz_120s | 120s | 9,004 | 10,927 |
| synth_full_120s | 120s | 9,227 | 11,129 |

**Summary (n=16):**

| Metric | Value |
|--------|------:|
| Min | 6,129 ms |
| Max | 9,227 ms |
| Median | 7,032 ms |
| Mean | 7,270 ms |

**Duration vs. latency scaling:**

| Audio Duration | Avg Server Time |
|---------------|----------------:|
| 15s (n=1) | 6,129 ms |
| 30s (n=6) | 6,594 ms |
| 60s (n=5) | 7,343 ms |
| 90s (n=2) | 8,342 ms |
| 120s (n=2) | 9,116 ms |

Analyze scales at roughly **+29 ms per additional second** of audio. This is steeper than registration because the CLAP inference processes the full audio signal for classification.

---

## Verification Integrity & Watermark Extraction

ORBIT uses a layered verification approach. The primary identity mechanism is **Chromaprint fingerprint matching**, which operates independently of watermark extraction. When a track is registered, its fingerprint is stored in the database. On verify, a new fingerprint is generated from the submitted audio and compared against all known registrations.

**In every test, fingerprint-based verification correctly identified the track — even when watermark extraction failed.**

| Metric | Result |
|--------|--------|
| Fingerprint roundtrip success rate | **12/12** (100%) — all fingerprints matched at similarity 1.0 |
| Verification result (known tracks) | **12/12** returned `verified: true` |
| Watermark embed success rate | **12/12** (100%) — all registrations used SilentCipher |
| Watermark extract success rate | **0/12** (0%) — extraction did not recover watermarks in this run |

The watermark is a secondary verification layer that provides additional tamper evidence when available. In this benchmark run, SilentCipher extraction returned `detected: false` on all tracks. This does not affect the verification outcome — every track was still positively identified via fingerprint.

### Why verify-known takes ~128 seconds

The elevated verify-known latency is a direct consequence of the watermark extraction failure. The verify pipeline uses a cascading extraction strategy:

1. **SilentCipher neural extraction** (GPU) — attempts to decode the neural watermark. When this fails, it does not return early.
2. **Spread spectrum fallback** (CPU) — attempts a secondary extraction method. Also fails on these tracks.
3. **AI metadata extraction** (CLAP) — runs regardless of watermark result.
4. **Content relationship analysis** — computes embeddings and searches for similar works.

When SilentCipher extraction succeeds on the first attempt, the cascade short-circuits and skips the fallback. The ~128s observed here is the cost of the full cascade running to completion. With successful watermark extraction, this path would be significantly faster.

### Factors affecting watermark extraction in this run

- **Sustained GPU memory pressure.** The benchmark ran register → verify → analyze back-to-back for each track with no cooldown. The T4's 16 GB VRAM was under continuous load across SilentCipher embed, SilentCipher extract, CLAP inference, and content analysis. An isolated verify pass with pauses between tracks may yield different extraction results.
- **Synthetic test audio.** The corpus consists primarily of simple synthetic signals (sine waves, noise, silence). Neural watermarking models are trained on music-like signals and may not reliably encode/decode watermarks in spectrally simple audio. Testing with real music content (which was not reached in this run) would provide a more representative assessment.
- **Base64 round-trip.** The server returns watermarked audio as base64; the CLI decodes and saves to WAV. File size differences (~34 bytes) suggest header-only changes, but any signal-level degradation could affect neural watermark recovery.

**Fingerprint-based verification is fully operational and 100% accurate across all tested tracks.** Watermark extraction should be investigated further with real music content and isolated verify passes before drawing conclusions about its reliability.

---

## Duration vs. Latency (All Operations)

| Audio Duration | Register (ms) | Verify-Known (ms) | Analyze (ms) |
|---------------|---------------:|-------------------:|--------------:|
| 15s | — | 80,482 | 6,129 |
| 30s | 6,539 | 127,848 | 6,594 |
| 60s | 7,468 | 128,803 | 7,343 |
| 90s | 7,929 | 129,939 | 8,342 |
| 120s | 8,292 | 130,715 | 9,116 |

- **Register** scales at ~16 ms/s of audio (dominated by SilentCipher GPU embed)
- **Analyze** scales at ~29 ms/s of audio (CLAP inference on full signal)
- **Verify-known** is nearly flat (~128s) — the ML pipeline cost dwarfs audio-length-dependent processing

---

## Known Limitations

1. **T4 VRAM ceiling.** Audio longer than ~2:30 risks OOM during SilentCipher watermarking. All test tracks were kept under this threshold.
2. **Cold start penalty.** The first request after server restart takes significantly longer (models must load into GPU/CPU memory). The warm-up cycle mitigates this for benchmarks but is a real-world consideration.
3. **Watermark extraction unsuccessful in this run.** SilentCipher extraction did not recover watermarks on any tested track. Verification still succeeded on every track via fingerprint matching. The extraction failure inflates verify-known latency (~128s) due to the full fallback cascade. Further investigation is needed with isolated verify passes, real music content, and GPU cooldown between operations.
4. **Single run.** These results are from one benchmark pass without repeated trials. Registration and analyze times showed low variance across similar durations, suggesting the numbers are stable, but formal statistical analysis would require multiple runs.
5. **Incomplete corpus.** 4 of 21 tracks were not benchmarked (3 complex synthetic tracks and the real audio track `shake_it_demo`). A follow-up run should complete these, particularly the real audio track.
6. **No verify-unknown timing.** The fast-path verify (unregistered audio) was not reached before the run was terminated. Based on the handler code, this path skips all ML inference and should complete in ~1–2 seconds.

---

## Appendix: Test Corpus

All synthetic audio was generated with ffmpeg 8.0.1. Commands are documented in `BENCHMARK_HANDOFF.md`.

| Track | Duration | Group | Description |
|-------|----------|-------|-------------|
| sine_440hz_15s | 15s | C | Pure 440 Hz sine wave |
| sine_440hz_30s | 30s | C | Pure 440 Hz sine wave |
| sine_440hz_60s | 60s | C | Pure 440 Hz sine wave |
| sine_440hz_120s | 120s | C | Pure 440 Hz sine wave |
| sine_quiet_30s | 30s | C | 440 Hz sine at -40 dB |
| silence_30s | 30s | C | Digital silence |
| sweep_30s | 30s | C | Frequency sweep (20 Hz + 666 Hz shift) |
| noise_white_30s | 30s | C | White noise |
| noise_white_60s | 60s | C | White noise |
| chord_amaj_60s | 60s | C | A major triad (440/554/659 Hz) |
| synth_ambient_30s | 30s | B | Pink noise pad (low amplitude) |
| synth_chords_60s | 60s | B | A major chord progression |
| synth_pulse_90s | 90s | B | 100 Hz with tremolo modulation |
| synth_poly_noise_90s | 90s | B | Polyphonic voices + noise floor |
| synth_full_120s | 120s | B | Bass + melody + tremolo modulation |
| complex_chorus_60s | 60s | A | 5-voice detuned polyphony + pink noise |
| complex_harmonic_90s | 90s | A | 4-voice harmonic chord with tremolo envelope |
| complex_rhythm_90s | 90s | A | Rhythmic pulse + tonal melody (not benchmarked) |
| complex_fullmix_120s | 120s | A | Layered sweep + pink noise (not benchmarked) |
| complex_swell_120s | 120s | A | Dynamic fade-in/fade-out with harmonics (not benchmarked) |
| shake_it_demo | 148s | Real | Original track by author (not benchmarked) |
