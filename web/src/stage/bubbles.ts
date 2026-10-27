import { el } from "../dom";
import { SVG_NS } from "../render/svg";
import { STAGE_W } from "../shared/panels";

const BUBBLE_MAX_WIDTH = 620;
const MARGIN = 48;

interface Anchor {
  (): { x: number; y: number } | null;
}

interface LiveBubble {
  box: HTMLElement;
  tail: SVGSVGElement | null;
  anchor: Anchor | null;
}

/** Comic lettering on stage: speech bubbles, narration and caption boxes, sound words. */
export class Lettering {
  private bubble: LiveBubble | null = null;
  private caption: HTMLElement | null = null;

  constructor(private readonly layer: HTMLElement) {}

  clear(): void {
    this.layer.replaceChildren();
    this.bubble = null;
    this.caption = null;
  }

  /** Keep the bubble and its tail pointing at the speaker while the camera moves. */
  reposition = (): void => {
    const live = this.bubble;
    if (!live?.anchor) return;
    const head = live.anchor();
    if (!head) return;
    const box = live.box;
    const width = box.offsetWidth || BUBBLE_MAX_WIDTH;
    const height = box.offsetHeight || 120;
    const left = Math.min(Math.max(head.x - width / 2, MARGIN), STAGE_W - MARGIN - width);
    const top = Math.max(MARGIN + 70, head.y - height - 90);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    if (live.tail) {
      const baseX = Math.min(Math.max(head.x, left + 40), left + width - 40);
      const baseY = top + height - 4;
      const tipY = Math.max(baseY + 24, head.y - 30);
      live.tail.querySelector("path")?.setAttribute(
        "d",
        `M${baseX - 26} ${baseY} Q${(baseX + head.x) / 2} ${(baseY + tipY) / 2 + 10} ${head.x} ${tipY} Q${(baseX + head.x) / 2 + 14} ${(baseY + tipY) / 2} ${baseX + 22} ${baseY} Z`,
      );
    }
  };

  private dropBubble(tl: gsap.core.Timeline, at: number): void {
    const old = this.bubble;
    this.bubble = null;
    if (!old) return;
    tl.to([old.box, old.tail].filter(Boolean), { opacity: 0, duration: 0.2 }, at);
    tl.call(() => {
      old.box.remove();
      old.tail?.remove();
    }, undefined, at + 0.21);
  }

  hideBubble(tl: gsap.core.Timeline, at: number): void {
    this.dropBubble(tl, at);
  }

  /** A speech bubble (or a narration box for the narrator) that types out its text. */
  line(tl: gsap.core.Timeline, at: number, options: { name: string; text: string; anchor: Anchor | null; hold: number; shout?: boolean }): void {
    this.dropBubble(tl, at);
    const chars = [...options.text];
    const shown = el("span", { class: "typed" });
    const rest = el("span", { class: "untyped" }, options.text);
    const narration = options.anchor === null;
    const box = el(
      "div",
      {
        class: `bubble ${narration ? "narration" : "speech"}${chars.length > 100 ? " long" : ""}${options.shout ? " shout" : ""}`,
        "data-testid": narration ? "narration" : "bubble",
      },
      narration ? null : el("span", { class: "bubble-name" }, options.name),
      el("p", { class: "bubble-text" }, shown, rest),
    );
    box.style.opacity = "0";
    let tail: SVGSVGElement | null = null;
    if (!narration) {
      tail = document.createElementNS(SVG_NS, "svg");
      tail.setAttribute("class", "bubble-tail");
      tail.setAttribute("viewBox", "0 0 1920 1080");
      const path = document.createElementNS(SVG_NS, "path");
      tail.append(path);
      tail.style.opacity = "0";
    }
    const live: LiveBubble = { box, tail, anchor: options.anchor };

    tl.call(() => {
      if (tail) this.layer.append(tail);
      this.layer.append(box);
      this.bubble = live;
      this.reposition();
    }, undefined, at);
    tl.fromTo(box, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2)" }, at + 0.01);
    if (tail) tl.to(tail, { opacity: 1, duration: 0.15 }, at + 0.05);

    const typing = Math.min(chars.length * 0.028, options.hold * 0.45);
    const counter = { n: 0 };
    tl.to(
      counter,
      {
        n: chars.length,
        duration: Math.max(typing, 0.05),
        ease: "none",
        onUpdate: () => {
          const n = Math.round(counter.n);
          shown.textContent = chars.slice(0, n).join("");
          rest.textContent = chars.slice(n).join("");
        },
      },
      at + 0.1,
    );
  }

  /** Yellow caption box in the top-left corner; replaces the previous caption. */
  captionBox(tl: gsap.core.Timeline, at: number, text: string, kind: "caption" | "title" = "caption"): void {
    const old = this.caption;
    if (old) {
      tl.to(old, { opacity: 0, duration: 0.2 }, at);
      tl.call(() => old.remove(), undefined, at + 0.2);
    }
    const box = el("div", { class: `caption-box ${kind}`, "data-testid": kind === "caption" ? "caption" : "beat-title" }, text);
    box.style.opacity = "0";
    this.caption = box;
    tl.call(() => this.layer.append(box), undefined, at);
    tl.fromTo(box, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, at + 0.01);
  }

  hideCaption(tl: gsap.core.Timeline, at: number): void {
    const old = this.caption;
    this.caption = null;
    if (!old) return;
    tl.to(old, { opacity: 0, duration: 0.25 }, at);
    tl.call(() => old.remove(), undefined, at + 0.26);
  }

  /** Big comic sound word that pops and fades. */
  sound(tl: gsap.core.Timeline, at: number, text: string, x: number, y: number): void {
    const word = el("div", { class: "onomatopoeia", "data-testid": "onomatopoeia" }, text);
    word.style.left = `${Math.min(Math.max(x, 260), STAGE_W - 260)}px`;
    word.style.top = `${y}px`;
    tl.call(() => this.layer.append(word), undefined, at);
    tl.fromTo(word, { scale: 0.2, rotation: -25, opacity: 0 }, { scale: 1, rotation: -8, opacity: 1, duration: 0.3, ease: "back.out(3)" }, at + 0.01);
    tl.to(word, { scale: 1.15, opacity: 0, duration: 0.4, ease: "power1.in" }, at + 1.3);
    tl.call(() => word.remove(), undefined, at + 1.75);
  }
}
