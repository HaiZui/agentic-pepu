// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOUSE_IDS, SETTINGS } from "./catalog";
import { createDefs, ensureDefs } from "./defs";
import { HOUSE_COLORS } from "./palette";
import { renderProscenium } from "./proscenium";
import { renderScenery, STAGE_WIDTH } from "./scenery";
import { renderBanner, renderSigil } from "./sigils";

afterEach(() => vi.restoreAllMocks());

describe("scenery", () => {
  it.each(SETTINGS)("%s has three independently positionable layers", (setting) => {
    const scenery = renderScenery(setting);
    expect(scenery.setting).toBe(setting);
    for (const layer of ["back", "mid", "front"] as const) {
      expect(scenery[layer].getAttribute("data-layer")).toBe(layer);
      expect(scenery[layer].childElementCount).toBeGreaterThan(0);
    }
    expect(new Set([scenery.back, scenery.mid, scenery.front]).size).toBe(3);
  });

  it("falls back to a neutral scenery and warns for unknown settings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scenery = renderScenery("moon_base");
    expect(scenery.setting).toBe("fallback");
    expect(scenery.back.childElementCount).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("moon_base"));
  });

  it("can display the banners of the houses in a beat", () => {
    const scenery = renderScenery("battlefield", { banners: ["wolf", "eel"] });
    expect(scenery.mid.querySelector('[data-banner="wolf"]')).toBeTruthy();
    expect(scenery.mid.querySelector('[data-banner="eel"]')).toBeTruthy();
    expect(scenery.mid.querySelector('[data-banner="goat"]')).toBeNull();
  });

  it("is deterministic", () => {
    expect(renderScenery("harbor").mid.outerHTML).toBe(renderScenery("harbor").mid.outerHTML);
  });
});

describe("sigils and banners", () => {
  it.each(HOUSE_IDS)("House %s has a sigil and a banner in its colours", (house) => {
    expect(renderSigil(house).childElementCount).toBeGreaterThan(0);
    const banner = renderBanner(house).outerHTML;
    expect(banner).toContain(HOUSE_COLORS[house].primary);
    expect(banner).toContain(`data-sigil="${house}"`);
  });

  it("gives every house a different sigil", () => {
    expect(new Set(HOUSE_IDS.map((h) => renderSigil(h, "#000").innerHTML)).size).toBe(HOUSE_IDS.length);
  });
});

describe("proscenium", () => {
  it("covers the stage when closed and gathers the curtains when open", () => {
    const { root, setCurtains } = renderProscenium();
    const left = root.querySelector('[data-part="curtain-left"]')!;
    const right = root.querySelector('[data-part="curtain-right"]')!;
    expect(root.getAttribute("data-curtains")).toBe("closed");
    expect(left.getAttribute("transform")).toBe("scale(1 1)");

    setCurtains(1);
    expect(root.getAttribute("data-curtains")).toBe("open");
    expect(left.getAttribute("transform")).toMatch(/^scale\(0\.1\d* 1\)$/);
    expect(right.getAttribute("transform")).toContain(`translate(${STAGE_WIDTH} 0)`);

    setCurtains(0.5);
    expect(root.getAttribute("data-curtains")).toBe("moving");
    expect(root.querySelector('[data-part="footlights"]')).toBeTruthy();
  });
});

describe("shared defs", () => {
  it("defines the paper texture, halftones and paper filter", () => {
    const ids = [...createDefs().children].map((c) => c.getAttribute("id"));
    expect(ids).toEqual(expect.arrayContaining(["bt-fibres", "bt-halftone", "bt-halftone-fine", "bt-paper"]));
  });

  it("inserts defs once and sets the print mode class", () => {
    ensureDefs("print");
    ensureDefs("print");
    expect(document.querySelectorAll("#bt-defs")).toHaveLength(1);
    expect(document.documentElement.classList.contains("bt-print")).toBe(true);
    ensureDefs("stage");
    expect(document.documentElement.classList.contains("bt-print")).toBe(false);
  });
});
