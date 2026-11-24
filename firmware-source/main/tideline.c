#include "controller.h"
#include "bsp_button.h"
#include "bsp_qmi8658a.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static portMUX_TYPE button_lock = portMUX_INITIALIZER_UNLOCKED;
static uint32_t button_count;
static uint8_t last_key;

static void pressed(bsp_btn_t key, bsp_btn_ev_t event, void *ctx) {
    if (event != BSP_BTN_PRESS) return;
    portENTER_CRITICAL(&button_lock);
    last_key = (uint8_t)key;
    button_count++;
    portEXIT_CRITICAL(&button_lock);
}

void app_main(void) {
    controller_ui_init();
    char ssid[24] = "", password[12] = "";
    if (controller_radio_init(ssid, password) != ESP_OK) {
        controller_ui_update(ssid, password, "Wi-Fi failed. Restart.");
        return;
    }
    const bool buttons_ok = bsp_button_init(pressed, NULL) == ESP_OK;
    bool driver_ready = bsp_qmi8658a_init() == ESP_OK;
    bool announced = false, last_imu = false;
    unsigned misses = 0;
    controller_frame_t frame = {0};
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        const uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
        // An absent IMU still allows a new button event to travel over Wi-Fi.
        if (!driver_ready && frame.seq && frame.seq % 250 == 0)
            driver_ready = bsp_qmi8658a_init() == ESP_OK;
        bsp_qmi8658a_sample_t sample = {0};
        const bool valid = driver_ready && bsp_qmi8658a_read(&sample) == ESP_OK;
        if (valid) misses = 0; else if (misses < 20) misses++;
        bool imu = driver_ready && misses < 12;
        if (!announced || imu != last_imu) {
            controller_ui_update(ssid, password, imu ? "QMI8658A  /  MOTION" :
                (buttons_ok ? "NO IMU  /  KEY MODE" : "Input unavailable"));
            last_imu = imu;
            announced = true;
        }
        if (valid || !imu) {
            frame.gx = (int16_t)sample.gyro_dps[1]; frame.gy = (int16_t)sample.gyro_dps[0];
            frame.gz = -(int16_t)sample.gyro_dps[2];
            frame.imu = imu; frame.ms = now;
            portENTER_CRITICAL(&button_lock);
            frame.buttons = button_count; frame.key = last_key;
            portEXIT_CRITICAL(&button_lock);
            controller_publish(&frame);
        }
        frame.seq++;
        TickType_t tick = xTaskGetTickCount();
        if (tick - last > pdMS_TO_TICKS(40)) last = tick;
        vTaskDelayUntil(&last, pdMS_TO_TICKS(20));
    }
}
