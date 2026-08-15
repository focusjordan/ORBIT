"""
Master Validation Suite: AI "Host Tax" & Semiconductor Relief Thesis
===================================================================
Executes the complete three-phase empirical validation pipeline:
- Phase 1: Multimodal Ingestion & IPC Memory-Leak Micro-Benchmark (4 Tiers)
- Phase 2: GPU Training Loop & Accelerator Starvation Stress Test
- Phase 3: Parameterized Macroeconomic, Semiconductor & Thermodynamic Model

Aggregates all measured telemetry into a comprehensive report.
"""

import os
import sys
import subprocess
import json
import argparse
import time
import platform
import psutil
import torch

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from telemetry.numa_profiler import NUMAProfiler


def main():
    parser = argparse.ArgumentParser(description="Master Validation Suite Runner")
    parser.add_argument("--samples", type=int, default=10000, help="Number of samples per benchmark tier")
    parser.add_argument("--epochs", type=int, default=2, help="Number of simulated training epochs")
    parser.add_argument("--workers", type=int, default=4, help="Worker count for multiprocessing / threads")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size")
    parser.add_argument("--data-dir", type=str, default="/tmp/host_tax_master_data", help="Temporary dataset directory")
    parser.add_argument("--gpus", type=int, default=32000, help="Cluster GPU scale for Phase 3 model")
    parser.add_argument("--out", type=str, default="host_tax_empirical_results.json", help="Output aggregated JSON path")
    args = parser.parse_args()

    script_dir = os.path.abspath(os.path.dirname(__file__))
    python_bin = sys.executable

    print("================================================================================")
    print(" EMPIRICAL VALIDATION SUITE: AI HOST TAX & SEMICONDUCTOR RELIEF THESIS")
    print("================================================================================")
    print(f"Host System: {platform.platform()} | Python: {platform.python_version()}")
    print(f"CPUs (Logical/Physical): {psutil.cpu_count(logical=True)} / {psutil.cpu_count(logical=False)} | Total Host RAM: {psutil.virtual_memory().total / (1024**3):.2f} GB")
    
    device_name = "CPU"
    if torch.cuda.is_available():
        device_name = f"CUDA ({torch.cuda.get_device_name(0)})"
    elif torch.backends.mps.is_available():
        device_name = "Apple Silicon Metal (MPS)"
    print(f"Active Accelerator: {device_name}")

    numa = NUMAProfiler()
    numa_snap = numa.get_snapshot()
    print(f"NUMA Nodes Detected: {numa_snap['num_nodes']} (Multi-Socket Interconnect: {numa_snap['numa_available']})")
    print("--------------------------------------------------------------------------------")

    # 1. Execute Phase 1
    print("\n>>> [1/3] EXECUTING PHASE 1: 4-WAY INGESTION & MEMORY-LEAK MICRO-BENCHMARK...")
    p1_json = os.path.join(script_dir, "phase1_results.json")
    p1_cmd = [
        python_bin,
        os.path.join(script_dir, "phase1_ingestion_leak", "run_phase1_comparison.py"),
        "--samples", str(args.samples),
        "--epochs", str(args.epochs),
        "--workers", str(args.workers),
        "--batch-size", str(args.batch_size),
        "--data-dir", args.data_dir,
        "--out", p1_json,
    ]
    p1_proc = subprocess.run(p1_cmd)

    phase1_data = []
    if os.path.exists(p1_json):
        with open(p1_json, "r") as f:
            phase1_data = json.load(f)

    # 2. Execute Phase 2
    print("\n>>> [2/3] EXECUTING PHASE 2: GPU TRAINING LOOP & ACCELERATOR STARVATION TEST...")
    p2_json = os.path.join(script_dir, "phase2_results.json")
    p2_cmd = [
        python_bin,
        os.path.join(script_dir, "phase2_gpu_starvation", "gpu_training_throughput_loop.py"),
        "--samples", str(args.samples),
        "--epochs", str(args.epochs),
        "--workers", str(args.workers),
        "--batch-size", str(args.batch_size),
        "--data-dir", args.data_dir,
        "--out", p2_json,
    ]
    p2_proc = subprocess.run(p2_cmd)

    phase2_data = []
    if os.path.exists(p2_json):
        with open(p2_json, "r") as f:
            phase2_data = json.load(f)

    # 3. Execute Phase 3
    print("\n>>> [3/3] EXECUTING PHASE 3: MACROECONOMIC & SEMICONDUCTOR MODEL...")
    p3_json = os.path.join(script_dir, "phase3_model_results.json")
    p3_cmd = [
        python_bin,
        os.path.join(script_dir, "phase3_semiconductor_model", "datacenter_savings_model.py"),
        "--gpus", str(args.gpus),
        "--out", p3_json,
    ]
    p3_proc = subprocess.run(p3_cmd)

    phase3_data = {}
    if os.path.exists(p3_json):
        with open(p3_json, "r") as f:
            phase3_data = json.load(f)

    # Consolidate into Master Report
    master_report = {
        "timestamp": time.time(),
        "hardware_environment": {
            "platform": platform.platform(),
            "cpu_physical_cores": psutil.cpu_count(logical=False),
            "cpu_logical_cores": psutil.cpu_count(logical=True),
            "total_ram_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "accelerator": device_name,
            "numa_topology": numa_snap,
        },
        "benchmark_config": {
            "samples": args.samples,
            "epochs": args.epochs,
            "workers": args.workers,
            "batch_size": args.batch_size,
        },
        "phase1_ingestion_benchmarks": phase1_data,
        "phase2_gpu_starvation_benchmarks": phase2_data,
        "phase3_macroeconomic_model": phase3_data,
    }

    out_master_path = os.path.abspath(args.out)
    with open(out_master_path, "w") as f:
        json.dump(master_report, f, indent=2)

    print("\n================================================================================")
    print(" EMPIRICAL VALIDATION COMPLETE")
    print(f" Comprehensive JSON results written to: {out_master_path}")
    print("================================================================================")


if __name__ == "__main__":
    main()
