# Spec Delta

## Purpose

Turns a fixed fate script into validated, staged scene scripts. LLM agents write dialogue and captions, and template fallbacks guarantee the show runs even when the LLM is slow, filtered or unavailable.

## ADDED Requirements

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
Before writing scenes, the system SHALL produce one show bible per show from the complete fate script. It SHALL contain the show title, the prophecy wording, recurring motifs and a one-sentence synopsis per beat. Every scene request SHALL include the bible.

#### Scenario: Bible precedes scenes
- **WHEN** generation starts for a new show
- **THEN** the show bible is produced first and each scene request includes the bible's synopsis for its beat

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
Every dialogue line SHALL be spoken by a character that exists in the fate script and is alive (or a ghost marked as such) at that beat, or by the narrator.

#### Scenario: Unknown speaker
- **WHEN** the model attributes a line to a name that is not a character in the fate script
- **THEN** the scene fails validation

### Requirement: Outcome fidelity
A scene script SHALL depict exactly the eliminations, resurrections, alliances and betrayals of its beat. It SHALL NOT depict any other character being eliminated or any eliminated character acting.

#### Scenario: Extra death invented
- **WHEN** the model's scene states that a character not listed as eliminated in the beat dies
- **THEN** the scene fails validation and the fate script is not changed

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
