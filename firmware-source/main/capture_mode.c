#include "capture_mode.h"
#include "capture_log.h"
#include "controller.h"
#include <stdio.h>
#include <stdlib.h>

typedef enum { HOME, INTRO, PICK, RECORD, REVIEW, SAVED, FAILED } screen_t;
static screen_t screen;
static unsigned hand = CAP_FOREHAND, count, fresh, last_second;
static uint32_t started, duration;
static capture_frame_t *frames;

bool capture_active(void) { return screen != HOME; }
static const char *hand_name(void) { return hand == CAP_FOREHAND ? "正手" : "反手"; }

static void pick(void) {
    screen = PICK;
    controller_ui_capture("选择挥拍方向", hand_name(), "上下键切换\n确认键开始录制");
}

static void fail(const char *reason) {
    screen = FAILED;
    controller_ui_capture("这组没有保存", reason, "确认键返回");
}

static void save(void) {
    if (!fresh) { fail("没有有效传感器读数"); return; }
    if (!capture_save(hand, frames, count, duration)) { fail("写入失败或空间已满"); return; }
    char title[48], detail[64];
    snprintf(title, sizeof(title), "%s已保存", hand_name());
    snprintf(detail, sizeof(detail), "本机已存 %u 组", capture_saved());
    screen = SAVED;
    controller_ui_capture(title, detail, "确认键继续下一组\n长按确认退出");
    hand = hand == CAP_FOREHAND ? CAP_BACKHAND : CAP_FOREHAND;
}

void capture_mode_key(bsp_btn_t key, bsp_btn_ev_t event, uint32_t now, bool sensor_ok) {
    if (key == BSP_BTN_OK && event == BSP_BTN_LONG) {
        if (screen == HOME) {
            screen = INTRO;
            char detail[64];
            snprintf(detail, sizeof(detail), "本机已存 %u 组", capture_saved());
            controller_ui_capture("挥拍采集", detail, "确认键开始\n长按确认退出");
        } else {
            free(frames); frames = NULL;
            screen = HOME; controller_ui_capture(NULL, NULL, NULL);
        }
        return;
    }
    if (event != BSP_BTN_CLICK || screen == HOME) return;
    if (screen == PICK && key != BSP_BTN_OK) {
        hand = hand == CAP_FOREHAND ? CAP_BACKHAND : CAP_FOREHAND;
        pick(); return;
    }
    if (screen == REVIEW && key != BSP_BTN_OK) { pick(); return; }
    if (key != BSP_BTN_OK) return;
    switch (screen) {
    case INTRO: case SAVED: case FAILED: pick(); break;
    case PICK:
        if (!sensor_ok) { fail("陀螺仪未就绪"); break; }
        if (!capture_has_room()) { fail("日志空间不可用"); break; }
        if (!frames) frames = calloc(CAP_MAX_FRAMES, sizeof(*frames));
        if (!frames) { fail("内存不足"); break; }
        started = now; duration = 0; count = 0; fresh = 0; last_second = UINT32_MAX;
        screen = RECORD; break;
    case RECORD:
        if (now - started < 2000) break;
        duration = now - started;
        save(); break;
    case REVIEW: save(); break;
    default: break;
    }
}

void capture_mode_sample(uint32_t now, uint16_t seq, bool valid, const bsp_qmi8658a_sample_t *s, uint8_t keys) {
    if (screen != RECORD) return;
    duration = now - started;
    if (duration >= CAP_LIMIT_MS || count >= CAP_MAX_FRAMES) {
        screen = REVIEW;
        controller_ui_capture("录制已停止", "完成五拍后再保存", "确认键保存五拍\n上下键重新录制");
        return;
    }
    capture_frame_t *f = &frames[count++];
    *f = (capture_frame_t){.elapsed_ms=duration, .flags=(uint16_t)((keys << 1) | valid), .sequence=seq};
    if (valid) {
        fresh++;
        for (int axis = 0; axis < 3; axis++) {
            f->gyro[axis] = (int16_t)(s->gyro_dps[axis] * 64.0f);
            f->accel[axis] = (int16_t)(s->accel_g[axis] * 8192.0f);
        }
    }
    unsigned seconds = duration / 1000;
    if (seconds == last_second) return;
    last_second = seconds;
    char title[48], detail[64];
    snprintf(title, sizeof(title), "%s采集中", hand_name());
    snprintf(detail, sizeof(detail), "挥拍 5 次  %u 秒", seconds);
    controller_ui_capture(title, seconds ? detail : "先静置一秒", "每拍之间停一下\n五拍后按确认保存");
}
