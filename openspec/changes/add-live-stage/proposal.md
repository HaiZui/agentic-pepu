# Proposal

## Why

This is where everything comes together in front of the office: a ten-minute autoplay show on the projector that turns the fate script and scene scripts into paper-puppet theater. Puppets bob on rods, speech bubbles typewrite, scenery parallaxes, particles drift, and the stage cracks into comic panels on dramatic beats. The presenter must be able to pause, step, speed up or skip without breaking anything.

Depends on: `add-fate-engine`, `add-story-director` (scene scripts, catalog, progress events) and `add-puppet-renderer` (figures, scenery, style).

## What Changes

- Add the **show player**, which plays the whole show at 1920x1080 scaled to the window:
  - cold open: curtain rises, Seal of Fate, the Old King's decree, the house roll call with each puppet dropping in on its rod;
  - act title cards;
  - every beat's scene;
  - the coronation;
  - credits: seed reveal and roll of the fallen (`add-comic-export` later adds the Open comic action).
- **Scene staging**:
  - puppet entrances, exits and blocking;
  - comic speech bubbles with typewriter text, speaker bob and emotion swaps;
  - catalog actions (strike, fall with a snapping rod, kneel, drink, crown);
  - caption boxes;
  - camera moves (push-in, shake, letterbox) driven by panel framings.
- **Dramatic beats break into comic panels**: the proscenium cracks into a panel grid with close-ups, reactions and onomatopoeia, then folds back.
- **Crowd events** play as a fast montage grid with red X stamps. Large rosters use a background crowd layer.
- **Parallax** depth motion and **particles** per setting and mood: snow, embers, ash, rain, green wildfire sparks, petals and confetti for the coronation.
- **Readiness gate**: if a scene is not ready when needed, a curtain interlude plays instead of a blank screen.
- **Presenter controls**: autoplay; pause and resume; step line or scene forward and back; speed 0.5x-2x; skip to the next act; fullscreen; hideable HUD; keyboard shortcuts.

## Capabilities

### New Capabilities
- `live-stage`: Playback and staging of the full show from fate and scene scripts: cold open, scenes, dramatic panel breaks, crowd montages, parallax, particles, coronation, credits and the readiness gate.
- `presenter-controls`: Presenter override of autoplay: pause, step, speed, skip act, fullscreen and HUD, without affecting the outcome.

### Modified Capabilities
<!-- None. -->

## Impact

- New front-end modules for the show player, the animation timeline (GSAP), a canvas particle layer and the presenter HUD. The placeholder `/show/{id}` view is replaced.
- Consumes the SSE progress stream and the scene endpoints. No backend changes.
- New dependency: GSAP.
- Performance target: smooth playback on the presenter's laptop with integrated graphics.
