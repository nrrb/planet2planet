export class SimulationClock {
  time: number;
  speed: number;
  playing: boolean;
  private last: number | null = null;
  constructor(time: number, speed: number, playing: boolean) {
    this.time = time; this.speed = speed; this.playing = playing;
  }
  rebase() { this.last = null; }
  tick(now: number, hidden = false): number {
    const elapsed = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = hidden ? null : now;
    if (this.playing && !hidden) this.time += elapsed * this.speed;
    return this.time;
  }
}
