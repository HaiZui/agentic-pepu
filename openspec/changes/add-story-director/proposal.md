# Proposal

## Why

The fate script decides what happens, but nobody wants to watch a list of beats. LLM agents on the team's Azure Foundry deployment should turn each beat into a short, dramatic, funny scene. The scenes should have in-character dialogue, comic-style captions, sound cues and panel moments. The LLM must never change the outcome, and the show must not stall on a slow network or a content-filtered reply.

Depends on: `add-app-foundation` (config, sessions) and `add-fate-engine` (fate script).

## What Changes

- Add a Foundry LLM client configured from `FOUNDRY_API_KEY`, `FOUNDRY_API_ENDPOINT` and `FOUNDRY_LLM_DEPLOYMENT_NAME`, plus a connectivity check command.
- Add three narrative agents:
  - **Director**: reads the whole fate script once and writes the show bible (title, prophecy wording, motifs, per-beat synopsis, foreshadowing).
  - **Voices**: writes each scene's dialogue in character, from archetype, house and history.
  - **Chronicler**: writes captions, act titles, the epilogue and comic cover text.
- Add the **scene script contract**, the single source for the live stage and the comic: setting, mood or music id, ordered lines (speaker, emotion, action, text), SFX cues from a fixed catalog, captions, onomatopoeia, and 3-6 panel moments with framing.
- Validate every scene against its beat: speakers exist in the cast, eliminations match, nobody returns from death. Retry once, then fall back to a **template scene** generated without the LLM.
- **Pre-generate all scenes** in parallel as soon as the show is created, with progress the stage can wait on.
- English dialogue with Finnish names kept exactly as written. Tone is theatrical PG-13 with no remarks about real people's traits.

## Capabilities

### New Capabilities
- `story-generation`: Turning the fate script into validated scene scripts through LLM agents, including the scene script contract, the cue, emotion and framing catalogs, pre-generation and progress, tone and safety rules, and template fallbacks.

### Modified Capabilities
<!-- None. -->

## Impact

- New dependency: the `openai` Python SDK, used against the Azure Foundry endpoint. Outbound HTTPS to Foundry from the backend only.
- New endpoints for scene scripts and generation progress.
- New CLI subcommand `python -m bottle_throne llm-check`.
- The development chronicle view gains the dialogue text, so the story can be read before any visuals exist.
- Cost: about 25 LLM calls per show.
