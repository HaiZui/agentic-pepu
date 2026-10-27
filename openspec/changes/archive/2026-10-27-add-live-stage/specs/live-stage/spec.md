# Spec Delta

## Purpose

Plays the complete raffle show on the projector as an animated paper-puppet theater with comic-book drama, following the fate script and scene scripts exactly.

## ADDED Requirements

### Requirement: Fixed stage canvas
The stage SHALL render at a logical resolution of 1920x1080. It SHALL scale uniformly to fit the browser window, letterboxed, without distorting the aspect ratio.

#### Scenario: Non-16:9 window
- **WHEN** the browser window is 1600x1200
- **THEN** the stage is scaled to 1600x900, centered, with bars above and below

### Requirement: Show sequence
The stage SHALL play, in order: the cold open, the Act I, II and III title cards each followed by that act's scenes, the coronation and the credits. All of these SHALL follow the fate script's beat order.

#### Scenario: Full playback
- **WHEN** a show is played on autoplay from start to end
- **THEN** every beat in the fate script is staged exactly once, in order, between the cold open and the credits

### Requirement: Cold open
The cold open SHALL open the curtain, display the Seal of Fate, stage the Old King, and present every participant in a roll call grouped by house. In the roll call each puppet drops in on its rod with a name card and sigil. The cold open SHALL NOT require any scene script.

#### Scenario: Roll call for fifteen
- **WHEN** the cold open plays for a show of 15 participants in 4 houses
- **THEN** all 15 puppets are introduced with name cards, grouped under their 4 house banners, and the Seal of Fate is visible

### Requirement: Scene staging
For each scene, the stage SHALL show the scenery for its setting, position the speaking characters, and present each dialogue line as a comic speech bubble attached to its speaker. Bubble text SHALL appear with a typewriter effect, and the speaker's puppet SHALL show the line's emotion.

#### Scenario: Line with emotion
- **WHEN** a line by Aino with emotion "furious" is played
- **THEN** a speech bubble pointing at Aino's puppet types out the text and Aino's figure shows the furious expression

### Requirement: Line timing
At 1x speed, each line SHALL stay on screen for the reading time given by the published reading-time constants. Captions SHALL appear in comic caption boxes.

#### Scenario: Reading time respected
- **WHEN** a 100-character line is played at 1x
- **THEN** it remains fully visible for at least the computed reading time before the next line starts

### Requirement: Catalog actions
The stage SHALL animate every action id in the catalog. A `fall` action SHALL show the puppet's rod snapping and the figure dropping out of view. An `exit` action SHALL show the puppet leaving the stage.

#### Scenario: Elimination by fall
- **WHEN** a line carries action "fall" for Kalle
- **THEN** Kalle's rod visibly snaps, his figure drops off stage, and he is not shown alive again unless resurrected

### Requirement: Panel break on dramatic beats
For beats marked dramatic, the stage SHALL break the proscenium into a comic panel grid. The grid SHALL stage that scene's panel moments with their framings, show onomatopoeia in large display lettering, and then return to the theater view.

#### Scenario: Betrayal panel break
- **WHEN** a dramatic "knife in the back" beat plays and its scene has onomatopoeia "SHINK!"
- **THEN** the stage splits into a panel grid showing the framed moments, "SHINK!" appears in display lettering, and the theater view returns before the next beat

### Requirement: Crowd montage
Beats eliminating two or more participants SHALL show a montage grid with one tile per eliminated participant. Each tile shows that participant's figure followed by a red X stamp, before normal staging resumes.

#### Scenario: Plague montage
- **WHEN** a Grey Plague beat eliminates four participants
- **THEN** a montage of four tiles appears, each showing one eliminated figure receiving an X stamp

### Requirement: Crowded stage handling
At most six figures SHALL stand in the foreground at once. Other present characters SHALL appear smaller in a background crowd layer. The characters who speak or act in the current line SHALL always be in the foreground.

#### Scenario: Large battle
- **WHEN** a battle beat involves 18 characters and 3 of them speak
- **THEN** the 3 speakers are in the foreground and the rest appear in the background crowd layer

### Requirement: Camera and parallax
The stage SHALL apply camera moves (push-in, pan, shake, letterbox) according to panel framings and actions. Scenery layers SHALL move at different rates so that camera motion produces visible parallax.

#### Scenario: Close-up push-in
- **WHEN** a panel moment with framing "close_up" is staged in theater view
- **THEN** the camera pushes in on the referenced character and the back, mid and front layers shift by different amounts

### Requirement: Particles
The stage SHALL render particle effects matched to the setting and music mood: at least snow, embers, ash, rain, wildfire sparks and coronation confetti or petals. Particles SHALL be layered so that they do not cover speech bubbles.

#### Scenario: Winter scene
- **WHEN** a scene with setting "ice_wall" or mood "winter" plays
- **THEN** snow particles fall across the scenery behind the speech bubbles

### Requirement: Coronation and credits
The coronation SHALL crown the winner with a splash-style composition and celebratory particles. The credits SHALL then show the full Seal of Fate, the revealed seed with a manual-seed badge if applicable, and the roll of the fallen listing every participant with their elimination mode.

#### Scenario: Credits reveal
- **WHEN** the coronation finishes
- **THEN** the credits show the winner, the full seal, the revealed seed, and every other participant with how they were eliminated

### Requirement: Readiness gate
If a scene is not yet available when the stage needs it, the stage SHALL close the curtain and play an interlude animation. The stage SHALL continue automatically when the scene arrives, and SHALL NEVER show a blank or broken stage.

#### Scenario: Slow scene
- **WHEN** Act I starts but its first scene is still pending
- **THEN** the curtain closes with an interlude and the show proceeds as soon as that scene becomes ready or falls back

### Requirement: Smooth playback
On the presenter's laptop, the stage SHALL sustain at least 30 frames per second during normal scenes and SHALL reduce particle density automatically if the frame rate drops below that.

#### Scenario: Frame rate adaptation
- **WHEN** the measured frame rate stays below 30 fps for two seconds
- **THEN** the stage reduces particle count until it recovers
