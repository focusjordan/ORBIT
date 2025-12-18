#!/usr/bin/env python3
"""
ORBIT SilentCipher Watermarking Script

Session 22 - Neural audio watermarking with SilentCipher (Sony AI)

This script provides embed and extract functionality for neural watermarking
using the SilentCipher model from Sony AI.

License: MIT (commercially licensable)
Source: https://github.com/sony/silentcipher

Usage:
    # Embed a message into audio
    python scripts/silentcipher_watermark.py embed <audio_path> <output_path> --message "0,1,2,3,4"
    
    # Extract message from audio
    python scripts/silentcipher_watermark.py extract <audio_path>

Output (JSON):
    Embed: {"success": true, "sdr": 25.5, "message": [0,1,2,3,4]}
    Extract: {"success": true, "message": [0,1,2,3,4], "confidence": 0.98}

Requirements:
    pip install silentcipher librosa soundfile numpy

Model:
    SilentCipher (Sony AI) - ~100MB, downloaded on first use
    Supports 44.1kHz and 16kHz audio
    Message capacity: 5 x 8-bit integers = 40 bits
    
See: ORBIT_ENHANCEMENTS.md Section 1 (Neural Watermarking)
"""

import sys
import os
import json
import argparse
import warnings
import logging

# Suppress all warnings and verbose logging for cleaner JSON output
warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
logging.getLogger('silentcipher').setLevel(logging.ERROR)
logging.getLogger('huggingface_hub').setLevel(logging.ERROR)
logging.getLogger('tqdm').setLevel(logging.ERROR)

def check_dependencies():
    """Check if required packages are installed."""
    missing = []
    
    try:
        import silentcipher
    except ImportError:
        missing.append('silentcipher')
    
    try:
        import librosa
    except ImportError:
        missing.append('librosa')
    
    try:
        import soundfile
    except ImportError:
        missing.append('soundfile')
    
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


class SuppressStderr:
    """Context manager to suppress stderr output during model operations."""
    def __init__(self):
        self._original_stderr = None
        self._devnull = None
    
    def __enter__(self):
        self._original_stderr = sys.stderr
        self._devnull = open(os.devnull, 'w')
        sys.stderr = self._devnull
        return self
    
    def __exit__(self, *args):
        sys.stderr = self._original_stderr
        if self._devnull:
            self._devnull.close()


class SuppressOutput:
    """Context manager to suppress both stdout and stderr during model operations."""
    def __init__(self):
        self._original_stdout = None
        self._original_stderr = None
        self._devnull = None
    
    def __enter__(self):
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        self._devnull = open(os.devnull, 'w')
        sys.stdout = self._devnull
        sys.stderr = self._devnull
        return self
    
    def __exit__(self, *args):
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr
        if self._devnull:
            self._devnull.close()


def get_model(sample_rate=44100):
    """Load SilentCipher model for the given sample rate."""
    import silentcipher
    import torch
    
    # Determine device
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    # Select model type based on sample rate
    if sample_rate == 44100:
        model_type = '44.1k'
    elif sample_rate == 16000:
        model_type = '16k'
    else:
        # Resample to 44.1k if other sample rate
        model_type = '44.1k'
    
    # Load model (cached after first download) - suppress all output
    with SuppressOutput():
        model = silentcipher.get_model(
            model_type=model_type,
            device=device
        )
    
    return model, device, model_type


def embed_watermark(audio_path, output_path, message, target_sr=44100):
    """
    Embed a watermark message into an audio file.
    
    Args:
        audio_path: Path to input audio file
        output_path: Path to save watermarked audio
        message: List of 5 integers (0-255 each)
        target_sr: Target sample rate (44100 or 16000)
    
    Returns:
        dict with success status, SDR, and message
    """
    import librosa
    import soundfile as sf
    import numpy as np
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')
    
    # Validate message
    if len(message) != 5:
        raise ValueError(f'Message must be exactly 5 integers, got {len(message)}')
    for i, val in enumerate(message):
        if not 0 <= val <= 255:
            raise ValueError(f'Message[{i}] must be 0-255, got {val}')
    
    # Load audio
    audio, sr = librosa.load(audio_path, sr=target_sr, mono=True)
    duration = len(audio) / sr
    
    # Minimum duration check (SilentCipher needs at least ~1 second)
    if duration < 1.0:
        raise ValueError(f'Audio too short: {duration:.2f}s (minimum 1.0s)')
    
    # Load model
    model, device, model_type = get_model(target_sr)
    
    # Embed watermark
    # SilentCipher expects message as list of 5 integers [0-255]
    encoded_audio, sdr = model.encode_wav(audio, sr, message)
    
    # Save output
    sf.write(output_path, encoded_audio, sr)
    
    return {
        'success': True,
        'sdr': float(sdr),  # Signal-to-Distortion Ratio (higher = better quality)
        'message': message,
        'duration': duration,
        'sample_rate': sr,
        'device': device,
        'model_type': model_type
    }


def extract_watermark(audio_path, target_sr=44100, phase_shift_decoding=True):
    """
    Extract watermark message from an audio file.
    
    Args:
        audio_path: Path to watermarked audio file
        target_sr: Target sample rate for processing
        phase_shift_decoding: Enable for better robustness to crops (slower)
    
    Returns:
        dict with success status, message, and confidence
    """
    import librosa
    import numpy as np
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')
    
    # Load audio
    audio, sr = librosa.load(audio_path, sr=target_sr, mono=True)
    duration = len(audio) / sr
    
    # Load model
    model, device, model_type = get_model(target_sr)
    
    # Extract watermark
    # phase_shift_decoding=True makes decoder more robust to audio crops
    result = model.decode_wav(audio, sr, phase_shift_decoding=phase_shift_decoding)
    
    # Status can be True, 'success', or truthy value depending on version
    status_ok = result.get('status') in (True, 'success', 'True') or result.get('status') == True
    
    if status_ok and result.get('messages'):
        # Get the first (and typically only) message
        message = result['messages'][0] if result['messages'] else None
        confidence = result['confidences'][0] if result['confidences'] else 0.0
        
        return {
            'success': True,
            'detected': True,
            'message': list(message) if message is not None else None,
            'confidence': float(confidence),
            'duration': duration,
            'sample_rate': sr,
            'device': device,
            'model_type': model_type
        }
    else:
        return {
            'success': True,
            'detected': False,
            'message': None,
            'confidence': 0.0,
            'duration': duration,
            'sample_rate': sr,
            'device': device,
            'status_detail': str(result.get('status', 'unknown'))
        }


def check_environment():
    """Check if SilentCipher environment is properly set up."""
    check_dependencies()
    
    import torch
    import silentcipher
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    return {
        'available': True,
        'message': 'SilentCipher environment ready',
        'details': {
            'device': device,
            'cuda_available': torch.cuda.is_available(),
            'silentcipher_version': getattr(silentcipher, '__version__', 'unknown')
        }
    }


def main():
    parser = argparse.ArgumentParser(description='ORBIT SilentCipher Watermarking')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    # Embed command
    embed_parser = subparsers.add_parser('embed', help='Embed watermark into audio')
    embed_parser.add_argument('audio_path', help='Path to input audio file')
    embed_parser.add_argument('output_path', help='Path to save watermarked audio')
    embed_parser.add_argument('--message', required=True,
                              help='Message as comma-separated integers (5 values, 0-255 each)')
    embed_parser.add_argument('--sample-rate', type=int, default=44100,
                              help='Target sample rate (default: 44100)')
    
    # Extract command
    extract_parser = subparsers.add_parser('extract', help='Extract watermark from audio')
    extract_parser.add_argument('audio_path', help='Path to watermarked audio file')
    extract_parser.add_argument('--sample-rate', type=int, default=44100,
                                help='Target sample rate (default: 44100)')
    extract_parser.add_argument('--no-phase-shift', action='store_true',
                                help='Disable phase shift decoding (faster but less robust)')
    
    # Check command
    check_parser = subparsers.add_parser('check', help='Check environment')
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        sys.exit(1)
    
    try:
        if args.command == 'check':
            result = check_environment()
            print(json.dumps(result))
            
        elif args.command == 'embed':
            check_dependencies()
            
            # Parse message
            message = [int(x.strip()) for x in args.message.split(',')]
            
            result = embed_watermark(
                args.audio_path,
                args.output_path,
                message,
                target_sr=args.sample_rate
            )
            print(json.dumps(result))
            
        elif args.command == 'extract':
            check_dependencies()
            
            result = extract_watermark(
                args.audio_path,
                target_sr=args.sample_rate,
                phase_shift_decoding=not args.no_phase_shift
            )
            print(json.dumps(result))
            
    except FileNotFoundError as e:
        print(json.dumps({
            'error': 'file_not_found',
            'message': str(e)
        }))
        sys.exit(1)
    except ValueError as e:
        print(json.dumps({
            'error': 'validation_error',
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


