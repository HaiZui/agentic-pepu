import type { Player } from "../stage/player";
import type { AudioEngine } from "./engine";
import { stingersFor } from "./schedule";

/** Makes the stage audible: the engine only listens to the player's events and never steers the show. */
export function connectAudio(engine: AudioEngine, player: Player): () => void {
  // Show seconds become real seconds at the current speed; music itself always plays at its own pitch.
  const real = (showSeconds: number) => showSeconds / player.speed;
  const offs = [
    player.bus.on("music:mood", ({ mood }) => engine.setMood(mood)),
    player.bus.on("line:start", () => engine.setDucked(true)),
    player.bus.on("step:start", ({ step, previous }) => {
      if (step.kind !== "line") engine.setDucked(false);
      for (const sound of stingersFor(step, previous)) engine.play(sound.key, real(sound.at));
    }),
    player.bus.on("cue", ({ sfx, at, preSilenceMs }) => engine.play(`sfx/${sfx}`, real(at), { preSilenceMs })),
    player.bus.on("pause", () => engine.suspend()),
    player.bus.on("resume", () => engine.resume()),
    player.bus.on("seek", ({ state, upcomingMood }) => {
      engine.stopOneShots();
      const mood = state.mood ?? upcomingMood;
      if (mood) engine.setMood(mood);
    }),
  ];
  return () => offs.forEach((off) => off());
}
