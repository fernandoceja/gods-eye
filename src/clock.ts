import { DAY_MS, HOUR_MS } from "./places.ts";

/** One simulation clock. Every layer reads `simTime`. */
export class SimClock {
  simTime = Date.now();
  rate = 1;
  playing = true;
  live = true;
  readonly spanStart: number;
  spanEnd: number;
  private last = 0;

  constructor(now = Date.now()) {
    this.simTime = now;
    this.spanStart = now - 7 * DAY_MS;
    this.spanEnd = now + 6 * HOUR_MS;
    this.last = typeof performance !== "undefined" ? performance.now() : 0;
  }

  tick(now: number): void {
    const dt = Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    if (!this.playing) return;
    if (this.live && this.rate === 1) this.simTime = Date.now();
    else {
      this.simTime += dt * this.rate;
      this.live = false;
    }
    if (this.simTime > this.spanEnd - HOUR_MS) this.spanEnd = this.simTime + 6 * HOUR_MS;
  }

  setTime(ms: number): void {
    this.simTime = ms;
    this.live = false;
  }

  setRate(rate: number): void {
    this.rate = Math.min(1000, Math.max(1, rate));
    if (this.rate !== 1) this.live = false;
  }

  goLive(): void {
    this.simTime = Date.now();
    this.rate = 1;
    this.playing = true;
    this.live = true;
    this.spanEnd = Math.max(this.spanEnd, this.simTime + 6 * HOUR_MS);
  }
}
