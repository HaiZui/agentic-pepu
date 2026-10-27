# Design

## Context

The front end is vanilla TypeScript with Vite (`add-app-foundation`). The fate script provides houses, archetypes, NPC roles, the Old King and setting ids. `GET /api/catalog` (`add-story-director`) lists emotions and settings. Both `add-live-stage` (animated) and `add-comic-export` (static print through a headless browser) consume this renderer, so it must produce DOM SVG that works in both. Requirements are in `specs/puppet-figures/spec.md` and `specs/stage-scenery/spec.md`.

## Goals / Non-Goals

**Goals:**
- One rendering module, pure functions from data to SVG, with no animation inside.
- Recognisable and charming at 120 px tall (crowds, cast page) and at 900 px (close-up panels).
- Deterministic output, so snapshot tests are meaningful.

**Non-Goals:**
- Animation, camera and particles (`add-live-stage`).
- Raster images or AI-generated art.

## Decisions

### Procedural SVG built from a parts library
```
 name --NFC/casefold--> FNV-1a/xmur3 --> sfc32 PRNG --> trait picks
                                                          |
   parts library (hand-authored SVG path sets) <----------+
   head[8] hair/helm[14] beard[7] mark[6] body[6] palette[12]
   accessory per archetype[7] expression set per head (8 emotions)
                                                          |
                          house overlay (tabard colours + sigil badge)
                                                          v
                 <g class="puppet"> rod | torso | head | armL | armR | acc </g>
```
Traits are picked from small hand-authored path sets rather than fully random geometry. Hand-drawn parts look like crafted paper cut-outs. Random bezier curves look like noise. Alternative: a library such as DiceBear. Rejected because its styles are not paper-puppet and its parts are not articulated.

The name hash runs in TS only, since appearance is purely a front-end concern, so no backend contract is needed. A fixture of name-to-trait vectors pins the result across browsers.

### Collision resolution
After computing the base traits for the canonical roster, walk the roster in canonical order. If a figure differs from an earlier one in fewer than 2 traits, re-pick its palette and mark using a secondary hash (`name + "#1"`, `#2`, ...) until the rule holds. This affects only that show. The base figure stays the same in shows without a collision.

### Articulation
Each part is a `<g>` with `data-part` and a `transform-origin` set at its pivot (neck, shoulders, rod grip). The stage animates transforms on these groups. Expressions swap only the face sub-group (eyes, brows, mouth), so they cost little to change mid-line.

### Style system
- **Paper texture**: one SVG `<filter>` (feTurbulence + feDisplacementMap for fibres) defined once in a shared `<defs>`, plus a slight random edge jitter baked into part outlines.
- **Ink**: `stroke-width` scales by a CSS variable so print and stage can tune it. Outlines use `paint-order: stroke`.
- **Halftone**: an SVG `<pattern>` of dots used as a shading fill overlay with multiply blend.
- **Palette**: a fixed set of CSS custom properties (comic primaries, with muted variants for paper).

The PDF printer in `add-comic-export` must render filters faithfully. Chromium print-to-PDF rasterizes some filters, so a `print` mode swaps the turbulence filter for a pre-rendered vector-friendly texture pattern. Risk noted below.

### Scenery
Each setting is a module that exports `{back, mid, front}` SVG groups authored at 1920x1080, with extra horizontal bleed (+20%) for parallax travel. Banners are generated from the house catalog. The proscenium is a separate overlay: curtain halves as groups, plus footlight glow.

### Fonts
Bundle **Bangers** (display and onomatopoeia) and **Comic Neue** (balloons and captions), both under the SIL OFL, as local `woff2` files. A glyph test renders "ÄÖÅäöå" and checks the font's `unicodeRange` coverage through the FontFace API. If either font lacks a glyph, swap it for another OFL comic font before shipping.

## Risks / Trade-offs

- [SVG filters are slow on integrated GPUs at 1080p] -> Rasterize the static back layers once to `ImageBitmap` for the stage (kept vector for print), and limit live filters to front layers. Measured in `add-live-stage`.
- [Chromium PDF output rasterizes filters] -> The print mode uses patterns instead of turbulence filters. Verified by a sample PDF in this change.
- [Authoring effort for parts and scenery] -> Start with a minimum viable set (6 heads, 8 hair, 4 beards, 4 marks, 4 bodies, 8 palettes; 10 settings with simple layers), then grow. The trait counts above are targets.
