import { gsap } from "gsap";
import { PUPPET_VIEWBOX, renderCrowdFigure, renderNameCard, renderPuppet, setEmotion } from "../render";
import { SVG_NS } from "../render/svg";
import { FLOOR, FORE_SCALE } from "../shared/panels";
import type { CastSheet } from "./cast";
import { MOMENT } from "./timing";
import type { Action, Emotion, Placement } from "./types";

const BACK_Y = FLOOR - 70;
const BACK_SCALE = 0.95;
const OFFSTAGE_BELOW = 620;
const HEAD_OFFSET = 300 * FORE_SCALE;

interface Pose {
  x: number;
  y: number;
  r: number;
  sx: number;
  sy: number;
}

interface Actor {
  id: string;
  layer: "fore" | "back";
  wrap: SVGGElement;
  puppet: SVGGElement | null;
  pose: Pose;
  emotion: Emotion;
  idle: gsap.core.Animation[];
}

const poses = new WeakMap<Element, Pose>();

function poseOf(element: Element): Pose {
  let pose = poses.get(element);
  if (!pose) {
    pose = { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
    poses.set(element, pose);
  }
  return pose;
}

/** Applies a pose to a puppet part through CSS, so it turns around the part's own pivot. */
function writePart(element: Element): void {
  const p = poseOf(element);
  (element as SVGElement).style.transform =
    `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${p.r.toFixed(2)}deg) scale(${p.sx.toFixed(3)}, ${p.sy.toFixed(3)})`;
}

function writeWrap(actor: Actor): void {
  const p = actor.pose;
  actor.wrap.setAttribute(
    "transform",
    `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.r.toFixed(2)}) scale(${(p.sx).toFixed(3)} ${(p.sy).toFixed(3)})`,
  );
}

/** A standalone articulated puppet (nested viewport, so part pivots work as in the gallery). */
export function puppetNode(cast: CastSheet, id: string, emotion: Emotion, label = true): { node: SVGGElement; puppet: SVGGElement } {
  const member = cast.get(id);
  const puppet = renderPuppet(member ? member.spec(emotion) : { seed: id, traits: { body: 0, head: 0, hair: 0, beard: 0, mark: 0, palette: 0 } });
  const [vx, vy, vw, vh] = PUPPET_VIEWBOX.split(" ").map(Number);
  const viewport = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ x: vx, y: vy, width: vw, height: vh, viewBox: PUPPET_VIEWBOX, overflow: "visible" })) {
    viewport.setAttribute(k, String(v));
  }
  viewport.append(puppet);
  const node = document.createElementNS(SVG_NS, "g");
  node.append(viewport);
  if (label && member) {
    const card = renderNameCard(member.name, member.house);
    card.setAttribute("transform", "translate(0 52) scale(1.1)");
    card.classList.add("actor-label");
    node.append(card);
  }
  return { node, puppet };
}

const part = (actor: Actor, name: string) => actor.puppet?.querySelector(`[data-part="${name}"]`) ?? null;

/** Puppets and background crowd currently on stage. */
export class Actors {
  private actors = new Map<string, Actor>();

  constructor(
    private readonly foreLayer: SVGSVGElement,
    private readonly crowdLayer: SVGSVGElement,
    private readonly cast: CastSheet,
  ) {}

  has(id: string): boolean {
    return this.actors.has(id);
  }

  /** Head position of a foreground puppet, in stage coordinates. */
  head(id: string): { x: number; y: number } | null {
    const actor = this.actors.get(id);
    if (!actor) return null;
    const scale = actor.layer === "fore" ? 1 : BACK_SCALE / FORE_SCALE;
    return { x: actor.pose.x, y: actor.pose.y - HEAD_OFFSET * scale };
  }

  clear(): void {
    for (const actor of this.actors.values()) this.remove(actor);
  }

  /** Redraw placements instantly. */
  apply(placements: readonly Placement[]): void {
    this.clear();
    for (const p of placements) this.create(p);
  }

  private create(p: Placement): Actor {
    const fore = p.layer === "fore";
    let puppet: SVGGElement | null = null;
    let wrap: SVGGElement;
    if (fore) {
      const built = puppetNode(this.cast, p.id, p.emotion);
      wrap = built.node;
      puppet = built.puppet;
    } else {
      const member = this.cast.get(p.id);
      wrap = document.createElementNS(SVG_NS, "g");
      wrap.append(renderCrowdFigure(p.id, member?.color ?? "#6f6253"));
    }
    wrap.classList.add("actor", fore ? "actor-fore" : "actor-back");
    wrap.dataset.character = p.id;
    const actor: Actor = {
      id: p.id,
      layer: p.layer,
      wrap,
      puppet,
      emotion: p.emotion,
      pose: { x: p.x, y: fore ? FLOOR : BACK_Y, r: 0, sx: fore ? FORE_SCALE : BACK_SCALE, sy: fore ? FORE_SCALE : BACK_SCALE },
      idle: [],
    };
    (fore ? this.foreLayer : this.crowdLayer).append(wrap);
    writeWrap(actor);
    this.actors.set(p.id, actor);
    if (fore) this.startIdle(actor);
    return actor;
  }

  private remove(actor: Actor): void {
    actor.idle.forEach((a) => a.kill());
    gsap.killTweensOf(actor.pose);
    actor.wrap.remove();
    this.actors.delete(actor.id);
  }

  private startIdle(actor: Actor): void {
    const figure = part(actor, "figure");
    if (!figure) return;
    const seed = [...actor.id].reduce((t, c) => t + c.charCodeAt(0), 0);
    const pose = poseOf(figure);
    actor.idle.push(
      gsap.to(pose, {
        y: -5,
        r: seed % 2 ? 1.4 : -1.4,
        duration: 1.1 + (seed % 5) * 0.12,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: (seed % 7) * 0.1,
        onUpdate: () => writePart(figure),
      }),
    );
  }

  private tweenWrap(tl: gsap.core.Timeline, at: number, actor: Actor, vars: Partial<Pose>, duration: number, ease = "power2.out"): void {
    tl.to(actor.pose, { ...vars, duration, ease, onUpdate: () => writeWrap(actor) }, at);
  }

  private tweenPart(tl: gsap.core.Timeline, at: number, element: Element | null, vars: Partial<Pose>, duration: number, ease = "power2.out"): void {
    if (!element) return;
    tl.to(poseOf(element), { ...vars, duration, ease, onUpdate: () => writePart(element) }, at);
  }

  /** Animate from what is on stage now to `next`: entrances, exits, slot changes and crowd swaps. */
  transition(tl: gsap.core.Timeline, at: number, next: readonly Placement[], entrance: "rise" | "drop" = "rise"): void {
    const wanted = new Map(next.map((p) => [p.id, p]));
    for (const actor of [...this.actors.values()]) {
      const target = wanted.get(actor.id);
      if (!target || target.layer !== actor.layer) this.dismiss(tl, at, actor, target ? 0.35 : 0.55);
    }
    let stagger = 0;
    for (const p of next) {
      const actor = this.actors.get(p.id);
      if (actor && actor.layer === p.layer) {
        if (Math.abs(actor.pose.x - p.x) > 1) this.tweenWrap(tl, at, actor, { x: p.x }, 0.6, "power2.inOut");
        if (actor.emotion !== p.emotion) this.emote(tl, at, p.id, p.emotion);
        continue;
      }
      const created = this.create(p);
      if (p.layer === "back") {
        created.wrap.style.opacity = "0";
        tl.to(created.wrap, { opacity: 1, duration: 0.5 }, at + 0.1);
        continue;
      }
      const delay = at + Math.min(stagger++ * 0.12, 0.9);
      if (entrance === "drop") {
        created.pose.y = FLOOR - 1100;
        writeWrap(created);
        this.tweenWrap(tl, delay, created, { y: FLOOR }, 0.7, "bounce.out");
      } else {
        created.pose.y = FLOOR + OFFSTAGE_BELOW;
        writeWrap(created);
        this.tweenWrap(tl, delay, created, { y: FLOOR }, 0.65, "back.out(1.6)");
      }
    }
  }

  /** Lift a puppet out (roll call) or sink it into the floor. */
  private dismiss(tl: gsap.core.Timeline, at: number, actor: Actor, duration: number, upward = false): void {
    this.actors.delete(actor.id);
    if (actor.layer === "back") {
      tl.to(actor.wrap, { opacity: 0, duration }, at);
    } else {
      tl.to(actor.pose, { y: upward ? FLOOR - 1200 : FLOOR + OFFSTAGE_BELOW, duration, ease: "power2.in", onUpdate: () => writeWrap(actor) }, at);
    }
    tl.call(() => this.removeDetached(actor), undefined, at + duration);
  }

  private removeDetached(actor: Actor): void {
    actor.idle.forEach((a) => a.kill());
    actor.wrap.remove();
  }

  /** Everyone currently on stage leaves upward (end of a roll-call group) or downward. */
  dismissAll(tl: gsap.core.Timeline, at: number, upward: boolean): void {
    for (const actor of [...this.actors.values()]) this.dismiss(tl, at, actor, 0.5, upward);
  }

  emote(tl: gsap.core.Timeline, at: number, id: string, emotion: Emotion): void {
    const actor = this.actors.get(id);
    if (!actor || !actor.puppet) return;
    actor.emotion = emotion;
    const puppet = actor.puppet;
    const head = part(actor, "head");
    tl.call(() => setEmotion(puppet, emotion), undefined, at);
    this.tweenPart(tl, at, head, { sx: 1.12, sy: 0.9 }, 0.08);
    this.tweenPart(tl, at + 0.08, head, { sx: 1, sy: 1 }, 0.35, "elastic.out(1, 0.4)");
  }

  /** Speaking bob: little hops while the line types out. */
  speak(tl: gsap.core.Timeline, at: number, id: string, seconds: number): void {
    const actor = this.actors.get(id);
    if (!actor || actor.layer !== "fore") return;
    const hops = Math.max(2, Math.min(6, Math.round(seconds * 2.2)));
    const hop = gsap.timeline();
    for (let i = 0; i < hops; i++) {
      hop.to(actor.pose, { y: FLOOR - 12, duration: 0.14, ease: "power1.out", onUpdate: () => writeWrap(actor) });
      hop.to(actor.pose, { y: FLOOR, duration: 0.16, ease: "power1.in", onUpdate: () => writeWrap(actor) });
    }
    tl.add(hop, at);
  }

  private nearest(actor: Actor): Actor | null {
    let best: Actor | null = null;
    for (const other of this.actors.values()) {
      if (other === actor || other.layer !== "fore") continue;
      if (!best || Math.abs(other.pose.x - actor.pose.x) < Math.abs(best.pose.x - actor.pose.x)) best = other;
    }
    return best;
  }

  /** A gesture that plays during a line. */
  gesture(tl: gsap.core.Timeline, at: number, id: string, action: Action, hold: number): void {
    const actor = this.actors.get(id);
    if (!actor || actor.layer !== "fore") return;
    const right = part(actor, "arm-right");
    const left = part(actor, "arm-left");
    const head = part(actor, "head");
    const toward = Math.sign((this.nearest(actor)?.pose.x ?? 960) - actor.pose.x) || 1;
    const release = at + Math.max(0.8, hold - 0.6);
    switch (action) {
      case "draw_weapon":
        this.tweenPart(tl, at, right, { r: -150 }, 0.35, "back.out(2)");
        this.tweenPart(tl, release, right, { r: -40 }, 0.5);
        break;
      case "strike": {
        this.tweenPart(tl, at, right, { r: -160 }, 0.25, "power2.out");
        this.tweenPart(tl, at + 0.25, right, { r: 50 }, 0.16, "power4.in");
        this.tweenWrap(tl, at + 0.2, actor, { x: actor.pose.x + toward * 70 }, 0.2, "power3.out");
        this.tweenWrap(tl, at + 0.6, actor, { x: actor.pose.x }, 0.5, "power2.inOut");
        this.tweenPart(tl, at + 0.7, right, { r: 0 }, 0.5);
        break;
      }
      case "kneel":
        this.tweenWrap(tl, at, actor, { y: FLOOR + 50 }, 0.45, "power2.out");
        break;
      case "drink":
        this.tweenPart(tl, at, right, { r: -125 }, 0.45);
        this.tweenPart(tl, at + 0.3, head, { r: -14 }, 0.4);
        this.tweenPart(tl, release, right, { r: 0 }, 0.5);
        this.tweenPart(tl, release, head, { r: 0 }, 0.5);
        break;
      case "point":
        this.tweenPart(tl, at, toward > 0 ? right : left, { r: toward > 0 ? -95 : 95 }, 0.3, "back.out(2)");
        this.tweenPart(tl, release, toward > 0 ? right : left, { r: 0 }, 0.45);
        break;
      case "embrace": {
        const other = this.nearest(actor);
        if (other) this.tweenWrap(tl, at, actor, { x: other.pose.x - toward * 120 }, 0.6, "power2.inOut");
        this.tweenPart(tl, at + 0.4, right, { r: -60 }, 0.35);
        this.tweenPart(tl, at + 0.4, left, { r: 60 }, 0.35);
        this.tweenPart(tl, release, right, { r: 0 }, 0.4);
        this.tweenPart(tl, release, left, { r: 0 }, 0.4);
        break;
      }
      case "crown":
        this.tweenPart(tl, at, right, { r: -170 }, 0.5, "back.out(1.5)");
        this.tweenPart(tl, at, left, { r: 170 }, 0.5, "back.out(1.5)");
        this.tweenPart(tl, release, right, { r: 0 }, 0.5);
        this.tweenPart(tl, release, left, { r: 0 }, 0.5);
        break;
      case "enter":
        this.tweenWrap(tl, at, actor, { y: FLOOR - 50 }, 0.2, "power2.out");
        this.tweenWrap(tl, at + 0.2, actor, { y: FLOOR }, 0.35, "bounce.out");
        break;
      default:
        break;
    }
  }

  /** Leaving the stage: `fall` snaps the rod and drops the figure; `exit` and `flee` scurry off. */
  leave(tl: gsap.core.Timeline, at: number, id: string, action: Action, fallbackX = 960): void {
    let actor = this.actors.get(id);
    if (actor && actor.layer === "back") {
      this.dismiss(tl, at, actor, 0.5);
      actor = undefined;
    }
    if (!actor) actor = this.create({ id, layer: "fore", x: fallbackX, emotion: "terrified" });
    this.actors.delete(id);
    const a = actor;
    a.idle.forEach((anim) => anim.kill());
    const rod = part(a, "rod");
    const figure = part(a, "figure");
    if (action === "fall") {
      if (a.puppet) tl.call(() => setEmotion(a.puppet!, "terrified"), undefined, at);
      tl.call(() => this.snapMark(a), undefined, at + MOMENT.rodSnap - MOMENT.actionStart);
      this.tweenPart(tl, at + MOMENT.rodSnap - MOMENT.actionStart, rod, { r: 38, x: 6 }, 0.12, "power4.out");
      this.tweenPart(tl, at + 0.35, figure, { r: 78 * (a.pose.x < 960 ? -1 : 1) }, 0.7, "bounce.out");
      tl.to(a.pose, { y: FLOOR + 900, duration: 1.0, ease: "power3.in", onUpdate: () => writeWrap(a) }, at + 0.95);
    } else {
      const offX = a.pose.x < 960 ? -360 : 2280;
      const flee = action === "flee";
      if (flee && a.puppet) tl.call(() => setEmotion(a.puppet!, "terrified"), undefined, at);
      const hops = flee ? 6 : 4;
      const duration = flee ? 1.0 : 1.5;
      tl.to(a.pose, { x: offX, duration, ease: "power1.in", onUpdate: () => writeWrap(a) }, at + 0.1);
      const hop = gsap.timeline();
      for (let i = 0; i < hops; i++) {
        hop.to(a.pose, { y: FLOOR - 26, duration: duration / hops / 2, ease: "power1.out" });
        hop.to(a.pose, { y: FLOOR, duration: duration / hops / 2, ease: "power1.in" });
      }
      tl.add(hop, at + 0.1);
    }
    tl.call(() => this.removeDetached(a), undefined, at + 1.8);
  }

  private snapMark(actor: Actor): void {
    const mark = document.createElementNS(SVG_NS, "path");
    mark.setAttribute("d", "M-26 60 L-8 52 L-14 66 L8 58 L2 74 L26 62");
    mark.setAttribute("class", "rod-snap");
    actor.puppet?.append(mark);
  }

  /** Close-up actors for the coronation splash. */
  crownWinner(tl: gsap.core.Timeline, at: number, id: string): void {
    for (const actor of [...this.actors.values()]) if (actor.id !== id) this.dismiss(tl, at, actor, 0.4);
    const existing = this.actors.get(id);
    if (existing) this.remove(existing);
    const winner = this.create({ id, layer: "fore", x: 960, emotion: "triumphant" });
    winner.pose.y = FLOOR + OFFSTAGE_BELOW;
    winner.pose.sx = winner.pose.sy = FORE_SCALE * 1.7;
    writeWrap(winner);
    this.tweenWrap(tl, at + 0.3, winner, { y: FLOOR + 210 }, 1.1, "back.out(1.4)");
  }
}
