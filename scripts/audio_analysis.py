#!/usr/bin/env python3
"""
ORBIT Audio Analysis Script

Session 21 - BPM and key detection using librosa

This script analyzes audio files to extract:
- BPM (tempo) with confidence score
- Musical key with confidence score
- Energy level (RMS-based)
- Loudness (dB)

Usage:
    python scripts/audio_analysis.py <audio_path> [--output json]
    
Output (JSON):
    {
        "bpm": {"value": 120, "confidence": 0.95},
        "key": {"value": "A minor", "confidence": 0.88},
        "energy": 0.65,
        "loudness_db": -14.2,
        "duration": 180.5
    }

Requirements:
    pip install librosa numpy

See: ORBIT_ENHANCEMENTS.md Section 3 (Auto-Metadata Extraction)
"""

import sys
import os
import json
import argparse
import warnings

# Suppress warnings for cleaner JSON output
warnings.filterwarnings('ignore')

# Krumhansl-Schmuckler key profiles
# These represent the "ideal" distribution of pitch classes for each key
# Major key profile (starting from C)
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
# Minor key profile (starting from C)
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

# Pitch class names
PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def check_dependencies():
    """Check if required packages are installed."""
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
            'message': f'Missing Python packages: {", ".join(missing)}',
            'install': f'pip install {" ".join(missing)}'
        }))
        sys.exit(1)


def correlate_with_profile(chroma, profile):
    """
    Calculate Pearson correlation between chroma vector and key profile.
    
    Args:
        chroma: 12-element array of chroma intensities
        profile: 12-element key profile array
    
    Returns:
        Correlation coefficient (-1 to 1)
    """
    import numpy as np
    
    # Normalize both vectors
    chroma_norm = chroma - np.mean(chroma)
    profile_norm = np.array(profile) - np.mean(profile)
    
    # Pearson correlation
    numerator = np.sum(chroma_norm * profile_norm)
    denominator = np.sqrt(np.sum(chroma_norm ** 2) * np.sum(profile_norm ** 2))
    
    if denominator == 0:
        return 0
    
    return numerator / denominator


def detect_key(y, sr):
    """
    Detect musical key using Krumhansl-Schmuckler algorithm.
    
    This algorithm:
    1. Computes chroma features (pitch class distribution)
    2. Correlates with major and minor key profiles for all 12 keys
    3. Returns the key with highest correlation
    
    Args:
        y: Audio time series
        sr: Sample rate
    
    Returns:
        dict with key name, mode, and confidence
    """
    import librosa
    import numpy as np
    
    # Compute chroma features using CQT (better for key detection)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    
    # Average across time to get overall pitch class distribution
    chroma_avg = np.mean(chroma, axis=1)
    
    # Normalize
    chroma_avg = chroma_avg / np.max(chroma_avg) if np.max(chroma_avg) > 0 else chroma_avg
    
    best_key = None
    best_mode = None
    best_correlation = -1
    
    # Try all 12 keys for both major and minor
    for i in range(12):
        # Rotate chroma to align with key
        rotated_chroma = np.roll(chroma_avg, -i)
        
        # Correlate with major profile
        major_corr = correlate_with_profile(rotated_chroma, MAJOR_PROFILE)
        if major_corr > best_correlation:
            best_correlation = major_corr
            best_key = PITCH_CLASSES[i]
            best_mode = 'major'
        
        # Correlate with minor profile
        minor_corr = correlate_with_profile(rotated_chroma, MINOR_PROFILE)
        if minor_corr > best_correlation:
            best_correlation = minor_corr
            best_key = PITCH_CLASSES[i]
            best_mode = 'minor'
    
    # Convert correlation to confidence (0-1 range)
    # Correlation can be negative, but good matches are typically > 0.5
    confidence = max(0, min(1, (best_correlation + 1) / 2))
    
    return {
        'value': f'{best_key} {best_mode}',
        'key': best_key,
        'mode': best_mode,
        'confidence': round(confidence, 4)
    }


def detect_bpm(y, sr):
    """
    Detect tempo (BPM) using librosa's beat tracker.
    
    Args:
        y: Audio time series
        sr: Sample rate
    
    Returns:
        dict with BPM value and confidence
    """
    import librosa
    import numpy as np
    
    # Use librosa's beat tracker
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    
    # Handle both scalar and array return values (librosa version differences)
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0]) if len(tempo) > 0 else 0.0
    else:
        tempo = float(tempo)
    
    # Calculate confidence based on beat strength
    # Get onset strength envelope
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    
    # Calculate tempo confidence using tempogram
    # Higher autocorrelation at detected tempo = higher confidence
    tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)
    
    # Find the tempo bin closest to detected tempo
    tempo_bins = librosa.tempo_frequencies(tempogram.shape[0], sr=sr)
    tempo_idx = np.argmin(np.abs(tempo_bins - tempo))
    
    # Confidence is the normalized strength at the detected tempo
    if tempogram.shape[1] > 0:
        tempo_strength = np.mean(tempogram[tempo_idx, :])
        max_strength = np.max(np.mean(tempogram, axis=1))
        confidence = tempo_strength / max_strength if max_strength > 0 else 0
    else:
        confidence = 0.5  # Default confidence if tempogram fails
    
    return {
        'value': round(tempo, 1),
        'confidence': round(float(confidence), 4)
    }


def calculate_energy(y):
    """
    Calculate energy level based on RMS.
    
    Args:
        y: Audio time series
    
    Returns:
        Energy level (0-1)
    """
    import librosa
    import numpy as np
    
    # Calculate RMS
    rms = librosa.feature.rms(y=y)[0]
    
    # Get mean RMS
    mean_rms = np.mean(rms)
    
    # Normalize to 0-1 range (typical music RMS is 0.01-0.3)
    # Using a sigmoid-like scaling
    energy = min(1.0, mean_rms / 0.15)
    
    return round(float(energy), 4)


def calculate_loudness(y, sr):
    """
    Calculate loudness in dB (similar to LUFS but simpler).
    
    Args:
        y: Audio time series
        sr: Sample rate
    
    Returns:
        Loudness in dB (typically -60 to 0)
    """
    import numpy as np
    
    # RMS to dB
    rms = np.sqrt(np.mean(y ** 2))
    
    if rms > 0:
        db = 20 * np.log10(rms)
    else:
        db = -60  # Silence
    
    return round(float(db), 2)


def calculate_dynamic_range(y):
    """
    Estimate macro dynamic range in dB using frame RMS percentiles.
    """
    import librosa
    import numpy as np

    rms = librosa.feature.rms(y=y)[0]
    if len(rms) == 0:
        return 0.0

    high = np.percentile(rms, 95)
    low = np.percentile(rms, 10)
    high = max(high, 1e-10)
    low = max(low, 1e-10)
    dr = 20 * np.log10(high / low)
    return round(float(max(0.0, dr)), 3)


# =========================================================================
# AI SPECTRAL FORENSICS
# =========================================================================

def detect_spectral_cutoff(y, sr, n_fft=4096):
    """
    Detect sharp high-frequency cutoff typical of AI models trained on MP3 data.
    
    AI generators trained on MP3 datasets replicate MP3's ~16kHz rolloff even
    when outputting WAV/FLAC. Human masters typically preserve energy up to
    20kHz+.
    
    Args:
        y:  Audio time series (must be loaded at sr >= 44100)
        sr: Sample rate
    
    Returns:
        dict with cutoff analysis
    """
    import librosa
    import numpy as np
    
    nyquist = sr / 2
    if nyquist < 18000:
        return {'available': False, 'reason': f'sample_rate {sr} too low (need >= 44100)'}
    
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    
    mean_spectrum = np.mean(S, axis=1)
    
    # Energy in several bands
    def band_energy(lo, hi):
        mask = (freqs >= lo) & (freqs < hi)
        return float(np.mean(mean_spectrum[mask])) if mask.any() else 0.0
    
    e_below_16k = band_energy(100, 16000)
    e_16k_to_20k = band_energy(16000, 20000)
    
    ratio = e_16k_to_20k / (e_below_16k + 1e-10)
    
    # A sharp cutoff at 16kHz produces ratio < 0.005
    has_cutoff = ratio < 0.005
    
    return {
        'available': True,
        'has_16k_cutoff': has_cutoff,
        'energy_ratio_above_16k': round(ratio, 6),
        'energy_below_16k': round(e_below_16k, 6),
        'energy_16k_to_20k': round(e_16k_to_20k, 6),
    }


def measure_phase_entropy(y, sr, n_fft=2048):
    """
    Measure phase entropy of the audio signal.
    
    Neural networks struggle with generating natural phase relationships.
    Human recordings have chaotic phase due to room acoustics and analog
    circuits. AI audio often has unnaturally coherent (low-entropy) phase.
    
    Args:
        y:  Audio time series
        sr: Sample rate
    
    Returns:
        dict with phase entropy metrics
    """
    import librosa
    import numpy as np
    
    D = librosa.stft(y, n_fft=n_fft)
    phase = np.angle(D)
    
    # Instantaneous frequency: phase derivative across time frames
    inst_freq = np.diff(phase, axis=1)
    
    # Compute entropy of the instantaneous frequency distribution per band.
    # We sample frequency bins to keep computation bounded.
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
    
    # Max possible entropy for 64-bin uniform distribution = log2(64) ≈ 6.0
    # Human audio: typically 4.5-5.8. AI phase-locked audio: < 3.5
    normalized = mean_entropy / 6.0
    
    return {
        'mean_entropy': round(mean_entropy, 4),
        'std_entropy': round(std_entropy, 4),
        'normalized_entropy': round(normalized, 4),
        'low_entropy': mean_entropy < 3.5,
    }


def measure_spectral_contrast(y, sr):
    """
    Measure spectral contrast across frequency sub-bands.
    
    AI-generated audio has "spectral smearing" — frequencies bleed into each
    other because the entire mix is generated as a single waveform rather
    than layered from distinct instruments. Low spectral contrast indicates
    poor instrument separation.
    
    Also computes spectral flatness (Wiener entropy) which measures how
    noise-like the spectrum is.
    
    Args:
        y:  Audio time series
        sr: Sample rate
    
    Returns:
        dict with spectral contrast and flatness metrics
    """
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
    """
    Measure how metronomically regular onset timing is.
    
    Human performers have micro-timing variations (swing, push/pull). AI
    generators produce onsets aligned to a perfect grid. Very low IOI
    variance relative to the mean suggests machine-generated timing.
    
    Args:
        y:  Audio time series
        sr: Sample rate
    
    Returns:
        dict with onset regularity metrics
    """
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
    """
    Estimate harmonicity via harmonic/percussive energy ratio.
    Also computes high-frequency (>12kHz) harmonic-to-noise ratio.
    AI forces harmonic structure into bands that should be noise-dominated.
    """
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
    """
    Crest factor: peak amplitude / RMS. AI audio lacks transient peaks
    (drums, plucks) so crest factor is lower than human recordings.
    """
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
    """
    Spectral centroid variance over time. AI has less timbral variation.
    """
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
        'low_variance': cv < 0.15,
    }


def measure_spectral_bandwidth_variance(y, sr):
    """
    Spectral bandwidth variance. AI maintains unnaturally consistent bandwidth.
    """
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
        'low_variance': cv < 0.12,
    }


def measure_spectral_rolloff(y, sr):
    """
    Spectral rolloff shape — overall rolloff curve steepness, beyond just
    the 16kHz cutoff check.
    """
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
        'steep_rolloff': steepness < 0.08,
    }


def measure_spectral_flux(y, sr, n_fft=2048):
    """
    Spectral flux variance. AI has more static spectral evolution;
    human music has more frame-to-frame change.
    """
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
        'low_flux_variance': cv < 0.35,
    }


def measure_zcr_variance(y):
    """
    Zero-crossing rate variance. AI waveforms have artificially smooth
    zero-crossing patterns.
    """
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
        'low_variance': cv < 0.25,
    }


def measure_mfcc_temporal_stats(y, sr, n_mfcc=13):
    """
    MFCC temporal statistics (variance + kurtosis per coefficient).
    AI audio has less MFCC variation — the timbral palette is narrower.
    """
    import librosa
    import numpy as np
    from scipy.stats import kurtosis

    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
    if mfccs.shape[1] < 4:
        return {'available': False, 'reason': 'insufficient_frames'}
    variances = np.var(mfccs, axis=1)
    kurtoses = kurtosis(mfccs, axis=1, fisher=True)
    mean_var = float(np.mean(variances))
    mean_kurt = float(np.mean(kurtoses))
    return {
        'available': True,
        'mean_variance': round(mean_var, 4),
        'mean_kurtosis': round(mean_kurt, 4),
        'per_coeff_variance': [round(float(v), 4) for v in variances],
        'low_variance': mean_var < 15.0,
        'high_kurtosis': mean_kurt > 5.0,
    }


def measure_chroma_entropy(y, sr):
    """
    Chroma entropy. AI tends toward simpler harmonic content — lower entropy.
    """
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
        'low_entropy': normalized < 0.75,
    }


def measure_energy_arc(y, sr, n_segments=8):
    """
    Energy arc / temporal envelope. AI tracks often plateau; human tracks
    have intro/build/drop structure with higher inter-segment variance.
    """
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
        'flat_arc': arc_variance < 0.0001,
    }


def measure_checkerboard_artifacts(y, sr, n_fft=2048):
    """
    Detect checkerboard artifacts from CNN transposed convolution upsampling.
    These leave grid-like periodic patterns in the 4-20kHz spectrogram sub-band.
    Detected via 2D autocorrelation on the sub-band spectrogram.
    """
    import librosa
    import numpy as np

    S = np.abs(librosa.stft(y, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    band_mask = (freqs >= 4000) & (freqs <= 20000)
    S_band = S[band_mask, :]
    if S_band.shape[0] < 4 or S_band.shape[1] < 8:
        return {'available': False, 'reason': 'insufficient_subband_data'}
    S_norm = S_band - np.mean(S_band)
    from numpy.fft import fft2, ifft2
    F = fft2(S_norm)
    ac = np.real(ifft2(F * np.conj(F)))
    ac /= (np.max(ac) + 1e-10)
    center_r = min(8, ac.shape[0] // 2)
    center_c = min(16, ac.shape[1] // 2)
    region = ac[1:center_r, 1:center_c]
    peak_val = float(np.max(region))
    mean_val = float(np.mean(region))
    return {
        'available': True,
        'peak_autocorr': round(peak_val, 4),
        'mean_autocorr': round(mean_val, 4),
        'has_artifacts': peak_val > 0.25,
    }


def measure_subband_energy_distribution(y, sr, n_fft=4096):
    """
    Sub-band energy distribution across frequency bands.
    AI models tend toward specific trainable distributions.
    """
    import librosa
    import numpy as np

    S = np.abs(librosa.stft(y, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    mean_spectrum = np.mean(S, axis=1)
    bands = [
        ('sub_bass', 20, 60),
        ('bass', 60, 250),
        ('low_mid', 250, 500),
        ('mid', 500, 2000),
        ('upper_mid', 2000, 4000),
        ('presence', 4000, 8000),
        ('brilliance', 8000, 16000),
        ('air', 16000, 22000),
    ]
    energies = {}
    total_energy = float(np.sum(mean_spectrum) + 1e-10)
    for name, lo, hi in bands:
        mask = (freqs >= lo) & (freqs < hi)
        band_e = float(np.sum(mean_spectrum[mask])) if mask.any() else 0.0
        energies[name] = round(band_e / total_energy, 6)
    from scipy.stats import entropy
    vals = list(energies.values())
    dist_entropy = entropy(vals, base=2) if sum(vals) > 0 else 0.0
    max_ent = np.log2(len(bands))
    return {
        'available': True,
        'band_ratios': energies,
        'distribution_entropy': round(float(dist_entropy), 4),
        'normalized_entropy': round(float(dist_entropy / max_ent), 4) if max_ent > 0 else 0.0,
        'low_entropy': dist_entropy < (max_ent * 0.6),
    }


def measure_loop_repetition(y, sr):
    """
    Estimate repetitive loop structure using beat-synchronous self-similarity.
    """
    import librosa
    import numpy as np

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    if onset_env.size < 8:
        return {'available': False, 'reason': 'insufficient_onset_data'}
    ac = librosa.autocorrelate(onset_env, max_size=min(512, len(onset_env)))
    if ac.size < 4:
        return {'available': False, 'reason': 'insufficient_autocorr'}
    norm = ac / (np.max(ac) + 1e-10)
    repetition = float(np.mean(norm[2:min(64, norm.size)]))
    return {
        'available': True,
        'repetition_score': round(repetition, 4),
    }


def measure_tempo_regularity(y, sr):
    """
    Estimate tempo stability from beat interval variance.
    """
    import librosa
    import numpy as np

    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    if len(beat_frames) < 6:
        return {'available': False, 'reason': 'too_few_beats'}
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    intervals = np.diff(beat_times)
    mean_i = float(np.mean(intervals))
    std_i = float(np.std(intervals))
    if mean_i <= 1e-10:
        return {'available': False, 'reason': 'invalid_intervals'}
    cv = std_i / mean_i
    stability = max(0.0, 1.0 - min(1.0, cv))
    return {
        'available': True,
        'stability': round(float(stability), 4),
        'cv': round(float(cv), 4),
    }


def analyze_audio(audio_path, max_length_seconds=120, ai_forensics=False):
    """
    Perform full audio analysis.
    
    Args:
        audio_path: Path to audio file
        max_length_seconds: Maximum audio length to analyze (for efficiency)
        ai_forensics: If True, run spectral forensic checks for AI detection
    
    Returns:
        dict with all analysis results
    """
    import librosa
    
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f'Audio file not found: {audio_path}')
    
    # Use 44100 Hz when forensics are requested (needed for 16kHz cutoff detection)
    target_sr = 44100 if ai_forensics else 22050
    y, sr = librosa.load(audio_path, sr=target_sr, mono=True)
    
    # Calculate duration from the full signal before truncation
    duration = len(y) / sr
    
    # Limit length for efficiency
    max_samples = int(max_length_seconds * sr)
    if len(y) > max_samples:
        y = y[:max_samples]
    
    # Core analyses
    bpm_result = detect_bpm(y, sr)
    key_result = detect_key(y, sr)
    energy = calculate_energy(y)
    loudness_db = calculate_loudness(y, sr)
    dynamic_range_db = calculate_dynamic_range(y)
    
    result = {
        'bpm': bpm_result,
        'key': key_result,
        'energy': energy,
        'loudness_db': loudness_db,
        'dynamic_range_db': dynamic_range_db,
        'duration': round(duration, 2),
        'sample_rate': sr,
        'analyzed_length': round(min(duration, max_length_seconds), 2),
    }
    
    # AI spectral forensics (optional, adds ~1-2s)
    if ai_forensics:
        result['ai_forensics'] = {
            'spectral_cutoff': detect_spectral_cutoff(y, sr),
            'phase_entropy': measure_phase_entropy(y, sr),
            'spectral_contrast': measure_spectral_contrast(y, sr),
            'onset_regularity': measure_onset_regularity(y, sr),
            'harmonicity': measure_harmonicity(y, sr),
            'loop_repetition': measure_loop_repetition(y, sr),
            'tempo_regularity': measure_tempo_regularity(y, sr),
            'dynamic_range_db': dynamic_range_db,
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
        }
    
    return result


def main():
    parser = argparse.ArgumentParser(description='Analyze audio for BPM, key, and energy')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--output', choices=['json'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--max-length', type=int, default=120,
                        help='Max audio length to analyze in seconds (default: 120)')
    parser.add_argument('--ai-forensics', action='store_true',
                        help='Run AI spectral forensics (16kHz cutoff, phase entropy, spectral contrast, onset regularity)')
    
    args = parser.parse_args()
    
    # Check dependencies first
    check_dependencies()
    
    try:
        import numpy as np

        class NumpyEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, (np.bool_, np.generic)):
                    return obj.item()
                return super().default(obj)

        result = analyze_audio(args.audio_path, max_length_seconds=args.max_length,
                               ai_forensics=args.ai_forensics)
        print(json.dumps(result, cls=NumpyEncoder))
        
    except FileNotFoundError as e:
        print(json.dumps({
            'error': 'file_not_found',
            'message': str(e)
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': 'processing_error',
            'message': str(e),
            'type': type(e).__name__
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()
