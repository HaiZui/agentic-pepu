# Design

## Context

`add-live-stage` exposes an event bus (`step:start`, `line:start`, `cue`, `music:mood`, `pause`, `resume`, `speed`, `show:end`) and a HUD. `add-story-director` publishes the music mood and SFX cue catalogs. The START click on the setup screen (`add-app-foundation`) is the user gesture browsers require before audio may play. Requirements are in `specs/show-audio/spec.md`. Narrated voice is out of scope (see proposal - Future / Optional).

## Goals / Non-Goals

**Goals:**
- Audio as a pure subscriber of the event bus, with no changes to staging logic.
- Sample-accurate sync with onomatopoeia, which needs a scheduler that does not rely on `setTimeout` jitter.
- Room for a future voice bus.

**Non-Goals:**
- TTS, positional or 3D audio, and adaptive music stems.

## Decisions

### Web Audio graph
```
 music loops --> [musicGain] --+
                               +--> [master gain] --> [compressor] --> destination
 sfx one-shots -> [sfxGain] ---+
 (future) voice -> [voiceGain] +   duck rule: voice ducks music+sfx
```
Use the native Web Audio API, with no library. Alternative: Howler.js. Rejected because ducking, scheduled crossfades and precise scheduling all need direct gain automation anyway. The compressor keeps loud SFX from clipping on laptop speakers.

### Unlock on START
The setup screen's START handler creates and resumes the `AudioContext` before navigating, then hands it to the show page through a module singleton. Navigation is client-side, so the context survives. The fallback is a one-time "Click to enable sound" banner if the context is still `suspended`.

### Loading
All music and SFX are decoded into `AudioBuffer`s during the cold-open setup phase, in parallel with scene generation. Files are `.ogg` (Opus) with an `.mp3` fallback for codec gaps. A setup-screen asset check fetches `LICENSES.json` and HEADs each listed file to report missing assets early.

### Time and speed
Music plays at native rate regardless of show speed (pitch preserved by not changing `playbackRate`). SFX are scheduled with `AudioContext.currentTime` when the stage emits `cue` with a lead time, which keeps them within 100 ms of the visual. On `pause`, the engine calls `context.suspend()`, which freezes all buses exactly. On skip and step, active one-shots stop and the mood is re-evaluated from `StageState`.

### Silence before impact
For dramatic steps, the stage already knows the first impact cue offset from the compiled program, so it emits `cue` with `preSilenceMs: 500`. The engine ramps `musicGain` to 0 over 80 ms at T-500 ms and restores it over 400 ms after the impact.

### Assets and licences
`web/public/audio/{music,sfx,stingers}/` holds the files and `web/public/audio/LICENSES.json` lists `{file, title, author, source_url, license, attribution_required, attribution_text}`. Prefer CC0 sources (for example Freesound CC0, OpenGameArt CC0, Pixabay's licence where redistribution in an internal tool is fine). CC-BY files are allowed with attribution. A unit test fails if any file in the folder is missing from the manifest, or if any catalog cue or mood has no file.

## Risks / Trade-offs

- [Finding good free medieval and comic SFX takes time] -> Ship with a minimum set (8 moods, 20 cues, 4 stingers). Placeholder sounds synthesized offline are acceptable for the first iteration as long as they are licensed (self-made counts).
- [Laptop speakers or the projector HDMI audio route] -> Add a test-sound button on the setup screen in the asset check.
- [The browser blocks audio despite the START gesture] -> One-time enable banner, and the show continues silently if it is dismissed.
