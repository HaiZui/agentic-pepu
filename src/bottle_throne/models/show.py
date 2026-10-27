import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

MIN_PARTICIPANTS = 3
MAX_PARTICIPANTS = 40
MAX_NAME_LENGTH = 24
MAX_SEED_LENGTH = 128
MAD_KING_NAME = "the Mad King"


def clean_name(raw: str) -> str:
    return unicodedata.normalize("NFC", raw).strip()


def name_key(name: str) -> str:
    """Key under which two names count as duplicates (case and surrounding whitespace ignored)."""
    return clean_name(name).lower()


class ShowRequest(BaseModel):
    participants: list[str] = Field(description="Participant names, one per entry; blanks are ignored.")
    old_king: str | None = Field(default=None, description="Previous winner; empty means the Mad King.")
    seed: str | None = Field(default=None, description="Manual seed; empty means automatic.")

    @field_validator("participants", mode="before")
    @classmethod
    def _clean_participants(cls, value: object) -> object:
        if isinstance(value, list):
            return [clean_name(v) for v in value if isinstance(v, str) and clean_name(v)]
        return value

    @field_validator("old_king", "seed", mode="before")
    @classmethod
    def _clean_optional(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = clean_name(value)
            return cleaned or None
        return value

    @field_validator("participants")
    @classmethod
    def _check_roster(cls, names: list[str]) -> list[str]:
        if len(names) < MIN_PARTICIPANTS:
            raise PydanticCustomError(
                "roster_too_small",
                "At least {min} participants are required (got {count}).",
                {"min": MIN_PARTICIPANTS, "count": len(names)},
            )
        if len(names) > MAX_PARTICIPANTS:
            raise PydanticCustomError(
                "roster_too_large",
                "At most {max} participants are allowed (got {count}).",
                {"max": MAX_PARTICIPANTS, "count": len(names)},
            )
        too_long = [n for n in names if len(n) > MAX_NAME_LENGTH]
        if too_long:
            raise PydanticCustomError(
                "name_too_long",
                "Names may be at most {max} characters: {names}.",
                {"max": MAX_NAME_LENGTH, "names": ", ".join(too_long)},
            )
        seen: dict[str, str] = {}
        duplicates: list[str] = []
        for name in names:
            key = name_key(name)
            if key in seen and seen[key] not in duplicates:
                duplicates.append(seen[key])
            seen.setdefault(key, name)
        if duplicates:
            raise PydanticCustomError(
                "duplicate_name",
                "Names must be unique (ignoring case): {names}.",
                {"names": ", ".join(duplicates)},
            )
        return names

    @field_validator("old_king")
    @classmethod
    def _check_old_king(cls, name: str | None) -> str | None:
        if name is not None and len(name) > MAX_NAME_LENGTH:
            raise PydanticCustomError(
                "old_king_too_long",
                "The Old King's name may be at most {max} characters.",
                {"max": MAX_NAME_LENGTH},
            )
        return name

    @field_validator("seed")
    @classmethod
    def _check_seed(cls, seed: str | None) -> str | None:
        if seed is not None and len(seed) > MAX_SEED_LENGTH:
            raise PydanticCustomError(
                "seed_too_long",
                "The seed may be at most {max} characters.",
                {"max": MAX_SEED_LENGTH},
            )
        return seed


class Participant(BaseModel):
    name: str
    is_old_king: bool = False


class OldKing(BaseModel):
    name: str
    is_mad_king: bool = Field(description="True when no previous winner was given.")
    is_participant: bool = Field(description="True when the previous winner also competes.")


class ShowSession(BaseModel):
    """Public view of a show session. The seed itself is never included."""

    id: str
    participants: list[Participant]
    old_king: OldKing
    seed_mode: Literal["auto", "manual"]


def resolve_old_king(participants: list[str], old_king: str | None) -> tuple[list[Participant], OldKing]:
    if old_king is None:
        return [Participant(name=n) for n in participants], OldKing(
            name=MAD_KING_NAME, is_mad_king=True, is_participant=False
        )
    match = next((n for n in participants if name_key(n) == name_key(old_king)), None)
    roster = [Participant(name=n, is_old_king=n == match) for n in participants]
    return roster, OldKing(name=match or old_king, is_mad_king=False, is_participant=match is not None)
