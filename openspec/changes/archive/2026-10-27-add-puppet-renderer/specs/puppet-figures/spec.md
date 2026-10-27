# Spec Delta

## Purpose

Draws every character as a distinctive, recognisable paper-puppet figure that looks the same on stage, in the cast preview and in the printed comic.

## ADDED Requirements

### Requirement: Name-seeded appearance
A participant's base appearance SHALL be derived only from their name, normalized with Unicode NFC and case-folded. The same name SHALL produce the same figure in every show and on every machine.

#### Scenario: Same name next week
- **WHEN** "Matti K." appears in two different shows with different seeds
- **THEN** the base figure (silhouette, head, hair or helm, facial features, skin and garment palette) is identical in both

### Requirement: Distinctive features
Each figure SHALL combine several independent visible traits: body silhouette, head shape, hair or headgear, facial hair, a distinguishing mark (scar, eyepatch, freckles, war paint or none) and a palette. Within one show, any two participants SHALL differ in at least two of these traits.

#### Scenario: Collision resolved within a show
- **WHEN** two participants' names would yield figures differing in fewer than two traits
- **THEN** the later name in canonical order receives a deterministic trait adjustment so the two differ in at least two traits

### Requirement: House identity on figures
Once a show has assigned houses, each figure SHALL display its house colours and sigil. Participants without a house SHALL wear neutral peasant garments.

#### Scenario: House colours applied
- **WHEN** a participant belongs to House Goat in the fate script
- **THEN** their figure shows House Goat's colours and goat sigil

### Requirement: Archetype accessory
Each participant figure SHALL carry one accessory identifying its archetype, such as a dagger for the Schemer, a club for the Brute or a lute for the Bard.

#### Scenario: Bard accessory
- **WHEN** a participant's archetype is Bard
- **THEN** their figure includes the Bard accessory

### Requirement: Expressions
Each figure SHALL render every emotion in the published emotion catalog. The `dead` emotion SHALL render as a ghost variant that is clearly distinguishable from living figures.

#### Scenario: All emotions renderable
- **WHEN** a figure is rendered with each emotion id from the catalog
- **THEN** each rendering succeeds and the face differs visibly between emotions

### Requirement: Articulated parts
Figures SHALL be composed of separately addressable parts (rod, torso, head, left arm, right arm, accessory) with pivot points, so that the stage can animate them independently.

#### Scenario: Arm can swing
- **WHEN** the stage rotates a figure's right arm part around its pivot
- **THEN** only the arm and its attached accessory move and the joint stays attached to the torso

### Requirement: Special figures
The system SHALL render a crowned Old King figure (the Mad King NPC or the named previous winner), distinct figures for each NPC extra role, and simplified crowd silhouettes in house colours for background crowds.

#### Scenario: Mad King
- **WHEN** a show's Old King is the Mad King NPC
- **THEN** the cast includes a crowned figure that is visibly different from all participant figures

### Requirement: Vector output
Figures SHALL render as resolution-independent vector graphics, so they appear sharp both on a 1920x1080 projector and in a printed PDF.

#### Scenario: Print scale
- **WHEN** a figure is rendered at 4x its stage size
- **THEN** its edges and outlines remain sharp with no pixelation

### Requirement: Cast preview on setup
The setup screen's Preview cast action SHALL show every currently entered valid name as its base puppet in neutral peasant garments. It SHALL NOT create a show or reveal houses, archetypes or any outcome.

#### Scenario: Preview before START
- **WHEN** the presenter enters 12 names and presses Preview cast
- **THEN** 12 labelled puppets are displayed in neutral garments and no show session is created
