"""
Phase 2: GPU Training Loop & Starvation Micro-Benchmark
======================================================
Simulates a high-throughput multimodal neural training loop on available hardware accelerators
(NVIDIA CUDA, Apple Silicon Metal/MPS, or CPU fallback).

Measures:
1. GPU Starvation Time (nanoseconds / milliseconds accelerator sits idle waiting for CPU batch arrival).
2. Memory Bus Saturation / Ingestion Throughput (GB/s).
3. Resilience under container/process memory constriction (RLIMIT_AS / memory bounds).
"""

import os
import sys
import gc
import time
import argparse
import json
import resource
import torch
import torch.nn as nn
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from telemetry.kernel_smaps import MemoryProfilerContext
from phase1_ingestion_leak.dataset_generator import (
    SyntheticMultimodalDataset,
    AUDIO_LEN,
    EMBEDDING_DIM,
    SPEC_DIM,
    SAMPLE_ALIGNED_SIZE,
    HEADER_SIZE,
)
from phase1_ingestion_leak.bench_standard_dataloader import StandardPythonDataset, custom_collate_fn
from phase1_ingestion_leak.bench_numpy_memmap import NumpyMemmapDataset
from phase1_ingestion_leak.bench_webdataset import ShardedTarStreamDataset, webdataset_collate_fn
from phase1_ingestion_leak.bench_ohnrscript_zero_copy import OhnrscriptDODArenaPool, OhnrscriptWorkerQueue
from torch.utils.data import DataLoader


class MultimodalProjectionModel(nn.Module):
    """Realistic multimodal audio embedding & projection neural network."""

    def __init__(self, audio_len: int = AUDIO_LEN, embed_dim: int = EMBEDDING_DIM):
        super().__init__()
        # Audio 1D Conv front-end
        self.conv1 = nn.Conv1d(1, 32, kernel_size=128, stride=64)
        self.conv2 = nn.Conv1d(32, 64, kernel_size=16, stride=8)
        self.fc_audio = nn.Linear(64 * 30, embed_dim)
        # Multimodal fusion MLP
        self.fusion = nn.Sequential(
            nn.Linear(embed_dim * 2, 1024),
            nn.ReLU(),
            nn.Linear(1024, 512),
            nn.ReLU(),
            nn.Linear(512, 128),
        )

    def forward(self, audio_batch, embed_batch):
        # audio_batch: [B, AUDIO_LEN] -> [B, 1, AUDIO_LEN]
        x_audio = audio_batch.unsqueeze(1)
        x_audio = torch.relu(self.conv1(x_audio))
        x_audio = torch.relu(self.conv2(x_audio))
        x_audio = x_audio.flatten(1)
        x_audio = self.fc_audio(x_audio)
        # Concatenate audio features with text/token embeddings
        combined = torch.cat([x_audio, embed_batch], dim=1)
        return self.fusion(combined)


def get_optimal_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def sync_device(device: torch.device):
    if device.type == "cuda":
        torch.cuda.synchronize()
    elif device.type == "mps":
        torch.mps.synchronize()


def run_gpu_tier(tier_name: str, num_samples: int, epochs: int, batch_size: int, workers: int, data_dir: str, device: torch.device) -> dict:
    print(f"\n>>> Running GPU Training Loop for {tier_name} on {device.type.upper()}...")
    model = MultimodalProjectionModel().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    loss_fn = nn.MSELoss()

    starvation_times_ns = []
    compute_times_ns = []
    total_samples = 0
    total_batches = 0

    profiler = MemoryProfilerContext(sample_interval_sec=0.25)
    gc.collect()
    profiler.start()
    loop_start = time.perf_counter()

    oom_occurred = False
    error_msg = None

    try:
        if tier_name == "tier1_standard":
            dataset = StandardPythonDataset(num_samples=num_samples)
            loader = DataLoader(
                dataset,
                batch_size=batch_size,
                shuffle=True,
                num_workers=workers,
                pin_memory=(device.type == "cuda"),
                collate_fn=custom_collate_fn,
            )
            for epoch in range(epochs):
                t_last_compute_end = time.perf_counter_ns()
                for batch in loader:
                    t_batch_ready = time.perf_counter_ns()
                    starvation_times_ns.append(t_batch_ready - t_last_compute_end)

                    audio = batch["audio"].to(device, non_blocking=True)
                    embed = batch["embeddings"].to(device, non_blocking=True)
                    target = torch.zeros(len(audio), 128, device=device)

                    sync_device(device)
                    t_compute_start = time.perf_counter_ns()

                    optimizer.zero_grad()
                    out = model(audio, embed)
                    loss = loss_fn(out, target)
                    loss.backward()
                    optimizer.step()

                    sync_device(device)
                    t_compute_end = time.perf_counter_ns()
                    compute_times_ns.append(t_compute_end - t_compute_start)

                    total_samples += len(audio)
                    total_batches += 1
                    t_last_compute_end = time.perf_counter_ns()
                profiler.record()

        elif tier_name == "tier2_memmap":
            dataset = NumpyMemmapDataset(data_dir=data_dir, num_samples=num_samples)
            loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=workers, pin_memory=(device.type == "cuda"))
            for epoch in range(epochs):
                t_last_compute_end = time.perf_counter_ns()
                for audio, embed, spec, ids in loader:
                    t_batch_ready = time.perf_counter_ns()
                    starvation_times_ns.append(t_batch_ready - t_last_compute_end)

                    audio = audio.to(device, non_blocking=True)
                    embed = embed.to(device, non_blocking=True)
                    target = torch.zeros(len(audio), 128, device=device)

                    sync_device(device)
                    t_compute_start = time.perf_counter_ns()

                    optimizer.zero_grad()
                    out = model(audio, embed)
                    loss = loss_fn(out, target)
                    loss.backward()
                    optimizer.step()

                    sync_device(device)
                    t_compute_end = time.perf_counter_ns()
                    compute_times_ns.append(t_compute_end - t_compute_start)

                    total_samples += len(audio)
                    total_batches += 1
                    t_last_compute_end = time.perf_counter_ns()
                profiler.record()

        elif tier_name == "tier3_webdataset":
            dataset = ShardedTarStreamDataset(data_dir=data_dir, num_samples=num_samples)
            loader = DataLoader(dataset, batch_size=batch_size, num_workers=workers, pin_memory=(device.type == "cuda"), collate_fn=webdataset_collate_fn)
            for epoch in range(epochs):
                t_last_compute_end = time.perf_counter_ns()
                for audio, embed, ids, genres in loader:
                    t_batch_ready = time.perf_counter_ns()
                    starvation_times_ns.append(t_batch_ready - t_last_compute_end)

                    audio = audio.to(device, non_blocking=True)
                    embed = embed.to(device, non_blocking=True)
                    target = torch.zeros(len(audio), 128, device=device)

                    sync_device(device)
                    t_compute_start = time.perf_counter_ns()

                    optimizer.zero_grad()
                    out = model(audio, embed)
                    loss = loss_fn(out, target)
                    loss.backward()
                    optimizer.step()

                    sync_device(device)
                    t_compute_end = time.perf_counter_ns()
                    compute_times_ns.append(t_compute_end - t_compute_start)

                    total_samples += len(audio)
                    total_batches += 1
                    t_last_compute_end = time.perf_counter_ns()
                profiler.record()

        elif tier_name == "tier4_ohnrscript":
            arena_file = os.path.join(data_dir, "tier4_ohnr_arena", "multimodal_arena.bin")
            pool = OhnrscriptDODArenaPool(arena_file_path=arena_file, num_samples=num_samples, batch_size=batch_size, num_arenas=16)
            all_indices = np.arange(num_samples)

            for epoch in range(epochs):
                np.random.shuffle(all_indices)
                batches = [all_indices[i : i + batch_size] for i in range(0, num_samples, batch_size)]
                worker_queue = OhnrscriptWorkerQueue(pool=pool, num_workers=workers)
                worker_queue.start_workers(batches)

                batches_consumed = 0
                t_last_compute_end = time.perf_counter_ns()

                while batches_consumed < len(batches):
                    arena_buf, batch_len = worker_queue.mailbox.get()
                    t_batch_ready = time.perf_counter_ns()
                    starvation_times_ns.append(t_batch_ready - t_last_compute_end)

                    # Direct zero-copy slice to device
                    # View raw memory block directly into float32 tensors
                    raw_floats = torch.frombuffer(
                        arena_buf,
                        dtype=torch.float32,
                        count=(batch_len * (SAMPLE_ALIGNED_SIZE // 4)),
                        offset=0,
                    ).reshape(batch_len, SAMPLE_ALIGNED_SIZE // 4)

                    # Fixed-offset layout extraction
                    audio = raw_floats[:, 8 : 8 + AUDIO_LEN].to(device, non_blocking=True)
                    embed = raw_floats[:, 8 + AUDIO_LEN : 8 + AUDIO_LEN + EMBEDDING_DIM].to(device, non_blocking=True)
                    target = torch.zeros(batch_len, 128, device=device)

                    sync_device(device)
                    t_compute_start = time.perf_counter_ns()

                    optimizer.zero_grad()
                    out = model(audio, embed)
                    loss = loss_fn(out, target)
                    loss.backward()
                    optimizer.step()

                    sync_device(device)
                    t_compute_end = time.perf_counter_ns()
                    compute_times_ns.append(t_compute_end - t_compute_start)

                    # Return arena to pool
                    pool.free_arenas.put(arena_buf)
                    total_samples += batch_len
                    total_batches += 1
                    batches_consumed += 1
                    t_last_compute_end = time.perf_counter_ns()

                worker_queue.wait_completion()
                profiler.record()
            pool.close()

    except (MemoryError, RuntimeError) as e:
        oom_occurred = True
        error_msg = str(e)
        print(f"  [!] Exception during {tier_name}: {e}")

    loop_total_time = time.perf_counter() - loop_start
    summary = profiler.finish()

    avg_starvation_ms = (np.mean(starvation_times_ns) / 1e6) if starvation_times_ns else 0.0
    p99_starvation_ms = (np.percentile(starvation_times_ns, 99) / 1e6) if starvation_times_ns else 0.0
    avg_compute_ms = (np.mean(compute_times_ns) / 1e6) if compute_times_ns else 0.0

    gpu_idle_pct = (
        (sum(starvation_times_ns) / (sum(starvation_times_ns) + sum(compute_times_ns)) * 100.0)
        if (starvation_times_ns and compute_times_ns)
        else 0.0
    )

    return {
        "tier": tier_name,
        "device": device.type,
        "total_samples": total_samples,
        "total_batches": total_batches,
        "total_time_sec": round(loop_total_time, 2),
        "avg_starvation_ms": round(avg_starvation_ms, 3),
        "p99_starvation_ms": round(p99_starvation_ms, 3),
        "avg_compute_ms": round(avg_compute_ms, 3),
        "gpu_idle_percent": round(gpu_idle_pct, 2),
        "peak_rss_mb": summary["peak_rss_mb"],
        "delta_rss_mb": summary["delta_rss_mb"],
        "oom_occurred": oom_occurred,
        "error_message": error_msg,
    }


def main():
    parser = argparse.ArgumentParser(description="Phase 2: GPU Training & Starvation Micro-Benchmark")
    parser.add_argument("--samples", type=int, default=10000)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--data-dir", type=str, default="/tmp/host_tax_data")
    parser.add_argument("--memory-limit-mb", type=int, default=0, help="Constrict virtual memory limit (RLIMIT_AS) in MB (0 = unconstrained)")
    parser.add_argument("--out", type=str, default="phase2_results.json")
    args = parser.parse_args()

    if args.memory_limit_mb > 0:
        limit_bytes = args.memory_limit_mb * 1024 * 1024
        try:
            resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
            print(f"[Phase 2] Constricted process address space (RLIMIT_AS) to {args.memory_limit_mb} MB")
        except Exception as e:
            print(f"[Phase 2] Warning: Failed to set RLIMIT_AS: {e}")

    device = get_optimal_device()
    print("================================================================================")
    print(" PHASE 2: GPU STARVATION & CONTAINER CONSTRICTION STRESS TEST")
    print("================================================================================")
    print(f"Accelerator: {device.type.upper()} | Samples: {args.samples:,} | Epochs: {args.epochs} | Workers: {args.workers}")

    # Ensure dataset exists
    gen = SyntheticMultimodalDataset(output_dir=args.data_dir, num_samples=args.samples)
    gen.generate_all()

    tiers = ["tier1_standard", "tier2_memmap", "tier3_webdataset", "tier4_ohnrscript"]
    results = []

    for t in tiers:
        res = run_gpu_tier(
            tier_name=t,
            num_samples=args.samples,
            epochs=args.epochs,
            batch_size=args.batch_size,
            workers=args.workers,
            data_dir=args.data_dir,
            device=device,
        )
        results.append(res)

    print("\n================================================================================")
    print(" PHASE 2 ACCELERATOR & STARVATION METRICS SUMMARY")
    print("================================================================================")
    print(f"{'Tier':<22} | {'Device':<6} | {'Avg Starve (ms)':<15} | {'p99 Starve (ms)':<15} | {'GPU Idle %':<10} | {'Peak RSS (MB)':<13} | {'OOM Status'}")
    print("-" * 105)
    for r in results:
        oom_str = "CRASH (OOM)" if r["oom_occurred"] else "PASS"
        print(f"{r['tier']:<22} | {r['device']:<6} | {r['avg_starvation_ms']:<15} | {r['p99_starvation_ms']:<15} | {r['gpu_idle_percent']:<10}% | {r['peak_rss_mb']:<13} | {oom_str}")

    with open(args.out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n[Phase 2] JSON metrics exported to: {args.out}")


if __name__ == "__main__":
    main()
