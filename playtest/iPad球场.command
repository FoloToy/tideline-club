#!/usr/bin/env python3
"""Local two-way relay. Mac Chrome supplies BLE; iPad Safari runs the game."""
import argparse
import json
import queue
import re
import secrets
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

def mac_lan_ip():
    def output(*args):
        return subprocess.run(args,capture_output=True,text=True).stdout
    route=re.search(r'interface:\s*(en\d+)',output('/sbin/route','-n','get','default'))
    devices=re.findall(r'Device: (en\d+)',output('/usr/sbin/networksetup','-listallhardwareports'))
    for dev in dict.fromkeys(([route[1]] if route else [])+devices):
        ip=output('/usr/sbin/ipconfig','getifaddr',dev).strip()
        if ip:return ip
    raise SystemExit("请先让 Mac 和 iPad 接入同一 Wi-Fi。")

class Session:
    def __init__(self):
        self.lock=threading.Lock()
        self.peers={}
        self.states={}
    def push(self,role,msg):
        peer=self.peers.get(role)
        if peer:
            try:peer[1].put_nowait(msg)
            except queue.Full:
                # Drop the slow stream; its replacement starts from fresh state.
                self.peers.pop(role)
                if role=='host':self.states.clear()
                self.push('court' if role=='host' else 'host',{'type':'offline'})
    def open(self,role,tab):
        q=queue.Queue(maxsize=64)
        with self.lock:
            self.peers[role]=(tab,q)
            if role=='host':
                self.states.clear()
                self.push('court',{'type':'offline'})
            else:
                for state in self.states.values():q.put_nowait(state)
                self.push('host',{'type':'resync'})
        return q
    def close(self,role,q):
        with self.lock:
            peer=self.peers.get(role)
            if peer and peer[1] is q:
                self.peers.pop(role)
                if role=='host':self.states.clear()
                self.push('court' if role=='host' else 'host',{'type':'offline'})
    def deliver(self,role,tab,event):
        with self.lock:
            peer=self.peers.get(role)
            if not peer or peer[0]!=tab:return False
            if role=='host' and event['type']=='state':self.states[event['side']]=event
            self.push('court' if role=='host' else 'host',event)
            return True

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bind');p.add_argument('--port',type=int,default=0)
    p.add_argument('--no-open',action='store_true');args=p.parse_args()
    interface=args.bind or mac_lan_ip()
    prefix='/'+secrets.token_urlsafe(18)+'/'
    game=Path(__file__).with_name('Tideline-Club.html').read_bytes()
    session=Session()
    class Court(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def route(self):
            path=urlsplit(self.path)
            if not path.path.startswith(prefix):return '', ''
            return path.path[len(prefix):],parse_qs(path.query).get('tab',[''])[0]
        def allowed(self,role):
            return role=='court' or (role=='host' and self.client_address[0]=='127.0.0.1')
        def do_GET(self):
            route,tab=self.route()
            if route in ('host','court') and self.allowed(route):
                data=game.replace(b'<html lang="zh-CN"',b'<html data-relay="'+route.encode()+b'" lang="zh-CN"',1)
                self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
                self.send_header('Referrer-Policy','no-referrer')
                self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
            role=route.split('/')[-1]
            if route!='events/'+role or not self.allowed(role) or not re.fullmatch('[a-f0-9]{24}',tab):
                self.send_error(404);return
            self.send_response(200);self.send_header('Content-Type','text/event-stream')
            self.send_header('Cache-Control','no-store');self.end_headers()
            q=session.open(role,tab)
            try:
                self.wfile.write(b'retry: 600\n\n');self.wfile.flush()
                while True:
                    with session.lock:
                        current=session.peers.get(role)
                    if current!=(tab,q):
                        if current:
                            self.wfile.write(b'event: replaced\ndata: {}\n\n');self.wfile.flush()
                        break
                    try:
                        event=q.get(timeout=1)
                        msg='data: '+json.dumps(event)+'\n\n'
                    except queue.Empty:msg=': heartbeat\n\n'
                    self.wfile.write(msg.encode());self.wfile.flush()
            except (OSError,TimeoutError):pass
            finally:session.close(role,q)
        def do_POST(self):
            route,tab=self.route();role=route.split('/')[-1]
            if route!='from/'+role or not self.allowed(role):self.send_error(404);return
            if self.headers.get('Origin')!='http://'+self.headers.get('Host',''):
                self.send_error(403);return
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=1200:raise ValueError
                event=json.loads(self.rfile.read(n))
                allowed=('state','stroke') if role=='host' else ('screen',)
                if not isinstance(event,dict) or event.get('type') not in allowed or event.get('side') not in (0,1):raise ValueError
                if event['type']=='screen' and not (isinstance(event.get('lines'),list) and len(event['lines'])==3 and
                    all(isinstance(s,str) and len(s)<=32 for s in event['lines'])):raise ValueError
            except (TypeError,ValueError):
                self.send_error(400);return
            if not session.deliver(role,tab,event):self.send_error(409);return
            self.send_response(204);self.end_headers()
    with ThreadingHTTPServer(('127.0.0.1',args.port),Court) as local:
        port=local.server_port
        host_url=f'http://127.0.0.1:{port}{prefix}host'
        lan=ThreadingHTTPServer((interface,port),Court) if interface!='127.0.0.1' else None
        if lan:threading.Thread(target=lan.serve_forever,daemon=True).start()
        print('Mac 蓝牙配对页  '+host_url,flush=True)
        print(f'iPad Safari 球场  http://{interface}:{port}{prefix}court',flush=True)
        print('比赛期间保持此窗口和 Mac Chrome 配对页开启。',flush=True)
        if not args.no_open:subprocess.run(['open','-a','Google Chrome',host_url],check=False)
        try:local.serve_forever()
        except KeyboardInterrupt:pass
        finally:
            if lan:lan.shutdown();lan.server_close()

if __name__=='__main__':main()
