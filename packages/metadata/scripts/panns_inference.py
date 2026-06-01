#!/usr/bin/env python3
"""
ORBIT PANNs audio tagging + embedding inference.

Uses panns_inference (MIT) to return:
- Top music-relevant tags from AudioSet labels
- Optional 2048-dim embedding
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
from pathlib import Path
import sys
import time
from urllib.request import urlopen
import warnings

warnings.filterwarnings("ignore")

# Avoid module shadowing: this script is named panns_inference.py.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR in sys.path:
    sys.path.remove(SCRIPT_DIR)

MODEL_NAME = "Cnn14"
MODEL_ID = "Cnn14_mAP=0.431.pth"
EMBEDDING_DIM = 2048
LABELS_CSV_URL = "https://storage.googleapis.com/us_audioset/youtube_corpus/v1/csv/class_labels_indices.csv"
CHECKPOINT_URL = "https://zenodo.org/record/3987831/files/Cnn14_mAP%3D0.431.pth?download=1"

# Curated subset of AudioSet labels that are generally music-relevant.
# This intentionally excludes non-musical classes such as Speech/Dog/Siren.
MUSIC_RELEVANT_TAGS = {
    "Accordion",
    "Acoustic guitar",
    "Banjo",
    "Bass drum",
    "Bass guitar",
    "Cello",
    "Choir",
    "Church organ",
    "Clarinet",
    "Classical music",
    "Cymbal",
    "Didgeridoo",
    "Drum",
    "Drum kit",
    "Electric guitar",
    "Electronic music",
    "Flute",
    "Folk music",
    "French horn",
    "Funk",
    "Glockenspiel",
    "Gong",
    "Gospel music",
    "Guitar",
    "Harmonica",
    "Harp",
    "Harpsichord",
    "Heavy metal",
    "Hi-hat",
    "Hip hop music",
    "Jazz",
    "Keyboard (musical)",
    "Mandolin",
    "Maraca",
    "Marimba, xylophone",
    "Music",
    "Musical instrument",
    "Music of Africa",
    "Music of Asia",
    "Music of Latin America",
    "New-age music",
    "Opera",
    "Orchestra",
    "Organ",
    "Percussion",
    "Piano",
    "Pop music",
    "Progressive rock",
    "Punk rock",
    "Rapping",
    "Reggae",
    "Rhythm and blues",
    "Rock and roll",
    "Salsa music",
    "Sampler",
    "Saxophone",
    "Singing",
    "Sitar",
    "Snare drum",
    "Song",
    "Soul music",
    "Steel guitar, slide guitar",
    "String section",
    "Synthesizer",
    "Tabla",
    "Tambourine",
    "Techno",
    "Thump, thud",
    "Timpani",
    "Trombone",
    "Trumpet",
    "Ukulele",
    "Violin, fiddle",
    "Vibraphone",
    "Vocal music",
}


def print_error(error_type, message, install_hint=None):
    payload = {"error": error_type, "message": message}
    if install_hint:
        payload["install"] = install_hint
    print(json.dumps(payload))


def ensure_panns_labels_csv():
    """Ensure panns_inference label CSV exists without relying on wget."""
    labels_path = Path.home() / "panns_data" / "class_labels_indices.csv"
    if labels_path.is_file():
        return

    labels_path.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(LABELS_CSV_URL, timeout=30) as resp:
        content = resp.read()
    labels_path.write_bytes(content)


def ensure_panns_checkpoint():
    """Ensure Cnn14 checkpoint exists without relying on wget."""
    checkpoint_path = Path.home() / "panns_data" / MODEL_ID
    if checkpoint_path.is_file() and checkpoint_path.stat().st_size >= 300_000_000:
        return str(checkpoint_path)

    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(CHECKPOINT_URL, timeout=120) as resp:
        with checkpoint_path.open("wb") as out_file:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out_file.write(chunk)

    if checkpoint_path.stat().st_size < 300_000_000:
        raise RuntimeError(
            f"Downloaded checkpoint seems incomplete: {checkpoint_path} "
            f"({checkpoint_path.stat().st_size} bytes)"
        )
    return str(checkpoint_path)


def check_dependencies():
    missing = []
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    try:
        import librosa  # noqa: F401
    except ImportError:
        missing.append("librosa")
    try:
        import torch  # noqa: F401
    except ImportError:
        missing.append("torch")
    try:
        ensure_panns_labels_csv()
        import panns_inference  # noqa: F401
    except ImportError:
        missing.append("panns_inference")

    if missing:
        print_error(
            "missing_dependencies",
            f"Missing Python packages: {', '.join(missing)}",
            f"pip install {' '.join(missing)}",
        )
        sys.exit(1)


def run_check():
    check_dependencies()
    import torch
    from panns_inference import AudioTagging

    device = "cuda" if torch.cuda.is_available() else "cpu"
    checkpoint_path = ensure_panns_checkpoint()
    _ = AudioTagging(checkpoint_path=checkpoint_path, device=device)
    print(
        json.dumps(
            {
                "available": True,
                "message": "PANNs environment ready",
                "details": {
                    "model": MODEL_NAME,
                    "model_id": MODEL_ID,
                    "embedding_dim": EMBEDDING_DIM,
                    "device": device,
                    "music_relevant_tags": len(MUSIC_RELEVANT_TAGS),
                },
            }
        )
    )


def run_inference(audio_path, top_k=20, include_embedding=False):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    import librosa
    import numpy as np
    import torch
    from panns_inference import AudioTagging

    started = time.time()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    checkpoint_path = ensure_panns_checkpoint()

    model = AudioTagging(checkpoint_path=checkpoint_path, device=device)
    waveform, _ = librosa.load(audio_path, sr=32000, mono=True)
    waveform = np.asarray(waveform, dtype=np.float32)
    # panns_inference expects batched shape: (batch_size, samples)
    batched_waveform = np.expand_dims(waveform, axis=0)

    clipwise_output, embedding = model.inference(batched_waveform)
    scores = clipwise_output[0]
    labels = model.labels

    tagged = []
    for idx, score in enumerate(scores):
        label = labels[idx]
        if label in MUSIC_RELEVANT_TAGS:
            tagged.append({"label": label, "confidence": float(score)})

    tagged.sort(key=lambda x: x["confidence"], reverse=True)
    tagged = tagged[: max(1, int(top_k))]

    payload = {
        "tags": tagged,
        "processing_time_ms": int((time.time() - started) * 1000),
        "model_info": {
            "model": MODEL_NAME,
            "model_id": MODEL_ID,
            "embedding_dim": EMBEDDING_DIM,
            "device": device,
            "total_labels": len(labels),
            "music_relevant_labels": len(MUSIC_RELEVANT_TAGS),
        },
    }

    if include_embedding:
        payload["embedding"] = embedding[0].astype(np.float32).tolist()

    return payload


def main():
    parser = argparse.ArgumentParser(description="PANNs inference for ORBIT")
    parser.add_argument("audio_path", nargs="?", help="Path to audio file")
    parser.add_argument("--output", choices=["json"], default="json")
    parser.add_argument("--top-k", type=int, default=20, help="Top tags to return")
    parser.add_argument(
        "--include-embedding",
        action="store_true",
        help="Include 2048-dim embedding output",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check environment/dependencies and exit",
    )
    args = parser.parse_args()

    try:
        if args.check:
            run_check()
            return

        if not args.audio_path:
            raise ValueError("audio_path is required unless --check is used")

        check_dependencies()
        result = run_inference(
            args.audio_path,
            top_k=args.top_k,
            include_embedding=args.include_embedding,
        )
        print(json.dumps(result))
    except FileNotFoundError as exc:
        print_error("file_not_found", str(exc))
        sys.exit(1)
    except Exception as exc:
        print_error("processing_error", str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
