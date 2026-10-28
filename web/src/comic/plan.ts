import type { FateScript, SceneScript } from "../stage/types";

export const MIN_PAGES = 16;
export const MAX_PAGES = 32;
/** One cast page holds this many participants; larger rosters spread over two. */
export const CAST_PAGE_LIMIT = 20;

export interface PanelRow {
  /** Panel indices (into the scene's panel moments), left to right. */
  cells: number[];
  /** Relative row height. */
  weight: number;
  splash: boolean;
}

export interface SceneBlock {
  beat: number;
  rows: PanelRow[];
  /** Second scene on a shared page: opens with a "MEANWHILE..." caption. */
  meanwhile: boolean;
}

export interface CastGroup {
  house: string | null;
  members: string[];
}

export type ComicPage =
  | { kind: "cover" }
  | { kind: "cast"; part: number; parts: number; groups: CastGroup[] }
  | { kind: "dramatis"; side: number; members: string[] }
  | { kind: "act"; act: 1 | 2 | 3 }
  | { kind: "scenes"; act: 1 | 2 | 3; blocks: SceneBlock[]; survivors: string[] }
  | { kind: "montage"; act: 1 | 2 | 3; beat: number; victims: { id: string; mode: string }[]; survivors: string[] }
  | { kind: "coronation" }
  | { kind: "epilogue" }
  | { kind: "back" };

type Density = "loose" | "normal" | "dense" | "denser" | "densest";

/** How much may share one page, from "every scene alone" to tightly packed. */
const SHARE: Record<Density, { panels: number; chars: number; each: number }> = {
  loose: { panels: 0, chars: 0, each: 0 },
  normal: { panels: 6, chars: 700, each: 3 },
  dense: { panels: 6, chars: 1100, each: 6 },
  denser: { panels: 8, chars: 1500, each: 6 },
  densest: { panels: 12, chars: 2400, each: 6 },
};

/** Lay a run of panels out in rows of two, with a single wide panel first when the count is odd. */
function pairRows(cells: number[]): PanelRow[] {
  const rows: PanelRow[] = [];
  let rest = [...cells];
  if (rest.length % 2 === 1) {
    const middle = rest.length === 5 ? 2 : 0;
    const before = rest.slice(0, middle);
    for (let i = 0; i < before.length; i += 2) rows.push({ cells: before.slice(i, i + 2), weight: 1, splash: false });
    rows.push({ cells: [rest[middle]], weight: 1.15, splash: false });
    rest = rest.slice(middle + 1);
  }
  for (let i = 0; i < rest.length; i += 2) rows.push({ cells: rest.slice(i, i + 2), weight: 1, splash: false });
  return rows;
}

/** Grid template for a scene: rows of panels in reading order; a "splash" moment gets a tall row to itself. */
export function sceneRows(scene: Pick<SceneScript, "panels">): PanelRow[] {
  const indices = scene.panels.map((_, i) => i);
  const splash = scene.panels.findIndex((p) => p.framing === "splash");
  if (splash < 0 || indices.length === 1) return pairRows(indices);
  return [
    ...pairRows(indices.slice(0, splash)),
    { cells: [splash], weight: 2, splash: true },
    ...pairRows(indices.slice(splash + 1)),
  ];
}

const textLength = (scene: Pick<SceneScript, "lines" | "captions">) =>
  scene.lines.reduce((t, l) => t + l.text.length, 0) + scene.captions.reduce((t, c) => t + c.text.length, 0);

/** Cast groups by house, then the court (Old King and supporting characters). */
export function castGroups(fate: FateScript): CastGroup[] {
  const participants = fate.characters.filter((c) => c.kind === "participant").map((c) => c.id);
  const groups: CastGroup[] =
    fate.houses.length > 0 ? fate.houses.map((h) => ({ house: h.id, members: [...h.members] })) : [{ house: null, members: participants }];
  const court = fate.characters.filter((c) => c.kind !== "participant").map((c) => c.id);
  if (court.length > 0) groups.push({ house: "court", members: court });
  return groups;
}

function castPages(fate: FateScript): ComicPage[] {
  const groups = castGroups(fate);
  const participants = fate.characters.filter((c) => c.kind === "participant").length;
  if (participants <= CAST_PAGE_LIMIT) return [{ kind: "cast", part: 1, parts: 1, groups }];
  // Two pages, houses kept whole, split where the halves are most even.
  const total = groups.reduce((t, g) => t + g.members.length, 0);
  let best = 1;
  let bestGap = Infinity;
  for (let split = 1; split < groups.length; split++) {
    const first = groups.slice(0, split).reduce((t, g) => t + g.members.length, 0);
    const gap = Math.abs(total - 2 * first);
    if (gap < bestGap) [best, bestGap] = [split, gap];
  }
  return [
    { kind: "cast", part: 1, parts: 2, groups: groups.slice(0, best) },
    { kind: "cast", part: 2, parts: 2, groups: groups.slice(best) },
  ];
}

const ACT_OF: Record<string, 1 | 2 | 3> = { cold_open: 1, act_1: 1, act_2: 2, act_3: 3, coronation: 3 };

/** Participants still in the contest after each beat, for the survivor strip. */
export function survivorsAfter(fate: FateScript): string[][] {
  let alive = fate.characters.filter((c) => c.kind === "participant").map((c) => c.id);
  const participants = new Set(alive);
  return fate.beats.map((beat) => {
    const out = new Set(beat.eliminations.map((e) => e.character));
    const back = (beat.resurrections ?? []).filter((id) => participants.has(id) && !alive.includes(id));
    alive = [...alive.filter((id) => !out.has(id)), ...back].sort();
    return alive;
  });
}

function scenePages(fate: FateScript, scenes: Map<number, SceneScript>, act: 1 | 2 | 3, density: Density): ComicPage[] {
  const pages: ComicPage[] = [];
  const after = survivorsAfter(fate);
  const share = SHARE[density];
  const beats = fate.beats.filter((b) => ACT_OF[b.section] === act && scenes.has(b.index));
  let open: { page: Extract<ComicPage, { kind: "scenes" }>; panels: number; chars: number; montage: boolean } | null = null;
  for (const beat of beats) {
    const scene = scenes.get(beat.index)!;
    const panels = scene.panels.length;
    const chars = textLength(scene);
    const montage = beat.eliminations.length >= 2;
    const fits =
      open &&
      !open.montage &&
      open.page.blocks.length === 1 &&
      panels <= share.each &&
      open.panels <= share.each &&
      open.panels + panels <= share.panels &&
      open.chars + chars <= share.chars;
    const block: SceneBlock = { beat: beat.index, rows: sceneRows(scene), meanwhile: !!fits };
    if (fits && open) {
      open.page.blocks.push(block);
      open.page.survivors = after[beat.index];
      open.panels += panels;
      open.chars += chars;
      open.montage = montage;
    } else {
      const page: Extract<ComicPage, { kind: "scenes" }> = { kind: "scenes", act, blocks: [block], survivors: after[beat.index] };
      pages.push(page);
      open = { page, panels, chars, montage };
    }
    if (montage) {
      pages.push({
        kind: "montage",
        act,
        beat: beat.index,
        victims: beat.eliminations.map((e) => ({ id: e.character, mode: e.mode })),
        survivors: after[beat.index],
      });
      open = null;
    }
  }
  return pages;
}

function assemble(fate: FateScript, scenes: Map<number, SceneScript>, density: Density, dramatis: boolean): ComicPage[] {
  const pages: ComicPage[] = [{ kind: "cover" }, ...castPages(fate)];
  if (dramatis) {
    const members = fate.characters.filter((c) => c.kind === "participant").map((c) => c.id);
    const half = Math.ceil(members.length / 2);
    pages.push({ kind: "dramatis", side: 0, members: members.slice(0, half) }, { kind: "dramatis", side: 1, members: members.slice(half) });
  }
  for (const act of [1, 2, 3] as const) pages.push({ kind: "act", act }, ...scenePages(fate, scenes, act, density));
  pages.push({ kind: "coronation" }, { kind: "epilogue" }, { kind: "back" });
  return pages;
}

/**
 * The comic's pages in reading order. Short neighbouring scenes share a page; the layout packs tighter
 * when the book would run past 32 pages and opens up (plus a Dramatis Personae spread) below 16.
 */
export function planComic(fate: FateScript, sceneList: readonly SceneScript[]): ComicPage[] {
  const scenes = new Map(sceneList.map((s) => [s.beat_index, s]));
  let pages = assemble(fate, scenes, "normal", false);
  for (const density of ["dense", "denser", "densest"] as const) {
    if (pages.length <= MAX_PAGES) break;
    pages = assemble(fate, scenes, density, false);
  }
  if (pages.length < MIN_PAGES) pages = assemble(fate, scenes, "loose", false);
  if (pages.length < MIN_PAGES) pages = assemble(fate, scenes, "loose", true);
  return pages;
}
