/* Tideline Club · deterministic singles simulation, metres and seconds. */
(function (root) {
  "use strict";
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const approach = (v, target, amount) => v + clamp(target - v, -amount, amount);
  const rules = {
    shore: { aiSpeed: 3.05, reaction: .35, window: .26, pace: 1.35 },
    tide: { aiSpeed: 3.85, reaction: .23, window: .21, pace: 1.19 },
    swell: { aiSpeed: 4.65, reaction: .15, window: .17, pace: 1.05 }
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
    point(winner) {
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
      if (this.phase === "serve") {
        if (this.server !== side) return false;
        const origin = side === 0 ? this.playerX : this.aiX;
        this.launch(side, -Math.sign(origin || facing)*1.35, -facing*4.4, 1.24, 2.25, "发球");
        return true;
      }
      if (this.flight.side === side) return false;
      power = clamp(power, 0, 1); aim = clamp(aim, -1, 1);
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
      const smash = power >= .69 && this.ball.y >= 1.72 && accuracy > .32;
      const drop = power < .37;
      const x = clamp(facing*aim * 2.53 + (this.random() - .5) * (.8 - .55 * accuracy), -2.55, 2.55);
      this.hits++;
      this.launch(side, x, facing*(drop ? -2.2 : -5.75), smash ? .67 : drop ? .98 : 1.24,
        smash ? .62 : drop ? 1.38 : 2.05, smash ? "扣杀" : drop ? "吊球" : "高远球");
      return true;
    }
    aiReturn() {
      const sign = this.random() > .45 ? -Math.sign(this.playerX || 1) : Math.sign(this.playerX || 1);
      const x = sign * (.45 + this.random() * 2.03);
      this.launch(1, x, 4.1 + this.random() * 1.85, this.rules.pace + this.random() * .20,
        1.65 + this.random() * .95, this.rally ? "回球" : "发球");
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
      this.ball.x = f.start.x + (f.x - f.start.x) * travel;
      this.ball.z = f.start.z + (f.z - f.start.z) * travel;
      this.ball.y = f.start.y * (1 - f.t) + .07 * f.t + 4 * f.lift * f.t * (1 - f.t);
      if (this.duel || f.side === 1) {
        const near = f.side === 1, facing = near ? 1 : -1;
        const rx = near ? "playerX" : "aiX", rz = near ? "playerZ" : "aiZ", other = near ? "aiX" : "playerX";
        this[rx] = approach(this[rx], f.x-facing*.36, dt*6.8);
        this[rz] = approach(this[rz], f.z+facing*.34, dt*5.5);
        this[other] = approach(this[other], this[other]*.96, dt*1.65);
        this.ready = f.t >= .80-this.rules.window && f.t <= .80+this.rules.window &&
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
