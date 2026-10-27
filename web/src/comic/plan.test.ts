import { describe, expect, it } from "vitest";
import shapes from "../../../tests/fixtures/stage/comic-shapes.json";
import { FIXTURES } from "../stage/fixtures";
import type { FateScript, SceneScript } from "../stage/types";
import { castGroups, MAX_PAGES, MIN_PAGES, planComic, sceneRows, type ComicPage } from "./plan";

interface Shape {
  size: number;
  fate: FateScript;
  scenes: { beat_index: number; panels: string[]; lines: number[]; captions: number[] }[];
}

/** Rebuild scene scripts from a shape, optionally forcing every scene to `panels` panels and longer text. */
function scenesOf(shape: Shape, override?: { panels: number; textScale: number }): SceneScript[] {
  return shape.scenes.map((s) => {
    const count = override?.panels ?? s.panels.length;
    const framings = Array.from({ length: count }, (_, i) => s.panels[i] ?? (i === 2 ? "splash" : "medium"));
    const scale = override?.textScale ?? 1;
    return {
      beat_index: s.beat_index,
      panels: framings.map((framing) => ({ framing, ref_kind: "line", ref_index: 0, focus: [] })),
      lines: s.lines.map((n) => ({ speaker: "narrator", emotion: "neutral", action: null, text: "x".repeat(Math.min(140, Math.round(n * scale))) })),
      captions: s.captions.map((n) => ({ text: "x".repeat(n), before_line: 0 })),
    } as unknown as SceneScript;
  });
}

const beatsOf = (pages: ComicPage[]) =>
  pages.flatMap((p) => (p.kind === "scenes" ? p.blocks.map((b) => b.beat) : []));

describe("planComic()", () => {
  it("orders a 15-peasant comic: cover, cast, three acts, coronation, epilogue, back cover", () => {
    const { fate, scenes } = FIXTURES[15];
    const pages = planComic(fate, scenes);
    const kinds = pages.map((p) => p.kind).filter((k, i, all) => k !== all[i - 1]);
    expect(kinds.slice(0, 3)).toEqual(["cover", "cast", "act"]);
    expect(kinds.slice(-3)).toEqual(["coronation", "epilogue", "back"]);
    expect(pages.filter((p) => p.kind === "act").map((p) => (p.kind === "act" ? p.act : 0))).toEqual([1, 2, 3]);

    // Every beat appears once, in story order, inside its act.
    expect(beatsOf(pages)).toEqual(fate.beats.map((b) => b.index));
    let act = 0;
    for (const page of pages) {
      if (page.kind === "act") act = page.act;
      if (page.kind === "scenes") {
        for (const block of page.blocks) {
          const section = fate.beats[block.beat].section;
          expect({ cold_open: 1, act_1: 1, act_2: 2, act_3: 3, coronation: 3 }[section]).toBe(act);
        }
      }
    }
  });

  it("follows a crowd elimination with a montage page of its victims", () => {
    const { fate, scenes } = FIXTURES[40];
    const pages = planComic(fate, scenes);
    for (const beat of fate.beats.filter((b) => b.eliminations.length >= 2)) {
      const at = pages.findIndex((p) => p.kind === "montage" && p.beat === beat.index);
      expect(at).toBeGreaterThan(0);
      const before = pages[at - 1];
      expect(before.kind === "scenes" && before.blocks.some((b) => b.beat === beat.index)).toBe(true);
      const montage = pages[at];
      expect(montage.kind === "montage" && montage.victims.map((v) => v.id).sort()).toEqual(beat.eliminations.map((e) => e.character).sort());
    }
  });

  it("puts two short scenes on one page with a MEANWHILE caption on the second", () => {
    const { fate, scenes } = FIXTURES[15];
    const shared = planComic(fate, scenes).filter((p) => p.kind === "scenes" && p.blocks.length === 2);
    expect(shared.length).toBeGreaterThan(0);
    for (const page of shared) if (page.kind === "scenes") expect(page.blocks.map((b) => b.meanwhile)).toEqual([false, true]);
  });

  it("fits the cast on one page up to 20 peasants and on two above, houses kept whole", () => {
    const small = planComic(FIXTURES[15].fate, FIXTURES[15].scenes).filter((p) => p.kind === "cast");
    expect(small).toHaveLength(1);
    const fate = FIXTURES[40].fate;
    const big = planComic(fate, FIXTURES[40].scenes).filter((p) => p.kind === "cast");
    expect(big).toHaveLength(2);
    const listed = big.flatMap((p) => (p.kind === "cast" ? p.groups : []));
    expect(listed.map((g) => g.house)).toEqual(castGroups(fate).map((g) => g.house));
  });

  it("lays out panels by count, giving a splash moment its own tall row", () => {
    const layout = (framings: string[]) =>
      sceneRows({ panels: framings.map((framing) => ({ framing })) } as unknown as SceneScript).map((r) => (r.splash ? "S" : r.cells.length));
    expect(layout(["wide", "medium", "close_up"])).toEqual([1, 2]);
    expect(layout(["wide", "medium", "close_up", "medium"])).toEqual([2, 2]);
    expect(layout(["wide", "medium", "close_up", "medium", "wide"])).toEqual([2, 1, 2]);
    expect(layout(["wide", "medium", "close_up", "medium", "wide", "close_up"])).toEqual([2, 2, 2]);
    expect(layout(["wide", "splash", "close_up", "medium"])).toEqual([1, "S", 2]);
  });
});

describe("page count", () => {
  const all = shapes as unknown as Shape[];
  const variants = [
    { name: "fallback scenes", override: undefined },
    { name: "every scene 3 panels, twice the text", override: { panels: 3, textScale: 2 } },
    { name: "every scene 6 panels", override: { panels: 6, textScale: 1.5 } },
    { name: "every scene 4 panels", override: { panels: 4, textScale: 1 } },
  ];

  it.each(variants)("stays between 16 and 32 pages for every roster from 3 to 40 ($name)", ({ override }) => {
    expect(all.map((s) => s.size)).toEqual(Array.from({ length: 38 }, (_, i) => i + 3));
    for (const shape of all) {
      const pages = planComic(shape.fate, scenesOf(shape, override));
      expect(pages.length, `N=${shape.size}`).toBeGreaterThanOrEqual(MIN_PAGES);
      expect(pages.length, `N=${shape.size}`).toBeLessThanOrEqual(MAX_PAGES);
      expect(beatsOf(pages)).toEqual(shape.fate.beats.map((b) => b.index));
      expect(pages.filter((p) => p.kind === "cast").length).toBe(shape.size > 20 ? 2 : 1);
    }
  });
});
