#include "controller.h"
#include "bsp_display.h"
#include "lvgl.h"
#include <stdio.h>
#include <string.h>

LV_FONT_DECLARE(capture_font);
LV_FONT_DECLARE(pad_font);
static bool ui_ready;
static lv_obj_t *panel, *heading, *detail, *action;
static lv_obj_t *remote, *remote_title, *remote_value, *remote_hint;
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
    label(screen, 18, 50, "AI CONTROLLER", 0xffead4, &lv_font_montserrat_20);
    label(screen, 18, 96, "BLUETOOTH", 0xffba81, &lv_font_montserrat_14);
    name_text = label(screen, 18, 117, "Starting...", 0xffffff, &lv_font_montserrat_20);
    player_text = label(screen, 18, 148, "", 0xe5f3ee, &pad_font);
    label(screen, 18, 192, "CONNECTION", 0xffba81, &lv_font_montserrat_14);
    label(screen, 18, 214, "在游戏网页连接手柄", 0xffffff, &pad_font);
    sensor_text = label(screen, 18, 248, "开启电脑蓝牙", 0xa6e4c7, &pad_font);
    label(screen, 18, 277, "长按确认进入挥拍采集", 0xffba81, &capture_font);
    remote=lv_obj_create(screen);
    lv_obj_remove_style_all(remote); lv_obj_set_size(remote,240,320);
    lv_obj_set_style_bg_opa(remote,LV_OPA_COVER,0);
    lv_obj_set_style_bg_color(remote,lv_color_hex(0x113b37),0);
    lv_obj_remove_flag(remote,LV_OBJ_FLAG_SCROLLABLE);
    label(remote,18,25,"AI PASSPORT  //  LIVE",0xa6e4c7,&lv_font_montserrat_14);
    remote_title=label(remote,18,76,"",0xffba81,&pad_font);
    remote_value=label(remote,18,133,"",0xffffff,&pad_font);
    remote_hint=label(remote,18,224,"",0xa6e4c7,&pad_font);
    lv_obj_add_flag(remote,LV_OBJ_FLAG_HIDDEN);
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

void controller_ui_home(void) {
    if (!ui_ready || !bsp_lvgl_lock(100)) return;
    lv_obj_add_flag(remote,LV_OBJ_FLAG_HIDDEN);
    bsp_lvgl_unlock();
}
void controller_ui_remote(const char *title,const char *value,const char *hint) {
    if (!ui_ready || !bsp_lvgl_lock(100)) return;
    const lv_font_t *value_font = value[0] && strlen(value)<=9 && strspn(value,"0123456789 :.-")==strlen(value)
        ? &lv_font_montserrat_36 : &pad_font;
    lv_obj_set_style_text_font(remote_value,value_font,0);
    lv_label_set_text(remote_title,title); lv_label_set_text(remote_value,value);
    lv_label_set_text(remote_hint,hint); lv_obj_remove_flag(remote,LV_OBJ_FLAG_HIDDEN);
    bsp_lvgl_unlock();
}
