"""
Tier 1 Benchmark: Standard PyTorch DataLoader with Python Objects & Dicts
=========================================================================
Tests standard PyTorch multiprocessing DataLoader (num_workers=16, pin_memory=True)
iterating over multimodal samples represented as native Python dictionaries.
Demonstrates Copy-on-Write (CoW) page duplication and GC pause overhead.
"""

import os
import sys
import gc
import time
import argparse
import json
import torch
from torch.utils.data import Dataset, DataLoader

# Add parent path for telemetry
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from telemetry.kernel_smaps import MemoryProfilerContext
from phase1_ingestion_leak.dataset_generator import generate_tier1_python_dict_sample, SyntheticMultimodalDataset


class StandardPythonDataset(Dataset):
    """Standard PyTorch Dataset returning nested Python dictionaries."""

    def __init__(self, num_samples: int = 50000):
        self.num_samples = num_samples
        # Pre-cache raw sample blueprints to simulate typical dataset loader state
        # Worker read operations on these dicts mutate refcounts -> triggers CoW!
        self.cached_samples = [generate_tier1_python_dict_sample(i) for i in range(min(5000, num_samples))]

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        # Accessing cached Python dictionary in worker process mutates reference counts
        base = self.cached_samples[idx % len(self.cached_samples)]
        # Synthesize batch payload with Python objects
        return {
            "sample_id": idx,
            "audio": torch.from_numpy(base["audio_waveform"].copy()),
            "embedding": torch.from_numpy(base["embedding"].copy()),
            "spectrogram": torch.from_numpy(base["spectrogram_rms"].copy()),
            "genre": base["metadata"]["genre"],
            "title": f"{base['metadata']['title']}_{idx}",
            "bpm": base["metadata"]["tempo_bpm"],
        }


def custom_collate_fn(batch):
    """Custom collator handling mixed tensors and Python object strings/metadata."""
    sample_ids = torch.tensor([b["sample_id"] for b in batch], dtype=torch.int64)
    audio = torch.stack([b["audio"] for b in batch])
    embeddings = torch.stack([b["embedding"] for b in batch])
    spectrograms = torch.stack([b["spectrogram"] for b in batch])
    # Strings and dicts undergo dynamic tuple/list collation
    genres = [b["genre"] for b in batch]
    titles = [b["title"] for b in batch]
    bpms = [b["bpm"] for b in batch]
    return {
        "sample_ids": sample_ids,
        "audio": audio,
        "embeddings": embeddings,
        "spectrograms": spectrograms,
        "metadata": {"genres": genres, "titles": titles, "bpms": bpms},
    }


def run_benchmark(num_samples: int = 50000, epochs: int = 5, num_workers: int = 8, batch_size: int = 64):
    print(f"\n[Tier 1: Standard PyTorch DataLoader] Initializing (samples={num_samples}, epochs={epochs}, workers={num_workers}, batch_size={batch_size})...")

    dataset = StandardPythonDataset(num_samples=num_samples)
    pin_memory = torch.cuda.is_available()  # pin_memory is typical on CUDA
    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=pin_memory,
        collate_fn=custom_collate_fn,
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
        for batch in loader:
            total_batches += 1
            total_samples += len(batch["sample_ids"])
            # Simulate consumption in training step
            _ = batch["audio"].sum() + batch["embeddings"].sum()
        profiler.record()
        epoch_dur = time.perf_counter() - epoch_start
        print(f"  [Tier 1] Epoch {epoch + 1}/{epochs} finished in {epoch_dur:.2f}s (Throughput: {len(dataset)/epoch_dur:.1f} samples/s)")

    summary = profiler.finish()
    total_time = time.perf_counter() - start_time
    gc_stats_after = gc.get_stats()
    gc_count_after = sum(s["collections"] for s in gc_stats_after)
    total_gc_collections = gc_count_after - gc_count_before

    throughput_samples_sec = total_samples / total_time
    throughput_mb_sec = (total_samples * 65.5) / (1024 * total_time)  # ~65.5KB per sample

    result = {
        "tier": "Tier 1: Standard PyTorch DataLoader",
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

    print("\n--- [Tier 1 Results] ---")
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
    )
    if args.out:
        with open(args.out, "w") as f:
            json.dump(res, f, indent=2)
