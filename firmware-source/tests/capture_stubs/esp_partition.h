#pragma once
#include "esp_err.h"
#include <stddef.h>
#define ESP_PARTITION_TYPE_DATA 1
typedef struct { size_t size; } esp_partition_t;
const esp_partition_t *esp_partition_find_first(int type, int subtype, const char *name);
esp_err_t esp_partition_read(const esp_partition_t *p, size_t pos, void *out, size_t count);
esp_err_t esp_partition_write(const esp_partition_t *p, size_t pos, const void *src, size_t count);
