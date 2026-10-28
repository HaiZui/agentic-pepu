import { gsap } from "gsap";
import { el } from "../dom";
import { renderSigilBadge, type HouseId } from "../render";
import { SVG_NS } from "../render/svg";
import { rollCallGroups } from "./compiler";
import type { CastSheet } from "./cast";
import type { FateScript } from "./types";

export const TRACKER_TOP = 10;
/** The spec caps the tracker at 12 % of the 1080 px stage height. */
export const TRACKER_MAX_HEIGHT = Math.floor(1080 * 0.12);
const TRACKER_LEFT = 40;
const TRACKER_WIDTH = 1920 - 2 * TRACKER_LEFT;
const COUNT_WIDTH = 190;
const GAP = 6;
/** Above this many participants the chips show sigil and initials instead of full names. */
export const COMPACT_ABOVE = 16;

export interface TrackerLayout {
  compact: boolean;
  rows: number;
  perRow: number;
  chipWidth: number;
  chipHeight: number;
  height: number;
}

/** Chip grid for `count` participants inside the strip; never taller than TRACKER_MAX_HEIGHT. */
export function trackerLayout(count: number): TrackerLayout {
  const compact = count > COMPACT_ABOVE;
  const room = TRACKER_WIDTH - COUNT_WIDTH;
  const rows = compact ? Math.max(1, Math.ceil(count / 20)) : 1;
  const perRow = Math.ceil(count / rows);
  const chipWidth = Math.floor(Math.min(compact ? 84 : 200, (room - GAP * (perRow - 1)) / perRow));
  const chipHeight = rows === 1 ? (compact ? 52 : 58) : Math.floor((TRACKER_MAX_HEIGHT - 16 - GAP * (rows - 1)) / rows);
  const height = rows * chipHeight + GAP * (rows - 1) + 16;
  return { compact, rows, perRow, chipWidth, chipHeight, height };
}

/** Lowest pixel row of the tracker for a roster of `count`; speech bubbles and captions start below it. */
export function trackerBottom(count: number): number {
  return TRACKER_TOP + trackerLayout(count).height;
}

/** Initials for compact chips: first letters of up to two words, keeping letters like Ä and Ö. */
export function initials(name: string): string {
  const words = name.replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((w) => [...w][0]) : [...(words[0] ?? "?")].slice(0, 2);
  return letters.join("");
}

/** Survivor strip along the top edge: every participant, marked when out, with the running count. */
export class Tracker {
  private root: HTMLElement | null = null;
  private chips = new Map<string, HTMLElement>();
  private count: HTMLElement | null = null;
  private shown: string[] | null = null;
  private readonly order: string[];

  constructor(
    private readonly layer: HTMLElement,
    fate: FateScript,
    private readonly cast: CastSheet,
  ) {
    this.order = rollCallGroups(fate).flatMap((g) => g.members);
  }

  private build(): HTMLElement {
    const layout = trackerLayout(this.order.length);
    const root = el("div", { class: `tracker${layout.compact ? " compact" : ""}`, "data-testid": "tracker" });
    Object.assign(root.style, { top: `${TRACKER_TOP}px`, left: `${TRACKER_LEFT}px`, width: `${TRACKER_WIDTH}px`, height: `${layout.height}px` });
    const grid = el("div", { class: "tracker-chips" });
    grid.style.gridTemplateColumns = `repeat(${layout.perRow}, ${layout.chipWidth}px)`;
    grid.style.gridAutoRows = `${layout.chipHeight}px`;
    for (const id of this.order) {
      const member = this.cast.get(id);
      const name = this.cast.name(id);
      const chip = el("div", { class: "tracker-chip", "data-id": id, title: name });
      if (member?.house) {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 40 40");
        svg.setAttribute("class", "tracker-sigil");
        svg.append(renderSigilBadge(member.house as HouseId, 20, 20, 36));
        chip.append(svg);
      }
      chip.append(el("span", { class: "tracker-name" }, layout.compact ? initials(name) : name), el("span", { class: "tracker-x" }, "✕"));
      this.chips.set(id, chip);
      grid.append(chip);
    }
    this.count = el("div", { class: "tracker-count", "data-testid": "tracker-count" });
    root.append(grid, this.count);
    return root;
  }

  /** Shows the tracker for this set of survivors (null hides it). Marks newly out chips with a pop when animated. */
  set(survivors: string[] | null, animate = false): void {
    if (survivors === null) {
      this.root?.remove();
      this.shown = null;
      return;
    }
    if (!this.root) this.root = this.build();
    if (!this.root.isConnected) this.layer.append(this.root);
    const inside = new Set(survivors);
    for (const [id, chip] of this.chips) {
      const out = !inside.has(id);
      const changed = this.shown !== null && this.shown.includes(id) === out;
      chip.classList.toggle("out", out);
      chip.dataset.out = String(out);
      if (animate && changed) gsap.fromTo(chip, { scale: 1.6 }, { scale: 1, duration: 0.45, ease: "back.out(3)" });
    }
    const n = survivors.length;
    if (this.count) this.count.textContent = n === 1 ? "1 remains" : `${n} remain`;
    this.shown = [...survivors];
  }

  /** Lowest pixel row of this show's tracker. */
  get bottom(): number {
    return trackerBottom(this.order.length);
  }

  /** Survivors currently shown, for tests and diagnostics. */
  get current(): string[] | null {
    return this.shown && [...this.shown];
  }
}
