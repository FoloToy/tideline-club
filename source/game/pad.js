/* AI Passport gamepad v1. All writes fit an ATT MTU of 23 bytes. */
(() => {
  "use strict";
  const uuid = n => "97c1000"+n+"-46f9-4b71-b6df-0c6cde4117a0";
  const encoder = new TextEncoder();
  function fieldBytes(text) {
    const bytes=[];
    for (const letter of text) {
      const next=encoder.encode(letter);
      if (bytes.length+next.length>18) break;
      bytes.push(...next);
    }
    return bytes;
  }
  const powerFromSpeed = dps => Math.max(.12, Math.min(1,.20+(dps-95)/690));
  class PadLink {
    constructor(slot, onState, onStroke, isUsed) {
      Object.assign(this,{slot,onState,onStroke,isUsed});
      this.generation=0; this.phase="idle"; this.name=""; this.flags=0;
      this.message="待配对"; this.revision=0;
    }
    get ready() { return this.phase==="paired" && !(this.flags&4) && (!(this.flags&1)||!!(this.flags&2)); }
    changed(phase,message) {
      this.phase=phase; this.message=message; this.onState(this);
    }
    async pair() {
      if (this.phase==="connecting" || this.phase==="paired") return;
      if (!navigator.bluetooth || !window.isSecureContext) {
        this.changed("error","请在电脑 Chrome / Edge 打开此文件；iPad 请用随包的球场启动器。"); return;
      }
      const gen=++this.generation;
      this.changed("connecting","请在蓝牙列表中选择手柄");
      try {
        const device=await navigator.bluetooth.requestDevice({filters:[{services:[uuid(1)]}]});
        if (gen!==this.generation) return;
        if (this.isUsed(device.id)) throw Error("这只手柄已分配给另一位玩家，请选第二只。");
        this.device=device; this.name=device.name || "AI Passport";
        this.lost=()=>{if(gen===this.generation)this.close("手柄已断开，请重新连接");};
        device.addEventListener("gattserverdisconnected",this.lost);
        this.changed("connecting","正在配对；如系统弹窗，请点「配对」");
        this.deadline=setTimeout(()=>{if(gen===this.generation)this.close("连接超时，请确认手柄已开机并重试");},30000);
        const server=await device.gatt.connect();
        if(gen!==this.generation) { if(!this.device || this.device!==device)device.gatt.disconnect(); return; }
        const service=await server.getPrimaryService(uuid(1));
        const input=await service.getCharacteristic(uuid(2));
        const output=await service.getCharacteristic(uuid(3));
        if(gen!==this.generation)return;
        this.out=output; this.input=input;
        this.received=e=>{if(gen===this.generation)this.packet(e.target.value);};
        input.addEventListener("characteristicvaluechanged",this.received);
        await input.startNotifications();
        if(gen!==this.generation)return;
        this.queue=Promise.resolve(); this.lastAck=performance.now(); this.lastPing=0;
        this.ping();
        this.timer=setInterval(()=>{
          if(performance.now()-this.lastAck>8500) {this.close("手柄响应超时，请重新连接");return;}
          this.ping();
        },2500);
      } catch(e) {
        if(gen===this.generation)this.close(e.name==="NotFoundError"?"尚未选择手柄，可再次配对":e.message);
      }
    }
    write(data) {
      const gen=this.generation, output=this.out;
      if(!output)return Promise.resolve();
      this.queue=this.queue.then(async()=>{
        if(gen===this.generation)await output.writeValueWithResponse(Uint8Array.from(data));
      }).catch(()=>{if(gen===this.generation)this.close("写入手柄失败，请重新连接");});
      return this.queue;
    }
    ping() { return this.write([1,1,this.slot+1]); }
    packet(v) {
      if(v.byteLength===4 && v.getUint8(0)===1 && v.getUint8(1)===1 && v.getUint8(2)===this.slot+1) {
        clearTimeout(this.deadline); this.lastAck=performance.now();
        const flags=v.getUint8(3), first=this.phase!=="paired";
        if(first || this.flags!==flags) {
          this.flags=flags;
          this.changed("paired",flags&4?"采集中，请长按确认退出":!(flags&1)?"已配对 · 按键模式":flags&2?"已配对 · 体感就绪":"已配对 · 请平放手柄");
        }
      } else if(this.ready && v.byteLength===4 && v.getUint8(0)===2) {
        const speed=v.getUint16(1,true);
        this.onStroke(this.slot,powerFromSpeed(speed),Math.max(-1,Math.min(1,(v.getUint8(3)-127)/127)),speed,false);
      } else if(this.ready && v.byteLength===2 && v.getUint8(0)===3 && v.getUint8(1)<3) {
        const key=v.getUint8(1); this.onStroke(this.slot,key===2?.70:.55,[-.95,.95,0][key],0,true);
      }
    }
    display(lines) {
      if(this.phase!=="paired")return;
      const key=JSON.stringify(lines);
      if(this.screenKey===key)return;
      this.screenKey=key; this.pending=lines;
      if(this.drawing)return;
      this.drawing=true;
      const gen=this.generation;
      const drain=async()=>{
        while(this.pending && gen===this.generation) {
          const lines=this.pending; this.pending=null;
          const revision=(++this.revision)&255;
          for(let i=0;i<3 && gen===this.generation;i++)await this.write([16+i,revision,...fieldBytes(lines[i])]);
        }
        if(gen===this.generation)this.drawing=false;
      };
      drain();
    }
    close(message="待配对") {
      ++this.generation; clearInterval(this.timer); clearTimeout(this.deadline);
      if(this.input)this.input.removeEventListener("characteristicvaluechanged",this.received);
      if(this.device) {
        this.device.removeEventListener("gattserverdisconnected",this.lost);
        if(this.device.gatt.connected)this.device.gatt.disconnect();
      }
      this.input=this.out=this.device=this.pending=null; this.screenKey=""; this.drawing=false;
      this.flags=0; this.name="";
      this.changed("idle",message);
    }
  }
  window.PassportPad=PadLink;
})();
