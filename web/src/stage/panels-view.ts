import { el } from "../dom";
import { renderCrowdFigure, renderScenery } from "../render";
import { SVG_NS } from "../render/svg";
import { FLOOR, FORE_SCALE, frame, panelGrid, STAGE_H, STAGE_W } from "../shared/panels";
import { puppetNode } from "./actors";
import type { CastSheet } from "./cast";
import { montageStampTimes, montageSummaryAt } from "./timing";
import type { Announcement, EliminationMode, PanelShot } from "./types";

const GUTTER = 26;

const MODE_LABEL: Record<EliminationMode, string> = { killed: "Fallen", forfeited: "Forfeited", exiled: "Exiled" };

/** One framed comic panel: fresh scenery and figures, viewed through `frame()` (shared with the comic book). */
export function panelArt(shot: PanelShot, cast: CastSheet, width: number, height: number): SVGSVGElement {
  const view = frame(shot.framing, shot.focus, shot.placements, width / height);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("class", "panel-art");
  const scenery = renderScenery(shot.setting);
  svg.append(scenery.back, scenery.mid);
  for (const p of shot.placements.filter((x) => x.layer === "back")) {
    const crowd = renderCrowdFigure(p.id, cast.get(p.id)?.color ?? "#6f6253");
    crowd.setAttribute("transform", `translate(${p.x} ${FLOOR - 70}) scale(0.95)`);
    svg.append(crowd);
  }
  for (const p of shot.placements.filter((x) => x.layer === "fore")) {
    const { node } = puppetNode(cast, p.id, p.emotion, false);
    node.setAttribute("transform", `translate(${p.x} ${FLOOR}) scale(${FORE_SCALE})`);
    svg.append(node);
  }
  svg.append(scenery.front);
  return svg;
}

function cell(x: number, y: number, w: number, h: number, className: string): HTMLElement {
  const box = el("div", { class: className });
  Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  return box;
}

/** The proscenium cracks into a panel grid for dramatic beats; crowd eliminations get an X-stamp montage. */
export class PanelView {
  constructor(
    private readonly layer: HTMLElement,
    private readonly cast: CastSheet,
  ) {}

  clear(): void {
    this.layer.replaceChildren();
  }

  private crack(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${STAGE_W} ${STAGE_H}`);
    svg.setAttribute("class", "panel-crack");
    const paths = [
      "M0 520 L420 540 L700 470 L980 560 L1260 500 L1560 580 L1920 540",
      "M960 0 L930 260 L1010 470 L940 760 L990 1080",
      "M420 540 L380 1080 M1560 580 L1610 0",
    ];
    for (const d of paths) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("pathLength", "1");
      svg.append(path);
    }
    return svg;
  }

  panelBreak(tl: gsap.core.Timeline, at: number, duration: number, panels: PanelShot[], sounds: string[]): void {
    const root = el("div", { class: "panel-break", "data-testid": "panel-break" });
    const crack = this.crack();
    const rects = panelGrid(panels.length, STAGE_W, STAGE_H, GUTTER);
    const cells = panels.map((shot, i) => {
      const r = rects[i];
      const box = cell(r.x, r.y, r.width, r.height, "comic-panel");
      box.dataset.framing = shot.framing;
      box.append(panelArt(shot, this.cast, r.width, r.height));
      if (shot.text) {
        const isCaption = shot.speaker === null;
        const narration = shot.speaker === "narrator";
        box.append(
          el(
            "div",
            { class: isCaption || narration ? "panel-caption" : "panel-bubble" },
            isCaption || narration ? null : el("span", { class: "bubble-name" }, this.cast.name(shot.speaker!)),
            shot.text,
          ),
        );
      }
      if (shot.sound) box.append(el("div", { class: "panel-sound" }, shot.sound));
      return box;
    });
    root.append(crack, ...cells);
    const big = sounds[0] ? el("div", { class: "onomatopoeia giant", "data-testid": "panel-sound" }, sounds[0]) : null;
    if (big) root.append(big);

    tl.call(() => this.layer.append(root), undefined, at);
    tl.fromTo(crack.querySelectorAll("path"), { strokeDashoffset: 1, strokeDasharray: 1 }, { strokeDashoffset: 0, duration: 0.35, stagger: 0.08, ease: "power2.out" }, at);
    tl.fromTo(root, { backgroundColor: "rgba(27,19,11,0)" }, { backgroundColor: "rgba(27,19,11,1)", duration: 0.3 }, at + 0.3);
    const per = Math.max(0.35, (duration - 2.2) / Math.max(cells.length, 1));
    cells.forEach((box, i) => {
      tl.fromTo(
        box,
        { scale: 0.55, opacity: 0, rotation: i % 2 ? 4 : -4 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.4, ease: "back.out(1.7)" },
        at + 0.45 + i * Math.min(per, 0.9),
      );
    });
    if (big) {
      const when = at + 0.45 + cells.length * Math.min(per, 0.9) * 0.6;
      tl.fromTo(big, { scale: 0.1, rotation: -30, opacity: 0 }, { scale: 1, rotation: -10, opacity: 1, duration: 0.35, ease: "back.out(3)" }, when);
      tl.to(big, { opacity: 0, scale: 1.3, duration: 0.4 }, Math.min(when + 1.6, at + duration - 0.8));
    }
    // Fold back into the theater.
    tl.to(cells, { scale: 0.2, opacity: 0, duration: 0.45, stagger: 0.05, ease: "power2.in" }, at + duration - 0.7);
    tl.to(root, { opacity: 0, duration: 0.25 }, at + duration - 0.3);
    tl.call(() => root.remove(), undefined, at + duration);
  }

  montage(
    tl: gsap.core.Timeline,
    at: number,
    duration: number,
    victims: { id: string; mode: EliminationMode; cause: string | null }[],
    summary: Announcement | null = null,
  ): void {
    const root = el("div", { class: "montage", "data-testid": "montage" });
    const columns = Math.min(victims.length, victims.length > 6 ? 4 : 3);
    const rows = Math.ceil(victims.length / columns);
    const w = (STAGE_W - GUTTER * (columns + 1)) / columns;
    const h = (STAGE_H - GUTTER * (rows + 1)) / rows;
    const stamps = montageStampTimes(duration, victims.length, summary !== null);
    victims.forEach((victim, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const box = cell(GUTTER + col * (w + GUTTER), GUTTER + row * (h + GUTTER), w, h, "montage-tile");
      const art = document.createElementNS(SVG_NS, "svg");
      art.setAttribute("viewBox", "-150 -350 300 330");
      art.setAttribute("class", "tile-art");
      const { node } = puppetNode(this.cast, victim.id, "terrified", false);
      art.append(node);
      const stamp = el("div", { class: "x-stamp" }, "✕");
      const cause = victim.cause ? `OUT: ${victim.cause}` : MODE_LABEL[victim.mode];
      box.append(art, el("div", { class: "tile-name" }, this.cast.name(victim.id)), el("div", { class: "tile-mode", "data-testid": "tile-cause" }, cause), stamp);
      root.append(box);
      const land = at + stamps[i];
      tl.fromTo(box, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3 }, at + 0.1 + i * 0.08);
      tl.fromTo(stamp, { scale: 3.5, opacity: 0, rotation: -40 }, { scale: 1, opacity: 1, rotation: -12, duration: 0.25, ease: "power4.in" }, land - 0.25);
      tl.to(box, { x: 6, duration: 0.05, yoyo: true, repeat: 3 }, land);
    });
    if (summary) {
      const banner = el(
        "div",
        { class: "montage-summary", "data-testid": "montage-summary" },
        el("strong", {}, summary.headline),
        ` ${summary.cause}`,
      );
      root.append(banner);
      tl.fromTo(banner, { opacity: 0, scale: 2.4 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power4.in" }, at + montageSummaryAt(duration));
    }
    tl.call(() => this.layer.append(root), undefined, at);
    tl.to(root, { opacity: 0, duration: 0.35 }, at + duration - 0.4);
    tl.call(() => root.remove(), undefined, at + duration);
  }
}
