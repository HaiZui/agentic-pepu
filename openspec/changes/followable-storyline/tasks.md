# Tasks

## 1. Storyline core (deterministic, backend)

- [x] 1.1 Add `story/causes.py` with a statement template for every card id and an announcement template for every elimination card, including the `poisoner_drank`, `yielded` and `attempt_failed` variants. Verify with a test that every id in `fate.cards.CARDS` has an entry and that rendering uses names exactly as entered (including Finnish letters).
- [x] 1.2 Add the `Storyline` / `BeatStoryline` models in `models/story.py` and a pure `storyline(fate)` function. It computes `statement`, `announcements` (with a crowd summary), `survivors_before`/`survivors_after` (participants only), and the return announcement for resurrections. Verify with tests: counts drop to 1 at the coronation and equal the winner; NPC deaths leave the count unchanged; a resurrection raises the count; the Belzebub, Davido and Elite announcement scenarios from the survivor-tracker spec.
- [x] 1.3 Implement the bystander planner (design D3) inside `storyline()`. Verify with unit tests for the Albon and winner-per-act scenarios, plus a property test over `tests/fixtures/roster_cases.json` and random seeds. It must assert that the plan is complete, has at most 2 bystanders per scene, that no bystander is out of the contest, and that no bystanders are placed in the cold open or coronation.
- [x] 1.4 Add deterministic thread seeds (design D4: contract → strike, foiled knife → knife, wound → exit, death → return → fate, the winner's road). Verify with tests that every fate yields at least the winner's-road seed with 2 or more beats in ascending order.
- [x] 1.5 Compute the storyline at show creation, store it on the session, write it into `show.json`, and serve `GET /shows/{id}/storyline`. Verify with an API test in `tests/test_shows_api.py` and with `show.json` containing the storyline.

- [x] 1.6 Plan at most one ghost per show in the storyline (design D3b) and include it in `BeatStory`. Verify with tests for the "ghost watches the killer fall" and "no qualifying pair" scenarios, and a property test that at most one beat has a ghost and that the ghost is out of the contest in that beat.

## 2. Model inputs and the Director

- [x] 2.1 Replace `outline()` and the raw role codes in `beat_facts()` with storyline statements. Verify with a test that the Director and scene payloads for a `poisoner_drank` beat state the poisoner, the intended victim and that the poisoner drank.
- [x] 2.2 Fix `persona_cards()` so that a participant resurrected in the current beat gets the status "returning to life in this beat". Add bystander persona cards marked "in the contest, no role, must not leave". Verify with tests in `tests/story/`.
- [x] 2.3 Extend `ShowBible` with `threads`, `motivations` and `exit_reasons`. Write the `director-3` prompt, which receives statements, the bystander plan and thread seeds. Implement the repair rules from design D4. Verify with tests: missing exit reasons are filled; invalid thread beats are dropped; an empty thread list falls back to the winner's-road seed; the prophecy still names no one.
- [x] 2.4 Update `fallback_bible()` to build threads from seeds and exit reasons from statements. Verify with the "Fallback bible still explains exits" scenario test.

## 3. Scenes: payload, prompt, validation, fallback

- [x] 3.1 Extend `voices_payload()` with `story_so_far` (every earlier beat in order, per the spec), the threads touching the beat, `still_in_contest`, `bystanders` and the beat's exit reasons. Count bystander lines in the line-budget note. Verify with a payload test for beat 15 of a fixture fate.
- [x] 3.2 Write the `voices-6` prompt: rules for bystanders and ghosts, naming the eliminated, staging the risen as alive with `enter`, and bystander lines under 60 characters. Verify that the prompt version is recorded on generated scenes.
- [x] 3.3 Add the validation error kinds `missing_bystander`, `too_many_bystanders`, `bystander_leaves`, `unnamed_elimination`, `risen_as_ghost`, `too_many_ghosts` and `ghost_action`, and update the `dead_speaker` logic to match the modified "Valid speakers" requirement. Verify with one test per scenario in the story-generation delta, in `tests/story/test_scene_validator.py`.
- [x] 3.4 Update the fallback scene templates: insert a template line for each planned bystander, and make sure single-elimination variants name the eliminated character. Verify that the existing "fallback always validates" tests pass for all cards and are extended with bystander, resurrection and naming cases.
- [x] 3.5 Add retry hints for the new error kinds in `retry_hint_for()`. Verify with a test that a `missing_bystander` rejection produces a hint naming the missing bystander.

- [x] 3.6 Restrict each scene's schema to the beat's cast (narrator, role holders, planned bystanders, planned ghost), give the Director and Voices the ghost plan, replace the free ghost rules with `unplanned_ghost`, `missing_ghost` and `unannounced_ghost`, and add a ghost line to fallback scenes of the ghost's beat. Verify with tests for the "Scene cast" and "Ghost rules" scenarios and the fallback-validates tests.

## 4. API contract

- [x] 4.1 Regenerate `web/src/api/openapi.json` and the generated web types for `/storyline` and the extended `ShowBible`. Verify that `tests/test_openapi_contract.py` and `web/scripts/gen-api.test.ts` pass.

## 5. Stage

- [x] 5.1 Load the storyline in the show client alongside the fate. Verify with a unit test that the program has the storyline before the cold open ends.
- [x] 5.2 Add the survivor tracker overlay (design D7): it appears at the end of the roll call, is at most 12 % of the height, groups participants by house, uses a compact mode above 16 participants, shows the count, and excludes its area from bubble placement. Verify with unit tests for the layout at 3, 8, 16 and 40 participants, and with a Playwright screenshot check that no bubble overlaps the tracker.
- [x] 5.3 Emit `stamp` steps in `compileBeat()` after the leaving action, or at the end of the beat for unstaged eliminations; hold them at least 2.5 s at 1x; update the tracker in the step's state mutation; emit a return stamp after the risen character's `enter`. Verify with `compiler.test.ts` cases for a single elimination, an unstaged elimination and a resurrection.
- [x] 5.4 Show each tile's announcement in the crowd montage, followed by a summary frame, and update the tracker after the summary. Verify with a compiler/montage unit test for a four-victim plague.
- [x] 5.5 Add the ghost label "Ghost of {name}" when a speaker who is out speaks with the `dead` emotion. Verify with a unit test and an e2e assertion in `web/e2e/show.spec.ts`.

## 6. Comic

- [x] 6.1 Reserve a survivor-strip band on every scene page in `comic/plan.ts` and render it in `render.ts`. Verify with `plan.test.ts`: the strip is present on every scene page, and page counts stay between 16 and 32 for roster fixtures 3 to 40.
- [x] 6.2 Render the elimination and return stamps on the elimination panel, or on the page's last panel; show tile announcements in montages; label ghost panels. Extend `verify.ts` so that stamp text equals the storyline text. Verify with `verify.test.ts` and `web/e2e/comic.spec.ts`.

## 7. Integration and evaluation

- [x] 7.1 Generate shows for the two saved rosters (8 and 16 participants) with fixed seeds against Foundry, and read the transcripts. Verify that every participant appears before their exit, that no poisoner or victim is swapped, that every exit has a stamp, and that the tracker reaches 1 at the coronation. Record the fallback rate per error kind and compare it with the current prompts.
- [x] 7.2 Run the full backend (`pytest`) and web (unit and Playwright) suites. Verify that both pass.
- [x] 7.3 Update `README.md` to describe the survivor tracker, the stamps, and how resurrections and ghosts appear. Verify that the README section matches the behaviour in the specs.
