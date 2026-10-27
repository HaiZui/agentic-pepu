# Proposal

## Why

The show is gone once the credits roll. A comic book PDF of that exact story gives the office something to keep and share: cover, cast page, panels, coronation splash and a verifiable Seal of Fate on the back cover. All scene scripts already contain panel moments and framings, and the renderer already draws in vector, so the comic can be built from the same data and be ready by the time the credits roll.

Depends on: `add-story-director` (scene scripts, chronicle texts), `add-puppet-renderer` (figures, scenery, print style) and `add-live-stage` (shared panel framing, credits screen).

## What Changes

- Add a **comic page renderer** in the front end that lays out A4 portrait pages from the fate script, scene scripts and chronicle texts:
  - cover;
  - cast page grouped by house;
  - act divider pages;
  - scene pages with 3-6 panels, comic balloons, captions and onomatopoeia;
  - crowd-event montage pages;
  - a full-page coronation splash;
  - an epilogue page;
  - a back cover with the Seal of Fate, the seed, verification instructions, the roll of the fallen, credits and audio attributions.
- Add **PDF generation** on the backend with a headless browser. It starts automatically once all scenes are final and writes to `output/` with a dated filename, next to a `show.json` record of the fate and scene data.
- Generation works offline once scenes exist and never affects the live show.
- Add an **Open comic** action to the credits and a status indicator for whether the comic is ready.

## Capabilities

### New Capabilities
- `comic-export`: Producing a printable, vector comic-book PDF of a show from its fate and scene scripts, including page structure, panel layouts, lettering, file output and presenter access.

### Modified Capabilities
<!-- None. The Open comic action is owned by comic-export. -->

## Impact

- New dependency: Playwright with Chromium, installed once on the presenter laptop.
- New backend job and endpoints for comic status and opening the file. New front-end route `/comic/{id}` (print layout).
- New `output/<date-time>/` folders containing `bottle-throne_<date>.pdf` and `show.json`. Already ignored by git.
- The PDF is shared manually by the presenter. No upload or e-mail integration.
