#!/usr/bin/env python3
"""
ORBIT AI Audio Forensics Script

Runs the deep signal-level spectral forensics suite to detect artificial acoustic anomalies:
- 16kHz rolloff cutoff
- Phase entropy (instant group delay Shannon entropy)
- Cepstral checkerboard artifacts (upsampling periodic vocoder artifacts)
- M/S stereo phase coherence
- Pre-echo transient ratios
- Harmonicity ratios (including high-frequency anomalous harmonics)
- Timing & onset regularity (quantization check)
- Timbral/spectral evolution variance (flux, centroid, bandwidth, ZCR, MFCCs)
- Demucs stem-aware isolation diagnostics

Usage:
    python scripts/audio_forensics.py <audio_path> [--max-length 120] [--stems-dir <dir>]
"""

import sys
import os
import json
import argparse
import warnings

# Suppress warnings for cleaner JSON output
warnings.filterwarnings('ignore')


def check_dependencies():
    """Verify ML and signal forensics dependencies."""
    missing = []
    try:
        import librosa
    except ImportError:
        missing.append('librosa')
    try:
        import numpy
    except ImportError:
        missing.append('numpy')
    try:
        import scipy.stats
    except ImportError:
        missing.append('scipy')
        
    if missing:
        print(json.dumps({
            'error': 'missing_dependencies',
            'message': f'Missing Python packages for forensics: {", ".join(missing)}',
            'install': f'pip install {" ".join(missing)}'
        }))
        sys.exit(1)


# =========================================================================
# CLASSICAL FORENSICS ENGINES
# =========================================================================

def detect_spectral_cutoff(y, sr, n_fft=4096):
    """Detect sharp high-frequency cutoff typical of AI models trained on MP3 data."""
    import librosa
    import numpy as np
    
    nyquist = sr / 2
    if nyquist < 18000:
        return {'available': False, 'reason': f'sample_rate {sr} too low (need >= 44100)'}
    
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    
    mean_spectrum = np.mean(S, axis=1)
    
    def band_energy(lo, hi):
        mask = (freqs >= lo) & (freqs < hi)
        return float(np.mean(mean_spectrum[mask])) if mask.any() else 0.0
    
    e_below_16k = band_energy(100, 16000)
    e_16k_to_20k = band_energy(16000, 20000)
    
    ratio = e_16k_to_20k / (e_below_16k + 1e-10)
    has_cutoff = ratio < 0.005
    
    return {
        'available': True,
        'has_16k_cutoff': has_cutoff,
        'energy_ratio_above_16k': round(ratio, 6),
        'energy_below_16k': round(e_below_16k, 6),
        'energy_16k_to_20k': round(e_16k_to_20k, 6),
    }


def measure_phase_entropy(y, sr, n_fft=2048):
    """Measure instantaneous phase entropy of the audio signal."""
    import librosa
    import numpy as np
    
    D = librosa.stft(y, n_fft=n_fft)
    phase = np.angle(D)
    
    inst_freq = np.diff(phase, axis=1)
    
    n_bins = phase.shape[0]
    sample_bins = np.linspace(0, n_bins - 1, min(n_bins, 64), dtype=int)
    
    entropies = []
    for k in sample_bins:
        row = inst_freq[k]
        hist, _ = np.histogram(row, bins=64, range=(-np.pi, np.pi))
        hist = hist.astype(np.float64) + 1e-10
        hist /= hist.sum()
        ent = -np.sum(hist * np.log2(hist))
        entropies.append(ent)
    
    mean_entropy = float(np.mean(entropies))
    std_entropy = float(np.std(entropies))
    normalized = mean_entropy / 6.0
    
    return {
        'mean_entropy': round(mean_entropy, 4),
        'std_entropy': round(std_entropy, 4),
        'normalized_entropy': round(normalized, 4),
        'low_entropy': mean_entropy < 3.5,
    }


def measure_spectral_contrast(y, sr):
    """Measure spectral contrast across frequency sub-bands (identifies smearing)."""
    import librosa
    import numpy as np
    
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, n_bands=6)
    flatness = librosa.feature.spectral_flatness(y=y)
    
    mean_contrast = float(np.mean(contrast))
    std_contrast = float(np.std(contrast))
    mean_flatness = float(np.mean(flatness))
    
    return {
        'mean_contrast_db': round(mean_contrast, 4),
        'std_contrast_db': round(std_contrast, 4),
        'mean_flatness': round(mean_flatness, 6),
        'low_contrast': mean_contrast < 15.0,
        'high_flatness': mean_flatness > 0.05,
    }


def measure_onset_regularity(y, sr):
    """Measure coefficient of variation of inter-onset-intervals (quantization grid check)."""
    import librosa
    import numpy as np
    
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units='frames')
    
    if len(onset_frames) < 4:
        return {'available': False, 'reason': 'too_few_onsets'}
    
    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    ioi = np.diff(onset_times)
    
    mean_ioi = float(np.mean(ioi))
    std_ioi = float(np.std(ioi))
    cv = std_ioi / mean_ioi if mean_ioi > 0 else 0
    
    return {
        'available': True,
        'onset_count': len(onset_frames),
        'mean_ioi': round(mean_ioi, 4),
        'std_ioi': round(std_ioi, 4),
        'coefficient_of_variation': round(cv, 4),
        'metronomic': cv < 0.15,
    }


def measure_harmonicity(y, sr=44100):
    """Estimate harmonicity via harmonic/percussive energy ratio."""
    import librosa
    import numpy as np

    y_harm, y_perc = librosa.effects.hpss(y)
    harm_energy = float(np.mean(np.abs(y_harm)))
    perc_energy = float(np.mean(np.abs(y_perc)))
    total = harm_energy + perc_energy
    if total <= 1e-10:
        return {'available': False, 'reason': 'low_energy'}
    harmonic_ratio = harm_energy / total

    hf_hnr = None
    if sr >= 24000:
        n_fft = 4096
        S_harm = np.abs(librosa.stft(y_harm, n_fft=n_fft))
        S_perc = np.abs(librosa.stft(y_perc, n_fft=n_fft))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        hf_mask = freqs >= 12000
        hf_harm = float(np.mean(S_harm[hf_mask])) if hf_mask.any() else 0.0
        hf_perc = float(np.mean(S_perc[hf_mask])) if hf_mask.any() else 0.0
        hf_total = hf_harm + hf_perc
        hf_hnr = round(hf_harm / hf_total, 4) if hf_total > 1e-10 else 0.0

    result = {
        'available': True,
        'harmonic_ratio': round(harmonic_ratio, 4),
    }
    if hf_hnr is not None:
        result['hf_harmonic_ratio'] = hf_hnr
        result['hf_anomalous'] = hf_hnr > 0.7
    return result


def measure_crest_factor(y):
    """Estimate transient dynamic crest factor."""
    import numpy as np

    rms = float(np.sqrt(np.mean(y ** 2)))
    if rms <= 1e-10:
        return {'available': False, 'reason': 'silent'}
    peak = float(np.max(np.abs(y)))
    crest = peak / rms
    return {
        'available': True,
        'crest_factor': round(crest, 4),
        'low_crest': crest < 4.0,
    }


def measure_spectral_centroid_variance(y, sr):
    """Spectral centroid variance over time."""
    import librosa
    import numpy as np

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    if len(centroid) < 2:
        return {'available': False, 'reason': 'insufficient_frames'}
    mean_c = float(np.mean(centroid))
    std_c = float(np.std(centroid))
    cv = std_c / mean_c if mean_c > 0 else 0.0
    return {
        'available': True,
        'mean': round(mean_c, 2),
        'std': round(std_c, 2),
        'cv': round(cv, 4),
        'low_variance': cv < 0.30,
    }


def measure_spectral_bandwidth_variance(y, sr):
    """Spectral bandwidth variance."""
    import librosa
    import numpy as np

    bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
    if len(bw) < 2:
        return {'available': False, 'reason': 'insufficient_frames'}
    mean_bw = float(np.mean(bw))
    std_bw = float(np.std(bw))
    cv = std_bw / mean_bw if mean_bw > 0 else 0.0
    return {
        'available': True,
        'mean': round(mean_bw, 2),
        'std': round(std_bw, 2),
        'cv': round(cv, 4),
        'low_variance': cv < 0.25,
    }


def measure_spectral_rolloff(y, sr):
    """Spectral rolloff curve steepness."""
    import librosa
    import numpy as np

    rolloff_85 = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)[0]
    rolloff_95 = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.95)[0]
    if len(rolloff_85) < 2:
        return {'available': False, 'reason': 'insufficient_frames'}
    mean_85 = float(np.mean(rolloff_85))
    mean_95 = float(np.mean(rolloff_95))
    steepness = (mean_95 - mean_85) / (mean_95 + 1e-10)
    return {
        'available': True,
        'mean_rolloff_85': round(mean_85, 2),
        'mean_rolloff_95': round(mean_95, 2),
        'std_rolloff_85': round(float(np.std(rolloff_85)), 2),
        'steepness': round(steepness, 4),
        'steep_rolloff': steepness < 0.15,
    }


def measure_spectral_flux(y, sr, n_fft=2048):
    """Spectral flux variance across frames."""
    import librosa
    import numpy as np

    S = np.abs(librosa.stft(y, n_fft=n_fft))
    if S.shape[1] < 3:
        return {'available': False, 'reason': 'insufficient_frames'}
    flux = np.sqrt(np.mean(np.diff(S, axis=1) ** 2, axis=0))
    mean_flux = float(np.mean(flux))
    std_flux = float(np.std(flux))
    cv = std_flux / mean_flux if mean_flux > 0 else 0.0
    return {
        'available': True,
        'mean_flux': round(mean_flux, 6),
        'std_flux': round(std_flux, 6),
        'cv': round(cv, 4),
        'low_flux_variance': cv < 0.55,
    }


def measure_zcr_variance(y):
    """Zero-crossing rate coefficient of variation."""
    import librosa
    import numpy as np

    zcr = librosa.feature.zero_crossing_rate(y=y)[0]
    if len(zcr) < 2:
        return {'available': False, 'reason': 'insufficient_frames'}
    mean_zcr = float(np.mean(zcr))
    std_zcr = float(np.std(zcr))
    cv = std_zcr / mean_zcr if mean_zcr > 0 else 0.0
    return {
        'available': True,
        'mean_zcr': round(mean_zcr, 6),
        'std_zcr': round(std_zcr, 6),
        'cv': round(cv, 4),
        'low_variance': cv < 0.45,
    }


def measure_mfcc_temporal_stats(y, sr, n_mfcc=13):
    """MFCC temporal statistics variance (timbral palette check)."""
    import librosa
    import numpy as np

    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    if mfccs.shape[1] < 4:
        return {'available': False, 'reason': 'insufficient_frames'}
    variances = np.var(mfccs, axis=1)
    mean_var = float(np.mean(variances))
    return {
        'available': True,
        'mean_variance': round(mean_var, 4),
        'per_coeff_variance': [round(float(v), 4) for v in variances],
        'low_variance': mean_var < 700.0,
    }


def measure_chroma_entropy(y, sr):
    """Chroma distribution entropy."""
    import librosa
    import numpy as np
    from scipy.stats import entropy

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    if chroma.shape[1] < 2:
        return {'available': False, 'reason': 'insufficient_frames'}
    frame_entropies = []
    for i in range(chroma.shape[1]):
        col = chroma[:, i]
        col_norm = col / (col.sum() + 1e-10)
        frame_entropies.append(entropy(col_norm, base=2))
    mean_ent = float(np.mean(frame_entropies))
    std_ent = float(np.std(frame_entropies))
    max_entropy = np.log2(12)
    normalized = mean_ent / max_entropy
    return {
        'available': True,
        'mean_entropy': round(mean_ent, 4),
        'std_entropy': round(std_ent, 4),
        'normalized': round(normalized, 4),
        'low_entropy': normalized < 0.88,
    }


def measure_energy_arc(y, sr, n_segments=8):
    """Inter-segment energy variance (detects monotonic plateaus)."""
    import librosa
    import numpy as np

    rms = librosa.feature.rms(y=y)[0]
    if len(rms) < n_segments:
        return {'available': False, 'reason': 'too_short'}
    seg_len = len(rms) // n_segments
    segment_means = []
    for i in range(n_segments):
        start = i * seg_len
        end = start + seg_len
        segment_means.append(float(np.mean(rms[start:end])))
    arc_variance = float(np.var(segment_means))
    arc_range = max(segment_means) - min(segment_means)
    return {
        'available': True,
        'segment_means': [round(s, 6) for s in segment_means],
        'arc_variance': round(arc_variance, 8),
        'arc_range': round(arc_range, 6),
        'flat_arc': arc_variance < 0.0005,
    }


def measure_checkerboard_artifacts(y, sr, n_fft=2048):
    """Cepstral periodic upsampling peak detection (combats neural vocoders)."""
    import numpy as np
    import librosa

    S = np.abs(librosa.stft(y, n_fft=n_fft)) + 1e-10
    log_S = np.log(S)
    mean_log = np.mean(log_S, axis=1)

    cepstrum = np.real(np.fft.ifft(mean_log))
    n = len(cepstrum)
    if n < 64:
        return {'available': False, 'reason': 'insufficient_cepstrum_length'}

    high_q_region = cepstrum[16:n//2]
    peaks = np.abs(high_q_region)
    mean_val = np.mean(peaks)
    max_val = np.max(peaks)
    
    ratio = max_val / (mean_val + 1e-10)
    has_artifacts = ratio > 6.0
    
    return {
        'available': True,
        'cepstral_peak_ratio': round(float(ratio), 4),
        'has_artifacts': has_artifacts,
        'pow2_peak_ratio': round(float(ratio), 4),
    }


def measure_subband_energy_distribution(y, sr, n_fft=4096):
    """Shannon entropy of energy distribution across subbands."""
    import librosa
    import numpy as np
    from scipy.stats import entropy

    S = np.abs(librosa.stft(y, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    mean_spec = np.mean(S, axis=1)

    bands = [
        (20, 150), (150, 500), (500, 2000), (2000, 8000), (8000, 20000)
    ]
    band_energies = []
    for lo, hi in bands:
        mask = (freqs >= lo) & (freqs < hi)
        band_energies.append(float(np.sum(mean_spec[mask])) if mask.any() else 0.0)

    band_energies = np.array(band_energies)
    total = np.sum(band_energies)
    if total <= 1e-10:
        return {'available': False, 'reason': 'silent'}

    probs = band_energies / total
    ent = entropy(probs, base=2)
    max_ent = np.log2(len(bands))
    normalized = ent / max_ent

    return {
        'available': True,
        'distribution_entropy': round(float(normalized), 4),
        'low_entropy': normalized < 0.78,
    }


def measure_pre_echo(y, sr):
    """Transient pre-echo temporal framing analysis."""
    import librosa
    import numpy as np

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units='samples')
    if len(onsets) < 2:
        return {'available': False, 'reason': 'insufficient_onsets'}

    ratios = []
    slopes = []
    win_len = int(0.05 * sr) # 50ms window

    for o in onsets[:10]: # Check first 10 onsets
        start_pre = o - win_len
        if start_pre < 0 or o + win_len > len(y):
            continue
        pre_frame = y[start_pre:o]
        post_frame = y[o:o+win_len]
        
        pre_rms = np.sqrt(np.mean(pre_frame ** 2))
        post_rms = np.sqrt(np.mean(post_frame ** 2))
        
        if post_rms > 1e-4:
            ratios.append(pre_rms / post_rms)
            
        env_pre = librosa.onset.onset_strength(y=pre_frame, sr=sr)
        if len(env_pre) > 1:
            slopes.append(np.mean(np.diff(env_pre)))

    if not ratios:
        return {'available': False, 'reason': 'insufficient_pre_windows'}

    mean_ratio = float(np.mean(ratios))
    positive_slope_ratio = float(np.mean(slopes)) if slopes else 0.0

    return {
        'available': True,
        'mean_pre_echo_ratio': round(mean_ratio, 4),
        'positive_slope_ratio': round(positive_slope_ratio, 4),
        'has_pre_echo': mean_ratio > 0.15,
    }


def measure_hf_phase_incoherence(y, sr, n_fft=4096):
    """High-frequency phase incoherence group delay variance."""
    import librosa
    import numpy as np

    D = librosa.stft(y, n_fft=n_fft)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    hf_mask = freqs >= 12000
    if not hf_mask.any():
        return {'available': False, 'reason': 'sample_rate_too_low'}

    phase = np.angle(D[hf_mask, :])
    group_delay = np.diff(phase, axis=0) # phase derivative across frequency
    variances = np.var(group_delay, axis=1)
    mean_var = float(np.mean(variances))

    return {
        'available': True,
        'mean_group_delay_variance': round(mean_var, 4),
        'hf_incoherent': mean_var > 2.5,
    }


def measure_ms_phase_coherence(y_stereo, sr, n_fft=2048):
    """Mid-side phase coherence analysis for stereo files."""
    import librosa
    import numpy as np

    if y_stereo is None or y_stereo.ndim < 2 or y_stereo.shape[0] < 2:
        return {'available': False, 'reason': 'mono_input'}

    # Extract Mid (Left+Right) and Side (Left-Right)
    left = y_stereo[0]
    right = y_stereo[1]
    mid = 0.5 * (left + right)
    side = 0.5 * (left - right)

    M = np.abs(librosa.stft(mid, n_fft=n_fft))
    S = np.abs(librosa.stft(side, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    def coherence_ratio(lo, hi):
        mask = (freqs >= lo) & (freqs < hi)
        if not mask.any():
            return 0.0
        m_eng = np.sum(M[mask])
        s_eng = np.sum(S[mask])
        return float(s_eng / (m_eng + s_eng + 1e-10))

    sub_bass = coherence_ratio(20, 100)
    low_mid = coherence_ratio(100, 1000)

    # In natural recordings, sub_bass has high mid coherence (low side ratio < 0.1).
    # AI models smear spatial coherence across bands.
    is_anomalous = sub_bass > 0.4 or (low_mid < 0.15 and sub_bass > 0.3)

    return {
        'available': True,
        'sub_bass_sm_ratio': round(sub_bass, 4),
        'low_mid_sm_ratio': round(low_mid, 4),
        'ms_anomalous': is_anomalous,
    }


def measure_pitch_jitter(y, sr):
    """Exposes perfect linear vibrato modulating pitch (synthetically periodic)."""
    import librosa
    import numpy as np

    y_harm, _ = librosa.effects.hpss(y)
    f0, _, voiced_probs = librosa.pyin(
        y_harm, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'), sr=sr
    )

    valid_f0 = f0[~np.isnan(f0) & (voiced_probs > 0.6)]
    if len(valid_f0) < 64:
        return {'available': False, 'reason': 'insufficient_voiced_content'}

    diffs = np.diff(valid_f0)
    mean_diff = np.mean(np.abs(diffs))
    
    # Calculate modulation spectrum peak
    # Synthetic pitch modulation has clean sinusoidal frequency
    spectrum = np.abs(np.fft.rfft(valid_f0 - np.mean(valid_f0)))
    peak_val = np.max(spectrum[1:])
    mean_spec = np.mean(spectrum[1:])
    ratio = peak_val / (mean_spec + 1e-10)

    return {
        'available': True,
        'mean_pitch_step': round(float(mean_diff), 4),
        'modulation_spectral_peak': round(float(ratio), 4),
        'mean_modulation_slope': round(float(ratio), 4),
        'perfect_vibrato': ratio > 5.0,
    }


def measure_noise_floor_structure(y, sr, n_fft=4096):
    """Shannon entropy of noise floor autocorrelation (spots hidden watermark remnants)."""
    import librosa
    import numpy as np

    _, y_perc = librosa.effects.hpss(y)
    S = np.abs(librosa.stft(y_perc, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    
    hf_mask = freqs >= 15000
    if not hf_mask.any():
        return {'available': False, 'reason': 'sample_rate_too_low'}

    hf_noise = np.mean(S[hf_mask, :], axis=0)
    # Autocorrelation of high frequency envelope
    acorr = np.correlate(hf_noise, hf_noise, mode='full')
    acorr = acorr[acorr.length//2:]
    acorr /= acorr[0] + 1e-10

    # Human noise floor is highly unpredictable (decaying random acorr).
    # Hidden cyclical metadata layers leave correlation peaks.
    peaks = acorr[16:128]
    max_peak = float(np.max(peaks)) if len(peaks) > 0 else 0.0

    return {
        'available': True,
        'noise_floor_autocorr': round(max_peak, 4),
        'structured_noise': max_peak > 0.35,
    }


def measure_loop_repetition(y, sr):
    """Estimate loop repetition structural score via self-similarity."""
    import librosa
    import numpy as np

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    # Calculate self-similarity matrix
    similarity = np.dot(chroma.T, chroma)
    n = similarity.shape[0]
    if n < 8:
        return {'available': False, 'reason': 'too_short'}
    
    # Check off-diagonal periodic repeating stripes (AI loops are identical)
    similarity /= np.max(similarity) + 1e-10
    diags = [float(np.mean(np.diagonal(similarity, offset=k))) for k in range(4, n//2)]
    max_diag = max(diags) if diags else 0.0
    return {
        'available': True,
        'repetition_score': round(max_diag, 4),
        'high_loop_repetition': max_diag > 0.65,
    }


def measure_tempo_regularity(y, sr):
    """Tempo stability score (tracks microtiming grid deviations)."""
    import librosa
    import numpy as np

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
    if tempogram.shape[1] < 4:
        return {'available': False, 'reason': 'too_short'}
    
    # Calculate variance of tempo strengths across frames
    tempo_profile = np.max(tempogram, axis=0)
    mean_val = np.mean(tempo_profile)
    std_val = np.std(tempo_profile)
    cv = std_val / mean_val if mean_val > 0 else 0.0
    stability = 1.0 - cv
    return {
        'available': True,
        'stability': round(float(stability), 4),
        'cv': round(float(cv), 4),
    }


# =========================================================================
# ORCHESTRATION PIPELINE
# =========================================================================

def run_forensics(audio_path, max_length_seconds=120, stems_dir=None):
    """Orchestrates all spectral forensics modules and returns analysis payload."""
    import librosa
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')
        
    target_sr = 44100
    y, sr = librosa.load(audio_path, sr=target_sr, mono=True)
    
    y_stereo = None
    try:
        y_stereo_raw, _ = librosa.load(audio_path, sr=target_sr, mono=False)
        if y_stereo_raw.ndim == 2 and y_stereo_raw.shape[0] >= 2:
            y_stereo = y_stereo_raw
    except Exception:
        pass
        
    duration = len(y) / sr
    max_samples = int(max_length_seconds * sr)
    if len(y) > max_samples:
        y = y[:max_samples]
    if y_stereo is not None and y_stereo.shape[1] > max_samples:
        y_stereo = y_stereo[:, :max_samples]
        
    # Run full forensics suite
    forensics = {
        'spectral_cutoff': detect_spectral_cutoff(y, sr),
        'phase_entropy': measure_phase_entropy(y, sr),
        'spectral_contrast': measure_spectral_contrast(y, sr),
        'onset_regularity': measure_onset_regularity(y, sr),
        'harmonicity': measure_harmonicity(y, sr),
        'loop_repetition': measure_loop_repetition(y, sr),
        'tempo_regularity': measure_tempo_regularity(y, sr),
        'crest_factor': measure_crest_factor(y),
        'spectral_centroid_var': measure_spectral_centroid_variance(y, sr),
        'spectral_bandwidth_var': measure_spectral_bandwidth_variance(y, sr),
        'spectral_rolloff': measure_spectral_rolloff(y, sr),
        'spectral_flux': measure_spectral_flux(y, sr),
        'zcr_variance': measure_zcr_variance(y),
        'mfcc_temporal': measure_mfcc_temporal_stats(y, sr),
        'chroma_entropy': measure_chroma_entropy(y, sr),
        'energy_arc': measure_energy_arc(y, sr),
        'checkerboard': measure_checkerboard_artifacts(y, sr),
        'subband_energy': measure_subband_energy_distribution(y, sr),
        'pre_echo': measure_pre_echo(y, sr),
        'hf_phase_incoherence': measure_hf_phase_incoherence(y, sr),
        'ms_phase_coherence': measure_ms_phase_coherence(y_stereo, sr),
        'pitch_jitter': measure_pitch_jitter(y, sr),
        'noise_floor_structure': measure_noise_floor_structure(y, sr),
    }

    # Integrate Demucs stems if available
    if stems_dir and os.path.isdir(stems_dir):
        import numpy as np
        stem_forensics = {}

        def load_stem(stem_name):
            stem_path = os.path.join(stems_dir, f'{stem_name}.wav')
            if not os.path.exists(stem_path):
                return None
            stem_y, _ = librosa.load(stem_path, sr=sr, mono=True)
            max_samples_stem = int(max_length_seconds * sr)
            if len(stem_y) > max_samples_stem:
                stem_y = stem_y[:max_samples_stem]
            return stem_y

        vocals_stem = load_stem('vocals')
        drums_stem = load_stem('drums')
        bass_stem = load_stem('bass')
        other_stem = load_stem('other')

        if vocals_stem is not None and len(vocals_stem) > 0:
            stem_forensics['vocal_spectral_cutoff'] = detect_spectral_cutoff(vocals_stem, sr)
            stem_forensics['vocal_phase_entropy'] = measure_phase_entropy(vocals_stem, sr)

        if drums_stem is not None and len(drums_stem) > 0:
            stem_forensics['drum_onset_regularity'] = measure_onset_regularity(drums_stem, sr)

        stem_dynamic_ranges = {}
        for stem_name, stem_y in [('vocals', vocals_stem), ('drums', drums_stem), ('bass', bass_stem), ('other', other_stem)]:
            if stem_y is not None and len(stem_y) > 0:
                stem_dynamic_ranges[stem_name] = calculate_dynamic_range(stem_y)
        if stem_dynamic_ranges:
            stem_forensics['stem_dynamic_ranges'] = stem_dynamic_ranges

        if vocals_stem is not None and len(vocals_stem) > 1000:
            bleed_scores = []
            for stem_y in [drums_stem, bass_stem, other_stem]:
                if stem_y is None or len(stem_y) < 1000:
                    continue
                target_len = min(len(vocals_stem), len(stem_y))
                if target_len < 1000:
                    continue
                v = vocals_stem[:target_len]
                o = stem_y[:target_len]
                v_std = float(np.std(v))
                o_std = float(np.std(o))
                if v_std <= 1e-10 or o_std <= 1e-10:
                    continue
                corr = float(np.corrcoef(v, o)[0, 1])
                if not np.isnan(corr):
                    bleed_scores.append(abs(corr))

            if bleed_scores:
                mean_bleed = float(np.mean(bleed_scores))
                stem_forensics['vocal_instrumental_bleed'] = {
                    'available': True,
                    'mean_abs_correlation': round(mean_bleed, 4),
                    'high_bleed': mean_bleed > 0.12,
                }
            else:
                stem_forensics['vocal_instrumental_bleed'] = {
                    'available': False,
                    'reason': 'insufficient_stems',
                }

        if stem_forensics:
            forensics['stem_forensics'] = stem_forensics

    return forensics


def main():
    parser = argparse.ArgumentParser(description='Analyze audio for AI spectral forensics anomalies')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--output', choices=['json'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--max-length', type=int, default=120,
                        help='Max audio length to analyze in seconds (default: 120)')
    parser.add_argument('--stems-dir',
                        help='Directory containing Demucs stems for stem-aware forensics')
    
    args = parser.parse_args()
    
    check_dependencies()
    
    if not os.path.exists(args.audio_path):
        print(json.dumps({'error': 'file_not_found', 'message': f'File not found: {args.audio_path}'}))
        sys.exit(1)
        
    try:
        import numpy as np
        
        class NumpyEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, (np.bool_, np.generic)):
                    return obj.item()
                return super().default(obj)
                
        forensics_payload = run_forensics(
            args.audio_path,
            max_length_seconds=args.max_length,
            stems_dir=args.stems_dir
        )
        print(json.dumps(forensics_payload, cls=NumpyEncoder))
        
    except Exception as e:
        print(json.dumps({
            'error': 'processing_error',
            'message': str(e),
            'type': type(e).__name__
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
