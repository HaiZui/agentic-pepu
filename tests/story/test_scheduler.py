import asyncio
import json
import sqlite3
from contextlib import closing
from pathlib import Path

import httpx
import pytest

from bottle_throne.config import Settings
from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import FateScript
from bottle_throne.models.story import ActTitles, BeatSynopsis, ChronicleTexts, SceneDraft, ShowBible
from bottle_throne.story.fallback import fallback_bible, fallback_chronicle, fallback_scene
from bottle_throne.story.llm import LLMError, create_llm
from bottle_throne.story.scheduler import StoryState, StoryWorker, generate_story

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa"]


@pytest.fixture(scope="module")
def fate() -> FateScript:
    return generate_fate("scheduler-test", NAMES, None)


class ScriptedLLM:
    """Fake model: behaviour per request kind, chosen by the schema name."""

    def __init__(self, fate: FateScript, scene_behaviour) -> None:
        self.fate = fate
        self.scene_behaviour = scene_behaviour
        self.calls: list[str] = []
        self.active = 0
        self.max_active = 0

    async def json(self, messages, schema, **_):
        kind = schema.__name__
        self.calls.append(kind)
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.sleep(0.01)
            if kind == "ShowBible":
                return ShowBible(
                    title="T", prophecy="A crown, a goat.", motifs=["goat"],
                    beats=[BeatSynopsis(index=b.index, synopsis="x") for b in self.fate.beats],
                    threads=[], motivations=[], exit_reasons=[],
                )
            if kind == "ChronicleTexts":
                winner = next(c.name for c in self.fate.characters if c.id == self.fate.winner)
                return ChronicleTexts(
                    act_titles=ActTitles(act_1="a", act_2="b", act_3="c"),
                    epilogue=f"{winner} reigns.", cover_title="T", blurb="Who?",
                )
            return self.scene_behaviour(self, messages)
        finally:
            self.active -= 1


def beat_index_of(messages) -> int:
    import json

    return json.loads(messages[1]["content"])["this_beat"]["index"]


def good_draft(llm: ScriptedLLM, messages) -> SceneDraft:
    beat = llm.fate.beats[beat_index_of(messages)]
    scene = fallback_scene(llm.fate, beat, "llm")
    return SceneDraft(**scene.model_dump(include=set(SceneDraft.model_fields)))


async def test_happy_path_all_ready_and_bible_first(fate: FateScript) -> None:
    llm = ScriptedLLM(fate, good_draft)
    state = StoryState(fate=fate, seed="s")

    await generate_story(state, llm, concurrency=4)  # type: ignore[arg-type]

    assert llm.calls[0] == "ShowBible"
    assert state.complete and state.status().complete
    assert state.statuses == ["ready"] * len(fate.beats)
    assert all(not s.is_fallback for s in state.scenes.values())
    assert llm.max_active <= 4
    types = [e["type"] for e in state.events]
    assert types[0] == "bible" and types[-1] == "complete"
    assert types.count("beat") == len(fate.beats) and "chronicle" in types


async def test_timeout_filter_and_invalid_json_fall_back_after_one_retry(fate: FateScript) -> None:
    attempts: dict[int, int] = {}

    def flaky(llm: ScriptedLLM, messages):
        index = beat_index_of(messages)
        attempts[index] = attempts.get(index, 0) + 1
        if index % 3 == 0:
            raise LLMError("timeout", "slow")
        if index % 3 == 1:
            raise LLMError("content_filter", "blocked")
        if attempts[index] == 1:
            raise LLMError("invalid", "bad json")
        return good_draft(llm, messages)

    llm = ScriptedLLM(fate, flaky)
    state = StoryState(fate=fate, seed="s")
    await generate_story(state, llm)  # type: ignore[arg-type]

    for index, status in enumerate(state.statuses):
        assert attempts[index] == 2
        assert status == ("ready" if index % 3 == 2 else "fallback")


async def test_retry_carries_hint(fate: FateScript) -> None:
    seen_hints: list[str] = []

    def first_fails(llm: ScriptedLLM, messages):
        if len(messages) == 3:
            seen_hints.append(messages[2]["content"])
            return good_draft(llm, messages)
        raise LLMError("content_filter", "blocked")

    state = StoryState(fate=fate, seed="s")
    await generate_story(state, ScriptedLLM(fate, first_fails))  # type: ignore[arg-type]

    assert len(seen_hints) == len(fate.beats)
    assert all("lighter" in hint for hint in seen_hints)
    assert set(state.statuses) == {"ready"}


async def test_rate_limit_waits_before_retry(fate: FateScript, monkeypatch: pytest.MonkeyPatch) -> None:
    from bottle_throne.story import scheduler

    waits: list[float] = []
    real_sleep = asyncio.sleep

    async def fake_sleep(seconds: float) -> None:
        if seconds >= 1:
            waits.append(seconds)
        await real_sleep(0)

    monkeypatch.setattr(scheduler.asyncio, "sleep", fake_sleep)
    tried: set[int] = set()

    def limited_once(llm: ScriptedLLM, messages):
        index = beat_index_of(messages)
        if index == 0 and index not in tried:
            tried.add(index)
            raise LLMError("rate_limit", "slow down", retry_after=2.5)
        return good_draft(llm, messages)

    state = StoryState(fate=fate, seed="s")
    await generate_story(state, ScriptedLLM(fate, limited_once))  # type: ignore[arg-type]

    assert waits == [2.5]
    assert state.statuses[0] == "ready"


async def test_no_llm_means_all_fallbacks(fate: FateScript, llm_log_path: Path) -> None:
    state = StoryState(fate=fate, seed="s")
    await generate_story(state, None)
    assert state.statuses == ["fallback"] * len(fate.beats)
    assert state.bible is not None and state.chronicle is not None and state.complete
    assert not llm_log_path.exists()


async def test_scenes_are_immutable(fate: FateScript) -> None:
    state = StoryState(fate=fate, seed="s")
    await generate_story(state, None)
    first = state.scenes[1]
    state.set_scene(fallback_scene(fate, fate.beats[1], "other-seed", 1))
    assert state.scenes[1] is first
    assert [e["type"] for e in state.events].count("beat") == len(fate.beats)


async def test_unexpected_crash_still_completes(fate: FateScript) -> None:
    def boom(llm: ScriptedLLM, messages):
        raise RuntimeError("bug")

    state = StoryState(fate=fate, seed="s")
    await generate_story(state, ScriptedLLM(fate, boom))  # type: ignore[arg-type]
    assert state.complete and set(state.statuses) == {"fallback"}


def test_worker_runs_in_background_thread(fate: FateScript) -> None:
    worker = StoryWorker(None)
    try:
        state = StoryState(fate=fate, seed="s")
        worker.start(state).result(timeout=10)
        assert state.complete
    finally:
        worker.stop()


async def test_real_client_logs_concurrent_scheduler_and_corrective_retries(
    fate: FateScript, llm_log_path: Path
) -> None:
    attempts: dict[int, int] = {}
    sent: list[str] = []
    returned: list[str] = []
    release_first = asyncio.Event()

    async def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        name = body["response_format"]["json_schema"]["name"]
        messages = body["messages"]
        if name == "ShowBible":
            content = fallback_bible(fate, "s").model_dump_json()
            tag = "bible"
        elif name == "ChronicleTexts":
            content = fallback_chronicle(fate, "s").model_dump_json()
            tag = "chronicle"
        else:
            index = beat_index_of(messages)
            attempts[index] = attempts.get(index, 0) + 1
            tag = f"scene-{index}-{attempts[index]}"
            sent.append(tag)
            if index == 0 and attempts[index] == 1:
                await asyncio.wait_for(release_first.wait(), 5)
            elif index == 1:
                release_first.set()
            if index == 0 or (index == 1 and attempts[index] == 1):
                content = '{"invalid":'
            else:
                scene = fallback_scene(fate, fate.beats[index], "s")
                content = SceneDraft(**scene.model_dump(include=set(SceneDraft.model_fields))).model_dump_json()
        returned.append(tag)
        return httpx.Response(200, json={
            "id": tag, "object": "chat.completion", "created": 0, "model": "test",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
        })

    config = Settings(
        _env_file=None, FOUNDRY_API_KEY="test-scheduler-key",
        FOUNDRY_API_ENDPOINT="https://r.services.ai.azure.com", FOUNDRY_LLM_DEPLOYMENT_NAME="test",
    )
    llm = create_llm(config, httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert llm is not None
    state = StoryState(fate=fate, seed="s")
    await generate_story(state, llm, concurrency=4)
    await llm.client.close()
    assert state.complete and state.statuses[0] == "fallback"
    assert state.statuses[1:] == ["ready"] * (len(fate.beats) - 1)
    assert attempts[0] == attempts[1] == 2
    assert sent.index("scene-0-1") < sent.index("scene-1-1")
    assert returned.index("scene-1-1") < returned.index("scene-0-1")
    with closing(sqlite3.connect(llm_log_path)) as connection:
        connection.row_factory = sqlite3.Row
        records = connection.execute(
            "SELECT * FROM model_requests JOIN model_responses USING(attempt_id) ORDER BY model_requests.rowid"
        ).fetchall()
    assert len(records) == len(fate.beats) + 4
    kinds = [json.loads(row["request_body"])["response_format"]["json_schema"]["name"] for row in records]
    assert kinds.count("ShowBible") == kinds.count("ChronicleTexts") == 1
    retries: dict[int, list[sqlite3.Row]] = {}
    for row in records:
        request = json.loads(row["request_body"])
        if request["response_format"]["json_schema"]["name"] != "SceneDraft":
            continue
        index = beat_index_of(request["messages"])
        retries.setdefault(index, []).append(row)
        tag = json.loads(row["response_body"])["id"]
        assert tag.startswith(f"scene-{index}-")
    for index in (0, 1):
        first, retry = retries[index]
        assert len(json.loads(first["request_body"])["messages"]) == 2
        assert len(json.loads(retry["request_body"])["messages"]) == 3
        assert first["invocation_id"] != retry["invocation_id"]
    assert len(records) == len(returned)
