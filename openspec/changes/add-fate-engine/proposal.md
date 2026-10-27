# Proposal

## Why

The raffle must be provably fair, yet the story should still be dramatic: prophecies that come true, betrayals that were set up earlier, a twist ending. That only works if the outcome is fixed by code, never by the LLM, and if the whole timeline exists before the curtain rises. Show length must also stay close to ten minutes for any roster between 3 and 40 people.

Depends on: `add-app-foundation` (show sessions, roster contract).

## What Changes

- Add a deterministic **fate engine**. From a seed and the canonical roster it first selects the winner uniformly at random, then builds a complete timeline of story beats that ends with that winner.
- Add the **Seal of Fate**: a commitment hash shown at the start of the show. The seed is revealed at the end, and a verification command lets anyone recompute the winner and the hash.
- Add a three-act structure (Act I 'The Call', Act II 'The Game', Act III 'The Throne') framed by a cold open and a coronation. Act III always ends as a duel or standoff between named contenders.
- Add an **event card deck** with preconditions and state effects:
  - character cards: sworn alliance, knife in the back, trial by combat, poisoned goblet, taking the grey cloak, faceless contract, dragon egg, the Red Priestess, the Old King's gambit, debt to the Iron Vault;
  - non-lethal drama cards: prophecy, near miss, wound, decree;
  - **crowd event** cards that remove several participants at once: Grey Plague, Battle of the Muddy Field, the Crimson Feast, Wildfire Below the City, March of the Pale Ones, the Bridge Gives Way, Mutiny of the Grey Cloaks, Kingsmoot Exile.
- Add a **pacing solver** that keeps the beat count roughly constant and spreads N-1 eliminations across beats, using crowd events for large rosters and NPC extras and drama beats for small ones.
- Assign **houses** (scaled by roster size), **archetypes** (Schemer, Brute, Fool, Zealot, Honorable One, Coward, Bard) and **NPC extras** at random.
- Expose the fate script through the show API. Add a text-only chronicle view for development and verification.

## Capabilities

### New Capabilities
- `fate-engine`: Fair, seed-deterministic winner selection, commitment and verification, and generation of the complete beat timeline (acts, cards, houses, archetypes, NPC extras, eliminations, pacing budget) consumed by every later stage.

### Modified Capabilities
<!-- None. -->

## Impact

- New backend module and Pydantic contracts for the fate script. New endpoints under `/api/shows/{id}`.
- New CLI subcommand `python -m bottle_throne verify`.
- Front end: a development chronicle view at `/show/{id}/chronicle`. The show placeholder shows the Seal of Fate hash.
- No LLM or network usage. Pure, deterministic code with property-based tests.
