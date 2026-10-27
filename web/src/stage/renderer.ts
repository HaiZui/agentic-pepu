import { gsap } from "gsap";
import { ensureDefs, renderProscenium, type HouseId, type Proscenium } from "../render";
import { frame, framingZoom } from "../shared/panels";
import { Actors } from "./actors";
import { Lettering } from "./bubbles";
import { Camera, PARALLAX } from "./camera";
import { CastSheet } from "./cast";
import { IMPACT_CUES, NARRATOR } from "./compiler";
import { createStage, type StageLayers } from "./dom";
import { Overlays, type ShowTexts } from "./overlays";
import { PanelView } from "./panels-view";
import { Particles, presetsFor } from "./particles";
import type { Renderer } from "./player";
import { SceneryLayers } from "./scenery-layer";
import "./stage.css";
import { MOMENT } from "./timing";
import type { FateScript, StageState, Step } from "./types";

const IMPACT = new Set<string>(IMPACT_CUES);

/** Draws the show with GSAP timelines; every timeline lives on the global timeline (pause and speed). */
export class StageRenderer implements Renderer {
  readonly layers: StageLayers & { fit(): void; destroy(): void };
  readonly cast: CastSheet;
  readonly particles: Particles;
  private readonly camera = new Camera();
  private readonly actors: Actors;
  private readonly lettering: Lettering;
  private readonly overlays: Overlays;
  private readonly panels: PanelView;
  private readonly scenery: SceneryLayers;
  private readonly proscenium: Proscenium;
  private readonly curtain = { open: 0 };
  private tl: gsap.core.Timeline | null = null;

  constructor(
    host: HTMLElement,
    private readonly fate: FateScript,
    texts: ShowTexts,
  ) {
    ensureDefs("stage");
    this.layers = createStage(host);
    this.cast = new CastSheet(fate);
    const l = this.layers;
    this.actors = new Actors(l.puppets, l.crowd, this.cast);
    this.lettering = new Lettering(l.bubbles);
    this.overlays = new Overlays(l.overlays, fate, this.cast, texts);
    this.panels = new PanelView(l.panels, this.cast);
    this.scenery = new SceneryLayers(l.backRaster, l.back, l.mid, l.front);
    this.particles = new Particles(l.particles);
    this.proscenium = renderProscenium();
    l.proscenium.append(this.proscenium.root);

    this.camera.add(l.backRaster, PARALLAX.back);
    this.camera.add(l.back, PARALLAX.back);
    this.camera.add(l.mid, PARALLAX.mid);
    this.camera.add(l.crowd, PARALLAX.crowd);
    this.camera.add(l.puppets, PARALLAX.puppets);
    this.camera.add(l.particles, PARALLAX.particles, false);
    this.camera.add(l.front, PARALLAX.front);
    this.camera.onChange(this.lettering.reposition);
    this.camera.apply();
  }

  destroy(): void {
    this.stop();
    this.particles.destroy();
    this.layers.destroy();
  }

  private setCurtain = () => this.proscenium.setCurtains(this.curtain.open);

  private curtainTo(tl: gsap.core.Timeline, at: number, open: boolean, duration = 1.2): void {
    tl.to(this.curtain, { open: open ? 1 : 0, duration, ease: open ? "power2.inOut" : "power2.in", onUpdate: this.setCurtain }, at);
  }

  private banners(state: StageState): HouseId[] {
    const houses = new Set<HouseId>();
    for (const p of state.onStage) {
      const house = this.cast.get(p.id)?.house;
      if (house) houses.add(house);
    }
    return [...houses].slice(0, 4);
  }

  private particlesFor(state: StageState, step?: Step): void {
    const beat = state.beat !== null ? this.fate.beats[state.beat] : undefined;
    if (state.section === "credits" || state.curtain === "closed") return this.particles.set([]);
    if (step?.kind === "coronation" || state.crowned) return this.particles.set(["confetti", "petals"]);
    this.particles.set(presetsFor(state.setting, state.mood, beat?.card));
  }

  private letterbox(on: boolean, tl?: gsap.core.Timeline, at = 0): void {
    const bars = this.layers.letterbox;
    if (tl) tl.to(bars, { "--bar": on ? "84px" : "0px", duration: 0.6, ease: "power2.inOut" }, at);
    else bars.style.setProperty("--bar", on ? "84px" : "0px");
  }

  apply(state: StageState): void {
    this.camera.set(null);
    this.lettering.clear();
    this.panels.clear();
    this.cast.crowned = state.crowned !== null;
    const credits = state.section === "credits";
    this.overlays.apply({ seal: state.seal, rollHouse: state.rollCall ? state.rollCall.house : undefined, credits });
    this.scenery.set(state.setting, this.banners(state));
    this.curtain.open = state.curtain === "open" ? 1 : 0;
    this.setCurtain();
    this.letterbox(state.dramatic);
    if (state.rollCall) {
      this.actors.apply(state.rollCall.members.map((id, i) => ({ id, layer: "fore" as const, x: rollX(i, state.rollCall!.members.length), emotion: "neutral" as const })));
    } else {
      this.actors.apply(credits ? [] : state.onStage);
    }
    this.particlesFor(state);
  }

  stop(): void {
    if (this.tl) {
      this.tl.kill();
      this.tl = null;
    }
  }

  interlude(on: boolean): void {
    this.stop();
    if (on) {
      const tl = gsap.timeline();
      this.tl = tl;
      this.lettering.clear();
      this.panels.clear();
      this.curtainTo(tl, 0, false, 0.8);
      tl.call(() => this.particles.set([]), undefined, 0.8);
    }
    this.overlays.interlude(on);
  }

  play(step: Step, previous: StageState): void {
    // Finish the previous step so its scheduled clean-ups (removing logos, bubbles, panels) still run.
    this.tl?.progress(1);
    this.stop();
    const tl = gsap.timeline();
    this.tl = tl;
    const d = step.durationAt1x;
    const next = step.stateAfter;

    switch (step.kind) {
      case "curtain":
        this.scenery.set(next.setting);
        this.overlays.logo(tl, 0.2, d);
        this.curtainTo(tl, MOMENT.curtainOpens, step.open, 2.2);
        tl.call(() => this.particlesFor(next), undefined, 0.5);
        break;
      case "seal":
        this.overlays.seal(tl, 0, d);
        this.camera.shake(tl, 0.45, 18);
        break;
      case "old_king": {
        this.actors.transition(tl, 0, next.onStage, "drop");
        const king = this.cast.get(step.character);
        const title = king?.character.name === "the Mad King" ? "the Mad King" : `Old King ${this.cast.name(step.character)}`;
        this.overlays.caption(tl, 0.6, d - 0.6, `By royal decree of ${title}, the peasants of the realm are summoned!`);
        break;
      }
      case "roll_call": {
        this.overlays.rollCall(tl, 0, step.house);
        this.actors.dismissAll(tl, 0, true);
        const members = step.members.map((id, i) => ({ id, layer: "fore" as const, x: rollX(i, step.members.length), emotion: "neutral" as const }));
        this.actors.transition(tl, 0.55, members, "drop");
        break;
      }
      case "title_card":
        this.lettering.hideBubble(tl, 0);
        this.lettering.hideCaption(tl, 0);
        this.overlays.hideCornerSeal(tl, 0);
        this.overlays.hideRollCall(tl, 0);
        this.curtainTo(tl, 0, false, 0.7);
        this.letterbox(false, tl, 0);
        this.camera.moveTo(tl, 0, null, 0.6);
        tl.call(() => {
          this.actors.clear();
          this.particles.set([], true);
        }, undefined, 0.75);
        this.overlays.titleCard(tl, 0, d, step.act);
        break;
      case "scenery_change":
        this.sceneryChange(tl, step, previous, next, d);
        break;
      case "enter":
        this.actors.transition(tl, 0, next.onStage);
        break;
      case "caption":
        this.lettering.hideBubble(tl, 0);
        this.lettering.captionBox(tl, 0, step.text);
        break;
      case "line":
        this.line(tl, step, d);
        break;
      case "action":
        this.lettering.hideBubble(tl, 0);
        if (previous.onStage.some((p) => p.id === step.character && p.layer === "fore")) {
          this.camera.moveTo(tl, 0, frame("medium", [step.character], previous.onStage), 0.5);
        }
        this.actors.leave(tl, MOMENT.actionStart, step.character, step.action, 960);
        if (step.action === "fall") this.camera.shake(tl, 0.55, 16);
        break;
      case "panel_break":
        this.lettering.hideBubble(tl, 0);
        this.camera.shake(tl, 0, 10, 0.3);
        this.panels.panelBreak(tl, 0, d, step.panels, step.sounds);
        break;
      case "montage":
        this.lettering.hideBubble(tl, 0);
        this.panels.montage(tl, 0, d, step.victims);
        tl.call(() => this.actors.apply(next.onStage), undefined, d - 0.3);
        break;
      case "tableau":
        this.lettering.hideBubble(tl, 0.4);
        this.camera.moveTo(tl, 0, null, Math.min(d, 2.5), "sine.inOut");
        break;
      case "coronation":
        this.lettering.hideBubble(tl, 0);
        this.lettering.hideCaption(tl, 0);
        this.cast.crowned = true;
        this.camera.moveTo(tl, 0, null, 0.6);
        this.actors.crownWinner(tl, 0, step.winner);
        this.overlays.coronation(tl, 0, d, step.winner);
        tl.call(() => this.particles.set(["confetti", "petals"]), undefined, MOMENT.coronationName);
        this.camera.shake(tl, MOMENT.coronationName + 0.05, 12);
        break;
      case "credits":
        this.lettering.clear();
        this.curtainTo(tl, 0, false, 1);
        this.letterbox(false, tl, 0);
        tl.call(() => {
          this.actors.clear();
          this.particles.set([], true);
        }, undefined, 1);
        this.overlays.credits(tl, 0);
        break;
      case "interlude":
        break;
    }
  }

  private sceneryChange(tl: gsap.core.Timeline, step: Extract<Step, { kind: "scenery_change" }>, previous: StageState, next: StageState, d: number): void {
    const closed = previous.curtain === "closed" || this.curtain.open < 0.5;
    this.lettering.hideBubble(tl, 0);
    this.lettering.hideCaption(tl, 0);
    this.overlays.hideCornerSeal(tl, 0);
    this.overlays.hideRollCall(tl, 0);
    this.camera.moveTo(tl, 0, null, 0.5);
    const swapAt = closed ? 0.05 : 0.6;
    if (!closed) {
      this.actors.dismissAll(tl, 0, false);
      this.curtainTo(tl, 0, false, 0.55);
    }
    tl.call(() => {
      this.actors.clear();
      this.scenery.set(step.setting, this.banners({ ...next, onStage: [] }));
      this.particlesFor(next, step);
    }, undefined, swapAt);
    this.letterbox(next.dramatic, tl, swapAt);
    this.curtainTo(tl, swapAt + 0.05, true, closed ? 1.2 : 0.8);
    this.lettering.captionBox(tl, swapAt + 0.3, step.title, "title");
    this.lettering.hideCaption(tl, Math.max(d - 0.3, swapAt + 1.2));
  }

  private line(tl: gsap.core.Timeline, step: Extract<Step, { kind: "line" }>, d: number): void {
    const next = step.stateAfter;
    this.actors.transition(tl, 0, next.onStage);
    const narrator = step.speaker === NARRATOR || !this.actors.has(step.speaker) && !next.onStage.some((p) => p.id === step.speaker);
    const at = MOMENT.bubble;

    if (step.camera && framingZoom(step.camera.framing) > 1.05 && step.camera.framing !== "splash") {
      this.camera.moveTo(tl, 0, frame(step.camera.framing, step.camera.focus.length > 0 ? step.camera.focus : [step.speaker], next.onStage), 0.8);
    } else if (this.camera.view.zoom > 1.01) {
      this.camera.moveTo(tl, 0, null, 0.8);
    }
    if (step.camera?.framing === "splash") this.camera.shake(tl, 0.3, 10);

    if (!narrator) {
      this.actors.speak(tl, at, step.speaker, Math.min(d, 2.5));
    }
    for (const gesture of step.gestures) this.actors.gesture(tl, at, gesture.character, gesture.action, d);
    this.lettering.line(tl, at, {
      name: this.cast.name(step.speaker),
      text: step.text,
      anchor: narrator ? null : () => {
        const head = this.actors.head(step.speaker);
        return head ? this.camera.toScreen(head.x, head.y) : null;
      },
      hold: d,
      shout: step.emotion === "furious" || step.emotion === "triumphant",
    });
    step.sounds.forEach((sound, i) => {
      const head = this.actors.head(step.speaker) ?? { x: 960, y: 420 };
      const screen = this.camera.toScreen(head.x, head.y);
      this.lettering.sound(tl, MOMENT.sound + i * MOMENT.soundGap, sound, screen.x + (i % 2 ? -260 : 260), Math.max(160, screen.y - 140));
    });
    if (step.sounds.length > 0 || step.cues.some((c) => IMPACT.has(c)) || step.gestures.some((g) => g.action === "strike")) {
      this.camera.shake(tl, at + 0.45, 12);
    }
  }
}

/** Roll-call row positions: everyone in one row, centred, at most 190 px apart. */
export function rollX(index: number, count: number): number {
  const spacing = Math.min(190, 1500 / Math.max(count - 1, 1));
  return Math.round(960 - ((count - 1) * spacing) / 2 + index * spacing);
}
