#!/usr/bin/env python3
"""Serve only the self-contained game page on the Mac's local network."""
import argparse
import ipaddress
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def mac_lan_ip():
    # A VPN may own the default route. Prefer a physical interface with a LAN IP.
    def output(*args):
        return subprocess.run(args, capture_output=True, text=True, check=False).stdout
    route = re.search(r'interface:\s*(en\d+)', output('/sbin/route','-n','get','default'))
    devices = re.findall(r'Device: (en\d+)', output('/usr/sbin/networksetup','-listallhardwareports'))
    for dev in dict.fromkeys(([route[1]] if route else []) + devices):
        addr = output('/usr/sbin/ipconfig','getifaddr',dev).strip()
        if addr:
            return addr
    raise SystemExit('请将 Mac 和 iPad 接入同一局域网，然后重新打开。')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bind',type=ipaddress.IPv4Address)
    parser.add_argument('--port',type=int,default=0)
    args=parser.parse_args()
    page=Path(__file__).with_name('Tideline-Club.html').read_bytes()
    class Court(BaseHTTPRequestHandler):
        def do_GET(self):
            if urlsplit(self.path).path not in ('/', '/Tideline-Club.html'):
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(page)))
            self.end_headers()
            self.wfile.write(page)

    with ThreadingHTTPServer((str(args.bind or mac_lan_ip()),args.port),Court) as server:
        addr,port=server.server_address
        print(f'请在同一 Wi-Fi 的 iPad 上用 Safari 打开 http://{addr}:{port}/',flush=True)
        print('页面载入后可关闭此窗口。手柄直接在 iPad 的蓝牙设置中配对。',flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    main()
