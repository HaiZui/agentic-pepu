# Proposal

## Why

The show already has a Dragon Egg event and dragon sound effects, but no encounter with an actual dragon. An occasional one-hero duel would add a memorable fantasy spectacle with either a heroic victory or a theatrical, non-graphic demise.

## What Changes

- Add an optional dragon encounter in Act I or II, at most once per show; some seeded shows have none.
- Cast exactly one living participant as the fighting hero. The seeded fate engine fixes victory or death before narration, preserving winner fairness, protection rules, elimination counts, and the final contestant duel.
- Support a slain-dragon victory and two defeat variants: slain by the dragon or a slapstick trip onto the hero's own sword.
- Treat the dragon as an encounter creature, not a contestant or ordinary court NPC. It cannot win, enter the survivor tracker, or change roster-size rules.
- Produce consistent prompts, outcome validation, exit reasons, and offline fallback scenes for every variant.
- Render a shared cut-paper dragon in live staging, dramatic panels, and comic export, with outcome-aware poses and existing audio cues.
- Preserve the beat/time budget by using existing drama or single-elimination slots. Document the encounter and version the changed fate generation behavior.
- No presenter toggle, guaranteed encounter, new setting, dragon dialogue, persistent dragon subplot, or new audio assets in this scope.

## Capabilities

### New Capabilities

- `dragon-encounters`: Optional seeded one-hero dragon duels, their fixed outcomes and narration, and consistent creature presentation on stage and in the comic.

### Modified Capabilities

None. Existing fate fairness, outcome fidelity, PG-13 narration, stage playback, and comic contracts remain in force; the new capability adds encounter-specific guarantees.

## Impact

- Backend: event cards and solver selection, fate validation/version metadata, role-aware wording, storyline exit causes, scene prompting/validation, and template fallback coverage.
- Frontend: shared SVG creature rendering, compiler state and framing, live renderer restoration/cleanup, and shared panel/comic art.
- Tests: card eligibility, deterministic generation and fairness, existing pacing/property checks, narration/fallback variants, playback controls, and comic rendering.
- API: reuse existing beat card, role, and fact fields; no new public endpoints or contestant kinds planned. Internal stage/panel types gain encounter state.
- Dependencies: no new model service, database, rendering library, or external image/audio dependency.
