import { el } from "../dom";
import type { Player } from "./player";
import type { FateScript, Step } from "./types";

const IDLE_MS = 3000;

export const SHORTCUTS: [string, string][] = [
  ["Space", "Pause / resume"],
  ["→ / ←", "Next / previous line"],
  ["Shift + → / ←", "Next / previous scene"],
  ["+ / −", "Faster / slower (0.5x – 2x)"],
  ["N", "Skip to the next act"],
  ["M", "Mute / unmute sound"],
  ["↑ / ↓", "Volume up / down"],
  ["F", "Fullscreen"],
  ["H", "Show / hide the controls"],
  ["?", "This help (pauses the show)"],
];

const SECTION_LABEL: Record<string, string> = {
  cold_open: "Cold open",
  act_1: "Act I",
  act_2: "Act II",
  act_3: "Act III",
  coronation: "Coronation",
  credits: "Credits",
};

function button(label: string, title: string, action: () => void, testId: string): HTMLButtonElement {
  const b = el("button", { type: "button", class: "hud-button", title, "aria-label": title, "data-testid": testId }, label);
  b.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
    b.blur();
  });
  return b;
}

/** Sound controls offered by the audio engine (absent when the browser has no Web Audio). */
export interface AudioControls {
  toggleMute(): void;
  louder(): void;
  quieter(): void;
  label(): string;
}

/** Presenter controls: keyboard shortcuts, an auto-hiding HUD and the "?" help overlay. */
export function createHud(viewport: HTMLElement, player: Player, fate: FateScript, audio?: AudioControls): () => void {
  const status = el("span", { class: "hud-status", "data-testid": "hud-status" }, "");
  const speed = el("span", { class: "hud-speed", "data-testid": "hud-speed" }, "1x");
  const volume = el("span", { class: "hud-volume", "data-testid": "hud-volume" }, audio?.label() ?? "");
  const sound = (action: () => void) => () => {
    action();
    volume.textContent = audio?.label() ?? "";
  };
  const playButton = button("❚❚", "Pause (Space)", () => player.togglePause(), "hud-play");
  const help = el(
    "div",
    { class: "hud-help", role: "dialog", "aria-label": "Shortcuts", hidden: true, "data-testid": "help" },
    el("h2", {}, "Presenter shortcuts"),
    el("dl", {}, ...SHORTCUTS.flatMap(([key, text]) => [el("dt", {}, key), el("dd", {}, text)])),
    el("p", { class: "hint" }, "Press ? or Esc to continue."),
  );
  const bar = el(
    "div",
    { class: "hud", "data-testid": "hud" },
    button("⏮", "Previous scene (Shift+←)", () => player.previousScene(), "hud-prev-scene"),
    button("◀", "Previous line (←)", () => player.previousLine(), "hud-prev-line"),
    playButton,
    button("▶", "Next line (→)", () => player.nextLine(), "hud-next-line"),
    button("⏭", "Next scene (Shift+→)", () => player.nextScene(), "hud-next-scene"),
    button("Skip act", "Skip to the next act (N)", () => player.skipAct(), "hud-skip-act"),
    button("−", "Slower (−)", () => player.slower(), "hud-slower"),
    speed,
    button("+", "Faster (+)", () => player.faster(), "hud-faster"),
    status,
    ...(audio
      ? [
          button("🔇", "Mute (M)", sound(audio.toggleMute), "hud-mute"),
          button("🔉", "Quieter (↓)", sound(audio.quieter), "hud-quieter"),
          volume,
          button("🔊", "Louder (↑)", sound(audio.louder), "hud-louder"),
        ]
      : []),
    button("⛶", "Fullscreen (F)", () => toggleFullscreen(), "hud-fullscreen"),
    button("?", "Shortcuts (?)", () => toggleHelp(), "hud-help"),
  );
  viewport.append(bar, help);

  let pinned: boolean | null = null;
  let idleTimer = 0;
  let pausedByHelp = false;

  const setVisible = (visible: boolean) => {
    bar.classList.toggle("visible", visible);
    viewport.classList.toggle("idle", !visible && help.hidden);
  };
  const poke = () => {
    if (pinned === false) return;
    setVisible(true);
    window.clearTimeout(idleTimer);
    if (pinned !== true) idleTimer = window.setTimeout(() => setVisible(false), IDLE_MS);
  };
  const toggleHud = () => {
    pinned = bar.classList.contains("visible") ? false : true;
    window.clearTimeout(idleTimer);
    setVisible(pinned);
    if (!pinned) window.setTimeout(() => (pinned = null), IDLE_MS);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewport.requestFullscreen?.().catch(() => undefined);
  };
  const toggleHelp = () => {
    if (help.hidden) {
      help.hidden = false;
      pausedByHelp = !player.paused;
      player.pause();
    } else {
      help.hidden = true;
      if (pausedByHelp) player.resume();
      pausedByHelp = false;
    }
    setVisible(bar.classList.contains("visible"));
  };

  const refresh = (step?: Step) => {
    playButton.textContent = player.paused ? "▶︎" : "❚❚";
    playButton.title = player.paused ? "Resume (Space)" : "Pause (Space)";
    speed.textContent = `${player.speed}x`;
    if (step) {
      const beat = step.beat !== null ? fate.beats[step.beat] : null;
      status.textContent = [SECTION_LABEL[step.section], beat?.title].filter(Boolean).join(" · ");
      if (step.kind === "interlude") status.textContent += " · waiting for the scribes";
    }
  };
  const offs = [
    player.bus.on("step:start", ({ step }) => refresh(step)),
    player.bus.on("pause", () => refresh()),
    player.bus.on("resume", () => refresh()),
    player.bus.on("speed", () => refresh()),
  ];

  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (!help.hidden && (event.key === "Escape" || event.key === "?")) {
      event.preventDefault();
      return toggleHelp();
    }
    const key = event.key;
    const handled = (() => {
      switch (key) {
        case " ":
          player.togglePause();
          return true;
        case "ArrowRight":
          if (event.shiftKey) player.nextScene();
          else player.nextLine();
          return true;
        case "ArrowLeft":
          if (event.shiftKey) player.previousScene();
          else player.previousLine();
          return true;
        case "+":
        case "=":
          player.faster();
          return true;
        case "-":
        case "_":
          player.slower();
          return true;
        case "n":
        case "N":
          player.skipAct();
          return true;
        case "m":
        case "M":
          if (!audio) return false;
          sound(audio.toggleMute)();
          return true;
        case "ArrowUp":
          if (!audio) return false;
          sound(audio.louder)();
          return true;
        case "ArrowDown":
          if (!audio) return false;
          sound(audio.quieter)();
          return true;
        case "f":
        case "F":
          toggleFullscreen();
          return true;
        case "h":
        case "H":
          toggleHud();
          return true;
        case "?":
          toggleHelp();
          return true;
        default:
          return false;
      }
    })();
    if (handled) {
      event.preventDefault();
      if (key !== "h" && key !== "H") poke();
    }
  };

  window.addEventListener("keydown", onKey);
  viewport.addEventListener("mousemove", poke);
  help.addEventListener("click", toggleHelp);
  setVisible(false);
  refresh();

  return () => {
    window.removeEventListener("keydown", onKey);
    viewport.removeEventListener("mousemove", poke);
    window.clearTimeout(idleTimer);
    offs.forEach((off) => off());
    bar.remove();
    help.remove();
  };
}
