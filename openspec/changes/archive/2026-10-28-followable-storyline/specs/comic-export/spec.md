# Spec Delta

## ADDED Requirements

### Requirement: Survivor strip on scene pages
Every scene page SHALL carry a survivor strip that shows which participants are still in the contest at the end of the last scene on that page, and their count. The strip SHALL NOT increase the page count and SHALL stay readable for 3 to 40 participants.

#### Scenario: Strip after an elimination
- **WHEN** a scene page ends with the scene in which Caesar falls in a 3-survivor show
- **THEN** the page's survivor strip marks Caesar out and shows the count 2

#### Scenario: Page budget unchanged
- **WHEN** the comic is generated for a 40-participant show
- **THEN** every scene page carries the strip and the total page count is still between 16 and 32

### Requirement: Announcements in the comic
Each elimination and return announcement SHALL appear in the comic as a stamp panel or stamp caption on the page of its scene, with the same wording as on stage. In crowd montages each tile SHALL carry its participant's announcement.

#### Scenario: Same stamp as stage
- **WHEN** the stage showed a stamp announcing that Elite is out, having forfeited by taking the Grey Cloak
- **THEN** the comic page for that scene shows the same announcement text

### Requirement: Ghosts labelled in the comic
A panel showing a ghost SHALL label the figure as the ghost of that character.

#### Scenario: Ghost panel
- **WHEN** a panel shows a line spoken by the eliminated Belzebub with the "dead" emotion
- **THEN** the panel shows the ghost variant of his figure labelled as the ghost of Belzebub
