#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

esp_err_t paddle_init(char name[24]);
bool paddle_connected(void);
unsigned paddle_epoch(void);
void paddle_release_tick(uint32_t now);
bool paddle_press(uint8_t usage, uint32_t now);
