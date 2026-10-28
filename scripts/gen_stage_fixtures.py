"""Writes deterministic all-fallback shows to tests/fixtures/stage for the stage compiler tests.

Run: .venv\\Scripts\\python.exe scripts\\gen_stage_fixtures.py
"""

import json
from pathlib import Path

from bottle_throne.fate.solver import generate_fate
from bottle_throne.story.fallback import fallback_bible, fallback_chronicle, fallback_scene
from bottle_throne.story.storyline import storyline

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
        "storyline": storyline(fate).model_dump(mode="json"),
        "scenes": [fallback_scene(fate, beat, seed).model_dump(mode="json") for beat in fate.beats],
        "bible": fallback_bible(fate, seed).model_dump(mode="json"),
        "chronicle": fallback_chronicle(fate, seed).model_dump(mode="json"),
    }


def render(size: int) -> str:
    return json.dumps(build(size), ensure_ascii=False, indent=1) + "\n"


def shape(size: int) -> dict:
    """Just enough of a show to plan comic pages: cast, houses, beats and each scene's panels and text."""
    seed = f"comic-shape-{size}"
    old_king = [None, "Jukka", NAMES[0]][size % 3]
    fate = generate_fate(seed, NAMES[:size], old_king)
    scenes = [fallback_scene(fate, beat, seed) for beat in fate.beats]
    return {
        "size": size,
        "fate": {
            "characters": [{"id": c.id, "name": c.name, "kind": c.kind, "house": c.house} for c in fate.characters],
            "houses": [{"id": h.id, "members": h.members} for h in fate.houses],
            "beats": [
                {
                    "index": b.index,
                    "section": b.section,
                    "card": b.card,
                    "kind": b.kind,
                    "dramatic": b.dramatic,
                    "eliminations": [{"character": e.character, "mode": e.mode} for e in b.eliminations],
                    "resurrections": list(b.resurrections),
                }
                for b in fate.beats
            ],
        },
        "scenes": [
            {
                "beat_index": s.beat_index,
                "panels": [p.framing for p in s.panels],
                "lines": [len(line.text) for line in s.lines],
                "captions": [len(c.text) for c in s.captions],
            }
            for s in scenes
        ],
    }


def render_shapes() -> str:
    return json.dumps([shape(n) for n in range(3, 41)], ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SHOWS:
        (OUT_DIR / f"show-{size}.json").write_text(render(size), encoding="utf-8", newline="\n")
        print(f"wrote show-{size}.json")
    (OUT_DIR / "comic-shapes.json").write_text(render_shapes(), encoding="utf-8", newline="\n")
    print("wrote comic-shapes.json")


if __name__ == "__main__":
    main()
