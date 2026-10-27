# Design

## Context

Scene scripts carry 3-6 panel moments with framings. `src/shared/panels.ts` (`add-live-stage`) maps framings to viewBoxes. The puppet renderer has a print mode that swaps turbulence filters for patterns (`add-puppet-renderer`). Fonts are bundled locally. The backend keeps sessions in memory and knows when all scenes are final through the generation scheduler (`add-story-director`). Requirements are in `specs/comic-export/spec.md`.

## Goals / Non-Goals

**Goals:**
- Reuse the exact front-end renderers, so the comic looks like the show.
- A PDF ready before or shortly after the credits for a typical show.
- Deterministic layout for a given show, which keeps it testable.

**Non-Goals:**
- Sharing or uploading. The presenter shares manually.
- Print-shop features (bleed, CMYK).
- Re-generating dialogue for the comic.

## Decisions

### Render in the browser, print with headless Chromium
```
 scheduler: all scenes final
        |
        v
 [comic job] (backend, asyncio task)
        |  Playwright (Python) -> Chromium headless
        |  goto http://127.0.0.1:<port>/comic/{id}?print=1
        |  wait for window.__comicReady === true  (fonts + layout done)
        |  page.pdf(format="A4", printBackground=True, preferCSSPageSize=True)
        v
 output/2026-10-30_1504/bottle-throne_2026-10-30.pdf + show.json
```
The `/comic/{id}` route renders all pages as `<section class="page">` elements with CSS `@page { size: A4 portrait; margin: 0 }`, using the same SVG figure, scenery and panel modules as the stage in print mode. Alternative: a Python PDF library (ReportLab/WeasyPrint) re-implementing the drawing. Rejected because it would duplicate the renderer, and the comic would drift from the stage. Alternative: screenshots of the live stage. Rejected because they are raster and framed for 16:9.

Playwright is used from Python, so the backend owns the job. If Playwright Python lacks Python 3.14 wheels at implementation time, the fallback is a small Node script (`web/scripts/print-comic.mjs`) using Playwright for Node, launched by the backend as a subprocess. The interface stays the same.

### Page planner (pure TS, unit-tested)
`planComic(fate, scenes, chronicle) -> Page[]` decides:
- the cast pages (1 page up to 20 participants, 2 above);
- per-scene layouts from a library of grid templates keyed by panel count and whether a `splash` framing is present (for example 3 = 1 wide + 2; 4 = 2x2; 5 = 2+1 wide+2; 6 = 3x2);
- page breaks.

Short consecutive scenes can share a page (two 3-panel scenes form one page with a "MEANWHILE..." caption), and long acts split across pages. Montage pages have grid tiles sized by eliminated count. If the plan exceeds 32 pages, scenes are packed more densely. If it falls under 16, each scene gets its own page and an extra "Dramatis Personae" spread is added. A property test checks 16-32 pages for N=3..40.

### Balloon fitting
Balloons size to text with a measure-then-shrink loop: max 2 font-size steps down, then widen the balloon into the panel. A layout test renders the worst case (140 characters, 24-character name) and asserts there is no overflow through DOM measurement.

### Status and actions
The session holds `comic: {status: pending|generating|ready|failed, path?, error?}`. The status is pushed through the existing SSE stream as `comic` events. Endpoints:
- `GET /api/shows/{id}/comic.pdf` streams the file for the Open comic action, in a new browser tab.
- `POST /api/shows/{id}/comic/reveal` runs `explorer.exe /select,<path>` on Windows. The path comes only from the session, never from the request, which prevents path injection. The server is localhost-only.
- `POST /api/shows/{id}/comic/retry` re-runs a failed job.

### show.json
This is the serialized `FateScript`, scene scripts, chronicle texts and reveal data (seed, seed mode, engine version, seal). It serves as the archival record and allows the comic to be regenerated later.

## Risks / Trade-offs

- [Chromium rasterizes some SVG effects in PDFs] -> Print mode avoids turbulence filters. Task 3.3 checks vector output at 400% zoom.
- [Generation time for about 25 pages] -> Expected 5-20 s after scenes are final. The comic is typically ready long before the credits. Status shows "generating" otherwise.
- [Playwright/Chromium install size and first-run download] -> Install once during setup (`playwright install chromium`), documented in the README, and checked by the start script.
- [Seed in the PDF before the reveal] -> The PDF sits on the presenter's disk only, and Open comic is offered only at the credits. Accepted.
