#include <stdbool.h>
#include <stdint.h>
#include <stdatomic.h>
#include "esp_log.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_gap_ble_api.h"
#include "esp_gatts_api.h"
#include <string.h>
#include "nvs_flash.h"
#include "paddle.h"
#include "gamepad.h"
#include "esp_mac.h"
#include <stdio.h>
#include "esp_check.h"

static const char *TAG = "tideline_ble";
static char name[24];

static atomic_bool adv_configured;

static atomic_bool scan_ready;

static esp_ble_adv_params_t advertising = {
    .adv_int_min=0x40, .adv_int_max=0x80, .adv_type=ADV_TYPE_IND,
    .own_addr_type=BLE_ADDR_TYPE_PUBLIC, .channel_map=ADV_CHNL_ALL,
    .adv_filter_policy=ADV_FILTER_ALLOW_SCAN_ANY_CON_ANY
};

static void advertise(void) {
    if (atomic_load(&adv_configured) && atomic_load(&scan_ready) && gamepad_service_ready()) {
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
    case ESP_GAP_BLE_SCAN_RSP_DATA_SET_COMPLETE_EVT:
        atomic_store(&scan_ready,p->scan_rsp_data_cmpl.status==ESP_BT_STATUS_SUCCESS);
        advertise(); break;
    case ESP_GAP_BLE_SEC_REQ_EVT:
        esp_ble_gap_security_rsp(p->ble_security.ble_req.bd_addr, true);
        break;
    case ESP_GAP_BLE_AUTH_CMPL_EVT:
        ESP_LOGI(TAG, "Authentication %s", p->ble_security.auth_cmpl.success ? "OK" : "FAILED");
        if (!p->ble_security.auth_cmpl.success)
            esp_ble_gap_disconnect(p->ble_security.auth_cmpl.bd_addr);
        break;
    default: break;
    }
}

static void gatts(esp_gatts_cb_event_t event, esp_gatt_if_t iface, esp_ble_gatts_cb_param_t *p) {
    if (!gamepad_gatts(event, iface, p)) return;
    if (event == ESP_GATTS_CONNECT_EVT) {
        esp_ble_set_encryption(p->connect.remote_bda, ESP_BLE_SEC_ENCRYPT_NO_MITM);
        esp_ble_conn_update_params_t interval = {
            .min_int = 12, .max_int = 24, .latency = 0, .timeout = 400
        };
        memcpy(interval.bda, p->connect.remote_bda, sizeof(interval.bda));
        esp_ble_gap_update_conn_params(&interval);
    } else if (event == ESP_GATTS_START_EVT || event == ESP_GATTS_DISCONNECT_EVT) {
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
    ESP_RETURN_ON_ERROR(esp_ble_gatts_register_callback(gatts), TAG, "Bluetooth setup failed");
    esp_ble_auth_req_t auth = ESP_LE_AUTH_REQ_SC_BOND;
    esp_ble_io_cap_t io = ESP_IO_CAP_NONE;
    uint8_t key_size=16, keys=ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK;
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_AUTHEN_REQ_MODE, &auth, sizeof(auth)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_IOCAP_MODE, &io, sizeof(io)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_MAX_KEY_SIZE, &key_size, sizeof(key_size)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_INIT_KEY, &keys, sizeof(keys)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_RSP_KEY, &keys, sizeof(keys)), TAG, "Bluetooth setup failed");
    ESP_RETURN_ON_ERROR(esp_ble_gap_set_device_name(name), TAG, "Bluetooth setup failed");
    esp_ble_adv_data_t ad = {
        .appearance=0x03c4, // Bluetooth SIG Gamepad
        .service_uuid_len=16, .p_service_uuid=(uint8_t *)gamepad_service_uuid,
        .flag=ESP_BLE_ADV_FLAG_GEN_DISC | ESP_BLE_ADV_FLAG_BREDR_NOT_SPT
    };
    esp_ble_adv_data_t scan = {.set_scan_rsp=true,.include_name=true};
    ESP_RETURN_ON_ERROR(esp_ble_gap_config_adv_data(&ad),TAG,"Advertising setup");
    ESP_RETURN_ON_ERROR(esp_ble_gap_config_adv_data(&scan),TAG,"Scan response setup");
    ESP_RETURN_ON_ERROR(esp_ble_gatts_app_register(PAD_GATT_APP),TAG,"Gamepad service setup");
    return ESP_OK;
}
