import json
from typing import Any

import pytest
from pydantic import BaseModel

from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import FateScript
from bottle_throne.models.story import ActTitles, BeatSynopsis, ChronicleTexts, SceneDraft, ShowBible
from bottle_throne.story import agents
from bottle_throne.story.fallback import fallback_scene
from bottle_throne.story.llm import LLMError
from bottle_throne.story.prompting import prompt_version
from bottle_throne.story.validate import alive_before_each_beat

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna"]
PERSONA_KEYS = {"id", "name", "archetype", "house", "old_king", "role", "status", "allies", "history", "bystander"}


class FakeLLM:
    """Records requests and returns queued replies (or raises queued errors)."""

    def __init__(self, *replies: Any) -> None:
        self.replies = list(replies)
        self.requests: list[tuple[list[dict[str, str]], type[BaseModel]]] = []

    async def json(self, messages, schema, **_: Any):
        self.requests.append((messages, schema))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    def payload(self, i: int = -1) -> dict[str, Any]:
        return json.loads(self.requests[i][0][1]["content"])


@pytest.fixture(scope="module")
def fate() -> FateScript:
    return generate_fate("agents-test", NAMES, "Jukka", "manual")


def bible_for(fate: FateScript, prophecy: str = "When the goat sings twice, a crown finds a quiet head.") -> ShowBible:
    return ShowBible(
        title="Knives at the Pub",
        prophecy=prophecy,
        motifs=["a goat"],
        beats=[BeatSynopsis(index=b.index, synopsis=f"Beat {b.index} happens.") for b in fate.beats[:-1]],
        threads=[],
        motivations=[],
        exit_reasons=[],
    )


async def test_director_payload_and_normalisation(fate: FateScript) -> None:
    llm = FakeLLM(bible_for(fate))

    bible = await agents.direct(llm, fate)  # type: ignore[arg-type]

    payload = llm.payload()
    winner = next(c.name for c in fate.characters if c.id == fate.winner)
    assert payload["winner"] == winner
    assert payload["prophecy_hints"] == [h.text for b in fate.beats for h in b.prophecy_hints]
    assert len(payload["timeline"]) == len(fate.beats)
    assert [b.index for b in bible.beats] == [b.index for b in fate.beats]
    assert bible.beats[-1].synopsis == fate.beats[-1].title
    assert "seed" not in json.dumps(payload) and fate.seal not in json.dumps(payload)


async def test_director_rejects_named_prophecy(fate: FateScript) -> None:
    llm = FakeLLM(bible_for(fate, prophecy="Matti shall rise."))
    with pytest.raises(LLMError) as error:
        await agents.direct(llm, fate)  # type: ignore[arg-type]
    assert error.value.kind == "invalid"


async def test_voices_request_contains_only_story_data(fate: FateScript) -> None:
    bible = bible_for(fate)
    alive = alive_before_each_beat(fate)
    for beat in fate.beats:
        good = fallback_scene(fate, beat, "s")
        draft = SceneDraft(**good.model_dump(include=set(SceneDraft.model_fields)))
        llm = FakeLLM(draft)

        scene = await agents.voice_scene(llm, fate, beat, bible, alive[beat.index])  # type: ignore[arg-type]

        assert scene.is_fallback is False and scene.prompt_version == prompt_version("voices")
        payload = llm.payload()
        assert set(payload) <= {
            "show", "story_so_far", "still_in_contest", "out_of_contest", "this_beat", "personas", "budget", "threads",
            "bystanders", "ghost", "exit_reasons", "prophecy", "instruction",
        }
        for persona in payload["personas"]:
            assert set(persona) <= PERSONA_KEYS
        text = json.dumps(payload, ensure_ascii=False)
        assert fate.seal not in text and "seed" not in text
        from bottle_throne.story.storyline import storyline

        assert llm.requests[0][1] is agents.scene_schema(agents.scene_cast(beat, storyline(fate)))


def test_scene_schema_only_accepts_cast_ids(fate: FateScript) -> None:
    import openai.lib._pydantic as strict
    from pydantic import ValidationError

    schema = agents.scene_schema(tuple(c.id for c in fate.characters))
    strict.to_strict_json_schema(schema)
    base = {"music": "feast", "captions": [], "onomatopoeia": [], "cues": [], "panels": []}
    schema.model_validate({**base, "lines": [{"speaker": "narrator", "emotion": "neutral", "action": None, "text": "x"}], "stage_directions": []})
    with pytest.raises(ValidationError):
        schema.model_validate({**base, "lines": [], "stage_directions": [{"character": "goat", "action": "exit", "line": 0}]})


async def test_voices_persona_history_and_status(fate: FateScript) -> None:
    coronation = fate.beats[-1]
    cards = {c["id"]: c for c in agents.persona_cards(fate, coronation)}
    assert cards[fate.winner]["status"] == "alive"
    prophecy = next(b for b in fate.beats if b.card == "prophecy")
    assert "prophecy" in agents.voices_payload(fate, prophecy, bible_for(fate))


def test_motifs_offered_to_about_one_scene_in_four(fate: FateScript) -> None:
    bible = bible_for(fate)
    offered = [b.index for b in fate.beats if "motifs" in agents.voices_payload(fate, b, bible)["show"]]
    assert fate.beats[-1].index in offered
    assert len(offered) <= len(fate.beats) // 4 + 2


async def test_voices_rejects_invalid_scene_with_reasons(fate: FateScript) -> None:
    beat = next(b for b in fate.beats if b.eliminations and b.kind == "single")
    good = fallback_scene(fate, beat, "s")
    draft = SceneDraft(**good.model_dump(include=set(SceneDraft.model_fields)))
    draft.stage_directions = []
    llm = FakeLLM(draft)

    with pytest.raises(agents.SceneRejected) as error:
        await agents.voice_scene(llm, fate, beat, bible_for(fate), alive_before_each_beat(fate)[beat.index])  # type: ignore[arg-type]

    assert any(e.startswith("missing_elimination") for e in error.value.errors)
    assert "missing_elimination" in agents.retry_hint_for(error.value)


def test_retry_hint_for_content_filter() -> None:
    assert "lighter" in agents.retry_hint_for(LLMError("content_filter", "x"))


async def test_chronicler_rules(fate: FateScript) -> None:
    winner = next(c.name for c in fate.characters if c.id == fate.winner)
    acts = ActTitles(act_1="The Call", act_2="The Game", act_3="The Throne")
    good = ChronicleTexts(act_titles=acts, epilogue=f"{winner} rules now.", cover_title="Knives", blurb="Who will win?")
    llm = FakeLLM(good)
    assert await agents.chronicle(llm, fate, bible_for(fate)) == good  # type: ignore[arg-type]
    assert llm.payload()["winner"] == winner

    for bad in (
        good.model_copy(update={"epilogue": "Someone rules now."}),
        good.model_copy(update={"blurb": f"{winner} wins!"}),
        good.model_copy(update={"epilogue": f"{winner} " + "word " * 130}),
    ):
        with pytest.raises(LLMError):
            await agents.chronicle(FakeLLM(bad), fate, bible_for(fate))  # type: ignore[arg-type]


def test_voices_payload_recaps_every_earlier_beat(fate: FateScript) -> None:
    from bottle_throne.story.storyline import storyline

    bible = bible_for(fate)
    story = storyline(fate)
    beat = fate.beats[min(15, len(fate.beats) - 1)]
    payload = agents.voices_payload(fate, beat, bible)
    synopses = {b.index: b.synopsis for b in bible.beats}
    assert [r["beat"] for r in payload["story_so_far"]] == list(range(beat.index))
    assert [r["synopsis"] for r in payload["story_so_far"]] == [synopses.get(i, fate.beats[i].title) for i in range(beat.index)]
    names = {c.id: c.name for c in fate.characters}
    assert payload["still_in_contest"] == [names[p] for p in story.beats[beat.index].survivors_before]
    assert payload["this_beat"]["what_happens"] == story.beats[beat.index].statement
    participants = {c.id for c in fate.characters if c.kind == "participant"}
    gone = participants - set(story.beats[beat.index].survivors_before) - set(beat.resurrections)
    assert sorted(payload["out_of_contest"]) == sorted(names[p] for p in gone)


def test_voices_payload_carries_bystanders_threads_and_exit_reasons(fate: FateScript) -> None:
    from bottle_throne.models.story import ExitReason, StoryThread
    from bottle_throne.story.storyline import storyline

    story = storyline(fate)
    names = {c.id: c.name for c in fate.characters}
    planned = next(s for s in story.beats if s.bystanders)
    beat = fate.beats[planned.index]
    bible = bible_for(fate).model_copy(update={
        "threads": [StoryThread(title="A grudge", beats=[0, beat.index], summary="It comes back.")],
        "exit_reasons": [ExitReason(character=e.character, beat=beat.index, reason="Because.") for e in beat.eliminations],
    })
    payload = agents.voices_payload(fate, beat, bible)
    assert payload["bystanders"] == [names[p] for p in planned.bystanders]
    cards = {c["id"]: c for c in payload["personas"]}
    assert all("must not leave" in cards[p]["bystander"] for p in planned.bystanders)
    assert payload["threads"][0]["title"] == "A grudge"
    assert "bystander" in payload["budget"]
    if beat.eliminations:
        assert payload["exit_reasons"][0]["reason"] == "Because."
    elsewhere = agents.voices_payload(fate, fate.beats[1] if beat.index != 1 else fate.beats[2], bible)
    assert "threads" not in elsewhere


def test_voices_prompt_version_is_recorded() -> None:
    assert prompt_version("voices") == "voices-6"
    assert prompt_version("director") == "director-3"


async def test_missing_bystander_hint_names_the_bystander(fate: FateScript) -> None:
    from bottle_throne.story.storyline import storyline

    story = storyline(fate)
    planned = next(s for s in story.beats if s.bystanders)
    beat = fate.beats[planned.index]
    who = planned.bystanders[0]
    good = fallback_scene(fate, beat, "s")
    draft = SceneDraft(**good.model_dump(include=set(SceneDraft.model_fields)))
    draft.lines = [line for line in draft.lines if line.speaker != who]

    with pytest.raises(agents.SceneRejected) as error:
        await agents.voice_scene(FakeLLM(draft), fate, beat, bible_for(fate), alive_before_each_beat(fate)[beat.index])  # type: ignore[arg-type]

    hint = agents.retry_hint_for(error.value)
    name = next(c.name for c in fate.characters if c.id == who)
    assert "missing_bystander" in hint and name in hint
    assert "must speak at least one short line" in hint


def test_scene_cast_excludes_contestants_out_of_the_contest(fate: FateScript) -> None:
    from pydantic import ValidationError

    from bottle_throne.story.storyline import storyline

    story = storyline(fate)
    first = next(b for b in fate.beats if b.eliminations and b.kind != "crowd")
    gone = first.eliminations[0].character
    for beat in fate.beats[first.index + 1 :]:
        cast = agents.scene_cast(beat, story)
        here = story.beats[beat.index]
        assert set(cast) == {r.character for r in beat.roles} | set(here.bystanders) | ({here.ghost} if here.ghost else set())
        if gone in cast:
            continue
        schema = agents.scene_schema(cast)
        base = {"music": "feast", "captions": [], "onomatopoeia": [], "cues": [], "panels": [], "stage_directions": []}
        with pytest.raises(ValidationError):
            schema.model_validate({**base, "lines": [{"speaker": gone, "emotion": "dead", "action": None, "text": "x"}]})
        with pytest.raises(ValidationError):
            schema.model_validate({**base, "lines": [], "stage_directions": [{"character": gone, "action": "point", "line": 0}]})
        return
    raise AssertionError("no later beat without the eliminated contestant")


def test_ghost_plan_reaches_director_and_voices() -> None:
    from bottle_throne.story.storyline import storyline

    for n in range(300):
        fate = generate_fate(f"agents-ghost-{n}", NAMES, None, "manual")
        planned = next((s for s in storyline(fate).beats if s.ghost), None)
        if planned:
            break
    else:
        raise AssertionError("no ghost planned")
    names = {c.id: c.name for c in fate.characters}
    director = agents.director_payload(fate)
    assert director["ghost_plan"] == [{"beat": planned.index, "ghost": names[planned.ghost], "watches": [names[e.character] for e in fate.beats[planned.index].eliminations]}]
    payload = agents.voices_payload(fate, fate.beats[planned.index], bible_for(fate))
    assert payload["ghost"]["name"] == names[planned.ghost]
    card = next(c for c in payload["personas"] if c["id"] == planned.ghost)
    assert card["status"].startswith("ghost")
    elsewhere = agents.voices_payload(fate, fate.beats[1], bible_for(fate))
    assert "ghost" not in elsewhere
