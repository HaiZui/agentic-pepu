import { connectAudio } from "../audio/bridge";
import { audioAttributions, audioBlocked, preloadAudio, sharedEngine, unlockAudio } from "../audio/context";
import { el } from "../dom";
import { GsapClock } from "./clock";
import { addScene, createProgram, type Program } from "./compiler";
import { createHud, type AudioControls } from "./hud";
import type { ShowTexts } from "./overlays";
import { Player } from "./player";
import { StageRenderer } from "./renderer";
import type { FateScript, SceneScript } from "./types";

export interface MountedStage {
  program: Program;
  player: Player;
  renderer: StageRenderer;
  texts: ShowTexts;
  addScene(scene: SceneScript): void;
  destroy(): void;
}

export interface MountOptions {
  fate: FateScript;
  scenes?: readonly SceneScript[];
  /** A hand-built program (dev demos); defaults to the whole show. */
  program?: Program;
  texts?: Partial<ShowTexts>;
  speed?: number;
  /** Highest speed the hidden ?speed= test hook may set. */
  maxSpeed?: number;
  hud?: boolean;
  /** Music and sound effects (default on). */
  audio?: boolean;
}

/** One-time banner for when the browser kept audio blocked despite the START click. */
function enableBanner(viewport: HTMLElement): void {
  const banner = el("button", { type: "button", class: "audio-banner", "data-testid": "audio-banner" }, "🔈 Click to enable sound");
  banner.addEventListener("click", (event) => {
    event.stopPropagation();
    unlockAudio();
    banner.remove();
  });
  viewport.append(banner);
  window.setTimeout(() => banner.remove(), 15000);
}

/** Builds the program, the stage and the presenter controls inside `host`. Call `player.run()` to start. */
export function mountStage(host: HTMLElement, options: MountOptions): MountedStage {
  const texts: ShowTexts = { bible: null, chronicle: null, reveal: async () => null, ...options.texts };
  const program = options.program ?? createProgram(options.fate, options.scenes ?? []);
  const renderer = new StageRenderer(host, options.fate, texts);
  const clock = new GsapClock();
  clock.setPaused(false);
  clock.setSpeed(1);
  const player = new Player(program, renderer, clock, { maxSpeed: options.maxSpeed ?? 2, speed: options.speed });
  const engine = options.audio === false ? null : sharedEngine();
  let disconnectAudio = () => undefined as void;
  let audio: AudioControls | undefined;
  if (engine) {
    void preloadAudio();
    void audioAttributions().then((lines) => (texts.attributions = lines));
    disconnectAudio = connectAudio(engine, player);
    audio = {
      toggleMute: () => engine.toggleMute(),
      louder: () => engine.changeVolume(1),
      quieter: () => engine.changeVolume(-1),
      label: () => (engine.muted ? "muted" : `${Math.round(engine.volume * 100)}%`),
    };
    const offBanner = player.bus.on("step:start", () => {
      offBanner();
      if (audioBlocked() && !player.paused) enableBanner(renderer.layers.viewport);
    });
    // Visible state for diagnostics and end-to-end tests.
    const viewport = renderer.layers.viewport;
    player.bus.on("step:start", () => {
      viewport.dataset.audio = engine.context.state;
      viewport.dataset.music = engine.mood ?? "";
    });
  }
  const removeHud = options.hud === false ? () => undefined : createHud(renderer.layers.viewport, player, options.fate, audio);
  return {
    program,
    player,
    renderer,
    texts,
    addScene: (scene) => {
      if (addScene(program, scene)) player.sceneAdded();
    },
    destroy: () => {
      player.stop();
      disconnectAudio();
      engine?.stopOneShots();
      engine?.stopMusic();
      engine?.resume();
      removeHud();
      renderer.destroy();
      clock.setPaused(false);
      clock.setSpeed(1);
    },
  };
}

/** Speed from the hidden `?speed=` query parameter (automated tests only, up to 10x). */
export function testSpeed(search = location.search): number | undefined {
  const value = Number(new URLSearchParams(search).get("speed"));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10) : undefined;
}
