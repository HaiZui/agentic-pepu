import { COMIC } from "./palette";
import { Rng } from "./prng";
import { g, s, svgRoot } from "./svg";

export type RenderMode = "stage" | "print";

const DEFS_ID = "bt-defs";

/** Shared paper-and-ink definitions (textures, halftones, filters), referenced by url(#bt-...). */
export function createDefs(): SVGDefsElement {
  const fibres = s(
    "pattern",
    { id: "bt-fibres", width: 48, height: 48, patternUnits: "userSpaceOnUse" },
    s("path", {
      d: "M3 7 l9 2 M22 4 l7 -2 M37 12 l8 3 M6 25 l6 -3 M18 31 l10 1 M33 27 l5 4 M9 41 l8 2 M27 43 l9 -2 M41 37 l5 -4",
      stroke: "#fff8e6",
      "stroke-width": 1.1,
      "stroke-linecap": "round",
      opacity: 0.55,
    }),
    s("path", {
      d: "M13 15 l6 1 M30 19 l7 -1 M2 33 l5 2 M21 38 l6 -2 M40 45 l5 1 M44 6 l3 3",
      stroke: "#3a2a14",
      "stroke-width": 0.8,
      "stroke-linecap": "round",
      opacity: 0.22,
    }),
  );

  const halftone = (id: string, r: number, size: number) =>
    s(
      "pattern",
      { id, width: size, height: size, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
      s("circle", { cx: size / 2, cy: size / 2, r, fill: COMIC.ink }),
    );

  const paper = s(
    "filter",
    { id: "bt-paper", x: "-5%", y: "-5%", width: "110%", height: "110%" },
    s("feTurbulence", { type: "fractalNoise", baseFrequency: 0.035, numOctaves: 2, seed: 7, result: "noise" }),
    s("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: 3.5, xChannelSelector: "R", yChannelSelector: "G" }),
  );

  const glow = s(
    "radialGradient",
    { id: "bt-footlight" },
    s("stop", { offset: "0%", "stop-color": "#fff4c2", "stop-opacity": 0.95 }),
    s("stop", { offset: "60%", "stop-color": COMIC.yellow, "stop-opacity": 0.35 }),
    s("stop", { offset: "100%", "stop-color": COMIC.yellow, "stop-opacity": 0 }),
  );

  return s(
    "defs",
    {},
    fibres,
    halftone("bt-halftone", 1.7, 7),
    halftone("bt-halftone-fine", 1, 5),
    paper,
    glow,
  );
}

/** Inserts the shared defs into the document once and sets the render mode on <html>. */
export function ensureDefs(mode: RenderMode = "stage"): void {
  document.documentElement.classList.toggle("bt-print", mode === "print");
  if (document.getElementById(DEFS_ID)) return;
  const holder = svgRoot("0 0 1 1", {
    id: DEFS_ID,
    width: 0,
    height: 0,
    "aria-hidden": "true",
    style: "position:absolute;width:0;height:0;overflow:hidden",
  });
  holder.append(createDefs());
  document.body.prepend(holder);
}

/** A cut-out shape with its paper texture overlay drawn on top of the same outline. */
export function papered(d: string, fillClass: string, extra: Record<string, string | number> = {}): SVGGElement {
  return g(
    {},
    s("path", { d, class: `${fillClass} ink`, ...extra }),
    s("path", { d, class: "texture" }),
  );
}

const r1 = (n: number) => Math.round(n * 10) / 10;
let clipCounter = 0;

function fibreMarks(box: DOMRect, rng: Rng): { light: string; dark: string } {
  const cell = 60;
  let light = "";
  let dark = "";
  for (let y = box.y; y < box.y + box.height; y += cell) {
    for (let x = box.x; x < box.x + box.width; x += cell) {
      for (let i = 0; i < 5; i++) {
        const px = x + rng.next() * cell;
        const py = y + rng.next() * cell;
        const len = 4 + rng.next() * 6;
        const dy = (rng.next() - 0.5) * 4;
        const mark = `M${r1(px)} ${r1(py)}l${r1(len)} ${r1(dy)}`;
        if (i < 3) light += mark;
        else dark += mark;
      }
    }
  }
  return { light, dark };
}

function halftoneDots(box: DOMRect, spacing: number, radius: number): string {
  // Squares at 45 degrees read as halftone dots at print size and keep the path data small.
  let d = "";
  for (let row = 0, y = box.y; y < box.y + box.height + spacing; y += spacing / 2, row++) {
    for (let x = box.x + (row % 2 ? spacing / 2 : 0); x < box.x + box.width + spacing; x += spacing) {
      d += `M${r1(x)} ${r1(y - radius)}l${radius} ${radius}l${-radius} ${radius}l${-radius} ${-radius}z`;
    }
  }
  return d;
}

/**
 * Chromium rasterizes SVG pattern fills when printing to PDF. Before printing, replace every
 * texture/halftone overlay with real vector marks clipped to the same outline.
 */
export function vectorizeTextures(root: Element): void {
  const overlays = root.querySelectorAll<SVGPathElement>("path.texture, path.halftone, path.halftone-fine");
  for (const overlay of overlays) {
    const svg = overlay.ownerSVGElement;
    const d = overlay.getAttribute("d");
    if (!svg || !d) continue;
    const box = overlay.getBBox();
    if (box.width <= 0 || box.height <= 0) continue;

    let defs = svg.querySelector(":scope > defs.print-clips");
    if (!defs) {
      defs = s("defs", { class: "print-clips" });
      svg.prepend(defs);
    }
    const id = `bt-clip-${++clipCounter}`;
    defs.append(s("clipPath", { id }, s("path", { d })));

    let replacement: SVGElement;
    if (overlay.classList.contains("texture")) {
      const marks = fibreMarks(box, new Rng(`fibres:${d.length}:${d.slice(0, 40)}`));
      replacement = g(
        { "clip-path": `url(#${id})` },
        s("path", { d: marks.light, class: "print-fibre-light" }),
        s("path", { d: marks.dark, class: "print-fibre-dark" }),
      );
    } else {
      const fine = overlay.classList.contains("halftone-fine");
      const large = box.width * box.height > 200_000;
      const spacing = fine ? 5 : large ? 12 : 7;
      replacement = s("path", {
        d: halftoneDots(box, spacing, fine ? 0.9 : large ? 2.4 : 1.6),
        class: fine ? "print-halftone-fine" : "print-halftone",
        "clip-path": `url(#${id})`,
      });
    }
    overlay.replaceWith(replacement);
  }
}
