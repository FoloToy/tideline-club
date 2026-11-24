/* Screen X is the sensor's Y gyro axis. When a stroke gathers speed,
   tangential acceleration changes along sensor Z with the opposite sign.
   Track each loading pulse separately so its evidence cannot cross a reversal. */
(function(root) {
  "use strict";
  class SwingDetector {
    constructor() { this.reset(); }
    reset() {
      this.restZ = null;
      this.sign = 0;
      this.loadMs = 0;
      this.lastLoad = -Infinity;
      this.lastHit = -Infinity;
      this.spent = false;
      this.strokeSign = 0;
      this.quietMs = 0;
      this.pending = null;
    }
    sample(ms, dt, x, y, z, loadMg, azMg) {
      const step = Math.min(dt,60);
      if (this.restZ === null) this.restZ = azMg;
      const changeZ = azMg - this.restZ;
      this.restZ += (1-Math.exp(-step/420)) * changeZ;
      const sign = Math.sign(x);
      const speed = Math.hypot(x,y,z);
      // Returning to a settled grip ends the stroke early, including when the
      // next deliberate shot is in the opposite direction.
      if (speed < 40 && Math.abs(loadMg-1000) < 150) this.quietMs += step;
      else this.quietMs = 0;
      if (this.quietMs >= 180 || ms-this.lastHit >= 1500) this.strokeSign = 0;
      if (sign !== this.sign || Math.abs(x) < 35) {
        this.loadMs = 0;
        this.lastLoad = -Infinity;
        this.spent = false;
      }
      this.sign = sign;
      if (Math.abs(x) >= 35 && -sign*changeZ >= 350 && loadMg >= 1280) {
        this.loadMs += step;
        if (this.loadMs >= 35) this.lastLoad = ms;
      } else {
        this.loadMs = 0;
      }
      if (!this.spent && sign !== -this.strokeSign && ms-this.lastHit >= 280 && ms-this.lastLoad <= 100 &&
          Math.abs(x) >= 75 && speed >= 95) {
        this.spent = true;
        this.lastHit = ms;
        this.strokeSign = sign;
        this.pending = {at:ms, speed, y, z};
      }
      const peak = this.pending;
      if (!peak) return null;
      if (speed > peak.speed) Object.assign(peak,{speed,y,z});
      if (peak.speed < 285 && ms-peak.at < 40) return null;
      this.pending = null;
      const aim = (peak.z + .35*peak.y) / Math.max(80,peak.speed*.63);
      return {power:Math.min(1,peak.speed/390),aim:Math.max(-1,Math.min(1,aim))};
    }
  }
  root.TidelineSwingDetector = SwingDetector;
  if (typeof module !== "undefined") module.exports = SwingDetector;
})(globalThis);
