# Proposal

## Why

The show's look is a paper puppet theater drawn with superhero-comic ink and drama. Participants must be recognisable as the same distinctive figure on stage, in the cast preview and in the printed comic. With no image model available, the figures and scenery must be generated procedurally. They must be crisp at projector size and on paper.

Depends on: `add-app-foundation` (front end, setup screen) and `add-fate-engine` (houses, archetypes, NPCs, setting ids). Can be developed in parallel with `add-story-director`.

## What Changes

- Add a **puppet figure renderer** that draws each character as layered SVG paper cut-outs:
  - appearance derived from the name, so the same name gives the same puppet every week: silhouette, head shape, hair or helm, beard, scars or eyepatch, palette;
  - house colours and sigil shown on the figure;
  - an archetype accessory;
  - articulated parts (head, torso, arms on split pins, rod) for animation;
  - expressions matching the emotion catalog, including a ghost or dead variant.
- Add special figures: the Old King (crowned, or the Mad King NPC), NPC extras and background crowd silhouettes for large rosters.
- Add **house sigils and banners** from the house catalog.
- Add **stage scenery** for every setting id as layered parallax planes (back, mid, front), plus a proscenium frame with curtains and footlights.
- Add the visual style system: paper fibre texture, torn or cut edges, heavy ink outlines, Ben-Day halftone shading and a comic colour palette, shared by stage and print.
- Enable **Preview cast** on the setup screen and add a development gallery page.

## Capabilities

### New Capabilities
- `puppet-figures`: Deterministic, name-seeded character figures with house identity, archetype accessories, articulated parts and expressions, including the Old King, NPCs and crowd silhouettes.
- `stage-scenery`: Layered paper scenery for every setting id, the theater proscenium, and the shared paper-and-ink visual style used by both the stage and the comic.

### Modified Capabilities
<!-- None. Preview cast is a new requirement owned by puppet-figures; the setup screen gains the button behaviour. -->

## Impact

- New front-end rendering modules (SVG generation in TypeScript) used later by `add-live-stage` and `add-comic-export`.
- Bundled font and texture assets (open licences).
- Setup screen: Preview cast becomes active. New development page `/dev/gallery`.
- No backend changes beyond serving static assets.
