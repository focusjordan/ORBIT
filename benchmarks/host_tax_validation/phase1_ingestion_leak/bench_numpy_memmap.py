"""
Tier 2 Benchmark: NumPy Memmap Pre-Tokenized Pipeline (Megatron-LM Style)
========================================================================
Tests industry-standard optimized workaround: pre-tokenized contiguous memory-mapped
NumPy files (np.memmap) sliced across PyTorch worker processes.
Reduces individual file open calls, but still incurs IPC collation and tensor boundary copies.
"""

import os
import sys
import gc
import time
import argparse
import json
import torch
import numpy as np
from torch.utils.data import Dataset, DataLoader

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from telemetry.kernel_smaps import MemoryProfilerContext
from phase1_ingestion_leak.dataset_generator import SyntheticMultimodalDataset, AUDIO_LEN, EMBEDDING_DIM, SPEC_DIM


class NumpyMemmapDataset(Dataset):
    """Memory-mapped array dataset slicing contiguous on-disk binaries."""

    def __init__(self, data_dir: str, num_samples: int):
        self.num_samples = num_samples
        self.audio_path = os.path.join(data_dir, "tier2_memmap", "audio.dat")
        self.embed_path = os.path.join(data_dir, "tier2_memmap", "embeddings.dat")
        self.spec_path = os.path.join(data_dir, "tier2_memmap", "spectrograms.dat")

        # Lazy worker initialization to ensure safe multiprocessing file handles
        self.audio_mm = None
        self.embed_mm = None
        self.spec_mm = None

    def _init_memmap(self):
        if self.audio_mm is None:
            self.audio_mm = np.memmap(self.audio_path, dtype=np.float32, mode="r", shape=(self.num_samples, AUDIO_LEN))
            self.embed_mm = np.memmap(self.embed_path, dtype=np.float32, mode="r", shape=(self.num_samples, EMBEDDING_DIM))
            self.spec_mm = np.memmap(self.spec_path, dtype=np.float32, mode="r", shape=(self.num_samples, SPEC_DIM))

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        self._init_memmap()
        # Slicing numpy memmap into torch tensor
        audio_slice = torch.from_numpy(np.array(self.audio_mm[idx]))
        embed_slice = torch.from_numpy(np.array(self.embed_mm[idx]))
        spec_slice = torch.from_numpy(np.array(self.spec_mm[idx]))
        return audio_slice, embed_slice, spec_slice, idx


def run_benchmark(num_samples: int = 50000, epochs: int = 5, num_workers: int = 8, batch_size: int = 64, data_dir: str = "/tmp/host_tax_data"):
    print(f"\n[Tier 2: NumPy Memmap (Megatron-Style)] Initializing (samples={num_samples}, epochs={epochs}, workers={num_workers}, batch_size={batch_size})...")

    # Generate data if missing
    gen = SyntheticMultimodalDataset(output_dir=data_dir, num_samples=num_samples)
    gen._generate_tier2_memmap()

    dataset = NumpyMemmapDataset(data_dir=data_dir, num_samples=num_samples)
    pin_memory = torch.cuda.is_available()
    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=pin_memory,
        persistent_workers=(num_workers > 0),
    )

    profiler = MemoryProfilerContext(sample_interval_sec=0.25)
    gc.collect()
    gc_stats_before = gc.get_stats()
    gc_count_before = sum(s["collections"] for s in gc_stats_before)

    profiler.start()
    total_batches = 0
    total_samples = 0
    start_time = time.perf_counter()

    for epoch in range(epochs):
        epoch_start = time.perf_counter()
        for audio, embed, spec, ids in loader:
            total_batches += 1
            total_samples += len(ids)
            _ = audio.sum() + embed.sum()
        profiler.record()
        epoch_dur = time.perf_counter() - epoch_start
        print(f"  [Tier 2] Epoch {epoch + 1}/{epochs} finished in {epoch_dur:.2f}s (Throughput: {len(dataset)/epoch_dur:.1f} samples/s)")

    summary = profiler.finish()
    total_time = time.perf_counter() - start_time
    gc_stats_after = gc.get_stats()
    gc_count_after = sum(s["collections"] for s in gc_stats_after)
    total_gc_collections = gc_count_after - gc_count_before

    throughput_samples_sec = total_samples / total_time
    throughput_mb_sec = (total_samples * 65.5) / (1024 * total_time)

    result = {
        "tier": "Tier 2: NumPy Memmap (Megatron-LM Style)",
        "num_samples": num_samples,
        "epochs": epochs,
        "num_workers": num_workers,
        "batch_size": batch_size,
        "total_time_sec": round(total_time, 2),
        "throughput_samples_sec": round(throughput_samples_sec, 2),
        "throughput_mb_sec": round(throughput_mb_sec, 2),
        "peak_rss_mb": summary["peak_rss_mb"],
        "peak_pss_mb": summary["peak_pss_mb"],
        "peak_private_dirty_mb": summary["peak_private_dirty_mb"],
        "delta_rss_mb": summary["delta_rss_mb"],
        "total_minor_page_faults": summary["total_minor_faults"],
        "total_major_page_faults": summary["total_major_faults"],
        "cow_inflation_ratio": summary["cow_inflation_ratio"],
        "gc_collections": total_gc_collections,
        "max_processes": summary["max_processes"],
    }

    print("\n--- [Tier 2 Results] ---")
    print(f"Peak RSS: {result['peak_rss_mb']} MB | Delta RSS: {result['delta_rss_mb']} MB")
    print(f"Minor Page Faults: {result['total_minor_page_faults']} | GC Collections: {result['gc_collections']}")
    print(f"Throughput: {result['throughput_samples_sec']} samples/sec ({result['throughput_mb_sec']} MB/s)")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=10000)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--data-dir", type=str, default="/tmp/host_tax_data")
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args()

    res = run_benchmark(
        num_samples=args.samples,
        epochs=args.epochs,
        num_workers=args.workers,
        batch_size=args.batch_size,
        data_dir=args.data_dir,
    )
    if args.out:
        with open(args.out, "w") as f:
            json.dump(res, f, indent=2)
