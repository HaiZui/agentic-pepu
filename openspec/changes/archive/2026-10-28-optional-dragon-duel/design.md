# Design

## Context

See [proposal.md](proposal.md) for motivation and [dragon-encounters](specs/dragon-encounters/spec.md) for the behavior contract.

The planner already allocates drama, single-elimination, crowd, and structural slots. The solver protects the winner and contenders, passes forced victims into cards, and scales existing beats to 600 seconds. Dragon Egg immunity is checked through the timeline state. `Beat` already exposes extensible card ids, roles, and string facts.

Narration uses shared role-aware wording in `story/causes.py`; storyline announcements and fallback scenes consume those facts. The scene validator checks allowed cast, elimination actions, names, and reading time. The dragon is not currently a character or visual actor.

The frontend compiles scenes into restorable `StageState` snapshots. Dramatic panels and printed comic art share `panelArt`, but `comic/content.ts` independently assembles panel shots from compiler snapshots. Both paths must carry encounter state, not just the live renderer.

## Goals / Non-Goals

**Goals:**
- Keep encounter selection entirely inside deterministic fate generation.
- Separate creature visuals from participant identity, survival, and speaking roles.
- Share encounter interpretation and rendering across playback and print.
- Fit existing offline behavior, budgets, catalogs, and control semantics.

**Non-Goals:**
- A creature combat simulator, additional combatants, dragon dialogue, or persistent creature lifecycle across beats.
- A new scene authoring format, setting, user preference, or external art/audio service.
- Reproducing old engine timelines with the new engine implementation.

## Decisions

### 1. Reserve at most one existing eligible slot

Use a dedicated seeded encounter-selection stream within each solver attempt. Proposed tuning default: a one-in-three admission gate, followed by selection of at most one eligible Act I/II slot. This is an admission rule, not a promised final frequency: slot eligibility and solver retries affect distribution.

Eligible slots are drama slots for victory and lethal single-elimination slots for defeat. Exclude designated non-lethal slots and all structural, crowd, and Act III slots. Do not insert slots, move the final duel, or increase elimination counts. For a selected slot, attempt the appropriate dragon card using the ordinary cast context; if it cannot cast, retain normal candidate fallback and do not try a second encounter later in that attempt.

Keep the reservation local to one solver attempt and validate the final script's zero-or-one invariant. Selecting the outcome category by available slot avoids a late coin flip that would invalidate the elimination plan. Tiny rosters can legitimately permit only victory encounters in some plans.

Alternative: independently roll survival after a scene is chosen. Rejected because this can kill a protected winner or leave the wrong number of final contenders. Adding both cards to every ordinary weighted pool was also rejected because it weakens the optional-per-show bound and makes frequency harder to reason about.

### 2. Two cards, one fixed defeat variant

Add a drama card `dragon_victory` and a lethal single card `dragon_defeat`, using existing suitable settings such as forest and battlefield. Both cast a single participant role `hero`.

Victory chooses from living participants without limiting selection to the eventual winner. Defeat uses `victim_pool()` unchanged, including forced-victim and immunity behavior. The defeat card chooses one seeded fact, `dragon_slaying` or `sword_accident`. Victory is identified by its card id. Validation requires the exact role/fact/elimination combination, valid section, living participant hero, and at most one duel.

The dragon is a beat-local creature, not a `Character`. It creates no unknown role reference, roster entry, extra-slot dependency, alliance, resurrection, ghost, or tracker entry. Ordinary participant eliminations remain the only death-related state effect.

Alternative: add a dragon NPC and kill it through normal eliminations. Rejected because NPC counts, humanoid puppets, valid speakers, and generic OUT stamps would then need unrelated exceptions.

### 3. Shared outcome wording and bounded scene validation

Extend `story/causes.py` variant selection for the two defeat facts and provide explicit victory and defeat statements. Reuse those statements for bible/context requests, exit causes, and fallback scenes; do not designate the dragon as a participant responsible for ghost planning. A sword accident has no character killer.

Require an outcome-specific canonical resolution caption in duel scenes, supplied in the prompt and validated against beat facts. Use that caption's position as the visual resolution anchor; check that required hero actions agree with the outcome, and reject recognizable opposite-outcome claims or extra participant deaths through focused text checks plus existing validation. Do not treat prose heuristics as exhaustive semantic proof; deterministic result captions, actions, and creature state are authoritative.

Fallbacks cover all three variants, include the required caption and hero name, preserve planned spectator lines, and use existing 3-to-6 panel and reading-time limits. Victory requires no elimination action. Defeat requires the hero's `fall`; sword-accident narration describes an accidental trip without gore or realistic injury detail.

Alternative: let a model describe any resolution and infer it from prose on the client. Rejected because the story and rendered result could disagree, especially after fallback or retry.

### 4. Explicit encounter state, not a disguised humanoid actor

Add a small internal encounter descriptor to `StageState` and `PanelShot`: hero id, outcome, and phase (confrontation or resolved). Centralize interpretation of the backend card/facts in one typed frontend helper. Unknown or invalid duel facts must surface an explicit diagnostic rather than silently render victory.

Compiler snapshots start the encounter when the beat begins, resolve it at the validated resolution caption, and clear it before the next beat. Deep-copy the descriptor with other mutable state. A pending scene may establish the creature but must not prematurely display the outcome. State restoration rebuilds the exact phase without replaying effects.

Provide one SVG cut-paper dragon renderer with threatening and defeated poses, composed using the existing palette/defs style. Place it in a dedicated creature group rather than `CastSheet`, `onStage`, or participant blocking. Reserve space opposite the hero. Use encounter-aware wide establishing/resolution framing so the dragon and hero are both legible; ordinary dialogue close-ups can still focus on the hero. A fatal resolution retains a non-slain dragon and shows the hero's existing fall action. Since leaving actions remove actors from `onStage`, preserve a resolved fallen-hero tableau through the encounter descriptor for panel art and restoration; do not re-add that hero to the alive cast. Require the fatal resolution caption after the fall-bearing line so the result cannot visually land before the death action.

Wire the descriptor into the live renderer, compiler-generated dramatic shots, and `comic/content.ts` shot construction. `panelArt` renders the same creature at the recorded phase, preserving print vectorization. The comic must include confrontation and resolution panels even when ordinary model panel choices would omit them; enforce suitable anchors in scene validation/fallback rather than adding panels beyond the limit.

Alternative: paint a dragon into forest scenery. Rejected because scenery alone cannot represent beat-specific presence, defeated state, or correct restoration without leaking into other forest scenes.

### 5. Existing cues and controls

Use `dragon_roar`, `sword_draw`, `sword_clash`, `thud`, and, where appropriate, `fire_whoosh` from the existing catalog. Schedule them through scene cues and current audio playback infrastructure. Creature animation follows the same GSAP timing and reduced-motion behavior as the stage; state snapshots, not animation callbacks, decide the result.

### 6. Versioned generation without public schema expansion

Bump `ENGINE_VERSION` from `fate-1` to `fate-2`, since new cards and random decisions change generated timelines. Update the CLI verification default to the shared version constant rather than its existing hard-coded `fate-1`; retain its explicit unsupported-version error and checkout guidance. Winner selection's seed stream and canonical-roster algorithm remain unchanged.

The public API continues to use existing card, role, and fact fields. Internal TypeScript scene-state types change, but no public dragon speaker/action/setting enum is needed. OpenAPI generation should remain unchanged; verify rather than hand-edit generated files.

## Risks / Trade-offs

- Optional selection can be accidentally conditioned on solver success -> test broad seed samples for encounter/no-encounter reachability, both cards, both defeat variants, and non-winner victories; do not promise an exact frequency.
- Existing generic death-word checks can confuse a slain dragon with a dead hero -> add creature-aware victory fixtures and focused validation tests without weakening unrelated participant-death checks.
- Panels or camera crops can hide the dragon -> require confrontation/resolution anchors and validate actual wide and portrait comic panel layouts.
- Compiled steps and comic shot construction can diverge -> carry the same encounter descriptor from snapshots and compare both outputs in fixtures.
- Long names and spectator lines can exceed the scene budget -> test each fallback variant with planned bystanders/ghosts and existing length limits.
- Egg protection is transient -> test eligibility at the duel beat, not merely whether an egg appeared earlier.
- New version changes the seal and generated story for the same seed -> publish version metadata and document old-release verification rather than claiming cross-version timeline identity.

## Migration Plan

1. Implement and test fate generation and narration first, then shared rendering and state propagation.
2. Deploy backend and frontend together; no database or participant-data migration is required.
3. Keep existing session artifacts unchanged. New shows use `fate-2`; old scripts without encounter cards render without creature state.
4. Roll back backend and frontend together if needed. Use the matching prior release for old-version replay; do not relabel an already generated script with another engine version.
5. Update README with optionality, outcome variants, fairness, and replay-version behavior.
