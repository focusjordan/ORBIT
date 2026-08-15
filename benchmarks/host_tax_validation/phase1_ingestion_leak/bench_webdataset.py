"""
Tier 3 Benchmark: WebDataset / Sharded Binary Archive Stream
============================================================
Tests industry-standard streaming archive format (WebDataset / TAR shards).
Streams sequential binary records from TAR shards, avoiding individual file opens,
but still requiring dynamic decoding into Python dictionaries / PyTorch tensors.
"""

import os
import sys
import gc
import time
import tarfile
import io
import json
import argparse
import torch
import numpy as np
from torch.utils.data import IterableDataset, DataLoader

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from telemetry.kernel_smaps import MemoryProfilerContext
from phase1_ingestion_leak.dataset_generator import SyntheticMultimodalDataset, AUDIO_LEN, EMBEDDING_DIM, SPEC_DIM


class ShardedTarStreamDataset(IterableDataset):
    """Streams multimodal samples from contiguous TAR shards."""

    def __init__(self, data_dir: str, num_samples: int):
        self.data_dir = os.path.join(data_dir, "tier3_webdataset")
        self.num_samples = num_samples
        self.shard_files = sorted([os.path.join(self.data_dir, f) for f in os.listdir(self.data_dir) if f.endswith(".tar")])

    def __iter__(self):
        worker_info = torch.utils.data.get_worker_info()
        if worker_info is None:
            shards_to_read = self.shard_files
        else:
            # Partition shards among workers
            worker_id = worker_info.id
            num_workers = worker_info.num_workers
            shards_to_read = [s for idx, s in enumerate(self.shard_files) if idx % num_workers == worker_id]

        for shard_path in shards_to_read:
            with tarfile.open(shard_path, "r") as tar:
                current_sample = {}
                current_id = None

                for member in tar:
                    if not member.isfile():
                        continue
                    filename = os.path.basename(member.name)
                    sid_str, ext = filename.split(".", 1)
                    sid = int(sid_str)

                    if current_id is not None and sid != current_id:
                        # Yield previous completed sample
                        yield self._materialize_sample(current_sample, current_id)
                        current_sample = {}

                    current_id = sid
                    f = tar.extractfile(member)
                    if f is not None:
                        current_sample[ext] = f.read()

                if current_sample and current_id is not None:
                    yield self._materialize_sample(current_sample, current_id)

    def _materialize_sample(self, raw_dict, sid):
        audio_np = np.frombuffer(raw_dict.get("audio.bin", b""), dtype=np.float32).copy()
        embed_np = np.frombuffer(raw_dict.get("embed.bin", b""), dtype=np.float32).copy()
        meta_json = json.loads(raw_dict.get("meta.json", b"{}").decode("utf-8", errors="ignore"))

        if len(audio_np) == 0:
            audio_np = np.zeros(AUDIO_LEN, dtype=np.float32)
        if len(embed_np) == 0:
            embed_np = np.zeros(EMBEDDING_DIM, dtype=np.float32)

        return {
            "sample_id": sid,
            "audio": torch.from_numpy(audio_np),
            "embedding": torch.from_numpy(embed_np),
            "meta": meta_json,
        }


def webdataset_collate_fn(batch):
    audio = torch.stack([b["audio"] for b in batch])
    embeddings = torch.stack([b["embedding"] for b in batch])
    ids = torch.tensor([b["sample_id"] for b in batch], dtype=torch.int64)
    genres = [b["meta"].get("genre", "electronic") for b in batch]
    return audio, embeddings, ids, genres


def run_benchmark(num_samples: int = 50000, epochs: int = 5, num_workers: int = 8, batch_size: int = 64, data_dir: str = "/tmp/host_tax_data"):
    print(f"\n[Tier 3: WebDataset / Sharded Stream] Initializing (samples={num_samples}, epochs={epochs}, workers={num_workers}, batch_size={batch_size})...")

    gen = SyntheticMultimodalDataset(output_dir=data_dir, num_samples=num_samples)
    gen._generate_tier3_webdataset()

    dataset = ShardedTarStreamDataset(data_dir=data_dir, num_samples=num_samples)
    pin_memory = torch.cuda.is_available()
    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        num_workers=num_workers,
        pin_memory=pin_memory,
        collate_fn=webdataset_collate_fn,
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
        epoch_sample_count = 0
        for audio, embed, ids, genres in loader:
            total_batches += 1
            b_len = len(ids)
            total_samples += b_len
            epoch_sample_count += b_len
            _ = audio.sum() + embed.sum()
        profiler.record()
        epoch_dur = time.perf_counter() - epoch_start
        print(f"  [Tier 3] Epoch {epoch + 1}/{epochs} finished in {epoch_dur:.2f}s (Throughput: {epoch_sample_count/epoch_dur:.1f} samples/s)")

    summary = profiler.finish()
    total_time = time.perf_counter() - start_time
    gc_stats_after = gc.get_stats()
    gc_count_after = sum(s["collections"] for s in gc_stats_after)
    total_gc_collections = gc_count_after - gc_count_before

    throughput_samples_sec = total_samples / total_time
    throughput_mb_sec = (total_samples * 65.5) / (1024 * total_time)

    result = {
        "tier": "Tier 3: WebDataset / Sharded Stream",
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

    print("\n--- [Tier 3 Results] ---")
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
