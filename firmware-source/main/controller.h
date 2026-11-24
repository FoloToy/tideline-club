#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

typedef struct {
    uint32_t seq, ms, buttons;
    int16_t gx, gy, gz;
    uint16_t acceleration_mg;
    int16_t accel_z_mg;
    bool imu;
    uint8_t key;
} controller_frame_t;

void controller_ui_init(void);
void controller_ui_update(const char *ssid, const char *password, const char *state);
esp_err_t controller_radio_init(char ssid[24], char password[12]);
void controller_publish(const controller_frame_t *frame);

void controller_ui_capture(const char *heading, const char *detail, const char *action);
