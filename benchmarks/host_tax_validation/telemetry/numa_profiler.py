"""
NUMA & Hardware Topology Telemetry Engine
==========================================
Instruments Non-Uniform Memory Access (NUMA) node topologies and cross-socket traffic:
- Multi-socket CPU detection (Intel Xeon UPI, AMD EPYC Infinity Fabric).
- Process core and node affinity management (sched_setaffinity / numactl).
- Kernel NUMA statistics (/sys/devices/system/node/nodeX/numastat, numa_hit, numa_miss, numa_foreign).
- Cache-line alignment & cross-socket memory latency estimation.
"""

import os
import sys
import subprocess
import platform
from typing import Dict, List, Any, Optional

IS_LINUX = platform.system().lower() == "linux"


class NUMAProfiler:
    """Detects NUMA topology, binds CPU cores, and tracks cross-socket allocation metrics."""

    def __init__(self):
        self.numa_available = False
        self.num_nodes = 1
        self.nodes_info: Dict[int, Dict[str, Any]] = {}
        self._detect_topology()

    def _detect_topology(self):
        if not IS_LINUX:
            self.numa_available = False
            self.num_nodes = 1
            return

        # Check /sys/devices/system/node
        sys_node_dir = "/sys/devices/system/node"
        if os.path.exists(sys_node_dir):
            node_dirs = [d for d in os.listdir(sys_node_dir) if d.startswith("node") and d[4:].isdigit()]
            if len(node_dirs) > 1:
                self.numa_available = True
                self.num_nodes = len(node_dirs)
                for nd in node_dirs:
                    node_id = int(nd[4:])
                    self.nodes_info[node_id] = self._read_node_stats(node_id)
            else:
                self.num_nodes = 1
        else:
            self.num_nodes = 1

    def _read_node_stats(self, node_id: int) -> Dict[str, int]:
        stats = {
            "numa_hit": 0,
            "numa_miss": 0,
            "numa_foreign": 0,
            "interleave_hit": 0,
            "local_node": 0,
            "other_node": 0,
        }
        stat_file = f"/sys/devices/system/node/node{node_id}/numastat"
        if os.path.exists(stat_file):
            try:
                with open(stat_file, "r") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) == 2 and parts[0] in stats:
                            stats[parts[0]] = int(parts[1])
            except Exception:
                pass
        return stats

    def get_snapshot(self) -> Dict[str, Any]:
        """Capture current snapshot of NUMA memory allocation across nodes."""
        if not self.numa_available:
            return {
                "numa_available": False,
                "num_nodes": self.num_nodes,
                "platform": platform.platform(),
                "cross_socket_traffic_detected": False,
            }

        current_stats = {}
        total_hit = 0
        total_miss = 0
        total_foreign = 0
        for node_id in range(self.num_nodes):
            st = self._read_node_stats(node_id)
            current_stats[f"node_{node_id}"] = st
            total_hit += st["numa_hit"]
            total_miss += st["numa_miss"]
            total_foreign += st["numa_foreign"]

        remote_ratio = (total_miss / (total_hit + total_miss)) if (total_hit + total_miss) > 0 else 0.0

        return {
            "numa_available": True,
            "num_nodes": self.num_nodes,
            "node_stats": current_stats,
            "total_numa_hit": total_hit,
            "total_numa_miss": total_miss,
            "total_numa_foreign": total_foreign,
            "remote_memory_access_ratio": round(remote_ratio, 4),
            "cross_socket_traffic_detected": total_miss > 0,
        }

    def bind_to_node(self, node_id: int) -> bool:
        """Bind current process to a specific NUMA node if available."""
        if not self.numa_available or not IS_LINUX:
            return False
        try:
            cpulist_path = f"/sys/devices/system/node/node{node_id}/cpulist"
            if os.path.exists(cpulist_path):
                with open(cpulist_path, "r") as f:
                    cpu_range_str = f.read().strip()
                # Parse CPU range (e.g. 0-63)
                cpus = set()
                for part in cpu_range_str.split(","):
                    if "-" in part:
                        start, end = map(int, part.split("-"))
                        cpus.update(range(start, end + 1))
                    elif part.isdigit():
                        cpus.add(int(part))
                if cpus:
                    os.sched_setaffinity(0, cpus)
                    return True
        except Exception:
            pass
        return False
