#!/usr/bin/env python3
"""
ORBIT SONICS SpecTTTra detection script.

Runs fake-song detection with SONICS models hosted on Hugging Face.
Outputs strict JSON for Node.js bridge consumption.
"""

import argparse
import json
import os
import sys
import time
import warnings
import logging

# Keep JSON output clean and avoid excessive thread usage on Apple Silicon.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

warnings.filterwarnings("ignore")
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
logging.getLogger("transformers").setLevel(logging.ERROR)

MODEL_VARIANTS = {
    "alpha-120s": "awsaf49/sonics-spectttra-alpha-120s",
    "beta-120s": "awsaf49/sonics-spectttra-beta-120s",
    "gamma-120s": "awsaf49/sonics-spectttra-gamma-120s",
    "gamma-5s": "awsaf49/sonics-spectttra-gamma-5s",
}


def emit_json(payload, exit_code=0):
    print(json.dumps(payload))
    sys.exit(exit_code)


def check_dependencies():
    missing = []
    try:
        import torch  # noqa: F401
    except Exception:
        missing.append("torch")
    try:
        import torchaudio  # noqa: F401
    except Exception:
        missing.append("torchaudio")
    try:
        import sonics  # noqa: F401
    except Exception:
        missing.append("sonics (pip install git+https://github.com/awsaf49/sonics.git)")

    if missing:
        emit_json(
            {
                "error": "missing_dependencies",
                "message": f"Missing Python packages: {', '.join(missing)}",
            },
            exit_code=1,
        )


def select_device(torch_module):
    if torch_module.cuda.is_available():
        return "cuda"
    if hasattr(torch_module.backends, "mps") and torch_module.backends.mps.is_available():
        return "mps"
    return "cpu"


def resolve_model_variant(requested, torch_module):
    if requested and requested != "auto":
        if requested not in MODEL_VARIANTS:
            raise ValueError(
                f"Unsupported model variant '{requested}'. "
                f"Expected one of: {', '.join(MODEL_VARIANTS.keys())}, auto"
            )
        return requested

    # Auto default: gamma-120s is the most accurate variant (99%+ on Suno v3).
    # Local dev without GPU gets the lightweight gamma-5s.
    if torch_module.cuda.is_available():
        return "gamma-120s"
    return "gamma-5s"


def load_audio(audio_path, max_length, target_sr=16000):
    import librosa
    import torch

    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    waveform_np, sample_rate = librosa.load(audio_path, sr=target_sr, mono=True)
    if waveform_np is None or len(waveform_np) == 0:
        raise ValueError("Audio file appears empty")

    max_samples = int(max_length * sample_rate)
    if max_samples > 0 and len(waveform_np) > max_samples:
        waveform_np = waveform_np[:max_samples]

    waveform = torch.from_numpy(waveform_np).unsqueeze(0)
    return waveform.to(dtype=torch.float32), sample_rate


def run_detection(audio_path, model_variant, max_length):
    import torch
    from sonics import HFAudioClassifier

    started = time.time()
    device = select_device(torch)
    model_id = MODEL_VARIANTS[model_variant]
    cache_dir = os.environ.get("HF_HOME") or os.environ.get("TRANSFORMERS_CACHE") or None

    model = HFAudioClassifier.from_pretrained(
        model_id,
        cache_dir=cache_dir,
        map_location=device,
        strict=False,
    )
    model = model.to(device)
    model.eval()

    waveform, _ = load_audio(audio_path, max_length=max_length, target_sr=16000)
    waveform = waveform.to(device)

    with torch.inference_mode():
        logits = model(waveform)
        synthetic_prob = torch.sigmoid(logits).flatten()[0].item()

    real_prob = 1.0 - synthetic_prob
    prediction = "synthetic" if synthetic_prob >= 0.5 else "real"
    confidence = synthetic_prob if prediction == "synthetic" else real_prob

    elapsed_ms = int((time.time() - started) * 1000)
    return {
        "synthetic_probability": round(float(synthetic_prob), 6),
        "real_probability": round(float(real_prob), 6),
        "prediction": prediction,
        "confidence": round(float(confidence), 6),
        "model_variant": model_variant,
        "processing_time_ms": elapsed_ms,
        "device": device,
        "model_id": model_id,
    }


def run_check(model_variant):
    check_dependencies()
    import torch
    from sonics import HFAudioClassifier

    selected = resolve_model_variant(model_variant, torch)
    model_id = MODEL_VARIANTS[selected]
    cache_dir = os.environ.get("HF_HOME") or os.environ.get("TRANSFORMERS_CACHE") or None

    # Validate model availability by loading metadata/weights.
    _ = HFAudioClassifier.from_pretrained(
        model_id,
        cache_dir=cache_dir,
        map_location=select_device(torch),
        strict=False,
    )

    emit_json(
        {
            "available": True,
            "message": "SONICS environment ready",
            "details": {
                "device": select_device(torch),
                "cuda_available": bool(torch.cuda.is_available()),
                "mps_available": bool(
                    hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
                ),
                "model_variant": selected,
                "model_id": model_id,
            },
        }
    )


def build_parser():
    parser = argparse.ArgumentParser(description="ORBIT SONICS detection")
    parser.add_argument("audio_path", nargs="?", help="Path to input audio file")
    parser.add_argument(
        "--model",
        default=os.environ.get("ORBIT_SONICS_MODEL", "auto"),
        help=f"Model variant ({', '.join(MODEL_VARIANTS.keys())}) or auto",
    )
    parser.add_argument(
        "--max-length",
        type=float,
        default=120.0,
        help="Max audio length in seconds (default: 120)",
    )
    parser.add_argument(
        "--output",
        choices=["json"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check Python/model environment and exit",
    )
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.check:
            run_check(args.model)
            return

        if not args.audio_path:
            raise ValueError("audio_path is required unless --check is used")

        check_dependencies()
        import torch

        model_variant = resolve_model_variant(args.model, torch)
        result = run_detection(
            audio_path=args.audio_path,
            model_variant=model_variant,
            max_length=args.max_length,
        )
        emit_json(result)
    except FileNotFoundError as exc:
        emit_json({"error": "file_not_found", "message": str(exc)}, exit_code=1)
    except ValueError as exc:
        emit_json({"error": "validation_error", "message": str(exc)}, exit_code=1)
    except Exception as exc:
        emit_json(
            {
                "error": "processing_error",
                "message": str(exc),
                "type": type(exc).__name__,
            },
            exit_code=1,
        )


if __name__ == "__main__":
    main()
