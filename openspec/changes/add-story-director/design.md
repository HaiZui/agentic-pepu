# Design

## Context

The fate script from `add-fate-engine` already fixes every outcome, setting, role, budget and prophecy hint. This change only produces words and staging hints. The deployment name, endpoint and key come from `config.py` in `add-app-foundation`. Requirements are in `specs/story-generation/spec.md`.

## Goals / Non-Goals

**Goals:**
- All scenes ready before Act I needs them, normally while the cold open plays (about 50 s).
- An LLM failure can never block or alter the show.
- One scene contract that both the live stage and the comic renderer consume.

**Non-Goals:**
- Speech synthesis. Narrated voice is a documented future option in `add-show-audio`.
- Images. All visuals are procedural (`add-puppet-renderer`).
- Streaming tokens to the screen. Scenes are shown only after validation.

## Decisions

### Client: OpenAI SDK against the Foundry v1 endpoint
Use the `openai` Python SDK (async). `FOUNDRY_API_ENDPOINT` is normalized to `<resource-root>/openai/v1/` and used as `base_url`, which works for Azure OpenAI and Foundry resources on the v1 API. If `llm-check` detects that the endpoint only serves the dated API, `FOUNDRY_API_VERSION` (optional, new) switches to `AzureOpenAI(azure_endpoint, api_version)`. Alternative: the `azure-ai-inference` SDK. Rejected because it is less mature for structured outputs.

### Structured output
Request `response_format={"type": "json_schema", "strict": true}` built from the Pydantic models. If the deployment rejects it, `llm-check` reports this and the client falls back to `json_object` mode plus Pydantic validation. Either way, Pydantic validation and the fidelity checks below are authoritative.

### Agents = specialized calls, not autonomous loops
```
 fate script --> [Director] --> show bible (1 call)
                     |
         +-----------+-----------+
         v                       v
   [Voices] x ~20 beats    [Chronicler] (1 call)
   one call per scene      act titles, epilogue,
   (all speakers' persona  cover title, blurb
    cards in one prompt)
```
Persona card: name, archetype, house, alive or ghost, alliances, grudges so far (derived from earlier beats in the fate script, not from earlier LLM output, so scenes can be generated in parallel). Alternative: one call per character per line. Rejected because it would mean about 120 calls, slow and incoherent. Alternative: one call for the whole show. Rejected because it is too long for reliable JSON and one failure would lose everything.

### Catalogs as code, published to the front end
`story/catalog.py` defines emotions (`neutral, smug, scheming, furious, terrified, grieving, triumphant, dead`), actions (`enter, exit, draw_weapon, strike, fall, kneel, drink, point, embrace, flee, crown`), SFX cues (`curtain, gong, sword_draw, sword_clash, shink, thud, crowd_gasp, crowd_cheer, thunder, wind, fire_whoosh, goblet_clink, gulp, bell_toll, horn, raven, splash, dragon_roar, heartbeat, choir`), music moods (`overture, intrigue, feast, battle, dread, winter, sorrow, triumph`) and framings (`wide, medium, close_up, extreme_close_up, over_shoulder, splash, montage`). Settings are reused from the fate engine. `GET /api/catalog` serves them together with the reading-time constants (base 1.2 s + 0.055 s per character at 1x), so the stage uses the same pacing formula.

### Fidelity validation (mechanical)
- Every eliminated character in the beat gets an elimination marker: action `fall` for killed, `exit` for forfeited or exiled.
- No `fall` or `exit` for anyone else, except NPC extras the beat lists.
- Speakers must be alive at that beat, ghosts are allowed only with emotion `dead`, and the narrator is always allowed.
- Panel moments must reference existing line or caption indices.

Free-text claims ("X dies") cannot be fully parsed. The prompt forbids them, and a light keyword check flags death words next to non-eliminated names for a retry.

### Scheduling
asyncio with a semaphore of 4 concurrent calls and a 45 s timeout per call. Order: bible first, then scenes in beat order, with the chronicle call queued after the bible. Progress is pushed over Server-Sent Events at `GET /api/shows/{id}/events`. Scenes are cached in the session once accepted, so the comic reads the same objects.

### Template fallbacks
Each card id has 2-4 templated scene skeletons with `{actor}`, `{target}` and `{house}` slots, catalog cues and fixed panel moments. Variant choice uses the fate engine's `Stream("fallback:<beat>")`, so fallbacks are varied and deterministic. Fallbacks pass the same validator, which a test enforces for every card.

### Prompts
Prompts are stored as versioned text files in `story/prompts/` (director, voices, chronicler, plus a shared style guide covering tone, PG-13, English, exact names, no real-person traits, comic diction). Prompt version is recorded on each scene for debugging.

## Risks / Trade-offs

- [The content filter flags theatrical violence] -> Style guide favours stylized and comedic deaths ("the rod snaps", "exits, pursued by a goat"), the retry adds a "keep it lighter" instruction, and the template fallback is the last resort.
- [The deployment does not support strict JSON schema] -> Fall back to json_object with validation and one retry. `llm-check` reports which mode is active.
- [Latency exceeds the cold open] -> The stage waits behind a curtain interlude (`add-live-stage`). Typical case is about 20 calls with concurrency 4 at 5-15 s each, finishing in about 60 s.
- [Cost] -> About 23 calls per show with small prompts, which is negligible. Tokens are logged per show.
