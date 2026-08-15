# HPC Execution Runbook: AI "Host Tax" & Semiconductor Relief Validation Suite

This runbook provides complete instructions for executing, instrumenting, and reproducing the four-tier multimodal ingestion benchmarks, accelerator starvation loops, and semiconductor macroeconomic models across both Linux cluster environments and local development workstations.

---

## 1. Architectural Overview & The 4 Evaluated Tiers

The suite systematically evaluates four data ingestion tiers under identical hardware and sample constraints:

| Tier | Architecture | Ingestion Mechanism | IPC / Concurrency Model | Memory Strategy |
|---|---|---|---|---|
| **Tier 1** | Standard PyTorch DataLoader | Python Dicts, Strings, Floats | `multiprocessing.Process` (fork/spawn) + Pipes | Dynamic heap allocation, refcount mutations trigger CoW |
| **Tier 2** | NumPy Memmap (Megatron-LM Style) | Pre-tokenized `.dat` files | PyTorch DataLoader workers slicing array indices | Contiguous disk mapping, tensor boundary copies |
| **Tier 3** | WebDataset / Sharded Stream | Sequential `.tar` shard archives | IterableDataset streaming binary chunks | Avoids per-file opens, unpacks into Python dicts |
| **Tier 4** | **Ohnrscript Data-Oriented Runtime** | Contiguous Memory Arenas (`ScopeArena`) | Lock-free MPSC Ring Buffers (`workers.ohn`) passing pointers | `@binaryLayout` fixed offsets, direct C-ABI `torch.from_blob` |

---

## 2. Prerequisites & Environment Setup

### Environment Requirements
- **Python:** 3.9+ (PyTorch 2.0+ with CUDA or Apple Silicon Metal / MPS support)
- **Dependencies:** `torch`, `numpy`, `psutil`
- **Optional Tools (Linux HPC Clusters):** `numactl`, `perf`, `docker`, `cgroups-v2`

### Quick Setup
```bash
# From workspace root
source .venv/bin/activate
pip install psutil numpy torch
```

---

## 3. Running the Benchmarks

### Option A: Master End-to-End Suite Runner
Executes Phase 1 (Ingestion Micro-Benchmarks), Phase 2 (GPU Starvation Loop), and Phase 3 (Macroeconomic Model) in sequence:

```bash
python benchmarks/host_tax_validation/run_all_validation.py \
    --samples 10000 \
    --epochs 3 \
    --workers 4 \
    --batch-size 64 \
    --gpus 32000 \
    --out host_tax_empirical_results.json
```

---

### Option B: Phase 1 — 4-Way Ingestion Micro-Benchmark
Runs each of the 4 ingestion tiers in isolated Python subprocesses with deep kernel memory telemetry:

```bash
python benchmarks/host_tax_validation/phase1_ingestion_leak/run_phase1_comparison.py \
    --samples 20000 \
    --epochs 3 \
    --workers 8 \
    --batch-size 64 \
    --out phase1_results.json
```

**What is Measured in Phase 1:**
- **Peak RSS (MB) & Delta RSS (MB):** Process physical memory footprint and growth across epochs.
- **Minor Page Faults (`RUSAGE_CHILDREN`):** Quantifies Linux Copy-on-Write page duplication triggered by worker process memory access.
- **`/proc/[pid]/smaps` (Linux):** Distinguishes `Shared_Clean`, `Shared_Dirty`, and `Private_Dirty` memory pages to mathematically prove CoW bloat.
- **GC Collections & Pauses:** Ephemeral Python object allocations triggering garbage collector cycles.
- **Ingestion Throughput:** Sustained processing rate in `samples/sec` and `MB/s`.

---

### Option C: Phase 2 — GPU Starvation & Container Constriction
Simulates real-world neural multimodal training (audio 1D Conv front-end + embedding MLP) on GPU (CUDA / Metal / CPU):

```bash
# 1. Run unconstrained GPU training loop
python benchmarks/host_tax_validation/phase2_gpu_starvation/gpu_training_throughput_loop.py \
    --samples 10000 \
    --epochs 2 \
    --workers 4 \
    --batch-size 64

# 2. Run automated memory constriction step-sweep harness
./benchmarks/host_tax_validation/phase2_gpu_starvation/stress_test_constriction.sh
```

**Linux Docker / cgroups-v2 Memory Limit (Alternative):**
```bash
# Run inside a container restricted to 2GB RAM
docker run --rm --memory=2g --cpus=4 \
    -v $(pwd):/workspace -w /workspace \
    pytorch/pytorch:latest \
    python benchmarks/host_tax_validation/phase2_gpu_starvation/gpu_training_throughput_loop.py \
    --samples 10000 --workers 4
```

---

### Option D: Phase 3 — Macroeconomic, Semiconductor & Thermodynamic Model
Calculates CapEx, continuous DRAM wattage, annual MWh power savings, and 300mm wafer relief across arbitrary cluster sizes:

```bash
python benchmarks/host_tax_validation/phase3_semiconductor_model/datacenter_savings_model.py \
    --gpus 32000 \
    --pue 1.20 \
    --kwh-cost 0.09 \
    --price-128gb 1450.0 \
    --price-64gb 290.0 \
    --out phase3_model_results.json
```

---

## 4. Advanced HPC Profiling (Linux Multi-Socket Clusters)

### NUMA Topology & Cross-Socket Cache Profiling
On dual-socket AMD EPYC or Intel Xeon servers:

```bash
# Check NUMA node memory allocation
numastat -c python

# Run benchmark pinned to Socket 0 to eliminate cross-socket interconnect latency
numactl --cpunodebind=0 --membind=0 \
    python benchmarks/host_tax_validation/phase1_ingestion_leak/run_phase1_comparison.py
```

### Cache-to-Cache (C2C) False Sharing Profiling
```bash
# Profile cache-line bouncing and false sharing across cores
perf c2c record -F 60000 -- \
    python benchmarks/host_tax_validation/phase1_ingestion_leak/bench_standard_dataloader.py --workers 16
perf c2c report --stdio
```
