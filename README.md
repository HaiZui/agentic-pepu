# The Bottle Throne

A visual novel raffle for the Friday bottle. The participants are peasants fighting to replace the Old King (last week's winner). A seeded random fate decides the winner, and the story is staged as a paper-puppet show. The app runs locally on the presenter's laptop.

## Requirements

- Windows with PowerShell
- Python 3.12+ (developed on 3.14)
- Node.js 20+ (developed on 24)
- A `.env` file in the repository root with the Azure Foundry settings:

```
FOUNDRY_API_KEY=...
FOUNDRY_API_ENDPOINT=...
FOUNDRY_LLM_DEPLOYMENT_NAME=...
```

Process environment variables override `.env`. The key stays on the backend and is never sent to the browser or written to logs. Without these variables the app still starts, and the setup screen shows a warning.

## Run the show

```powershell
.\scripts\start.ps1
```

The script:
1. creates `.venv` and installs the backend if needed;
2. builds the front end if `web/dist` is missing or out of date;
3. starts the server on http://127.0.0.1:8765/ and opens the setup screen.

If PowerShell blocks the script, run `Set-ExecutionPolicy -Scope Process RemoteSigned` first. Alternatively, run the server directly with `.\.venv\Scripts\python.exe -m bottle_throne --open`.

Options:
- `BOTTLE_THRONE_PORT`: port to use, default `8765`.
- `BOTTLE_THRONE_HOST`: interface to bind, default `127.0.0.1` (loopback only).

## Development

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"   # backend + test tools
cd web; npm install; cd ..                               # front end
.\scripts\dev.ps1                                        # backend (reload) + Vite on http://127.0.0.1:5173/
```

Tests:

```powershell
.\.venv\Scripts\python.exe -m pytest      # backend
cd web; npm test                          # front end
```

### API contract

The backend's Pydantic models are the source of truth. After you change a model, regenerate the front-end types:

```powershell
cd web; npm run gen:api
```

This writes `web/src/api/openapi.json` and `web/src/api/schema.d.ts`. If they are out of date, a pytest test and a Vitest test fail.

Roster validation rules are tested from a shared fixture, `tests/fixtures/roster_cases.json`, used by both test suites.
