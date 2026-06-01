#!/usr/bin/env python3
"""
ORBIT wav2vec2 genre classifier inference.

Model: m3hrdadfi/wav2vec2-base-100k-gtzan-music-genres
License lineage: Apache-2.0 base
"""

import os

# Limit BLAS/OpenMP threads for Apple Silicon stability.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import argparse
import json
import sys
import time
import warnings

warnings.filterwarnings("ignore")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

MODEL_ID = "m3hrdadfi/wav2vec2-base-100k-gtzan-music-genres"


def print_error(error_type, message, install_hint=None):
    payload = {"error": error_type, "message": message}
    if install_hint:
        payload["install"] = install_hint
    print(json.dumps(payload))


def check_dependencies():
    missing = []
    try:
        import torch  # noqa: F401
    except ImportError:
        missing.append("torch")
    try:
        import librosa  # noqa: F401
    except ImportError:
        missing.append("librosa")
    try:
        import transformers  # noqa: F401
    except ImportError:
        missing.append("transformers")

    if missing:
        print_error(
            "missing_dependencies",
            f"Missing Python packages: {', '.join(missing)}",
            f"pip install {' '.join(missing)}",
        )
        sys.exit(1)


def load_model():
    import torch
    from transformers import pipeline, logging as hf_logging

    hf_logging.set_verbosity_error()
    device = 0 if torch.cuda.is_available() else -1
    classifier = pipeline(
        task="audio-classification",
        model=MODEL_ID,
        device=device,
        trust_remote_code=True,
    )
    return classifier, ("cuda" if device == 0 else "cpu")


def classify(audio_path, top_k=3):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    import librosa

    started = time.time()
    classifier, _device = load_model()
    waveform_np, target_sr = librosa.load(audio_path, sr=16000, mono=True)

    top_k = max(1, int(top_k))
    raw = classifier(
        {"array": waveform_np, "sampling_rate": target_sr},
        top_k=top_k,
    )

    genres = [{"label": item["label"], "confidence": float(item["score"])} for item in raw]

    return {
        "genres": genres,
        "processing_time_ms": int((time.time() - started) * 1000),
    }


def run_check():
    check_dependencies()
    classifier, device = load_model()
    model_cfg = classifier.model.config
    sampling_rate = getattr(classifier.feature_extractor, "sampling_rate", 16000)
    print(
        json.dumps(
            {
                "available": True,
                "message": "Genre classifier environment ready",
                "details": {
                    "model": MODEL_ID,
                    "device": device,
                    "sampling_rate": sampling_rate,
                    "num_labels": int(model_cfg.num_labels),
                },
            }
        )
    )


def main():
    parser = argparse.ArgumentParser(description="wav2vec2 genre classification for ORBIT")
    parser.add_argument("audio_path", nargs="?", help="Path to audio file")
    parser.add_argument("--output", choices=["json"], default="json")
    parser.add_argument("--top-k", type=int, default=3, help="Top genres to return")
    parser.add_argument("--check", action="store_true", help="Check environment/dependencies")
    args = parser.parse_args()

    try:
        if args.check:
            run_check()
            return

        if not args.audio_path:
            raise ValueError("audio_path is required unless --check is used")

        check_dependencies()
        result = classify(args.audio_path, top_k=args.top_k)
        print(json.dumps(result))
    except FileNotFoundError as exc:
        print_error("file_not_found", str(exc))
        sys.exit(1)
    except Exception as exc:
        print_error("processing_error", str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
