#include "controller.h"
#include "paddle.h"
#include "gamepad.h"
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
    int previous_state = -1;
    inputs = xQueueCreate(24, sizeof(input_t));
    if (!inputs || bsp_button_init(pressed, NULL) != ESP_OK) ESP_LOGE("tideline","Button setup failed");
    bool driver_ready = bsp_qmi8658a_init() == ESP_OK;

    unsigned last_web_slot=0;
    bool was_capturing=false;
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
        unsigned web_slot=gamepad_tick(now,imu,detector.calibrated,capture_active());
        uint8_t pressed_mask = 0;
        input_t input;
        while (inputs && xQueueReceive(inputs, &input, 0) == pdTRUE) {
            if (input.event == BSP_BTN_PRESS) {
                pressed_mask |= (uint8_t)(1u << input.key);
            }
            bool capturing = capture_active();
            capture_mode_key(input.key, input.event, now, imu);
            if (!capturing && !capture_active() && web_slot && input.event == BSP_BTN_CLICK)
                gamepad_button(input.key);
        }
        capture_mode_sample(now, (uint16_t)seq, valid, &sample, pressed_mask);
        if (valid) {
            const float *a = sample.accel_g;
            int load = lroundf(1000*sqrtf(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]));
            stroke_t shot;
            if (stroke_sample(&detector,now,(int)sample.gyro_dps[1],(int)sample.gyro_dps[0],
                              -(int)sample.gyro_dps[2],load,lroundf(1000*a[2]),&shot) && !capture_active()) {
                if (web_slot) gamepad_shot(detector.speed,shot.aim);
            }
        } else if (!imu) detector = (stroke_detector_t){0};
        int state = imu;
        bool capturing=capture_active();
        if (!capturing && web_slot) {
            pad_screen_t view;
            if (gamepad_screen(&view,was_capturing || web_slot!=last_web_slot)) {
                controller_ui_remote(view.line[0],view.line[1],view.line[2]);
            } else if (web_slot!=last_web_slot || was_capturing) {
                controller_ui_remote("已连接",name,"等待网页");
            }
        } else if (!capturing && (state!=previous_state || web_slot!=last_web_slot || was_capturing)) {
            controller_ui_home();
            controller_ui_update(name,radio_ok ? "在游戏网页选此名称" : "蓝牙启动失败", !imu ? "按键可用" : "开启电脑蓝牙");
        }
        last_web_slot=web_slot; previous_state=state; was_capturing=capturing;
        seq++;
        TickType_t tick = xTaskGetTickCount();
        if (tick - last > pdMS_TO_TICKS(40)) last = tick;
        vTaskDelayUntil(&last, pdMS_TO_TICKS(20));
    }
}
