/* Tideline Club · deterministic singles simulation, metres and seconds. */
(function (root) {
  "use strict";
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const approach = (v, target, amount) => v + clamp(target - v, -amount, amount);
  const rules = {
    shore: { aiSpeed: 3.35, reaction: .28, window: .26, pace: 1.28, error: .135, attack: .21 },
    tide: { aiSpeed: 3.95, reaction: .23, window: .25, pace: 1.24, error: .115, attack: .34 },
    swell: { aiSpeed: 4.55, reaction: .18, window: .235, pace: 1.18, error: .091, attack: .47 }
  };
  class Match {
    constructor(level = "shore", random = Math.random, duel = false) {
      this.rules = rules[level] || rules.shore;
      this.random = random;
      this.duel = duel;
      this.buffer = null;
      this.score = [0, 0];
      this.rally = this.best = this.clock = this.hits = 0;
      this.playerX = -.85; this.playerZ = 4.65;
      this.aiX = .85; this.aiZ = -4.65;
      this.ball = {x: this.playerX + .28, y: 1.2, z: this.playerZ - .45};
      this.playerSwing = this.aiSwing = this.hit = 0;
      this.message = ""; this.server = 0;
      this.phase = "serve"; this.ready = true; this.wait = 0;
      this.events = [];
    }
    emit(type, detail) { this.events.push({type, detail}); }
    point(winner, reason = "落地") {
      this.reason = reason;
      this.buffer = null;
      this.score[winner]++;
      this.server = winner;
      this.best = Math.max(this.best, this.rally);
      this.ready = false;
      this.phase = this.score[winner] === 7 ? "over" : "point";
      this.wait = 1.55;
      this.emit(this.phase, winner);
    }
    launch(side, x, z, duration, lift, style) {
      this.buffer = null;
      this.flight = {side, start: {...this.ball}, x, z, duration, lift, t: 0, style};
      const f = this.flight;
      const travel = -f.start.z / (z - f.start.z);
      const tNet = 1 - Math.pow(1 - clamp(travel,0,1), 1/1.27);
      const arch = 4*tNet*(1-tNet);
      if (arch > .02) {
        const base = f.start.y*(1-tNet) + .07*tNet;
        f.lift = style === "下网" ? (1.10-base)/arch : Math.max(lift,(1.63-base)/arch);
      }
      if (side===0 && !this.duel) {
        f.chase = Math.hypot(x-this.aiX,z-this.aiZ);
        f.errorRoll = this.random();
      }
      this.phase = "flight"; this.ready = false;
      this.hit = 1;
      this.rally++; this.best = Math.max(this.best, this.rally);
      if (side === 0) this.playerSwing = 1;
      else this.aiSwing = 1;
      this.emit("stroke", style);
    }
    swing(power = .55, aim = 0, side = 0) {
      if (side !== 0 && !(this.duel && side === 1)) return false;
      if (this.phase === "point" || this.phase === "over") return false;
      const facing = side === 0 ? 1 : -1;
      power = clamp(power, 0, 1); aim = clamp(aim, -1, 1);
      if (this.phase === "serve") {
        if (this.server !== side) return false;
        const origin = side === 0 ? this.playerX : this.aiX;
        this.launch(side, -Math.sign(origin || facing)*(1.2+.4*Math.abs(aim)), -facing*(3.9+1.2*power), 1.43-.34*power, 2.4-.34*power, "发球");
        return true;
      }
      if (this.flight.side === side) return false;
      if (this.ready) return this.returnShot(side, power, aim);
      const f = this.flight;
      if (f.contact) {
        // Recognize the physical stroke shortly after the last reachable frame.
        if (this.clock - f.contact.clock <= .10) {
          this.ball = {...f.contact.ball};
          return this.returnShot(side, power, aim, f.contact.t);
        }
        this.emit("miss","晚了一点"); return false;
      }
      this.buffer = {side, power, aim, until:this.clock + .26};
      this.emit("buffer","收到挥拍");
      return false;
    }
    returnShot(side, power, aim, contactTime = this.flight.t) {
      const facing = side === 0 ? 1 : -1;
      const accuracy = clamp(1 - Math.abs(contactTime - .80) / (this.rules.window + .01), 0, 1);
      const smash = power >= .68 && this.ball.y >= 1.72 && accuracy > .32;
      const drop = power < .37;
      const x = clamp(facing*aim*2.51 + (this.random()-.5)*(.54-.40*accuracy),-2.55,2.55);
      const duration = drop ? 1.21-.46*power : smash ? 1.02-.47*power : 1.53-.54*power;
      const depth = drop ? 1.32+2.50*power : 4.05+2.15*power;
      const lift = drop ? 1.20+.37*power : smash ? .83-.31*power : 2.22-.39*power;
      this.hits++;
      this.launch(side,x,-facing*depth,duration+.10*(1-accuracy),lift,
        drop ? "吊球" : smash ? "扣杀" : power >= .68 ? "平抽" : "高远球");
      this.flight.power=power;
      return true;
    }
    aiReturn() {
      if (this.phase === "serve") {
        this.launch(1,-Math.sign(this.aiX || 1)*1.35,4.5,1.24,2.05,"发球");
        return;
      }
      const incoming=this.flight;
      const scramble=clamp((incoming.chase-1.6)/3.4,0,1);
      const pressure=scramble + (incoming.style==="扣杀" ? .55 : 0);
      const fatigue=Math.min(.12,Math.max(0,this.rally-6)*.006);
      // Each approach gets one error roll at launch, independent of frame rate.
      if (incoming.errorRoll < this.rules.error*(1+.85*pressure)+fatigue) {
        this.launch(1, this.ball.x*.35, 2.5, .82, -.55, "下网");
        return;
      }
      const opening = Math.abs(incoming.x)<1.2 && incoming.style!=="扣杀";
      const attack = this.random() < this.rules.attack*(opening ? 1.35 : .65) && scramble<.86;
      const drop = !attack && Math.abs(this.playerZ)>4.6 && this.random()<.42;
      const lane = Math.abs(this.playerX)>.32 ? -Math.sign(this.playerX) : (this.random()<.5 ? -1 : 1);
      const x = lane*(.7+this.random()*(attack ? 1.83 : 1.55));
      const shortKill = attack && opening && this.playerZ > 4.1 && this.ball.y > 1.6;
      this.launch(1,x,shortKill ? 1.30 : drop ? 1.8+this.random() : 4.4+this.random()*1.8,
        this.rules.pace*(shortKill ? .58 : attack ? .73 : drop ? .91 : 1.04)+.13*scramble,
        attack ? .76 : drop ? 1.36 : 2+this.random()*.5,attack ? "扣杀" : drop ? "吊球" : "高远球");
    }
    step(dt) {
      this.clock += dt;
      this.playerSwing = Math.max(0, this.playerSwing - dt * 3.8);
      this.aiSwing = Math.max(0, this.aiSwing - dt * 3.8);
      this.hit = Math.max(0, this.hit - dt * 5);
      if (this.phase === "over") return;
      if (this.phase === "point") {
        this.wait -= dt;
        if (this.wait <= 0) {
          this.phase = "serve"; this.rally = 0; this.wait = .95;
          this.ready = this.duel || this.server === 0; this.emit("serve", this.server);
        }
        return;
      }
      if (this.phase === "serve") {
        const lane = this.score[this.server] % 2 ? 1 : -1;
        this.playerX = approach(this.playerX, lane * 1.15, dt * 5);
        this.aiX = approach(this.aiX, -lane * 1.15, dt * 5);
        this.playerZ = approach(this.playerZ, 4.65, dt * 5);
        this.aiZ = approach(this.aiZ, -4.65, dt * 5);
        this.ball = this.server === 0 ? {x:this.playerX+.28,y:1.20,z:this.playerZ-.45}
          : {x:this.aiX-.28,y:1.20,z:this.aiZ+.45};
        if (!this.duel && this.server === 1 && (this.wait -= dt) <= 0) this.aiReturn();
        return;
      }
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      // Air drag takes speed off the shuttle as it nears the receiver.
      const travel = 1 - Math.pow(1 - f.t, 1.27);
      const previousZ = this.ball.z;
      this.ball.x = f.start.x + (f.x - f.start.x) * travel;
      this.ball.z = f.start.z + (f.z - f.start.z) * travel;
      this.ball.y = f.start.y * (1 - f.t) + .07 * f.t + 4 * f.lift * f.t * (1 - f.t);
      if (previousZ*this.ball.z<=0 && this.ball.y<1.55) {
        this.point(1-f.side,"下网"); return;
      }
      if (this.duel || f.side === 1) {
        const near = f.side === 1, facing = near ? 1 : -1;
        const rx = near ? "playerX" : "aiX", rz = near ? "playerZ" : "aiZ", other = near ? "aiX" : "playerX";
        // A fast attacking shot leaves less time to change direction after the split step.
        if (this.duel || f.style!=="扣杀" || f.t*f.duration >= .18) {
          this[rx] = approach(this[rx], f.x-facing*.36, dt*6.8);
          this[rz] = approach(this[rz], f.z+facing*.34, dt*5.5);
        }
        this[other] = approach(this[other], this[other]*.96, dt*1.65);
        this.ready = f.style!=="下网" && f.t >= .80-this.rules.window && f.t <= .80+this.rules.window &&
          Math.hypot(this.ball.x-this[rx], this.ball.z-this[rz]) < 2.15 && this.ball.y > .3;
        if (this.ready) f.contact = {clock:this.clock, t:f.t, ball:{...this.ball}};
        if (this.buffer && this.buffer.until < this.clock) {
          this.buffer=null;
          this.emit("miss","早了一点");
        }
        if (this.ready && this.buffer) {
          const {side,power,aim}=this.buffer;
          this.returnShot(side,power,aim);
          return;
        }
      } else {
        this.playerX = approach(this.playerX, 0, dt * 1.5);
        if (f.t * f.duration >= this.rules.reaction) {
          this.aiX = approach(this.aiX, f.x + .27, dt * this.rules.aiSpeed);
          this.aiZ = approach(this.aiZ, f.z - .40, dt * this.rules.aiSpeed);
        }
        const distance = Math.hypot(this.ball.x - this.aiX, this.ball.z - this.aiZ);
        if (f.t >= .73 && f.t < .94 && distance < 1.38 && this.ball.y > .45) {
          this.aiReturn(); return;
        }
      }
      if (f.t >= 1 && (!f.contact || this.clock - f.contact.clock > .10)) this.point(f.side);
    }
  }
  root.TidelineMatch = Match;
  if (typeof module !== "undefined") module.exports = Match;
})(globalThis);
