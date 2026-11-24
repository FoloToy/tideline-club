#include "controller.h"
#include "paddle.h"
#include "nvs.h"
#include "stroke.h"
#include <stdio.h>
#include <math.h>
#include "bsp_button.h"
#include "bsp_qmi8658a.h"
#include "esp_timer.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "capture_mode.h"
#include "capture_log.h"
#include "freertos/queue.h"

typedef struct { bsp_btn_t key; bsp_btn_ev_t event; } input_t;
static QueueHandle_t inputs;

static void pressed(bsp_btn_t key, bsp_btn_ev_t event, void *ctx) {
    if (event != BSP_BTN_PRESS && event != BSP_BTN_CLICK && event != BSP_BTN_LONG) return;
    input_t input = {key, event};
    xQueueSend(inputs, &input, 0);
}

void app_main(void) {
    controller_ui_init();
    capture_log_init();
    ESP_LOGI("tideline", "capture store: %u committed groups, room=%d", capture_saved(), capture_has_room());
    char name[24] = "Bluetooth offline";
    const bool radio_ok = paddle_init(name) == ESP_OK;
    stroke_detector_t detector = {0};
    bool armed = false;
    nvs_handle_t preferences;
    bool has_prefs = radio_ok && nvs_open("tideline",NVS_READWRITE,&preferences) == ESP_OK;
    uint8_t saved_player = 0;
    if (has_prefs) nvs_get_u8(preferences,"player",&saved_player);
    int player = saved_player == 1, previous_state = -1;
    unsigned epoch = paddle_epoch();
    inputs = xQueueCreate(24, sizeof(input_t));
    if (!inputs || bsp_button_init(pressed, NULL) != ESP_OK) ESP_LOGE("tideline","Button setup failed");
    bool driver_ready = bsp_qmi8658a_init() == ESP_OK;

    unsigned misses = 0;
    uint32_t seq = 0;
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        const uint32_t now = (uint32_t)(esp_timer_get_time() / 1000);
        // Physical buttons remain available without a motion sensor.
        if (!driver_ready && seq && seq % 250 == 0)
            driver_ready = bsp_qmi8658a_init() == ESP_OK;
        bsp_qmi8658a_sample_t sample = {0};
        const bool valid = driver_ready && bsp_qmi8658a_read(&sample) == ESP_OK;
        if (valid) misses = 0; else if (misses < 20) misses++;
        bool imu = driver_ready && misses < 12;
        paddle_release_tick(now);
        bool linked = paddle_connected();
        unsigned current_epoch = paddle_epoch();
        if (epoch != current_epoch || !linked) { armed = false; epoch = current_epoch; }
        uint8_t pressed_mask = 0;
        input_t input;
        while (inputs && xQueueReceive(inputs, &input, 0) == pdTRUE) {
            if (input.event == BSP_BTN_PRESS) {
                pressed_mask |= (uint8_t)(1u << input.key);
            }
            bool capturing = capture_active();
            capture_mode_key(input.key, input.event, now, imu);
            if (capturing || capture_active()) { armed = false; continue; }
            if (armed && input.key == BSP_BTN_DOWN && input.event == BSP_BTN_LONG) {
                armed = false;
            } else if (input.event == BSP_BTN_CLICK) {
                if (!armed && input.key != BSP_BTN_OK) {
                    player = input.key == BSP_BTN_DOWN;
                } else if (!armed && linked && input.key == BSP_BTN_OK) {
                    // Number 7 or 8 announces a player without swinging.
                    armed = paddle_press(0x24 + player, now);
                    if (armed && has_prefs && saved_player != player &&
                        nvs_set_u8(preferences,"player",player) == ESP_OK && nvs_commit(preferences) == ESP_OK)
                        saved_player = player;
                } else if (armed) {
                    // Numbers 1..3 and 4..6 encode physical left/right/centre.
                    paddle_press(0x1e + player * 3 + input.key, now);
                }
            }
        }
        capture_mode_sample(now, (uint16_t)seq, valid, &sample, pressed_mask);
        if (valid) {
            const float *a = sample.accel_g;
            int load = lroundf(1000*sqrtf(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]));
            stroke_t shot;
            if (stroke_sample(&detector,now,(int)sample.gyro_dps[1],(int)sample.gyro_dps[0],
                              -(int)sample.gyro_dps[2],load,lroundf(1000*a[2]),&shot) && armed)
                paddle_press(stroke_usage(player,shot), now);
        } else if (!imu) detector = (stroke_detector_t){0};
        int state = player | armed<<1 | linked<<2 | imu<<3 | detector.calibrated<<4;
        if (state != previous_state) {
            char status[40];
            snprintf(status, sizeof(status), "P%d  %s", player+1,
                     !radio_ok ? "BLE ERROR" : !linked ? "Pair in Bluetooth" : armed ? "Hold DN to stop" : "OK to play");
            controller_ui_update(name, status, !imu ? "NO IMU / USE BUTTONS" :
                                 detector.calibrated ? "MOTION READY" : "REST PADDLE 1 SEC");
            ESP_LOGI("tideline", "%s  %s imu=%d calibrated=%d", name, status, imu, detector.calibrated);
            previous_state = state;
        }
        seq++;
        TickType_t tick = xTaskGetTickCount();
        if (tick - last > pdMS_TO_TICKS(40)) last = tick;
        vTaskDelayUntil(&last, pdMS_TO_TICKS(20));
    }
}
