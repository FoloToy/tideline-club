#pragma once
#include "bsp_button.h"
#include "bsp_qmi8658a.h"
#include <stdbool.h>
#include <stdint.h>

bool capture_active(void);
void capture_mode_key(bsp_btn_t key, bsp_btn_ev_t event, uint32_t now, bool sensor_ok);
void capture_mode_sample(uint32_t now, uint16_t seq, bool valid, const bsp_qmi8658a_sample_t *sample, uint8_t pressed_mask);
