import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from export_motion import decode, SLOT, HEADER

data = bytearray(Path(sys.argv[1]).read_bytes())
report = decode(data)
assert [g["hand"] for g in report["groups"]] == ["forehand", "backhand"]
assert [g["human_confirmed_swings"] for g in report["groups"]] == [5, 5]
assert report["incomplete_or_foreign_slots"] == [2]
g = report["groups"][0]
assert g["fresh_samples"] == 1 and g["samples"][0][4:7] == (-640, 0, 640)
data[2*SLOT + HEADER.size + 10] ^= 1
assert decode(data)["incomplete_or_foreign_slots"] == [2, 3]
data[HEADER.size-1] ^= 1
assert not decode(data)["groups"]
print("Raw log export, human labels and damaged header/body detection PASS")
