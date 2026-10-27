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
PERSONA_KEYS = {"id", "name", "archetype", "house", "old_king", "role", "status", "allies", "history"}


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
        assert set(payload) <= {"show", "previously", "this_beat", "personas", "budget", "prophecy", "instruction"}
        for persona in payload["personas"]:
            assert set(persona) <= PERSONA_KEYS
        text = json.dumps(payload, ensure_ascii=False)
        assert fate.seal not in text and "seed" not in text
        assert llm.requests[0][1] is agents.scene_schema(tuple(c.id for c in fate.characters))


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
