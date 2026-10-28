# Spec Delta

## MODIFIED Requirements

### Requirement: Show bible
Before writing scenes, the system SHALL produce one show bible per show from the complete fate script. It SHALL contain the show title, the prophecy wording, recurring motifs, a one-sentence synopsis per beat, a story plan of one to four threads that each link a setup beat to one or more later payoff beats, a one-line in-story motivation per participant, and a one-sentence reason for every participant elimination consistent with that beat's facts. Every scene request SHALL include the bible.

#### Scenario: Bible precedes scenes
- **WHEN** generation starts for a new show
- **THEN** the show bible is produced first and each scene request includes the bible's synopsis for its beat

#### Scenario: Every exit has a reason
- **WHEN** the bible is delivered for a show in which seven participants are eliminated
- **THEN** it contains a reason for each of the seven eliminations, and each reason names the eliminated participant

#### Scenario: Threads reference real beats
- **WHEN** the bible's story plan is delivered
- **THEN** every thread references at least two beat indexes that exist in the fate script, in ascending order

#### Scenario: Fallback bible still explains exits
- **WHEN** the bible request fails and the template bible is used
- **THEN** the template bible contains a reason for every participant elimination built from the beat facts

### Requirement: Valid speakers
Every dialogue line SHALL be spoken by the narrator, or by a character that exists in the fate script and that at that beat is alive, is being resurrected in that beat, or is the beat's planned ghost.

#### Scenario: Unknown speaker
- **WHEN** the model attributes a line to a name that is not a character in the fate script
- **THEN** the scene fails validation

#### Scenario: Eliminated character speaks normally
- **WHEN** a participant eliminated in an earlier beat speaks in a later scene with an emotion other than "dead"
- **THEN** the scene fails validation

### Requirement: Outcome fidelity
A scene script SHALL depict exactly the eliminations, resurrections, alliances and betrayals of its beat. It SHALL NOT depict any other character being eliminated, any eliminated character acting other than as a ghost, or any bystander leaving the story.

#### Scenario: Extra death invented
- **WHEN** the model's scene states that a character not listed as eliminated in the beat dies
- **THEN** the scene fails validation and the fate script is not changed

#### Scenario: Bystander falls
- **WHEN** a bystander in a scene performs the "fall" or "exit" action
- **THEN** the scene fails validation

## ADDED Requirements

### Requirement: Role-aware beat facts
Every bible and scene request SHALL describe each beat with a plain-language statement of what happens. The statement SHALL name every role holder with their role and include every recorded beat fact, so that who acts on whom cannot be confused.

#### Scenario: Poisoner drinks their own cup
- **WHEN** a Poisoned Goblet beat has Davido as poisoner, Caesar as intended victim and the fact that the poisoner drank
- **THEN** the request states that Davido poisoned a goblet meant for Caesar and drank it himself, and the bible request carries the same roles

### Requirement: Story so far
Every scene request SHALL include a recap of every earlier beat in order, taken from the show bible, the threads that the beat advances, and the names of the participants still in the contest at the start of the beat.

#### Scenario: Recap in Act III
- **WHEN** the scene for the fifteenth beat is requested
- **THEN** the request contains the synopses of beats 0 to 14 in order and the list of participants still in the contest before beat 15

### Requirement: Introductions before exits
Before scenes are written, the system SHALL plan bystander appearances from the fate script without the LLM. Every participant eliminated alone, with no role in any earlier beat after the cold open, SHALL be planned into at least one earlier scene. The winner SHALL be planned into at least one scene in each act where they have no role.

#### Scenario: Contestant introduced before falling
- **WHEN** Albon has no role before the beat that eliminates him in Act III
- **THEN** the plan places Albon as a bystander in at least one earlier scene, and that scene's request lists him as a bystander

#### Scenario: Winner visible in every act
- **WHEN** the winner has no role anywhere in Act II
- **THEN** the plan places the winner as a bystander in at least one Act II scene

### Requirement: Bystanders
A scene SHALL include every bystander planned for its beat, each speaking at least one line. A scene SHALL include at most two bystanders. A bystander is a participant without a role in the beat. A bystander SHALL be in the contest at the start of the beat and SHALL NOT perform "fall", "exit" or "enter".

#### Scenario: Planned bystander missing
- **WHEN** the plan puts Albon in a scene and the generated scene has no line spoken by Albon
- **THEN** the scene fails validation

#### Scenario: Eliminated participant as bystander
- **WHEN** a scene gives a line to a participant who is out of the contest, without the ghost emotion
- **THEN** the scene fails validation

### Requirement: Elimination named in the scene
In a beat that eliminates exactly one character, the eliminated character's name SHALL appear in at least one line or caption of the scene, together with that character performing their elimination action.

#### Scenario: Unnamed death
- **WHEN** a single-elimination scene shows Belzebub falling but no line or caption contains "Belzebub"
- **THEN** the scene fails validation

### Requirement: Resurrection staged as a return
In the beat that resurrects a participant, that participant SHALL be described to the model as returning to life in this beat, SHALL perform the "enter" action, and SHALL NOT use the "dead" emotion.

#### Scenario: Risen played as ghost
- **WHEN** the resurrection scene gives the risen participant a line with emotion "dead"
- **THEN** the scene fails validation

### Requirement: Planned ghost
The system SHALL plan at most one ghost per show from the fate script without the LLM: a participant eliminated in an earlier beat whose responsible character (the role that caused the exit, such as the challenger, betrayer or poisoner) is eliminated in a later beat, other than the coronation. The ghost is planned into that later beat. When several pairs qualify, the earliest later beat is chosen.

#### Scenario: Ghost watches the killer fall
- **WHEN** the Jester slays Belzebub in beat 9 and the Jester is eliminated in beat 15
- **THEN** Belzebub is the planned ghost of beat 15 and of no other beat

#### Scenario: No qualifying pair
- **WHEN** no character responsible for an exit is eliminated later in the show
- **THEN** no ghost is planned and no scene may contain a ghost

### Requirement: Scene cast
Each scene request SHALL restrict who may speak, act or be framed to the narrator, the beat's role holders, its planned bystanders and its planned ghost, so that contestants out of the contest cannot appear.

#### Scenario: Eliminated contestant cannot be chosen
- **WHEN** the scene for a beat after Davido's elimination is requested and Davido is not that beat's planned ghost
- **THEN** the request's schema does not accept Davido as a speaker, actor or panel focus

### Requirement: Ghost rules
A ghost is the beat's planned ghost speaking with the "dead" emotion. In the beat with a planned ghost, the ghost SHALL speak at least one line with the "dead" emotion, and a line or caption SHALL call them a ghost. A ghost SHALL NOT perform "fall", "exit" or "enter". No other eliminated character SHALL appear.

#### Scenario: Unplanned ghost
- **WHEN** a scene contains a line with the "dead" emotion from an eliminated character who is not the beat's planned ghost
- **THEN** the scene fails validation

#### Scenario: Ghost not introduced
- **WHEN** the planned ghost speaks but no line or caption of the scene contains the word "ghost"
- **THEN** the scene fails validation

#### Scenario: Ghost tries to re-enter
- **WHEN** a ghost line carries the "enter" action
- **THEN** the scene fails validation
