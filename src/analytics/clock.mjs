export class ExposureClock {
  constructor(count, now = () => performance.now()) {
    this.now = now; this.times = Array(count).fill(0); this.slide = 0; this.active = false; this.last = now();
  }
  tick() {
    const current = this.now();
    // A suspended device or throttled timer must not count hours of apparent attention.
    if (this.active) this.times[this.slide] += Math.max(0, Math.min(current - this.last, 5000));
    this.last = current;
  }
  setActive(active) { this.tick(); this.active = active; }
  setSlide(slide) { this.tick(); this.slide = slide; }
  snapshot() { this.tick(); return this.times.map(Math.floor); }
}
