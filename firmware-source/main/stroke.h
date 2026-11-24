#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef struct {
    bool started, calibrated, has_rest, has_hit, has_load, spent, pending;
    uint32_t previous, calibration_ms, samples, load_ms, quiet_ms, last_load, last_hit;
    int sign, stroke_sign;
    float bias[3], rest_z, speed, peak_y, peak_z;
} stroke_detector_t;
typedef struct { float power, aim; } stroke_t;
bool stroke_sample(stroke_detector_t *d, uint32_t ms, int x, int y, int z, int load, int az, stroke_t *out);
uint8_t stroke_usage(int player, stroke_t shot);
