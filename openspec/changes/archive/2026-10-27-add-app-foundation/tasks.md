# Tasks

## 1. Project scaffolding

- [x] 1.1 Create `pyproject.toml` for package `bottle_throne` (src layout) with FastAPI, Uvicorn, Pydantic 2.12+, pydantic-settings, and dev dependencies pytest and httpx. Verify that `pip install -e .[dev]` succeeds in `.venv` on Python 3.14.
- [x] 1.2 Scaffold `web/` with Vite + TypeScript (vanilla) and Vitest. Verify that `npm install`, `npm run build` and `npm test` succeed.
- [x] 1.3 Extend `.gitignore` with `output/`, `web/node_modules/`, `web/dist/`, `__pycache__/`, `*.egg-info/` and `.pytest_cache/`. Verify that `git status` shows no build artifacts after a build.

## 2. Runtime and configuration

- [x] 2.1 Implement `config.py` with pydantic-settings: read `.env` and the environment (environment wins), hold `FOUNDRY_API_KEY` as `SecretStr`, and make the port configurable via `BOTTLE_THRONE_PORT`. Verify with pytest cases for precedence and for missing variables.
- [x] 2.2 Implement the app factory: mount `/api`, serve `web/dist` with an SPA fallback, bind to `127.0.0.1` by default. Verify with a pytest check that `/` returns the index and an unknown client route returns the index.
- [x] 2.3 Implement `GET /api/health` that returns only presence booleans for the Foundry variables. Verify with a pytest check that the response body never contains the key value.
- [x] 2.4 Add a logging filter that masks the API key value in log records. Verify with a pytest check that captures logs while an error message containing the key is raised.
- [x] 2.5 Implement `python -m bottle_throne [--open]` and `scripts/start.ps1` (activate venv, build web if stale, start, open browser). Verify manually that the setup screen opens from a fresh clone.
- [x] 2.6 Add `scripts/dev.ps1` (Uvicorn with reload + Vite dev server with `/api` proxy) and document both scripts in `README.md`. Verify that the documented commands run as written.

## 3. Show setup contract

- [x] 3.1 Define Pydantic models `ShowRequest` (participants, old_king, seed?) and `ShowSession` (id, canonical roster, old king role, seed_mode). Validate 3-40 names, case-insensitive and whitespace-insensitive uniqueness, and a 24-character maximum. Verify with pytest against a shared fixture `tests/fixtures/roster_cases.json`.
- [x] 3.2 Resolve the Old King: empty means the Mad King NPC, and a name matching a roster entry marks that participant as the competing king. Verify with pytest for both cases.
- [x] 3.3 Implement the in-memory session store and `POST /api/shows` (201 with the id; 422 with the failed rule) and `GET /api/shows/{id}`. Verify with pytest that invalid requests create no session.
- [x] 3.4 Add `npm run gen:api` (openapi-typescript from the running backend's schema, or from a dumped `openapi.json`) and a test that fails when `web/src/api/schema.d.ts` is stale. Verify by changing a model and seeing the test fail.

## 4. Setup screen

- [x] 4.1 Build the setup screen layout: participants textarea with live count, Old King field, advanced seed toggle, Preview cast placeholder (disabled until add-puppet-renderer), and START. Verify visually in the browser.
- [x] 4.2 Implement client-side validation in a TS module using the shared roster fixture: duplicate highlighting, overlong names, size limits, START disabled state. Verify with Vitest using `tests/fixtures/roster_cases.json`.
- [x] 4.3 Show the configuration warning from `/api/health` when Foundry variables are missing. Verify by temporarily unsetting a variable and checking that the warning names it.
- [x] 4.4 Wire START to `POST /api/shows` and navigate to `/show/{id}`, which shows a placeholder (roster, Old King, seed mode). Verify end-to-end in the browser with "Jääskeläinen" and "Öhman" rendering correctly.

## Workflow follow-up

- Archive this change after review so `app-runtime` and `show-setup` become main specs before `add-fate-engine` is applied.
