# fate-engine Specification

## Purpose

Decides the raffle outcome fairly and reproducibly, and produces the complete story timeline (the fate script) that narration, staging and the comic all follow without changing it.

## Requirements

### Requirement: Automatic seed generation
When a show is automatically seeded, the system SHALL generate a seed of at least 128 bits from a cryptographically secure random source at show creation.

#### Scenario: Auto seed created
- **WHEN** a show session is created without a manual seed
- **THEN** a new seed of at least 128 bits is generated from a cryptographically secure source and stored with the session

### Requirement: Canonical roster
The system SHALL derive a canonical roster by sorting participant names case-insensitively, so that the outcome does not depend on the order in which names were entered.

#### Scenario: Entry order does not matter
- **WHEN** two shows use the same seed and the same names entered in different orders
- **THEN** both shows select the same winner and produce the same fate script

### Requirement: Uniform winner selection
The system SHALL select the winner before building the story, using only the seed and the canonical roster, with every participant having equal probability. The selection SHALL NOT use name content, archetypes, houses or any LLM output.

#### Scenario: Statistical fairness
- **WHEN** winners are selected for 20,000 random seeds with a fixed roster of 15 names
- **THEN** a chi-square test of win counts per participant does not reject uniformity at the 0.001 significance level

#### Scenario: Old King has no advantage
- **WHEN** the Old King is also a participant
- **THEN** their probability of winning equals that of every other participant

### Requirement: Deterministic fate script
Given the same seed, canonical roster, Old King and engine version, the system SHALL produce an identical fate script.

#### Scenario: Replay with manual seed
- **WHEN** a show is recreated with the seed revealed by an earlier show and the same roster and Old King
- **THEN** the fate script, including winner, beats and eliminations, is identical to the earlier one

### Requirement: Seal of Fate commitment
Before the show starts, the system SHALL publish a commitment hash computed over the seed, canonical roster, Old King and engine version. The seed SHALL NOT be included in any data sent to the front end before the reveal.

#### Scenario: Seal available at show start
- **WHEN** the front end loads a newly created show
- **THEN** it receives the Seal of Fate hash and the fate script without the seed

### Requirement: Seed reveal
The system SHALL reveal the seed and engine version for a show on request so they can be displayed during the credits. The reveal SHALL include whether the seed was manual.

#### Scenario: Reveal returns verification data
- **WHEN** the front end requests the reveal for a show
- **THEN** it receives the seed, the engine version and the seed mode, and hashing them with the roster and Old King reproduces the Seal of Fate

### Requirement: Offline verification command
The system SHALL provide a command-line verification that, given a seed, a roster, an optional Old King and an engine version, prints the Seal of Fate hash and the winner without contacting any network service.

#### Scenario: Colleague verifies the result
- **WHEN** a user runs the verification command with the revealed seed and the roster of a finished show
- **THEN** it prints the same Seal of Fate hash shown at the start and the same winner crowned on stage

### Requirement: Three-act structure
The fate script SHALL consist of a cold open, Act I, Act II, Act III and a coronation, in that order, with each beat assigned to exactly one of these sections.

#### Scenario: Section order
- **WHEN** a fate script is generated for any roster size from 3 to 40
- **THEN** its beats appear in the order cold open, Act I, Act II, Act III, coronation, and each section is non-empty

### Requirement: Final contest between named contenders
Act III SHALL begin with two or three surviving participants and SHALL end with a beat in which the winner defeats or outlasts the final rival. Crowd events SHALL NOT occur in Act III.

#### Scenario: Act III for a large roster
- **WHEN** a fate script is generated for 40 participants
- **THEN** Act III starts with two or three surviving participants and contains no crowd event

### Requirement: Event cards with preconditions
Each beat SHALL be produced by an event card whose preconditions hold in the timeline state at that point. Each card SHALL record its participants and roles, and SHALL apply its state effects.

#### Scenario: Betrayal requires alliance
- **WHEN** a fate script contains a "knife in the back" beat
- **THEN** an earlier beat formed an alliance between the betrayer and the victim, and that alliance is still in force at the time of the betrayal

#### Scenario: Poisoned goblet requires a feast setting
- **WHEN** a fate script contains a poisoned goblet beat
- **THEN** that beat's setting is a feast or hall setting

### Requirement: Timeline consistency
In every fate script, eliminated characters SHALL take no further active role unless resurrected. The only surviving participant at the end SHALL be the selected winner. The winner SHALL be the participant crowned in the coronation.

#### Scenario: No acting after elimination
- **WHEN** a participant is eliminated in beat k and not resurrected
- **THEN** no beat after k lists that participant as an active role

#### Scenario: Winner survives
- **WHEN** a fate script is complete
- **THEN** exactly one participant is alive, it is the selected winner, and the coronation beat crowns that participant

### Requirement: Crowd events
The system SHALL support crowd event beats that eliminate two or more participants at once. These beats SHALL be used so that larger rosters fit the same beat budget.

#### Scenario: Large roster uses crowd events
- **WHEN** a fate script is generated for 30 participants
- **THEN** it contains at least three crowd event beats, each eliminating two or more participants

#### Scenario: Small roster avoids crowd events
- **WHEN** a fate script is generated for 6 participants
- **THEN** no crowd event eliminates more than two participants

### Requirement: Elimination modes
Every elimination SHALL have a mode of killed, forfeited or exiled. For rosters of six or more, at least one elimination SHALL be non-lethal.

#### Scenario: Non-lethal exit present
- **WHEN** a fate script is generated for 10 participants
- **THEN** at least one elimination has mode forfeited or exiled

### Requirement: Resurrection limit
The system SHALL resurrect at most one participant per show, only for rosters of six or more, and only in Act II. The resurrected participant SHALL be eligible to win.

#### Scenario: Single resurrection
- **WHEN** a fate script contains a resurrection beat
- **THEN** it is the only resurrection in the script, it occurs in Act II, and the roster has at least six participants

### Requirement: Constant pacing budget
Each beat SHALL carry a time budget in seconds. For every roster size from 3 to 40, the total budget including the cold open and the coronation SHALL be between 540 and 660 seconds, and the beat count SHALL be between 16 and 24.

#### Scenario: Pacing across sizes
- **WHEN** fate scripts are generated for every roster size from 3 to 40 with 500 seeds each
- **THEN** every script has a total budget between 540 and 660 seconds and between 16 and 24 beats

### Requirement: Houses scaled by roster size
The system SHALL assign participants at random to houses as follows: no houses for 3-5 participants, 2 houses for 6-8, 3 for 9-14, 4 for 15-24 and 5 for 25-40. House sizes SHALL differ by at most one.

#### Scenario: Fifteen participants
- **WHEN** a fate script is generated for 15 participants
- **THEN** there are 4 houses with sizes 4, 4, 4 and 3 in some order

### Requirement: Random archetypes
The system SHALL assign each participant an archetype at random from Schemer, Brute, Fool, Zealot, Honorable One, Coward and Bard. Assignment SHALL NOT depend on name content.

#### Scenario: Archetype independent of name
- **WHEN** the same seed is used with a roster where one name is replaced by a different name at the same canonical position
- **THEN** the archetype at that position is unchanged

### Requirement: NPC extras
For rosters of 14 or fewer, the fate script SHALL include NPC extras (non-participant characters such as a royal adviser, a guard or a food taster) who may take roles and be eliminated. NPC extras SHALL NOT affect who wins.

#### Scenario: NPCs in a small show
- **WHEN** a fate script is generated for 6 participants
- **THEN** it includes at least two NPC extras, and at least one NPC takes an active role in some beat

### Requirement: Old King role
The fate script SHALL include the Old King as a character: either the Mad King NPC or the named previous winner. The Old King SHALL appear in the cold open and in at least one later beat.

#### Scenario: Previous winner not competing
- **WHEN** the Old King is a name that is not in the roster
- **THEN** the Old King is a non-participant character who appears in the cold open and in at least one other beat

### Requirement: Prophecy foreshadowing
Act I SHALL contain a prophecy beat whose structured hints refer to true facts about the winner's path through the timeline, such as being betrayed, being resurrected, their house or their final rival, without naming the winner.

#### Scenario: Prophecy hints are true
- **WHEN** a prophecy beat lists the hint "was betrayed by an ally"
- **THEN** the winner is the victim of a betrayal attempt somewhere in the fate script

### Requirement: Fate script delivery
The system SHALL provide the fate script for a show through the API as structured data. The fate script SHALL include the characters, houses, archetypes, beats, eliminations, budgets and the Seal of Fate, and SHALL NOT include the seed.

#### Scenario: Fetch fate script
- **WHEN** the front end requests the fate script of an existing show
- **THEN** it receives the structured fate script, and the response contains no seed field
