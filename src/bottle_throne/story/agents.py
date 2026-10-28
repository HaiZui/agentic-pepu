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
    Storyline,
)
from bottle_throne.story.bible import participant_exits, repair_plan
from bottle_throne.story.catalog import NARRATOR, Action, Emotion, Framing, MusicMood
from bottle_throne.story.causes import join_names, out_cause
from bottle_throne.story.context import beat_facts, cast_sheet, line_budget_note, outline, persona_cards
from bottle_throne.story.llm import LLMClient, LLMError
from bottle_throne.story.prompting import prompt_version, system_prompt
from bottle_throne.story.storyline import storyline
from bottle_throne.story.validate import repair_scene, strip_speaker_labels, validate_scene

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
    names = _names(fate)
    story = storyline(fate)
    prophecy = next(b for b in fate.beats if b.card == "prophecy")
    return {
        "cast": cast_sheet(fate),
        "timeline": outline(fate),
        "winner": names[fate.winner],
        "prophecy_hints": [h.text for h in prophecy.prophecy_hints],
        "exits_to_explain": [
            {"id": cid, "name": names[cid], "beat": i, "cause": out_cause(fate, fate.beats[i])}
            for cid, i in participant_exits(fate)
        ],
        "bystander_plan": [
            {"beat": s.index, "bystanders": [names[p] for p in s.bystanders]} for s in story.beats if s.bystanders
        ],
        "thread_ideas": [t.model_dump() for t in story.thread_seeds],
        "ghost_plan": [
            {"beat": s.index, "ghost": names[s.ghost], "watches": [names[e.character] for e in fate.beats[s.index].eliminations]}
            for s in story.beats
            if s.ghost
        ],
    }


async def direct(llm: LLMClient, fate: FateScript, retry_hint: str | None = None) -> ShowBible:
    bible = await llm.json(_messages("director", director_payload(fate), retry_hint), ShowBible)
    leaked = [name for name in _names(fate).values() if name in bible.prophecy]
    if leaked:
        raise LLMError("invalid", "the prophecy names a character")
    by_index = {b.index: b.synopsis for b in bible.beats}
    bible.beats = [BeatSynopsis(index=b.index, synopsis=by_index.get(b.index) or b.title) for b in fate.beats]
    return repair_plan(fate, storyline(fate), bible)


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


def scene_cast(beat: Beat, story: Storyline) -> tuple[str, ...]:
    """Who may speak, act or be framed in this scene: role holders, planned bystanders and the planned ghost."""
    here = story.beats[beat.index]
    cast = [r.character for r in beat.roles] + here.bystanders + ([here.ghost] if here.ghost else [])
    return tuple(dict.fromkeys(cast))


def motifs_allowed(beat: Beat) -> bool:
    """Running gags land better when rare: offer them to about one scene in four, plus the coronation."""
    return beat.index % 4 == 2 or beat.card == "coronation"


def voices_payload(fate: FateScript, beat: Beat, bible: ShowBible, story: Storyline | None = None) -> dict[str, Any]:
    names = _names(fate)
    story = story or storyline(fate)
    here = story.beats[beat.index]
    synopses = {b.index: b.synopsis for b in bible.beats}
    show: dict[str, Any] = {"title": bible.title}
    if motifs_allowed(beat):
        show["motifs"] = bible.motifs
    payload: dict[str, Any] = {
        "show": show,
        "story_so_far": [{"beat": i, "synopsis": synopses.get(i, fate.beats[i].title)} for i in range(beat.index)],
        "still_in_contest": [names[p] for p in here.survivors_before],
        "out_of_contest": [
            names[c.id]
            for c in fate.characters
            if c.kind == "participant" and c.id not in here.survivors_before and c.id not in beat.resurrections
        ],
        "this_beat": {**beat_facts(fate, beat), "synopsis": synopses.get(beat.index)},
        "personas": persona_cards(fate, beat, here.bystanders, here.ghost),
        "budget": line_budget_note(beat, len(here.bystanders)),
    }
    threads = [t.model_dump() for t in bible.threads if beat.index in t.beats]
    if threads:
        payload["threads"] = threads
    if here.bystanders:
        payload["bystanders"] = [names[p] for p in here.bystanders]
    if here.ghost:
        leaving = [names[e.character] for e in beat.eliminations]
        payload["ghost"] = {
            "name": names[here.ghost],
            "why": f"Out of the contest earlier because of {join_names(leaving)}, who leaves the story in this scene. "
            "Returns only as a ghost to watch: one or two short lines with emotion 'dead', and someone calls them a ghost.",
        }
    reasons = [{"name": names[r.character], "reason": r.reason} for r in bible.exit_reasons if r.beat == beat.index]
    if reasons:
        payload["exit_reasons"] = reasons
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
    story = storyline(fate)
    draft = await llm.json(
        _messages("voices", voices_payload(fate, beat, bible, story), retry_hint),
        scene_schema(scene_cast(beat, story)),
    )
    scene = repair_scene(
        strip_speaker_labels(SceneScript(
            **SceneDraft.model_validate(draft.model_dump()).model_dump(),
            beat_index=beat.index,
            setting=beat.setting,
            is_fallback=False,
            prompt_version=prompt_version("voices"),
        ), _names(fate))
    )
    errors = validate_scene(scene, beat, fate, alive_at_start, story.beats[beat.index])
    if errors:
        raise SceneRejected(errors)
    return scene


RULE_ADVICE = {
    "missing_bystander": "Every name under 'bystanders' must speak at least one short line (under 60 characters).",
    "too_many_bystanders": "Only the planned bystanders may join the scene; give every other contestant no lines.",
    "bystander_leaves": "Bystanders stay in the story: never give them fall, exit or enter.",
    "unnamed_elimination": "Name the eliminated character in a line or caption when they leave.",
    "risen_as_ghost": "The character returning from death is alive again: use 'enter' and a living emotion, never 'dead'.",
    "risen_entrance": "The character returning from death must perform 'enter'.",
    "unplanned_ghost": "Contestants who are out of the contest must not appear, except the planned ghost under 'ghost'.",
    "missing_ghost": "The planned ghost under 'ghost' must speak at least one short line with emotion 'dead'.",
    "unannounced_ghost": "A line or caption must call the planned ghost a ghost, by name.",
    "ghost_action": "A ghost may only speak: no fall, exit or enter.",
}


def retry_hint_for(error: LLMError) -> str:
    if error.kind == "content_filter":
        return "Your previous attempt was blocked. Keep it lighter and sillier: comic pratfalls, no violence words."
    if isinstance(error, SceneRejected):
        problems = "\n".join(f"- {e}" for e in error.errors[:6])
        kinds = dict.fromkeys(e.split(":", 1)[0] for e in error.errors)
        advice = "\n".join(f"- {RULE_ADVICE[k]}" for k in kinds if k in RULE_ADVICE)
        hint = f"Your previous attempt broke these rules. Fix them and keep it shorter:\n{problems}"
        return f"{hint}\nHow to fix:\n{advice}" if advice else hint
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
