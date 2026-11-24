const assert = require("node:assert/strict");
const Match = require("../game/match.js");
const dt = 1/120;
function until(m,when) {
  for (let i=0;i<600;i++) { if(when()) return; m.step(dt); }
  assert.fail("condition timed out");
}
function incoming(side, duel=true, level="shore") {
  const m=new Match(level,()=>.5,duel);
  m.ball={x:0,y:1.62,z:side===0?-4:4};
  m.launch(1-side,1,side===0?4:-4,1.22,1.65,"回球");
  return m;
}
for (const [side,duel] of [[0,false],[0,true],[1,true]]) {
  const base=incoming(side,duel);
  until(base,()=>base.ready);
  const first=base.clock;
  for(const lead of [.05,.15,.24,.33]) {
    const m=incoming(side,duel);
    until(m,()=>m.clock>=first-lead);
    m.swing(.26,-1,side);
    until(m,()=>m.clock>=first+.015);
    assert.equal(m.hits,lead>.26?0:1);
    if(m.hits) {
      assert.equal(m.flight.side,side); assert.equal(m.flight.style,"吊球");
      assert.equal(Math.sign(m.flight.x),side===0?-1:1);
      assert.equal(m.buffer,null);
      assert.equal(m.swing(.9,1,side),false);
    } else { assert.equal(m.swing(.6,0,side),true); }
  }
  const late=incoming(side,duel);
  until(late,()=>late.ready); until(late,()=>!late.ready);
  const last=late.clock; until(late,()=>late.clock>last+.05);
  assert.ok(late.swing(.6,0,side));
  const missed=incoming(side,duel);
  until(missed,()=>missed.phase==="point");
  assert.equal(missed.swing(.6,0,side),false);
}
for(const winner of [0,1]) {
  const m=new Match("shore",()=>.5,true);
  for(let n=0;n<7;n++) {
    until(m,()=>m.phase==="serve");
    const server=m.server;
    for(let i=0;i<360;i++)m.step(dt);
    assert.equal(m.phase,"serve");
    assert.equal(m.swing(.6,0,1-server),false);
    assert.ok(m.swing(.6,0,server));
    if(server!==winner) { until(m,()=>m.ready); assert.ok(m.swing(.6,0,winner)); }
    until(m,()=>m.phase==="point" || m.phase==="over");
    assert.equal(m.server,winner);
  }
  assert.equal(m.score[winner],7); assert.equal(m.phase,"over");
}
const rally=new Match("shore",()=>.5,true);
rally.swing();
for(let n=0;n<14;n++) {
  until(rally,()=>rally.ready);
  const receiver=1-rally.flight.side;
  assert.ok(rally.swing(.75,n%2?1:-1,receiver));
}
assert.equal(rally.hits,14);
console.log("Solo/P1/P2: 50/150/240 ms early and 50 ms late accepted; 330 ms early expires, valid retry succeeds. Both servers, both winners and 14 alternating returns passed.");
