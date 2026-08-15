#!/usr/bin/env bash
# ==============================================================================
# Phase 2: Memory Constriction & Starvation Stress-Test Harness
# ==============================================================================
# Step-sweeps memory limits to pinpoint the exact failure boundary where standard
# Python stacks hit OOM SIGKILL / severe paging, while Ohnrscript DOD sustains 100% throughput.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python3"

if [ ! -f "${PYTHON_BIN}" ]; then
    PYTHON_BIN="python3"
fi

DATA_DIR="/tmp/host_tax_constriction_data"
mkdir -p "${DATA_DIR}"

SAMPLES=5000
EPOCHS=2
BATCH_SIZE=64
WORKERS=2

echo "================================================================================"
echo " PHASE 2: MEMORY CONSTRICTION STEP-SWEEP STRESS TEST"
echo "================================================================================"
echo "Evaluating all 4 Tiers across memory boundary steps..."
echo "Configuration: Samples=${SAMPLES} | Epochs=${EPOCHS} | Batch Size=${BATCH_SIZE} | Workers=${WORKERS}"
echo ""

# Memory limits in MB: 0 (unconstrained), 2048MB, 1024MB, 512MB
MEMORY_STEPS=(0 2048 1024 512)

RESULTS_FILE="${SCRIPT_DIR}/constriction_sweep_results.json"
echo "[" > "${RESULTS_FILE}"

FIRST=true

for MEM_LIMIT in "${MEMORY_STEPS[@]}"; do
    STEP_LABEL="${MEM_LIMIT}MB"
    if [ "${MEM_LIMIT}" -eq 0 ]; then
        STEP_LABEL="Unconstrained"
    fi

    echo "--------------------------------------------------------------------------------"
    echo ">>> Running Stress Sweep at Memory Limit: ${STEP_LABEL}"
    echo "--------------------------------------------------------------------------------"

    STEP_OUT="/tmp/step_${MEM_LIMIT}_results.json"

    # Execute GPU training throughput loop under memory constriction
    ${PYTHON_BIN} "${SCRIPT_DIR}/gpu_training_throughput_loop.py" \
        --samples ${SAMPLES} \
        --epochs ${EPOCHS} \
        --batch-size ${BATCH_SIZE} \
        --workers ${WORKERS} \
        --data-dir "${DATA_DIR}" \
        --memory-limit-mb ${MEM_LIMIT} \
        --out "${STEP_OUT}" || true

    if [ -f "${STEP_OUT}" ]; then
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            echo "," >> "${RESULTS_FILE}"
        fi
        echo "  {\"limit_mb\": ${MEM_LIMIT}, \"label\": \"${STEP_LABEL}\", \"results\": $(cat "${STEP_OUT}")}" >> "${RESULTS_FILE}"
        rm -f "${STEP_OUT}"
    fi
done

echo "]" >> "${RESULTS_FILE}"

echo ""
echo "================================================================================"
echo " CONSTRICTION STRESS-TEST COMPLETE"
echo " Results aggregated in: ${RESULTS_FILE}"
echo "================================================================================"
