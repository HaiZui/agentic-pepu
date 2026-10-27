# Tasks

## 1. Style foundation

- [x] 1.1 Bundle Bangers and Comic Neue (OFL) as local woff2 with licence files, and add a glyph test for "ÄÖÅäöå". Verify with a Vitest/browser test and offline loading in the dev server.
- [x] 1.2 Implement the shared `<defs>`: paper texture filter, print-mode texture pattern, halftone pattern, palette CSS variables, ink stroke variables. Verify on `/dev/gallery` in stage and print modes.

## 2. Puppet figures

- [x] 2.1 Implement the name hash and PRNG (NFC + casefold, xmur3 + sfc32) and trait selection. Verify with a Vitest fixture of name-to-trait vectors, including "Jääskeläinen" and "Öhman".
- [x] 2.2 Author the minimum parts library (heads, hair/helms, beards, marks, bodies, palettes) and the face sub-groups for all catalog emotions, including the ghost variant. Verify on `/dev/gallery` (grid of all emotions) and with Vitest snapshot tests.
- [x] 2.3 Assemble articulated figures (`data-part` groups, pivots, rod) and the archetype accessories. Verify with a gallery test that rotates the arm part and checks the joint stays attached.
- [x] 2.4 Add the house overlay (tabard colours and sigil badge) and neutral peasant garments. Verify with a snapshot per house plus one houseless figure.
- [x] 2.5 Implement in-show collision resolution. Verify with a Vitest check that, for 1,000 random 40-name rosters, every pair differs in at least 2 traits, and that the base figures for non-colliding names are unchanged.
- [x] 2.6 Render the Old King (crowned variant, plus the Mad King NPC), NPC role figures and crowd silhouettes. Verify on `/dev/gallery`.

## 3. Scenery

- [x] 3.1 Implement house sigils and banners for the house catalog. Verify on `/dev/gallery`.
- [x] 3.2 Author the three-layer scenery for all 10 setting ids plus the neutral fallback with a logged warning. Verify with a Vitest check that every catalog setting returns at least 3 layers, and visually in the gallery.
- [x] 3.3 Implement the proscenium (curtain open/closed states, footlights) at 16:9. Verify on `/dev/gallery`.
- [x] 3.4 Produce a sample PDF of the gallery in print mode with headless Chromium. Verify that figures stay sharp at 4x zoom and textures render acceptably.

## 4. Setup integration

- [x] 4.1 Enable Preview cast on the setup screen (neutral garments, labelled, no API call that creates a session). Verify in the browser with 12 names and with the network tab showing no POST to `/api/shows`.
