#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIO_DIR="$ROOT_DIR/audio-under-230"
STEMS_ROOT="$AUDIO_DIR/stems"
PYTHON_BIN="${ORBIT_DEMUCS_PYTHON:-${ORBIT_PYTHON_PATH:-$ROOT_DIR/.venv/bin/python3}}"
DEMUCS_SCRIPT="$ROOT_DIR/scripts/demucs_separate.py"

if [[ ! -d "$AUDIO_DIR" ]]; then
  echo "Audio directory not found: $AUDIO_DIR"
  exit 1
fi

if [[ ! -f "$DEMUCS_SCRIPT" ]]; then
  echo "Demucs script not found: $DEMUCS_SCRIPT"
  exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="python3"
fi

mkdir -p "$STEMS_ROOT"

echo "Pre-separating stems in: $AUDIO_DIR"
shopt -s nullglob
for audio_file in "$AUDIO_DIR"/*.wav "$AUDIO_DIR"/*.mp3 "$AUDIO_DIR"/*.flac; do
  base_name="$(basename "$audio_file")"
  track_name="${base_name%.*}"
  out_dir="$STEMS_ROOT/$track_name"

  if [[ -d "$out_dir" && -f "$out_dir/vocals.wav" && -f "$out_dir/drums.wav" && -f "$out_dir/bass.wav" && -f "$out_dir/other.wav" ]]; then
    echo "Skipping $base_name (stems already exist)"
    continue
  fi

  echo "Processing $base_name"
  mkdir -p "$out_dir"
  "$PYTHON_BIN" "$DEMUCS_SCRIPT" "$audio_file" --output json --output-dir "$out_dir" >/dev/null
done

echo "Done. Stems stored under: $STEMS_ROOT"
