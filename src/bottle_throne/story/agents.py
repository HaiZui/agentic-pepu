"""The three narrative agents: Director (bible), Voices (one scene per beat) and Chronicler (show texts)."""

import json
from functools import lru_cache
from typing import Any, Literal

from pydantic import BaseModel, create_model

from bottle_throne.models.fate import Beat, FateScript
from bottle_throne.models.story import (
    BeatSynopsis,
    Caption,
    ChronicleTexts,
    Cue,
    Onomatopoeia,
    SceneDraft,
    SceneScript,
    ShowBible,
)
from bottle_throne.story.catalog import NARRATOR, Action, Emotion, Framing, MusicMood
from bottle_throne.story.context import beat_facts, cast_sheet, line_budget_note, outline, persona_cards
from bottle_throne.story.llm import LLMClient, LLMError
from bottle_throne.story.prompting import prompt_version, system_prompt
from bottle_throne.story.validate import repair_scene, validate_scene

MAX_EPILOGUE_WORDS = 120


class SceneRejected(LLMError):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("invalid", "; ".join(errors[:4]))
        self.errors = errors


def _messages(agent: str, payload: dict[str, Any], retry_hint: str | None = None) -> list[dict[str, str]]:
    messages = [
        {"role": "system", "content": system_prompt(agent)},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False, indent=1)},
    ]
    if retry_hint:
        messages.append({"role": "user", "content": retry_hint})
    return messages


def _names(fate: FateScript) -> dict[str, str]:
    return {c.id: c.name for c in fate.characters}


# --- Director ----------------------------------------------------------------------------------------------


def director_payload(fate: FateScript) -> dict[str, Any]:
    prophecy = next(b for b in fate.beats if b.card == "prophecy")
    return {
        "cast": cast_sheet(fate),
        "timeline": outline(fate),
        "winner": _names(fate)[fate.winner],
        "prophecy_hints": [h.text for h in prophecy.prophecy_hints],
    }


async def direct(llm: LLMClient, fate: FateScript, retry_hint: str | None = None) -> ShowBible:
    bible = await llm.json(_messages("director", director_payload(fate), retry_hint), ShowBible)
    leaked = [name for name in _names(fate).values() if name in bible.prophecy]
    if leaked:
        raise LLMError("invalid", "the prophecy names a character")
    by_index = {b.index: b.synopsis for b in bible.beats}
    bible.beats = [BeatSynopsis(index=b.index, synopsis=by_index.get(b.index) or b.title) for b in fate.beats]
    return bible


# --- Voices --------------------------------------------------------------------------------------------------


@lru_cache(maxsize=32)
def scene_schema(cast_ids: tuple[str, ...]) -> type[BaseModel]:
    """SceneDraft whose character fields only accept this show's cast ids (enforced by strict decoding)."""
    Who = Literal[cast_ids]  # type: ignore[valid-type]
    Speaker = Literal[(*cast_ids, NARRATOR)]  # type: ignore[valid-type]
    line = create_model("Line", speaker=(Speaker, ...), emotion=(Emotion, ...), action=(Action | None, ...), text=(str, ...))
    direction = create_model("StageDirection", character=(Who, ...), action=(Action, ...), line=(int, ...))
    panel = create_model(
        "PanelMoment",
        framing=(Framing, ...),
        ref_kind=(Literal["line", "caption"], ...),
        ref_index=(int, ...),
        focus=(list[Who], ...),  # type: ignore[valid-type]
    )
    return create_model(
        "SceneDraft",
        music=(MusicMood, ...),
        lines=(list[line], ...),  # type: ignore[valid-type]
        captions=(list[Caption], ...),
        stage_directions=(list[direction], ...),  # type: ignore[valid-type]
        onomatopoeia=(list[Onomatopoeia], ...),
        cues=(list[Cue], ...),
        panels=(list[panel], ...),  # type: ignore[valid-type]
    )


def motifs_allowed(beat: Beat) -> bool:
    """Running gags land better when rare: offer them to about one scene in four, plus the coronation."""
    return beat.index % 4 == 2 or beat.card == "coronation"


def voices_payload(fate: FateScript, beat: Beat, bible: ShowBible) -> dict[str, Any]:
    synopses = {b.index: b.synopsis for b in bible.beats}
    show: dict[str, Any] = {"title": bible.title}
    if motifs_allowed(beat):
        show["motifs"] = bible.motifs
    payload: dict[str, Any] = {
        "show": show,
        "previously": synopses.get(beat.index - 1),
        "this_beat": {**beat_facts(fate, beat), "synopsis": synopses.get(beat.index)},
        "personas": persona_cards(fate, beat),
        "budget": line_budget_note(beat),
    }
    if beat.card == "prophecy":
        payload["prophecy"] = bible.prophecy
        payload["instruction"] = "The seer speaks the prophecy, word for word or nearly so. Name no one."
    if beat.card == "coronation":
        payload["prophecy"] = bible.prophecy
        payload["instruction"] = "Crown the winner and say plainly that the prophecy is fulfilled."
    return payload


async def voice_scene(
    llm: LLMClient,
    fate: FateScript,
    beat: Beat,
    bible: ShowBible,
    alive_at_start: frozenset[str],
    retry_hint: str | None = None,
) -> SceneScript:
    draft = await llm.json(
        _messages("voices", voices_payload(fate, beat, bible), retry_hint),
        scene_schema(tuple(c.id for c in fate.characters)),
    )
    scene = repair_scene(
        SceneScript(
            **SceneDraft.model_validate(draft.model_dump()).model_dump(),
            beat_index=beat.index,
            setting=beat.setting,
            is_fallback=False,
            prompt_version=prompt_version("voices"),
        )
    )
    errors = validate_scene(scene, beat, fate, alive_at_start)
    if errors:
        raise SceneRejected(errors)
    return scene


def retry_hint_for(error: LLMError) -> str:
    if error.kind == "content_filter":
        return "Your previous attempt was blocked. Keep it lighter and sillier: comic pratfalls, no violence words."
    if isinstance(error, SceneRejected):
        problems = "\n".join(f"- {e}" for e in error.errors[:6])
        return f"Your previous attempt broke these rules. Fix them and keep it shorter:\n{problems}"
    return "Try again. Keep it shorter and follow the schema exactly."


# --- Chronicler ---------------------------------------------------------------------------------------------


def chronicler_payload(fate: FateScript, bible: ShowBible) -> dict[str, Any]:
    names = _names(fate)
    participants = {c.id for c in fate.characters if c.kind == "participant"}
    fallen = [e.character for b in fate.beats for e in b.eliminations if e.character in participants]
    synopses = {s.index: s.synopsis for s in bible.beats}
    return {
        "show": {"title": bible.title, "prophecy": bible.prophecy, "motifs": bible.motifs},
        "acts": {
            act: [synopses.get(b.index, b.title) for b in fate.beats if b.section == act]
            for act in ("act_1", "act_2", "act_3")
        },
        "winner": names[fate.winner],
        "old_king": names[fate.old_king],
        "fallen_count": len(fallen),
        "roster_size": fate.roster_size,
    }


async def chronicle(llm: LLMClient, fate: FateScript, bible: ShowBible, retry_hint: str | None = None) -> ChronicleTexts:
    texts = await llm.json(_messages("chronicler", chronicler_payload(fate, bible), retry_hint), ChronicleTexts)
    winner = _names(fate)[fate.winner]
    if len(texts.epilogue.split()) > MAX_EPILOGUE_WORDS:
        raise LLMError("invalid", "the epilogue is too long")
    if winner not in texts.epilogue:
        raise LLMError("invalid", "the epilogue does not name the new monarch")
    if winner in texts.blurb:
        raise LLMError("invalid", "the blurb reveals the winner")
    return texts
