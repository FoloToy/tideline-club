#pragma once
#include <stdio.h>
#include <stdbool.h>
#include <inttypes.h>
/* Match motion-block's screen axes: sensor Y, X, negative Z, in dps. */
static inline int format_frame(char *dst, size_t size, uint32_t seq, uint32_t ms,
                               int imu, int sensor_y, int sensor_x, int minus_z,
                               uint32_t buttons, unsigned key, bool six_axis, unsigned acceleration_mg, int accel_z_mg) {
    if (six_axis) {
        return snprintf(dst, size, "[2,%" PRIu32 ",%" PRIu32 ",%d,%d,%d,%d,%" PRIu32 ",%u,%u,%d]",
                        seq, ms, imu, sensor_y, sensor_x, minus_z, buttons, key, acceleration_mg, accel_z_mg);
    }
    return snprintf(dst, size, "[1,%" PRIu32 ",%" PRIu32 ",%d,%d,%d,%d,%" PRIu32 ",%u]",
                    seq, ms, imu, sensor_y, sensor_x, minus_z, buttons, key);
}
