#!/usr/bin/env python3
"""
ORBIT Classical DSP Analysis Script

Extracts fast, traditional musical features:
- BPM (tempo) with confidence score
- Musical key with confidence score (Krumhansl-Schmuckler algorithm)
- Energy level (RMS-based)
- Loudness (dB)
- Dynamic range (RMS percentile spread)

Usage:
    python scripts/audio_dsp.py <audio_path> [--output json] [--max-length 120]
"""

import sys
import os
import json
import argparse
import warnings

# Suppress warnings for cleaner JSON output
warnings.filterwarnings('ignore')

# Krumhansl-Schmuckler key profiles
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def check_dependencies():
    """Check if required packages are installed (lazy imports)."""
    missing = []
    try:
        import librosa
    except ImportError:
        missing.append('librosa')
    try:
        import numpy
    except ImportError:
        missing.append('numpy')
    try:
        import scipy.stats
    except ImportError:
        missing.append('scipy')
    
    if missing:
        print(json.dumps({
            'error': 'missing_dependencies',
            'message': f'Missing Python packages: {", ".join(missing)}',
            'install': f'pip install {" ".join(missing)}'
        }))
        sys.exit(1)


def correlate_with_profile(chroma, profile):
    """Calculate Pearson correlation between chroma vector and key profile."""
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


def _detect_key_from_chroma(chroma_avg):
    """Detect key from a normalized 12-bin chroma distribution."""
    import numpy as np

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
    confidence = max(0, min(1, (best_correlation + 1) / 2))

    return {
        'value': f'{best_key} {best_mode}',
        'key': best_key,
        'mode': best_mode,
        'confidence': round(confidence, 4)
    }


def detect_key(y, sr, harmonic_only=False):
    """Detect musical key using Krumhansl-Schmuckler algorithm."""
    import librosa
    import numpy as np
    
    if harmonic_only:
        y, _ = librosa.effects.hpss(y)

    # Compute chroma features using CQT
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    
    # Average across time
    chroma_avg = np.mean(chroma, axis=1)
    return _detect_key_from_chroma(chroma_avg)


def detect_key_from_stems(other_stem_path, bass_stem_path=None, max_length_seconds=120):
    """Detect key from Demucs stems with harmonic emphasis."""
    import librosa
    import numpy as np

    if not other_stem_path or not os.path.exists(other_stem_path):
        raise FileNotFoundError(f'Other stem not found: {other_stem_path}')

    target_sr = 22050
    other_y, sr = librosa.load(other_stem_path, sr=target_sr, mono=True)
    max_samples = int(max_length_seconds * sr)
    if len(other_y) > max_samples:
        other_y = other_y[:max_samples]

    other_harm, _ = librosa.effects.hpss(other_y)
    mix = other_harm.astype(np.float32, copy=False)

    if bass_stem_path and os.path.exists(bass_stem_path):
        bass_y, bass_sr = librosa.load(bass_stem_path, sr=target_sr, mono=True)
        if bass_sr != sr:
            bass_y = librosa.resample(bass_y, orig_sr=bass_sr, target_sr=sr)
        if len(bass_y) > max_samples:
            bass_y = bass_y[:max_samples]
        bass_harm, _ = librosa.effects.hpss(bass_y)

        target_len = min(len(mix), len(bass_harm))
        if target_len > 0:
            mix = mix[:target_len] + (0.35 * bass_harm[:target_len])

    return detect_key(mix, sr, harmonic_only=False)


def detect_bpm(y, sr):
    """Detect tempo (BPM) using librosa's beat tracker."""
    import librosa
    import numpy as np
    
    # Use librosa's beat tracker
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0]) if len(tempo) > 0 else 0.0
    else:
        tempo = float(tempo)
    
    # Calculate confidence using onset strength autocorrelation tempogram
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
    
    tempo_bins = librosa.tempo_frequencies(tempogram.shape[0], sr=sr)
    tempo_idx = np.argmin(np.abs(tempo_bins - tempo))
    
    if tempogram.shape[1] > 0:
        tempo_strength = np.mean(tempogram[tempo_idx, :])
        max_strength = np.max(np.mean(tempogram, axis=1))
        confidence = tempo_strength / max_strength if max_strength > 0 else 0
    else:
        confidence = 0.5
    
    return {
        'value': round(tempo, 1),
        'confidence': round(float(confidence), 4)
    }


def calculate_energy(y):
    """Calculate RMS-based energy level."""
    import librosa
    import numpy as np
    
    rms = librosa.feature.rms(y=y)[0]
    mean_rms = np.mean(rms)
    
    # Normalize with a sigmoid-like scaling
    energy = min(1.0, mean_rms / 0.15)
    return round(float(energy), 4)


def calculate_loudness(y, sr):
    """Calculate loudness approximation in dB."""
    import numpy as np
    
    rms = np.sqrt(np.mean(y ** 2))
    if rms > 0:
        db = 20 * np.log10(rms)
    else:
        db = -60.0
    return round(float(db), 2)


def calculate_dynamic_range(y):
    """Estimate dynamic range using frame RMS percentiles."""
    import librosa
    import numpy as np

    rms = librosa.feature.rms(y=y)[0]
    if len(rms) == 0:
        return 0.0

    high = np.percentile(rms, 95)
    low = np.percentile(rms, 10)
    high = max(high, 1e-10)
    low = max(low, 1e-10)
    dr = 20 * np.log10(high / low)
    return round(float(max(0.0, dr)), 3)


def main():
    parser = argparse.ArgumentParser(description='Analyze audio for classical DSP features')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--output', choices=['json'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--max-length', type=int, default=120,
                        help='Max audio length to analyze in seconds (default: 120)')
    parser.add_argument('--stems-dir',
                        help='Directory containing Demucs stems for improved key detection')
    
    args = parser.parse_args()
    
    check_dependencies()
    
    if not os.path.exists(args.audio_path):
        print(json.dumps({'error': 'file_not_found', 'message': f'File not found: {args.audio_path}'}))
        sys.exit(1)
        
    try:
        import librosa
        import numpy as np
        
        target_sr = 22050
        y, sr = librosa.load(args.audio_path, sr=target_sr, mono=True)
        duration = len(y) / sr
        
        max_samples = int(args.max_length * sr)
        if len(y) > max_samples:
            y = y[:max_samples]
            
        bpm_result = detect_bpm(y, sr)
        
        key_result = None
        key_detection_source = 'mix_hpss'
        if args.stems_dir:
            other_stem = os.path.join(args.stems_dir, 'other.wav')
            bass_stem = os.path.join(args.stems_dir, 'bass.wav')
            if os.path.exists(other_stem):
                key_result = detect_key_from_stems(
                    other_stem,
                    bass_stem_path=bass_stem if os.path.exists(bass_stem) else None,
                    max_length_seconds=args.max_length
                )
                key_detection_source = 'demucs_stems'

        if key_result is None:
            key_result = detect_key(y, sr, harmonic_only=True)
            
        energy = calculate_energy(y)
        loudness_db = calculate_loudness(y, sr)
        dynamic_range_db = calculate_dynamic_range(y)
        
        result = {
            'bpm': bpm_result,
            'key': key_result,
            'energy': energy,
            'loudness_db': loudness_db,
            'dynamic_range_db': dynamic_range_db,
            'duration': round(duration, 2),
            'sample_rate': sr,
            'analyzed_length': round(min(duration, args.max_length), 2),
            'key_detection_source': key_detection_source,
        }
        
        class NumpyEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, (np.bool_, np.generic)):
                    return obj.item()
                return super().default(obj)
                
        print(json.dumps(result, cls=NumpyEncoder))
        
    except Exception as e:
        print(json.dumps({
            'error': 'processing_error',
            'message': str(e),
            'type': type(e).__name__
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
