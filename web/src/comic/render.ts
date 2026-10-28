import type { ChronicleTexts, Reveal, ShowBible } from "../api/client";
import { el } from "../dom";
import {
  BLEED,
  ensureDefs,
  renderBanner,
  renderScenery,
  renderSigilBadge,
  vectorizeTextures,
  type HouseId,
} from "../render";
import { SVG_NS } from "../render/svg";
import { FLOOR, frame } from "../shared/panels";
import { puppetNode } from "../stage/actors";
import { CastSheet } from "../stage/cast";
import { panelArt } from "../stage/panels-view";
import type { Announcement, FateScript, SceneScript, SettingId, Storyline } from "../stage/types";
import "./comic.css";
import { comicPanels, type ComicPanel } from "./content";
import { fitPanel } from "./fit";
import { planComic, type ComicPage, type PanelRow, type SceneBlock } from "./plan";
import { expectedStamps, renderedStamps, rosterNames, verifyCommand } from "./verify";

export interface ComicData {
  fate: FateScript;
  scenes: SceneScript[];
  chronicle: ChronicleTexts | null;
  bible: ShowBible | null;
  reveal: Reveal | null;
  /** ISO date-time of the show (the issue date). */
  createdAt: string;
  attributions: string[];
  /** Survivors and OUT / RETURNS wording from the backend; without it the comic has strips but no stamps. */
  storyline?: Storyline | null;
}

const MM = 96 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN = 9 * MM;
const GUTTER = 3.2 * MM;
const INNER_W = PAGE_W - 2 * MARGIN;
const BLOCK_HEADER = 8 * MM;
const FOOTER = 6 * MM;
/** Survivor strip band at the foot of every scene page; panels shrink to make room, so no page is added. */
const STRIP = 10.5 * MM;
/** Smallest lettering the survivor strip may shrink to before it counts as not fitting. */
const STRIP_MIN_PX = 6;
/** Normal lettering size inside panels, in CSS px. */
export const LETTERING_PX = 13;

const ROMAN = ["", "I", "II", "III"];
const DEFAULT_ACT_TITLES = ["", "The Call", "The Game", "The Throne"];
const MODE_LABEL: Record<string, string> = { killed: "fallen", forfeited: "forfeited", exiled: "exiled" };
const ACT_OF: Record<string, number> = { cold_open: 1, act_1: 1, act_2: 2, act_3: 3, coronation: 3 };

function svg(viewBox: string, className: string, ...children: SVGElement[]): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("viewBox", viewBox);
  root.setAttribute("class", className);
  root.setAttribute("preserveAspectRatio", "xMidYMid slice");
  root.append(...children);
  return root;
}

function px(element: HTMLElement, box: { x: number; y: number; w: number; h: number }): HTMLElement {
  Object.assign(element.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
  return element;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** A staged tableau: scenery plus puppets at given positions, cropped to the target aspect. */
function tableau(
  cast: CastSheet,
  setting: SettingId,
  figures: { id: string; x: number; scale: number; emotion?: Parameters<typeof puppetNode>[2]; dy?: number }[],
  aspect: number,
  zoomWidth = 1500,
): SVGSVGElement {
  const width = Math.min(1920 + 2 * BLEED, zoomWidth);
  const height = Math.min(1080, width / aspect);
  const view = `${960 - width / 2} ${1080 - height} ${width} ${height}`;
  const scenery = renderScenery(setting);
  const art = svg(view, "tableau", scenery.back, scenery.mid);
  for (const f of figures) {
    const { node } = puppetNode(cast, f.id, f.emotion ?? "neutral", false);
    node.setAttribute("transform", `translate(${f.x} ${FLOOR + (f.dy ?? 0)}) scale(${f.scale})`);
    art.append(node);
  }
  art.append(scenery.front);
  return art;
}

function portrait(cast: CastSheet, id: string, size: "small" | "large"): HTMLElement {
  const member = cast.get(id);
  const { node } = puppetNode(cast, id, "neutral", false);
  const art = svg(size === "small" ? "-105 -335 210 260" : "-115 -340 230 330", "portrait-art", node);
  const archetype = member?.character.archetype;
  const role = member?.character.kind === "npc" ? "Supporting cast" : member?.character.kind === "old_king" ? "The Old King" : archetype;
  return el(
    "figure",
    { class: `portrait portrait-${size}` },
    art,
    el("figcaption", {}, el("strong", {}, cast.name(id)), role ? el("span", {}, role.replace(/^\w/, (c) => c.toUpperCase())) : null),
  );
}

function groupTitle(cast: CastSheet, house: string | null): HTMLElement {
  const heading = el("h3", { class: "group-title" });
  if (house && house !== "court") {
    heading.append(svg("-30 -30 60 60", "group-sigil", renderSigilBadge(house as HouseId, 0, 0, 56)));
  }
  heading.append(house === "court" ? "The Court" : house ? cast.houseName(house) : "The Peasants");
  return heading;
}

export class ComicRenderer {
  readonly cast: CastSheet;
  private panels: Map<number, ComicPanel[]>;
  private pageNumber = 0;

  constructor(private readonly data: ComicData) {
    this.cast = new CastSheet(data.fate);
    this.panels = comicPanels(data.fate, data.scenes, data.storyline ?? null);
  }

  private page(kind: string, ...children: (Node | null)[]): HTMLElement {
    this.pageNumber++;
    const section = el("section", { class: `page page-${kind}`, "data-page": String(this.pageNumber), "data-kind": kind });
    section.append(...children.filter((c): c is Node => c !== null));
    if (kind !== "cover" && kind !== "back") section.append(el("div", { class: "folio" }, String(this.pageNumber)));
    return section;
  }

  private beat(index: number) {
    return this.data.fate.beats[index];
  }

  private actTitle(act: number): string {
    const titles = this.data.chronicle?.act_titles;
    return titles ? [titles.act_1, titles.act_2, titles.act_3][act - 1] : DEFAULT_ACT_TITLES[act];
  }

  render(): HTMLElement[] {
    this.pageNumber = 0;
    this.cast.crowned = false;
    return planComic(this.data.fate, this.data.scenes).map((p) => this.renderPage(p));
  }

  private renderPage(p: ComicPage): HTMLElement {
    switch (p.kind) {
      case "cover":
        return this.cover();
      case "cast":
        return this.castPage(p);
      case "dramatis":
        return this.dramatis(p);
      case "act":
        return this.actPage(p.act);
      case "scenes":
        return this.scenesPage(p.blocks, p.survivors);
      case "montage":
        return this.montagePage(p.beat, p.victims, p.survivors);
      case "coronation":
        return this.coronation();
      case "epilogue":
        return this.epilogue();
      case "back":
        return this.backCover();
    }
  }

  private cover(): HTMLElement {
    const { fate, chronicle, bible } = this.data;
    const title = chronicle?.cover_title ?? bible?.title ?? "The Bottle Throne";
    const finalBeat = fate.beats.find((b) => b.card === "final_duel");
    const contenders = (finalBeat?.roles ?? []).map((r) => r.character).filter((id) => id !== fate.old_king).slice(0, 2);
    const art = tableau(
      this.cast,
      "throne_room",
      [
        { id: fate.old_king, x: 960, scale: 1.7, emotion: "smug", dy: 40 },
        ...contenders.map((id, i) => ({ id, x: i === 0 ? 560 : 1360, scale: 1.45, emotion: i === 0 ? ("scheming" as const) : ("furious" as const), dy: 120 })),
      ],
      190 / 150,
    );
    const names = rosterNames(fate);
    return this.page(
      "cover",
      el("div", { class: "masthead" }, "The Bottle Throne"),
      el("div", { class: "issue" }, `Friday Raffle Special · ${formatDate(this.data.createdAt)}`),
      el("div", { class: "cover-art" }, art),
      el("h1", { class: "cover-title" }, title.replace(/^The Bottle Throne:\s*/i, "")),
      el("p", { class: "starring" }, el("strong", {}, "Starring "), names.join(" · ")),
    );
  }

  private castPage(p: Extract<ComicPage, { kind: "cast" }>): HTMLElement {
    const size = this.data.fate.roster_size > 12 ? "small" : "large";
    return this.page(
      "cast",
      el("h2", { class: "page-title" }, p.parts > 1 ? `The Cast (${p.part}/${p.parts})` : "The Cast"),
      ...p.groups.map((g) =>
        el("section", { class: "cast-group" }, groupTitle(this.cast, g.house), el("div", { class: `cast-grid cast-${size}` }, ...g.members.map((id) => portrait(this.cast, id, size)))),
      ),
    );
  }

  private dramatis(p: Extract<ComicPage, { kind: "dramatis" }>): HTMLElement {
    const fate = this.data.fate;
    return this.page(
      "dramatis",
      el("h2", { class: "page-title" }, p.side === 0 ? "Dramatis Personae" : "Dramatis Personae, continued"),
      el(
        "div",
        { class: "dramatis-grid" },
        ...p.members.map((id) => {
          const character = fate.characters.find((c) => c.id === id);
          return el(
            "div",
            { class: "dramatis-entry" },
            portrait(this.cast, id, "large"),
            el("p", {}, `Of ${this.cast.houseName(character?.house ?? null)}. ${id === fate.old_king ? "Wears the old crown. " : ""}`),
          );
        }),
      ),
    );
  }

  private actPage(act: 1 | 2 | 3): HTMLElement {
    const beats = this.data.fate.beats.filter((b) => ACT_OF[b.section] === act);
    const setting = beats[act === 1 ? Math.min(1, beats.length - 1) : 0]?.setting ?? "throne_room";
    return this.page(
      "act",
      el("div", { class: "act-number" }, `Act ${ROMAN[act]}`),
      el("div", { class: "act-title" }, this.actTitle(act)),
      el("div", { class: "act-art" }, tableau(this.cast, setting, [], 190 / 120)),
      el("ol", { class: "act-contents" }, ...beats.map((b) => el("li", {}, b.title))),
    );
  }

  /** "Still standing": who is in the contest after the last scene on the page, and how many. */
  private survivorStrip(survivors: string[]): HTMLElement {
    const total = this.data.fate.characters.filter((c) => c.kind === "participant").length;
    const size = survivors.length > 24 ? "tiny" : survivors.length > 12 ? "small" : "normal";
    const strip = el(
      "div",
      { class: `survivor-strip strip-${size}`, "data-testid": "survivor-strip", "data-survivors": survivors.join(" ") },
      el("strong", { class: "strip-count" }, survivors.length === 1 ? "1 remains" : `${survivors.length} of ${total} remain`),
      el("span", { class: "strip-names" }, survivors.map((id) => this.cast.name(id)).join(" · ")),
    );
    return px(strip, { x: MARGIN, y: PAGE_H - MARGIN - FOOTER - STRIP + 1.5 * MM, w: INNER_W, h: STRIP - 1.5 * MM });
  }

  private scenesPage(blocks: SceneBlock[], survivors: string[]): HTMLElement {
    const available = PAGE_H - 2 * MARGIN - FOOTER - STRIP;
    const weights = blocks.map((b) => b.rows.reduce((t, r) => t + r.weight, 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let y = MARGIN;
    const children: HTMLElement[] = [];
    blocks.forEach((block, i) => {
      const height = (available * weights[i]) / total - (i > 0 ? GUTTER : 0);
      if (i > 0) y += GUTTER;
      children.push(this.sceneBlock(block, y, height));
      y += height;
    });
    return this.page("scenes", ...children, this.survivorStrip(survivors));
  }

  private sceneBlock(block: SceneBlock, top: number, height: number): HTMLElement {
    const beat = this.beat(block.beat);
    const panels = this.panels.get(block.beat) ?? [];
    const root = el("div", { class: "scene-block", "data-beat": String(block.beat) });
    root.append(
      px(
        el("div", { class: "block-title" }, block.meanwhile ? el("span", { class: "meanwhile" }, "Meanwhile...") : null, beat.title),
        { x: MARGIN, y: top, w: INNER_W, h: BLOCK_HEADER - 1.5 * MM },
      ),
    );
    const gridTop = top + BLOCK_HEADER;
    const gridHeight = height - BLOCK_HEADER;
    const totalWeight = block.rows.reduce((t, r) => t + r.weight, 0);
    const rowSpace = gridHeight - GUTTER * (block.rows.length - 1);
    let y = gridTop;
    for (const row of block.rows) {
      const h = (rowSpace * row.weight) / totalWeight;
      this.panelRow(root, row, panels, block.beat, y, h);
      y += h + GUTTER;
    }
    return root;
  }

  private panelRow(root: HTMLElement, row: PanelRow, panels: ComicPanel[], beat: number, y: number, h: number): void {
    const w = (INNER_W - GUTTER * (row.cells.length - 1)) / row.cells.length;
    row.cells.forEach((index, i) => {
      const panel = panels[index];
      if (!panel) return;
      root.append(this.panel(panel, `${beat}-${index}`, { x: MARGIN + i * (w + GUTTER), y, w, h }, row.splash));
    });
  }

  private panel(panel: ComicPanel, id: string, box: { x: number; y: number; w: number; h: number }, splash: boolean): HTMLElement {
    const art = panelArt(panel.shot, this.cast, box.w, box.h);
    const view = frame(panel.shot.framing, panel.shot.focus, panel.shot.placements, box.w / box.h);
    const column = el("div", { class: "panel-text" });
    for (const text of panel.texts) {
      if (text.kind === "caption") {
        column.append(el("div", { class: "caption" }, text.text));
        continue;
      }
      const spot = panel.shot.placements.find((p) => p.id === text.speaker && p.layer === "fore");
      const at = spot ? (spot.x - view.x) / view.width : null;
      const who = this.cast.name(text.speaker ?? "");
      const balloon = el(
        "div",
        { class: `balloon${text.ghost ? " ghost" : ""}`, "data-speaker": text.speaker ?? "" },
        el("span", { class: "who" }, text.ghost ? `Ghost of ${who}` : who),
        el("span", { class: "said" }, text.text),
      );
      if (at !== null && at > 0.02 && at < 0.98) balloon.dataset.tail = at.toFixed(3);
      column.append(balloon);
    }
    for (const stamp of panel.stamps) column.append(stampCaption(stamp));
    const sounds = panel.sounds.map((s, i) => el("div", { class: `sound sound-${i % 2}` }, s));
    return px(el("div", { class: `c-panel${splash ? " splash" : ""}`, "data-panel": id, "data-framing": panel.shot.framing }, art, column, ...sounds), box);
  }

  private montagePage(beat: number, victims: { id: string; mode: string }[], survivors: string[]): HTMLElement {
    const columns = victims.length <= 4 ? 2 : 3;
    const story = this.data.storyline?.beats[beat];
    const outOf = (id: string) => story?.announcements.find((a) => a.kind === "out" && a.character === id) ?? null;
    const summary = story?.announcements.find((a) => a.kind === "summary") ?? null;
    return this.page(
      "montage",
      el("h2", { class: "page-title" }, `${this.beat(beat).title}: the fallen`),
      summary ? stampCaption(summary, "c-montage-summary") : null,
      el(
        "div",
        { class: `montage-grid cols-${columns}${victims.length <= 2 ? " few" : ""}` },
        ...victims.map((v) =>
          el(
            "div",
            { class: "c-tile" },
            svg("-120 -350 240 340", "c-tile-art", puppetNode(this.cast, v.id, "terrified", false).node),
            el("div", { class: "c-tile-name" }, this.cast.name(v.id)),
            ((out) =>
              out
                ? el("div", { class: "c-tile-mode c-tile-cause", "data-stamp": `${out.headline} | ${out.cause}` }, `Out: ${out.cause}`)
                : el("div", { class: "c-tile-mode" }, MODE_LABEL[v.mode] ?? v.mode))(outOf(v.id)),
            el("div", { class: "c-x-stamp" }, "✕"),
          ),
        ),
      ),
      this.survivorStrip(survivors),
    );
  }

  private rays(): SVGSVGElement {
    const rays = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      const b = ((i + 0.5) / 28) * Math.PI * 2;
      const ray = document.createElementNS(SVG_NS, "path");
      ray.setAttribute("d", `M0 0 L${Math.cos(a) * 1500} ${Math.sin(a) * 1500} L${Math.cos(b) * 1500} ${Math.sin(b) * 1500} Z`);
      ray.setAttribute("class", i % 2 ? "ray-a" : "ray-b");
      return ray;
    });
    return svg("-400 -560 800 1120", "rays", ...rays);
  }

  private coronation(): HTMLElement {
    const winner = this.data.fate.winner;
    this.cast.crowned = true;
    const { node } = puppetNode(this.cast, winner, "triumphant", false);
    const figure = svg("-140 -360 280 400", "coronation-figure", node);
    const house = this.cast.get(winner)?.house;
    return this.page(
      "coronation",
      this.rays(),
      el("div", { class: "long-live" }, "Long live"),
      el("div", { class: "monarch" }, this.cast.name(winner)),
      figure,
      house ? el("div", { class: "coronation-banner" }, svg("-100 -10 200 300", "banner-art", renderBanner(house, 260))) : null,
      el("div", { class: "monarch-sub" }, "Ruler of the Bottle Throne"),
    );
  }

  private epilogue(): HTMLElement {
    const winner = this.data.fate.winner;
    const text = this.data.chronicle?.epilogue ?? `${this.cast.name(winner)} now sits upon the Bottle Throne.`;
    const art = tableau(this.cast, "throne_room", [{ id: winner, x: 960, scale: 1.6, emotion: "triumphant", dy: 60 }], 190 / 110, 1300);
    return this.page(
      "epilogue",
      el("h2", { class: "page-title" }, "Epilogue"),
      el("div", { class: "epilogue-art" }, art),
      el("p", { class: "epilogue-text" }, text),
      el("div", { class: "the-end" }, "The End"),
    );
  }

  private backCover(): HTMLElement {
    const { fate, reveal, chronicle, attributions } = this.data;
    const fallenBy = new Map<string, { mode: string; title: string; index: number }>();
    for (const beat of fate.beats) for (const e of beat.eliminations) fallenBy.set(e.character, { mode: e.mode, title: beat.title, index: beat.index });
    const fallen = fate.characters
      .filter((c) => c.kind === "participant" && c.id !== fate.winner)
      .map((c) => ({ name: c.name, ...(fallenBy.get(c.id) ?? { mode: "vanished", title: "", index: Infinity }) }))
      .sort((a, b) => a.index - b.index);
    const seed = reveal?.seed ?? "(not revealed)";
    const manual = (reveal?.seed_mode ?? fate.seed_mode) === "manual";
    return this.page(
      "back",
      chronicle?.blurb ? el("p", { class: "blurb" }, chronicle.blurb) : null,
      el(
        "section",
        { class: "proof" },
        el("h3", {}, "The Seal of Fate"),
        el("p", { class: "c-seal", "data-testid": "seal" }, fate.seal),
        el("p", {}, el("strong", {}, "Seed: "), el("code", { "data-testid": "seed" }, seed), manual ? el("span", { class: "badge" }, "manual seed") : null),
        el("p", {}, el("strong", {}, "Engine: "), fate.engine_version, ". Winner crowned: ", el("strong", {}, this.cast.name(fate.winner)), "."),
        el("h3", {}, "Check it yourself"),
        el("p", {}, "Save the roster below as roster.txt (one name per line) and run, from the project folder:"),
        el("pre", { class: "verify", "data-testid": "verify" }, verifyCommand(fate, seed)),
        el("p", { class: "roster", "data-testid": "roster" }, rosterNames(fate).join(" · ")),
        el("p", { class: "c-hint" }, "It prints the same Seal of Fate and the same winner."),
      ),
      el(
        "section",
        { class: "back-fallen" },
        el("h3", {}, "The Fallen"),
        el("ul", {}, ...fallen.map((f) => el("li", {}, el("strong", {}, f.name), ` ${MODE_LABEL[f.mode] ?? f.mode}${f.title ? ` in ${f.title}` : ""}`))),
      ),
      el(
        "section",
        { class: "disclosure", "data-testid": "disclosure" },
        el(
          "p",
          {},
          "The outcome of this story was decided by a random seed before a single word was written. The dialogue was written by AI from that fixed fate; nothing here describes the real people whose names appear.",
        ),
        attributions.length > 0 ? el("p", { class: "attributions" }, el("strong", {}, "Music & sound: "), attributions.join(" · ")) : null,
        el("p", { class: "imprint" }, `The Bottle Throne · printed ${formatDate(this.data.createdAt)}`),
      ),
    );
  }

  /** After layout: fit every panel's lettering and point balloon tails at their speakers. */
  layout(root: HTMLElement): { panels: number; unfit: string[] } {
    const unfit: string[] = [];
    for (const strip of root.querySelectorAll<HTMLElement>('[data-testid="survivor-strip"]')) {
      const names = strip.querySelector<HTMLElement>(".strip-names");
      let size = parseFloat(getComputedStyle(strip).fontSize);
      while (names && names.scrollHeight > strip.clientHeight && size > STRIP_MIN_PX) {
        size -= 0.5;
        strip.style.fontSize = `${size}px`;
      }
      if (strip.scrollHeight > strip.clientHeight + 1) unfit.push(`strip-${strip.closest(".page")?.getAttribute("data-page") ?? "?"}`);
    }
    const panels = [...root.querySelectorAll<HTMLElement>(".c-panel")];
    for (const panel of panels) {
      if (!fitPanel(panel, LETTERING_PX).fits) unfit.push(panel.dataset.panel ?? "?");
      const box = panel.getBoundingClientRect();
      for (const balloon of panel.querySelectorAll<HTMLElement>(".balloon[data-tail]")) {
        const target = box.left + Number(balloon.dataset.tail) * box.width;
        const rect = balloon.getBoundingClientRect();
        const x = Math.min(Math.max(target - rect.left, 18), rect.width - 18);
        balloon.style.setProperty("--tail-x", `${x.toFixed(1)}px`);
        balloon.classList.add(target < rect.left + rect.width / 2 ? "tail-left" : "tail-right");
      }
    }
    return { panels: panels.length, unfit };
  }
}

/** A stamp box in the comic, with the same headline and cause as the stage stamp. */
function stampCaption(stamp: Announcement, extra = ""): HTMLElement {
  return el(
    "div",
    { class: `c-stamp c-stamp-${stamp.kind} ${extra}`.trim(), "data-stamp": `${stamp.headline} | ${stamp.cause}` },
    el("strong", {}, stamp.headline),
    ` ${stamp.cause}`,
  );
}

/** Render every page into `root`, then fit lettering and convert textures to vectors for print. */
export async function renderComic(
  root: HTMLElement,
  data: ComicData,
): Promise<{ pages: number; panels: number; unfit: string[]; stampsMissing: string[] }> {
  ensureDefs("print");
  const renderer = new ComicRenderer(data);
  const pages = renderer.render();
  const book = el("div", { class: "comic", "data-testid": "comic" }, ...pages);
  root.replaceChildren(book);
  await document.fonts.ready;
  await Promise.all(
    ['400 16px "Bangers"', '700 16px "Comic Neue"', '400 16px "Comic Neue"'].map((font) => document.fonts.load(font, "ÄÖÅäöå").catch(() => [])),
  );
  const result = renderer.layout(book);
  vectorizeTextures(book);
  const shown = renderedStamps(book);
  const stampsMissing = data.storyline ? expectedStamps(data.storyline).filter((s) => !shown.includes(s)) : [];
  return { pages: pages.length, ...result, stampsMissing };
}
