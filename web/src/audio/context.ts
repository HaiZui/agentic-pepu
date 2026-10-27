import { AudioEngine, type ContextLike } from "./engine";
import { attributionLines, fetchManifest, loadSounds, type LoadReport } from "./loader";

let engine: AudioEngine | null = null;
let loading: Promise<LoadReport> | null = null;
let attributions: Promise<string[]> | null = null;

/** The page-wide engine; it survives client-side navigation from the setup screen to the show. */
export function sharedEngine(): AudioEngine | null {
  if (engine) return engine;
  const Ctor = globalThis.AudioContext;
  if (!Ctor) return null;
  try {
    engine = new AudioEngine(new Ctor({ latencyHint: "interactive" }) as unknown as ContextLike);
  } catch (error) {
    console.warn("Web Audio is unavailable; the show will be silent", error);
    return null;
  }
  return engine;
}

/** Call synchronously inside a click handler: browsers only let audio start after a user gesture. */
export function unlockAudio(): void {
  sharedEngine()?.resume();
}

export function audioBlocked(): boolean {
  const e = sharedEngine();
  return !!e && e.context.state !== "running";
}

/** Fetch and decode every sound once per page; later calls share the same result. */
export function preloadAudio(): Promise<LoadReport> {
  const e = sharedEngine();
  if (!e) return Promise.resolve({ loaded: [], missing: [] });
  loading ??= loadSounds(e);
  return loading;
}

export function audioAttributions(): Promise<string[]> {
  attributions ??= fetchManifest().then(attributionLines);
  return attributions;
}
