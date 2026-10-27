import { BLEED, createDefs, renderScenery, STAGE_HEIGHT, STAGE_WIDTH, type HouseId } from "../render";
import { SVG_NS } from "../render/svg";
import type { SettingId } from "./types";

const WIDTH = STAGE_WIDTH + 2 * BLEED;

/** Scenery on three layers; the back layer is rasterized once per setting to keep the SVG light. */
export class SceneryLayers {
  private current: string | null = null;
  private rasters = new Map<string, ImageBitmap | HTMLImageElement>();

  constructor(
    private readonly raster: HTMLCanvasElement,
    private readonly back: SVGSVGElement,
    private readonly mid: SVGSVGElement,
    private readonly front: SVGSVGElement,
  ) {}

  get setting(): string | null {
    return this.current;
  }

  set(setting: SettingId | null, banners: readonly HouseId[] = []): void {
    const key = `${setting}:${banners.join(",")}`;
    if (key === this.current) return;
    this.current = key;
    if (!setting) {
      this.back.replaceChildren();
      this.mid.replaceChildren();
      this.front.replaceChildren();
      this.raster.getContext("2d")?.clearRect(0, 0, WIDTH, STAGE_HEIGHT);
      return;
    }
    const scenery = renderScenery(setting, { banners });
    this.mid.replaceChildren(scenery.mid);
    this.front.replaceChildren(scenery.front);

    const cached = this.rasters.get(setting);
    if (cached) {
      this.drawRaster(cached);
      this.back.replaceChildren();
      return;
    }
    // Show the vector back layer at once, then swap in the bitmap when it is ready.
    this.back.replaceChildren(scenery.back);
    this.raster.getContext("2d")?.clearRect(0, 0, WIDTH, STAGE_HEIGHT);
    void this.rasterize(setting, scenery.back).then((image) => {
      if (!image) return;
      this.rasters.set(setting, image);
      if (this.current?.startsWith(`${setting}:`)) {
        this.drawRaster(image);
        this.back.replaceChildren();
      }
    });
  }

  private drawRaster(image: ImageBitmap | HTMLImageElement): void {
    const ctx = this.raster.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, STAGE_HEIGHT);
    ctx.drawImage(image, 0, 0, WIDTH, STAGE_HEIGHT);
  }

  private async rasterize(setting: string, layer: SVGGElement): Promise<ImageBitmap | HTMLImageElement | null> {
    try {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("xmlns", SVG_NS);
      svg.setAttribute("viewBox", `${-BLEED} 0 ${WIDTH} ${STAGE_HEIGHT}`);
      svg.setAttribute("width", String(WIDTH));
      svg.setAttribute("height", String(STAGE_HEIGHT));
      const style = document.createElementNS(SVG_NS, "style");
      style.textContent = inlineStyles();
      svg.append(style, createDefs(), layer.cloneNode(true));
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        await image.decode();
        return typeof createImageBitmap === "function" ? await createImageBitmap(image) : image;
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.warn(`Could not rasterize the ${setting} backdrop; keeping vectors`, error);
      return null;
    }
  }
}

/** Rules the scenery needs when drawn outside the document (ink, textures, halftones). */
function inlineStyles(): string {
  const rules: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of [...cssRules]) {
      if (rule instanceof CSSStyleRule && /\.(ink|ink-thin|line|line-thin|texture|halftone|halftone-fine|paper|scenery-fill|ink-fill)\b|:root/.test(rule.selectorText)) {
        rules.push(rule.cssText);
      }
    }
  }
  return rules.join("\n");
}
