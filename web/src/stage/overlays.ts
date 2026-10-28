import { gsap } from "gsap";
import type { ChronicleTexts, Reveal, ShowBible } from "../api/client";
import { el } from "../dom";
import { renderBanner, renderSigil, type HouseId } from "../render";
import { SVG_NS } from "../render/svg";
import { shortSeal } from "../show/seal";
import type { CastSheet } from "./cast";
import type { ComicLink } from "./comic-link";
import { MOMENT, STAMP_LAND } from "./timing";
import type { Announcement, FateScript } from "./types";

const ROMAN = ["", "I", "II", "III"];
const DEFAULT_ACT_TITLES = ["", "The Call", "The Game", "The Throne"];
const INTERLUDE_SIGNS = [
  "The bards are tuning their lutes...",
  "The scribes are still inking the next scene...",
  "The puppeteers are untangling their rods...",
  "A raven is on its way with the next chapter...",
];

/** Story texts that arrive while the show is already running. */
export interface ShowTexts {
  bible: ShowBible | null;
  chronicle: ChronicleTexts | null;
  reveal: () => Promise<Reveal | null>;
  /** Required attributions for bundled audio, from the licence manifest. */
  attributions?: string[];
  /** The comic book PDF of this show (absent on dev stages). */
  comic?: ComicLink;
}

function svgEl(viewBox: string, className: string, ...children: SVGElement[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("class", className);
  svg.append(...children);
  return svg;
}

/** Wax seal medallion with the first twelve hex digits of the Seal of Fate. */
export function sealMedallion(seal: string): HTMLElement {
  return el(
    "div",
    { class: "seal-medallion", "data-testid": "seal" },
    el("span", { class: "seal-label" }, "Seal of Fate"),
    el("span", { class: "seal-code" }, shortSeal(seal)),
  );
}

/** Comic status line with Open comic / Show in folder (or Retry); follows the status while it is on screen. */
function comicBlock(comic: ComicLink): HTMLElement {
  const block = el("div", { class: "credits-comic", "data-testid": "comic" });
  const button = (label: string, testId: string, action: () => Promise<void> | void) => {
    const b = el("button", { type: "button", "data-testid": testId }, label);
    b.addEventListener("click", (event) => {
      event.stopPropagation();
      b.disabled = true;
      Promise.resolve(action())
        .catch(() => (note.textContent = "That did not work."))
        .finally(() => (b.disabled = false));
    });
    return b;
  };
  const note = el("span", { class: "comic-note" });
  const render = () => {
    const info = comic.info;
    block.dataset.status = info?.status ?? "pending";
    note.textContent = "";
    switch (info?.status) {
      case "ready":
        block.replaceChildren(
          el("strong", {}, "Comic book: "),
          el("span", { class: "comic-file" }, info.file_name ?? "ready"),
          button("Open comic", "comic-open", () => comic.open()),
          button("Show in folder", "comic-reveal", () => comic.reveal()),
          note,
        );
        break;
      case "failed":
        block.replaceChildren(
          el("strong", {}, "Comic book failed: "),
          el("span", { class: "comic-error" }, info.error ?? "unknown error"),
          button("Retry", "comic-retry", () => comic.retry()),
          note,
        );
        break;
      case "off":
        block.replaceChildren(el("strong", {}, "Comic book: "), "switched off");
        break;
      default:
        block.replaceChildren(el("strong", {}, "Comic book: "), "the scribes are inking the pages...");
    }
  };
  render();
  // Credits are rebuilt on seeks; the few detached blocks that keep listening are harmless.
  comic.subscribe(render);
  return block;
}

/** Full-stage overlays: title cards, seal, roll-call heading, coronation splash, credits, interlude. */
export class Overlays {
  private corner: HTMLElement | null = null;
  private rollHeading: HTMLElement | null = null;
  private interludeSign: HTMLElement | null = null;
  private interludeSwing: gsap.core.Tween | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly fate: FateScript,
    private readonly cast: CastSheet,
    private readonly texts: ShowTexts,
  ) {}

  /** Remove transient overlays (persistent ones are restored by `apply`). */
  clear(): void {
    this.layer.replaceChildren();
    this.corner = null;
    this.rollHeading = null;
    this.interludeSwing?.kill();
    this.interludeSwing = null;
    this.interludeSign = null;
  }

  apply(options: { seal: boolean; rollHouse: string | null | undefined; credits: boolean }): void {
    this.clear();
    if (options.seal) this.showCornerSeal();
    if (options.rollHouse !== undefined) this.layer.append((this.rollHeading = this.rollTitle(options.rollHouse)));
    if (options.credits) this.layer.append(this.buildCredits());
  }

  /** A rubber stamp slammed onto the stage: "Davido is OUT" with the cause, or a golden "RETURNS". */
  stamp(tl: gsap.core.Timeline, at: number, duration: number, announcement: Announcement): void {
    const node = el(
      "div",
      { class: `stamp stamp-${announcement.kind}`, "data-testid": "stamp", "data-kind": announcement.kind },
      el("div", { class: "stamp-headline" }, announcement.headline),
      el("div", { class: "stamp-cause" }, announcement.cause),
    );
    this.transient(tl, node, at, at + duration);
    tl.fromTo(
      node,
      { opacity: 0, scale: 2.6, rotation: announcement.kind === "return" ? 6 : -14 },
      { opacity: 1, scale: 1, rotation: announcement.kind === "return" ? 2 : -6, duration: STAMP_LAND, ease: "power4.in" },
      at,
    );
    tl.to(node, { opacity: 0, duration: 0.3 }, at + duration - 0.35);
  }

  private transient(tl: gsap.core.Timeline, node: HTMLElement, at: number, until: number): void {
    tl.call(() => this.layer.append(node), undefined, at);
    tl.call(() => node.remove(), undefined, until);
  }

  logo(tl: gsap.core.Timeline, at: number, duration: number): void {
    const subtitle = this.texts.bible?.title.replace(/^The Bottle Throne:\s*/i, "") ?? "A Raffle in Paper and Ink";
    const logo = el(
      "div",
      { class: "show-logo", "data-testid": "logo" },
      el("div", { class: "logo-title" }, "The Bottle Throne"),
      el("div", { class: "logo-subtitle" }, subtitle),
    );
    this.transient(tl, logo, at, at + duration);
    tl.fromTo(logo, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" }, at + 0.01);
    tl.to(logo, { y: -60, opacity: 0, duration: 0.6, ease: "power2.in" }, at + duration - 0.7);
  }

  seal(tl: gsap.core.Timeline, at: number, duration: number): void {
    const big = sealMedallion(this.fate.seal);
    big.classList.add("big");
    big.append(el("span", { class: "seal-full" }, this.fate.seal));
    this.transient(tl, big, at, at + duration);
    tl.fromTo(big, { scale: 3, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: -6, duration: 0.45, ease: "power4.in" }, at + 0.01);
    tl.to(big, { left: 1740, top: 150, scale: 0.32, duration: 0.7, ease: "power2.inOut" }, at + duration - 0.8);
    tl.call(() => this.showCornerSeal(), undefined, at + duration - 0.05);
  }

  private showCornerSeal(): void {
    if (this.corner) return;
    this.corner = sealMedallion(this.fate.seal);
    this.corner.classList.add("corner");
    this.layer.append(this.corner);
  }

  hideCornerSeal(tl: gsap.core.Timeline, at: number): void {
    const corner = this.corner;
    this.corner = null;
    if (!corner) return;
    tl.to(corner, { opacity: 0, duration: 0.3 }, at);
    tl.call(() => corner.remove(), undefined, at + 0.31);
  }

  caption(tl: gsap.core.Timeline, at: number, duration: number, text: string): void {
    const box = el("div", { class: "caption-box overlay-caption" }, text);
    this.transient(tl, box, at, at + duration);
    tl.fromTo(box, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4 }, at + 0.01);
    tl.to(box, { opacity: 0, duration: 0.3 }, at + duration - 0.35);
  }

  private rollTitle(house: string | null): HTMLElement {
    const heading = el("div", { class: "roll-heading", "data-testid": "roll-heading" });
    if (house) {
      const banner = svgEl("-90 -10 180 300", "roll-banner", renderBanner(house as HouseId, 260));
      heading.append(banner);
    }
    heading.append(el("div", { class: "roll-house" }, this.cast.houseName(house)));
    return heading;
  }

  rollCall(tl: gsap.core.Timeline, at: number, house: string | null): void {
    const old = this.rollHeading;
    if (old) {
      tl.to(old, { y: -400, duration: 0.45, ease: "power2.in" }, at);
      tl.call(() => old.remove(), undefined, at + 0.46);
    }
    const heading = this.rollTitle(house);
    this.rollHeading = heading;
    tl.call(() => this.layer.append(heading), undefined, at + 0.3);
    tl.fromTo(heading, { y: -420 }, { y: 0, duration: 0.7, ease: "bounce.out" }, at + 0.31);
  }

  hideRollCall(tl: gsap.core.Timeline, at: number): void {
    const old = this.rollHeading;
    this.rollHeading = null;
    if (!old) return;
    tl.to(old, { y: -420, duration: 0.45, ease: "power2.in" }, at);
    tl.call(() => old.remove(), undefined, at + 0.46);
  }

  titleCard(tl: gsap.core.Timeline, at: number, duration: number, act: 1 | 2 | 3): void {
    const titles = this.texts.chronicle?.act_titles;
    const title = titles ? [titles.act_1, titles.act_2, titles.act_3][act - 1] : DEFAULT_ACT_TITLES[act];
    const card = el(
      "div",
      { class: "title-card", "data-testid": "title-card" },
      el("div", { class: "title-act" }, `Act ${ROMAN[act]}`),
      el("div", { class: "title-name" }, title),
    );
    this.transient(tl, card, at + 0.7, at + duration);
    tl.fromTo(card, { scale: 0.3, rotation: -12, opacity: 0 }, { scale: 1, rotation: -2, opacity: 1, duration: 0.55, ease: "back.out(1.8)" }, at + 0.71);
    tl.to(card, { scale: 1.4, opacity: 0, duration: 0.4, ease: "power2.in" }, at + duration - 0.45);
  }

  coronation(tl: gsap.core.Timeline, at: number, duration: number, winner: string): void {
    const name = this.cast.name(winner);
    const rays = svgEl(
      "-960 -540 1920 1080",
      "splash-rays",
      ...Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const b = ((i + 0.5) / 24) * Math.PI * 2;
        const ray = document.createElementNS(SVG_NS, "path");
        ray.setAttribute("d", `M0 0 L${Math.cos(a) * 1400} ${Math.sin(a) * 1400} L${Math.cos(b) * 1400} ${Math.sin(b) * 1400} Z`);
        ray.setAttribute("class", i % 2 ? "ray-gold" : "ray-red");
        return ray;
      }),
    );
    const splash = el(
      "div",
      { class: "coronation-splash", "data-testid": "coronation" },
      rays,
      el("div", { class: "splash-top" }, "Long live"),
      el("div", { class: "splash-name", "data-testid": "crowned-name" }, name),
      el("div", { class: "splash-sub" }, "Ruler of the Bottle Throne"),
    );
    const house = this.cast.get(winner)?.house;
    if (house) {
      const sigil = svgEl("-60 -60 120 120", "splash-sigil", renderSigil(house));
      splash.append(sigil);
    }
    this.transient(tl, splash, at, at + duration);
    tl.fromTo(rays, { rotation: 0, opacity: 0 }, { rotation: 30, opacity: 1, duration, ease: "none" }, at);
    tl.fromTo(splash.querySelector(".splash-name"), { scale: 4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power4.in" }, at + MOMENT.coronationName - 0.5);
    tl.fromTo(splash.querySelectorAll(".splash-top, .splash-sub"), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.4 }, at + 0.6);
    tl.to(splash, { opacity: 0, duration: 0.6 }, at + duration - 0.6);
  }

  credits(tl: gsap.core.Timeline, at: number): void {
    const panel = this.buildCredits();
    tl.call(() => this.layer.append(panel), undefined, at + 0.8);
    tl.fromTo(panel, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, at + 0.81);
    tl.fromTo(panel.querySelectorAll(".fallen li"), { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.12 }, at + 1.6);
  }

  private buildCredits(): HTMLElement {
    const fate = this.fate;
    const beatOf = new Map<string, { mode: string; title: string; index: number }>();
    for (const beat of fate.beats) for (const e of beat.eliminations) beatOf.set(e.character, { mode: e.mode, title: beat.title, index: beat.index });
    const fallen = fate.characters
      .filter((c) => c.kind === "participant" && c.id !== fate.winner)
      .map((c) => ({ name: c.name, ...(beatOf.get(c.id) ?? { mode: "vanished", title: "", index: Infinity }) }))
      .sort((a, b) => a.index - b.index);
    const seed = el("span", { class: "credits-seed", "data-testid": "seed" }, "revealing...");
    const badge = el("span", { class: "seed-badge", hidden: fate.seed_mode !== "manual" }, "manual seed");
    void this.texts.reveal().then((reveal) => {
      seed.textContent = reveal ? reveal.seed : "(seed unavailable)";
      if (reveal?.seed_mode === "manual") badge.hidden = false;
    });
    const epilogue = this.texts.chronicle?.epilogue;
    const attributions = this.texts.attributions ?? [];
    return el(
      "div",
      { class: "credits", "data-testid": "credits" },
      el("div", { class: "credits-title" }, "The End"),
      el(
        "div",
        { class: "credits-monarch" },
        el("span", {}, "Monarch of the Bottle Throne"),
        el("strong", { "data-testid": "credits-winner" }, this.cast.name(fate.winner)),
      ),
      epilogue ? el("p", { class: "credits-epilogue" }, epilogue) : null,
      el("h3", {}, "The Fallen"),
      el(
        "ul",
        { class: `fallen${fallen.length > 14 ? " many" : ""}`, "data-testid": "fallen" },
        ...fallen.map((f) => el("li", {}, el("strong", {}, f.name), ` ${f.mode}${f.title ? ` in ${f.title}` : ""}`)),
      ),
      el(
        "div",
        { class: "credits-seal" },
        sealMedallion(fate.seal),
        el(
          "div",
          { class: "credits-proof" },
          el("div", {}, el("strong", {}, "Seal of Fate: "), el("code", { class: "seal-full" }, fate.seal)),
          el("div", {}, el("strong", {}, "Seed: "), seed, " ", badge),
          el("div", { class: "hint" }, `Engine ${fate.engine_version}. Anyone can re-check the result with the seed and the roster.`),
        ),
      ),
      attributions.length > 0
        ? el("div", { class: "credits-audio", "data-testid": "audio-credits" }, el("strong", {}, "Music & sound: "), attributions.join(" · "))
        : null,
      this.texts.comic ? comicBlock(this.texts.comic) : null,
    );
  }

  interlude(on: boolean): void {
    if (!on) {
      this.interludeSwing?.kill();
      this.interludeSwing = null;
      this.interludeSign?.remove();
      this.interludeSign = null;
      return;
    }
    if (this.interludeSign) return;
    const sign = el(
      "div",
      { class: "interlude-sign", "data-testid": "interlude" },
      el("div", { class: "sign-board" }, INTERLUDE_SIGNS[Math.floor(Math.random() * INTERLUDE_SIGNS.length)]),
      el("div", { class: "sign-dots" }, el("span", {}, "."), el("span", {}, "."), el("span", {}, ".")),
    );
    this.interludeSign = sign;
    this.layer.append(sign);
    this.interludeSwing = gsap.fromTo(sign, { rotation: -4 }, { rotation: 4, duration: 1.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }
}
