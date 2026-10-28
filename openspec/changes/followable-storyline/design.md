# Design

## Context

See proposal.md (Why). Relevant current state:

- Generation order is bible first, then all scenes concurrently (bounded at 4), then the chronicle. A scene cannot read earlier generated scenes. Continuity can only come from inputs available before scene generation: the fate script and the bible.
- `story/context.py` builds model inputs. `outline()` drops roles and facts, which causes the swapped poisoner and victim. `beat_facts()` passes raw role codes such as `poisoner`, `intended` and `poisoner_drank`. `persona_cards()` computes status from the beats *before* the current one, so a character resurrected in this beat is described as a ghost.
- Validation (`story/validate.py`) already lets any dead character speak with the `dead` emotion, without limits.
- The stage compiler (`web/src/stage/compiler.ts`) already tracks `alive` per step and stages unstaged eliminations at the end of a beat. The comic is laid out in `web/src/comic/` and rendered headless from the same data.
- The fate script is sealed. Adding fields to it would change the seal, so derived data has to live outside it.

## Goals / Non-Goals

**Goals:**
- Compute every fact that must be correct (who is out, why in fixed words, who returns, who is still in, who must be introduced where) deterministically from the fate. The LLM only adds colour and connective tissue.
- Use one wording source for stage, comic and prompts.
- Keep scene generation concurrent.

**Non-Goals:**
- No changes to the fate engine, card selection, casting, seal or verification.
- No sequential scene-by-scene generation that feeds one scene's output into the next.
- No changes to the chronicler prompt or the epilogue rules.
- No visual redesign of figures. The ghost variant already exists.

## Decisions

### D1. A deterministic `Storyline` derived from the fate, served separately

A new pure function `storyline(fate) -> Storyline` is computed at show creation. For every beat it holds:
- `statement`: the plain-language, role-aware sentence ("Davido poisons a goblet meant for Caesar, then drinks it himself").
- `announcements`: elimination and return stamp texts, plus a crowd summary where it applies.
- `survivors_before` and `survivors_after`: participant ids.
- `bystanders`: the planned introductions (D3).
- `threads_hint`: deterministic thread seeds (D4).

It is served at `GET /shows/{id}/storyline`, included in the scene and bible prompts, and written to `show.json`.

- *Why not inside the FateScript?* Changing the sealed model changes the seal and the verification contract.
- *Why not attached to each SceneScript?* The tracker and stamps are needed before a scene is ready (interlude, comic plan), and the backend prompts need the data before any scene exists.
- *Why not computed in TypeScript?* Python needs the same wording for prompts and fallbacks, and two copies would drift.

### D2. One per-card wording table

`story/causes.py` holds a table keyed by card id, and by fact where needed (`poisoner_drank`, `yielded`, `attempt_failed`). Each entry gives the statement template and, for elimination cards, the announcement template, e.g. `"{fallen} is OUT, slain by {challenger} in Trial by Combat"`. A unit test checks that every card in `fate.cards.CARDS` has an entry, so adding a card without wording fails CI. Announcement mode words come from the elimination mode (slain / exiled / forfeited). NPC deaths (Food Taster) get a statement but no tracker change.

### D3. Introductions planned deterministically, not by the LLM

Planner rules, applied in beat order of elimination:
1. Candidates are participants eliminated alone who have no role in any beat between the cold open and their elimination beat.
2. Each candidate is placed as a bystander in an earlier scene. The scene must not be the cold open or the coronation, the candidate must be in the contest there, and the scene must hold fewer than 2 bystanders. Scenes that share a role holder with the elimination beat are preferred, because the Director can then link them; after that, the scene closest to two beats before the elimination; ties go to the lower beat index.
3. In each act where the winner has no role, the winner is placed in the act scene with free capacity closest to the act's middle.

There is no randomness, so the plan is reproducible from the fate. Asking the LLM to choose was rejected: it can't be validated cheaply, and it varies on retry.

### D3b. One planned ghost per show, and a per-scene cast

The first live evaluation (task 7.1) showed that the model kept giving lines to eliminated contestants, as if they were alive, even when told who was out. Prompting did not fix it, and 3-4 of 19 scenes fell back. Two deterministic rules replace the free-form ghost:
- The storyline plans at most one ghost: a contestant eliminated earlier whose responsible character (betrayer, challenger, poisoner, Faceless client, Old King, feast host) is eliminated in a later beat other than the coronation. The ghost appears in that later beat to watch. The earliest such beat wins; within one beat, the victim of the earliest exit (the longest-held grudge). This turns the ghost into a payoff the viewer can follow.
- Each scene's strict schema only accepts the narrator, role holders, planned bystanders and the planned ghost as speakers, actors and panel focus. Invented cameos and returning dead become impossible to generate, rather than merely invalid.

Rejected alternatives: prompt-only (measured: still failed); no AI ghosts at all (drops a twist the user wants to keep).

### D4. The Director writes the plan; the system seeds and repairs it

The Director (prompt `director-3`) receives the full role-aware timeline (statements, not the old outline), the bystander plan and thread seeds. Seeds come from the fate: contract → strike, foiled knife → knife, wound → later elimination of the wounded or the attacker, death → resurrection → later fate, the winner's road. Output adds `threads[{title, beats[], summary}]`, `motivations[{character, want}]` and `exit_reasons[{character, beat, reason}]`.

The result is repaired, not rejected. Missing exit reasons are filled from the D2 statement, thread beat indexes that don't exist are dropped, and threads with fewer than 2 beats are removed. If no threads survive, the winner's-road seed is used. This keeps the show from losing a whole bible to one bad field and satisfies the spec without a retry. The template bible (`fallback_bible`) is built from the same seeds and statements.

### D5. Scene requests carry recap, threads and roles

`voices_payload` gains:
- `story_so_far`: bible synopses for every beat `< index`, in order, as the spec requires. At about 20 beats of one sentence each this stays within a few hundred tokens.
- `threads`: only the threads touching this beat.
- `still_in_contest`: names.
- `bystanders`: persona cards marked "in the contest, no role in this event, must not leave".
- `exit_reasons` for this beat.

Persona status gains `"returning to life in this beat"` for the risen, which fixes the ghost bug. The prompt becomes `voices-6`. It replaces "use only the characters listed in this beat" with rules for bystanders and ghosts, and makes naming the eliminated mandatory.

### D6. Validation additions in `validate_scene`

New error kinds:
- `missing_bystander`: a planned bystander has no line.
- `too_many_bystanders`: more than 2 participants without a role speak.
- `bystander_leaves`: a bystander performs `fall`, `exit` or `enter`.
- `unnamed_elimination`: the beat has a single elimination and that character's name appears in no line or caption.
- `risen_as_ghost`.
- `unplanned_ghost`, `missing_ghost` and `unannounced_ghost` (design D3b).
- `ghost_action`.

These feed the existing single retry and fallback path. Fallback variants gain a bystander line template and are checked by the existing "fallback always validates" tests, extended to bystander and naming cases.

### D7. Stage: tracker overlay and stamp steps

- The tracker is a new persistent overlay strip along the top edge (at most 12 % of the height). It shows sigil and name chips grouped by house; above 16 participants they shrink to sigil and initials; the count is on the right.
- Speech-bubble layout treats the strip's rectangle as an exclusion zone. Bubbles that would overlap it are pushed below it.
- The compiler emits a new `stamp` step right after the leaving action of an eliminated character, or at the end of the beat for unstaged eliminations, which the compiler already handles. The step lasts at least 2.5 s at 1x, and its state mutation updates the tracker. Montage tiles render their announcement text, and the summary is shown as a final montage frame.
- Ghost label: when a line's speaker is not alive and the emotion is `dead`, the figure's name tag reads "Ghost of {name}". Return stamp: emitted after the `enter` of the risen character.

### D8. Comic: strip and stamps within the existing page budget

The plan reserves a fixed band at the bottom of each scene page for the survivor strip, so panel heights shrink slightly instead of adding pages. Stamps are rendered as stamp captions on the panel that shows the elimination action, or on the page's last panel when no such panel exists. `verify.ts` gains checks: strip present on every scene page, stamp text equal to storyline text, page count still 16–32 for roster fixtures 3–40.

## Risks / Trade-offs

- [Bystander lines push scenes over their time budget] → The budget note counts bystander lines; bystander lines are capped at 60 characters in the prompt; the retry hint names the budget. Fallback still guarantees a valid scene.
- [Not enough bystander slots for large rosters with many single eliminations late in the show] → A property test over `tests/fixtures/roster_cases.json` and random seeds asserts that the plan is complete. If it fails for real rosters, raise the cap only for scenes of 30 s or more, rather than weakening the spec.
- [Larger prompts raise latency and cost] → Keep synopses to one sentence; give each scene only the threads it touches; the bible grows by a few hundred tokens.
- [LLM invents motivations that clash with archetypes or real people] → Motivations are in-story wants derived from archetype and house only. The existing style-guide rules still apply, and nothing new about participants is sent.
- [More validation rules mean more fallbacks] → Track the fallback rate per error kind in the logs. Compare before and after on fixed seeds (tasks include an evaluation step).
- [Stamps feel repetitive over 7+ eliminations] → Fixed wording is the point (clarity), but stamp styling can vary by mode (killed / exiled / forfeited / returned).

## Migration Plan

- Additive API change: new `/storyline` endpoint and new optional fields on `ShowBible`. Regenerate `web/src/api/openapi.json` and the generated types, and update the OpenAPI contract test.
- Old `show.json` files without a storyline are not replayed, so no migration is needed.
- Rollback: revert the prompt versions and the frontend overlay. The fate and stored seeds are unaffected.

## Open Questions

- Final visual styling of the tracker chips and stamps (colours, typeface sizes): settle during implementation with screenshots.
- Exact announcement wording for each card: draft in D2's table and review once on a dry run.
