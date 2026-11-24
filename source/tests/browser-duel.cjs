const assert = require("node:assert/strict");
const {pathToFileURL} = require("node:url");
const {resolve, dirname, join} = require("node:path");
const {spawn} = require("node:child_process");
const {createInterface} = require("node:readline");
const {chromium} = require("playwright");

// Only the browser's Bluetooth boundary is replaced. The bundled game's chooser,
// session, packet decoder, display writer, physics, scene and UI run unmodified.
function mockBluetooth() {
  const uuid = n => "97c1000"+n+"-46f9-4b71-b6df-0c6cde4117a0";
  class Device extends EventTarget {
    constructor(id) {
      super();this.id=id;this.name="Tideline-"+id;this.flags=3;this.frames=[];this.version=1;
      this.input=new EventTarget();
      this.input.startNotifications=async()=>this.input;
      this.out={writeValueWithResponse:async bytes=>{
        if(!this.gatt.connected || bytes.length>20)throw Error("invalid GATT write");
        if(bytes[0]===1) {
          this.slot=bytes[2];this.ack();return;
        }
        const field=bytes[0]-16,revision=bytes[1];
        if(field===0)this.frame={revision,lines:[]};
        if(!this.frame || this.frame.revision!==revision || field!==this.frame.lines.length)throw Error("torn display");
        this.frame.lines.push(new TextDecoder("utf-8",{fatal:true}).decode(bytes.slice(2)));
        if(field===2)this.frames.push(this.frame.lines);
      }};
      this.gatt={connected:false,connect:async()=>{
        this.gatt.connected=true;
        return {getPrimaryService:async id=>{
          if(id!==uuid(1))throw Error("service mismatch");
          return {getCharacteristic:async id=>id===uuid(2)?this.input:id===uuid(3)?this.out:Promise.reject(Error("characteristic mismatch"))};
        }};
      },disconnect:()=>{
        this.gatt.connected=false;this.dispatchEvent(new Event("gattserverdisconnected"));
      }};
    }
    notify(bytes) {
      this.input.value=new DataView(Uint8Array.from(bytes).buffer);
      this.input.dispatchEvent(new Event("characteristicvaluechanged"));
    }
    ack(){this.notify([1,this.version,this.slot,this.flags]);}
    swing(speed,aim=127){this.notify([2,speed&255,speed>>8,aim]);}
  }
  window.rig={selected:"A001",devices:{A001:new Device("A001"),B002:new Device("B002")}};
  Object.defineProperty(navigator,"bluetooth",{value:{requestDevice:async options=>{
    if(options.filters[0].services[0]!==uuid(1))throw Error("wrong filter");
    const dev=rig.devices[rig.selected];
    if(!dev)throw new DOMException("cancelled","NotFoundError");
    return dev;
  }}});
}
async function run() {
  const html=resolve(process.argv[2]||"playtest/Tideline-Club.html");
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",args:["--enable-unsafe-swiftshader"]});
  const errors=[];
  async function newPage() {
    const p=await browser.newPage({viewport:{width:1100,height:680}});
    p.on("pageerror",e=>errors.push(e.message));
    await p.addInitScript(mockBluetooth);
    return p;
  }
  let bridge;
  try {
    const page=await newPage();
    await page.goto(pathToFileURL(html).href);
    const play=page.locator("#play");
    await page.keyboard.press("7");await page.keyboard.press("Space");assert.ok(await play.isDisabled());
    await page.evaluate(()=>rig.selected=null);await page.locator("#link0").click();
    await page.waitForFunction(()=>document.querySelector("#paddle-0").textContent.includes("尚未选择"));
    await page.evaluate(()=>{rig.selected="A001";rig.devices.A001.version=9;});
    await page.locator("#link0").click();
    await page.waitForFunction(()=>rig.devices.A001.slot===1);assert.ok(await play.isDisabled());
    await page.evaluate(()=>{const d=rig.devices.A001;d.version=1;d.flags=1;d.ack();});
    await page.waitForFunction(()=>document.querySelector("#paddle-0").textContent.includes("平放"));
    assert.ok(await play.isDisabled());
    await page.evaluate(()=>{const d=rig.devices.A001;d.flags=3;d.ack();});
    await page.waitForFunction(()=>!document.querySelector("#play").disabled);
    await page.locator('[data-mode="duel"]').click();assert.ok(await play.isDisabled());
    await page.locator("#link1").click();
    await page.waitForFunction(()=>document.querySelector("#paddle-1").textContent.includes("另一位玩家"));
    await page.evaluate(()=>rig.selected="B002");await page.locator("#link1").click();
    await page.waitForFunction(()=>!document.querySelector("#play").disabled);
    await play.click();
    await page.waitForFunction(()=>rig.devices.B002.frames.at(-1)?.[2]==="等待对手发球");
    assert.ok(await page.locator("#split-hud").isVisible());
    await page.evaluate(()=>rig.devices.B002.swing(500));assert.equal(await page.locator("#cue").textContent(),"P1发球");
    await page.evaluate(()=>rig.devices.A001.swing(180));
    await page.waitForFunction(()=>document.querySelector("#side1-cue").textContent==="现在挥拍");
    await page.evaluate(()=>rig.devices.B002.swing(620,210));
    await page.waitForFunction(()=>document.querySelector("#rally").textContent.includes("2 拍"));
    assert.match(await page.locator("#side1-power").textContent(),/620/);
    if(process.env.SPLIT_SCREENSHOT)await page.screenshot({path:process.env.SPLIT_SCREENSHOT,type:"jpeg",quality:88});
    await page.evaluate(()=>rig.devices.A001.gatt.disconnect());
    await page.waitForFunction(()=>document.querySelector("#resume")?.disabled);
    assert.ok(await page.locator("#sheet").isVisible());
    await page.evaluate(()=>rig.selected="A001");await page.locator("#relink").click();
    await page.waitForFunction(()=>!document.querySelector("#resume").disabled);await page.locator("#resume").click();
    await page.waitForFunction(()=>document.querySelector("#cpu").textContent==="1");
    while(await page.locator("#cpu").textContent()!=="7") {
      await page.waitForFunction(()=>document.querySelector("#cue").textContent==="P2发球");
      await page.evaluate(()=>rig.devices.B002.swing(310));
      await page.waitForFunction(()=>document.querySelector("#cue").textContent==="P2得分");
    }
    await page.waitForFunction(()=>rig.devices.A001.frames.at(-1)?.[0]==="P1 你输了" && rig.devices.B002.frames.at(-1)?.[0]==="P2 你赢了");
    assert.deepEqual(await page.evaluate(()=>rig.devices.B002.frames.at(-1)),["P2 你赢了","7 : 0","比赛结束"]);
    await page.locator("#exit").click();await page.locator('[data-mode="solo"]').click();
    await play.click();await page.waitForFunction(()=>document.querySelector("#cue").textContent==="你发球");
    await page.evaluate(()=>rig.devices.A001.notify([3,2]));
    await page.waitForFunction(()=>document.querySelector("#rally").textContent.includes("1 拍"));
    assert.ok(await page.locator("#split-hud").isHidden());await page.close();
    console.log("Desktop: pairing gate, wrong version, calibration, distinct P1/P2, speeds, split court, reconnection, both LCD results and solo button passed.");

    bridge=spawn(process.env.PYTHON||"python3",[join(dirname(html),"iPad球场.command"),"--bind","127.0.0.1","--no-open"],{stdio:["ignore","pipe","inherit"]});
    const lines=createInterface({input:bridge.stdout});
    const urls=await new Promise((accept,reject)=>{
      const found=[];
      const timeout=setTimeout(()=>reject(Error("No bridge addresses")),10000);
      lines.on("line",line=>{const u=line.match(/http:\/\/\S+/);if(u)found.push(u[0]);if(found.length===2){clearTimeout(timeout);accept(found.slice());}});
      bridge.once("error",reject);
    });
    const host=await newPage(), court=await newPage();
    await host.goto(urls[0]);await court.goto(urls[1]);
    await host.locator("#link0").click();
    await court.waitForFunction(()=>!document.querySelector("#play").disabled);
    await court.locator("#play").click();
    await host.waitForFunction(()=>rig.devices.A001.frames.at(-1)?.[2]==="轻挥发球");
    await host.evaluate(()=>rig.devices.A001.swing(395,200));
    await court.waitForFunction(()=>document.querySelector("#rally").textContent.includes("1 拍"));
    await host.waitForFunction(()=>rig.devices.A001.frames.some(f=>f[2]==="对手接球"));
    await host.close();
    await court.waitForFunction(()=>document.querySelector("#resume")?.disabled);
    assert.deepEqual(errors,[]);
    console.log("Tablet relay: two browser sessions, real local HTTP/SSE, pairing, swing, reverse LCD frames and host-loss pause passed.");
  } finally {
    if(bridge)bridge.kill();await browser.close();
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
