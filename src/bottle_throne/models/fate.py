from typing import Literal

from pydantic import BaseModel, Field

from bottle_throne.fate.catalog import Archetype, CardKind, EliminationMode, Section, SettingId

CharacterKind = Literal["participant", "old_king", "npc"]


class Character(BaseModel):
    id: str = Field(description="Stable id: p01..p40 by canonical position, old_king, or npc_<role>.")
    name: str
    kind: CharacterKind
    house: str | None = None
    archetype: Archetype | None = None
    npc_role: str | None = None
    is_old_king: bool = Field(default=False, description="True for the Old King, whether participant or not.")


class House(BaseModel):
    id: str
    name: str
    sigil: str
    members: list[str] = Field(description="Character ids of the house members.")


class Role(BaseModel):
    role: str
    character: str


class Elimination(BaseModel):
    character: str
    mode: EliminationMode


class Alliance(BaseModel):
    a: str
    b: str


class ProphecyHint(BaseModel):
    id: str = Field(description="Machine-readable fact id, for example 'betrayed' or 'house:goat'.")
    text: str = Field(description="Plain English hint that does not name the winner.")


class Beat(BaseModel):
    index: int
    section: Section
    card: str
    title: str
    kind: CardKind
    setting: SettingId
    roles: list[Role]
    eliminations: list[Elimination]
    resurrections: list[str]
    alliances_formed: list[Alliance]
    alliances_broken: list[Alliance]
    facts: list[str] = Field(description="Card-specific outcome tags, e.g. attempt_failed.")
    prophecy_hints: list[ProphecyHint]
    budget_seconds: int
    dramatic: bool


class FateScript(BaseModel):
    """The complete, fixed story timeline. Never contains the seed."""

    engine_version: str
    seal: str
    seed_mode: Literal["auto", "manual"]
    roster_size: int
    characters: list[Character]
    houses: list[House]
    old_king: str = Field(description="Character id of the Old King.")
    winner: str = Field(description="Character id of the participant who will be crowned.")
    beats: list[Beat]
    total_budget_seconds: int


class Reveal(BaseModel):
    seed: str
    seed_mode: Literal["auto", "manual"]
    engine_version: str
    seal: str
