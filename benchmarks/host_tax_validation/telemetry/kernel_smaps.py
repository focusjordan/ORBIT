"""
Deep Kernel & Process Memory Telemetry Engine
=============================================
Provides precise, real-time memory telemetry for high-performance computing (HPC) benchmarks:
- RUSAGE_SELF & RUSAGE_CHILDREN minor and major page faults (tracking OS Copy-on-Write page duplication).
- Linux /proc/[pid]/smaps & /proc/[pid]/smaps_rollup parsing (Shared_Clean, Shared_Dirty, Private_Dirty, PSS, RSS).
- Recursive worker subprocess tree tracking (PyTorch DataLoader worker pool).
- Cross-platform fallback for macOS (Darwin Mach VM task info / vm_stat).
"""

import os
import sys
import time
import resource
import platform
import psutil
from typing import Dict, List, Any, Optional

IS_LINUX = platform.system().lower() == "linux"
IS_MACOS = platform.system().lower() == "darwin"


class KernelMemorySampler:
    """Samples and aggregates kernel-level memory metrics across a process tree."""

    def __init__(self, root_pid: Optional[int] = None):
        self.root_pid = root_pid or os.getpid()
        self.process = psutil.Process(self.root_pid)
        self.initial_page_faults = self._get_page_faults()
        self.initial_smaps = self._sample_smaps_tree()

    def _get_page_faults(self) -> Dict[str, int]:
        """Aggregate minor (ru_minflt) and major (ru_majflt) page faults across self + children."""
        self_usage = resource.getrusage(resource.RUSAGE_SELF)
        try:
            children_usage = resource.getrusage(resource.RUSAGE_CHILDREN)
            min_faults = self_usage.ru_minflt + children_usage.ru_minflt
            maj_faults = self_usage.ru_majflt + children_usage.ru_majflt
        except Exception:
            min_faults = self_usage.ru_minflt
            maj_faults = self_usage.ru_majflt

        return {
            "self_minor_faults": self_usage.ru_minflt,
            "self_major_faults": self_usage.ru_majflt,
            "total_minor_faults": min_faults,
            "total_major_faults": maj_faults,
        }

    def _parse_linux_smaps_file(self, smaps_path: str) -> Dict[str, int]:
        """Parse Linux /proc/[pid]/smaps or smaps_rollup."""
        metrics = {
            "Rss": 0,
            "Pss": 0,
            "Shared_Clean": 0,
            "Shared_Dirty": 0,
            "Private_Clean": 0,
            "Private_Dirty": 0,
            "Referenced": 0,
            "Anonymous": 0,
            "Locked": 0,
        }
        if not os.path.exists(smaps_path):
            return metrics

        try:
            with open(smaps_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    parts = line.strip().split(":")
                    if len(parts) == 2:
                        key = parts[0].strip()
                        if key in metrics:
                            val_str = parts[1].strip().split()[0]
                            if val_str.isdigit():
                                metrics[key] += int(val_str)
        except Exception:
            pass
        return metrics

    def _sample_smaps_tree(self) -> Dict[str, Any]:
        """Collect memory breakdown for parent and all descendant worker processes."""
        aggregated = {
            "rss_kb": 0,
            "pss_kb": 0,
            "shared_clean_kb": 0,
            "shared_dirty_kb": 0,
            "private_clean_kb": 0,
            "private_dirty_kb": 0,
            "anonymous_kb": 0,
            "locked_kb": 0,
            "num_processes": 0,
            "pids": [],
        }

        try:
            pids = [self.root_pid]
            try:
                for child in self.process.children(recursive=True):
                    pids.append(child.pid)
            except Exception:
                pass

            aggregated["pids"] = pids
            aggregated["num_processes"] = len(pids)

            if IS_LINUX:
                for pid in pids:
                    rollup_path = f"/proc/{pid}/smaps_rollup"
                    smaps_path = f"/proc/{pid}/smaps"
                    target = rollup_path if os.path.exists(rollup_path) else smaps_path
                    m = self._parse_linux_smaps_file(target)
                    aggregated["rss_kb"] += m["Rss"]
                    aggregated["pss_kb"] += m["Pss"]
                    aggregated["shared_clean_kb"] += m["Shared_Clean"]
                    aggregated["shared_dirty_kb"] += m["Shared_Dirty"]
                    aggregated["private_clean_kb"] += m["Private_Clean"]
                    aggregated["private_dirty_kb"] += m["Private_Dirty"]
                    aggregated["anonymous_kb"] += m["Anonymous"]
                    aggregated["locked_kb"] += m["Locked"]
            else:
                # macOS / Darwin fallback using psutil process memory info
                for pid in pids:
                    try:
                        proc = psutil.Process(pid)
                        mem_info = proc.memory_info()
                        rss_kb = int(mem_info.rss / 1024)
                        aggregated["rss_kb"] += rss_kb
                        aggregated["pss_kb"] += rss_kb
                        # On Darwin, private memory vs shared estimation
                        aggregated["private_dirty_kb"] += rss_kb
                    except Exception:
                        pass
        except Exception:
            pass

        return aggregated

    def sample(self) -> Dict[str, Any]:
        """Capture complete current snapshot of kernel memory state."""
        faults = self._get_page_faults()
        smaps = self._sample_smaps_tree()

        # Compute delta page faults since baseline
        delta_minor = faults["total_minor_faults"] - self.initial_page_faults["total_minor_faults"]
        delta_major = faults["total_major_faults"] - self.initial_page_faults["total_major_faults"]

        # Compute Copy-on-Write (CoW) page duplication metrics
        total_shared_kb = smaps["shared_clean_kb"] + smaps["shared_dirty_kb"]
        total_private_kb = smaps["private_clean_kb"] + smaps["private_dirty_kb"]
        cow_inflation_ratio = (
            (smaps["private_dirty_kb"] / total_shared_kb) if total_shared_kb > 0 else 1.0
        )

        return {
            "timestamp": time.time(),
            "num_processes": smaps["num_processes"],
            "pids": smaps["pids"],
            "rss_mb": round(smaps["rss_kb"] / 1024.0, 2),
            "pss_mb": round(smaps["pss_kb"] / 1024.0, 2),
            "shared_clean_mb": round(smaps["shared_clean_kb"] / 1024.0, 2),
            "shared_dirty_mb": round(smaps["shared_dirty_kb"] / 1024.0, 2),
            "private_dirty_mb": round(smaps["private_dirty_kb"] / 1024.0, 2),
            "locked_mb": round(smaps["locked_kb"] / 1024.0, 2),
            "cow_inflation_ratio": round(cow_inflation_ratio, 3),
            "total_minor_page_faults": faults["total_minor_faults"],
            "total_major_page_faults": faults["total_major_faults"],
            "delta_minor_page_faults": delta_minor,
            "delta_major_page_faults": delta_major,
        }


class MemoryProfilerContext:
    """Context manager for profiling a block of execution with kernel telemetry."""

    def __init__(self, sample_interval_sec: float = 0.5):
        self.sampler = KernelMemorySampler()
        self.interval = sample_interval_sec
        self.snapshots: List[Dict[str, Any]] = []
        self.start_time: float = 0.0
        self.end_time: float = 0.0

    def start(self):
        self.start_time = time.perf_counter()
        self.snapshots = [self.sampler.sample()]

    def record(self):
        self.snapshots.append(self.sampler.sample())

    def finish(self) -> Dict[str, Any]:
        self.end_time = time.perf_counter()
        self.snapshots.append(self.sampler.sample())

        duration = self.end_time - self.start_time
        peak_rss = max(s["rss_mb"] for s in self.snapshots)
        peak_pss = max(s["pss_mb"] for s in self.snapshots)
        peak_private_dirty = max(s["private_dirty_mb"] for s in self.snapshots)
        final_snapshot = self.snapshots[-1]
        initial_snapshot = self.snapshots[0]

        return {
            "duration_sec": round(duration, 3),
            "peak_rss_mb": round(peak_rss, 2),
            "peak_pss_mb": round(peak_pss, 2),
            "peak_private_dirty_mb": round(peak_private_dirty, 2),
            "final_rss_mb": final_snapshot["rss_mb"],
            "final_private_dirty_mb": final_snapshot["private_dirty_mb"],
            "delta_rss_mb": round(final_snapshot["rss_mb"] - initial_snapshot["rss_mb"], 2),
            "total_minor_faults": final_snapshot["delta_minor_page_faults"],
            "total_major_faults": final_snapshot["delta_major_page_faults"],
            "cow_inflation_ratio": final_snapshot["cow_inflation_ratio"],
            "num_snapshots": len(self.snapshots),
            "max_processes": max(s["num_processes"] for s in self.snapshots),
        }
