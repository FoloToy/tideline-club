/* Run the motion-block driver unchanged against a simulated register bank. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "driver/i2c_master.h"
#define ESP_ERR_NOT_FINISHED 0x10c
esp_err_t i2c_master_probe(i2c_master_bus_handle_t, uint16_t, int);
#include "../components/bsp/src/bsp_qmi8658a.c"
#include "../main/frame_wire.h"

static uint8_t regs[256];
static unsigned address, writes;
static bool tear;
void vTaskDelay(TickType_t t) { (void)t; }
esp_err_t bsp_i2c_init(void) {return ESP_OK;}
i2c_master_bus_handle_t bsp_i2c_bus(void) {return regs;}
esp_err_t i2c_master_probe(i2c_master_bus_handle_t b, uint16_t a, int wait) {
    assert(b == regs && wait == 5);
    return a == address ? ESP_OK : ESP_ERR_NOT_FOUND;
}
esp_err_t i2c_master_bus_add_device(i2c_master_bus_handle_t bus,
                                    const i2c_device_config_t *cfg,i2c_master_dev_handle_t *dev) {
    assert(bus==regs && cfg->device_address==address); *dev=regs; return ESP_OK;
}
esp_err_t i2c_master_bus_rm_device(i2c_master_dev_handle_t d) {assert(d==regs);return ESP_OK;}
esp_err_t i2c_master_transmit(i2c_master_dev_handle_t d,const uint8_t *data,size_t len,int timeout) {
    assert(d==regs && len==2 && timeout==5);
    writes++; regs[data[0]]=data[1];
    if(data[0]==0x60 && data[1]==0xb0)regs[0x4d]=0x80;
    return ESP_OK;
}
esp_err_t i2c_master_transmit_receive(i2c_master_dev_handle_t d,const uint8_t *reg,size_t w,
                                      uint8_t *out,size_t n,int timeout) {
    assert(d==regs && w==1 && timeout==5);
    memcpy(out,regs+*reg,n);
    if(tear && *reg==0x35)regs[0x30]++;
    return ESP_OK;
}
static void raw(int offset,int value) {
    regs[offset]=(uint16_t)value & 255; regs[offset+1]=(uint16_t)value >> 8;
}
int main(void) {
    bsp_qmi8658a_sample_t s;
    assert(bsp_qmi8658a_init()==ESP_ERR_NOT_FOUND && writes==0);
    address=0x6a; regs[0]=0x7f;
    assert(bsp_qmi8658a_init()==ESP_ERR_NOT_FOUND && writes==0);
    for(address=0x6a;address<=0x6b;address++) {
        regs[0]=5; regs[0x30]++;
        raw(0x3b,64*100);raw(0x3d,-64*125);raw(0x3f,64*350);
        assert(bsp_qmi8658a_init()==ESP_OK && bsp_qmi8658a_address()==address);
        assert(regs[0x02]==0x40 && regs[0x03]==0x15 && regs[0x04]==0x55 && regs[0x08]==3);
        assert(bsp_qmi8658a_read(&s)==ESP_ERR_NOT_FINISHED);
        regs[0x30]++;
        tear=true;assert(bsp_qmi8658a_read(&s)==ESP_ERR_NOT_FINISHED);tear=false;
        assert(bsp_qmi8658a_read(&s)==ESP_OK);
        assert(s.gyro_dps[0]==100 && s.gyro_dps[1]==-125 && s.gyro_dps[2]==350);
        char frame[96];int n=format_frame(frame,sizeof(frame),48,960,1,(int)s.gyro_dps[1],(int)s.gyro_dps[0],-(int)s.gyro_dps[2],2,1,false,1000,0);
        assert(n>0 && strcmp(frame,"[1,48,960,1,-125,100,-350,2,1]")==0);
        n=format_frame(frame,sizeof(frame),48,960,1,-125,100,-350,2,1,true,1420,-670);
        assert(n>0 && strcmp(frame,"[2,48,960,1,-125,100,-350,2,1,1420,-670]")==0);
        regs[0x30]++;raw(0x3b,-32768);raw(0x3d,-32768);raw(0x3f,-32768);
        assert(bsp_qmi8658a_read(&s)==ESP_ERR_NOT_FINISHED);
        assert(qmi_remove_device()==ESP_OK);
    }
    puts("QMI8658A register simulation: identification, both addresses, 6-DoF configuration, scaling, stale/torn/sentinel samples and wire format PASS");
}
