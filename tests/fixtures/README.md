# Test Fixtures

This directory contains test audio files for ORBIT testing.

## Required Files

### test-audio.mp3
Any MP3 file at least 10 seconds long for testing fingerprinting and watermarking.

**Where to get one:**
- Use any royalty-free music (e.g., from YouTube Audio Library, Free Music Archive)
- Generate a simple tone: `ffmpeg -f lavfi -i "sine=frequency=440:duration=30" test-audio.mp3`
- Or use any existing MP3 you have rights to use for testing

**Important:** Do not commit copyrighted audio to the repository. The `.gitignore` should exclude `*.mp3` files from this directory.

## File Specifications

- **Format:** MP3, WAV, or FLAC
- **Minimum Duration:** 10 seconds (for watermark embedding)
- **Recommended:** 30-60 seconds
- **Sample Rate:** Any (will be resampled as needed)
- **Channels:** Mono or stereo (will be converted to mono as needed)
