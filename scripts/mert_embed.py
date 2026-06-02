#!/usr/bin/env python3
"""
ORBIT MERT Embedding Script

Semantic audio fingerprinting with MERT

This script generates 768-dimensional embeddings for audio files using
the MERT (Music Embedding Representation Transformer) model.

Usage:
    python scripts/mert_embed.py <audio_path> [--output json|binary]
    
Output (JSON mode, default):
    {"embedding": [...768 floats...], "duration": 123.45, "model": "m-a-p/MERT-v1-95M"}

Output (binary mode):
    768 float32 values written to stdout as raw bytes

Requirements:
    pip install torch transformers librosa numpy

Model:
    m-a-p/MERT-v1-95M (~400MB, downloaded on first use)
    Pre-trained on 160,000 hours of music data
    
See: ORBIT_ENHANCEMENTS.md Section 2 (Neural Fingerprinting)
"""

import sys
import os
import json
import argparse
import warnings

# Suppress ALL warnings for cleaner JSON output
warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # Suppress TensorFlow warnings
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'  # Suppress transformers warnings

# Redirect stderr to suppress any remaining warnings that bypass filterwarnings
import io
_original_stderr = sys.stderr

def check_dependencies():
    """Check if required packages are installed."""
    missing = []
    
    try:
        import torch
    except ImportError:
        missing.append('torch')
    
    try:
        import transformers
    except ImportError:
        missing.append('transformers')
    
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

def load_audio(audio_path, target_sr=24000):
    """Load and resample audio for MERT (expects 24kHz)."""
    import librosa
    import numpy as np
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')
    
    # Load audio (librosa handles most formats via soundfile/audioread)
    # MERT expects 24kHz mono audio
    waveform, sr = librosa.load(audio_path, sr=target_sr, mono=True)
    
    # Get duration
    duration = len(waveform) / sr
    
    return waveform, duration

def get_mert_embedding(audio_path, model_name='m-a-p/MERT-v1-95M', max_length_seconds=30):
    """
    Generate MERT embedding for an audio file.
    
    Args:
        audio_path: Path to audio file
        model_name: HuggingFace model identifier
        max_length_seconds: Maximum audio length to process (for memory efficiency)
    
    Returns:
        dict with embedding (768-dim), duration, model info
    """
    import torch
    import numpy as np
    from transformers import Wav2Vec2FeatureExtractor, AutoModel
    
    # Load audio at MERT's expected sample rate (24kHz)
    waveform, duration = load_audio(audio_path, target_sr=24000)
    
    # Limit length for memory efficiency
    max_samples = int(max_length_seconds * 24000)
    if len(waveform) > max_samples:
        waveform = waveform[:max_samples]
    
    # Load model and processor (cached after first download)
    # Use project's models directory or environment variable
    cache_dir = os.environ.get('ORBIT_MODEL_CACHE_DIR', None)
    if cache_dir is None:
        # Default to project's models directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        cache_dir = os.path.join(script_dir, '..', 'models')
    
    # Suppress stderr during model loading to avoid polluting JSON output
    import contextlib
    with contextlib.redirect_stderr(io.StringIO()):
        processor = Wav2Vec2FeatureExtractor.from_pretrained(
            model_name,
            trust_remote_code=True,
            cache_dir=cache_dir
        )
        
        model = AutoModel.from_pretrained(
            model_name,
            trust_remote_code=True,
            cache_dir=cache_dir
        )
    
    # Move to GPU if available
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = model.to(device)
    model.eval()
    
    # Process audio
    inputs = processor(
        waveform,
        sampling_rate=24000,
        return_tensors='pt'
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    # Generate embedding
    with torch.no_grad():
        outputs = model(**inputs, output_hidden_states=True)
        
        # MERT outputs hidden states - we use the last layer
        # Shape: (batch, sequence, hidden_size=768)
        hidden_states = outputs.hidden_states[-1]
        
        # Mean pooling across time dimension to get fixed-size embedding
        embedding = hidden_states.mean(dim=1).squeeze()
        
        # Normalize for cosine similarity
        embedding = embedding / embedding.norm()
        
        # Convert to numpy
        embedding_np = embedding.cpu().numpy()
    
    return {
        'embedding': embedding_np.tolist(),
        'duration': duration,
        'model': model_name,
        'embedding_dim': len(embedding_np),
        'device': device
    }

def main():
    parser = argparse.ArgumentParser(description='Generate MERT embedding for audio')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--output', choices=['json', 'binary'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--max-length', type=int, default=30,
                        help='Max audio length in seconds (default: 30)')
    parser.add_argument('--model', default='m-a-p/MERT-v1-95M',
                        help='MERT model to use')
    
    args = parser.parse_args()
    
    # Check dependencies first
    check_dependencies()
    
    try:
        import numpy as np
        
        result = get_mert_embedding(
            args.audio_path,
            model_name=args.model,
            max_length_seconds=args.max_length
        )
        
        if args.output == 'json':
            print(json.dumps(result))
        else:
            # Binary output - raw float32 bytes
            embedding = np.array(result['embedding'], dtype=np.float32)
            sys.stdout.buffer.write(embedding.tobytes())
            
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
