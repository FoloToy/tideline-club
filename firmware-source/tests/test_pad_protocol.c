#include <assert.h>
#include "pad_protocol.h"

int main(void) {
    pad_screen_writer_t w = {0};
    pad_screen_t published = {0};
    uint8_t title[] = {PAD_TITLE, 255, 'P', '1'};
    uint8_t value[] = {PAD_VALUE, 255, '2', ':', '1'};
    uint8_t hint[20] = {PAD_HINT, 255};
    memcpy(hint + 2, "等待对手发球", 18);
    assert(!pad_screen_write(&w, value, sizeof(value), &published));
    assert(!pad_screen_write(&w, title, sizeof(title), &published));
    assert(!pad_screen_write(&w, hint, sizeof(hint), &published));
    assert(!pad_screen_write(&w, value, sizeof(value), &published));
    assert(!pad_screen_write(&w, value, sizeof(value), &published));
    assert(published.line[0][0] == 0);
    assert(pad_screen_write(&w, hint, sizeof(hint), &published));
    assert(strcmp(published.line[2], "等待对手发球") == 0);
    assert(!pad_screen_write(&w, hint, sizeof(hint), &published));
    title[1] = 0;
    assert(!pad_screen_write(&w, title, 2, &published));
    assert(!pad_screen_write(&w, value, sizeof(value), &published));
    value[1] = 0;
    assert(!pad_screen_write(&w, value, sizeof(value), &published));
    assert(!pad_screen_write(&w, hint, 1, &published));
    assert(!pad_screen_write(&w, hint, 21, &published));
    assert(!pad_screen_write(&w, hint, sizeof(hint), &published));
    assert(strcmp(published.line[0], "P1") == 0);
    hint[1] = 0;
    assert(pad_screen_write(&w, hint, 2, &published));
    assert(!published.line[0][0] && !published.line[2][0]);
    return 0;
}
