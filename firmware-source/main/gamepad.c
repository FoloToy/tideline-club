#include "gamepad.h"
#include "esp_timer.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include <math.h>
#include <stdatomic.h>

/* Little-endian bytes of 97c1000N-46f9-4b71-b6df-0c6cde4117a0. */
#define UUID(n) {0xa0,0x17,0x41,0xde,0x6c,0x0c,0xdf,0xb6,0x71,0x4b,0xf9,0x46,n,0x00,0xc1,0x97}
const uint8_t gamepad_service_uuid[16]=UUID(1);
static const uint8_t input_uuid[16]=UUID(2), output_uuid[16]=UUID(3);
enum { SERVICE, IN_DECL, IN_VALUE, IN_CCCD, OUT_DECL, OUT_VALUE, ATTR_COUNT };
static const uint16_t svc_uuid=ESP_GATT_UUID_PRI_SERVICE, decl_uuid=ESP_GATT_UUID_CHAR_DECLARE, cccd_uuid=ESP_GATT_UUID_CHAR_CLIENT_CONFIG;
static const uint8_t notify_prop=ESP_GATT_CHAR_PROP_BIT_NOTIFY, write_prop=ESP_GATT_CHAR_PROP_BIT_WRITE;
static uint8_t empty[20];
#define ATTR(us,uuid,perm,cap,len,val) {{ESP_GATT_AUTO_RSP},{us,(uint8_t *)(uuid),perm,cap,len,(uint8_t *)(val)}}
static const esp_gatts_attr_db_t table[ATTR_COUNT]={
    ATTR(2,&svc_uuid,ESP_GATT_PERM_READ,16,16,gamepad_service_uuid),
    ATTR(2,&decl_uuid,ESP_GATT_PERM_READ,1,1,&notify_prop),
    ATTR(16,input_uuid,ESP_GATT_PERM_READ_ENCRYPTED,8,1,empty),
    ATTR(2,&cccd_uuid,ESP_GATT_PERM_READ_ENCRYPTED|ESP_GATT_PERM_WRITE_ENCRYPTED,2,2,empty),
    ATTR(2,&decl_uuid,ESP_GATT_PERM_READ,1,1,&write_prop),
    ATTR(16,output_uuid,ESP_GATT_PERM_WRITE_ENCRYPTED,20,0,empty)
};
static uint16_t handles[ATTR_COUNT], conn;
static esp_gatt_if_t pad_if=ESP_GATT_IF_NONE;
static atomic_bool registered;
static portMUX_TYPE lock=portMUX_INITIALIZER_UNLOCKED;
static bool subscribed, dirty, ack, has_screen;
static unsigned slot;
static uint32_t refreshed;
static pad_screen_writer_t writer;
static pad_screen_t screen;
static void reset_session(void) {
    slot=0; has_screen=false; dirty=false; ack=false;
    memset(&writer,0,sizeof(writer)); memset(&screen,0,sizeof(screen));
}

bool gamepad_gatts(esp_gatts_cb_event_t ev, esp_gatt_if_t iface, esp_ble_gatts_cb_param_t *p) {
    if (ev==ESP_GATTS_REG_EVT) {
        if (p->reg.app_id!=PAD_GATT_APP) return false;
        if (p->reg.status==ESP_GATT_OK) {
            pad_if=iface;
            esp_ble_gatts_create_attr_tab(table,iface,ATTR_COUNT,0);
        }
        return true;
    }
    if (iface==ESP_GATT_IF_NONE || iface!=pad_if) return false;
    switch (ev) {
    case ESP_GATTS_CREAT_ATTR_TAB_EVT:
        if (p->add_attr_tab.status==ESP_GATT_OK && p->add_attr_tab.num_handle==ATTR_COUNT) {
            memcpy(handles,p->add_attr_tab.handles,sizeof(handles));
            esp_ble_gatts_start_service(handles[SERVICE]);
        }
        break;
    case ESP_GATTS_START_EVT:
        atomic_store(&registered,p->start.status==ESP_GATT_OK); break;
    case ESP_GATTS_CONNECT_EVT:
        portENTER_CRITICAL(&lock); conn=p->connect.conn_id;
        subscribed=false; reset_session(); portEXIT_CRITICAL(&lock); break;
    case ESP_GATTS_DISCONNECT_EVT:
        portENTER_CRITICAL(&lock); subscribed=false; reset_session(); portEXIT_CRITICAL(&lock); break;
    case ESP_GATTS_WRITE_EVT: {
        if (p->write.is_prep) break;
        const uint8_t *v=p->write.value; size_t n=p->write.len;
        uint32_t now=(uint32_t)(esp_timer_get_time()/1000);
        portENTER_CRITICAL(&lock);
        if (p->write.conn_id==conn && p->write.handle==handles[IN_CCCD] && n==2) {
            subscribed=v[0]==1 && v[1]==0;
            if (!subscribed) reset_session();
        } else if (subscribed && p->write.conn_id==conn && p->write.handle==handles[OUT_VALUE]) {
            if (n==3 && v[0]==PAD_CLAIM && v[1]==PAD_VERSION && v[2]>=1 && v[2]<=2) {
                if (slot!=v[2]) reset_session();
                slot=v[2]; refreshed=now; ack=true;
            } else if (slot && pad_screen_write(&writer,v,n,&screen)) { has_screen=true; dirty=true; }
        }
        portEXIT_CRITICAL(&lock);
        break;
    }
    default: break;
    }
    return true;
}
bool gamepad_service_ready(void) { return atomic_load(&registered); }
static void notify(uint8_t *data, uint16_t n) {
    portENTER_CRITICAL(&lock);
    bool send=subscribed && slot; uint16_t id=conn;
    portEXIT_CRITICAL(&lock);
    if (send) esp_ble_gatts_send_indicate(pad_if,id,handles[IN_VALUE],n,data,false);
}
unsigned gamepad_tick(uint32_t now, bool imu, bool calibrated, bool capturing) {
    static uint32_t last_status;
    static int last_flags=-1;
    uint8_t flags=imu | (calibrated<<1) | (capturing<<2);
    portENTER_CRITICAL(&lock);
    if (slot && now-refreshed>15000) reset_session();
    unsigned active=slot;
    bool send=active && (ack || flags!=last_flags || now-last_status>=1000);
    ack=false;
    portEXIT_CRITICAL(&lock);
    if (send) {
        uint8_t data[]={PAD_CLAIM,PAD_VERSION,(uint8_t)active,flags};
        notify(data,sizeof(data)); last_status=now; last_flags=flags;
    }
    return active;
}
bool gamepad_screen(pad_screen_t *out, bool force) {
    portENTER_CRITICAL(&lock);
    bool changed=slot && (dirty || force) && has_screen;
    if (changed) { *out=screen; dirty=false; }
    portEXIT_CRITICAL(&lock);
    return changed;
}
void gamepad_shot(float speed, float aim) {
    uint16_t dps=(uint16_t)lroundf(fminf(2000,fmaxf(0,speed)));
    uint8_t data[]={PAD_SWING,(uint8_t)dps,(uint8_t)(dps>>8),(uint8_t)(127+lroundf(127*aim))};
    notify(data,sizeof(data));
}
void gamepad_button(unsigned key) {
    uint8_t data[]={PAD_BUTTON,(uint8_t)key}; notify(data,sizeof(data));
}
