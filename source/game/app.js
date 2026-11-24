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
  const players = [0,1].map(() => ({seen:false, swings:0, buttons:0}));
  const shotKeys = ["QWERTYFGH","UIOJKLBNM"];
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
  function refreshInputs() {
    const seen = [];
    players.forEach((p,side) => {
      const name = "P"+(side+1);
      if (p.seen) seen.push(name);
      if ($("paddle-"+side)) updateText("paddle-"+side,name+" · "+(p.seen ?
        "已收到输入　挥拍 "+p.swings+" 次　按键 "+p.buttons+" 次" : "等待输入"));
    });
    updateText("input-status",seen.length ? seen.join(" / ")+" 已收到输入" : "短按手柄确认键");
    document.body.classList.toggle("connected",seen.length > 0);
  }
  function handlePaddle(e) {
    const fallback = !e.code || e.code==="Unidentified";
    const letter = fallback ? /^[a-z]$/i.exec(e.key)?.[0].toUpperCase() : /^Key([A-Z])$/.exec(e.code)?.[1];
    const digit = fallback ? /^[1-8]$/.exec(e.key)?.[0] : /^Digit([1-8])$/.exec(e.code)?.[1];
    // The first report can arrive in the lobby, before the tester or a match opens.
    if (sheet.open && !content.querySelector("#paddle-0")) return false;
    for (let side=0; side<2; side++) {
      const key = letter ? shotKeys[side].indexOf(letter) : -1;
      const button = Number(digit)-1-side*3;
      const isButton = digit && button>=0 && button<3;
      const hello = Number(digit)===7+side;
      if (key<0 && !isButton && !hello) continue;
      e.preventDefault();
      if (e.repeat) return true;
      const p=players[side]; p.seen=true;
      if (key>=0) {
        p.swings++;
        stroke([.28,.56,.92][Math.floor(key/3)],key%3-1,side);
      } else if (isButton) {
        p.buttons++;
        stroke(button===2?.72:.56,[-.95,.95,0][button],side);
      }
      refreshInputs(); return true;
    }
    return false;
  }
  function showInfo(id) { modal($(id).innerHTML); refreshInputs(); }
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    duel = b.dataset.mode==="duel";
    document.querySelectorAll("[data-mode]").forEach(o => o.setAttribute("aria-pressed",String(o===b)));
    $("difficulty").hidden = duel;
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
    if (sheet.open) closeSheet(); $("court").hidden = true; $("lobby").hidden = false; $("play").focus();
  }
  function start() {
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
    $("resume").onclick=resume; $("restart").onclick=start; $("back").onclick=lobby;
  }
  function resume() {
    if (!active) return;
    closeSheet(); paused=false; previous=performance.now(); accumulator=0; enableAudio();
    cancelAnimationFrame(raf); raf=requestAnimationFrame(frame);
  }
  function finish() {
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
      cue=playerName(match.server)+"得分"; tip="得分方发下一球";
    } else if (match.ready) { cue=(duel ? playerName(1-match.flight.side)+" · " : "")+"现在挥拍"; tip="瞄准对方空当"; }
    else if (duel) { cue=playerName(1-match.flight.side)+" 准备接球"; tip=match.flight.side ? "来球飞向近场" : "来球飞向远场"; }
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
    if (handlePaddle(e)) return;
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
