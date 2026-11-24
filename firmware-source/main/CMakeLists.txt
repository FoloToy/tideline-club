idf_component_register(
    SRCS "tideline.c" "paddle.c" "stroke.c" "controller_ui.c" "capture_log.c" "capture_mode.c" "capture_font.c"
    INCLUDE_DIRS "."
    REQUIRES bsp esp_hid bt nvs_flash esp_event esp_timer esp_hw_support esp_partition esp_rom
)
