(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const sheet = $("sheet"), content = $("sheet-content");
  const keys = new Set();
  function updateText(id,value) {
    const node = $(id), text = String(value);
    if (node.textContent !== text) node.textContent = text;
  }
  let level = "shore", match, arena, active = false, paused = false, sound = true;
  let raf = 0, previous = 0, accumulator = 0, toast = "", toastUntil = 0;
  let audio, duel = false;
  const relay=window.TidelineRelay;
  const host=relay?.role==="host", remote=relay?.role==="court";
  const stats=[0,1].map(()=>({swings:0,buttons:0,speed:0}));
  class RemotePad {
    constructor(slot) { this.slot=slot; this.reset(); }
    reset() { this.phase="idle"; this.message="等待 Mac 配对"; this.ready=false; this.name=""; this.screenKey=""; }
    display(lines) {
      const key=JSON.stringify(lines);
      if(this.phase==="paired" && this.screenKey!==key) {
        this.screenKey=key;relay.send({type:"screen",side:this.slot,lines});
      }
    }
  }
  const pads=[0,1].map(i=>remote ? new RemotePad(i) : new PassportPad(i,onPadState,onPadStroke,
    id=>pads.some((pad,side)=>side!==i && pad.device?.id===id)));
  const canPlay=()=>pads[0].ready && (!duel || pads[1].ready);
  function playerName(side) { return duel ? (side ? "P2" : "P1") : (side ? "电脑" : "你"); }
  const labels = {shore:"入门",tide:"进阶",swell:"挑战"};
  function ring(kind) {
    if (!sound || !audio || audio.state !== "running") return;
    const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
    const f = kind === "point" ? 520 : kind === "扣杀" ? 840 : 650;
    osc.type = kind === "point" ? "sine" : "triangle";
    osc.frequency.setValueAtTime(f,t); osc.frequency.exponentialRampToValueAtTime(kind === "point" ? 780 : 190,t+.10);
    gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(.09,t+.006);
    gain.gain.exponentialRampToValueAtTime(.0001,t+.15); osc.connect(gain); gain.connect(audio.destination);
    osc.start(t); osc.stop(t+.16);
  }
  function enableAudio() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!audio && Context) audio = new Context();
      if (audio && sound && audio.state !== "running") audio.resume().catch(() => {});
    } catch {}
  }
  function modal(html) {
    content.innerHTML = html;
    if (!sheet.open) sheet.showModal();
  }
  function say(text, seconds = .68) { toast = text; toastUntil = (match?.clock || 0) + seconds; }
  function stroke(power, aim, side=0) {
    if (active && !paused) match.swing(power,aim,side);
  }
  function screenFor(side) {
    const who="P"+(side+1);
    if (!active || !match) {
      return [who+" 已配对","潮汐羽球",pads[side].ready ? "在球场点开始" : "平放手柄"];
    }
    const score=match.score[side]+" : "+match.score[1-side];
    if (!duel && side===1)return [who+" 已配对","潮汐羽球","等待比赛"];
    if (match.phase==="over")return [who+" "+(match.score[side]===7?"你赢了":"你输了"),score,"比赛结束"];
    if (paused)return [who+" 暂停",score,"等待继续"];
    if (match.phase==="point")return [who+" "+(match.server===side?"你得分":"对手得分"),score,["轻挥吊前场","快挥打后场","高点能扣杀"][(match.score[0]+match.score[1])%3]];
    if (match.phase==="serve")return [who+" 潮汐羽球",score,match.server===side?"轻挥发球":"等待对手发球"];
    return [who+" 潮汐羽球",score,match.flight.side===side?"对手接球":match.ready?"现在挥拍":"准备接球"];
  }
  function syncScreens() {
    if (host)return;
    pads.forEach((pad,side)=>{if(pad.phase==="paired")pad.display(screenFor(side));});
  }
  function postState(pad) {
    relay.send({type:"state",side:pad.slot,phase:pad.phase,name:pad.name,message:pad.message,ready:pad.ready});
  }
  function refreshInputs() {
    const needed=duel?2:1;
    $("slot1").hidden=!duel && !host;
    for(const [side,pad] of pads.entries()) {
      const badge=$("slot"+side),button=$("link"+side), data=stats[side];
      badge.classList.toggle("ready",pad.ready);
      updateText("paddle-"+side,pad.message);
      updateText("detail"+side,pad.name ? pad.name+" · 挥拍 "+data.swings+" 次"+(data.speed?" · "+data.speed+" °/s":"")+(data.buttons?" · 按键 "+data.buttons+" 次":"") : side?"第二只手柄":"第一只手柄");
      button.disabled=remote;
      button.textContent=remote?"在 Mac 配对":pad.phase==="paired"?"断开":pad.phase==="connecting"?"取消":"配对 P"+(side+1);
    }
    $("play").disabled=!canPlay() || host;
    const count=pads.slice(0,needed).filter(p=>p.ready).length;
    updateText("input-status",canPlay()? (duel?"两只手柄已就绪":"P1 手柄已就绪") : "已就绪 "+count+" / "+needed);
    $("setup-jump").hidden=canPlay();
    if($("resume"))$("resume").disabled=!canPlay();
    if($("relink")) {
      const missing=pads.slice(0,needed).find(p=>!p.ready);
      $("relink").hidden=!missing || remote;
      if(missing) $("relink").textContent=missing.phase==="connecting"?"正在配对…":"连接 P"+(missing.slot+1);
    }
  }
  function onPadState(pad) {
    if(pad.phase!=="paired")stats[pad.slot]={swings:0,buttons:0,speed:0};
    if(host) {
      postState(pad);
      if(pad.phase!=="paired")pad.bridgeActive=false;
      if(pad.phase==="paired" && !pad.bridgeActive){pad.bridgeActive=true;pad.display(["P"+(pad.slot+1)+" 已配对","iPad 球场","等待网页"]);}
    }
    if(active && !canPlay() && !paused && match.phase!=="over")pause("手柄未就绪");
    refreshInputs();syncScreens();
  }
  function onPadStroke(side,power,aim,speed,button) {
    const data=stats[side];
    if(button)data.buttons++;else {data.swings++;data.speed=speed;}
    if(host)relay.send({type:"stroke",side,power,aim,speed,button});
    else if(pads[side].ready)stroke(power,aim,side);
    refreshInputs();
  }
  function selectPad(side) {
    const pad=pads[side];
    if(remote)return;
    if(pad.phase==="paired" || pad.phase==="connecting")pad.close();
    else pad.pair();
  }
  [0,1].forEach(i=>$("link"+i).onclick=()=>selectPad(i));
  $("setup-jump").onclick=()=>{ $("pairing").scrollIntoView({block:"center"}); if(!remote)$("link"+(pads[0].ready?1:0)).focus({preventScroll:true}); };
  function showInfo(id) { modal($(id).innerHTML); }
  if(host) {
    document.body.classList.add("bridge-host");
    updateText("pair-heading","为 iPad 配对手柄");
    $("platform-help").hidden=false;
    updateText("platform-help","在此配对 P1，双人时再配对 P2。保持此页开启，在 iPad 上打开启动窗口里的球场地址。");
  } else if(remote || !navigator.bluetooth || !window.isSecureContext) {
    $("platform-help").hidden=false;
    updateText("platform-help",remote?"在 Mac 蓝牙配对页连接手柄，此处会自动显示就绪状态。":"电脑请用 Chrome / Edge 打开离线文件。iPad Safari 请在同网 Mac 双击「iPad球场.command」。");
  }
  if(relay)relay.listen(e=>{
    if(host) {
      if(e.type==="open" || e.type==="resync")pads.forEach(postState);
      if(e.type==="screen")pads[e.side]?.display(e.lines);
      if(e.type==="offline")pads.forEach((p,i)=>p.display(["P"+(i+1)+" 已配对","iPad 球场","等待网页"]));
    } else {
      if(e.type==="offline" || e.type==="open") {pads.forEach(p=>p.reset());pads.forEach(onPadState);}
      const p=pads[e.side];
      if(e.type==="state" && p) {
        p.phase=e.phase;p.message=e.message;p.name=e.name;p.ready=e.ready;
        if(p.phase!=="paired")p.screenKey="";
        onPadState(p);
      }
      if(e.type==="stroke" && p?.ready)onPadStroke(e.side,e.power,e.aim,e.speed,e.button);
    }
  });
  refreshInputs();
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    duel = b.dataset.mode==="duel";
    document.querySelectorAll("[data-mode]").forEach(o => o.setAttribute("aria-pressed",String(o===b)));
    $("difficulty").hidden = duel; refreshInputs(); syncScreens();
    updateText("mode-name",duel?"双人对战":"人机对战");
  });
  document.querySelectorAll("[data-dialog]").forEach(b => b.onclick = () => showInfo(b.dataset.dialog));
  document.querySelectorAll("[data-level]").forEach(b => b.onclick = () => {
    level = b.dataset.level;
    document.querySelectorAll("[data-level]").forEach(o => o.setAttribute("aria-pressed",String(o===b)));
  });
  function closeSheet() { sheet.close(); }
  $("close").onclick = () => {
    if (active && match.phase === "over") { lobby(); return; }
    closeSheet(); if (paused) resume();
  };
  sheet.addEventListener("cancel", e => {
    e.preventDefault();
    if (active && match.phase === "over") lobby();
    else if (paused) resume(); else closeSheet();
  });
  function lobby() {
    cancelAnimationFrame(raf); raf=0; active = false; paused = false; keys.clear();
    if (sheet.open) closeSheet(); syncScreens(); $("court").hidden = true; $("lobby").hidden = false; $("play").focus();
  }
  function start() {
    if(!canPlay() || host){lobby(); refreshInputs(); return;}
    $("court").classList.toggle("duel",duel); $("split-hud").hidden=!duel;
    if (sheet.open) closeSheet();
    enableAudio(); keys.clear();
    match = new TidelineMatch(duel ? "shore" : level, Math.random, duel);
    updateText("near-label",playerName(0)); updateText("far-label",playerName(1)); active = true; paused = false; toast = ""; toastUntil = 0;
    $("lobby").hidden = true; $("court").hidden = false;
    try {
      if (!arena) arena = createArena($("world"));
      arena.resize();
    } catch (e) {
      console.error(e); lobby();
      modal("<h2>无法启动 3D 球场</h2><p>请使用支持 WebGL 的浏览器，并在浏览器设置中启用图形加速，然后重新打开游戏。</p>");
      return;
    }
    accumulator=0; previous=performance.now(); cancelAnimationFrame(raf); raf=requestAnimationFrame(frame);
    $("pause").focus({preventScroll:true});
  }
  function pause(title="比赛暂停") {
    if (!active || paused || match.phase === "over") return;
    paused = true; match.buffer = null; keys.clear(); cancelAnimationFrame(raf);
    modal('<h2>'+title+'</h2><p>比分与来球位置已保留。</p><div class="dialog-actions"><button id="resume">继续比赛</button><button id="restart">重新开局</button><button id="back">返回专区</button></div>');
    const relink=document.createElement("button"); relink.id="relink";
    $("resume").after(relink);
    relink.onclick=()=>{const p=pads.slice(0,duel?2:1).find(p=>!p.ready);if(p && p.phase!=="connecting")p.pair();};
    refreshInputs();syncScreens();
    $("resume").onclick=resume; $("restart").onclick=start; $("back").onclick=lobby;
  }
  function resume() {
    if (!active) return;
    if(!canPlay()){if(!sheet.open){paused=false;pause("手柄未就绪");}return;}
    closeSheet(); paused=false; previous=performance.now(); accumulator=0; enableAudio();
    cancelAnimationFrame(raf); raf=requestAnimationFrame(frame);
  }
  function finish() {
    syncScreens();
    const won = match.score[0] === 7;
    modal('<h2>'+(playerName(won?0:1)+"赢下了本场")+'</h2><div class="result-score">'+match.score[0]+' <span>∶</span> '+match.score[1]+'</div><p>'+(duel?'双人对战':labels[level]+'对手')+' · 最长回合 '+match.best+' 拍 · 成功接球 '+match.hits+' 次</p><div class="dialog-actions"><button id="again">再来一局</button><button id="exit">返回专区</button></div>');
    $("again").onclick=start; $("exit").onclick=lobby;
  }
  function hud() {
    updateText("you",match.score[0]); updateText("cpu",match.score[1]);
    updateText("rally",match.rally ? "本回合  "+match.rally+" 拍" : (duel?"双人对战":labels[level])+" · 先到 7 分");
    let cue="准备接球", tip="人物会自动移动到来球附近";
    if (match.phase==="serve") {
      cue=playerName(match.server)+"发球";
      tip=duel ? (match.server?"远场":"近场")+"轻挥手柄发球" : match.server ? "留意对面的发球方向" : "挥动手柄、按空格或点「挥拍」";
    } else if (match.phase==="point" || match.phase==="over") {
      cue=playerName(match.server)+"得分"; tip=match.reason+" · 得分方发下一球";
    } else if (match.ready) { cue=(duel ? playerName(1-match.flight.side)+" · " : "")+"现在挥拍"; tip="瞄准对方空当"; }
    else if (duel) { cue=playerName(1-match.flight.side)+" 准备接球"; tip=match.flight.side ? "来球飞向近场" : "来球飞向远场"; }
    else if (match.flight?.side===0) { cue="对手接球中"; tip="准备下一拍"; }
    if(match.phase==="flight" && match.flight?.style==="下网")tip="对手回球过低";
    if(!duel && stats[0].speed && match.phase==="flight")tip+=" · 上拍 "+stats[0].speed+" °/s";
    updateText("cue",cue); updateText("tip",tip);
    if(duel)for(const side of [0,1]){
      const scoring=match.phase==="point" || match.phase==="over";
      updateText("side"+side+"-cue",scoring ? (match.server===side?"你得分":"对手得分") : screenFor(side)[2]);
      updateText("side"+side+"-power",stats[side].speed ? "上拍 "+stats[side].speed+" °/s" : "");
    }
    syncScreens();
    updateText("signal-label",match.clock<toastUntil ? toast : match.ready && match.phase==="flight" ? "现在挥拍" : "");
  }
  function frame(now) {
    if (!active || paused) return;
    const dt=Math.min(.10,(now-previous)/1000); previous=now;
    accumulator+=dt;
    while (accumulator>=1/120) { match.step(1/120); accumulator-=1/120; }
    for (const e of match.events.splice(0)) {
      if (e.type==="stroke") { ring(e.detail); if (duel || match.flight?.side===0) say(e.detail); }
      if (e.type==="buffer") say(e.detail,.24);
      if (e.type==="miss") say(e.detail,.45);
      if (e.type==="point" || e.type==="over") { ring("point"); say(playerName(e.detail)+"得分",1.2); }
    }
    arena.render(match,dt); hud();
    if (match.phase==="over") finish(); else raf=requestAnimationFrame(frame);
  }
  $("play").onclick=start; $("pause").onclick=() => pause();
  $("sound").onclick=() => { sound=!sound; $("sound").textContent="音效 "+(sound?"开":"关"); $("sound").setAttribute("aria-pressed",sound); enableAudio(); };
  document.querySelectorAll("[data-shot]").forEach(b => {
    b.onclick=() => stroke(b.dataset.shot==="hit"?.76:.58, b.dataset.shot==="left"?-1:b.dataset.shot==="right"?1:0);
  });
  window.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.hidden ||
        e.target?.isContentEditable || e.target?.closest?.("input, textarea, select")) return;
    if (e.isComposing && (!e.code || e.code==="Unidentified")) return;

    if (!active || sheet.open) return;
    keys.add(e.code);
    if (e.code==="Escape" || e.code==="KeyP") { e.preventDefault(); pause(); return; }
    if (["Space","ArrowLeft","ArrowRight","ArrowDown","ArrowUp"].includes(e.code)) e.preventDefault();
    if (e.repeat || e.code!=="Space") return;
    const direction=Number(keys.has("ArrowRight")||keys.has("KeyD"))-Number(keys.has("ArrowLeft")||keys.has("KeyA"));
    stroke(e.shiftKey?.94:keys.has("ArrowDown")?.26:.60,direction);
  });
  window.addEventListener("keyup",e=>keys.delete(e.code));
  window.addEventListener("blur",()=>keys.clear());
  window.addEventListener("resize",()=>{if(active && arena) arena.resize();});
  document.addEventListener("visibilitychange",()=> {
    if(document.hidden) { keys.clear(); if(active && !paused) pause(); }
  });

})();
