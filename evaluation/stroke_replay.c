#include "stroke.h"
#include <math.h>
#include <stdio.h>

int main(void) {
    stroke_detector_t d = {0};
    unsigned ms;
    int ax,ay,az,gx,gy,gz,flags;
    while (scanf("%u %d %d %d %d %d %d %d",&ms,&ax,&ay,&az,&gx,&gy,&gz,&flags)==8) {
        if (!(flags & 1)) continue;
        stroke_t shot;
        int load=lround(sqrt((double)ax*ax+(double)ay*ay+(double)az*az)*1000/8192);
        if (stroke_sample(&d,ms,gy/64,gx/64,-(gz/64),load,lround(az*1000.0/8192),&shot)) {
            printf("%u %c %c\n",ms,'A'+stroke_usage(0,shot)-4,'A'+stroke_usage(1,shot)-4);
        }
    }
    return ferror(stdin);
}
