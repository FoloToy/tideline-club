#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>

enum { PAD_VERSION=1, PAD_CLAIM=1, PAD_SWING=2, PAD_BUTTON=3, PAD_TITLE=16, PAD_VALUE, PAD_HINT };
typedef struct { char line[3][19]; } pad_screen_t;
typedef struct { pad_screen_t draft; uint8_t sequence, next; } pad_screen_writer_t;

/* One ATT value fits the minimum MTU. Only publish three complete, in-order
 * fields from the same revision. A fresh title supersedes a partial update. */
static inline bool pad_screen_write(pad_screen_writer_t *w, const uint8_t *p,
                                    size_t n, pad_screen_t *published) {
    if (n < 2 || n > 20 || p[0]<PAD_TITLE || p[0]>PAD_HINT) return false;
    uint8_t field = p[0] - PAD_TITLE;
    if (field == 0) { w->sequence = p[1]; w->next = 0; }
    if (w->sequence != p[1] || w->next != field) return false;
    memcpy(w->draft.line[field], p+2, n-2);
    w->draft.line[field][n-2]='\0';
    w->next++;
    if (w->next < 3) return false;
    *published=w->draft; return true;
}
