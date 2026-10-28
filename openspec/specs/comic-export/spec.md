# comic-export Specification

## Purpose

Turns a finished show's story into a printable comic-book PDF that matches what was performed on stage and that the presenter can share by hand.

## Requirements

### Requirement: Automatic generation
The system SHALL start generating the comic automatically once every scene script and the chronicle texts of a show are final (ready or fallback), without presenter action.

#### Scenario: Comic ready during the show
- **WHEN** all scenes of a show become final while the show is still playing
- **THEN** comic generation starts immediately in the background and does not affect playback

### Requirement: Same content as the stage
The comic SHALL be built from the same fate script, scene scripts and chronicle texts that the stage uses, and SHALL NOT request any new LLM content.

#### Scenario: Dialogue matches
- **WHEN** a line was shown on stage in a speech bubble
- **THEN** the same line text appears in a balloon in the corresponding scene's panels

### Requirement: Page structure
The comic SHALL contain, in order: a cover with the chronicle cover title and the show date; a cast page grouped by house; then for each act an act divider page followed by that act's scene pages; a full-page coronation splash; an epilogue page; and a back cover.

#### Scenario: Structure for a fifteen-person show
- **WHEN** the comic is generated for a 15-participant show
- **THEN** the PDF pages appear in the order cover, cast, Act I divider and scenes, Act II divider and scenes, Act III divider and scenes, coronation splash, epilogue, back cover

### Requirement: Page format and length
Pages SHALL be A4 portrait. The comic SHALL have between 16 and 32 pages for every roster size from 3 to 40.

#### Scenario: Forty participants
- **WHEN** the comic is generated for a 40-participant show
- **THEN** the cast spans at most two pages and the total page count is between 16 and 32

### Requirement: Panels from panel moments
Each scene SHALL be laid out as panels derived from its panel moments, using each moment's framing. Crowd elimination beats SHALL be laid out as a montage of the eliminated characters with X stamps.

#### Scenario: Close-up panel
- **WHEN** a scene has a panel moment with framing "close_up" on Aino
- **THEN** the corresponding panel shows a close-up of Aino's figure with the referenced line in a balloon

### Requirement: Lettering
Balloons, captions and onomatopoeia SHALL use the bundled comic fonts. Text SHALL never be clipped or overflow its balloon or caption box, and Finnish characters SHALL render correctly.

#### Scenario: Longest line fits
- **WHEN** a panel contains a 140-character line spoken by a character with a 24-character Finnish name
- **THEN** the full text is visible inside the balloon with no clipping

### Requirement: Print quality
Figures, scenery outlines and lettering SHALL be embedded as vector content in the PDF.

#### Scenario: Zoomed inspection
- **WHEN** a page of the PDF is viewed at 400 percent zoom
- **THEN** figure outlines and lettering remain sharp

### Requirement: Verifiable back cover
The back cover SHALL show the full Seal of Fate, the seed with a manual-seed badge if applicable, the engine version, the verification command to recompute the result, and the roll of the fallen with each participant's elimination mode.

#### Scenario: Back cover verification
- **WHEN** a colleague runs the verification command printed on the back cover with the printed seed and the cast list
- **THEN** it reproduces the printed Seal of Fate and the crowned winner

### Requirement: Credits and disclosure
The back cover or the epilogue page SHALL include the required audio attributions from the licence manifest, and SHALL state that the dialogue was written by AI from a randomly generated fate.

#### Scenario: AI disclosure
- **WHEN** the comic is generated
- **THEN** it contains a statement that the dialogue was AI-written and the outcome was decided by a random seed

### Requirement: Output files
The system SHALL write the PDF and a `show.json` record of the fate script, scene scripts, chronicle texts and revealed seed into a new folder under `output/`, named with the show's date and time. The PDF filename SHALL be `bottle-throne_<YYYY-MM-DD>.pdf`.

#### Scenario: Files written
- **WHEN** comic generation completes for a show on 2026-10-30 at 15:04
- **THEN** a folder under `output/` named for that date and time contains `bottle-throne_2026-10-30.pdf` and `show.json`

### Requirement: Offline and isolated
Comic generation SHALL make no network requests beyond the local application. A failure SHALL be reported with a reason, and SHALL NOT stop or alter the live show.

#### Scenario: Generation fails
- **WHEN** the headless browser fails to start
- **THEN** the comic status shows failed with the reason, the show continues to the credits, and the presenter can retry generation

### Requirement: Open comic from the credits
The credits SHALL show the comic status (generating, ready or failed). When ready, they SHALL offer actions to open the PDF and to reveal its folder in the file explorer, so the presenter can share it manually.

#### Scenario: Open when ready
- **WHEN** the credits are shown and the comic is ready
- **THEN** activating Open comic displays the PDF, and Show in folder opens the file explorer with the PDF selected

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
