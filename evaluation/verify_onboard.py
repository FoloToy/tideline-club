"""Replay all recorded sensor frames through the firmware's actual C detector."""
import json
import subprocess
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
main = here.parent / 'firmware-source/main'
with tempfile.TemporaryDirectory() as td:
    runner = Path(td) / 'replay'
    subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-I',main,here/'stroke_replay.c',main/'stroke.c','-lm','-o',runner],check=True)
    for split in ('reference','validation'):
        frozen = json.loads((here/(split+'-cold.json')).read_text())
        for g, expected in zip(json.loads((here/(split+'.json')).read_text()),frozen,strict=True):
            samples=''.join(' '.join(map(str,row[:8]))+'\n' for row in g['samples'])
            result=subprocess.run([runner],input=samples,text=True,capture_output=True,check=True)
            rows=[line.split() for line in result.stdout.splitlines()]
            times=[int(row[0])/1000 for row in rows]
            assert times == expected['events'], (g['id'],times,expected['events'])
            assert len(times)==5 and all(abs(a-b)<=.32 for a,b in zip(times,g['peaks'],strict=True))
            for _,p1,p2,speed,aim in rows:
                assert 95 <= int(speed) <= 2000 and 0 <= int(aim) <= 254
                assert 'QWERTYFGH'.index(p1)=='UIOJKLBNM'.index(p2)
            speeds = [int(row[3]) for row in rows]
            print(f"Group {g['id']}: 5/5, no extra events, times match the previous detector: {times}; swing speed {min(speeds)}–{max(speeds)} °/s")
