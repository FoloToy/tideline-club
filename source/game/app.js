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
  let audio, socket, reconnectTimer = 0, lastPacket = 0;
  let link = "键盘 / 触屏", deviceUsed = false, lastSpeed = 0, strokes = 0, packetCount = 0, measuredHz = 0;
  const board = document.documentElement.dataset.controller === "on";
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
  function setLink(text) {
    link = text;
    $("input-status").textContent = text;
    document.body.classList.toggle("connected", text.includes("已连接") || text.includes("就绪"));
    const readout = $("connection-detail");
    if (readout) readout.textContent = text;
  }
  function stroke(power, aim, hardware = false) {
    if (hardware) { strokes++; if ($("stroke-count")) $("stroke-count").textContent = strokes; }
    if (active && !paused) match.swing(power,aim);
  }
  const motion = new TidelineMotion((power,aim) => stroke(power,aim,true),setLink,
    key => stroke(key === 2 ? .72 : .56, key === 0 ? -.95 : key === 1 ? .95 : 0, true));
  function connect() {
    if (!board || socket || document.hidden) return;
    motion.reset(); deviceUsed = false; lastPacket = performance.now();
    setLink("正在连接手柄");
    const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/motion");
    socket = ws;
    ws.onmessage = e => {
      if (socket !== ws) return;
      try {
        const packet = JSON.parse(e.data);
        if (!motion.feed(packet)) return;
        deviceUsed = true; lastPacket = performance.now(); packetCount++;
        lastSpeed = Math.round(Math.hypot(...packet.slice(4,7)));
      } catch {}
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null; deviceUsed = false; motion.reset();
      setLink("手柄断线 · 正在重连");
      if (active && !paused && match.phase !== "over") pause("手柄连接中断");
      clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 900);
    };
  }
  setInterval(() => {
    measuredHz = packetCount; packetCount = 0;
    if (board && socket && performance.now() - lastPacket > 2200) socket.close();
    if ($("telemetry")) $("telemetry").textContent = measuredHz + " 帧/秒　·　" + lastSpeed + " °/秒";
  },1000);
  function showInfo(id) {
    modal($(id).innerHTML);
    if (id === "connect" && board) {
      content.innerHTML = '<h2>手柄检测</h2><p id="connection-detail"></p><p id="telemetry"></p><p>已识别挥拍或按键 <b id="stroke-count">0</b> 次</p><p>屏幕朝自己，试着轻挥一次。若提示按键模式，可用上、下键打左右路，确认键打中路。</p><div class="dialog-actions"><button id="calibrate">重新校准</button></div>';
      $("connection-detail").textContent = link; $("stroke-count").textContent = strokes;
      $("telemetry").textContent = measuredHz + " 帧/秒　·　" + lastSpeed + " °/秒";
      $("calibrate").onclick = () => { motion.reset(); setLink("请平放手柄 1 秒"); };
    }
  }
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
    if (sheet.open) closeSheet(); $("court").hidden = true; $("lobby").hidden = false; $("play").focus();
  }
  function start() {
    if (sheet.open) closeSheet();
    enableAudio(); keys.clear();
    match = new TidelineMatch(level); active = true; paused = false; toast = ""; toastUntil = 0;
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
    paused = true; keys.clear(); cancelAnimationFrame(raf);
    modal('<h2>'+title+'</h2><p>比分与来球位置已保留。</p><div class="dialog-actions"><button id="resume">继续比赛</button><button id="restart">重新开局</button><button id="back">返回专区</button></div>');
    $("resume").onclick=resume; $("restart").onclick=start; $("back").onclick=lobby;
  }
  function resume() {
    if (!active) return;
    closeSheet(); paused=false; previous=performance.now(); accumulator=0; enableAudio();
    cancelAnimationFrame(raf); raf=requestAnimationFrame(frame);
  }
  function finish() {
    const won = match.score[0] === 7;
    modal('<h2>'+(won?"你赢下了海岸单打":"电脑赢下了本场")+'</h2><div class="result-score">'+match.score[0]+' <span>∶</span> '+match.score[1]+'</div><p>'+labels[level]+'对手 · 最长回合 '+match.best+' 拍 · 成功接球 '+match.hits+' 次</p><div class="dialog-actions"><button id="again">再来一局</button><button id="exit">返回专区</button></div>');
    $("again").onclick=start; $("exit").onclick=lobby;
  }
  function hud() {
    updateText("you",match.score[0]); updateText("cpu",match.score[1]);
    updateText("rally",match.rally ? "本回合  "+match.rally+" 拍" : labels[level]+" · 先到 7 分");
    let cue="准备接球", tip="人物会自动移动到来球附近";
    if (match.phase==="serve") {
      cue=match.server ? "电脑发球" : "轮到你发球";
      tip=match.server ? "留意对面的发球方向" : deviceUsed ? "轻挥手柄，或按确认键" : "按空格，或点「挥拍」";
    } else if (match.phase==="point" || match.phase==="over") {
      cue=match.server ? "电脑得分" : "你得分了"; tip="得分方发下一球";
    } else if (match.ready) { cue="现在挥拍"; tip="瞄准对方空当"; }
    else if (match.flight?.side===0) { cue="对手接球中"; tip="准备下一拍"; }
    updateText("cue",cue); updateText("tip",tip);
    updateText("signal-label",match.clock<toastUntil ? toast : match.ready && match.phase==="flight" ? "现在挥拍" : "");
  }
  function frame(now) {
    if (!active || paused) return;
    const dt=Math.min(.10,(now-previous)/1000); previous=now;
    accumulator+=dt;
    while (accumulator>=1/120) { match.step(1/120); accumulator-=1/120; }
    for (const e of match.events.splice(0)) {
      if (e.type==="stroke") { ring(e.detail); if (match.flight?.side===0) say(e.detail); }
      if (e.type==="miss") say(e.detail,.45);
      if (e.type==="point" || e.type==="over") { ring("point"); say(e.detail?"电脑得分":"你得分了",1.2); }
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
    else if (board && !socket) connect();
  });
  if(board) { document.querySelector(".input-btn u").textContent="手柄检测"; connect(); }
})();
