#pragma once
#include <stdbool.h>
#include <stdint.h>

#define CAP_SLOT_BYTES 32768u
#define CAP_PERIOD_MS 20u
#define CAP_LIMIT_MS 30000u
#define CAP_MAX_FRAMES (CAP_LIMIT_MS / CAP_PERIOD_MS + 4)
enum { CAP_FOREHAND = 1, CAP_BACKHAND = 2 };

typedef struct {
    uint32_t elapsed_ms;
    int16_t accel[3], gyro[3]; /* sensor axes, 8192 LSB/g and 64 LSB/(deg/s) */
    uint16_t flags;           /* bit 0 fresh sample; bits 1..3 physical button presses */
    uint16_t sequence;
} capture_frame_t;

typedef struct {
    char magic[4];
    uint16_t version, header_bytes;
    uint32_t group, boot_id;
    uint16_t hand, expected_swings, period_ms, frame_bytes;
    uint32_t frames, duration_ms, payload_crc, header_crc;
} capture_header_t;

_Static_assert(sizeof(capture_frame_t) == 20, "capture frame wire size");
_Static_assert(sizeof(capture_header_t) == 40, "capture header wire size");
_Static_assert(sizeof(capture_header_t) + CAP_MAX_FRAMES * sizeof(capture_frame_t) <= CAP_SLOT_BYTES, "slot capacity");

void capture_log_init(void);
unsigned capture_saved(void);
bool capture_has_room(void);
bool capture_save(unsigned hand, const capture_frame_t *frames, unsigned count, unsigned duration);
