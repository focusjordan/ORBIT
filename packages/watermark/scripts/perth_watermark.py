#!/usr/bin/env python3
"""
ORBIT Perth Fallback Neural Watermarking Script (OrbitPerth Engine)

Perceptual neural audio watermarking with Resemble AI PerTh:
- Implicit imperceptible neural watermarking
- Fallback presence detection and tamper verification
- High compression tolerance (MP3/Opus)

Usage:
    python scripts/perth_watermark.py check
    python scripts/perth_watermark.py embed <input.wav> <output.wav>
    python scripts/perth_watermark.py extract <input.wav>
"""

import os
import sys
import json
import argparse
import warnings
import io

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'
warnings.filterwarnings('ignore')

# Mock pkg_resources for setuptools >= 70
import sys
import os
try:
    import pkg_resources
except ImportError:
    import importlib.util
    class MockPkgResources:
        @staticmethod
        def resource_filename(pkg, res):
            spec = importlib.util.find_spec(pkg)
            if spec and spec.origin:
                return os.path.join(os.path.dirname(spec.origin), res)
            return res
    sys.modules['pkg_resources'] = MockPkgResources()

# Ensure librosa exposes resample for resemble-perth compatibility across all librosa versions
try:
    import librosa
    if not hasattr(librosa, 'resample'):
        try:
            from librosa.core import resample as _resample
            librosa.resample = _resample
        except Exception:
            import scipy.signal
            def _resample_fallback(y, orig_sr, target_sr, **kwargs):
                if orig_sr == target_sr:
                    return y
                num = int(len(y) * target_sr / orig_sr)
                return scipy.signal.resample(y, num)
            librosa.resample = _resample_fallback
except Exception:
    pass


class CaptureOutput:
    """Context manager to capture stdout/stderr buffers to prevent JSON corruption."""
    def __init__(self):
        self._original_stdout = None
        self._original_stderr = None
        self._stdout_buf = None
        self._stderr_buf = None
    
    def __enter__(self):
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        self._stdout_buf = io.StringIO()
        self._stderr_buf = io.StringIO()
        sys.stdout = self._stdout_buf
        sys.stderr = self._stderr_buf
        return self
    
    def __exit__(self, *args):
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr
    
    @property
    def stdout(self):
        return self._stdout_buf.getvalue() if self._stdout_buf else ''
    
    @property
    def stderr(self):
        return self._stderr_buf.getvalue() if self._stderr_buf else ''


def check_dependencies():
    missing = []
    try:
        import torch
    except ImportError:
        missing.append('torch')
    try:
        import perth
    except ImportError:
        missing.append('resemble-perth')
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


def cleanup_gpu():
    import gc
    import torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def embed_watermark(audio_path: str, output_path: str, target_sr=16000):
    import librosa
    import soundfile as sf
    import numpy as np
    import perth
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    try:
        audio_np, sr = librosa.load(audio_path, sr=target_sr, mono=True)
        duration = len(audio_np) / sr
        
        cap = CaptureOutput()
        with cap:
            watermarker = perth.PerthImplicitWatermarker()
            watermarked_np = watermarker.apply_watermark(audio_np, sample_rate=sr)
        
        total_orig_sq = np.sum(audio_np ** 2) + 1e-12
        total_diff_sq = np.sum((watermarked_np - audio_np) ** 2)
        sdr = 10.0 * np.log10(total_orig_sq / (total_diff_sq + 1e-12))
        
        sf.write(output_path, watermarked_np, sr)
        
        return {
            'success': True,
            'sdr': float(sdr),
            'duration': duration,
            'sample_rate': sr,
            'method': 'perth'
        }
    finally:
        cleanup_gpu()


def extract_watermark(audio_path: str, target_sr=16000):
    import librosa
    import perth
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    try:
        audio_np, sr = librosa.load(audio_path, sr=target_sr, mono=True)
        duration = len(audio_np) / sr
        
        cap = CaptureOutput()
        with cap:
            watermarker = perth.PerthImplicitWatermarker()
            score = watermarker.get_watermark(audio_np, sample_rate=sr)
        
        score_val = float(score) if score is not None else 0.0
        detected = score_val >= 0.5
        
        return {
            'success': True,
            'detected': detected,
            'confidence': score_val,
            'duration': duration,
            'sample_rate': sr,
            'method': 'perth'
        }
    finally:
        cleanup_gpu()


def check_environment():
    check_dependencies()
    import torch
    import perth
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    cap = CaptureOutput()
    with cap:
        wm = perth.PerthImplicitWatermarker()
    
    return {
        'available': True,
        'message': 'Perth environment ready',
        'details': {
            'device': device,
            'cuda_available': torch.cuda.is_available(),
            'perth_version': getattr(perth, '__version__', '1.0.1')
        }
    }


def main():
    parser = argparse.ArgumentParser(description='ORBIT Perth Watermarking')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    subparsers.add_parser('check', help='Check environment')
    
    embed_parser = subparsers.add_parser('embed', help='Embed watermark')
    embed_parser.add_argument('audio_path', help='Input audio path')
    embed_parser.add_argument('output_path', help='Output audio path')
    embed_parser.add_argument('--sample-rate', type=int, default=16000, help='Sample rate')
    
    extract_parser = subparsers.add_parser('extract', help='Extract watermark')
    extract_parser.add_argument('audio_path', help='Watermarked audio path')
    extract_parser.add_argument('--sample-rate', type=int, default=16000, help='Sample rate')
    
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
            result = embed_watermark(args.audio_path, args.output_path, target_sr=args.sample_rate)
            print(json.dumps(result))
        elif args.command == 'extract':
            check_dependencies()
            result = extract_watermark(args.audio_path, target_sr=args.sample_rate)
            print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            'error': 'processing_error',
            'message': str(e),
            'type': type(e).__name__
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
