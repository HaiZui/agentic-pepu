# Spec Delta

## Purpose

Adds occasional one-hero dragon duels whose seeded outcomes remain consistent across narration, survivor tracking, live paper-theater staging, and exported comics.

## ADDED Requirements

### Requirement: Optional bounded encounter
A show SHALL contain zero or one dragon duel, only in Act I or Act II. The encounter SHALL use an existing beat rather than adding a beat. Both encounter and no-encounter shows SHALL be possible. Existing pacing, non-lethal-exit, resurrection, and final-contest requirements SHALL remain satisfied.

#### Scenario: No encounter selected
- **WHEN** a seed produces a show without a dragon duel
- **THEN** the show runs normally without a dragon actor or an empty encounter beat

#### Scenario: Encounter selected
- **WHEN** a show contains a dragon duel
- **THEN** no other beat contains another dragon duel, Act III retains its contestant contest, and the show remains within 16 to 24 beats and 540 to 660 budgeted seconds

### Requirement: Single participant hero
A duel SHALL have exactly one fighting hero who is a living participant at its start. The dragon SHALL NOT be a participant, a court extra, a candidate winner, or a survivor-tracker entry. Any planned bystanders or ghost SHALL remain spectators and SHALL NOT fight or change the outcome.

#### Scenario: Small and large rosters
- **WHEN** a dragon duel is generated for either 3 or 40 participants
- **THEN** it features one living participant hero without consuming a court-extra slot or changing roster size, houses, or winner eligibility

#### Scenario: Spectators
- **WHEN** an encounter scene includes a planned bystander or ghost
- **THEN** the spectator does not attack the dragon, die, or leave the contest because of the encounter

### Requirement: Fixed seeded duel outcome
Before narration, the fate script SHALL identify the hero and exactly one outcome: the hero slays the dragon and survives, the dragon slays the hero, or the hero trips onto their own sword and dies. Victory SHALL eliminate no participant; either defeat SHALL eliminate only the hero with mode killed. The language model SHALL NOT select or change the outcome.

#### Scenario: Heroic victory
- **WHEN** the planned outcome is a dragon slain by the hero
- **THEN** the dragon is defeated and the hero remains alive and in the contest at the end of the beat

#### Scenario: Dragon attack
- **WHEN** the planned outcome is the hero slain by the dragon
- **THEN** the hero alone is eliminated and the dragon is not depicted as slain

#### Scenario: Sword accident
- **WHEN** the planned outcome is the hero tripping onto their own sword
- **THEN** the scene identifies the accident as the death cause rather than a dragon kill, and the dragon is not depicted as slain

### Requirement: Fair and protection-aware selection
Encounter selection SHALL leave uniform winner selection unchanged. The selected winner SHALL NOT die in a dragon duel. Fatal duels SHALL obey the existing victim eligibility, immunity, and forced-victim rules. A victory SHALL be possible for eligible participants other than the winner. Replays with identical inputs and engine version SHALL reproduce the encounter and variant.

#### Scenario: Protected hero
- **WHEN** a participant has active Dragon Egg immunity for a beat
- **THEN** a fatal dragon duel does not eliminate that participant in that beat

#### Scenario: Repeatable encounter
- **WHEN** the same seed, canonical roster, Old King, and engine version are replayed
- **THEN** dragon presence, beat, hero, and outcome variant are identical

#### Scenario: Non-winner victory
- **WHEN** an eligible participant other than the selected winner wins a dragon duel
- **THEN** they survive that encounter and can be eliminated later through the ordinary fate timeline

### Requirement: Outcome-aware narration and fallback
Bible and scene requests SHALL state the hero, fixed outcome, and death cause when applicable. Generated and offline fallback scenes SHALL depict the same result and name the hero. Defeats SHALL be theatrical and non-graphic. The dragon SHALL not require a dialogue speaker. Validation SHALL reject a scene that reverses the fixed outcome or adds a participant elimination.

#### Scenario: Fallback for each variant
- **WHEN** Foundry is unavailable for any of the three outcomes
- **THEN** a valid template scene depicts the planned encounter without changing its hero, result, or death cause

#### Scenario: Reversed victory
- **WHEN** the model depicts the hero dying in a planned victory or slaying the dragon in a planned defeat
- **THEN** the scene is rejected and retried or replaced without changing the fate script

### Requirement: Honest survivor announcements
A fatal duel SHALL produce an OUT announcement naming the hero and distinguishing a dragon kill from the sword accident. A victorious duel SHALL produce no participant OUT announcement. Stage, comic, and fallback wording SHALL agree on the cause.

#### Scenario: Accidental death stamp
- **WHEN** the hero dies by tripping onto their sword
- **THEN** the OUT wording attributes the death to the accident, and the tracker removes only that hero

#### Scenario: Victory is not an exit
- **WHEN** the hero slays the dragon
- **THEN** the participant survivor list is unchanged by that beat

### Requirement: Shared visible dragon
The live encounter and its exported comic SHALL show a recognizable cut-paper dragon in the existing paper-and-ink style. The confrontation SHALL visibly establish both hero and dragon. The resolution SHALL distinguish a fallen dragon from a fallen hero. Rendering SHALL use local assets and SHALL NOT require external image generation.

#### Scenario: Victory presentation
- **WHEN** a victorious encounter is played or exported
- **THEN** its confrontation shows hero and dragon, and its resolution shows the dragon defeated with the hero surviving

#### Scenario: Defeat presentation
- **WHEN** a fatal encounter is played or exported
- **THEN** its resolution shows the hero fallen and the dragon not slain, with text distinguishing the attack from the sword accident

### Requirement: Restorable encounter presentation
Dragon presence and resolution SHALL follow the current beat and playback position. Pause, resume, speed changes, skip, and state restoration SHALL preserve the correct encounter state without duplicate creatures or lingering dragons in unrelated beats. Audio SHALL use the existing cue catalog and respect mute and playback controls.

#### Scenario: Skip past the encounter
- **WHEN** playback skips from a dragon duel to an unrelated beat
- **THEN** the dragon is removed and the survivor tracker reflects the fixed encounter outcome

#### Scenario: Restore encounter resolution
- **WHEN** playback restores a state after a dragon victory resolution
- **THEN** the dragon is defeated rather than reset to threatening, and no animation replay is needed to reconstruct that state

### Requirement: Documented encounter behavior
Project documentation SHALL explain that the duel is optional, occurs at most once, has seeded victory and defeat outcomes, and cannot change raffle fairness. New fate-generation behavior SHALL carry an updated engine version so replay and verification metadata identify the rules used.

#### Scenario: Rules visible to presenter
- **WHEN** the presenter reads the encounter documentation
- **THEN** it explains that some shows have no duel and that narration cannot decide whether the hero survives
