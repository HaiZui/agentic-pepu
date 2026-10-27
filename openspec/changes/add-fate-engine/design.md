# Design

## Context

`add-app-foundation` provides show sessions (canonical roster, Old King, seed mode) and Pydantic contracts with generated TS types. This change adds pure, deterministic Python. Requirements are in `specs/fate-engine/spec.md`. Every later change consumes the fate script, so its shape is the main contract decided here.

## Goals / Non-Goals

**Goals:**
- Fairness that can be explained in one sentence: "winner = uniform pick from the seed over the alphabetically sorted roster".
- Deterministic output that stays stable across Python versions and machines.
- A data-driven card deck, so new cards can be added without touching the solver.

**Non-Goals:**
- Any wording of the story. Cards carry facts and roles. Text comes from `add-story-director`.
- Visual decisions beyond emitting setting ids and a `dramatic` flag per beat.

## Decisions

### Deterministic random streams (HMAC-DRBG, not `random.Random`)
All randomness comes from `Stream(label)`. It generates bytes as `HMAC-SHA256(key=seed_bytes, msg=label || counter)` and draws integers by rejection sampling, so there is no modulo bias. Independent labels (`winner`, `houses`, `archetypes`, `plan`, `cast:<beat>`) mean that changing how archetypes are drawn cannot shift the winner. Alternative: `random.Random(seed)`. Rejected because the algorithms behind `shuffle` and `choice` are not a formal stability guarantee and every draw shares one stream.

### Winner first
`winner_index = Stream("winner").uniform_int(N)` over the canonical roster, which is sorted with `str.casefold`. The solver then builds a timeline around that fixed winner. Alternative: symmetric simulation, where the winner falls out of the story. Rejected because fairness would be hard to prove, and prophecies could not know the outcome.

### Seal of Fate
`seal = SHA-256(canonical_json({engine_version, seed, roster, old_king}))`, shown as hex. The stage displays a short form (first 12 hex characters in groups of 4) together with the full value in small print. Automatic seeds are 32 hex characters from `secrets.token_hex(16)`. Manual seeds are free text, used as given, and flagged as `seed_mode=manual` everywhere.

### Solver: plan, then cast, then validate
1. **Skeleton**: section beat counts from a template (cold open 1, Act I 5-6, Act II 8-10, Act III 3-4, coronation 1), picked by `plan`.
2. **Elimination plan**: Act III removes `k-1`, where `k` (2 or 3) is the number of contenders. Acts I and II remove `N-k`, plus one if a resurrection is planned. The planner selects crowd cards (sizes 2-6) until the remaining single-elimination count fits the free slots, then fills the rest with drama cards (prophecy, alliance, near miss, wound, decree, dragon egg).
3. **Casting**: walk the beats in order with a state of who is alive, alliances, contracts and wounds. For each card, sample role holders that satisfy its preconditions from the `cast:<i>` stream. The winner is never chosen as a victim, except as the target of a failed attempt or as the resurrected character.
4. **Validation**: a separate `validate(script)` checks every spec invariant. If it fails, the solver retries with the attempt number appended to the stream labels, which keeps it deterministic. Tests reuse the same validator.

### Card definitions
Each card is declarative: `id`, `kind` (`single | crowd | drama | structural`), allowed sections, roles, a precondition predicate, an effect function, `base_seconds`, allowed `setting` ids, a `dramatic` flag (used later to trigger panel-break staging) and an optional `mode` (killed, forfeited or exiled). Setting ids form a fixed catalog that the scenery change renders: `throne_room, feast_hall, battlefield, ice_wall, forest, dungeon, harbor, city_streets, temple, bridge`.

### Pacing
Budget starts at `base_seconds` per card (for example single 30, crowd 40, drama 22, cold open 50, coronation 45). The totals are then scaled linearly so the sum lands at 600 s, clamped to 540-660. The story director treats the budget as the size of the scene. The stage treats it as a target, not a hard cut.

### Prophecy hints
After casting, the engine derives true facts about the winner's path: `betrayed`, `resurrected`, `house:<id>`, `final_rival_archetype`, `survived_crowd:<card>` and similar. It writes 2-3 of them, chosen from `plan`, into the Act I prophecy beat. Because the timeline is already complete, the hints are true by construction.

### Houses, archetypes, NPCs
Houses are a shuffled round-robin over the canonical roster from `houses`, with names and sigils drawn from a fixed catalog (Wolf, Eel, Goat, Raven, Boar, Stag, Owl, Crab). Archetypes are drawn independently per canonical position from `archetypes`. NPC count is 3 for N ≤ 8, 2 for 9-14 and 0 above that, with roles adviser, guard, food taster, herald and jester.

### API and CLI
- `GET /api/shows/{id}/fate` returns `FateScript` (no seed).
- `POST /api/shows/{id}/reveal` returns `{seed, seed_mode, engine_version, seal}`.
- `python -m bottle_throne verify --seed S --roster file.txt [--old-king NAME] [--engine fate-1]` prints the seal and the winner.

The fate script is generated at session creation and cached in the session.

## Risks / Trade-offs

- [The presenter could try seeds until a favourite wins] -> Automatic seeds are generated server-side only at START. Manual seeds are visibly badged on stage and in the comic. Accepted residual risk for an office raffle.
- [The fate script in browser memory exposes the winner to someone opening devtools] -> Accepted. The front end never renders spoilers, and only the presenter has the laptop.
- [Engine changes alter old results] -> `engine_version` is part of the seal. Verifying an old show requires the matching version, so tag releases.
- [Solver retries for edge rosters (3, 40)] -> Property tests cover every N from 3 to 40 with many seeds, and retry count is capped with a test asserting it stays under the cap.
