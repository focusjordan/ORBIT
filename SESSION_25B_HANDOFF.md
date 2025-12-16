# Session 25(b) → Session 25(c) Handoff

## What Was Completed (Session 25b)

### ✅ Fixed: Stereo Preservation
- **Problem:** `-ac 1` flag in `src/utils/audio.js` was forcing all audio to mono
- **Fix:** Removed forced mono conversion, now preserves original channel count
- **Files:** `src/utils/audio.js` - added `getDetailedAudioInfo()`, updated `loadAudioSamples()` to preserve stereo

### ✅ Fixed: Fingerprint-After-Watermark Flow
- **Problem:** Fingerprinting original audio, then watermarking → fingerprint didn't match watermarked output
- **Fix:** Reordered registration flow: Watermark FIRST → then Fingerprint watermarked audio
- **Files:** `src/api/handlers/register.js` - reordered steps 2-4

### ✅ Fixed: Stereo Watermark Embedding
- **Problem:** Watermark only embedded on mono
- **Fix:** Embed watermark on ALL channels (L+R for stereo)
- **Files:** `src/engines/watermark-unified.js` - embed loop for each channel

### ✅ Result: Fingerprint Now Survives
```
Original:    20,697,814 bytes
Watermarked: 20,697,644 bytes (only 170 byte difference - WAV header)
FP Match: YES ✅
```

---

## ❌ Bug Discovered: Watermark Extraction Failing

### Symptoms
- Watermark IS being embedded (server logs show "Embedded N watermark instance(s)")
- Fingerprint matching works perfectly
- But `Watermark detected: false` during verification

### Debug Logging Added
```javascript
// In src/engines/watermark-unified.js extract()
console.log(`   [WM Extract] Channels: ${channelCount}, Samples/ch: ${channels?.[0]?.length}`);
console.log(`   [WM Extract] Ch${ch}: valid=${result.valid}, conf=${result.confidence}, offset=${result.offset}`);
```

### Likely Causes
1. **Watermark strength too low** (0.005 = 0.5% amplitude)
   - May not survive WAV encode/decode precision loss
   - Location: `src/engines/watermark.js` line 32

2. **No error correction coding**
   - Single bit error corrupts CRC → entire payload invalid
   - CRC16 is detection only, not correction

3. **Offset synchronization issues**
   - Extraction searches at 5-second intervals
   - May not align with embedded positions

---

## Recommended Fixes (Session 25c)

### Option 1: Increase Watermark Strength
```javascript
// src/engines/watermark.js line 32
this.EMBED_STRENGTH = options.strength || 0.008; // Was 0.005
```
- Test imperceptibility with ABX testing
- May need to be higher (0.01-0.02) for robustness

### Option 2: Add Error Correction Coding (ECC)
- Implement Reed-Solomon coding around payload
- Can recover from ~10-15% bit errors
- Example: RS(255, 223) adds 32 bytes overhead, corrects 16 byte errors

### Option 3: Fingerprint-Guided Synchronization
- Use fingerprint match as anchor point
- If FP matches, we KNOW this is our audio → search more aggressively for watermark
- Could even store watermark offset in registration for exact extraction

### Option 4: Debug Current Extraction
- Check server logs for `[WM Extract]` output
- See if extraction is finding ANY correlation, or completely failing
- May reveal if issue is strength, offset, or encoding

---

## Test Status

### Current Test Results (Passing but Flawed)
```
✅ Passed: 9
❌ Failed: 0
```

### Actual Status
- ✅ Fingerprint matching: WORKING
- ✅ Stereo preservation: WORKING  
- ✅ Watermark embedding: WORKING (logs confirm)
- ❌ Watermark extraction: BROKEN

### Test Logic Issues
The test is currently marking Step 6 as passed even though watermark detection fails. This masks a real bug. The test should be:
```javascript
// WRONG (current)
logStep('...', verifyWmData.verified && fpMatch, ...);  // Passes without watermark

// RIGHT (should be)
logStep('...', verifyWmData.verified && fpMatch && wmDetected, ...);  // Requires watermark
```

---

## Files Modified in Session 25b

| File | Changes |
|------|---------|
| `src/utils/audio.js` | Stereo preservation, `getDetailedAudioInfo()` |
| `src/engines/watermark-unified.js` | Stereo embed/extract, debug logging |
| `src/api/handlers/register.js` | Watermark-first flow |
| `tests/api/full-stack-test.js` | Updated test logic, new audio candidates |

---

## Test Audio Files Available

| File | Sample Rate | Channels | Status |
|------|-------------|----------|--------|
| `test-audio-six.wav` | 44.1kHz | Stereo | Latest, clean |
| `test-audio-five.wav` | 44.1kHz | Stereo | Clean |
| `test-audio-four.wav` | 48kHz | Stereo | Triggers resampling |
| `test-song-three.wav` | 44.1kHz | Stereo | Registered |
| `new-audio.wav` | 44.1kHz | Stereo | Registered |

---

## Commands Reference

```bash
# Start server
npm start

# Run full stack test
node tests/api/full-stack-test.js

# Check server logs for watermark debug
# Look for [WM Extract] lines in the npm start terminal
```

---

## Priority for Session 25c

1. **First:** Check server logs for `[WM Extract]` debug output to understand WHY extraction fails
2. **Then:** Either increase strength OR add ECC based on what logs reveal
3. **Finally:** Fix test logic to properly fail when watermark isn't detected

