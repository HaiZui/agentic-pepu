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
2. installs Playwright's Chromium (`python -m playwright install chromium`) if it is missing, for the comic PDF;
3. builds the front end if `web/dist` is missing or out of date;
4. starts the server on http://127.0.0.1:8765/ and opens the setup screen.

If PowerShell blocks the script, run `Set-ExecutionPolicy -Scope Process RemoteSigned` first. Alternatively, run the server directly with `.\.venv\Scripts\python.exe -m bottle_throne --open`.

Options:
- `BOTTLE_THRONE_PORT`: port to use, default `8765`.
- `BOTTLE_THRONE_HOST`: interface to bind, default `127.0.0.1` (loopback only).
- `BOTTLE_THRONE_COMIC`: set to `0` to skip the comic PDF.
- `BOTTLE_THRONE_OUTPUT_DIR`: where comics are saved, default `output` in the repository.

### Presenter controls

After **Raise the curtain** the show plays by itself. The controls appear when you move the mouse and hide again after three seconds.

| Key | Action |
| --- | --- |
| Space | Pause / resume |
| → / ← | Next / previous line |
| Shift + → / ← | Next / previous scene |
| + / − | Faster / slower (0.5x to 2x) |
| N | Skip to the next act |
| M | Mute / unmute sound |
| ↑ / ↓ | Volume up / down |
| F | Fullscreen |
| H | Show / hide the controls |
| ? | Shortcut help (pauses the show) |

No control changes the outcome: skipped beats still happen, and the crowned winner is always the fate winner. If a scene is still being written when it is needed, the curtain closes for a short interlude.

To rehearse without network access, run `.\.venv\Scripts\python.exe scripts\serve_fallback.py 8765`; every scene then uses its template.

### Following the story

The show is written to be followed like an episode of a series, from the roll call to the crowning:

- **Survivor tracker.** After the roll call, a strip along the top of the stage shows every contestant with their house sigil and the count still in the contest ("8 remain" ... "1 remains"). Contestants who are out are crossed out. Above 16 contestants the chips show initials.
- **OUT and RETURNS stamps.** Every elimination is followed by a stamp such as "Belzebub is OUT, slain by the Jester in Trial by Combat"; crowd events show the cause on each montage tile and a summary ("3 are OUT in the Grey Plague"). The wording comes from the fate, not from the AI, so it is always right.
- **Introductions and threads.** Contestants who have no part in the story before their exit appear earlier as bystanders, and the winner appears in every act. The AI is given the whole story so far and the plot threads (grudges, debts, contracts, alliances) that link one scene to the next.
- **Resurrection.** At most once per show (rosters of six or more, Act II), the Red Priestess brings a contestant back to life. A golden "RETURNS" stamp announces it and their tracker chip is restored; they are alive again, not a ghost.
- **The ghost.** At most one ghost per show, planned from the fate: a contestant who is out returns as a ghost to watch the one who caused their exit leave the story. The figure is pale, its name card and speech bubble read "Ghost of ...", and the tracker keeps them crossed out. No other eliminated contestant can appear.

The comic book shows the same stamps in the panels where the exits happen, and a "still standing" strip at the foot of every scene page.

### Sound

Pressing START unlocks the browser's audio, so the overture plays with the cold open. Each scene's music mood loops and crossfades, dialogue ducks the music, and sound effects land with the comic lettering. On dramatic beats the music drops out just before the first impact. If the browser still blocks audio, a "Click to enable sound" button appears; the show keeps playing either way.

Open **Sound check** on the setup screen to see whether any sound file is missing and to play a test sound through the projector's speakers. A missing or broken file is skipped, never fatal.

All bundled sounds are synthesized by `scripts/gen_audio_assets.py` and released as CC0; `web/public/audio/LICENSES.json` lists every file. If you replace a file with a third-party sound, add its licence there; entries with `attribution_required` appear in the show credits. To regenerate the bundled set:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[assets]"
.\.venv\Scripts\python.exe scripts\gen_audio_assets.py
```

### Comic book

While the show plays, the backend prints the whole story as an A4 comic book (16-32 pages, vector art). When every scene is written it renders `/comic/<show id>` in a headless browser and saves:

```
output/<YYYY-MM-DD_HHMM>/bottle-throne_<YYYY-MM-DD>.pdf
output/<YYYY-MM-DD_HHMM>/show.json      # fate, storyline, scenes and chronicle texts
```

The credits show the comic status with **Open comic** and **Show in folder**. If printing fails, the show is unaffected; the credits show the reason and a **Retry** button. Printing uses Playwright's Chromium, falling back to the installed Chrome or Edge. Preview the layout with fixture shows at http://127.0.0.1:5173/dev/comic?fixture=15 (`6`, `15` or `40`; add `&worst=1` for the longest name and line).

### Future option: narrated voice

Not built yet. An Azure Speech voice could read the captions and narration, possibly with a distinct voice per archetype. It would need:
- a separate **Azure Speech** resource and key (the Foundry key in `.env` does not cover it);
- **pre-generation and caching** of the audio clips while the scenes are written, which adds time before the show is ready;
- **ducking** on the reserved voice bus of the audio engine, so music and effects drop while the voice speaks.

## Fairness and verification

The winner is decided before the story is written. It is a uniform random pick, driven by the seed, from the participants sorted alphabetically (ignoring case). The story is then built around that result, and the AI only narrates it.

When the curtain rises, the show displays the **Seal of Fate**: a SHA-256 hash of the seed, the sorted roster, the Old King and the engine version. The seed itself is revealed in the credits. Anyone can recompute both values offline:

```powershell
# roster.txt: one participant name per line, in any order
.\.venv\Scripts\python.exe -m bottle_throne verify --seed <seed from the credits> --roster roster.txt --old-king "<last winner>" --engine fate-1
```

The output must show the same Seal of Fate that was displayed at the start and the same winner that was crowned. Leave out `--old-king` if no previous winner was entered. A show started with a manual seed is labelled as such.

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
cd web; npm run test:e2e                  # build + Playwright: plays a fallback show to the credits
```

The end-to-end test uses the installed Chrome (set `PW_CHANNEL=msedge` for Edge) and starts its own backend with Foundry switched off.

Visual checks for the stage live at http://127.0.0.1:5173/dev/stage (one scene per action, panel break, montage, cold open, coronation, interlude and full fixture shows, with an fps meter). The fixture shows come from `tests/fixtures/stage`; regenerate them with `.\.venv\Scripts\python.exe scripts\gen_stage_fixtures.py` after changing the fate engine or fallback templates.

### API contract

The backend's Pydantic models are the source of truth. After you change a model, regenerate the front-end types:

```powershell
cd web; npm run gen:api
```

This writes `web/src/api/openapi.json` and `web/src/api/schema.d.ts`. If they are out of date, a pytest test and a Vitest test fail.

Roster validation rules are tested from a shared fixture, `tests/fixtures/roster_cases.json`, used by both test suites.
