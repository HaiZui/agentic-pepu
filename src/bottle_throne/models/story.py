"""Scene, bible and chronicle contracts. The *Draft models are what the LLM fills in (strict-schema safe)."""

from typing import Literal

from pydantic import BaseModel, Field

from bottle_throne.fate.catalog import SettingId
from bottle_throne.story.catalog import Action, Emotion, Framing, MusicMood, SfxCue


class BeatSynopsis(BaseModel):
    index: int
    synopsis: str


class StoryThread(BaseModel):
    title: str = Field(description="Short name of the thread, e.g. 'The Faceless contract on Aino'.")
    beats: list[int] = Field(description="Beat indexes the thread runs through, ascending: setup first, payoff last.")
    summary: str = Field(description="One sentence linking the setup to its payoff.")


class Motivation(BaseModel):
    character: str = Field(description="Participant id.")
    want: str = Field(description="One line: what this character wants in the story, from archetype and house only.")


class ExitReason(BaseModel):
    character: str = Field(description="Id of the eliminated participant.")
    beat: int = Field(description="Index of the beat that eliminates them.")
    reason: str = Field(description="One sentence: why they leave, consistent with the beat facts. Names them.")


class ShowBible(BaseModel):
    title: str = Field(description="Title of this week's show, like a comic issue title.")
    prophecy: str = Field(description="The seer's prophecy, two or three cryptic lines, never naming anyone.")
    motifs: list[str] = Field(description="Two to five recurring images or running jokes.")
    beats: list[BeatSynopsis] = Field(description="One-sentence synopsis for every beat index.")
    threads: list[StoryThread] = Field(description="One to four story threads linking setups to payoffs.")
    motivations: list[Motivation] = Field(description="One line per participant.")
    exit_reasons: list[ExitReason] = Field(description="One per participant elimination.")


class Announcement(BaseModel):
    """A stamp built from the fate script alone; the stage and the comic show the same words."""

    kind: Literal["out", "return", "summary"]
    character: str | None = Field(description="Character id, or null for a crowd summary.")
    headline: str = Field(description="For example 'Davido is OUT' or 'Davido RETURNS'.")
    cause: str = Field(description="For example 'poisoned by the goblet meant for Caesar'.")


class BeatStory(BaseModel):
    index: int
    statement: str = Field(description="Plain-language, role-aware description of what happens in the beat.")
    announcements: list[Announcement]
    survivors_before: list[str] = Field(description="Participant ids in the contest at the start of the beat.")
    survivors_after: list[str] = Field(description="Participant ids in the contest at the end of the beat.")
    bystanders: list[str] = Field(description="Participant ids planned to appear without a role in this scene.")
    ghost: str | None = Field(description="The one planned ghost of the show, if it appears in this beat, else null.")


class Storyline(BaseModel):
    """Deterministic story facts derived from the fate script: no LLM, never changes for a show."""

    beats: list[BeatStory]
    thread_seeds: list[StoryThread]


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
