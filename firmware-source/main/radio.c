#include "controller.h"
#include "frame_wire.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_random.h"
#include "esp_wifi.h"
#include "lwip/sockets.h"
#include "lwip/tcp.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>

extern const uint8_t game_start[] asm("_binary_game_html_gz_start");
extern const uint8_t game_end[] asm("_binary_game_html_gz_end");

static httpd_handle_t server;
static portMUX_TYPE state_lock = portMUX_INITIALIZER_UNLOCKED;
static controller_frame_t latest;
static int subscriber = -1;
static bool queued;
static bool subscriber_six_axis;

static esp_err_t index_page(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    return httpd_resp_send(req, (const char *)game_start, game_end - game_start);
}

static esp_err_t socket_event(httpd_req_t *req) {
    if (req->method == HTTP_GET) {
        int fd = httpd_req_to_sockfd(req);
        int immediate = 1;
        setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &immediate, sizeof(immediate));
        char query[24], version[4];
        bool six_axis = httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK &&
                        httpd_query_key_value(query, "v", version, sizeof(version)) == ESP_OK &&
                        strcmp(version, "2") == 0;
        portENTER_CRITICAL(&state_lock);
        subscriber = fd; subscriber_six_axis = six_axis;
        portEXIT_CRITICAL(&state_lock);
        return ESP_OK;
    }
    // Stream is one-way. Close unsolicited application frames.
    return ESP_FAIL;
}

static void send_latest(void *unused) {
    controller_frame_t f;
    portENTER_CRITICAL(&state_lock);
    int fd = subscriber; f = latest; bool six_axis = subscriber_six_axis;
    portEXIT_CRITICAL(&state_lock);
    bool ok = false;
    if (fd >= 0 && httpd_ws_get_fd_info(server, fd) == HTTPD_WS_CLIENT_WEBSOCKET) {
        char payload[100];
        int n = format_frame(payload, sizeof(payload), f.seq, f.ms, f.imu, f.gx, f.gy, f.gz, f.buttons, f.key, six_axis, f.acceleration_mg, f.accel_z_mg);
        httpd_ws_frame_t packet = {.type=HTTPD_WS_TYPE_TEXT, .payload=(uint8_t *)payload, .len=(size_t)n};
        ok = httpd_ws_send_frame_async(server, fd, &packet) == ESP_OK;
        if (!ok) httpd_sess_trigger_close(server, fd);
    }
    portENTER_CRITICAL(&state_lock);
    if (!ok && subscriber == fd) subscriber = -1;
    queued = false;
    portEXIT_CRITICAL(&state_lock);
}

void controller_publish(const controller_frame_t *frame) {
    portENTER_CRITICAL(&state_lock);
    latest = *frame;
    bool schedule = subscriber >= 0 && !queued;
    if (schedule) queued = true;
    portEXIT_CRITICAL(&state_lock);
    if (schedule && httpd_queue_work(server, send_latest, NULL) != ESP_OK) {
        portENTER_CRITICAL(&state_lock);
        queued = false;
        portEXIT_CRITICAL(&state_lock);
    }
}

#define TRY(call) do { esp_err_t err_ = (call); if (err_ != ESP_OK) return err_; } while (0)
esp_err_t controller_radio_init(char ssid[24], char password[12]) {
    TRY(esp_netif_init());
    TRY(esp_event_loop_create_default());
    if (!esp_netif_create_default_wifi_ap()) return ESP_ERR_NO_MEM;
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    init.nvs_enable = 0;
    TRY(esp_wifi_init(&init));
    TRY(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    uint8_t mac[6];
    TRY(esp_read_mac(mac, ESP_MAC_WIFI_SOFTAP));
    snprintf(ssid, 24, "Tideline-%02X%02X", mac[4], mac[5]);
    snprintf(password, 12, "%08" PRIX32, esp_random());
    wifi_config_t cfg = {0};
    snprintf((char *)cfg.ap.ssid, sizeof(cfg.ap.ssid), "%s", ssid);
    snprintf((char *)cfg.ap.password, sizeof(cfg.ap.password), "%s", password);
    cfg.ap.ssid_len = strlen(ssid); cfg.ap.channel = 6; cfg.ap.max_connection = 1;
    cfg.ap.authmode = WIFI_AUTH_WPA2_PSK;
    TRY(esp_wifi_set_mode(WIFI_MODE_AP));
    TRY(esp_wifi_set_config(WIFI_IF_AP, &cfg));
    TRY(esp_wifi_start());
    httpd_config_t http = HTTPD_DEFAULT_CONFIG();
    http.lru_purge_enable = true; http.max_open_sockets = 4;
    http.send_wait_timeout = 2; http.recv_wait_timeout = 2;
    TRY(httpd_start(&server, &http));
    httpd_uri_t page = {.uri="/", .method=HTTP_GET, .handler=index_page};
    httpd_uri_t ws = {.uri="/motion", .method=HTTP_GET, .handler=socket_event, .is_websocket=true};
    TRY(httpd_register_uri_handler(server, &page));
    return httpd_register_uri_handler(server, &ws);
}
