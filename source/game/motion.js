/* Packet: [version,sequence,uptime_ms,gyro_present,gx,gy,gz,button_count,key]
   Angular rates in degrees/second. Absolute device time is never compared
   with the host clock. A new connection always starts with a fresh baseline. */
(function(root) {
  "use strict";
  const SwingDetector = root.TidelineSwingDetector || (typeof require === "function" && require("./swing.js"));
  class Motion {
    constructor(onStroke, onState, onKey = () => {}) {
      this.onStroke = onStroke; this.onState = onState; this.onKey = onKey; this.reset();
    }
    reset() {
      this.detector = new SwingDetector(); this.calibrationMs = 0;
      this.seq = null; this.ms = null; this.button = null;
      this.sum = [0,0,0]; this.bias = null; this.count = 0;
      this.pending = null; this.armed = false; this.lastSwing = -Infinity; this.quiet = 0; this.lastStatus = "";
    }
    status(s) { if (s !== this.lastStatus) { this.lastStatus = s; this.onState(s); } }
    feed(p) {
      if (!Array.isArray(p)) return false;
      const sixAxis = p[0] === 2;
      if ((sixAxis ? p.length !== 11 || !Number.isInteger(p[10]) || Math.abs(p[10]) > 4000 || !Number.isInteger(p[9]) || p[9] < 0 || p[9] > 7000 :
            p[0] !== 1 || p.length !== 9) || !p.every(Number.isFinite) ||
          !Number.isInteger(p[1]) || !Number.isInteger(p[2]) || p[2] < 0 || ![0,1].includes(p[3]) ||
          p.slice(4,7).some(v => Math.abs(v)>3000)) return false;
      if (this.seq !== null) {
        const forward = (p[1] - this.seq) >>> 0;
        if (forward === 0 || forward > 0x7fffffff) return false;
        if (p[2] < this.ms || p[2] - this.ms > 550) this.reset();
      }
      const dt = this.ms === null ? 0 : p[2] - this.ms;
      this.seq = p[1]; this.ms = p[2];
      if (this.button !== null && p[7] !== this.button) this.onKey(p[8]);
      this.button = p[7];
      if (!p[3]) {
        this.detector.reset(); this.calibrationMs = 0;
        this.count = 0; this.sum = [0,0,0]; this.bias = null; this.armed = false; this.pending = null;
        this.status("已连接 · 按键模式"); return true;
      }
      const v = p.slice(4,7);
      if (!this.bias) {
        this.status("请平放手柄 1 秒");
        if (Math.hypot(...v) > (sixAxis ? 35 : 15) || (sixAxis && (Math.abs(p[9]-1000) > 120 || dt > 100))) {
          this.count = 0; this.calibrationMs = 0; this.sum = [0,0,0]; return true;
        }
        this.calibrationMs += Math.min(dt,40);
        v.forEach((value,i) => { this.sum[i] += value; });
        this.count++;
        if (sixAxis ? this.count >= 10 && this.calibrationMs >= 320 : this.count >= 48) { this.bias = this.sum.map(s => s/this.count); this.armed = true; this.status("体感已就绪"); }
        return true;
      }
      const [x,y,z] = v.map((n,i) => n-this.bias[i]);
      if (sixAxis) {
        if (dt > 100) this.detector.reset();
        const shot = this.detector.sample(this.ms,dt,x,y,z,p[9],p[10]);
        if (shot) this.onStroke(shot.power,shot.aim);
        return true;
      }
      const speed = Math.hypot(x,y,z);
      if (speed < 62) this.quiet += Math.min(dt,40); else this.quiet = 0;
      if (this.quiet >= 80) this.armed = true;
      if (this.armed && speed >= 110 && this.ms - this.lastSwing >= 220) {
        this.armed = false;
        this.lastSwing = this.ms;
        this.pending = {speed, y, z, at:this.ms};
      }
      // Use at most one extra 50 Hz sample for softer onsets. Hard strokes
      // fire on the threshold-crossing packet and incur no extra wait.
      if (this.pending) {
        if (speed > this.pending.speed) Object.assign(this.pending,{speed,y,z});
        const peak = this.pending;
        if (peak.speed >= 285 || this.ms > peak.at) {
          this.pending = null;
          const aim = (peak.z + .35*peak.y)/Math.max(80,peak.speed*.63);
          this.onStroke(Math.min(1, peak.speed/390), Math.max(-1,Math.min(1,aim)));
        }
      }
      return true;
    }
  }
  root.TidelineMotion = Motion;
  if (typeof module !== "undefined") module.exports = Motion;
})(globalThis);
