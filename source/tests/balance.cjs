const assert = require("node:assert/strict");
const Match = require("../game/match.js");
function seeded(seed) {
  return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
}
const shares=[];
for (const level of ["shore","tide","swell"]) {
  const returns=[];
  let points=0, against=0, wins=0;
  for (let seed=1; seed<=40; seed++) {
    const neutral=new Match(level,seeded(seed));
    neutral.swing();
    while(neutral.phase==="flight" && neutral.hits<250) {
      if(neutral.flight.side===1 && neutral.ready && neutral.flight.t>=.77)neutral.swing(.60,0);
      neutral.step(1/120); neutral.events.length=0;
    }
    assert.notEqual(neutral.phase,"flight","neutral rally stalled");
    returns.push(neutral.hits);
    const m=new Match(level,seeded(seed)), reaction=seeded(seed+92301);
    // Same player at every difficulty: central returns 120–400 ms after seeing the cue.
    while(m.phase!=="over" && m.clock<1200) {
      if(m.phase==="serve" && m.server===0)m.swing();
      const f=m.flight;
      if(m.phase==="flight" && f.side===1) {
        if(m.ready && f.respondAt===undefined)f.respondAt=m.clock+.12+.28*reaction();
        if(m.clock>=f.respondAt){f.respondAt=Infinity;m.swing(.6,0);}
      }
      m.step(1/120); m.events.length=0;
    }
    assert.equal(m.phase,"over");
    points+=m.score[0]; against+=m.score[1]; wins+=m.score[0]===7;
  }
  returns.sort((a,b)=>a-b);
  const share=points/(points+against);shares.push(share);
  console.log(level,{medianNeutralReturns:returns[20],maxNeutralReturns:returns.at(-1),playerPoints:points,computerPoints:against,playerMatchWins:wins});
  assert.ok(returns[20]<15 && returns.at(-1)<65);
}
assert.ok(shares[0]>shares[1] && shares[1]>shares[2]);
assert.ok(shares[2]>.1 && shares[0]<.85);
for(const side of [0,1]) {
  function flight(power,height=2.4) {
    const m=new Match("shore",()=>.5,true);
    m.phase="flight"; m.ready=true; m.flight={side:1-side,t:.8};
    m.ball={x:0,y:height,z:side?-4:4}; m.swing(power,.7,side);return m.flight;
  }
  for(const [slow,fast] of [[.14,.33],[.4,.64],[.72,.94]]) {
    const a=flight(slow),b=flight(fast);
    assert.equal(a.style,b.style);
    assert.ok(b.duration<a.duration && Math.abs(b.z)>Math.abs(a.z));
    assert.equal(Math.sign(b.x),side?-1:1);
  }
  assert.equal(flight(.9,1.35).style,"平抽");assert.equal(flight(.9).style,"扣杀");
}
