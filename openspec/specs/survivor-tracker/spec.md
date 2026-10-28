# survivor-tracker Specification

## Purpose

Keeps a running record of who is still in the contest, derived only from the fate script. It defines the elimination and return announcements, so viewers of the stage and readers of the comic always know who is out, who came back and how many remain.

## Requirements

### Requirement: Survivor state from the fate script
The system SHALL derive, for every beat, the set of participants still in the contest before and after that beat from the fate script alone. A participant leaves the set in the beat that eliminates them and rejoins it in the beat that resurrects them. Non-participant characters SHALL NOT be counted.

#### Scenario: Count through a show
- **WHEN** an 8-participant show eliminates one participant in each of seven beats and resurrects none
- **THEN** the survivor count reads 8 before the first elimination and decreases by one at each elimination to 1 at the coronation

#### Scenario: Resurrection restores a survivor
- **WHEN** a participant eliminated in Act I is resurrected in Act II
- **THEN** the survivor set after the resurrection beat includes that participant again and the count rises by one

#### Scenario: NPC death not counted
- **WHEN** the Food Taster dies in a beat
- **THEN** the survivor set and count are unchanged by that beat

### Requirement: Final survivor is the crowned winner
The survivor set at the coronation SHALL contain exactly one participant, and it SHALL be the fate script's winner.

#### Scenario: Coronation state
- **WHEN** the coronation beat begins
- **THEN** the survivor set contains only the winner and the count reads 1

### Requirement: Elimination announcement
Every participant elimination SHALL have an announcement built from the fate script without the LLM. The announcement SHALL name the participant exactly as entered, state that they are out, and give a short cause from a fixed per-event wording that includes the elimination mode and, where the fate assigns one, the character responsible.

#### Scenario: Killed by a named character
- **WHEN** Belzebub is eliminated in a Trial by Combat whose challenger is the Jester
- **THEN** the announcement reads as Belzebub being out, slain by the Jester in Trial by Combat

#### Scenario: Poisoner drinks their own cup
- **WHEN** Davido is the poisoner in a Poisoned Goblet beat that records that the poisoner drank, and Caesar is the intended victim
- **THEN** the announcement states that Davido is out, poisoned by the goblet he meant for Caesar

#### Scenario: Forfeit without a responsible character
- **WHEN** Elite forfeits by taking the Grey Cloak
- **THEN** the announcement states that Elite is out, having forfeited by taking the Grey Cloak, and names no other character

### Requirement: Crowd announcement
A beat eliminating two or more participants SHALL have one announcement per eliminated participant plus a single summary of how many left in that event.

#### Scenario: Plague takes three
- **WHEN** the Grey Plague eliminates three participants
- **THEN** there are three announcements naming each of them and a summary stating that three are out in the Grey Plague

### Requirement: Return announcement
A resurrection SHALL have an announcement built from the fate script that names the participant, states that they return to life and to the contest, and names the event that returned them.

#### Scenario: Red Priestess return
- **WHEN** Davido is resurrected in the Red Priestess beat
- **THEN** the announcement states that Davido returns to life, raised by the Red Priestess, and is back in the contest

### Requirement: Ghosts stay out
A character who appears as a ghost SHALL remain outside the survivor set, and no announcement SHALL be made for a ghost appearance.

#### Scenario: Ghost appears
- **WHEN** an eliminated participant speaks as a ghost in a later scene
- **THEN** the survivor set and count are unchanged and that participant is still shown as out
