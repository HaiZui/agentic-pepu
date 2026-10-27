# Tasks

## 1. Page planning

- [x] 1.1 Implement `planComic()` with the cast page rule, the act dividers, the scene grid templates by panel count and splash, page sharing with "MEANWHILE..." captions and montage pages. Verify with Vitest that page order matches the spec for a 15-participant fixture.
- [x] 1.2 Add page-count balancing (pack denser above 32, add the Dramatis Personae spread under 16). Verify with a property test that N=3..40 fixtures yield 16-32 pages.

## 2. Comic rendering

- [x] 2.1 Build the `/comic/{id}` route with A4 `@page` CSS, print-mode renderers and `window.__comicReady` set after fonts and layout. Verify visually in the browser print preview.
- [x] 2.2 Render the cover (chronicle title, date, splash of the Old King and the contenders), the cast pages by house and the act dividers. Verify visually for 6 and 40 participants.
- [x] 2.3 Render the scene panels with `src/shared/panels.ts` framings, balloons, captions and onomatopoeia, and the montage tiles with X stamps. Verify visually for a betrayal and a plague scene.
- [x] 2.4 Implement balloon fitting (shrink up to 2 steps, then widen). Verify with a browser test that the 140-character line with a 24-character Finnish name has no overflow.
- [x] 2.5 Render the coronation splash, the epilogue and the back cover (full seal, seed and manual badge, engine version, verify command, roll of the fallen, audio attributions, AI disclosure). Verify with a fixture show that the printed verify command reproduces the seal.

## 3. PDF job and output

- [x] 3.1 Add the Playwright dependency and the `playwright install chromium` step to the README and the start script check. If Python 3.14 wheels are unavailable, implement the Node subprocess fallback. Verify by producing a PDF from the dev server.
- [x] 3.2 Implement the backend comic job triggered when all scenes and chronicle texts are final, writing `output/<YYYY-MM-DD_HHMM>/bottle-throne_<YYYY-MM-DD>.pdf` and `show.json`. Verify with a pytest integration test (fallback-only show) that both files exist.
- [x] 3.3 Inspect a generated PDF at 400% zoom for vector figures and lettering, and confirm A4 portrait size. Verify with a pytest check of page size via a PDF reader library and a manual zoom check.
- [x] 3.4 Add comic status to the session and SSE `comic` events, the failure reason and the retry endpoint. Verify with pytest by forcing a browser launch failure and checking that the show endpoints are unaffected.

## 4. Presenter access

- [x] 4.1 Add `GET /api/shows/{id}/comic.pdf` and `POST /api/shows/{id}/comic/reveal` (session-derived path only, Windows explorer select). Verify with pytest that the path cannot be influenced by request data, and manually that Explorer opens with the file selected.
- [x] 4.2 Add the comic status plus Open comic and Show in folder actions to the credits screen. Verify end-to-end that a real show's credits open the PDF that matches the on-stage dialogue.
