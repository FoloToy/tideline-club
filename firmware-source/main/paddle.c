#include <stdbool.h>
#include <stdint.h>
#include <stdatomic.h>
#include "esp_log.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include "esp_hidd.h"
#include "nvs_flash.h"
#include "paddle.h"
#include "esp_mac.h"
#include <stdio.h>
#include "esp_check.h"

static const char *TAG = "tideline_ble";
static char name[24];
static esp_hidd_dev_t *hid;
static atomic_bool authenticated;
static atomic_bool hid_started;
static atomic_bool adv_configured;
static atomic_uint connection_epoch;

// Eight-byte keyboard input report, report ID 1; one-byte LED output.
static const uint8_t keyboard_map[] = {
    0x05,0x01, 0x09,0x06, 0xa1,0x01, 0x85,0x01,
    0x05,0x07, 0x19,0xe0, 0x29,0xe7, 0x15,0x00, 0x25,0x01,
    0x75,0x01, 0x95,0x08, 0x81,0x02,
    0x95,0x01, 0x75,0x08, 0x81,0x03,
    0x95,0x05, 0x75,0x01, 0x05,0x08, 0x19,0x01, 0x29,0x05, 0x91,0x02,
    0x95,0x01, 0x75,0x03, 0x91,0x03,
    0x95,0x06, 0x75,0x08, 0x15,0x00, 0x25,0x65,
    0x05,0x07, 0x19,0x00, 0x29,0x65, 0x81,0x00, 0xc0
};
static esp_hid_raw_report_map_t maps[] = {{.data=keyboard_map, .len=sizeof(keyboard_map)}};
static esp_ble_adv_params_t advertising = {
    .adv_int_min=0x40, .adv_int_max=0x80, .adv_type=ADV_TYPE_IND,
    .own_addr_type=BLE_ADDR_TYPE_PUBLIC, .channel_map=ADV_CHNL_ALL,
    .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY
};

static void advertise(void) {
    if (atomic_load(&hid_started) && atomic_load(&adv_configured)) {
        esp_err_t e = esp_ble_gap_start_advertising(&advertising);
        ESP_LOGI(TAG, "Advertising request: %s", esp_err_to_name(e));
    }
}

static void gap_event(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *p) {
    switch (event) {
    case ESP_GAP_BLE_ADV_DATA_SET_COMPLETE_EVT:
        atomic_store(&adv_configured, p->adv_data_cmpl.status == ESP_BT_STATUS_SUCCESS);
        advertise();
        break;
    case ESP_GAP_BLE_SEC_REQ_EVT:
        esp_ble_gap_security_rsp(p->ble_security.ble_req.bd_addr, true);
        break;
    case ESP_GAP_BLE_AUTH_CMPL_EVT:
        atomic_store(&authenticated, p->ble_security.auth_cmpl.success);
        atomic_fetch_add(&connection_epoch, 1);
        ESP_LOGI(TAG, "Authentication %s", p->ble_security.auth_cmpl.success ? "OK" : "FAILED");
        if (!p->ble_security.auth_cmpl.success)
            esp_ble_gap_disconnect(p->ble_security.auth_cmpl.bd_addr);
        break;
    default: break;
    }
}

static void hid_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
    (void)arg; (void)base; (void)data;
    if (id == ESP_HIDD_START_EVENT) {
        atomic_store(&hid_started, true);
        advertise();
    } else if (id == ESP_HIDD_CONNECT_EVENT) {
        ESP_LOGI(TAG, "BLE link connected; awaiting authentication");
    } else if (id == ESP_HIDD_DISCONNECT_EVENT) {
        atomic_store(&authenticated, false);
        atomic_fetch_add(&connection_epoch, 1);
        ESP_LOGI(TAG, "Disconnected; no button events retained");
        advertise();
    }
}

esp_err_t paddle_init(char out[24]) {
    uint8_t mac[6];
    if (esp_read_mac(mac, ESP_MAC_BT) != ESP_OK) return ESP_FAIL;
    snprintf(name, sizeof(name), "Tideline-%02X%02X", mac[4], mac[5]);
    snprintf(out, 24, "%s", name);
    ESP_RETURN_ON_ERROR(nvs_flash_init(), TAG, "Bluetooth setup failed"); // Never erase an unexpected/invalid NVS.
    esp_bt_controller_config_t cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_bt_controller_init(&cfg), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_bt_controller_enable(ESP_BT_MODE_BLE), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_bluedroid_init(), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_bluedroid_enable(), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_register_callback(gap_event), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gatts_register_callback(esp_hidd_gatts_event_handler), TAG, "Bluetooth setup failed");
    esp_ble_auth_req_t auth = ESP_LE_AUTH_REQ_SC_BOND;
    esp_ble_io_cap_t io = ESP_IO_CAP_NONE;
    uint8_t key_size=16, keys=ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK;
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_AUTHEN_REQ_MODE, &auth, sizeof(auth)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_IOCAP_MODE, &io, sizeof(io)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_MAX_KEY_SIZE, &key_size, sizeof(key_size)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_INIT_KEY, &keys, sizeof(keys)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_RSP_KEY, &keys, sizeof(keys)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_device_name(name), TAG, "Bluetooth setup failed");
    static uint8_t uuid[] = {0xfb,0x34,0x9b,0x5f,0x80,0x00,0x00,0x80,
                            0x00,0x10,0x00,0x00,0x12,0x18,0x00,0x00};
    esp_ble_adv_data_t ad = {
        .include_name=true, .appearance=ESP_HID_APPEARANCE_KEYBOARD,
        .service_uuid_len=sizeof(uuid), .p_service_uuid=uuid,
        .flag=ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT
    };
    ESP_RETURN_ON_ERROR(esp_ble_gap_config_adv_data(&ad), TAG, "Bluetooth setup failed");
    esp_hid_device_config_t hc = {
        .vendor_id=0x303a, .product_id=0x4002, .version=0x0120,
        .device_name=name, .manufacturer_name="FoloToy prototype",
        .serial_number=name, .report_maps=maps, .report_maps_len=1
    };
    ESP_RETURN_ON_ERROR(esp_hidd_dev_init(&hc, ESP_HID_TRANSPORT_BLE, hid_event, &hid), TAG, "Bluetooth setup failed");
    return ESP_OK;
}
bool paddle_connected(void) { return atomic_load(&authenticated); }
unsigned paddle_epoch(void) { return atomic_load(&connection_epoch); }

static bool key_down;
static unsigned key_epoch;
static uint32_t down_at;
void paddle_release_tick(uint32_t now) {
    if (!key_down) return;
    if (!paddle_connected() || key_epoch != paddle_epoch()) { key_down = false; return; }
    if (now - down_at >= 35) {
        uint8_t report[8] = {0};
        if (esp_hidd_dev_input_set(hid, 0, 1, report, sizeof(report)) == ESP_OK) key_down = false;
    }
}
bool paddle_press(uint8_t usage, uint32_t now) {
    if (key_down || !paddle_connected() || !esp_hidd_dev_connected(hid)) return false;
    key_epoch = paddle_epoch();
    uint8_t report[8] = {0, 0, usage};
    if (esp_hidd_dev_input_set(hid, 0, 1, report, sizeof(report)) != ESP_OK) return false;
    down_at = now;
    key_down = true;
    return true;
}
