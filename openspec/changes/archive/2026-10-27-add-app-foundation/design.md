# Design

## Context

The repository has no code yet. It has a Python 3.14 virtual environment (`.venv`), Node.js 24 on the presenter's Windows laptop, and a `.env` containing the three Foundry variables. `.gitignore` only ignores `.env`. The app runs locally on the presenter's laptop, and the internet is used only for Foundry. This change sets the architecture that the six follow-up changes build on (see proposal.md).

## Goals / Non-Goals

**Goals:**
- A repository layout and toolchain that every later change can extend without restructuring it.
- A typed API contract shared between backend and front end, so the scene and fate JSON cannot drift between the two.
- A setup screen that is usable now and ends in a placeholder show view.

**Non-Goals:**
- Hosting, authentication or multi-user access. There is one presenter and one machine.
- Persisting shows across server restarts. The comic export change writes its own output files.
- Any fate, LLM, rendering or audio logic.

## Decisions

### Repository layout
```
pyproject.toml            Python project (backend + CLI)
src/bottle_throne/        backend package
  app.py                  FastAPI app factory, static serving
  config.py               settings from .env / environment
  api/                    routers (/api/health, /api/shows)
  models/                 Pydantic contracts (roster, show session, ...)
  sessions.py             in-memory show session store
  __main__.py             `python -m bottle_throne` entry point
tests/                    pytest
web/                      Vite + TypeScript front end
  src/setup/              setup screen
  src/show/               show view (placeholder in this change)
  src/api/                generated API types + fetch client
scripts/start.ps1         one-command start for Windows
output/                   generated PDFs / show files (git-ignored)
```
Alternative considered: separate `backend/` and `frontend/` repositories. Rejected because this is one small app with one presenter, and a single repository keeps the contracts close together.

### Backend: FastAPI + Pydantic + Uvicorn
FastAPI gives Pydantic models, OpenAPI generation and static file serving in one place. Pydantic models are the single source of truth for every contract: roster, fate script, scene script. Alternative: Flask. Rejected because it has no built-in schema generation.

### Front end: Vite + TypeScript, no UI framework
The stage that comes later is driven by imperative animation (SVG, canvas, timelines), and the setup screen is one form. A component framework would add little and would get in the way of animation code. Alternative: React or Svelte. Rejected for now. If the setup UI grows, this can be revisited without affecting the stage.

### Typed contract: OpenAPI -> TypeScript
`npm run gen:api` runs `openapi-typescript` against the backend's `/openapi.json` and writes `web/src/api/schema.d.ts`. A test fails if the generated file is stale. Alternative: maintaining TS types by hand. Rejected because there will be many nested contracts (fate beats, scene lines, cues).

### Serving and start command
- Production-like run: `scripts/start.ps1` activates `.venv`, builds `web/` if `web/dist` is missing or older than the sources, starts `python -m bottle_throne` on `127.0.0.1:8765`, and opens the default browser. FastAPI serves `web/dist` and falls back to `index.html` for client routes.
- Development: `scripts/dev.ps1` runs Uvicorn with reload and the Vite dev server, which proxies `/api` to the backend.

### Configuration
`pydantic-settings` reads `.env` and then the process environment, with the environment taking precedence. `SecretStr` holds the API key so it is masked in reprs and logs. `/api/health` returns only `{foundry: {api_key: bool, endpoint: bool, deployment: bool}}`.

### Show sessions
An in-memory dictionary keyed by a random show id (`secrets.token_urlsafe`) holds a session. A session contains the canonical roster, the Old King, the seed mode and, when the seed is manual, the seed. When the seed is automatic, the fate engine change generates it. This change only records `seed_mode=auto`. Sessions are lost on restart, which is acceptable for a single live show.

### Validation shared by client and server
The rules (3-40 names, uniqueness ignoring case and whitespace, at most 24 characters) are enforced in the Pydantic `ShowRequest` model, and the same rules are implemented in a small TS module for instant feedback. The server stays authoritative. The 24-character limit is an assumption chosen so names fit in name cards and speech-bubble headers, and it can be tuned later.

## Risks / Trade-offs

- [Python 3.14 is new and some wheels may lag] -> Pin dependencies that already publish 3.14 wheels (FastAPI, Pydantic 2.12+, Uvicorn). Verify with an install task. If a later dependency blocks, record it in that change.
- [Port 8765 may be in use] -> Make the port configurable with `BOTTLE_THRONE_PORT` and print a clear error.
- [PowerShell execution policy blocks `start.ps1`] -> Document `Set-ExecutionPolicy -Scope Process RemoteSigned`, and also support `python -m bottle_throne --open`.
- [Client and server validation drift] -> Use shared test vectors (a JSON fixture of rosters and expected outcomes) in both pytest and vitest.
