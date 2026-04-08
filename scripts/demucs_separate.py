#!/usr/bin/env python3
"""
ORBIT Demucs separation script.

Splits an input audio file into htdemucs stems:
- vocals.wav
- drums.wav
- bass.wav
- other.wav
"""

import os

# Limit BLAS/OpenMP threading for Apple Silicon stability.
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('MKL_NUM_THREADS', '1')

import argparse
import json
import sys
import tempfile
import time


def emit_json(payload):
    print(json.dumps(payload))


def emit_error(code, message, details=None, exit_code=1):
    payload = {
        'error': code,
        'message': message,
    }
    if details is not None:
        payload['details'] = details
    emit_json(payload)
    sys.exit(exit_code)


def check_demucs():
    try:
        import torch  # noqa: F401
        from demucs.pretrained import get_model  # noqa: F401
    except Exception as exc:
        emit_error(
            'missing_dependencies',
            'Demucs is not installed. Install with: pip install demucs',
            details={'exception': str(exc)}
        )

    emit_json({
        'available': True,
        'message': 'Demucs environment ready',
        'model': 'htdemucs'
    })


def separate_audio(audio_path, output_dir):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')

    import torch
    from demucs.apply import apply_model
    from demucs.audio import AudioFile
    from demucs.pretrained import get_model
    import soundfile as sf

    start = time.time()

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model_name = 'htdemucs'
    model = get_model(model_name)
    model.to(device)
    model.eval()

    wav = AudioFile(audio_path).read(
        streams=0,
        samplerate=model.samplerate,
        channels=model.audio_channels
    )
    if wav.dim() == 1:
        wav = wav.unsqueeze(0)

    with torch.no_grad():
        estimates = apply_model(
            model,
            wav.unsqueeze(0),
            device=device,
            split=True,
            overlap=0.25,
            progress=False
        )[0]

    estimates = estimates.cpu()
    os.makedirs(output_dir, exist_ok=True)

    stems = {}
    for source_idx, source_name in enumerate(model.sources):
        stem_tensor = estimates[source_idx]
        stem_path = os.path.join(output_dir, f'{source_name}.wav')
        stem_np = stem_tensor.numpy().T
        sf.write(stem_path, stem_np, samplerate=model.samplerate)
        stems[source_name] = stem_path

    elapsed_ms = round((time.time() - start) * 1000)
    return {
        'stems': {
            'vocals': stems.get('vocals'),
            'drums': stems.get('drums'),
            'bass': stems.get('bass'),
            'other': stems.get('other'),
        },
        'processingTimeMs': elapsed_ms,
        'model': {
            'name': model_name,
            'device': device,
            'sources': list(model.sources),
            'sampleRate': model.samplerate,
        },
        'outputDir': output_dir,
    }


def main():
    parser = argparse.ArgumentParser(description='Separate audio into Demucs stems')
    parser.add_argument('audio_path', nargs='?', help='Path to input audio file')
    parser.add_argument('--output-dir', help='Directory where stem wav files will be written')
    parser.add_argument('--output', choices=['json'], default='json', help='Output format (default: json)')
    parser.add_argument('--check', action='store_true', help='Check Demucs installation and exit')

    args = parser.parse_args()

    if args.check:
        check_demucs()
        return

    if not args.audio_path:
        emit_error('invalid_arguments', 'audio_path is required unless --check is used')

    output_dir = args.output_dir or tempfile.mkdtemp(prefix='orbit-demucs-')

    try:
        result = separate_audio(args.audio_path, output_dir)
        emit_json(result)
    except FileNotFoundError as exc:
        emit_error('file_not_found', str(exc))
    except MemoryError:
        emit_error('out_of_memory', 'Insufficient memory while running Demucs')
    except RuntimeError as exc:
        message = str(exc)
        if 'out of memory' in message.lower():
            emit_error('out_of_memory', 'Insufficient memory while running Demucs', details={'exception': message})
        emit_error('processing_error', message, details={'type': 'RuntimeError'})
    except Exception as exc:
        emit_error('processing_error', str(exc), details={'type': type(exc).__name__})


if __name__ == '__main__':
    main()
