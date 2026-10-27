# Tasks

## 1. Randomness, fairness and the seal

- [x] 1.1 Implement `Stream(seed, label)` (HMAC-SHA256 counter DRBG with rejection-sampled `uniform_int`, `shuffle` and `choice`). Verify with pytest using fixed known-answer vectors and an independence check across labels.
- [x] 1.2 Implement canonical roster ordering (casefold sort) and automatic seed generation (`secrets.token_hex(16)`) in session creation. Verify with pytest that entry order does not change canonical order.
- [x] 1.3 Implement winner selection and the Seal of Fate hash with `engine_version = "fate-1"`. Verify with pytest: determinism, a chi-square uniformity check over 20,000 seeds for N=15 (p > 0.001), and no advantage for an Old King who also competes.

## 2. Cards and state model

- [x] 2.1 Define the Pydantic `FateScript` contract (characters, houses, archetypes, NPCs, Old King, beats with section, card, setting, roles, eliminations with mode, resurrection, prophecy hints, `budget_seconds`, `dramatic`, seal; no seed). Verify that the generated OpenAPI type compiles in `web/`.
- [x] 2.2 Implement the timeline state (alive set, alliances, contracts, wounds, dragon-egg immunity) and the declarative card registry with the setting catalog. Verify with unit tests for each card's precondition and effect.
- [x] 2.3 Add the character cards (alliance, knife in the back with a failed-attempt variant, trial by combat, poisoned goblet, grey cloak, faceless contract over two beats, dragon egg, Red Priestess, Old King's gambit, Iron Vault debt). Verify with per-card unit tests.
- [x] 2.4 Add the crowd cards (Grey Plague, Muddy Field battle, Crimson Feast, Wildfire, March of the Pale Ones, Bridge Gives Way, Grey Cloak mutiny, Kingsmoot Exile) and the drama cards (prophecy, near miss, wound, decree). Verify with per-card unit tests.

## 3. Solver

- [x] 3.1 Implement the houses (size bands, balanced), archetype and NPC assignment from independent streams. Verify with pytest for the band table and for archetypes being independent of name.
- [x] 3.2 Implement the skeleton and elimination planner (crowd sizing, resurrection planning for N≥6, k=2 or 3 Act III contenders). Verify with pytest that eliminations sum to N-1 (+1 with resurrection) for N=3..40.
- [x] 3.3 Implement casting with winner protection and the deterministic retry loop. Verify with pytest that the retry count stays under the cap for N=3..40 × 200 seeds.
- [x] 3.4 Implement `validate(script)` covering every spec invariant (section order, preconditions, no acting after elimination, single survivor = winner = crowned, Act III 2-3 contenders with no crowd events, a non-lethal exit for N≥6, resurrection limits, Old King appearances, NPCs for N≤14). Verify with pytest using hand-built invalid scripts that each fail for the expected reason.
- [x] 3.5 Implement the pacing budget scaling and prophecy hint derivation. Verify with a property test: N=3..40 × 500 seeds all pass `validate`, the total budget is 540-660 s, beats number 16-24, and the prophecy hints are true.

## 4. Delivery and verification

- [x] 4.1 Generate and cache the fate script at session creation, and add `GET /api/shows/{id}/fate` and `POST /api/shows/{id}/reveal`. Verify with pytest that the fate response has no seed and that the reveal reproduces the seal.
- [x] 4.2 Add `python -m bottle_throne verify` and document it in `README.md`. Verify that its output matches a show created through the API with the same inputs.
- [x] 4.3 Show the Seal of Fate on the show placeholder and add the development chronicle view `/show/{id}/chronicle` (text list of beats, roles, eliminations, budgets). Verify in the browser for N=6, 15 and 40.

## Workflow follow-up

- Archive after review so `fate-engine` is a main spec before `add-story-director` is applied.
