"""Scene, bible and chronicle contracts. The *Draft models are what the LLM fills in (strict-schema safe)."""

from typing import Literal

from pydantic import BaseModel, Field

from bottle_throne.fate.catalog import SettingId
from bottle_throne.story.catalog import Action, Emotion, Framing, MusicMood, SfxCue


class BeatSynopsis(BaseModel):
    index: int
    synopsis: str


class ShowBible(BaseModel):
    title: str = Field(description="Title of this week's show, like a comic issue title.")
    prophecy: str = Field(description="The seer's prophecy, two or three cryptic lines, never naming anyone.")
    motifs: list[str] = Field(description="Two to five recurring images or running jokes.")
    beats: list[BeatSynopsis] = Field(description="One-sentence synopsis for every beat index.")


class Line(BaseModel):
    speaker: str = Field(description="Character id from the cast, or 'narrator'.")
    emotion: Emotion
    action: Action | None
    text: str


class Caption(BaseModel):
    text: str
    before_line: int = Field(description="Index of the line this caption box precedes; len(lines) means at the end.")


class Onomatopoeia(BaseModel):
    text: str = Field(description="Short comic sound word in capitals, e.g. SHINK!")
    line: int


class Cue(BaseModel):
    sfx: SfxCue
    line: int


class StageDirection(BaseModel):
    character: str = Field(description="Character id performing the action.")
    action: Action
    line: int = Field(description="Index of the line during which it happens.")


class PanelMoment(BaseModel):
    framing: Framing
    ref_kind: Literal["line", "caption"]
    ref_index: int
    focus: list[str] = Field(description="Character ids in the frame.")


class SceneDraft(BaseModel):
    """What the Voices agent writes for one beat."""

    music: MusicMood
    lines: list[Line]
    captions: list[Caption]
    stage_directions: list[StageDirection]
    onomatopoeia: list[Onomatopoeia]
    cues: list[Cue]
    panels: list[PanelMoment]


class SceneScript(SceneDraft):
    """A validated scene, shared by the live stage and the comic. Never changes once delivered."""

    beat_index: int
    setting: SettingId
    is_fallback: bool
    prompt_version: str


class ActTitles(BaseModel):
    act_1: str
    act_2: str
    act_3: str


class ChronicleTexts(BaseModel):
    act_titles: ActTitles
    epilogue: str = Field(description="At most 120 words, naming the new monarch.")
    cover_title: str
    blurb: str = Field(description="Back-cover blurb, two or three sentences, no spoilers of the winner.")


BeatStatus = Literal["pending", "ready", "fallback"]


class GenerationStatus(BaseModel):
    beats: list[BeatStatus]
    bible_ready: bool
    chronicle_ready: bool
    complete: bool
