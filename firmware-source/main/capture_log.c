#include "capture_log.h"
#include "esp_partition.h"
#include "esp_random.h"
#include "esp_rom_crc.h"
#include <stddef.h>
#include <string.h>

static const esp_partition_t *partition;
static uint32_t boot_id;
static unsigned next_slot, saved;

static bool blank(const uint8_t *data, size_t size) {
    for (size_t i = 0; i < size; ++i) if (data[i] != 0xff) return false;
    return true;
}

static bool header_valid(const capture_header_t *h, unsigned slot) {
    return memcmp(h->magic, "TLC1", 4) == 0 && h->version == 1 &&
        h->group == slot + 1 && h->header_bytes == sizeof(*h) &&
        h->frame_bytes == sizeof(capture_frame_t) && h->frames > 0 && h->frames <= CAP_MAX_FRAMES &&
        h->header_crc == esp_rom_crc32_le(0, (const uint8_t *)h, offsetof(capture_header_t, header_crc));
}

static bool slot_blank(unsigned slot) {
    uint8_t block[512];
    for (unsigned pos = 0; pos < CAP_SLOT_BYTES; pos += sizeof(block)) {
        if (esp_partition_read(partition, slot * CAP_SLOT_BYTES + pos, block, sizeof(block)) != ESP_OK ||
            !blank(block, sizeof(block))) return false;
    }
    return true;
}

void capture_log_init(void) {
    partition = esp_partition_find_first(ESP_PARTITION_TYPE_DATA, 0x40, "motionlog");
    boot_id = esp_random();
    saved = 0; next_slot = 0;
    if (!partition) return;
    const unsigned slots = partition->size / CAP_SLOT_BYTES;
    next_slot = slots;
    for (unsigned i = 0; i < slots; ++i) {
        capture_header_t h;
        if (esp_partition_read(partition, i * CAP_SLOT_BYTES, &h, sizeof(h)) != ESP_OK) continue;
        if (header_valid(&h, i)) saved++;
        else if (next_slot == slots && blank((const uint8_t *)&h, sizeof(h)) && slot_blank(i)) next_slot = i;
    }
}

unsigned capture_saved(void) { return saved; }
bool capture_has_room(void) { return partition && next_slot < partition->size / CAP_SLOT_BYTES; }

bool capture_save(unsigned hand, const capture_frame_t *frames, unsigned count, unsigned duration) {
    if (!capture_has_room() || !count || count > CAP_MAX_FRAMES ||
        (hand != CAP_FOREHAND && hand != CAP_BACKHAND)) return false;
    unsigned slot = next_slot;
    const size_t base = slot * CAP_SLOT_BYTES, length = count * sizeof(*frames);
    capture_header_t h = {
        .magic = {'T','L','C','1'}, .version = 1, .header_bytes = sizeof(h),
        .group = slot + 1, .boot_id = boot_id, .hand = hand, .expected_swings = 5,
        .period_ms = CAP_PERIOD_MS, .frame_bytes = sizeof(*frames), .frames = count,
        .duration_ms = duration, .payload_crc = esp_rom_crc32_le(0, (const uint8_t *)frames, length),
    };
    h.header_crc = esp_rom_crc32_le(0, (const uint8_t *)&h, offsetof(capture_header_t, header_crc));
    /* Header is the commit marker. Never erase, recycle, or append to a partial slot. */
    bool ok = esp_partition_write(partition, base + sizeof(h), frames, length) == ESP_OK;
    uint32_t check = 0;
    uint8_t block[512];
    for (size_t pos = 0; ok && pos < length; pos += sizeof(block)) {
        size_t n = length - pos < sizeof(block) ? length - pos : sizeof(block);
        ok = esp_partition_read(partition, base + sizeof(h) + pos, block, n) == ESP_OK;
        if (ok) check = esp_rom_crc32_le(check, block, n);
    }
    capture_header_t committed;
    ok = ok && check == h.payload_crc && esp_partition_write(partition, base, &h, sizeof(h)) == ESP_OK &&
         esp_partition_read(partition, base, &committed, sizeof(committed)) == ESP_OK &&
         memcmp(&committed, &h, sizeof(h)) == 0;
    if (ok) saved++;
    do { next_slot++; } while (capture_has_room() && !slot_blank(next_slot));
    return ok;
}
