# Tasks

## 1. Program compiler

- [x] 1.1 Define `Step` and `StageState` types and the compiler for the cold open, title cards, scenes (enter, line, caption, action), coronation and credits. Verify with Vitest that a fixture show compiles with every beat staged once in order.
- [x] 1.2 Add foreground/background selection (max 6, speakers and actors first), montage insertion for beats with 2+ eliminations, and panel-break insertion for dramatic beats. Verify with Vitest using 6-, 15- and 40-participant fixtures.
- [x] 1.3 Compute `durationAt1x` from the catalog reading-time constants and `stateAfter` per step. Verify with Vitest that sample show totals stay within 540-660 s and that state after a `fall` excludes the character.

## 2. Stage rendering

- [x] 2.1 Build the layer stack with 1920x1080 letterboxed scaling and back-layer rasterization. Verify in the browser at 1600x1200 and 1920x1080.
- [x] 2.2 Implement the player loop with GSAP and the event bus (`step:start`, `line:start`, `cue`, `music:mood`, `pause`, `resume`, `speed`, `show:end`). Verify with a Vitest check of event order for a fixture program.
- [x] 2.3 Stage the scenes: entrances and exits, speech bubbles with typewriter and tails, emotion swaps, caption boxes and all catalog actions, including the rod-snap fall. Verify visually on a `/dev/stage` page that plays one scene per action.
- [x] 2.4 Implement the cold open (curtain, Seal of Fate, Old King, roll call by house with name cards) and the act title cards. Verify by playing the cold open for 6, 15 and 40 participants.
- [x] 2.5 Implement camera framing (`src/shared/panels.ts`), parallax factors, shake and letterbox, the panel-break grid with onomatopoeia, and the crowd montage with X stamps. Verify with a Vitest check of `frame()` output and visually for a betrayal and a plague beat.
- [x] 2.6 Implement the particle emitter presets with setting/mood selection and the fps-adaptive quality. Verify that a 40-participant battle with embers holds at least 30 fps on the presenter laptop (record the measured fps in the PR).
- [x] 2.7 Implement the coronation splash and the credits (full seal, revealed seed via `/reveal`, manual-seed badge, roll of the fallen). Verify by playing a fixture show to the end.
- [x] 2.8 Implement the readiness gate with the interlude. Verify by delaying a mocked scene in a dev fixture and confirming no blank stage appears.

## 3. Presenter controls

- [x] 3.1 Implement pause/resume, speed (0.5x/1x/1.5x/2x) and the hidden test `?speed=`. Verify with Vitest that durations scale and with a manual check that particles freeze.
- [x] 3.2 Implement line and scene stepping (bounded to played content) and skip to the next act using `stateAfter`. Verify with Vitest that a skipped Act II leaves its eliminated characters absent and the crowned winner unchanged.
- [x] 3.3 Implement fullscreen, the HUD with 3 s auto-hide and the "?" help overlay. Verify manually on the projector setup.

## 4. Integration

- [x] 4.1 Replace the `/show/{id}` placeholder with the player, wired to the fate script, scene endpoints and SSE. Verify with an end-to-end run against a real Foundry show and against a no-Foundry (all fallback) show, both completing to the credits.
- [x] 4.2 Add a Playwright end-to-end test that plays a 6-participant fallback show at `?speed=10` to the credits and asserts the crowned name equals the fate winner. Verify that it passes in CI-like local runs.
