#include "stroke.h"
#include <math.h>
#include <stdlib.h>

bool stroke_sample(stroke_detector_t *d, uint32_t ms, int gx, int gy, int gz, int load, int az, stroke_t *out) {
    unsigned dt = d->started ? ms - d->previous : 0;
    if (dt > 550) { *d = (stroke_detector_t){0}; dt = 0; }
    d->started = true;
    d->previous = ms;
    if (!d->calibrated) {
        if (hypotf(hypotf(gx,gy),gz) > 35 || abs(load-1000) > 120 || dt > 100) {
            *d = (stroke_detector_t){.started=true, .previous=ms};
            return false;
        }
        d->bias[0] += gx; d->bias[1] += gy; d->bias[2] += gz;
        d->samples++;
        d->calibration_ms += dt < 40 ? dt : 40;
        if (d->samples >= 10 && d->calibration_ms >= 320) {
            for (int i=0; i<3; i++) d->bias[i] /= d->samples;
            d->calibrated = true;
        }
        return false;
    }
    if (dt > 100) {
        *d = (stroke_detector_t){.previous=ms,.started=true,.calibrated=true,
            .bias={d->bias[0],d->bias[1],d->bias[2]}};
    }
    unsigned step = dt < 60 ? dt : 60;
    float x=gx-d->bias[0], y=gy-d->bias[1], z=gz-d->bias[2];
    if (!d->has_rest) { d->rest_z=az; d->has_rest=true; }
    float change=az-d->rest_z, speed=hypotf(hypotf(x,y),z);
    d->rest_z += (1-expf(-(float)step/420))*change;
    int sign=(x>0)-(x<0);
    if (speed < 40 && abs(load-1000) < 150) d->quiet_ms += step;
    else d->quiet_ms = 0;
    if (d->quiet_ms >= 180 || !d->has_hit || ms-d->last_hit >= 1500) d->stroke_sign=0;
    if (sign != d->sign || fabsf(x)<35) { d->load_ms=0; d->has_load=false; d->spent=false; }
    d->sign=sign;
    if (fabsf(x)>=35 && -sign*change>=350 && load>=1280) {
        d->load_ms+=step;
        if (d->load_ms>=35) { d->has_load=true; d->last_load=ms; }
    } else d->load_ms=0;
    if (!d->spent && sign != -d->stroke_sign && (!d->has_hit || ms-d->last_hit>=280) &&
        d->has_load && ms-d->last_load<=100 && fabsf(x)>=75 && speed>=95) {
        d->spent=d->has_hit=d->pending=true;
        d->last_hit=ms; d->stroke_sign=sign; d->speed=0;
    }
    if (!d->pending) return false;
    if (speed>d->speed) { d->speed=speed; d->peak_y=y; d->peak_z=z; }
    if (d->speed<285 && ms-d->last_hit<40) return false;
    d->pending=false;
    out->power=fminf(1,d->speed/390);
    out->aim=fminf(1,fmaxf(-1,(d->peak_z+.35f*d->peak_y)/fmaxf(80,d->speed*.63f)));
    return true;
}

// HID keyboard usages for soft/normal/hard shots, then left/centre/right.
uint8_t stroke_usage(int player, stroke_t shot) {
    static const char keys[2][10]={"QWERTYFGH","UIOJKLBNM"};
    unsigned row=shot.power<.37f ? 0 : shot.power<.69f ? 1 : 2;
    unsigned col=shot.aim<-.34f ? 0 : shot.aim>.34f ? 2 : 1;
    return 4 + keys[player][row*3+col] - 'A';
}
