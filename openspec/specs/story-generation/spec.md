# story-generation Specification

## Purpose

Turns a fixed fate script into validated, staged scene scripts. LLM agents write dialogue and captions, and template fallbacks guarantee the show runs even when the LLM is slow, filtered or unavailable.

## Requirements

### Requirement: Foundry model access
The system SHALL call the chat model deployment named by `FOUNDRY_LLM_DEPLOYMENT_NAME` at `FOUNDRY_API_ENDPOINT` using `FOUNDRY_API_KEY`, from the backend only.

#### Scenario: Backend-only calls
- **WHEN** scenes are generated for a show
- **THEN** all model requests originate from the backend process and the browser makes no direct request to Foundry

### Requirement: Connectivity check
The system SHALL provide a command that sends a minimal request to the configured deployment and reports success, or a categorized failure (missing configuration, authentication, deployment not found, network, timeout), without printing the API key.

#### Scenario: Wrong deployment name
- **WHEN** the presenter runs the connectivity check with a deployment name that does not exist
- **THEN** the command reports a "deployment not found" failure and exits with a non-zero status

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

### Requirement: Scene script per beat
The system SHALL produce exactly one scene script per fate beat. It SHALL contain the setting id, a music mood id, ordered dialogue lines (speaker id, emotion id, optional action id, text), captions, optional onomatopoeia, SFX cues anchored to lines, and 3 to 6 panel moments with a framing id.

#### Scenario: Complete scene
- **WHEN** a scene script is delivered for a beat
- **THEN** it has the beat's setting id, at least one dialogue line or caption, and between 3 and 6 panel moments, each referencing an existing line or caption

### Requirement: Closed catalogs
Emotion, action, SFX cue, music mood, framing and setting values in scene scripts SHALL come from fixed catalogs published by the system. Any value outside a catalog SHALL fail validation.

#### Scenario: Invented cue rejected
- **WHEN** the model returns a SFX cue "dramatic_lute_sting_7" that is not in the catalog
- **THEN** the scene fails validation and is regenerated or replaced by a fallback

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

### Requirement: Scene fits its time budget
The estimated reading time of a scene SHALL NOT exceed its beat's time budget by more than 15 percent. Estimated reading time is the sum over lines of a fixed base plus a per-character duration. No single line SHALL exceed 140 characters.

#### Scenario: Overlong scene
- **WHEN** a generated scene's estimated reading time is 40 percent above its budget
- **THEN** the scene fails validation and is regenerated with a tighter line limit or replaced by a fallback

### Requirement: Language and names
Dialogue, captions and narration SHALL be in English. Participant names SHALL appear exactly as entered, including Finnish characters.

#### Scenario: Finnish name preserved
- **WHEN** a participant is named "Jääskeläinen"
- **THEN** every reference to them in scene text uses "Jääskeläinen" exactly

### Requirement: Tone and personal data
Generated text SHALL be theatrical and comedic at a PG-13 level, SHALL NOT describe gore in detail, and SHALL NOT invent claims about real participants' appearance, health, work or private lives. Only names, archetypes, houses and story facts SHALL be sent to the model.

#### Scenario: Request content minimized
- **WHEN** a scene request is sent to the model
- **THEN** it contains character names, archetypes, houses, beat facts and the show bible, and no other participant data

### Requirement: Foreshadowing payoff
The prophecy beat's dialogue SHALL express the fate script's prophecy hints without naming the winner. The coronation scene SHALL reference the prophecy as fulfilled.

#### Scenario: Prophecy fulfilled
- **WHEN** the coronation scene is delivered
- **THEN** it contains a line or caption that refers back to the prophecy spoken in Act I

### Requirement: Chronicle texts
The system SHALL produce act title cards, an epilogue of at most 120 words, a comic cover title and a back-cover blurb, all consistent with the fate script.

#### Scenario: Epilogue length
- **WHEN** the epilogue is generated
- **THEN** it names the winner as the new monarch and contains at most 120 words

### Requirement: Pre-generation with progress
Generation of the bible, all scenes and the chronicle texts SHALL start automatically when a show is created, SHALL run with bounded concurrency in beat order of need, and SHALL report per-beat status (pending, ready, fallback) to the front end as it changes.

#### Scenario: Progress observable
- **WHEN** the front end subscribes to a show's generation progress
- **THEN** it receives a status update each time a beat becomes ready or falls back, and a final completion event

### Requirement: Retry and fallback
When a scene request fails, times out, is blocked by a content filter or fails validation, the system SHALL retry at most once. After that it SHALL deliver a template fallback scene built from the beat facts without the LLM, marked as fallback.

#### Scenario: Content filter blocks a scene
- **WHEN** the model refuses a scene because of a content filter on both attempts
- **THEN** a template fallback scene that satisfies all scene validation rules is delivered for that beat

#### Scenario: Foundry not configured
- **WHEN** a show is created while Foundry configuration is incomplete
- **THEN** every beat receives a template fallback scene and the show remains playable

### Requirement: Stable scenes per show
Once a scene script is delivered for a beat, it SHALL NOT change for the lifetime of the show, so that the stage and the comic show identical content.

#### Scenario: Repeat fetch
- **WHEN** the same scene is requested twice for a show
- **THEN** both responses are identical

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
