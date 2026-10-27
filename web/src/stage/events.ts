import type { MusicMood, SfxCue, StageState, Step } from "./types";

export type LineStep = Extract<Step, { kind: "line" }>;

export interface StageEvents {
  "step:start": { step: Step; previous: StageState };
  "line:start": { step: LineStep };
  /** `at` is when the sound belongs, in show seconds (1x) after the step starts. */
  cue: { sfx: SfxCue; step: Step; at: number; preSilenceMs?: number };
  "music:mood": { mood: MusicMood };
  /** The presenter jumped (step, skip): everything still sounding from before is stale. */
  seek: { state: StageState; upcomingMood: MusicMood | null };
  pause: Record<string, never>;
  resume: Record<string, never>;
  speed: { speed: number };
  "show:end": Record<string, never>;
}

type Handler<T> = (payload: T) => void;

/** Tiny typed event bus; the stage emits, audio and the HUD listen. */
export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as Handler<never>);
    this.handlers.set(type, set);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const handler of this.handlers.get(type) ?? []) (handler as Handler<E[K]>)(payload);
  }
}
