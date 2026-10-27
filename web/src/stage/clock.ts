import { gsap } from "gsap";

export interface Wait {
  /** Resolves true when the time has elapsed, false when cancelled. */
  done: Promise<boolean>;
  cancel(): void;
}

/** Show time: pauses and scales together with every animation on stage. */
export interface Clock {
  wait(seconds: number): Wait;
  setPaused(paused: boolean): void;
  setSpeed(speed: number): void;
}

/** Production clock on GSAP's global timeline, which also drives every stage animation. */
export class GsapClock implements Clock {
  wait(seconds: number): Wait {
    let resolve!: (value: boolean) => void;
    const done = new Promise<boolean>((r) => (resolve = r));
    const call = gsap.delayedCall(seconds, () => resolve(true));
    return {
      done,
      cancel: () => {
        call.kill();
        resolve(false);
      },
    };
  }

  setPaused(paused: boolean): void {
    if (paused) gsap.globalTimeline.pause();
    else gsap.globalTimeline.resume();
  }

  setSpeed(speed: number): void {
    gsap.globalTimeline.timeScale(speed);
  }
}

interface Timer {
  remaining: number;
  resolve: (value: boolean) => void;
}

/** Deterministic clock for tests: time only moves when `advance` is called. */
export class ManualClock implements Clock {
  elapsed = 0;
  paused = false;
  speed = 1;
  private timers: Timer[] = [];

  wait(seconds: number): Wait {
    let resolve!: (value: boolean) => void;
    const done = new Promise<boolean>((r) => (resolve = r));
    const timer = { remaining: seconds, resolve };
    this.timers.push(timer);
    return {
      done,
      cancel: () => {
        this.timers = this.timers.filter((t) => t !== timer);
        resolve(false);
      },
    };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  get pending(): number {
    return this.timers.length;
  }

  /** Advance real (wall-clock) seconds, firing timers in order and letting awaiting code run. */
  async advance(realSeconds: number): Promise<void> {
    // Let code that was just woken up (for example by a cancelled wait) schedule its timers first.
    await flush();
    let left = realSeconds;
    while (left > 1e-9 && !this.paused) {
      const next = this.timers.reduce<Timer | null>((a, t) => (!a || t.remaining < a.remaining ? t : a), null);
      const toNext = next ? next.remaining / this.speed : Infinity;
      const dt = Math.min(left, toNext);
      left -= dt;
      this.elapsed += dt * this.speed;
      for (const t of this.timers) t.remaining -= dt * this.speed;
      const due = this.timers.filter((t) => t.remaining <= 1e-9);
      this.timers = this.timers.filter((t) => t.remaining > 1e-9);
      due.forEach((t) => t.resolve(true));
      await flush();
    }
    await flush();
  }

  /** Run until nothing is waiting any more (or a safety limit of show seconds passes). */
  async runOut(limitSeconds = 3600): Promise<void> {
    const start = this.elapsed;
    await flush();
    while (this.timers.length > 0 && !this.paused && this.elapsed - start < limitSeconds) {
      const next = Math.min(...this.timers.map((t) => t.remaining));
      await this.advance(next / this.speed);
    }
  }
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
