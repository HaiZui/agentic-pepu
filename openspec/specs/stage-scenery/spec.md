# stage-scenery Specification

## Purpose

Provides the paper-theater world the puppets perform in: layered scenery for every setting, the proscenium, and the shared paper-and-ink comic style used on stage and in print.

## Requirements

### Requirement: Scenery for every setting
The system SHALL provide scenery for every setting id in the published setting catalog. Each scenery SHALL have at least three depth layers (back, mid, front) that can move independently for parallax.

#### Scenario: Catalog coverage
- **WHEN** scenery is requested for each setting id in the catalog
- **THEN** each returns a scenery with at least three independently positionable layers

#### Scenario: Unknown setting
- **WHEN** scenery is requested for a setting id not in the catalog
- **THEN** a neutral fallback scenery is returned and a warning is logged

### Requirement: House sigils and banners
The system SHALL render a sigil and a banner for every house in the house catalog, using the house's colours. Scenery SHALL be able to display the banners of houses present in a beat.

#### Scenario: Banners in battle
- **WHEN** a battlefield beat involves House Wolf and House Eel
- **THEN** the scenery can display both houses' banners in their colours

### Requirement: Proscenium frame
The system SHALL render a theater proscenium with curtains that can open and close, and footlights, framing a 16:9 stage area.

#### Scenario: Curtain states
- **WHEN** the proscenium is set to closed, then to open
- **THEN** the curtains cover the stage area when closed and reveal it when open

### Requirement: Paper and ink style
Figures and scenery SHALL share one visual style: paper fibre texture, cut-paper edges, heavy ink outlines, Ben-Day halftone shading and a fixed comic palette. Both the stage and the comic SHALL use this style.

#### Scenario: Same style in both outputs
- **WHEN** the same figure and scenery are rendered for the stage and for a comic panel
- **THEN** both renderings use the same textures, outline weights, halftone pattern and palette

### Requirement: Lettering font supports Finnish
The comic lettering and display fonts used for names, speech bubbles, captions and onomatopoeia SHALL be bundled locally, SHALL be licensed for redistribution, and SHALL include the glyphs Ä, Ö, Å, ä, ö and å.

#### Scenario: Finnish name card
- **WHEN** the name "Åsa Jääskeläinen-Öhman" is rendered on a name card
- **THEN** every character renders in the lettering font without fallback glyphs

#### Scenario: Offline rendering
- **WHEN** the laptop has no internet connection
- **THEN** all fonts still load from local files
