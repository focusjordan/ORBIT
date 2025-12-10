#!/usr/bin/env python3
"""
Generate test audio files for ORBIT testing

This script creates audio files with known characteristics for testing:
- Click track at specified BPM (for BPM detection testing)
- Can be extended for other test audio needs

Usage:
    python scripts/generate_test_audio.py

Output:
    tests/fixtures/test-audio-rhythm.wav - 30s click track at 128 BPM
"""

import os
import sys
import numpy as np

# Check for required packages
try:
    import soundfile as sf
except ImportError:
    print("Installing soundfile...")
    os.system(f"{sys.executable} -m pip install soundfile")
    import soundfile as sf


def generate_click_track(bpm=128, duration_seconds=30, sample_rate=44100):
    """
    Generate a click track at the specified BPM.
    
    Args:
        bpm: Beats per minute (default: 128)
        duration_seconds: Length of audio in seconds (default: 30)
        sample_rate: Sample rate in Hz (default: 44100)
    
    Returns:
        numpy array of audio samples
    """
    # Calculate samples
    total_samples = int(duration_seconds * sample_rate)
    
    # Calculate samples per beat
    samples_per_beat = int((60 / bpm) * sample_rate)
    
    # Create empty audio
    audio = np.zeros(total_samples, dtype=np.float32)
    
    # Click sound parameters
    click_duration = 0.02  # 20ms click
    click_samples = int(click_duration * sample_rate)
    
    # Generate click sound (short burst with decay)
    t = np.linspace(0, click_duration, click_samples)
    click = np.sin(2 * np.pi * 1000 * t) * np.exp(-t * 50)  # 1kHz click with decay
    click = click.astype(np.float32)
    
    # Place clicks at each beat
    beat_count = 0
    for i in range(0, total_samples - click_samples, samples_per_beat):
        audio[i:i + click_samples] += click
        beat_count += 1
    
    # Normalize to prevent clipping
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.8
    
    print(f"Generated {beat_count} clicks at {bpm} BPM over {duration_seconds}s")
    
    return audio, sample_rate


def generate_rhythm_track(bpm=128, duration_seconds=30, sample_rate=44100):
    """
    Generate a more musical rhythm track with kick and hi-hat pattern.
    
    Args:
        bpm: Beats per minute (default: 128)
        duration_seconds: Length of audio in seconds (default: 30)
        sample_rate: Sample rate in Hz (default: 44100)
    
    Returns:
        numpy array of audio samples
    """
    total_samples = int(duration_seconds * sample_rate)
    samples_per_beat = int((60 / bpm) * sample_rate)
    samples_per_16th = samples_per_beat // 4
    
    audio = np.zeros(total_samples, dtype=np.float32)
    
    # Kick drum sound (low frequency thump)
    kick_duration = 0.1
    kick_samples = int(kick_duration * sample_rate)
    t_kick = np.linspace(0, kick_duration, kick_samples)
    kick = np.sin(2 * np.pi * 60 * t_kick) * np.exp(-t_kick * 30)
    kick = kick.astype(np.float32) * 0.8
    
    # Hi-hat sound (noise burst)
    hihat_duration = 0.05
    hihat_samples = int(hihat_duration * sample_rate)
    t_hihat = np.linspace(0, hihat_duration, hihat_samples)
    hihat = np.random.randn(hihat_samples) * np.exp(-t_hihat * 80)
    hihat = hihat.astype(np.float32) * 0.3
    
    # Place kick on beats 1 and 3, hi-hat on every 8th note
    beat_count = 0
    for beat_start in range(0, total_samples - samples_per_beat, samples_per_beat):
        # Kick on beat
        if beat_start + kick_samples < total_samples:
            audio[beat_start:beat_start + kick_samples] += kick
        beat_count += 1
        
        # Hi-hats on 8th notes
        for eighth in range(0, 4, 2):  # Every 8th note
            pos = beat_start + (eighth * samples_per_16th)
            if pos + hihat_samples < total_samples:
                audio[pos:pos + hihat_samples] += hihat
    
    # Normalize
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.8
    
    print(f"Generated rhythm track: {beat_count} beats at {bpm} BPM over {duration_seconds}s")
    
    return audio, sample_rate


def main():
    # Get the fixtures directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    fixtures_dir = os.path.join(script_dir, '..', 'tests', 'fixtures')
    
    # Ensure fixtures directory exists
    os.makedirs(fixtures_dir, exist_ok=True)
    
    # Generate click track at 128 BPM
    print("\n🎵 Generating test audio files...")
    print("-" * 40)
    
    # Simple click track
    click_audio, sr = generate_click_track(bpm=128, duration_seconds=30)
    click_path = os.path.join(fixtures_dir, 'test-audio-click.wav')
    sf.write(click_path, click_audio, sr)
    print(f"✅ Saved: {click_path}")
    
    # Rhythm track (more musical)
    rhythm_audio, sr = generate_rhythm_track(bpm=128, duration_seconds=30)
    rhythm_path = os.path.join(fixtures_dir, 'test-audio-rhythm.wav')
    sf.write(rhythm_path, rhythm_audio, sr)
    print(f"✅ Saved: {rhythm_path}")
    
    print("-" * 40)
    print("🎉 Test audio generation complete!")
    print(f"\nFiles created:")
    print(f"  - test-audio-click.wav  (simple 128 BPM click)")
    print(f"  - test-audio-rhythm.wav (128 BPM kick + hi-hat pattern)")
    

if __name__ == '__main__':
    main()
