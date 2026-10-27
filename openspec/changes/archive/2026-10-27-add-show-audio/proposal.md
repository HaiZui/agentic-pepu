# Proposal

## Why

A paper theater with silent drums feels flat. Music and sound effects timed to the comic onomatopoeia ("KRAKOOM!" with thunder, "SHINK!" with a blade) and a beat of silence before each impact make the show land in a room full of people. The scene scripts already carry music moods and SFX cues from a fixed catalog, and the stage emits timing events. This change makes them audible.

Depends on: `add-story-director` (cue and mood catalogs) and `add-live-stage` (event bus, presenter controls).

## What Changes

- Add a browser **audio engine** with a music bus and an SFX bus.
- **Music**: a loop per mood (overture, intrigue, feast, battle, dread, winter, sorrow, triumph), crossfaded on mood changes and ducked under dialogue. Music cuts to silence just before dramatic impacts.
- **SFX**: one-shot sounds for every cue in the catalog, fired on the stage's `cue` events and synced with onomatopoeia panels. Fixed stingers for the curtain, roll call, eliminations and coronation.
- Audio follows presenter controls: pause, speed (music keeps its pitch, SFX timing scales), skip and step. New controls: **mute** (M) and **volume** (keys or HUD).
- The START button unlocks browser audio. If an asset is missing or audio cannot start, the show plays silently instead of failing.
- Bundled, redistributable audio assets with a **licence manifest**. The credits (and later the comic) list required attributions.

### Future / Optional (not in scope)
- **Narrated voice (TTS)**: an Azure Speech voice reads the Chronicler's captions and narration, possibly with distinct voices per archetype. It would need a separate Azure Speech resource and key (not in the current `.env`), would add pre-generation time and caching of audio clips, and would need ducking rules for voice. It is documented here so the audio engine's bus design leaves room for a third "voice" bus.

## Capabilities

### New Capabilities
- `show-audio`: Music and sound-effect playback driven by scene moods, cues and stage timing, including ducking, silence before impact, presenter audio controls, graceful degradation and asset licensing.

### Modified Capabilities
<!-- None. Mute/volume are owned by show-audio; presenter-controls is unchanged. -->

## Impact

- New front-end audio module (Web Audio API) subscribing to the stage event bus.
- New `web/public/audio/` asset tree and `web/public/audio/LICENSES.json`.
- HUD gains mute and volume controls. The credits gain audio attributions.
- No backend changes. No new external services.
