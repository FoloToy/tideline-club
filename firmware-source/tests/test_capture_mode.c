#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../main/capture_mode.c"

static const char *marker;
static char title[96], detail[96];
static unsigned groups, last_hand, last_size;
static bool room = true;
void controller_ui_capture(const char *h, const char *body, const char *keys) {
    marker = h;
    if (h) { snprintf(title,sizeof(title),"%s",h); snprintf(detail,sizeof(detail),"%s",body); }
    (void)keys;
}
unsigned capture_saved(void) { return groups; }
bool capture_has_room(void) { return room; }
bool capture_save(unsigned dir, const capture_frame_t *data, unsigned n, unsigned duration_ms) {
    assert(n > 0 && duration_ms >= 2000);
    assert(data[0].flags == 1 && data[0].gyro[2] == -160 && data[0].accel[1] == 4096);
    assert(data[1].flags == 4 && data[1].gyro[2] == 0);
    last_hand=dir; last_size=n; groups++; return true;
}
static void ok(uint32_t now) { capture_mode_key(BSP_BTN_OK,BSP_BTN_CLICK,now,true); }
static void hold(void) { capture_mode_key(BSP_BTN_OK,BSP_BTN_LONG,0,true); }
static void samples(uint32_t t) {
    bsp_qmi8658a_sample_t s={0}; s.gyro_dps[2]=-2.5f; s.accel_g[1]=.5f;
    capture_mode_sample(t,2,true,&s,0);
    capture_mode_sample(t+20,3,false,&s,2);
}
int main(void) {
    assert(!capture_active()); hold(); assert(capture_active() && strstr(title,"采集"));
    ok(10); assert(strcmp(detail,"正手")==0); ok(100);
    samples(100); ok(280); assert(groups==0);
    ok(4200); assert(groups==1 && last_hand==CAP_FOREHAND && last_size==2);
    ok(4300); assert(strcmp(detail,"反手")==0); ok(4400); samples(4400);
    capture_mode_sample(34400,15,false,NULL,0);
    assert(groups==1 && screen==REVIEW); ok(35100); assert(groups==2 && last_hand==CAP_BACKHAND);
    ok(35200); capture_mode_key(BSP_BTN_DOWN,BSP_BTN_CLICK,35201,true); assert(strcmp(detail,"反手")==0);
    ok(35400); samples(35400); hold(); assert(!capture_active() && !marker && groups==2);
    hold(); ok(40000); capture_mode_key(BSP_BTN_OK,BSP_BTN_CLICK,40100,false);
    assert(screen==FAILED && groups==2);
    ok(42000); room=false; ok(43000); assert(screen==FAILED && groups==2);
    hold(); puts("Capture navigation, manual labels, raw axes, dropouts, early confirmation, timeout, repeated groups and cancel PASS");
}
