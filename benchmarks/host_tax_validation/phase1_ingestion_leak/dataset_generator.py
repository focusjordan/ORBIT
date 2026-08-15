"""
Multimodal Audio Ingestion Dataset Generator
============================================
Generates 50,000-sample multimodal ingestion streams across four data representation formats:
1. Tier 1: Standard Python Dynamic Object Tree (nested dicts, strings, numpy arrays).
2. Tier 2: NumPy Memmap (pre-allocated memory-mapped binary files, Megatron-LM pattern).
3. Tier 3: WebDataset / Sharded Binary Archive (contiguous streaming TAR shards).
4. Tier 4: Ohnrscript Data-Oriented Design (DOD) (@binaryLayout contiguous byte-aligned slabs).
"""

import os
import struct
import tarfile
import io
import numpy as np
from typing import Dict, Any, Generator, Tuple

AUDIO_SAMPLE_RATE = 16000
AUDIO_LEN = 16000       # 1 second of audio @ 16kHz float32
EMBEDDING_DIM = 512     # 512-dim embedding (CLAP / MERT)
SPEC_DIM = 64           # 64-dim spectrogram / RMS energy slice
METADATA_STR_LEN = 64

# Binary layout struct format:
# Magic(4B) + SampleID(4B) + AudioLen(4B) + EmbedDim(4B) + SpecDim(4B) + Pad(12B for 32B header)
HEADER_SIZE = 32
SAMPLE_PAYLOAD_SIZE = HEADER_SIZE + (AUDIO_LEN * 4) + (EMBEDDING_DIM * 4) + (SPEC_DIM * 4) + METADATA_STR_LEN
# Cache-line align to 64 bytes
SAMPLE_ALIGNED_SIZE = ((SAMPLE_PAYLOAD_SIZE + 63) // 64) * 64

OHNR_MAGIC = 0x4F484E52  # 'OHNR'


class SyntheticMultimodalDataset:
    """Creates synthetic multimodal dataset files in all four architectural formats."""

    def __init__(self, output_dir: str, num_samples: int = 50000):
        self.output_dir = output_dir
        self.num_samples = num_samples
        os.makedirs(self.output_dir, exist_ok=True)

        self.memmap_dir = os.path.join(self.output_dir, "tier2_memmap")
        self.webdataset_dir = os.path.join(self.output_dir, "tier3_webdataset")
        self.ohnr_arena_dir = os.path.join(self.output_dir, "tier4_ohnr_arena")

    def generate_all(self):
        """Generates the necessary on-disk artifacts for Tier 2, Tier 3, and Tier 4."""
        self._generate_tier2_memmap()
        self._generate_tier3_webdataset()
        self._generate_tier4_ohnr_arena()

    def _generate_tier2_memmap(self):
        """Tier 2: NumPy Memmap pre-tokenized binary files."""
        os.makedirs(self.memmap_dir, exist_ok=True)
        audio_path = os.path.join(self.memmap_dir, "audio.dat")
        embed_path = os.path.join(self.memmap_dir, "embeddings.dat")
        spec_path = os.path.join(self.memmap_dir, "spectrograms.dat")

        if os.path.exists(audio_path) and os.path.exists(embed_path):
            return

        # Pre-allocate contiguous arrays
        audio_mm = np.memmap(audio_path, dtype=np.float32, mode="w+", shape=(self.num_samples, AUDIO_LEN))
        embed_mm = np.memmap(embed_path, dtype=np.float32, mode="w+", shape=(self.num_samples, EMBEDDING_DIM))
        spec_mm = np.memmap(spec_path, dtype=np.float32, mode="w+", shape=(self.num_samples, SPEC_DIM))

        # Fill with deterministic synthetic wave / embedding data
        chunk_size = min(5000, self.num_samples)
        for start_idx in range(0, self.num_samples, chunk_size):
            end_idx = min(start_idx + chunk_size, self.num_samples)
            count = end_idx - start_idx
            # Synthetic sine wave
            t = np.linspace(0, 1, AUDIO_LEN, dtype=np.float32)
            audio_mm[start_idx:end_idx] = np.sin(2 * np.pi * 440.0 * t)
            embed_mm[start_idx:end_idx] = np.random.randn(count, EMBEDDING_DIM).astype(np.float32)
            spec_mm[start_idx:end_idx] = np.random.rand(count, SPEC_DIM).astype(np.float32)

        audio_mm.flush()
        embed_mm.flush()
        spec_mm.flush()

    def _generate_tier3_webdataset(self):
        """Tier 3: WebDataset sharded binary TAR files."""
        os.makedirs(self.webdataset_dir, exist_ok=True)
        tar_path = os.path.join(self.webdataset_dir, "shard-00000.tar")
        if os.path.exists(tar_path):
            return

        samples_per_shard = min(2500, self.num_samples)
        num_shards = (self.num_samples + samples_per_shard - 1) // samples_per_shard

        sample_counter = 0
        for shard_idx in range(num_shards):
            shard_file = os.path.join(self.webdataset_dir, f"shard-{shard_idx:05d}.tar")
            with tarfile.open(shard_file, "w") as tar:
                shard_end = min(sample_counter + samples_per_shard, self.num_samples)
                for sid in range(sample_counter, shard_end):
                    audio_bytes = np.sin(2 * np.pi * 440.0 * np.linspace(0, 1, AUDIO_LEN, dtype=np.float32)).tobytes()
                    embed_bytes = np.random.randn(EMBEDDING_DIM).astype(np.float32).tobytes()
                    json_bytes = f'{{"id": {sid}, "genre": "electronic", "bpm": 128, "key": "Am"}}'.encode("utf-8")

                    for ext, data in [("audio.bin", audio_bytes), ("embed.bin", embed_bytes), ("meta.json", json_bytes)]:
                        ti = tarfile.TarInfo(name=f"{sid:08d}.{ext}")
                        ti.size = len(data)
                        tar.addfile(ti, io.BytesIO(data))
                sample_counter = shard_end

    def _generate_tier4_ohnr_arena(self):
        """Tier 4: Ohnrscript DOD pre-allocated contiguous flat memory arena file."""
        os.makedirs(self.ohnr_arena_dir, exist_ok=True)
        arena_path = os.path.join(self.ohnr_arena_dir, "multimodal_arena.bin")
        if os.path.exists(arena_path):
            return

        total_bytes = self.num_samples * SAMPLE_ALIGNED_SIZE
        with open(arena_path, "wb") as f:
            # Write structured binary slabs with fixed offsets
            chunk_samples = min(2000, self.num_samples)
            dummy_audio = np.sin(2 * np.pi * 440.0 * np.linspace(0, 1, AUDIO_LEN, dtype=np.float32)).tobytes()
            dummy_embed = np.random.randn(EMBEDDING_DIM).astype(np.float32).tobytes()
            dummy_spec = np.random.rand(SPEC_DIM).astype(np.float32).tobytes()
            dummy_cbor_meta = b"\xa4\x62id" + struct.pack(">I", 0) + b"\x65genre\x6aelectronic\x63bpm\x18\x80\x63key\x62Am" + b"\x00" * 80

            single_sample_buf = bytearray(SAMPLE_ALIGNED_SIZE)
            # Header
            struct.pack_into(
                "<IIIII12s",
                single_sample_buf,
                0,
                OHNR_MAGIC,
                0,
                AUDIO_LEN,
                EMBEDDING_DIM,
                SPEC_DIM,
                b"\x00" * 12,
            )
            # Audio
            single_sample_buf[HEADER_SIZE : HEADER_SIZE + len(dummy_audio)] = dummy_audio
            # Embed
            emb_offset = HEADER_SIZE + len(dummy_audio)
            single_sample_buf[emb_offset : emb_offset + len(dummy_embed)] = dummy_embed
            # Spec
            spec_offset = emb_offset + len(dummy_embed)
            single_sample_buf[spec_offset : spec_offset + len(dummy_spec)] = dummy_spec
            # CBOR Meta
            meta_offset = spec_offset + len(dummy_spec)
            single_sample_buf[meta_offset : meta_offset + len(dummy_cbor_meta)] = dummy_cbor_meta

            # Write out all samples
            for sid in range(self.num_samples):
                # Update SampleID in header
                struct.pack_into("<I", single_sample_buf, 4, sid)
                f.write(single_sample_buf)


# Standalone sample generators for live in-memory micro-benchmarking
def generate_tier1_python_dict_sample(idx: int) -> Dict[str, Any]:
    """Generates a standard Python dictionary with nested objects, floats, and strings."""
    t = np.linspace(0, 1, AUDIO_LEN, dtype=np.float32)
    return {
        "sample_id": idx,
        "audio_waveform": np.sin(2 * np.pi * 440.0 * t).astype(np.float32),
        "embedding": np.random.randn(EMBEDDING_DIM).astype(np.float32),
        "spectrogram_rms": np.random.rand(SPEC_DIM).astype(np.float32),
        "metadata": {
            "title": f"synthetic_track_{idx}_stereo_master",
            "artist": "ORBIT_Synthesis_Engine_v1",
            "genre": "techno",
            "tempo_bpm": 128.0,
            "key_signature": "A minor",
            "tags": ["synthetic", "audio", "high_rate", "vector", "benchmark"],
        },
    }
