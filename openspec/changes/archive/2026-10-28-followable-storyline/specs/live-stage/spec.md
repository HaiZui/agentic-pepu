# Spec Delta

## ADDED Requirements

### Requirement: Survivor tracker on stage
From the end of the roll call until the coronation, the stage SHALL show a survivor tracker with every participant's name or sigil, a mark on each participant who is out, and the number still in the contest. It SHALL be readable from 3 to 40 participants, at most 12 percent of the stage height, and SHALL NOT cover speech bubbles or foreground figures.

#### Scenario: Tracker after roll call
- **WHEN** the roll call of an 8-participant show ends
- **THEN** the tracker appears showing all 8 participants unmarked and the count 8

#### Scenario: Large roster
- **WHEN** a 40-participant show is playing
- **THEN** the tracker shows all 40 participants grouped by house within its height limit and the current count is readable

#### Scenario: Bubble not covered
- **WHEN** a speech bubble is shown near the edge of the stage where the tracker sits
- **THEN** the bubble is fully visible and the tracker does not overlap it

### Requirement: Elimination and return stamps on stage
The stage SHALL show each elimination announcement as a stamp right after the eliminated character's elimination action, or at the end of the scene if there is none. It SHALL hold the stamp for at least 2.5 seconds at 1x, and the tracker SHALL update when the stamp appears. A resurrection SHALL show its return announcement after the risen participant's entrance and remove their mark.

#### Scenario: Single elimination
- **WHEN** Albon falls in a Trial by Combat scene
- **THEN** a stamp announcing Albon as out, with the cause, appears after his fall, and the tracker marks Albon out and lowers the count by one

#### Scenario: Return to the contest
- **WHEN** Davido enters in the Red Priestess scene
- **THEN** a stamp announcing Davido's return appears, his mark is removed from the tracker and the count rises by one

### Requirement: Crowd announcements on stage
In a crowd montage, each tile SHALL show that participant's announcement beneath the X stamp, followed by the crowd summary. The tracker SHALL update once the summary appears.

#### Scenario: Plague montage with causes
- **WHEN** a Grey Plague montage shows four tiles
- **THEN** each tile shows its participant's name and cause, the summary states that four are out, and the tracker count drops by four

### Requirement: Ghosts marked on stage
Whenever a ghost speaks, the stage SHALL show the ghost variant of the figure and SHALL label the figure as a ghost with the character's name. The tracker SHALL continue to show that character as out.

#### Scenario: Ghost label
- **WHEN** the eliminated Belzebub speaks with the "dead" emotion in a later scene
- **THEN** his figure is the ghost variant labelled as the ghost of Belzebub, and the tracker still marks Belzebub out
