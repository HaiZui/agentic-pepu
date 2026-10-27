"""Writes deterministic all-fallback shows to tests/fixtures/stage for the stage compiler tests.

Run: .venv\\Scripts\\python.exe scripts\\gen_stage_fixtures.py
"""

import json
from pathlib import Path

from bottle_throne.fate.solver import generate_fate
from bottle_throne.story.fallback import fallback_bible, fallback_chronicle, fallback_scene

OUT_DIR = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "stage"

NAMES = [
    "Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna", "Timo", "Ulla",
    "Ville", "Åsa", "Eero", "Heli", "Iiro", "Jari", "Kaisa", "Lauri", "Minna", "Niko",
    "Outi", "Paavo", "Riikka", "Saku", "Tiina", "Urho", "Veera", "Ykä", "Aleksi", "Bea",
    "Cecilia", "Daniel", "Elina", "Fredrik", "Greta", "Hannu", "Inka", "Joonas", "Kirsi", "Leevi",
]

# (participants, old king): a named outsider, the Mad King, and a competing Old King.
SHOWS = {6: "Jukka", 15: None, 40: "Aino"}


def build(size: int) -> dict:
    seed = f"stage-fixture-{size}"
    fate = generate_fate(seed, NAMES[:size], SHOWS[size])
    return {
        "seed": seed,
        "fate": fate.model_dump(mode="json"),
        "scenes": [fallback_scene(fate, beat, seed).model_dump(mode="json") for beat in fate.beats],
        "bible": fallback_bible(fate, seed).model_dump(mode="json"),
        "chronicle": fallback_chronicle(fate, seed).model_dump(mode="json"),
    }


def render(size: int) -> str:
    return json.dumps(build(size), ensure_ascii=False, indent=1) + "\n"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SHOWS:
        (OUT_DIR / f"show-{size}.json").write_text(render(size), encoding="utf-8", newline="\n")
        print(f"wrote show-{size}.json")


if __name__ == "__main__":
    main()
