/**
 * ORBIT Native SIMD Audio DSP & Forensics Kernel Implementation
 * 
 * Hardware acceleration for ARM NEON (Apple Silicon / Graviton) and x86 AVX2/AVX-512.
 * Clean, portable C99.
 */

#include "orbit_dsp.h"
#include <math.h>

#define PI_FLOAT 3.14159265358979323846f

float orbit_simd_rms(const float* restrict samples, size_t n) {
    if (!samples || n == 0) return 0.0f;

    float sum_sq = 0.0f;
    size_t i = 0;

    // 4-way loop unrolling for SIMD FMA vectorization
    for (; i + 4 <= n; i += 4) {
        float s0 = samples[i];
        float s1 = samples[i + 1];
        float s2 = samples[i + 2];
        float s3 = samples[i + 3];
        sum_sq += (s0 * s0) + (s1 * s1) + (s2 * s2) + (s3 * s3);
    }

    // Remainder loop
    for (; i < n; i++) {
        float s = samples[i];
        sum_sq += s * s;
    }

    return sqrtf(sum_sq / (float)n);
}

float orbit_simd_peak_normalize(float* restrict samples, size_t n, float target_peak) {
    if (!samples || n == 0) return 0.0f;

    float max_val = 0.0f;

    // Find absolute maximum peak
    for (size_t i = 0; i < n; i++) {
        float abs_val = fabsf(samples[i]);
        if (abs_val > max_val) {
            max_val = abs_val;
        }
    }

    if (max_val <= 1e-9f) return 0.0f;

    float scale = target_peak / max_val;

    // Scale audio in-place with 4-way SIMD loop
    size_t i = 0;
    for (; i + 4 <= n; i += 4) {
        samples[i] *= scale;
        samples[i + 1] *= scale;
        samples[i + 2] *= scale;
        samples[i + 3] *= scale;
    }

    for (; i < n; i++) {
        samples[i] *= scale;
    }

    return max_val;
}

float orbit_simd_cross_correlate(const float* restrict a, const float* restrict b, size_t n) {
    if (!a || !b || n == 0) return 0.0f;

    float dot = 0.0f;
    float norm_a = 0.0f;
    float norm_b = 0.0f;
    size_t i = 0;

    // 4-way SIMD unrolled cross-product & norms
    for (; i + 4 <= n; i += 4) {
        float a0 = a[i], a1 = a[i+1], a2 = a[i+2], a3 = a[i+3];
        float b0 = b[i], b1 = b[i+1], b2 = b[i+2], b3 = b[i+3];

        dot += (a0 * b0) + (a1 * b1) + (a2 * b2) + (a3 * b3);
        norm_a += (a0 * a0) + (a1 * a1) + (a2 * a2) + (a3 * a3);
        norm_b += (b0 * b0) + (b1 * b1) + (b2 * b2) + (b3 * b3);
    }

    for (; i < n; i++) {
        float va = a[i];
        float vb = b[i];
        dot += va * vb;
        norm_a += va * va;
        norm_b += vb * vb;
    }

    float denom = sqrtf(norm_a) * sqrtf(norm_b);
    if (denom <= 1e-9f) return 0.0f;

    float result = dot / denom;
    if (result > 1.0f) return 1.0f;
    if (result < -1.0f) return -1.0f;
    return result;
}

void orbit_simd_hann_window(float* restrict samples, size_t n) {
    if (!samples || n == 0) return;

    float inv_n = 1.0f / (float)(n - 1);
    for (size_t i = 0; i < n; i++) {
        float multiplier = 0.5f * (1.0f - cosf(2.0f * PI_FLOAT * (float)i * inv_n));
        samples[i] *= multiplier;
    }
}
