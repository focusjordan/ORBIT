#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# ORBIT Demo Script — LAUNCH Investor Call
#
# Usage:  ./run-demo.sh <audio-file> [orbit-api-url]
#
# The founder hits Enter to advance each step. Zero typing required.
# ============================================================================

ORBIT_CLI="$(cd "$(dirname "$0")/../cli/bin" && pwd)/orbit.js"
DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env if present (so credentials don't need to be exported manually)
if [ -f "$DEMO_DIR/.env" ]; then
  set -a
  . "$DEMO_DIR/.env"
  set +a
fi

if [ $# -lt 1 ]; then
  echo ""
  echo "  Usage: ./run-demo.sh <audio-file> [orbit-api-url]"
  echo ""
  echo "  Example:"
  echo "    ./run-demo.sh ~/music/midnight-drive.wav https://orbit.ohnrshyp.com"
  echo ""
  exit 1
fi

AUDIO_FILE="$1"
AUDIO_DIR="$(dirname "$AUDIO_FILE")"
AUDIO_BASE="$(basename "$AUDIO_FILE")"
AUDIO_EXT="${AUDIO_BASE##*.}"
AUDIO_NAME="${AUDIO_BASE%.*}"
WATERMARKED_FILE="${AUDIO_DIR}/${AUDIO_NAME}.orbit.${AUDIO_EXT}"

if [ $# -ge 2 ]; then
  export ORBIT_API_URL="$2"
fi

if [ ! -f "$AUDIO_FILE" ]; then
  echo "  Error: Audio file not found: $AUDIO_FILE"
  exit 1
fi

# Colors
CYAN='\033[1;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

step=0
total=8

narrate() {
  step=$((step + 1))
  echo ""
  echo -e "${DIM}──────────────────────────────────────────────────────────${RESET}"
  echo -e "${CYAN}${BOLD}  [$step/$total] $1${RESET}"
  echo -e "${DIM}──────────────────────────────────────────────────────────${RESET}"
  echo ""
}

pause() {
  echo -e "${DIM}  Press Enter to continue...${RESET}"
  read -r
}

# ============================================================================
# DEMO START
# ============================================================================

clear
echo ""
echo -e "${BOLD}  ╔═══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}  ║                                                   ║${RESET}"
echo -e "${BOLD}  ║   ${CYAN}ORBIT${RESET}${BOLD}  — Audio Provenance Protocol             ║${RESET}"
echo -e "${BOLD}  ║   Origin-Based Identity & Rights Transfer         ║${RESET}"
echo -e "${BOLD}  ║                                                   ║${RESET}"
echo -e "${BOLD}  ╚═══════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${DIM}Audio file: ${AUDIO_FILE}${RESET}"
echo -e "  ${DIM}Server:     ${ORBIT_API_URL:-http://localhost:4000}${RESET}"
echo ""
pause

# Step 1: Status check
narrate "First, let's verify we're connected to the ORBIT infrastructure."
node "$ORBIT_CLI" status
pause

# Step 2: Register
narrate "Now we register a track. ORBIT fingerprints it, watermarks it, runs AI analysis, and checks it against 30 million known recordings."
node "$ORBIT_CLI" register "$AUDIO_FILE" \
  --title "Midnight Drive" \
  --artist "The Neon Collective" \
  --genre "Electronic" \
  --isrc "USRC12400001"
pause

# Step 3: Verify the watermarked file
narrate "The watermarked file carries its own identity. Any platform can verify it."
if [ -f "$WATERMARKED_FILE" ]; then
  node "$ORBIT_CLI" verify "$WATERMARKED_FILE"
else
  echo -e "  ${DIM}(Using original file — watermarked file would be at ${WATERMARKED_FILE})${RESET}"
  node "$ORBIT_CLI" verify "$AUDIO_FILE"
fi
pause

# Step 4: Analyze
narrate "Standalone AI analysis — genre, mood, BPM, key, instruments, vocals."
node "$ORBIT_CLI" analyze "$AUDIO_FILE"
pause

# Step 5: AI Detection
narrate "AI-generated music detection. Multi-signal analysis."
node "$ORBIT_CLI" detect "$AUDIO_FILE"
pause

# Step 6: DDEX Ingest
narrate "We also support DDEX, the industry standard. This ingests a label's existing metadata package."
node "$ORBIT_CLI" ingest "${DEMO_DIR}/sample-release.xml" --dry-run --owner-id demo-owner
pause

# Step 7: Batch Processing
narrate "And batch processing. Point it at a catalog, it processes everything. This is what an agent runs."
node "$ORBIT_CLI" batch "$AUDIO_DIR" --command verify --dry-run
pause

# Step 8: Identity
narrate "Every operation is authenticated and audited."
node "$ORBIT_CLI" whoami

echo ""
echo -e "${DIM}──────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "${CYAN}${BOLD}  Demo complete.${RESET}"
echo ""
echo -e "  ${DIM}ORBIT — Origin-Based Identity & Rights Transfer Protocol${RESET}"
echo ""
