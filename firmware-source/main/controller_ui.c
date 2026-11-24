#include "controller.h"
#include "bsp_display.h"
#include "lvgl.h"
#include <stdio.h>

LV_FONT_DECLARE(capture_font);
static bool ui_ready;
static lv_obj_t *panel, *heading, *detail, *action;
static lv_obj_t *name_text, *player_text, *sensor_text;

static lv_obj_t *label(lv_obj_t *parent, int x, int y, const char *text,
                       uint32_t color, const lv_font_t *font) {
    lv_obj_t *obj = lv_label_create(parent);
    lv_label_set_text(obj, text);
    lv_obj_set_style_text_color(obj, lv_color_hex(color), 0);
    lv_obj_set_style_text_font(obj, font, 0);
    lv_obj_set_pos(obj, x, y);
    return obj;
}

void controller_ui_init(void) {
    if (bsp_display_init() != ESP_OK || !bsp_lvgl_init() || !bsp_lvgl_lock(1000)) return;
    lv_obj_t *screen = lv_screen_active();
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x103937), 0);
    lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    label(screen, 18, 22, "AI PASSPORT  //  SPORT", 0xa6e4c7, &lv_font_montserrat_14);
    label(screen, 18, 50, "TIDELINE CLUB", 0xffead4, &lv_font_montserrat_20);
    label(screen, 18, 96, "BLUETOOTH", 0xffba81, &lv_font_montserrat_14);
    name_text = label(screen, 18, 117, "Starting...", 0xffffff, &lv_font_montserrat_20);
    player_text = label(screen, 18, 146, "", 0xe5f3ee, &lv_font_montserrat_14);
    label(screen, 18, 192, "PLAYER SELECT", 0xffba81, &lv_font_montserrat_14);
    label(screen, 18, 214, "UP: P1   DN: P2", 0xffffff, &lv_font_montserrat_20);
    sensor_text = label(screen, 18, 248, "Sensor check...", 0xa6e4c7, &lv_font_montserrat_14);
    label(screen, 18, 277, "长按确认进入挥拍采集", 0xffba81, &capture_font);
    panel = lv_obj_create(screen);
    lv_obj_remove_style_all(panel);
    lv_obj_set_size(panel, 240, 320);
    lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(panel, lv_color_hex(0x103937), 0);
    lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
    label(panel, 18, 25, "TIDELINE  /  MOTION", 0xa6e4c7, &lv_font_montserrat_14);
    heading = label(panel, 18, 68, "", 0xffba81, &capture_font);
    detail = label(panel, 18, 127, "", 0xffffff, &capture_font);
    action = label(panel, 18, 211, "", 0xa6e4c7, &capture_font);
    lv_obj_add_flag(panel, LV_OBJ_FLAG_HIDDEN);
    bsp_lvgl_unlock(); bsp_display_backlight(65); ui_ready = true;
}
void controller_ui_update(const char *name, const char *role, const char *state) {
    if (!ui_ready || !bsp_lvgl_lock(500)) return;
    lv_label_set_text(name_text, name);
    lv_label_set_text(player_text, role);
    lv_label_set_text(sensor_text, state);
    bsp_lvgl_unlock();
}

void controller_ui_capture(const char *title, const char *body, const char *keys) {
    if (!ui_ready || !bsp_lvgl_lock(100)) return;
    if (!title) {
        lv_obj_add_flag(panel, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_label_set_text(heading, title);
        lv_label_set_text(detail, body);
        lv_label_set_text(action, keys);
        lv_obj_remove_flag(panel, LV_OBJ_FLAG_HIDDEN);
    }
    bsp_lvgl_unlock();
}
