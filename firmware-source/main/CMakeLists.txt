idf_component_register(
    SRCS "tideline.c" "radio.c" "controller_ui.c"
    INCLUDE_DIRS "."
    REQUIRES bsp esp_wifi esp_event esp_netif esp_http_server esp_timer esp_hw_support
    EMBED_FILES "game.html.gz"
)
