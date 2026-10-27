# show-audio Specification

## Purpose

Gives the show its sound: mood music and comic sound effects synchronized with the stage, controllable by the presenter, and never able to stop the show.

## Requirements

### Requirement: Audio unlocked by START
The system SHALL initialise browser audio as part of the presenter's START action, so that music can play from the cold open without any additional click.

#### Scenario: Overture plays
- **WHEN** the presenter presses START on the setup screen
- **THEN** the overture music begins with the cold open without any further interaction

### Requirement: Mood music
The system SHALL play a looping music track for each music mood in the catalog. It SHALL crossfade over about two seconds when the scene's mood changes, and SHALL keep the current track when consecutive scenes share a mood.

#### Scenario: Feast to battle
- **WHEN** a scene with mood "feast" is followed by a scene with mood "battle"
- **THEN** the feast loop fades out while the battle loop fades in over about two seconds

### Requirement: Dialogue ducking
While a speech bubble is being typed or displayed, music volume SHALL be lowered by about 6 dB and restored when no line is displayed.

#### Scenario: Line starts
- **WHEN** a dialogue line starts
- **THEN** the music bus volume drops by about 6 dB until the line ends

### Requirement: Sound effects for every cue
The system SHALL provide a sound for every SFX cue id in the catalog and SHALL play it when the stage emits that cue. When a panel shows onomatopoeia, its sound SHALL start within 100 ms of the lettering appearing.

#### Scenario: Thunder with lettering
- **WHEN** a panel shows "KRAKOOM!" with cue "thunder"
- **THEN** the thunder sound starts within 100 ms of the lettering appearing

### Requirement: Silence before impact
On dramatic beats, music SHALL cut to silence about half a second before the beat's first impact cue and SHALL resume after the impact.

#### Scenario: Betrayal impact
- **WHEN** a dramatic betrayal beat reaches its "shink" cue
- **THEN** music is silent for about half a second before the cue plays, then music resumes

### Requirement: Structural stingers
The system SHALL play fixed sounds for the curtain opening and closing, each roll-call entrance, each elimination and the coronation, independent of scene cues.

#### Scenario: Elimination stinger
- **WHEN** a puppet's rod snaps during a fall action
- **THEN** the elimination stinger plays

### Requirement: Follows presenter controls
Audio SHALL pause and resume with the show and SHALL stop sounds that belong to skipped content. At speeds other than 1x, music SHALL keep its pitch and SFX SHALL fire at the scaled times.

#### Scenario: Pause silences
- **WHEN** the presenter pauses the show
- **THEN** all music and sound effects pause and resume from the same position on resume

#### Scenario: Skip act
- **WHEN** the presenter skips to the next act
- **THEN** sounds from the skipped content stop and the new act's music starts

### Requirement: Mute and volume
The presenter SHALL be able to toggle mute with the M key and adjust master volume in steps with the HUD or keyboard. The setting SHALL persist for the rest of the show.

#### Scenario: Mute
- **WHEN** the presenter presses M during playback
- **THEN** all audio is silent until M is pressed again, and the show continues playing

### Requirement: Graceful degradation
A missing, undecodable or blocked audio asset SHALL NOT interrupt the show. The affected sound SHALL be skipped, and the problem SHALL be reported in the browser console and in a setup-screen asset check.

#### Scenario: Missing SFX file
- **WHEN** the file for cue "raven" is absent
- **THEN** the show plays on without that sound and the setup screen lists "raven" as missing

### Requirement: Licensed assets
Every bundled audio file SHALL be listed in a licence manifest with its source, licence and required attribution. Only licences permitting redistribution SHALL be used. Required attributions SHALL appear in the show credits.

#### Scenario: Attribution in credits
- **WHEN** a bundled track's licence requires attribution
- **THEN** that attribution appears in the credits
