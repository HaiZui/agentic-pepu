# show-setup Specification

## Purpose

Defines the presenter-facing setup screen where participants, the Old King and the seed are entered and validated before a show session is created.

## Requirements

### Requirement: Participant entry
The setup screen SHALL accept participant names as free text with one name per line, trimming surrounding whitespace and ignoring blank lines, and SHALL display the resulting participant count.

#### Scenario: Names pasted with blank lines
- **WHEN** the presenter pastes "Matti", "", "  Aino  " and "Kalle" as separate lines
- **THEN** the roster contains exactly "Matti", "Aino" and "Kalle" and the count shows 3

#### Scenario: Finnish characters preserved
- **WHEN** the presenter enters "Jääskeläinen" and "Öhman"
- **THEN** the names are kept exactly as entered, including the characters "ä" and "Ö"

### Requirement: Roster size limits
The system SHALL allow a show only when the roster contains between 3 and 40 participants inclusive.

#### Scenario: Too few participants
- **WHEN** the roster contains 2 names
- **THEN** START is disabled and the screen explains that at least 3 participants are required

#### Scenario: Too many participants
- **WHEN** the roster contains 41 names
- **THEN** START is disabled and the screen explains that at most 40 participants are allowed

### Requirement: Unique participant names
The system SHALL treat names that differ only by letter case or surrounding whitespace as duplicates, highlight every duplicate, and block START until the presenter makes them distinct.

#### Scenario: Duplicate first names
- **WHEN** the roster contains "Matti" and "matti"
- **THEN** both lines are flagged as duplicates and START is disabled

#### Scenario: Duplicates resolved
- **WHEN** the presenter changes the names to "Matti K." and "Matti V."
- **THEN** the duplicate warning disappears and START becomes available if other rules pass

### Requirement: Name length limit
The system SHALL reject participant and Old King names longer than 24 characters and SHALL indicate which names are too long.

#### Scenario: Overlong name
- **WHEN** a roster line contains 30 characters
- **THEN** that line is flagged and START is disabled

### Requirement: Optional Old King
The setup screen SHALL accept an optional Old King name representing the previous winner. When the field is empty, the show SHALL use a non-participant character called the Mad King. When the name matches a roster entry, that participant SHALL be marked as the reigning king who is also competing.

#### Scenario: Old King not given
- **WHEN** the Old King field is empty and START is pressed
- **THEN** the created show records the Mad King as the Old King and the Old King is not a participant

#### Scenario: Old King also competes
- **WHEN** the Old King field is "Aino" and "Aino" is in the roster
- **THEN** the created show marks Aino as both the Old King and a participant

### Requirement: Seed selection
The setup screen SHALL use an automatically generated seed by default and SHALL offer an advanced option to enter a manual seed. A show created with a manual seed SHALL be marked as such.

#### Scenario: Automatic seed
- **WHEN** the presenter presses START without entering a seed
- **THEN** the backend generates the seed and the show is marked as automatically seeded

#### Scenario: Manual seed
- **WHEN** the presenter enters a seed in the advanced option and presses START
- **THEN** the show uses that seed and is marked as manually seeded

### Requirement: Show session creation
Pressing START with a valid roster SHALL create a show session on the backend containing the roster, the Old King, the seed mode and a unique show identifier, and SHALL navigate the browser to that show.

#### Scenario: Valid START
- **WHEN** the roster passes all validation rules and the presenter presses START
- **THEN** the backend returns a new show identifier and the browser navigates to the show view for that identifier

#### Scenario: Server-side validation
- **WHEN** a show creation request with an invalid roster reaches the backend directly
- **THEN** the backend rejects it with a validation error describing the failed rule and creates no session
