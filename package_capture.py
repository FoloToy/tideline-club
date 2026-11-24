"""Create and verify the production partition ZIP from the verified IDF archive."""
from pathlib import Path, PurePosixPath
import hashlib, json, shlex, shutil, struct, sys
from zipfile import ZIP_DEFLATED, ZipFile

def sha(data):
    return hashlib.sha256(data).hexdigest()

def json_bytes(data):
    return (json.dumps(data, indent=2) + "\n").encode()

def main(archive, out):
    m = json.loads((archive / "manifest.json").read_text())
    version = m["app_descriptor"]["version"]
    assert version in {"1.1.0-capture.1", "1.1.1-motion.1", "1.2.0-duel.1"} and m["target"] == "esp32c3" and m["flash_size_bytes"] == 8*1024*1024
    name = f"Tideline-QMI8658A-{version}"
    full = (archive / "FoloToy-AI-Passport-full.bin").read_bytes()
    assert sha(full) == m["full_bin_sha256"] == archive.name
    lines = (archive/"flash_args").read_text().splitlines()
    flags = shlex.split(lines[0])
    settings = dict(zip((a.removeprefix("--") for a in flags[::2]), flags[1::2]))
    assert settings == {"flash_mode":"dio","flash_freq":"80m","flash_size":"8MB"}
    files, segments, flash = {}, [], {}
    offsets = {int(off,0): path for off,path in map(shlex.split,lines[1:])}
    assert len(offsets) == len(lines)-1 and offsets == {0:"bootloader/bootloader.bin",0x8000:"partition_table/partition-table.bin",0x10000:"FoloToy-AI-Passport.bin"}
    for addr, path in sorted(offsets.items()):
        assert m["image_offsets"][path] == addr
        data = (archive/path).read_bytes()
        assert sha(data)==m["files"][path]["sha256"] and len(data)==m["files"][path]["size"]
        flash[hex(addr)]=path
        segments.append(dict(path=path, offset=hex(addr), size=len(data), sha256=sha(data),
                             erase_start=hex(addr), erase_end_exclusive=hex((addr+len(data)+4095)&~4095)))
        files[path]=data
    files["flasher_args.json"]=json_bytes(dict(write_flash_args=flags,flash_settings=settings,flash_files=flash,
        extra_esptool_args=dict(chip="esp32c3",before="default_reset",after="hard_reset",stub=True)))
    files["firmware-manifest.json"]=json_bytes(dict(target="esp32c3",version=version, flash_size_bytes=0x800000,
        full_bin_sha256=sha(full),app_descriptor=m["app_descriptor"], segments=segments,
        preserve_ranges=[dict(name=n,start=hex(lo),end_exclusive=hex(hi)) for n,lo,hi in
                        [("nvs+phy",0x9000,0x10000),("cardid",0x356000,0x35a000),("motionlog",0x600000,0x800000)]]))
    files["SHA256SUMS"]="".join(f"{sha(v)}  {k}\n" for k,v in files.items()).encode()
    out.mkdir(parents=True,exist_ok=True)
    zpath=out/(name+"-partitions.zip")
    with ZipFile(zpath,"x",ZIP_DEFLATED) as z:
        for key,value in files.items(): z.writestr(key,value)
    with ZipFile(zpath) as z:
        assert z.testzip() is None and len(z.namelist())==len(set(z.namelist())) and set(z.namelist())==set(files)
        for f in z.namelist(): assert not PurePosixPath(f).is_absolute() and ".." not in PurePosixPath(f).parts
        for row in z.read("SHA256SUMS").decode().splitlines():
            digest,f=row.split("  ");assert sha(z.read(f))==digest
        args=json.loads(z.read("flasher_args.json"))
        verified=json.loads(z.read("firmware-manifest.json")); previous=0
        assert args["flash_settings"]==settings and args["extra_esptool_args"]["chip"]==verified["target"]
        table=z.read("partition_table/partition-table.bin")
        partitions={}
        for p in range(0,len(table),32):
            magic,typ,sub,a,size,label,_=struct.unpack_from("<HBBII16sI",table,p)
            if magic==0xebeb:
                assert table[p+16:p+32]==hashlib.md5(table[:p]).digest()
                break
            assert magic==0x50aa
            partitions[label.rstrip(b"\0").decode()]=(a,a+size)
        else: raise ValueError("missing partition checksum")
        assert partitions==dict(nvs=(0x9000,0xf000),phy_init=(0xf000,0x10000),factory=(0x10000,0x310000),cardid=(0x356000,0x35a000),motionlog=(0x600000,0x800000))
        for seg in verified["segments"]:
            a=int(seg["offset"],0); name2=args["flash_files"][hex(a)]; b=z.read(name2)
            end=(a+len(b)+4095)&~4095
            assert len(b)==seg["size"] and sha(b)==seg["sha256"] and b==full[a:a+len(b)]
            assert seg["path"]==name2 and a%4096==0 and previous<=a and end<=verified["flash_size_bytes"]
            assert a==int(seg["erase_start"],0) and end==int(seg["erase_end_exclusive"],0)
            for key,(lo,hi) in partitions.items():
                if key!="factory": assert end<=lo or hi<=a
            assert end<={0:0x8000,0x8000:0x9000,0x10000:partitions["factory"][1]}[a]
            previous=end
    dest=out/(name+"-full.bin")
    shutil.copyfile(archive/"FoloToy-AI-Passport-full.bin",dest)
    assert sha(dest.read_bytes())==verified["full_bin_sha256"]
    (out/"SHA256SUMS").write_text("".join(f"{sha(p.read_bytes())}  {p.name}\n" for p in (dest,zpath)))
    print((out/"SHA256SUMS").read_text(),end="")

if __name__=="__main__": main(*map(Path,sys.argv[1:]))
