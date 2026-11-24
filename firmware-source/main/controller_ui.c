#include "controller.h"
#include "bsp_display.h"
#include "lvgl.h"
#include <stdio.h>

static bool ui_ready;
static lv_obj_t *network_text, *password_text, *sensor_text;

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
    label(screen, 18, 96, "CONNECT TO WI-FI", 0xffba81, &lv_font_montserrat_14);
    network_text = label(screen, 18, 117, "Starting...", 0xffffff, &lv_font_montserrat_20);
    password_text = label(screen, 18, 146, "", 0xe5f3ee, &lv_font_montserrat_14);
    label(screen, 18, 192, "OPEN IN BROWSER", 0xffba81, &lv_font_montserrat_14);
    label(screen, 18, 214, "192.168.4.1", 0xffffff, &lv_font_montserrat_20);
    sensor_text = label(screen, 18, 267, "Sensor check...", 0xa6e4c7, &lv_font_montserrat_14);
    bsp_lvgl_unlock(); bsp_display_backlight(65); ui_ready = true;
}
void controller_ui_update(const char *ssid, const char *password, const char *state) {
    if (!ui_ready || !bsp_lvgl_lock(500)) return;
    lv_label_set_text(network_text, ssid);
    lv_label_set_text_fmt(password_text, "KEY    %s", password);
    lv_label_set_text(sensor_text, state);
    bsp_lvgl_unlock();
}
