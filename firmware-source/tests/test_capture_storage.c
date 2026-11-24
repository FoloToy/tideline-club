#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <zlib.h>
#include "../main/capture_log.c"

static uint8_t flash[0x200000];
static const esp_partition_t sim = {.size=sizeof(flash)};
static bool fail_header;
uint32_t esp_random(void) { return 12; }
uint32_t esp_rom_crc32_le(uint32_t previous, const uint8_t *data, uint32_t count) {
    return crc32(previous,data,count);
}
const esp_partition_t *esp_partition_find_first(int type,int subtype,const char *name) {
    assert(type==1 && subtype==0x40 && strcmp(name,"motionlog")==0); return &sim;
}
esp_err_t esp_partition_read(const esp_partition_t *p,size_t pos,void *out,size_t n) {
    assert(p==&sim && pos+n<=p->size); memcpy(out,flash+pos,n); return ESP_OK;
}
esp_err_t esp_partition_write(const esp_partition_t *p,size_t pos,const void *src,size_t n) {
    assert(p==&sim && pos+n<=p->size);
    if (fail_header && pos%CAP_SLOT_BYTES==0) return ESP_FAIL;
    for(size_t i=0;i<n;i++) assert(flash[pos+i]==0xff);
    memcpy(flash+pos,src,n); return ESP_OK;
}
int main(int argc,char **argv) {
    assert(argc==2); memset(flash,0xff,sizeof(flash));
    capture_frame_t f[2]={{.elapsed_ms=0,.gyro={-640,0,640},.flags=1,.sequence=123},
                          {.elapsed_ms=20,.flags=2,.sequence=124}};
    capture_log_init(); assert(capture_saved()==0);
    assert(capture_save(CAP_FOREHAND,f,2,2100));
    fail_header=true; assert(!capture_save(CAP_BACKHAND,f,2,2100)); fail_header=false;
    capture_log_init(); assert(capture_saved()==1 && next_slot==2);
    assert(capture_save(CAP_BACKHAND,f,2,2200));
    capture_log_init(); assert(capture_saved()==2 && next_slot==3);
    FILE *out=fopen(argv[1],"wb"); assert(out && fwrite(flash,1,sizeof(flash),out)==sizeof(flash)); fclose(out);
    while(capture_has_room()) assert(capture_save(CAP_FOREHAND,f,2,2100));
    assert(capture_saved()==63 && !capture_save(CAP_FOREHAND,f,2,2100));
    capture_log_init(); assert(!capture_has_room() && capture_saved()==63);
    puts("Append/reboot/partial writes/full flash PASS");
}
