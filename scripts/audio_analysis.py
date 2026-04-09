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


def _detect_key_from_chroma(chroma_avg):
    """Detect key from a normalized 12-bin chroma distribution."""
    import numpy as np

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


def detect_key(y, sr, harmonic_only=False):
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
    
    if harmonic_only:
        y, _ = librosa.effects.hpss(y)

    # Compute chroma features using CQT (better for key detection)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    
    # Average across time to get overall pitch class distribution
    chroma_avg = np.mean(chroma, axis=1)
    return _detect_key_from_chroma(chroma_avg)


def detect_key_from_stems(other_stem_path, bass_stem_path=None, max_length_seconds=120):
    """
    Detect key from Demucs stems (preferred) with harmonic emphasis.

    Uses the "other" stem as primary harmonic content source and optionally
    blends in a lower-weighted bass stem. Falls back to HPSS harmonic
    extraction on the available content before key estimation.
    """
    import librosa
    import numpy as np

    if not other_stem_path or not os.path.exists(other_stem_path):
        raise FileNotFoundError(f'Other stem not found: {other_stem_path}')

    target_sr = 22050
    other_y, sr = librosa.load(other_stem_path, sr=target_sr, mono=True)
    max_samples = int(max_length_seconds * sr)
    if len(other_y) > max_samples:
        other_y = other_y[:max_samples]

    # Harmonic isolate from the "other" stem, which should already be largely non-percussive.
    other_harm, _ = librosa.effects.hpss(other_y)
    mix = other_harm.astype(np.float32, copy=False)

    if bass_stem_path and os.path.exists(bass_stem_path):
        bass_y, bass_sr = librosa.load(bass_stem_path, sr=target_sr, mono=True)
        if bass_sr != sr:
            bass_y = librosa.resample(bass_y, orig_sr=bass_sr, target_sr=sr)
        if len(bass_y) > max_samples:
            bass_y = bass_y[:max_samples]
        bass_harm, _ = librosa.effects.hpss(bass_y)

        target_len = min(len(mix), len(bass_harm))
        if target_len > 0:
            mix = mix[:target_len] + (0.35 * bass_harm[:target_len])

    return detect_key(mix, sr, harmonic_only=False)


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
    Detect vocoder upsampling artifacts via cepstral analysis.

    Neural vocoders (HiFi-GAN, etc.) use transposed-convolution upsampling
    that imprints periodic artifacts at quefrencies corresponding to powers-
    of-2 upsampling ratios.  The previous 2D-autocorrelation approach was
    detecting the STFT's own grid structure (always present).

    The real cepstrum (IFFT of log-magnitude spectrum) exposes these rigid
    peaks in the high-quefrency region without the STFT grid confound.
    """
    import librosa
    import numpy as np

    S = np.abs(librosa.stft(y, n_fft=n_fft)) + 1e-10
    log_S = np.log(S)
    mean_log = np.mean(log_S, axis=1)

    cepstrum = np.real(np.fft.ifft(mean_log))
    n = len(cepstrum)
    if n < 64:
        return {'available': False, 'reason': 'insufficient_cepstrum_length'}

    # High-quefrency region: skip low quefrencies (< 16) which carry
    # spectral envelope info; look at 16..n//2 for upsampling artifacts.
    high_q = cepstrum[16:n // 2]
    if len(high_q) < 16:
        return {'available': False, 'reason': 'insufficient_high_quefrency'}

    # Vocoder artifacts appear as sharp, isolated peaks.  Measure peak-
    # to-median ratio — a rigid spike stands out against the noise floor.
    median_val = float(np.median(np.abs(high_q)))
    peak_val = float(np.max(np.abs(high_q)))
    peak_ratio = peak_val / (median_val + 1e-12)

    # Check for peaks at power-of-2 quefrencies (typical upsampling ratios)
    pow2_quefrencies = [q for q in [32, 64, 128, 256, 512] if q < len(high_q)]
    pow2_vals = [float(np.abs(high_q[q - 16])) for q in pow2_quefrencies]
    pow2_peak = max(pow2_vals) if pow2_vals else 0.0
    pow2_ratio = pow2_peak / (median_val + 1e-12)

    return {
        'available': True,
        'cepstral_peak_ratio': round(peak_ratio, 4),
        'pow2_peak_ratio': round(pow2_ratio, 4),
        'median_level': round(median_val, 6),
        'has_artifacts': peak_ratio > 8.0 or pow2_ratio > 6.0,
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


def measure_pre_echo(y, sr):
    """
    Detect micro-temporal pre-echo from neural vocoder reconstruction.

    Real transients have near-zero energy in the 2-5 ms window immediately
    before the attack.  Neural vocoders (HiFi-GAN, EnCodec) produce micro-
    ringing in this window due to denoising/decoding steps.

    Key improvements over v1:
    - 3 ms pre-onset window (was 10 ms — too wide, captured compressor attack)
    - High-pass filter > 4 kHz before measurement (low-freq rumble masks it)
    - Measures energy envelope slope, not just RMS ratio (vocoder pre-echo
      has an unnatural linear/exponential ramp vs natural reflections)
    """
    import librosa
    import numpy as np
    from scipy.signal import butter, sosfilt

    # 4 kHz high-pass filter to isolate micro-transient region
    sos = butter(4, 4000, btype='high', fs=sr, output='sos')
    y_hf = sosfilt(sos, y)

    onset_frames = librosa.onset.onset_detect(y=y_hf, sr=sr, units='samples')
    if len(onset_frames) < 3:
        return {'available': False, 'reason': 'too_few_onsets'}

    pre_ms = 0.003    # 3 ms before onset
    post_ms = 0.005   # 5 ms after onset
    pre_window = int(pre_ms * sr)
    post_window = int(post_ms * sr)

    ratios = []
    slopes = []
    for onset in onset_frames:
        pre_start = max(0, onset - pre_window)
        post_end = min(len(y_hf), onset + post_window)
        if onset - pre_start < pre_window // 2 or post_end - onset < post_window // 2:
            continue
        pre_seg = y_hf[pre_start:onset]
        post_seg = y_hf[onset:post_end]
        pre_energy = float(np.mean(pre_seg ** 2))
        post_energy = float(np.mean(post_seg ** 2))
        if post_energy > 1e-12:
            ratios.append(pre_energy / post_energy)

        # Measure energy envelope slope in pre-onset window
        if len(pre_seg) >= 4:
            env = pre_seg ** 2
            # Linear fit: positive slope = energy ramping up toward onset
            x = np.arange(len(env), dtype=np.float64)
            slope = float(np.polyfit(x, env, 1)[0])
            slopes.append(slope)

    if len(ratios) < 3:
        return {'available': False, 'reason': 'insufficient_valid_onsets'}

    mean_ratio = float(np.mean(ratios))
    median_ratio = float(np.median(ratios))
    mean_slope = float(np.mean(slopes)) if slopes else 0.0
    positive_slope_ratio = sum(1 for s in slopes if s > 0) / len(slopes) if slopes else 0.0

    return {
        'available': True,
        'mean_pre_echo_ratio': round(mean_ratio, 6),
        'median_pre_echo_ratio': round(median_ratio, 6),
        'mean_slope': round(mean_slope, 8),
        'positive_slope_ratio': round(positive_slope_ratio, 4),
        'onset_count': len(ratios),
        'has_pre_echo': mean_ratio > 0.30 and positive_slope_ratio > 0.6,
    }


def measure_hf_phase_incoherence(y, sr, n_fft=4096):
    """
    Measure group delay variance at transient onsets above 4 kHz.

    Group delay = -d(phase)/d(frequency).  Real percussive transients have
    aligned group delay across frequency bins (all frequencies arrive at the
    microphone simultaneously).  AI vocoders smear this vertical alignment.

    Key improvement over v1: measures group delay (phase vs frequency)
    instead of instantaneous frequency (phase vs time).  The old metric
    was chaotic above 8 kHz in all real-world audio.
    """
    import librosa
    import numpy as np

    nyquist = sr / 2
    if nyquist < 8000:
        return {'available': False, 'reason': f'sample_rate {sr} too low for HF analysis'}

    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units='frames',
                                               hop_length=n_fft // 4)
    if len(onset_frames) < 3:
        return {'available': False, 'reason': 'too_few_onsets'}

    hop_length = n_fft // 4
    D = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    hf_mask = freqs >= 4000
    phase = np.angle(D)

    # Group delay: negative derivative of phase with respect to frequency
    # Compute per-frame across frequency bins in the HF region
    gd_variances = []
    for frame_idx in onset_frames:
        if frame_idx >= phase.shape[1]:
            continue
        frame_phase = phase[hf_mask, frame_idx]
        if len(frame_phase) < 8:
            continue
        unwrapped = np.unwrap(frame_phase)
        group_delay = -np.diff(unwrapped)
        gd_variances.append(float(np.var(group_delay)))

    if len(gd_variances) < 3:
        return {'available': False, 'reason': 'insufficient_onset_frames'}

    mean_gd_var = float(np.mean(gd_variances))
    median_gd_var = float(np.median(gd_variances))

    return {
        'available': True,
        'mean_group_delay_variance': round(mean_gd_var, 6),
        'median_group_delay_variance': round(median_gd_var, 6),
        'onset_count': len(gd_variances),
        'hf_incoherent': mean_gd_var > 5.0,
    }


def measure_ms_phase_coherence(y_stereo, sr, n_fft=2048):
    """
    Per-band Mid/Side coherence with focus on low-mid phase decorrelation.

    Mix engineers widen highs/mids but keep low-end centered (below ~400 Hz)
    to avoid phase cancellation on playback systems.  AI generators
    hallucinate phase relationships across the entire spectrum, often
    producing decorrelated or anti-correlated Side energy in the low-mids.

    Key improvement over v1: per-Mel-band analysis instead of global M/S
    coherence.  Specifically flags low-mid (100-400 Hz) anomalies.
    """
    import librosa
    import numpy as np

    if y_stereo is None or y_stereo.ndim != 2 or y_stereo.shape[0] < 2:
        return {'available': False, 'reason': 'mono_or_invalid'}

    left = y_stereo[0]
    right = y_stereo[1]
    mid = (left + right) / 2.0
    side = (left - right) / 2.0

    side_energy = float(np.mean(side ** 2))
    if side_energy < 1e-10:
        return {'available': False, 'reason': 'effectively_mono'}

    D_mid = librosa.stft(mid, n_fft=n_fft)
    D_side = librosa.stft(side, n_fft=n_fft)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    if D_mid.shape[1] < 4:
        return {'available': False, 'reason': 'insufficient_frames'}

    # Per-band analysis
    bands = [
        ('sub_bass', 20, 100),
        ('low_mid', 100, 400),
        ('mid', 400, 2000),
        ('high_mid', 2000, 8000),
        ('high', 8000, sr // 2),
    ]

    band_results = {}
    for name, lo, hi in bands:
        mask = (freqs >= lo) & (freqs < hi)
        if not np.any(mask):
            continue
        mid_band = D_mid[mask, :]
        side_band = D_side[mask, :]
        mid_energy = float(np.mean(np.abs(mid_band) ** 2))
        side_energy_band = float(np.mean(np.abs(side_band) ** 2))
        # Side-to-mid ratio: > 1.0 means more Side than Mid (suspicious in low end)
        sm_ratio = side_energy_band / (mid_energy + 1e-12)
        band_results[name] = round(sm_ratio, 4)

    low_mid_ratio = band_results.get('low_mid', 0.0)
    sub_bass_ratio = band_results.get('sub_bass', 0.0)

    # Real engineers: low_mid Side/Mid ratio should be well below 0.5
    # AI generators: often > 0.5 due to hallucinated stereo in low end
    ms_anomalous = low_mid_ratio > 0.5 or sub_bass_ratio > 0.3

    return {
        'available': True,
        'band_sm_ratios': band_results,
        'low_mid_sm_ratio': low_mid_ratio,
        'sub_bass_sm_ratio': sub_bass_ratio,
        'ms_anomalous': ms_anomalous,
    }


def measure_pitch_jitter(y, sr):
    """
    Detect synthetic vibrato via modulation spectrum of the f0 contour.

    Human vocal jitter has a distinct 1/f (pink noise) slope in the
    modulation spectrum.  AI-generated jitter looks like flat white noise
    or has rigid LFO spikes from smooth latent-space interpolation.

    Key improvement over v1: analyses the FFT of the f0 contour itself
    (modulation spectrum) instead of f0 acceleration variance, which
    was falsely triggered by controlled human vibrato.
    """
    import librosa
    import numpy as np

    f0, voiced_flag, _ = librosa.pyin(
        y, fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'), sr=sr
    )

    if f0 is None or len(f0) < 10:
        return {'available': False, 'reason': 'insufficient_f0'}

    voiced_mask = voiced_flag & ~np.isnan(f0)
    voiced_indices = np.where(voiced_mask)[0]
    if len(voiced_indices) < 10:
        return {'available': False, 'reason': 'insufficient_voiced_frames'}

    # Find sustained voiced segments (>= 30 frames)
    segments = []
    seg_start = voiced_indices[0]
    for i in range(1, len(voiced_indices)):
        if voiced_indices[i] != voiced_indices[i - 1] + 1:
            seg_len = voiced_indices[i - 1] - seg_start + 1
            if seg_len >= 30:
                segments.append((seg_start, voiced_indices[i - 1] + 1))
            seg_start = voiced_indices[i]
    seg_len = voiced_indices[-1] - seg_start + 1
    if seg_len >= 30:
        segments.append((seg_start, voiced_indices[-1] + 1))

    if len(segments) == 0:
        return {'available': False, 'reason': 'no_sustained_segments'}

    spectral_slopes = []
    for start, end in segments:
        seg_f0 = f0[start:end]
        if np.any(np.isnan(seg_f0)):
            continue
        # Remove DC (mean pitch) to isolate modulation
        seg_f0_centered = seg_f0 - np.mean(seg_f0)
        # FFT of f0 contour = modulation spectrum
        mod_spectrum = np.abs(np.fft.rfft(seg_f0_centered))
        if len(mod_spectrum) < 4:
            continue
        # Fit log-log slope (skip DC bin)
        mod_spectrum = mod_spectrum[1:]
        log_freq = np.log(np.arange(1, len(mod_spectrum) + 1) + 1e-10)
        log_mag = np.log(mod_spectrum + 1e-10)
        if len(log_freq) >= 4:
            slope = float(np.polyfit(log_freq, log_mag, 1)[0])
            spectral_slopes.append(slope)

    if len(spectral_slopes) == 0:
        return {'available': False, 'reason': 'no_valid_segments'}

    mean_slope = float(np.mean(spectral_slopes))

    # Human vibrato: negative slope (1/f, pink noise, typically -0.5 to -2.0)
    # AI vibrato: slope near 0 (flat/white) or has LFO spikes
    return {
        'available': True,
        'mean_modulation_slope': round(mean_slope, 4),
        'segment_count': len(spectral_slopes),
        'perfect_vibrato': mean_slope > -0.3,
    }


def measure_noise_floor_structure(y, sr, n_fft=4096):
    """
    Detect structured pseudo-random noise in the HPSS residual.

    AI platform watermarks (Suno, Udio, etc.) embed spread-spectrum
    pseudo-random sequences.  To detect them we must isolate the noise
    floor from musical content.

    Key improvement over v1: uses Harmonic-Percussive Source Separation
    (HPSS) instead of a simple comb filter.  The old comb filter leaked
    harmonics into the residual, causing false autocorrelation in all
    audio.  HPSS + median filtering of the residual spectrogram produces
    a much cleaner noise floor for autocorrelation analysis.

    Note: blind spread-spectrum detection is inherently difficult without
    the carrier sequence.  This is a best-effort statistical test.
    """
    import librosa
    import numpy as np
    from scipy.ndimage import median_filter

    # HPSS: separate harmonic and percussive components
    y_harmonic, y_percussive = librosa.effects.hpss(y)

    # Residual = original minus both harmonic and percussive
    residual = y - y_harmonic - y_percussive

    if float(np.max(np.abs(residual))) < 1e-8:
        return {'available': False, 'reason': 'silent_residual'}

    # Compute residual spectrogram and median-filter it to remove
    # any remaining tonal/transient leakage
    S_res = np.abs(librosa.stft(residual, n_fft=n_fft))
    S_filtered = median_filter(S_res, size=(1, 5))

    # Frame-level power from the filtered residual
    frame_power = np.mean(S_filtered ** 2, axis=0)
    if len(frame_power) < 16:
        return {'available': False, 'reason': 'insufficient_residual_frames'}
    if np.max(frame_power) < 1e-14:
        return {'available': False, 'reason': 'silent_residual'}

    # Autocorrelation of frame power envelope
    fp_centered = frame_power - np.mean(frame_power)
    ac = np.correlate(fp_centered, fp_centered, mode='full')
    ac = ac[len(ac) // 2:]
    ac_norm = ac / (ac[0] + 1e-15)

    peak_region = ac_norm[2:min(len(ac_norm), 128)]
    if len(peak_region) < 4:
        return {'available': False, 'reason': 'insufficient_autocorr'}

    peak_val = float(np.max(peak_region))
    mean_val = float(np.mean(np.abs(peak_region)))

    return {
        'available': True,
        'residual_autocorr_peak': round(peak_val, 4),
        'residual_autocorr_mean': round(mean_val, 4),
        'has_structured_noise': peak_val > 0.55,
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


def analyze_audio(audio_path, max_length_seconds=120, ai_forensics=False, stems_dir=None):
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
    
    # Load stereo version for M/S coherence analysis (forensics only)
    y_stereo = None
    if ai_forensics:
        try:
            y_stereo_raw, _ = librosa.load(audio_path, sr=target_sr, mono=False)
            if y_stereo_raw.ndim == 2 and y_stereo_raw.shape[0] >= 2:
                y_stereo = y_stereo_raw
        except Exception:
            pass  # Fall back to mono-only analysis
    
    # Calculate duration from the full signal before truncation
    duration = len(y) / sr
    
    # Limit length for efficiency
    max_samples = int(max_length_seconds * sr)
    if len(y) > max_samples:
        y = y[:max_samples]
    if y_stereo is not None and y_stereo.shape[1] > max_samples:
        y_stereo = y_stereo[:, :max_samples]
    
    # Core analyses
    bpm_result = detect_bpm(y, sr)
    key_result = None
    key_detection_source = 'mix_hpss'
    if stems_dir:
        other_stem = os.path.join(stems_dir, 'other.wav')
        bass_stem = os.path.join(stems_dir, 'bass.wav')
        if os.path.exists(other_stem):
            key_result = detect_key_from_stems(
                other_stem,
                bass_stem_path=bass_stem if os.path.exists(bass_stem) else None,
                max_length_seconds=max_length_seconds
            )
            key_detection_source = 'demucs_stems'

    # HPSS fallback for full-mix key detection when stems are unavailable.
    if key_result is None:
        key_result = detect_key(y, sr, harmonic_only=True)

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
        'key_detection_source': key_detection_source,
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
            'pre_echo': measure_pre_echo(y, sr),
            'hf_phase_incoherence': measure_hf_phase_incoherence(y, sr),
            'ms_phase_coherence': measure_ms_phase_coherence(y_stereo, sr),
            'pitch_jitter': measure_pitch_jitter(y, sr),
            'noise_floor_structure': measure_noise_floor_structure(y, sr),
        }

        if stems_dir and os.path.isdir(stems_dir):
            import numpy as np
            import librosa

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
                result['ai_forensics']['stem_forensics'] = stem_forensics
    
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
    parser.add_argument('--stems-dir',
                        help='Directory containing Demucs stems (other.wav, optional bass.wav) for improved key detection')
    
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

        result = analyze_audio(
            args.audio_path,
            max_length_seconds=args.max_length,
            ai_forensics=args.ai_forensics,
            stems_dir=args.stems_dir
        )
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
