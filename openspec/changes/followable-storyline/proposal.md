# Proposal

## Why

Test shows play as a string of disconnected sketches. Viewers cannot follow who is still in the game, why anyone leaves, or how the roll call of contestants turns into one new monarch. Example: in the 8-player test run, two of the three poisonings were staged with poisoner and victim swapped, and one contestant first appeared in the scene where he died. In the 16-player run, 7 of the 16 contestants appeared only in the beat that eliminated them. A resurrection was staged as a ghost, so the twist was unreadable. The fate is already decided and sound. The story layer loses information and has no continuity, and the stage never shows the running state of the contest.

## What Changes

- The Director and Voices receive complete, plain-English beat facts. These are role-aware descriptions of what happens, who does it to whom and how, including facts such as "the poisoner drank their own cup". This replaces the role-less outline, which let the model invert who did what.
- The show bible becomes a story plan, not only a list of synopses. It adds story threads that link setups to their payoffs across beats, a stated reason for every elimination, a short motivation for every contestant, and an introduction plan. The plan ensures that every contestant who has no earlier role appears on stage before the beat that eliminates them.
- Every scene receives an accumulating "story so far" recap and the threads it advances, so consecutive scenes read as one continuing plot.
- Contestants who are still in the game may appear as brief bystanders in scenes where the fate gives them no role. Eliminated contestants never appear this way.
- Each elimination and resurrection is announced on stage by a fixed stamp built from the fate script, not by the LLM. It names who is out or who returns, and how and by whom where the fate says so.
- A survivor tracker on stage shows who is still in the contest throughout the show, with a running count from the full roster down to the winner. The comic shows the same state on its scene pages.
- Resurrection is staged as a return to life and is clearly announced. Ghosts become an explicit, labelled device: a ghost stays out of the contest and cannot affect the plot.
- Fixes a bug where a character being resurrected was described to the model as a ghost.
- Template fallback scenes keep working under the new rules and also show stamps and the tracker.

The fate engine, the Seal of Fate and verification are unchanged.

## Capabilities

### New Capabilities

- `survivor-tracker`: the running record of who is still in the contest, derived from the fate script and shown on stage and in the comic. It covers the elimination and return announcements (stamps) and the count from roll call to coronation.

### Modified Capabilities

- `story-generation`: the show bible becomes a story plan (threads, elimination reasons, motivations, introductions). Scene requests carry role-aware facts and a recap. Bystander appearances are allowed for living contestants. Resurrection and ghost rules are made explicit. New validation covers bystanders and naming the eliminated.
- `live-stage`: the stage shows the survivor tracker and the elimination and return stamps, and stages resurrections and ghosts distinctly.
- `comic-export`: scene pages carry the survivor state and the elimination and return stamps, so the comic is as followable as the stage.

## Impact

- Backend: `src/bottle_throne/story/` (context building, agents, prompts `director`, `voices`, `chronicler`, validation, fallback) and `src/bottle_throne/models/story.py` (`ShowBible` gains plan fields). New prompt versions (director-3, voices-6).
- API: the show bible and scene payloads gain fields. The OpenAPI contract and the generated web types (`web/src/api`) are regenerated.
- Frontend: `web/src/stage/` (tracker overlay, stamps, ghost and return staging) and `web/src/comic/` (tracker strip and stamps on scene pages).
- Token use per show rises moderately, because the bible request is larger and so is each scene request.
- No change to `src/bottle_throne/fate/`, the seal, fairness or the verification CLI. If testing shows that story-layer continuity is not enough for large rosters, continuity-aware casting in the fate engine would be a separate follow-up change.
