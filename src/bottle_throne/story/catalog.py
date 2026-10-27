"""Closed catalogs for scene scripts. Anything outside these lists fails validation."""

from typing import Literal, get_args

from pydantic import BaseModel

from bottle_throne.fate.catalog import SETTINGS, SettingId

Emotion = Literal["neutral", "smug", "scheming", "furious", "terrified", "grieving", "triumphant", "dead"]
Action = Literal[
    "enter", "exit", "draw_weapon", "strike", "fall", "kneel", "drink", "point", "embrace", "flee", "crown"
]
SfxCue = Literal[
    "curtain",
    "gong",
    "sword_draw",
    "sword_clash",
    "shink",
    "thud",
    "crowd_gasp",
    "crowd_cheer",
    "thunder",
    "wind",
    "fire_whoosh",
    "goblet_clink",
    "gulp",
    "bell_toll",
    "horn",
    "raven",
    "splash",
    "dragon_roar",
    "heartbeat",
    "choir",
]
MusicMood = Literal["overture", "intrigue", "feast", "battle", "dread", "winter", "sorrow", "triumph"]
Framing = Literal["wide", "medium", "close_up", "extreme_close_up", "over_shoulder", "splash", "montage"]

EMOTIONS: tuple[str, ...] = get_args(Emotion)
ACTIONS: tuple[str, ...] = get_args(Action)
SFX_CUES: tuple[str, ...] = get_args(SfxCue)
MUSIC_MOODS: tuple[str, ...] = get_args(MusicMood)
FRAMINGS: tuple[str, ...] = get_args(Framing)

NARRATOR = "narrator"
READING_BASE_SECONDS = 1.2
READING_PER_CHAR_SECONDS = 0.055
MAX_LINE_CHARS = 140
BUDGET_TOLERANCE = 1.15


def reading_seconds(text: str) -> float:
    return READING_BASE_SECONDS + READING_PER_CHAR_SECONDS * len(text)


class ReadingTime(BaseModel):
    base_seconds: float
    per_char_seconds: float
    max_line_chars: int


class Catalog(BaseModel):
    emotions: list[Emotion]
    actions: list[Action]
    sfx_cues: list[SfxCue]
    music_moods: list[MusicMood]
    framings: list[Framing]
    settings: list[SettingId]
    narrator: str
    reading: ReadingTime


CATALOG = Catalog(
    emotions=list(EMOTIONS),  # type: ignore[arg-type]
    actions=list(ACTIONS),  # type: ignore[arg-type]
    sfx_cues=list(SFX_CUES),  # type: ignore[arg-type]
    music_moods=list(MUSIC_MOODS),  # type: ignore[arg-type]
    framings=list(FRAMINGS),  # type: ignore[arg-type]
    settings=list(SETTINGS),
    narrator=NARRATOR,
    reading=ReadingTime(
        base_seconds=READING_BASE_SECONDS,
        per_char_seconds=READING_PER_CHAR_SECONDS,
        max_line_chars=MAX_LINE_CHARS,
    ),
)
