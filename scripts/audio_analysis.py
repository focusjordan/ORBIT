#!/usr/bin/env python3
"""
ORBIT Audio Analysis Script

Session 21 - BPM and key detection using librosa

This script analyzes audio files to extract:
- BPM (tempo) with confidence score
- Musical key with confidence score
- Energy level (RMS-based)
- Loudness (dB)

Usage:
    python scripts/audio_analysis.py <audio_path> [--output json]
    
Output (JSON):
    {
        "bpm": {"value": 120, "confidence": 0.95},
        "key": {"value": "A minor", "confidence": 0.88},
        "energy": 0.65,
        "loudness_db": -14.2,
        "duration": 180.5
    }

Requirements:
    pip install librosa numpy

See: ORBIT_ENHANCEMENTS.md Section 3 (Auto-Metadata Extraction)
"""

import sys
import os
import json
import argparse
import warnings

# Suppress warnings for cleaner JSON output
warnings.filterwarnings('ignore')

# Krumhansl-Schmuckler key profiles
# These represent the "ideal" distribution of pitch classes for each key
# Major key profile (starting from C)
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
# Minor key profile (starting from C)
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

# Pitch class names
PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def check_dependencies():
    """Check if required packages are installed."""
    missing = []
    
    try:
        import librosa
    except ImportError:
        missing.append('librosa')
    
    try:
        import numpy
    except ImportError:
        missing.append('numpy')
    
    if missing:
        print(json.dumps({
            'error': 'missing_dependencies',
            'message': f'Missing Python packages: {", ".join(missing)}',
            'install': f'pip install {" ".join(missing)}'
        }))
        sys.exit(1)


def correlate_with_profile(chroma, profile):
    """
    Calculate Pearson correlation between chroma vector and key profile.
    
    Args:
        chroma: 12-element array of chroma intensities
        profile: 12-element key profile array
    
    Returns:
        Correlation coefficient (-1 to 1)
    """
    import numpy as np
    
    # Normalize both vectors
    chroma_norm = chroma - np.mean(chroma)
    profile_norm = np.array(profile) - np.mean(profile)
    
    # Pearson correlation
    numerator = np.sum(chroma_norm * profile_norm)
    denominator = np.sqrt(np.sum(chroma_norm ** 2) * np.sum(profile_norm ** 2))
    
    if denominator == 0:
        return 0
    
    return numerator / denominator


def detect_key(y, sr):
    """
    Detect musical key using Krumhansl-Schmuckler algorithm.
    
    This algorithm:
    1. Computes chroma features (pitch class distribution)
    2. Correlates with major and minor key profiles for all 12 keys
    3. Returns the key with highest correlation
    
    Args:
        y: Audio time series
        sr: Sample rate
    
    Returns:
        dict with key name, mode, and confidence
    """
    import librosa
    import numpy as np
    
    # Compute chroma features using CQT (better for key detection)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    
    # Average across time to get overall pitch class distribution
    chroma_avg = np.mean(chroma, axis=1)
    
    # Normalize
    chroma_avg = chroma_avg / np.max(chroma_avg) if np.max(chroma_avg) > 0 else chroma_avg
    
    best_key = None
    best_mode = None
    best_correlation = -1
    
    # Try all 12 keys for both major and minor
    for i in range(12):
        # Rotate chroma to align with key
        rotated_chroma = np.roll(chroma_avg, -i)
        
        # Correlate with major profile
        major_corr = correlate_with_profile(rotated_chroma, MAJOR_PROFILE)
        if major_corr > best_correlation:
            best_correlation = major_corr
            best_key = PITCH_CLASSES[i]
            best_mode = 'major'
        
        # Correlate with minor profile
        minor_corr = correlate_with_profile(rotated_chroma, MINOR_PROFILE)
        if minor_corr > best_correlation:
            best_correlation = minor_corr
            best_key = PITCH_CLASSES[i]
            best_mode = 'minor'
    
    # Convert correlation to confidence (0-1 range)
    # Correlation can be negative, but good matches are typically > 0.5
    confidence = max(0, min(1, (best_correlation + 1) / 2))
    
    return {
        'value': f'{best_key} {best_mode}',
        'key': best_key,
        'mode': best_mode,
        'confidence': round(confidence, 4)
    }


def detect_bpm(y, sr):
    """
    Detect tempo (BPM) using librosa's beat tracker.
    
    Args:
        y: Audio time series
        sr: Sample rate
    
    Returns:
        dict with BPM value and confidence
    """
    import librosa
    import numpy as np
    
    # Use librosa's beat tracker
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    
    # Handle both scalar and array return values (librosa version differences)
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0]) if len(tempo) > 0 else 0.0
    else:
        tempo = float(tempo)
    
    # Calculate confidence based on beat strength
    # Get onset strength envelope
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    
    # Calculate tempo confidence using tempogram
    # Higher autocorrelation at detected tempo = higher confidence
    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
    
    # Find the tempo bin closest to detected tempo
    tempo_bins = librosa.tempo_frequencies(tempogram.shape[0], sr=sr)
    tempo_idx = np.argmin(np.abs(tempo_bins - tempo))
    
    # Confidence is the normalized strength at the detected tempo
    if tempogram.shape[1] > 0:
        tempo_strength = np.mean(tempogram[tempo_idx, :])
        max_strength = np.max(np.mean(tempogram, axis=1))
        confidence = tempo_strength / max_strength if max_strength > 0 else 0
    else:
        confidence = 0.5  # Default confidence if tempogram fails
    
    return {
        'value': round(tempo, 1),
        'confidence': round(float(confidence), 4)
    }


def calculate_energy(y):
    """
    Calculate energy level based on RMS.
    
    Args:
        y: Audio time series
    
    Returns:
        Energy level (0-1)
    """
    import librosa
    import numpy as np
    
    # Calculate RMS
    rms = librosa.feature.rms(y=y)[0]
    
    # Get mean RMS
    mean_rms = np.mean(rms)
    
    # Normalize to 0-1 range (typical music RMS is 0.01-0.3)
    # Using a sigmoid-like scaling
    energy = min(1.0, mean_rms / 0.15)
    
    return round(float(energy), 4)


def calculate_loudness(y, sr):
    """
    Calculate loudness in dB (similar to LUFS but simpler).
    
    Args:
        y: Audio time series
        sr: Sample rate
    
    Returns:
        Loudness in dB (typically -60 to 0)
    """
    import numpy as np
    
    # RMS to dB
    rms = np.sqrt(np.mean(y ** 2))
    
    if rms > 0:
        db = 20 * np.log10(rms)
    else:
        db = -60  # Silence
    
    return round(float(db), 2)


def analyze_audio(audio_path, max_length_seconds=120):
    """
    Perform full audio analysis.
    
    Args:
        audio_path: Path to audio file
        max_length_seconds: Maximum audio length to analyze (for efficiency)
    
    Returns:
        dict with all analysis results
    """
    import librosa
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')
    
    # Load audio
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    
    # Calculate duration
    duration = len(y) / sr
    
    # Limit length for efficiency
    max_samples = int(max_length_seconds * sr)
    if len(y) > max_samples:
        y = y[:max_samples]
    
    # Run all analyses
    bpm_result = detect_bpm(y, sr)
    key_result = detect_key(y, sr)
    energy = calculate_energy(y)
    loudness_db = calculate_loudness(y, sr)
    
    return {
        'bpm': bpm_result,
        'key': key_result,
        'energy': energy,
        'loudness_db': loudness_db,
        'duration': round(duration, 2),
        'sample_rate': sr,
        'analyzed_length': round(min(duration, max_length_seconds), 2)
    }


def main():
    parser = argparse.ArgumentParser(description='Analyze audio for BPM, key, and energy')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--output', choices=['json'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--max-length', type=int, default=120,
                        help='Max audio length to analyze in seconds (default: 120)')
    
    args = parser.parse_args()
    
    # Check dependencies first
    check_dependencies()
    
    try:
        result = analyze_audio(args.audio_path, max_length_seconds=args.max_length)
        print(json.dumps(result))
        
    except FileNotFoundError as e:
        print(json.dumps({
            'error': 'file_not_found',
            'message': str(e)
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': 'processing_error',
            'message': str(e),
            'type': type(e).__name__
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
