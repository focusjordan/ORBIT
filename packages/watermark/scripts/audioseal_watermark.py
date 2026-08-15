#!/usr/bin/env python3
"""
ORBIT AudioSeal Neural Watermarking Script (OrbitSeal Engine)

High-fidelity neural audio watermarking with Meta FAIR AudioSeal:
- 40-bit (5-byte) Time-Division Slot Multiplexing Protocol (1.0s fixed slots)
- Cyclic slot repetition: [Slot 0, Slot 1, Slot 2] with CRC-2 integrity verification
- Sample-level localized detection and fast single-pass recovery
- MIT Licensed backbone with proprietary ORBIT temporal slot modulation

Usage:
    python scripts/audioseal_watermark.py check
    python scripts/audioseal_watermark.py embed <input.wav> <output.wav> --payload <hex_or_bytes>
    python scripts/audioseal_watermark.py extract <input.wav>
"""

import os
import sys
import json
import argparse
import warnings
import logging
import io

# Suppress compilation / eager mode warnings & logging for clean JSON output
os.environ['NO_TORCH_COMPILE'] = '1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'
os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'
warnings.filterwarnings('ignore')

SLOT_DURATION_SEC = 1.0
SAMPLE_RATE_NATIVE = 16000

class CaptureOutput:
    """Context manager to capture stdout/stderr buffers to prevent JSON corruption."""
    def __init__(self):
        self._original_stdout = None
        self._original_stderr = None
        self._stdout_buf = None
        self._stderr_buf = None
    
    def __enter__(self):
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        self._stdout_buf = io.StringIO()
        self._stderr_buf = io.StringIO()
        sys.stdout = self._stdout_buf
        sys.stderr = self._stderr_buf
        return self
    
    def __exit__(self, *args):
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr
    
    @property
    def stdout(self):
        return self._stdout_buf.getvalue() if self._stdout_buf else ''
    
    @property
    def stderr(self):
        return self._stderr_buf.getvalue() if self._stderr_buf else ''


def check_dependencies():
    missing = []
    try:
        import torch
    except ImportError:
        missing.append('torch')
    try:
        import audioseal
    except ImportError:
        missing.append('audioseal')
    try:
        import librosa
    except ImportError:
        missing.append('librosa')
    try:
        import soundfile
    except ImportError:
        missing.append('soundfile')
    try:
        import numpy
    except ImportError:
        missing.append('numpy')
    try:
        import blake3
    except ImportError:
        missing.append('blake3')
    
    if missing:
        print(json.dumps({
            'error': 'missing_dependencies',
            'message': f'Missing Python packages: {", ".join(missing)}',
            'install': f'pip install {" ".join(missing)}'
        }))
        sys.exit(1)


def cleanup_gpu():
    import gc
    import torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def calculate_crc2(bits_40: list) -> list:
    """Calculate 2-bit CRC over 40 payload bits."""
    crc = 0
    for b in bits_40:
        crc = ((crc << 1) | b) ^ (0x07 if (crc & 0x02) else 0)
    return [(crc >> 1) & 1, crc & 1]


def payload_to_slots(payload_bytes: bytes) -> list:
    """
    Convert 5 bytes (40 bits) into 3 16-bit slot vectors:
    Slot 0: [0, 0] (header) + 14 data bits (bits 0..13) = 16 bits
    Slot 1: [0, 1] (header) + 14 data bits (bits 14..27) = 16 bits
    Slot 2: [1, 0] (header) + 12 data bits (bits 28..39) + 2 CRC-2 bits = 16 bits
    """
    if len(payload_bytes) != 5:
        raise ValueError(f"Payload must be exactly 5 bytes (40 bits), got {len(payload_bytes)}")
    
    bits = []
    for byte in payload_bytes:
        for i in range(7, -1, -1):
            bits.append((byte >> i) & 1)
    
    crc2 = calculate_crc2(bits)
    
    slot0 = [0, 0] + bits[0:14]
    slot1 = [0, 1] + bits[14:28]
    slot2 = [1, 0] + bits[28:40] + crc2
    
    return [slot0, slot1, slot2]


def slots_to_payload(slot0_bits: list, slot1_bits: list, slot2_bits: list) -> tuple:
    """Reconstruct 5-byte payload from 3 16-bit slots and verify CRC-2."""
    d0 = slot0_bits[2:16]  # 14 bits
    d1 = slot1_bits[2:16]  # 14 bits
    d2 = slot2_bits[2:14]  # 12 bits
    crc_received = slot2_bits[14:16]  # 2 bits
    
    bits_40 = d0 + d1 + d2
    crc_calculated = calculate_crc2(bits_40)
    crc_valid = (crc_received == crc_calculated)
    
    byte_vals = []
    for i in range(0, 40, 8):
        val = 0
        for j in range(8):
            val = (val << 1) | bits_40[i + j]
        byte_vals.append(val)
    
    return bytes(byte_vals), crc_valid


def get_models(device=None):
    from audioseal import AudioSeal
    import torch
    if device is None:
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    cap = CaptureOutput()
    with cap:
        generator = AudioSeal.load_generator("audioseal_wm_16bits").to(device)
        detector = AudioSeal.load_detector("audioseal_detector_16bits").to(device)
        generator.eval()
        detector.eval()
    
    return generator, detector, device


def embed_watermark(audio_path: str, output_path: str, payload_bytes: bytes, target_sr=16000):
    import librosa
    import soundfile as sf
    import numpy as np
    import torch
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    try:
        # Load audio at native AudioSeal sample rate (16kHz)
        audio_np, sr = librosa.load(audio_path, sr=target_sr, mono=True)
        duration = len(audio_np) / sr
        
        if duration < 1.0:
            raise ValueError(f"Audio too short: {duration:.2f}s (minimum 1.0s required)")
        
        generator, _, device = get_models()
        slots = payload_to_slots(payload_bytes)
        
        chunk_samples = int(SLOT_DURATION_SEC * sr)
        total_samples = len(audio_np)
        num_chunks = max(1, total_samples // chunk_samples)
        
        watermarked_np = np.copy(audio_np)
        total_diff_sq = 0.0
        total_orig_sq = np.sum(audio_np ** 2) + 1e-12
        
        for k in range(num_chunks):
            start_idx = k * chunk_samples
            end_idx = min(total_samples, (k + 1) * chunk_samples)
            if k == num_chunks - 1 and (total_samples - end_idx) < chunk_samples:
                end_idx = total_samples
            
            chunk = audio_np[start_idx:end_idx]
            if len(chunk) == 0:
                continue
            
            slot_idx = k % 3
            slot_bits = slots[slot_idx]
            slot_tensor = torch.tensor([slot_bits], dtype=torch.int32, device=device)
            
            chunk_tensor = torch.from_numpy(chunk).unsqueeze(0).unsqueeze(0).to(device)
            
            with torch.no_grad():
                wm_tensor = generator.get_watermark(chunk_tensor, message=slot_tensor, sample_rate=sr)
                wm_np = wm_tensor.squeeze().cpu().numpy()
            
            watermarked_np[start_idx:end_idx] = np.clip(chunk + wm_np, -1.0, 1.0)
            total_diff_sq += np.sum(wm_np ** 2)
        
        sdr = 10.0 * np.log10(total_orig_sq / (total_diff_sq + 1e-12))
        sf.write(output_path, watermarked_np, sr)
        
        return {
            'success': True,
            'sdr': float(sdr),
            'payload_hex': payload_bytes.hex(),
            'duration': duration,
            'sample_rate': sr,
            'method': 'audioseal',
            'slots_embedded': num_chunks,
        }
    finally:
        cleanup_gpu()


def extract_watermark(audio_path: str, target_sr=16000):
    import librosa
    import numpy as np
    import torch
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")
    
    try:
        audio_np, sr = librosa.load(audio_path, sr=target_sr, mono=True)
        duration = len(audio_np) / sr
        
        _, detector, device = get_models()
        
        chunk_samples = int(SLOT_DURATION_SEC * sr)
        total_samples = len(audio_np)
        num_chunks = max(1, total_samples // chunk_samples)
        
        slot_detections = {0: [], 1: [], 2: []}
        all_confidences = []
        
        for k in range(num_chunks):
            start_idx = k * chunk_samples
            end_idx = min(total_samples, (k + 1) * chunk_samples)
            if k == num_chunks - 1 and (total_samples - end_idx) < chunk_samples:
                end_idx = total_samples
            
            chunk = audio_np[start_idx:end_idx]
            if len(chunk) < int(0.5 * sr):
                continue
            
            chunk_tensor = torch.from_numpy(chunk).unsqueeze(0).unsqueeze(0).to(device)
            
            with torch.no_grad():
                det_prob, dec_msg = detector.detect_watermark(chunk_tensor, sample_rate=sr)
            
            prob_val = float(det_prob.mean().item())
            all_confidences.append(prob_val)
            
            if prob_val >= 0.4 and dec_msg is not None:
                msg_bits = dec_msg.squeeze().cpu().tolist()
                if isinstance(msg_bits, list) and len(msg_bits) == 16:
                    header = (msg_bits[0], msg_bits[1])
                    if header == (0, 0):
                        slot_detections[0].append((prob_val, msg_bits))
                    elif header == (0, 1):
                        slot_detections[1].append((prob_val, msg_bits))
                    elif header == (1, 0):
                        slot_detections[2].append((prob_val, msg_bits))
        
        avg_confidence = float(np.mean(all_confidences)) if all_confidences else 0.0
        
        def resolve_slot(candidates):
            if not candidates:
                return None
            bit_weights = np.zeros(16)
            total_w = 0.0
            for w, bits in candidates:
                for idx, b in enumerate(bits):
                    if b == 1:
                        bit_weights[idx] += w
                total_w += w
            if total_w == 0:
                return candidates[0][1]
            return [1 if bit_weights[i] >= (total_w / 2.0) else 0 for i in range(16)]
        
        resolved_s0 = resolve_slot(slot_detections[0])
        resolved_s1 = resolve_slot(slot_detections[1])
        resolved_s2 = resolve_slot(slot_detections[2])
        
        detected_slots = [i for i, s in enumerate([resolved_s0, resolved_s1, resolved_s2]) if s is not None]
        
        if resolved_s0 is not None and resolved_s1 is not None and resolved_s2 is not None:
            payload_bytes, crc_valid = slots_to_payload(resolved_s0, resolved_s1, resolved_s2)
            detected = avg_confidence >= 0.45 or crc_valid
            return {
                'success': True,
                'detected': detected,
                'payload_hex': payload_bytes.hex(),
                'payload_bytes': list(payload_bytes),
                'crc_valid': crc_valid,
                'confidence': avg_confidence,
                'duration': duration,
                'sample_rate': sr,
                'method': 'audioseal',
                'slots_detected': detected_slots,
            }
        elif len(detected_slots) > 0 and avg_confidence >= 0.5:
            return {
                'success': True,
                'detected': True,
                'partial': True,
                'payload_hex': None,
                'confidence': avg_confidence,
                'duration': duration,
                'sample_rate': sr,
                'method': 'audioseal',
                'slots_detected': detected_slots,
            }
        else:
            return {
                'success': True,
                'detected': False,
                'payload_hex': None,
                'confidence': avg_confidence,
                'duration': duration,
                'sample_rate': sr,
                'method': 'audioseal',
                'slots_detected': detected_slots,
            }
    finally:
        cleanup_gpu()


def check_environment():
    check_dependencies()
    import torch
    import audioseal
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    return {
        'available': True,
        'message': 'AudioSeal environment ready',
        'details': {
            'device': device,
            'cuda_available': torch.cuda.is_available(),
            'audioseal_version': getattr(audioseal, '__version__', '0.2.0'),
            'slot_duration_sec': SLOT_DURATION_SEC,
            'message_capacity_bits': 40
        }
    }


def main():
    parser = argparse.ArgumentParser(description='ORBIT AudioSeal Watermarking')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    
    subparsers.add_parser('check', help='Check environment')
    
    embed_parser = subparsers.add_parser('embed', help='Embed watermark')
    embed_parser.add_argument('audio_path', help='Input audio path')
    embed_parser.add_argument('output_path', help='Output audio path')
    embed_parser.add_argument('--payload', required=True, help='5-byte payload as hex string or comma-separated ints')
    embed_parser.add_argument('--sample-rate', type=int, default=16000, help='Target sample rate')
    
    extract_parser = subparsers.add_parser('extract', help='Extract watermark')
    extract_parser.add_argument('audio_path', help='Watermarked audio path')
    extract_parser.add_argument('--sample-rate', type=int, default=16000, help='Target sample rate')
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        sys.exit(1)
    
    try:
        if args.command == 'check':
            result = check_environment()
            print(json.dumps(result))
            
        elif args.command == 'embed':
            check_dependencies()
            raw_payload = args.payload.strip()
            if ',' in raw_payload:
                payload_bytes = bytes([int(x.strip()) for x in raw_payload.split(',')])
            else:
                payload_bytes = bytes.fromhex(raw_payload)
            
            result = embed_watermark(args.audio_path, args.output_path, payload_bytes, target_sr=args.sample_rate)
            print(json.dumps(result))
            
        elif args.command == 'extract':
            check_dependencies()
            result = extract_watermark(args.audio_path, target_sr=args.sample_rate)
            print(json.dumps(result))
            
    except Exception as e:
        print(json.dumps({
            'error': 'processing_error',
            'message': str(e),
            'type': type(e).__name__
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
