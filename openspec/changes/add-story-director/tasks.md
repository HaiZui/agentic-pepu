# Tasks

## 1. Foundry client

- [ ] 1.1 Add the `openai` dependency and implement the async client factory (v1 base URL normalization, optional `FOUNDRY_API_VERSION` path, 45 s timeout, key masked). Verify with pytest using a mocked transport for both endpoint forms.
- [ ] 1.2 Implement `python -m bottle_throne llm-check`, which categorizes failures (config, auth, deployment not found, network, timeout) and detects strict JSON schema support. Verify against the real `.env` deployment and with a deliberately wrong deployment name.

## 2. Contracts and catalogs

- [ ] 2.1 Define the catalogs (emotions, actions, SFX cues, music moods, framings, settings re-exported, reading-time constants) and `GET /api/catalog`. Verify with a pytest check of the response and the generated TS types compiling.
- [ ] 2.2 Define Pydantic `ShowBible`, `SceneScript` (setting, music, lines, captions, onomatopoeia, cues, panel moments, `is_fallback`, prompt version) and `ChronicleTexts`. Verify that the OpenAPI types regenerate and the stale-type test passes.
- [ ] 2.3 Implement the scene validator (catalog membership, speakers alive or ghost, elimination markers, no extra eliminations, death-word heuristic, 3-6 panel moments with valid refs, a 140-character line limit, reading time ≤ budget +15%). Verify with pytest fixtures that each rule rejects a crafted bad scene.

## 3. Template fallbacks

- [ ] 3.1 Write 2-4 fallback skeletons per card id with deterministic variant selection. Verify with a pytest check that, for every card and every variant, generated fallbacks pass the scene validator on fate scripts for N=3, 6, 15 and 40.
- [ ] 3.2 Generate fallback chronicle texts (act titles, epilogue ≤120 words, cover title, blurb). Verify with pytest for word count and that the winner is named.

## 4. Agents

- [ ] 4.1 Write the prompt files (style guide, director, voices, chronicler) with version ids. Verify by reviewing three generated sample shows in the chronicle view for tone, English, exact Finnish names and no claims about real people.
- [ ] 4.2 Implement the Director call that produces the `ShowBible`, including prophecy wording from the hints. Verify with pytest (mocked model) and one live run via the chronicle view.
- [ ] 4.3 Implement the Voices call per beat with persona cards derived from the fate script history. Verify with pytest (mocked) that the request contains only names, archetypes, houses, beat facts and the bible.
- [ ] 4.4 Implement the Chronicler call, checking that the coronation scene references the prophecy. Verify with pytest (mocked) and a validator rule for the coronation prophecy reference.

## 5. Orchestration and delivery

- [ ] 5.1 Implement the generation scheduler (bible first, semaphore 4, beat order, retry once with a "lighter/shorter" hint, then fallback; incomplete config means all fallbacks) and immutable caching. Verify with pytest using a mocked model that times out, filters and returns invalid JSON.
- [ ] 5.2 Add the SSE progress endpoint `GET /api/shows/{id}/events` and `GET /api/shows/{id}/scenes/{beat}`. Verify with a pytest client that receives per-beat events and a completion event, and that repeat fetches are identical.
- [ ] 5.3 Extend the chronicle view with dialogue, captions, cues and fallback badges plus live progress. Verify in the browser with a real Foundry run and with Foundry variables removed.

## Workflow follow-up

- Archive after review so `story-generation` is a main spec before `add-live-stage` and `add-comic-export` are applied.
