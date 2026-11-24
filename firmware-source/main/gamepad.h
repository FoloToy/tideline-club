#pragma once
#include "esp_gatts_api.h"
#include "pad_protocol.h"
#define PAD_GATT_APP 0x0543
extern const uint8_t gamepad_service_uuid[16];
bool gamepad_gatts(esp_gatts_cb_event_t ev, esp_gatt_if_t iface, esp_ble_gatts_cb_param_t *p);
bool gamepad_service_ready(void);
unsigned gamepad_tick(uint32_t now, bool imu, bool calibrated, bool capturing);
bool gamepad_screen(pad_screen_t *out, bool force);
void gamepad_shot(float speed, float aim);
void gamepad_button(unsigned key);
