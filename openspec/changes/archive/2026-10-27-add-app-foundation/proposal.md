# Proposal

## Why

"The Bottle Throne" is a visual novel raffle for the Friday bottle. The presenter runs it on a laptop and projects it as a ten-minute paper-puppet show in which participants fight for the throne. The repository is empty apart from the OpenSpec scaffolding. Every later change (fate engine, story director, puppets, stage, audio, comic) needs a runnable application shell, safe handling of the Foundry credentials, and a way to enter who is taking part.

This is the first of seven changes:

`add-app-foundation` -> `add-fate-engine` -> `add-story-director` -> `add-puppet-renderer` -> `add-live-stage` -> `add-show-audio` -> `add-comic-export`

## What Changes

- Add a local application that runs on the presenter's laptop. A Python web backend serves a browser front end. One command starts it on Windows.
- Load `FOUNDRY_API_KEY`, `FOUNDRY_API_ENDPOINT` and `FOUNDRY_LLM_DEPLOYMENT_NAME` from `.env` on the server only. Report missing configuration clearly and never send secrets to the browser.
- Add the setup screen with these inputs:
  - a participants list, one name per line;
  - an optional Old King (last week's winner);
  - an automatic seed, or a manual seed for replay or verification.
- The setup screen validates the roster: 3-40 names, unique names, sensible name lengths.
- The START action creates a show session on the backend. Later changes attach the fate timeline, scenes and stage to that session.
- Add the build, test and type-sharing tooling (backend tests, front-end tests, typed API contract) that the later changes rely on.
- Ignore generated output (`output/`) and build artifacts in git.

## Capabilities

### New Capabilities
- `app-runtime`: Starting, configuring and serving the local application, including secret handling, localhost-only binding and configuration health reporting.
- `show-setup`: The presenter-facing setup screen and the roster/show-session input contract: participants, Old King, seed, validation and START.

### Modified Capabilities
<!-- None: greenfield project. -->

## Impact

- New Python package (backend) and a new web front end in the repository; new Python and npm dependencies.
- New local HTTP API under `/api/*`, bound to localhost.
- `.gitignore` gains build outputs and the `output/` folder.
- No external systems are called by this change. Foundry is only configured, not used yet.
