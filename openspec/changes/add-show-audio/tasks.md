# Tasks

## 1. Engine

- [ ] 1.1 Implement the Web Audio graph (music, sfx, master, compressor; voice bus stub left unconnected) and the AudioContext unlock in the START handler with the enable-banner fallback. Verify manually that the overture plays after START with no extra click in Edge and Chrome.
- [ ] 1.2 Implement buffer loading (ogg with mp3 fallback) and the setup-screen asset check with a test-sound button. Verify by removing one file and seeing it listed as missing on the setup screen.

## 2. Playback behaviour

- [ ] 2.1 Subscribe to `music:mood`: loop playback, 2 s crossfade, same-mood continuity. Verify with a Vitest test against a mocked AudioContext checking gain automation calls.
- [ ] 2.2 Implement dialogue ducking on `line:start` and line end. Verify with a Vitest test of gain ramps.
- [ ] 2.3 Implement SFX scheduling on `cue` with lead time, plus the structural stingers (curtain, roll call, elimination, coronation). Verify by measuring onset vs. lettering at 1x and 2x on `/dev/stage` (≤100 ms).
- [ ] 2.4 Implement silence before impact using `preSilenceMs` (add emission in the stage compiler for dramatic steps). Verify with Vitest checks for both the compiler output and the gain automation.
- [ ] 2.5 Handle pause/resume (context suspend), speed (music pitch preserved) and skip/step (stop one-shots, re-evaluate mood). Verify manually and with Vitest for the skip handling.
- [ ] 2.6 Add mute (M) and volume controls to the HUD and the keyboard, and the "?" help overlay entries. Verify manually during playback.

## 3. Assets and licensing

- [ ] 3.1 Source or create the minimum asset set (8 mood loops, 20 cues, 4 stingers) and write `LICENSES.json`. Verify with a Vitest check that every catalog cue and mood has a file and every file has a manifest entry.
- [ ] 3.2 Render the required attributions in the credits from the manifest. Verify by adding a CC-BY test entry and seeing it in the credits.

## 4. Documentation

- [ ] 4.1 Document narrated voice (Azure Speech TTS) as a future optional feature in `README.md` (requirements: separate Speech resource and key, pre-generation and caching, voice bus ducking). Verify that the section exists and matches the proposal.
