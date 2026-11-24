const assert = require("node:assert/strict");
const Match = require("../game/match.js");
const Motion = require("../game/motion.js");
function seeded(seed) { return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/2**32); }
function play(level, seed, returnBall) {
  const m = new Match(level,seeded(seed)); let prev = 0, netCrossings = 0;
  let lowestNet = Infinity;
  for (let i=0; i<120*900 && m.phase !== "over"; i++) {
    if (m.phase === "serve" && !m.server) m.swing();
    if (returnBall && m.ready && m.phase === "flight" && m.flight.t >= .77) {
      m.swing(m.hits%3 === 1 ? .29 : .97, m.aiX >= 0 ? -1 : 1);
    }
    prev = m.ball.z; m.step(1/120);
    if (prev * m.ball.z < 0 && m.phase === "flight") {
      netCrossings++; lowestNet=Math.min(lowestNet,m.ball.y);
    }
    assert.ok(Number.isFinite(m.ball.x+m.ball.y+m.ball.z));
    assert.ok(m.score.every(s=>s>=0 && s<=7));
    m.events.length = 0;
  }
  assert.equal(m.phase,"over",level+" timed out");
  assert.ok(netCrossings>0);
  return {score:m.score,best:m.best,hits:m.hits,netCrossings,lowestNet};
}
const results=[];
for (const level of ["shore","tide","swell"]) {
  for(let i=1;i<=12;i++) {
    const won=play(level,i,true), lost=play(level,i,false);
    assert.equal(won.score[0],7); assert.equal(lost.score[1],7);
    assert.ok(won.lowestNet>=1.545, "net clearance "+JSON.stringify(won));
    results.push(won,lost);
  }
}
const strikes=[],keys=[],statuses=[];
const motion=new Motion((power,aim)=>strikes.push({power,aim}),s=>statuses.push(s),k=>keys.push(k));
let seq=0,ms=0;
const send=(x=1,y=-1,z=2,present=1,count=0,key=0) => motion.feed([1,seq++,ms+=20,present,x,y,z,count,key]);
for (let i=0;i<48;i++) send();
assert.equal(statuses.at(-1),"体感已就绪");
for(let i=0;i<100;i++) send();
assert.equal(strikes.length,0);
send(40,40,375); send(30,35,350);
for(let i=0;i<12;i++) send(5,25,180);
assert.equal(strikes.length,1);
assert.ok(strikes[0].power>.69 && strikes[0].aim>.7);
for(let i=0;i<6;i++) send();
send(-50,-35,-145);send(-50,-35,-200);
assert.equal(strikes.length,2);assert.ok(strikes[1].aim<-.7);
assert.equal(motion.feed([1,seq-1,ms,1,0,0,0,0,0]),false);
assert.equal(motion.feed([1,seq,ms,1,NaN,0,0,0,0]),false);
send(0,0,0,0,1,2); assert.deepEqual(keys,[2]);
for(let i=0;i<10;i++) send(0,0,0,0,1,2);
assert.deepEqual(keys,[2]);
ms+=800;send(0,0,375,1,3,2);assert.equal(strikes.length,2);assert.deepEqual(keys,[2]);
console.log(JSON.stringify({matches:results.length,maximumRally:Math.max(...results.map(r=>r.best)),minimumNetCrossingM:Math.min(...results.map(r=>r.lowestNet)),motion:"calibration, quiet, strong/weak, direction, repeat suppression, bad packets, gap and key fallback pass"},null,2));

// A recovery rotation can be as fast as a light stroke. One loaded outward
// phase plus its reverse is one event; resting starts a new opposite stroke.
{
  const events = [], buttons = [], states = [];
  const six = new Motion((power,aim)=>events.push({power,aim}),s=>states.push(s),k=>buttons.push(k));
  let sample = 0, time = 0, count = 0;
  function run(n,x,load,z) {
    for (let i=0;i<n;i++) assert.equal(six.feed([2,sample++,time+=20,1,x,0,0,count,2,load,z]),true);
  }
  run(50,0,1000,0);
  assert.equal(states.at(-1),"体感已就绪");
  run(6,210,1700,-1400);
  run(12,50,1000,0);
  run(8,-160,1550,1300);
  assert.equal(events.length,1);
  run(12,0,1000,0);
  run(7,-120,1450,1100);
  assert.equal(events.length,2);
  count++;run(1,0,1000,0);
  assert.deepEqual(buttons,[2]);assert.equal(events.length,2);
  assert.equal(six.feed([2,sample,time+20,1,0,0,0,count,2,1000]),false);
  assert.equal(six.feed([2,sample,time+20,1,0,0,0,count,2,1000,9999]),false);
  console.log("Six-axis protocol, return suppression, opposite light stroke after rest and button separation PASS");
}
