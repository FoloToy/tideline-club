#!/usr/bin/env python3
"""Export saved TLC1 motion groups from a partition dump or a connected ESP32-C3."""
import argparse
import hashlib
import json
import struct
import subprocess
import sys
import zlib
from datetime import datetime
from pathlib import Path

SLOT = 0x8000
CAPACITY = 0x200000
HEADER = struct.Struct("<4sHHIIHHHHIIII")
FRAME = struct.Struct("<IhhhhhhHH")
PART = struct.Struct("<HBBII16sI")


def decode(data):
    if len(data) != CAPACITY:
        raise ValueError("Incomplete motionlog partition")
    groups, incomplete = [], []
    blank = b"\xff" * SLOT
    for offset in range(0, len(data), SLOT):
        slot = data[offset:offset + SLOT]
        number = offset // SLOT + 1
        if slot == blank:
            continue
        magic, version, size, group, boot, hand, expected, period, frame_size, count, duration, crc, hdr_crc = HEADER.unpack_from(slot)
        payload = slot[size:size + count * frame_size]
        if not (magic == b"TLC1" and version == 1 and size == HEADER.size and group == number
                and hand in (1, 2) and expected == 5 and period == 20 and frame_size == FRAME.size
                and 0 < count <= 1504 and len(payload) == count * FRAME.size
                and hdr_crc == zlib.crc32(slot[:size-4]) and crc == zlib.crc32(payload)):
            incomplete.append(number)
            continue
        frames = list(FRAME.iter_unpack(payload))
        groups.append(dict(group=group, boot_id=boot, hand={1:"forehand", 2:"backhand"}[hand],
                           human_confirmed_swings=expected, duration_ms=duration, nominal_period_ms=period,
                           fresh_samples=sum(row[-2] & 1 for row in frames), samples=frames))
    return dict(format="tideline-motion-log-v1", fields=["ms","ax","ay","az","gx","gy","gz","flags","sequence"],
                axes="native sensor axes; old game uses gyro Y, X, -Z in degrees/s",
                accel_lsb_per_g=8192, gyro_lsb_per_dps=64,
                flags="bit 0: fresh IMU sample; bits 1, 2, 3: up, down, OK physical presses",
                groups=groups, incomplete_or_foreign_slots=incomplete,
                partition_sha256=hashlib.sha256(data).hexdigest())


def usb(port, destination):
    def read(address, size, path):
        subprocess.run([sys.executable, "-m", "esptool", "--chip", "esp32c3", "--port", port,
                        "--baud", "921600", "--after", "hard_reset", "read_flash", "--no-progress",
                        hex(address), hex(size), str(path)], check=True)
        return path.read_bytes()
    table = read(0x8000, 0xc00, destination / "partition-table.bin")
    entries = []
    for offset in range(0, len(table), PART.size):
        magic, typ, sub, addr, size, label, _ = PART.unpack_from(table, offset)
        if magic == 0xebeb:
            if table[offset+16:offset+32] != hashlib.md5(table[:offset]).digest():
                raise ValueError("Partition table checksum mismatch")
            break
        if magic != 0x50aa:
            raise ValueError("Unrecognized partition table")
        if (typ, sub, label.rstrip(b"\0")) == (1, 0x40, b"motionlog"):
            entries.append((addr, size))
    else:
        raise ValueError("Missing partition table checksum")
    if entries != [(0x600000, CAPACITY)]:
        raise ValueError("This device does not have the expected motionlog partition")
    return read(*entries[0], destination / "motionlog.bin")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--port", help="USB serial port; finish and save the group before connecting")
    source.add_argument("--image", type=Path, help="existing raw 2 MiB motionlog partition")
    parser.add_argument("--out", type=Path, help="new output directory")
    opts = parser.parse_args()
    dest = opts.out or Path.cwd() / datetime.now().strftime("Tideline-logs-%Y%m%d-%H%M%S-%f")
    dest.mkdir(parents=True, exist_ok=False)
    data = opts.image.read_bytes() if opts.image else usb(opts.port, dest)
    report = decode(data)
    out = dest / "motion.json"
    out.write_text(json.dumps(report, separators=(",", ":")) + "\n")
    print(f"{out}: {len(report['groups'])} confirmed groups; partial/foreign slots {report['incomplete_or_foreign_slots']}")


if __name__ == "__main__":
    main()
