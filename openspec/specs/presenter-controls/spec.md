# presenter-controls Specification

## Purpose

Lets the presenter steer the autoplaying show (pause, step, speed, skip, fullscreen) without ever changing what happens in the story or who wins.

## Requirements

### Requirement: Autoplay by default
The show SHALL play automatically from the cold open to the credits without presenter input.

#### Scenario: Hands-off show
- **WHEN** the presenter starts a show and touches nothing
- **THEN** the show plays through to the credits

### Requirement: Pause and resume
The presenter SHALL be able to pause and resume playback with the Space key or a HUD button. While paused, all animation, typewriter text and particles SHALL freeze.

#### Scenario: Pause mid-line
- **WHEN** the presenter presses Space while a bubble is typing
- **THEN** typing, puppet motion and particles stop, and pressing Space again resumes from the same point

### Requirement: Step through lines and scenes
The presenter SHALL be able to step to the next or previous line with the Right and Left arrow keys, and to the next or previous scene with Shift+Right and Shift+Left. Stepping back SHALL be limited to content already played.

#### Scenario: Step back one line
- **WHEN** the presenter presses Left after line 3 of a scene has appeared
- **THEN** line 2 is shown again with its speaker, emotion and bubble

#### Scenario: No stepping into the future beyond readiness
- **WHEN** the presenter presses Shift+Right and the next scene is not ready
- **THEN** the readiness interlude plays until it becomes available

### Requirement: Playback speed
The presenter SHALL be able to set playback speed to 0.5x, 1x, 1.5x or 2x with the minus and plus keys or the HUD. Line times and animations SHALL scale accordingly.

#### Scenario: Double speed
- **WHEN** the presenter sets speed to 2x
- **THEN** line display times and animation durations are halved

### Requirement: Skip to next act
The presenter SHALL be able to skip to the start of the next act with the N key. Skipped beats' eliminations SHALL still take effect, so the stage state stays consistent with the fate script.

#### Scenario: Skip rest of Act II
- **WHEN** the presenter presses N during Act II
- **THEN** the Act III title card plays, and characters eliminated in the skipped Act II beats do not appear alive

### Requirement: Controls never alter fate
No presenter control SHALL change the fate script, the scene scripts, the winner or the seal.

#### Scenario: Heavy skipping
- **WHEN** the presenter skips every act and steps back and forth repeatedly
- **THEN** the crowned winner and the credits are identical to those of an uninterrupted playback

### Requirement: Fullscreen and HUD
The presenter SHALL be able to toggle fullscreen with the F key and to show or hide the controls HUD with the H key. The HUD SHALL auto-hide after three seconds without mouse movement and SHALL never appear in the stage area during autoplay unless invoked.

#### Scenario: Auto-hide
- **WHEN** the mouse has not moved for three seconds during playback
- **THEN** the HUD and cursor are hidden

### Requirement: Shortcut help
Pressing the question mark key SHALL show an overlay listing all presenter shortcuts, and the show SHALL pause while the overlay is visible.

#### Scenario: Help overlay
- **WHEN** the presenter presses "?"
- **THEN** playback pauses and the shortcut list is shown until dismissed
