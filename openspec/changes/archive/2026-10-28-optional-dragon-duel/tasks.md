# Tasks

## 1. Seeded encounter generation

- [x] 1.1 Add `dragon_victory` and `dragon_defeat` cards with one participant hero and seeded defeat facts in `fate/cards.py`; add card tests proving victory has no elimination, both defeat variants kill only the hero, and immunity/forced-victim rules hold.
- [x] 1.2 Reserve at most one eligible Act I/II slot per solver attempt using a dedicated seeded stream and the proposed one-in-three admission gate; keep normal fallback when casting fails and exclude dragon cards from ordinary candidate pools. Verify solver tests cover no encounter, victory, both defeats, non-winner victory, and small/large rosters without changing slot or elimination totals.
- [x] 1.3 Extend fate validation to reject duplicate duels, invalid acts, non-participant/dead heroes, inconsistent facts, and wrong elimination effects; verify mutation tests in `tests/fate/test_validate.py` reject each invalid script.
- [x] 1.4 Bump the fate engine version and replace the CLI's hard-coded verification default with the shared constant; verify replay, seal, winner-selection, CLI matching-version success and unsupported-version failure tests.
- [x] 1.5 Document encounter optionality, at-most-once behavior, variants, unchanged fairness, and version-specific replay in README; verify the text matches card/selection behavior and that documented verification arguments match the CLI.

## 2. Narration, outcome validation, and offline scenes

- [x] 2.1 Add outcome-aware statements and exit causes through `story/causes.py` and its variant selector; verify bible/context and storyline tests name the hero, distinguish dragon slaying from the sword accident, produce no victory OUT stamp, and do not invent a dragon ghost/responsible participant.
- [x] 2.2 Pass explicit duel facts and a canonical resolution caption into scene prompts/schema guidance; add scene validation for caption anchors, hero actions, recognizable reversed outcomes, spectator noncombat, and confrontation/resolution panel references. Verify wrong-result and missing-anchor fixtures fail while valid slain-dragon prose passes existing participant-death checks.
- [x] 2.3 Implement all three template scenes with existing action/audio catalogs and shared cause wording; verify each passes normal scene validation with Finnish names, planned bystanders/ghosts, 3-to-6 panels, line-length limits, and reading-time budgets.
- [x] 2.4 Add mocked generation/retry tests proving rejected duel output reaches a faithful fallback without mutating fate; document the fixed-outcome and offline behavior alongside the README encounter description.

## 3. Shared creature visuals and restorable stage state

- [x] 3.1 Add a shared typed encounter interpreter and local SVG dragon renderer using the existing palette/defs conventions; verify threatening/defeated variants, invalid-fact diagnostics, deterministic rendering, and absence of external assets in frontend unit tests.
- [x] 3.2 Extend internal stage/panel descriptors and compiler snapshots with confrontation/resolved encounter state; verify caption-aligned resolution, fallen-hero tableau preservation after actor removal, deep-copy isolation, pending-scene behavior, and cleanup at the next beat in compiler tests.
- [x] 3.3 Integrate a dedicated creature layer and encounter-aware framing into live rendering and dramatic panel art, using the shared dragon renderer; verify hero/dragon visibility in confrontation and resolution and no dragon in unrelated settings or participant tracker entries.
- [x] 3.4 Wire creature animation/restoration into existing playback timing and controls, reusing existing audio cues; verify pause/resume, speed, skip, restore-before/after-resolution, mute, and no duplicate/lingering creature behavior with player/audio tests and deterministic browser fixtures.
- [x] 3.5 Add all duel variants to the existing developer stage fixture surface and document how to preview them; verify the fixtures open without Foundry and show the intended outcome and readable text.

## 4. Comic parity and end-to-end verification

- [x] 4.1 Propagate encounter snapshots through `comic/content.ts` into shared panel art; add comic tests for all three variants proving confrontation and resolution are present, slain-dragon/fallen-hero poses agree with the stage, exact OUT causes survive, and victory leaves the survivor strip unchanged.
- [x] 4.2 Exercise browser comic rendering/export for the deterministic duel fixtures; verify printable vector art, readable balloons/captions, hero/dragon visibility at wide and portrait panel aspects, and no regression to existing page fitting. Document the shared live/comic outcome behavior in README.
- [x] 4.3 Run the fate property sweep across rosters 3 through 40 with the existing 500 seeds per size, plus fairness/replay tests; verify at-most-one encounter, winner survival, immunity, non-lethal exits, resurrection limits, Act III structure, and 16-to-24 beat / 540-to-660 second budgets.
- [x] 4.4 Run targeted backend story/fate and OpenAPI contract tests, relevant frontend render/compiler/player/comic/audio tests, frontend build/type-check, and existing browser integration coverage; verify no public API schema drift, no live Foundry dependency, and strict OpenSpec validation success.

## Workflow follow-up

- Review the encounter fixtures and optional frequency before archiving.
- Sync the dragon-encounters delta into main specs and archive only after implementation and verification are complete.
