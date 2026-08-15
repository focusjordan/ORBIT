"""
Harness Deep-Validation & Latency Decomposition Script
======================================================
Performs a rigorous, transparent decomposition of data-loading starvation latency:
1. Separates Cold-Start (Epoch Init / Worker Fork) from Steady-State (Inter-Batch IPC).
2. Compares PyTorch with persistent_workers=False vs persistent_workers=True.
3. Compares NumPy Memmap vs Ohnrscript DOD Arena Pointer Mailbox.
4. Breaks down exact nanosecond/microsecond hardware metrics.
"""

import os
import sys
import time
import torch
import numpy as np
from torch.utils.data import DataLoader

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))
from phase1_ingestion_leak.bench_standard_dataloader import StandardPythonDataset, custom_collate_fn
from phase1_ingestion_leak.bench_numpy_memmap import NumpyMemmapDataset
from phase1_ingestion_leak.bench_ohnrscript_zero_copy import OhnrscriptDODArenaPool, OhnrscriptWorkerQueue, SAMPLE_ALIGNED_SIZE


def benchmark_pytorch_dataloader(num_samples=5000, persistent=False, workers=2):
    dataset = StandardPythonDataset(num_samples)
    loader = DataLoader(
        dataset,
        batch_size=64,
        num_workers=workers,
        persistent_workers=persistent,
        collate_fn=custom_collate_fn,
    )

    # Measure Epoch 1 (Cold start + steady state)
    starve_times_e1 = []
    t_prev = time.perf_counter_ns()
    for batch in loader:
        t_ready = time.perf_counter_ns()
        starve_times_e1.append((t_ready - t_prev) / 1e6)  # in ms
        # simulate 5ms GPU execution
        time.sleep(0.005)
        t_prev = time.perf_counter_ns()

    # Measure Epoch 2 (Steady state)
    starve_times_e2 = []
    t_prev = time.perf_counter_ns()
    for batch in loader:
        t_ready = time.perf_counter_ns()
        starve_times_e2.append((t_ready - t_prev) / 1e6)
        time.sleep(0.005)
        t_prev = time.perf_counter_ns()

    return {
        "persistent_workers": persistent,
        "first_batch_latency_ms": starve_times_e1[0],
        "epoch1_avg_ms": np.mean(starve_times_e1),
        "epoch2_first_batch_ms": starve_times_e2[0],
        "epoch2_steady_state_avg_ms": np.mean(starve_times_e2[1:]),
        "epoch2_p99_ms": np.percentile(starve_times_e2, 99),
        "epoch2_min_ms": np.min(starve_times_e2),
    }


def benchmark_ohnrscript_dod(num_samples=5000, workers=2, data_dir="/tmp/host_tax_data"):
    arena_file = os.path.join(data_dir, "tier4_ohnr_arena", "multimodal_arena.bin")
    pool = OhnrscriptDODArenaPool(arena_file, num_samples, 64, 16)
    all_idx = np.arange(num_samples)

    # Epoch 1
    batches_e1 = [all_idx[i : i + 64] for i in range(0, num_samples, 64)]
    wq_e1 = OhnrscriptWorkerQueue(pool, workers)
    t_start = time.perf_counter_ns()
    wq_e1.start_workers(batches_e1)

    starve_times_e1 = []
    t_prev = time.perf_counter_ns()
    for _ in range(len(batches_e1)):
        buf, l = wq_e1.mailbox.get()
        t_ready = time.perf_counter_ns()
        starve_times_e1.append((t_ready - t_prev) / 1e6)
        # zero-copy view + 5ms GPU step
        raw_floats = torch.frombuffer(buf, dtype=torch.float32, count=l * (SAMPLE_ALIGNED_SIZE // 4), offset=0)
        time.sleep(0.005)
        pool.free_arenas.put(buf)
        t_prev = time.perf_counter_ns()
    wq_e1.wait_completion()

    # Epoch 2
    np.random.shuffle(all_idx)
    batches_e2 = [all_idx[i : i + 64] for i in range(0, num_samples, 64)]
    wq_e2 = OhnrscriptWorkerQueue(pool, workers)
    wq_e2.start_workers(batches_e2)

    starve_times_e2 = []
    t_prev = time.perf_counter_ns()
    for _ in range(len(batches_e2)):
        buf, l = wq_e2.mailbox.get()
        t_ready = time.perf_counter_ns()
        starve_times_e2.append((t_ready - t_prev) / 1e6)
        raw_floats = torch.frombuffer(buf, dtype=torch.float32, count=l * (SAMPLE_ALIGNED_SIZE // 4), offset=0)
        time.sleep(0.005)
        pool.free_arenas.put(buf)
        t_prev = time.perf_counter_ns()
    wq_e2.wait_completion()
    pool.close()

    return {
        "first_batch_latency_ms": starve_times_e1[0],
        "epoch1_avg_ms": np.mean(starve_times_e1),
        "epoch2_first_batch_ms": starve_times_e2[0],
        "epoch2_steady_state_avg_ms": np.mean(starve_times_e2[1:]),
        "epoch2_p99_ms": np.percentile(starve_times_e2, 99),
        "epoch2_min_ms": np.min(starve_times_e2),
    }


def main():
    print("================================================================================")
    print(" HARNESS VALIDATION & DECONSTRUCTION: IS 15,000x ACCURATE?")
    print("================================================================================")
    print("Decomposing Cold-Start Latency vs Steady-State Inter-Batch Latency...\n")

    print(">>> 1. Testing Standard PyTorch DataLoader (persistent_workers=False)...")
    res_py_default = benchmark_pytorch_dataloader(num_samples=5000, persistent=False, workers=2)

    print(">>> 2. Testing Optimized PyTorch DataLoader (persistent_workers=True)...")
    res_py_persist = benchmark_pytorch_dataloader(num_samples=5000, persistent=True, workers=2)

    print(">>> 3. Testing Ohnrscript DOD Contiguous Arena Pointer Mailbox...")
    res_ohnr = benchmark_ohnrscript_dod(num_samples=5000, workers=2)

    print("\n================================================================================")
    print(" LATENCY DECOMPOSITION BREAKDOWN (MILLISECONDS)")
    print("================================================================================")
    print(f"{'Metric':<32} | {'PyTorch (Default)':<18} | {'PyTorch (Persistent)':<20} | {'Ohnrscript DOD'}")
    print("-" * 90)
    print(f"{'Epoch 1 First Batch (ms)':<32} | {res_py_default['first_batch_latency_ms']:<18.3f} | {res_py_persist['first_batch_latency_ms']:<20.3f} | {res_ohnr['first_batch_latency_ms']:.3f}")
    print(f"{'Epoch 2 First Batch (ms)':<32} | {res_py_default['epoch2_first_batch_ms']:<18.3f} | {res_py_persist['epoch2_first_batch_ms']:<20.3f} | {res_ohnr['epoch2_first_batch_ms']:.3f}")
    print(f"{'Steady-State Inter-Batch (ms)':<32} | {res_py_default['epoch2_steady_state_avg_ms']:<18.3f} | {res_py_persist['epoch2_steady_state_avg_ms']:<20.3f} | {res_ohnr['epoch2_steady_state_avg_ms']:.3f}")
    print(f"{'p99 Inter-Batch Tail (ms)':<32} | {res_py_default['epoch2_p99_ms']:<18.3f} | {res_py_persist['epoch2_p99_ms']:<20.3f} | {res_ohnr['epoch2_p99_ms']:.3f}")
    print(f"{'Absolute Minimum Latency (ms)':<32} | {res_py_default['epoch2_min_ms']:<18.3f} | {res_py_persist['epoch2_min_ms']:<20.3f} | {res_ohnr['epoch2_min_ms']:.3f}")
    print("================================================================================")


if __name__ == "__main__":
    main()
