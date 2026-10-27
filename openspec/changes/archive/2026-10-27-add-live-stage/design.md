# Design

## Context

The inputs are all ready before this change. The fate script comes from `add-fate-engine`. Scene scripts, the catalogs (including reading-time constants) and SSE progress come from `add-story-director`. Pure SVG figures and scenery with articulated `data-part` groups come from `add-puppet-renderer`. The front end is vanilla TypeScript with Vite. Requirements are in `specs/live-stage/spec.md` and `specs/presenter-controls/spec.md`.

## Goals / Non-Goals

**Goals:**
- A player whose state at any step can be rebuilt from data, so stepping back and skipping are reliable.
- A clean event surface that `add-show-audio` can hook into without touching staging code.
- Panel framing logic reusable by `add-comic-export`.

**Non-Goals:**
- Audio playback (`add-show-audio`).
- The PDF and the Open comic action (`add-comic-export`).
- Editing or regenerating scenes from the stage.

## Decisions

### Compile first, then play
```
 fate script + scene scripts + catalog
            |
            v
   [Program compiler]  pure TS, unit-tested
            |
            v
   Program = Step[]   (title_card | roll_call | scenery_change | enter | line |
                       caption | action | panel_break | montage | coronation |
                       credits | interlude)
   each Step: { durationAt1x, stateAfter: StageState }
            |
            v
   [Player]  walks steps; each step builds a short GSAP timeline
            |
            +--> event bus: step:start, line:start, cue, music:mood, pause,
                 resume, speed, show:end   (consumed by audio later)
```
`StageState` holds the alive set, who is on stage and where, the current setting and the current mood. Stepping back or skipping does not reverse animations. It jumps to the target step and applies `stateAfter` of the previous step instantly, then plays the target step. Alternative: reversing GSAP timelines. Rejected because it is fragile with dynamic content (bubbles, particles) and cannot skip across scenes.

The compiler also decides foreground versus background for crowded scenes (maximum 6 in front, speakers and actors first) and when to insert a montage (beats with 2 or more eliminations) or a panel break (`dramatic`).

### Layer stack (DOM)
```
 #stage (1920x1080, CSS transform: scale)
   back scenery    -> pre-rasterized ImageBitmap on <canvas> (perf)
   mid scenery     -> SVG
   background crowd-> SVG (simplified silhouettes)
   puppets         -> SVG (articulated figures)
   particles       -> <canvas> 2D
   front scenery   -> SVG
   bubbles/captions-> HTML (text wrapping, Finnish glyphs) + SVG tails
   panel overlay   -> HTML grid of SVG viewports (panel break / montage)
   proscenium      -> SVG (curtains, footlights)
 #hud (outside the stage transform)
```
Particles sit under the front scenery and under the bubbles, which satisfies "particles never cover bubbles".

### Animation: GSAP
GSAP timelines with `gsap.globalTimeline.timeScale()` give speed control, `pause()` gives freeze, and its eases give puppet bob and rod-snap physics cheaply. Alternative: Web Animations API. Rejected because sequencing and global time scaling would need more custom code.

### Camera and framing
A `frame(framing, targets, stageState) -> viewBox` function maps a framing id (`wide`, `medium`, `close_up`, ...) to a viewBox around target figures. In theater view the camera animates a transform on the scenery and puppet layers, with per-layer parallax factors (back 0.3, mid 0.6, puppets 1.0, front 1.3). In a panel break, each grid cell renders a fresh copy of the figures and scenery with its own viewBox. The renderer is pure, so copies are cheap. The same `frame()` and the panel-grid layouts live in `src/shared/panels.ts` for reuse by the comic.

### Particles
A small custom canvas 2D emitter with presets (`snow, embers, ash, rain, wildfire, confetti, petals`) chosen from setting and mood. Count scales with a quality factor that the frame-rate monitor lowers when fps stays under 30 for 2 s. Alternative: tsParticles. Rejected because it is heavier and harder to tie into GSAP time scaling and pause.

### Readiness
The player subscribes to `/api/shows/{id}/events`. When it reaches a scene whose status is `pending`, it inserts an `interlude` step (curtain closed, an animated sign such as "The bards are tuning their lutes...") and resumes when the status turns `ready` or `fallback`. The compiler builds program segments lazily per scene as they arrive.

### Presenter controls
A keyboard map plus a HUD (play/pause, step, speed, skip act, fullscreen, help). The HUD and cursor auto-hide after 3 s idle. A hidden `?speed=` query parameter allows up to 10x for automated tests only. It is not exposed in the HUD.

## Risks / Trade-offs

- [SVG performance with many figures plus filters at 1080p on integrated GPUs] -> Rasterized back layers, simplified crowd silhouettes, adaptive particles. Profile with a 40-participant battle early (task 2.6).
- [Text overflow in bubbles for long lines] -> Lines are capped at 140 characters upstream. Bubbles size to content and shrink the font one step for long lines. Test with the longest Finnish names.
- [Step-back state bugs] -> `stateAfter` is computed by the compiler and covered by unit tests. The player never derives state from animation.
- [Ten-minute target drift because playback durations differ from budgets] -> The compiler sums `durationAt1x`, and a test asserts the total for sample shows stays within 540-660 s plus the interlude time.
