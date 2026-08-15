/**
 * ORBIT Native SIMD Audio DSP & Forensics Kernel
 * Portable, Hardware-Accelerated C-ABI Header (ARM NEON & x86 AVX2/AVX-512)
 * 
 * Open-Source (Apache 2.0). Zero external dependencies.
 */

#ifndef ORBIT_DSP_H
#define ORBIT_DSP_H

#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Calculate Root-Mean-Square (RMS) audio energy with SIMD auto-vectorization.
 * 
 * @param samples Array of 32-bit floating point audio PCM samples (mono).
 * @param n Number of audio samples.
 * @return RMS energy float value.
 */
float orbit_simd_rms(const float* samples, size_t n);

/**
 * In-place peak sample normalization.
 * 
 * @param samples Array of 32-bit floating point audio PCM samples (mono).
 * @param n Number of audio samples.
 * @param target_peak Target peak amplitude (e.g. 0.95f or 1.0f).
 * @return Maximum absolute peak found prior to scaling.
 */
float orbit_simd_peak_normalize(float* samples, size_t n, float target_peak);

/**
 * Forensic phase cross-correlation between two audio sample buffers.
 * 
 * @param a First audio sample buffer.
 * @param b Second audio sample buffer.
 * @param n Number of samples to correlate.
 * @return Normalized Pearson correlation coefficient [-1.0, 1.0].
 */
float orbit_simd_cross_correlate(const float* a, const float* b, size_t n);

/**
 * In-place Hann window multiplication for FFT preprocessing.
 * 
 * @param samples Array of 32-bit floating point audio samples.
 * @param n Number of samples (window size).
 */
void orbit_simd_hann_window(float* samples, size_t n);

#ifdef __cplusplus
}
#endif

#endif // ORBIT_DSP_H
