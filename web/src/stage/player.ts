import type { Clock, Wait } from "./clock";
import { IMPACT_CUES, sectionRank, type Program } from "./compiler";
import { EventBus, type StageEvents } from "./events";
import { MOMENT } from "./timing";
import type { Segment, StageState, Step } from "./types";

/** Draws the stage. `play` starts a step's animation; the player decides when the step is over. */
export interface Renderer {
  /** Redraw a moment instantly (used at start and after every jump). */
  apply(state: StageState): void;
  play(step: Step, previous: StageState): void;
  /** Stop and discard the running step's animations. */
  stop(): void;
  /** Close the curtain with an interlude while a scene is still being written. */
  interlude(on: boolean): void;
}

export interface Position {
  segment: number;
  step: number;
}

export const SPEEDS = [0.5, 1, 1.5, 2] as const;

export interface PlayerOptions {
  /** Highest speed accepted by `setSpeed` (the hidden ?speed= test hook may go up to 10). */
  maxSpeed?: number;
  speed?: number;
}

const key = (p: Position) => `${p.segment}:${p.step}`;

export class Player {
  readonly bus = new EventBus<StageEvents>();
  private pos: Position = { segment: 0, step: 0 };
  private state: StageState;
  private played = new Set<string>();
  private generation = 0;
  private wait: Wait | null = null;
  private wake: (() => void) | null = null;
  private inInterlude = false;
  private finished = false;
  private stopped = false;
  private _paused = false;
  private _speed = 1;
  private readonly maxSpeed: number;

  constructor(
    private readonly program: Program,
    private readonly renderer: Renderer,
    private readonly clock: Clock,
    options: PlayerOptions = {},
  ) {
    this.state = program.segments[0].stateBefore;
    this.maxSpeed = options.maxSpeed ?? 2;
    if (options.speed) this.setSpeed(options.speed);
  }

  get paused(): boolean {
    return this._paused;
  }

  get speed(): number {
    return this._speed;
  }

  get position(): Position {
    return { ...this.pos };
  }

  get ended(): boolean {
    return this.finished;
  }

  get currentStep(): Step | null {
    return this.program.segments[this.pos.segment]?.steps?.[this.pos.step] ?? null;
  }

  get currentState(): StageState {
    return this.state;
  }

  /** Plays from the current position to the end of the credits. */
  async run(): Promise<void> {
    this.renderer.apply(this.state);
    const segments = this.program.segments;
    while (this.pos.segment < segments.length) {
      const segment = segments[this.pos.segment];
      if (!segment.steps) {
        await this.awaitScene(segment);
        if (this.stopped) return;
        continue;
      }
      if (this.pos.step >= segment.steps.length) {
        this.pos = { segment: this.pos.segment + 1, step: 0 };
        continue;
      }
      const step = segment.steps[this.pos.step];
      const generation = this.generation;
      this.begin(step);
      this.wait = this.clock.wait(step.durationAt1x);
      await this.wait.done;
      if (this.stopped) return;
      if (generation !== this.generation) continue;
      this.state = step.stateAfter;
      this.pos = { ...this.pos, step: this.pos.step + 1 };
    }
    this.finished = true;
    this.bus.emit("show:end", {});
  }

  /** Call when a scene has been compiled into the program; a waiting interlude ends. */
  sceneAdded(): void {
    this.wake?.();
  }

  /** Ends playback for good (the stage is being torn down). */
  stop(): void {
    this.stopped = true;
    this.generation++;
    this.wait?.cancel();
    this.wake?.();
  }

  private begin(step: Step): void {
    this.played.add(key(this.pos));
    const previous = this.state;
    this.renderer.play(step, previous);
    this.bus.emit("step:start", { step, previous });
    const mood = step.stateAfter.mood;
    if (mood && mood !== previous.mood) this.bus.emit("music:mood", { mood });
    if (step.kind === "line") {
      this.bus.emit("line:start", { step });
      const first = step.sounds.length > 0 ? MOMENT.sound : MOMENT.bubble;
      const impact = step.cues.findIndex((sfx) => IMPACT_CUES.includes(sfx));
      step.cues.forEach((sfx, i) =>
        this.bus.emit("cue", {
          sfx,
          step,
          at: first + i * MOMENT.soundGap,
          ...(i === impact && step.preSilenceMs ? { preSilenceMs: step.preSilenceMs } : {}),
        }),
      );
    }
  }

  private async awaitScene(segment: Segment): Promise<void> {
    const generation = this.generation;
    this.inInterlude = true;
    this.renderer.interlude(true);
    this.bus.emit("step:start", {
      step: {
        kind: "interlude",
        beat: segment.beat,
        section: segment.section,
        durationAt1x: 0,
        stateAfter: segment.stateBefore,
      },
      previous: this.state,
    });
    while (!segment.steps && generation === this.generation) {
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
    this.wake = null;
    this.inInterlude = false;
    if (this.stopped) return;
    this.renderer.interlude(false);
    if (generation === this.generation) {
      // The interlude left the curtain closed; the scene's first step opens it again.
      this.state = { ...segment.stateBefore, curtain: "closed" };
      this.renderer.apply(this.state);
    }
  }

  // --- presenter controls -------------------------------------------------------------------------

  pause(): void {
    if (this._paused || this.finished) return;
    this._paused = true;
    this.clock.setPaused(true);
    this.bus.emit("pause", {});
  }

  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this.clock.setPaused(false);
    this.bus.emit("resume", {});
  }

  togglePause(): void {
    if (this._paused) this.resume();
    else this.pause();
  }

  setSpeed(speed: number): void {
    const clamped = Math.min(this.maxSpeed, Math.max(SPEEDS[0], speed));
    if (clamped === this._speed) return;
    this._speed = clamped;
    this.clock.setSpeed(clamped);
    this.bus.emit("speed", { speed: clamped });
  }

  faster(): void {
    const next = SPEEDS.find((s) => s > this._speed);
    if (next) this.setSpeed(next);
  }

  slower(): void {
    const previous = [...SPEEDS].reverse().find((s) => s < this._speed);
    if (previous) this.setSpeed(previous);
  }

  nextLine(): void {
    const target = this.find(1, (step) => step.kind === "line", true);
    if (target) this.jump(target);
  }

  previousLine(): void {
    const current = this.currentLinePosition();
    const from = current ?? this.pos;
    const target = this.search(from, -1, (step, p) => step.kind === "line" && this.played.has(key(p)));
    if (target) this.jump(target);
  }

  nextScene(): void {
    if (this.pos.segment + 1 < this.program.segments.length) this.jump({ segment: this.pos.segment + 1, step: 0 });
  }

  previousScene(): void {
    for (let s = this.pos.segment - 1; s >= 0; s--) {
      if (this.played.has(key({ segment: s, step: 0 }))) return this.jump({ segment: s, step: 0 });
    }
  }

  /** Jump to the start of the next act; skipped beats still take effect through the segment state. */
  skipAct(): void {
    const segments = this.program.segments;
    const rank = sectionRank(segments[this.pos.segment]?.section ?? "credits");
    const target = segments.findIndex((s, i) => i > this.pos.segment && sectionRank(s.section) > rank);
    if (target >= 0) this.jump({ segment: target, step: 0 });
  }

  /** The line step currently showing (the latest line at or before the position in this segment). */
  private currentLinePosition(): Position | null {
    const steps = this.program.segments[this.pos.segment]?.steps ?? [];
    for (let i = Math.min(this.pos.step, steps.length - 1); i >= 0; i--) {
      if (steps[i].kind === "line") return { segment: this.pos.segment, step: i };
    }
    return null;
  }

  /** Next step forward matching `match`; a pending segment on the way is returned as its start. */
  private find(direction: 1, match: (step: Step) => boolean, stopAtPending: boolean): Position | null {
    const segments = this.program.segments;
    let p = { ...this.pos };
    for (;;) {
      p = { segment: p.segment, step: p.step + direction };
      const segment = segments[p.segment];
      if (!segment) return null;
      if (!segment.steps) return stopAtPending ? { segment: p.segment, step: 0 } : null;
      if (p.step >= segment.steps.length) {
        p = { segment: p.segment + 1, step: -1 };
        if (p.segment >= segments.length) return null;
        continue;
      }
      if (match(segment.steps[p.step])) return p;
    }
  }

  private search(from: Position, direction: -1, match: (step: Step, p: Position) => boolean): Position | null {
    const segments = this.program.segments;
    let p = { ...from };
    for (;;) {
      p = { segment: p.segment, step: p.step + direction };
      if (p.step < 0) {
        const previous = p.segment - 1;
        if (previous < 0) return null;
        p = { segment: previous, step: segments[previous].steps?.length ?? 0 };
        continue;
      }
      const step = segments[p.segment].steps?.[p.step];
      if (step && match(step, p)) return p;
    }
  }

  /** First music mood from `p` onward in its segment (title cards come before the scene sets one). */
  private upcomingMood(p: Position): StageState["mood"] {
    const steps = this.program.segments[p.segment]?.steps ?? [];
    return steps.slice(p.step).find((s) => s.stateAfter.mood)?.stateAfter.mood ?? null;
  }

  private stateBefore(p: Position): StageState {
    const segment = this.program.segments[p.segment];
    return p.step === 0 || !segment.steps ? segment.stateBefore : segment.steps[p.step - 1].stateAfter;
  }

  private jump(target: Position): void {
    if (this.finished) return;
    this.generation++;
    this.wait?.cancel();
    this.renderer.stop();
    if (this.inInterlude) this.wake?.();
    this.pos = target;
    const previousMood = this.state.mood;
    this.state = this.stateBefore(target);
    this.renderer.apply(this.state);
    this.bus.emit("seek", { state: this.state, upcomingMood: this.upcomingMood(target) });
    if (this.state.mood && this.state.mood !== previousMood) this.bus.emit("music:mood", { mood: this.state.mood });
  }
}
