"""
Phase 1 Orchestrator: 4-Way Ingestion & Memory Leak Micro-Benchmark
===================================================================
Runs all four tiers in completely isolated subprocesses to prevent IC / heap cross-contamination:
- Tier 1: Standard PyTorch DataLoader (Python Objects / Dicts)
- Tier 2: NumPy Memmap (Megatron-LM Pre-tokenized Array Pattern)
- Tier 3: WebDataset / Sharded Stream (TAR Archive Streaming)
- Tier 4: Ohnrscript DOD Zero-Copy Runtime (Arenas + @binaryLayout + MPSC Queues)

Produces a comparative markdown summary table and exports `phase1_results.json`.
"""

import os
import sys
import subprocess
import json
import argparse
import tempfile
from typing import List, Dict, Any


def run_tier_subprocess(script_name: str, samples: int, epochs: int, workers: int, batch_size: int, data_dir: str) -> Dict[str, Any]:
    script_path = os.path.join(os.path.dirname(__file__), script_name)
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        out_json = tmp.name

    cmd = [
        sys.executable,
        script_path,
        "--samples", str(samples),
        "--epochs", str(epochs),
        "--workers", str(workers),
        "--batch-size", str(batch_size),
        "--data-dir", data_dir,
        "--out", out_json,
    ]

    print(f"\n>>> Executing {script_name}...")
    proc = subprocess.run(cmd, capture_output=False)
    if proc.returncode != 0:
        print(f"Error running {script_name} (code: {proc.returncode})")

    result = {}
    if os.path.exists(out_json):
        try:
            with open(out_json, "r") as f:
                result = json.load(f)
            os.remove(out_json)
        except Exception:
            pass

    return result


def format_markdown_table(results: List[Dict[str, Any]]) -> str:
    headers = [
        "Architecture Tier",
        "Peak RSS (MB)",
        "Delta RSS (MB)",
        "Minor Page Faults",
        "GC Collections",
        "CoW Inflation",
        "Throughput (samp/s)",
        "Bandwidth (MB/s)",
    ]
    rows = []
    for r in results:
        rows.append([
            r.get("tier", "Unknown"),
            f"{r.get('peak_rss_mb', 0.0):.1f}",
            f"{r.get('delta_rss_mb', 0.0):.1f}",
            f"{r.get('total_minor_page_faults', 0):,}",
            f"{r.get('gc_collections', 0):,}",
            f"{r.get('cow_inflation_ratio', 1.0):.2f}x",
            f"{r.get('throughput_samples_sec', 0.0):,.1f}",
            f"{r.get('throughput_mb_sec', 0.0):.1f}",
        ])

    col_widths = [max(len(str(row[i])) for row in [headers] + rows) for i in range(len(headers))]

    header_line = "| " + " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers)) + " |"
    sep_line = "| " + " | ".join("-" * col_widths[i] for i in range(len(headers))) + " |"
    data_lines = ["| " + " | ".join(str(row[i]).ljust(col_widths[i]) for i in range(len(headers))) + " |" for row in rows]

    return "\n".join([header_line, sep_line] + data_lines)


def main():
    parser = argparse.ArgumentParser(description="Phase 1: 4-Way Ingestion Micro-Benchmark Orchestrator")
    parser.add_argument("--samples", type=int, default=20000, help="Number of synthetic samples")
    parser.add_argument("--epochs", type=int, default=3, help="Number of simulated training epochs")
    parser.add_argument("--workers", type=int, default=4, help="Number of worker processes/threads")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size")
    parser.add_argument("--data-dir", type=str, default="/tmp/host_tax_data", help="Directory for synthetic dataset files")
    parser.add_argument("--out", type=str, default="phase1_results.json", help="Output JSON path")
    args = parser.parse_args()

    print("================================================================================")
    print(" PHASE 1: MULTIMODAL INGESTION & KERNEL MEMORY-LEAK MICRO-BENCHMARK")
    print("================================================================================")
    print(f"Configuration: {args.samples:,} samples | {args.epochs} epochs | {args.workers} workers | batch size: {args.batch_size}")

    scripts = [
        "bench_standard_dataloader.py",
        "bench_numpy_memmap.py",
        "bench_webdataset.py",
        "bench_ohnrscript_zero_copy.py",
    ]

    all_results = []
    for script in scripts:
        res = run_tier_subprocess(
            script_name=script,
            samples=args.samples,
            epochs=args.epochs,
            workers=args.workers,
            batch_size=args.batch_size,
            data_dir=args.data_dir,
        )
        if res:
            all_results.append(res)

    print("\n================================================================================")
    print(" PHASE 1 EMPIRICAL RESULTS SUMMARY")
    print("================================================================================")
    md_table = format_markdown_table(all_results)
    print(md_table)

    # Save to JSON
    out_path = os.path.abspath(args.out)
    with open(out_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\n[Phase 1] JSON metrics exported to: {out_path}")


if __name__ == "__main__":
    main()
