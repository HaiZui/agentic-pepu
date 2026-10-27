import { describe, expect, it } from "vitest";
import { frame, panelGrid, STAGE_H, STAGE_W, type Spot } from "./panels";

const spots: Spot[] = [
  { id: "a", x: 600, layer: "fore" },
  { id: "b", x: 1320, layer: "fore" },
  { id: "c", x: 900, layer: "back" },
];

const contains = (v: { x: number; width: number }, x: number) => x >= v.x && x <= v.x + v.width;

describe("frame()", () => {
  it("returns the whole stage for a wide shot", () => {
    expect(frame("wide", ["a"], spots)).toEqual({ x: 0, y: 0, width: STAGE_W, height: STAGE_H });
  });

  it("pushes in on the focused character for a close-up, keeping 16:9", () => {
    const view = frame("close_up", ["b"], spots);
    expect(view.width).toBeLessThan(STAGE_W / 2);
    expect(view.width / view.height).toBeCloseTo(16 / 9, 2);
    expect(contains(view, 1320)).toBe(true);
    expect(contains(view, 600)).toBe(false);
  });

  it("orders framings from loose to tight", () => {
    const widths = (["wide", "medium", "over_shoulder", "close_up", "extreme_close_up"] as const).map(
      (f) => frame(f, ["a"], spots).width,
    );
    expect(widths).toEqual([...widths].sort((x, y) => y - x));
  });

  it("widens a medium shot to keep two distant characters in frame", () => {
    const view = frame("medium", ["a", "b"], spots);
    expect(contains(view, 600) && contains(view, 1320)).toBe(true);
  });

  it("stays inside the stage at the edges and honours other aspect ratios", () => {
    const edge = frame("close_up", ["x"], [{ id: "x", x: 40, layer: "fore" }]);
    expect(edge.x).toBe(0);
    const tall = frame("medium", ["a"], spots, 3 / 4);
    expect(tall.width / tall.height).toBeCloseTo(3 / 4, 2);
    expect(tall.y + tall.height).toBeLessThanOrEqual(STAGE_H);
  });

  it("falls back to the foreground when the focus is empty or in the background", () => {
    const view = frame("medium", ["c"], spots);
    expect(contains(view, 600) && contains(view, 1320)).toBe(true);
  });
});

describe("panelGrid()", () => {
  it.each([1, 2, 3, 4, 5, 6])("lays out %i non-overlapping cells inside the page", (count) => {
    const cells = panelGrid(count);
    expect(cells).toHaveLength(count);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.width).toBeLessThanOrEqual(STAGE_W);
      expect(cell.y + cell.height).toBeLessThanOrEqual(STAGE_H);
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const [a, b] = [cells[i], cells[j]];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });
});
