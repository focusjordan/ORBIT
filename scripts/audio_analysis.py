#!/usr/bin/env python3
"""
ORBIT Audio Analysis Wrapper Script

Session 30 Refactoring: Backwards-compatible wrapper.
Delegates classical DSP analyses to scripts/audio_dsp.py and spectral forensics
to scripts/audio_forensics.py. Eliminates duplicate code while preserving perfect
CLI signature and output schema parity.

Usage:
    python scripts/audio_analysis.py <audio_path> [--output json] [--max-length 120] [--ai-forensics] [--stems-dir <dir>]
"""

import sys
import os
import json
import argparse
import warnings

# Suppress warnings for cleaner JSON output
warnings.filterwarnings('ignore')

# Append scripts directory to path to ensure clean local imports
sys.path.append(os.path.dirname(os.path.realpath(__file__)))

try:
    import audio_dsp
    import audio_forensics
except ImportError:
    # Handle direct root executions
    sys.path.append(os.path.join(os.path.dirname(os.path.realpath(__file__)), '..'))
    import audio_dsp
    import audio_forensics


def check_dependencies():
    """Delegates dependency checking to underlying passes."""
    audio_dsp.check_dependencies()
    audio_forensics.check_dependencies()


def analyze_audio(audio_path, max_length_seconds=120, ai_forensics_enabled=False, stems_dir=None):
    """
    Perform full audio analysis (DSP + optional Forensics) by orchestrating
    the newly decoupled sub-passes.
    """
    import librosa
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')
        
    # 1. Run traditional DSP pass
    # (We load once here to calculate duration and keep identical API behavior)
    target_sr = 44100 if ai_forensics_enabled else 22050
    y, sr = librosa.load(audio_path, sr=target_sr, mono=True)
    duration = len(y) / sr
    
    max_samples = int(max_length_seconds * sr)
    if len(y) > max_samples:
        y = y[:max_samples]
        
    bpm_result = audio_dsp.detect_bpm(y, sr)
    
    key_result = None
    key_detection_source = 'mix_hpss'
    if stems_dir:
        other_stem = os.path.join(stems_dir, 'other.wav')
        bass_stem = os.path.join(stems_dir, 'bass.wav')
        if os.path.exists(other_stem):
            key_result = audio_dsp.detect_key_from_stems(
                other_stem,
                bass_stem_path=bass_stem if os.path.exists(bass_stem) else None,
                max_length_seconds=max_length_seconds
            )
            key_detection_source = 'demucs_stems'

    if key_result is None:
        key_result = audio_dsp.detect_key(y, sr, harmonic_only=True)
        
    energy = audio_dsp.calculate_energy(y)
    loudness_db = audio_dsp.calculate_loudness(y, sr)
    dynamic_range_db = audio_dsp.calculate_dynamic_range(y)
    
    result = {
        'bpm': bpm_result,
        'key': key_result,
        'energy': energy,
        'loudness_db': loudness_db,
        'dynamic_range_db': dynamic_range_db,
        'duration': round(duration, 2),
        'sample_rate': sr,
        'analyzed_length': round(min(duration, max_length_seconds), 2),
        'key_detection_source': key_detection_source,
    }
    
    # 2. Run AI spectral forensics pass if enabled
    if ai_forensics_enabled:
        result['ai_forensics'] = audio_forensics.run_forensics(
            audio_path,
            max_length_seconds=max_length_seconds,
            stems_dir=stems_dir
        )
        # Ensure traditional dynamic range is duplicated in forensics payload for validation compatibility
        result['ai_forensics']['dynamic_range_db'] = dynamic_range_db
        
    return result


def main():
    parser = argparse.ArgumentParser(description='Analyze audio for BPM, key, and energy')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--output', choices=['json'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--max-length', type=int, default=120,
                        help='Max audio length to analyze in seconds (default: 120)')
    parser.add_argument('--ai-forensics', action='store_true',
                        help='Run AI spectral forensics (16kHz cutoff, phase entropy, spectral contrast, onset regularity)')
    parser.add_argument('--stems-dir',
                        help='Directory containing Demucs stems for improved key detection')
    
    args = parser.parse_args()
    
    check_dependencies()
    
    try:
        import numpy as np
        
        class NumpyEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, (np.bool_, np.generic)):
                    return obj.item()
                return super().default(obj)
                
        result = analyze_audio(
            args.audio_path,
            max_length_seconds=args.max_length,
            ai_forensics_enabled=args.ai_forensics,
            stems_dir=args.stems_dir
        )
        print(json.dumps(result, cls=NumpyEncoder))
        
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
