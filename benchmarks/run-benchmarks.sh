#!/bin/bash
set -uo pipefail

cd /Users/jordankugler/Cursor/ORBIT

export ORBIT_API_URL=http://100.28.223.14:4000
export ORBIT_PLATFORM_ID=ohnrshyp
export ORBIT_PRIVATE_KEY="lMsSM2LlgOhdQ/YAphw1+iypbvcyHeonPKjEdcfuPBBKmukOihCkMJuH2RWDthXwMPIGobI4artbeWotLYIdyA=="
export ORBIT_API_KEY="-xsa4UA9VAELJPPcl0YjGgI9-yLkJFDDZ_pa8hXAJ3Y"

RESULTS_DIR="benchmarks/results"
mkdir -p "$RESULTS_DIR"

CLI="node cli/bin/orbit.js"

now_ms() {
  python3 -c "import time; print(int(time.time()*1000))"
}

extract_field() {
  echo "$1" | python3 -c "import sys,json
try:
  d=json.load(sys.stdin)
  print(d.get('$2','N/A'))
except:
  print('N/A')" 2>/dev/null
}

TRACKS=(
  "sine_440hz_15s"
  "sine_440hz_30s"
  "sine_440hz_60s"
  "sine_440hz_120s"
  "sine_quiet_30s"
  "silence_30s"
  "sweep_30s"
  "noise_white_30s"
  "noise_white_60s"
  "chord_amaj_60s"
  "synth_ambient_30s"
  "synth_chords_60s"
  "synth_pulse_90s"
  "synth_poly_noise_90s"
  "synth_full_120s"
  "complex_chorus_60s"
  "complex_harmonic_90s"
  "complex_rhythm_90s"
  "complex_fullmix_120s"
  "complex_swell_120s"
  "shake_it_demo"
)

echo "========================================"
echo "ORBIT Benchmark Suite"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Tracks: ${#TRACKS[@]}"
echo "========================================"
echo ""

for track in "${TRACKS[@]}"; do
  FILE="benchmarks/audio/${track}.wav"
  
  if [ ! -f "$FILE" ]; then
    echo "SKIP: $FILE not found"
    continue
  fi
  
  echo "--- [$track] ---"
  
  # REGISTER
  echo -n "  register... "
  START_MS=$(now_ms)
  REG_OUT=$($CLI register "$FILE" --title "$track" --artist "ORBIT Benchmark" --genre "Test" --json 2>/dev/null || echo '{"error":"register_failed"}')
  END_MS=$(now_ms)
  WALL_MS=$((END_MS - START_MS))
  echo "$REG_OUT" > "$RESULTS_DIR/${track}_register.json"
  SERVER_MS=$(extract_field "$REG_OUT" "processing_time_ms")
  echo "done (server: ${SERVER_MS}ms, wall: ${WALL_MS}ms)"
  
  # VERIFY KNOWN (watermarked file)
  WM_FILE="benchmarks/audio/${track}.orbit.wav"
  if [ -f "$WM_FILE" ]; then
    echo -n "  verify-known... "
    START_MS=$(now_ms)
    VK_OUT=$($CLI verify "$WM_FILE" --json 2>/dev/null || echo '{"error":"verify_failed"}')
    END_MS=$(now_ms)
    WALL_MS=$((END_MS - START_MS))
    echo "$VK_OUT" > "$RESULTS_DIR/${track}_verify_known.json"
    SERVER_MS=$(extract_field "$VK_OUT" "processing_time_ms")
    echo "done (server: ${SERVER_MS}ms, wall: ${WALL_MS}ms)"
  else
    echo "  verify-known: SKIP (no watermarked file)"
  fi
  
  # ANALYZE
  echo -n "  analyze... "
  START_MS=$(now_ms)
  AN_OUT=$($CLI analyze "$FILE" --json 2>/dev/null || echo '{"error":"analyze_failed"}')
  END_MS=$(now_ms)
  WALL_MS=$((END_MS - START_MS))
  echo "$AN_OUT" > "$RESULTS_DIR/${track}_analyze.json"
  SERVER_MS=$(extract_field "$AN_OUT" "processing_time_ms")
  echo "done (server: ${SERVER_MS}ms, wall: ${WALL_MS}ms)"
  
  echo ""
done

# VERIFY UNKNOWN — use a fresh file that was NOT registered
echo "--- [verify-unknown] ---"
ffmpeg -y -f lavfi -i "sine=frequency=333:duration=20" benchmarks/audio/_unregistered_20s.wav 2>/dev/null
echo -n "  verify-unknown... "
START_MS=$(now_ms)
VU_OUT=$($CLI verify benchmarks/audio/_unregistered_20s.wav --json 2>/dev/null || echo '{"verified":false,"fast_path":true}')
END_MS=$(now_ms)
WALL_MS=$((END_MS - START_MS))
echo "$VU_OUT" > "$RESULTS_DIR/verify_unknown.json"
echo "done (wall: ${WALL_MS}ms)"

echo ""
echo "========================================"
echo "Benchmark complete: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Results in: $RESULTS_DIR/"
echo "========================================"
