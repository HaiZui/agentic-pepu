# Proposal

## Why

The backend currently reports model usage and categorized failures but does not retain the prompts sent to Azure Foundry or the returned model output. A persistent local exchange log will make prompt debugging and investigation of rejected or unexpected responses possible after a show has finished.

## What Changes

- Record every outbound Foundry chat-completion attempt and its response in local SQLite tables, including compatibility retries, application retries, and connectivity checks.
- Store complete request messages and generation parameters, raw response bodies when available, timing, outcome, and correlation metadata. Capture output before SDK parsing can reject it.
- Enable logging by default with a configurable database path, persistent history, and no automatic retention deletion.
- Keep credentials out of the database and application logs; keep participant names and story text intact except for configured secret-value masking.
- Report database initialization or write failures through the existing application logger and continue model generation, as explicitly selected by the user.
- Document database location, schema, inspection queries, privacy implications, and manual cleanup.
- Out of scope: a logging UI or HTTP API, remote telemetry, prompt replay, automatic retention, logging template-only fallback content as model output, and changes to generation or retry behavior.

## Capabilities

### New Capabilities

- `model-exchange-logging`: Persistent, correlated SQLite records of Foundry request attempts, raw outputs, failures, and safe local operation.

### Modified Capabilities

None. Existing backend-only model access, credential protection, connectivity-check results, and story fallback requirements remain unchanged.

## Impact

- Backend: shared Foundry client construction and HTTP request/response boundary in `story/llm.py`, plus a focused SQLite logging module.
- Configuration: database path in `config.py`; local database and journal exclusions in `.gitignore`.
- Tests: SQLite storage tests and existing mocked Foundry, compatibility-retry, connectivity-check, and scheduler tests; test databases must be isolated under temporary directories.
- Documentation: README configuration and local inspection guidance.
- Dependencies and interfaces: use standard-library `sqlite3` and the existing HTTPX/OpenAI stack; no new package, browser contract, or public API is required.
