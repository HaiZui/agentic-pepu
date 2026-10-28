"""Pre-generation of the bible, every scene and the chronicle texts, with progress events."""

import asyncio
import logging
import threading
from collections.abc import Awaitable, Callable
from concurrent.futures import Future
from dataclasses import dataclass, field
from typing import Any, TypeVar

from bottle_throne.models.fate import FateScript
from bottle_throne.models.story import BeatStatus, ChronicleTexts, GenerationStatus, SceneScript, ShowBible, Storyline
from bottle_throne.story import agents
from bottle_throne.story.fallback import fallback_bible, fallback_chronicle, fallback_scene
from bottle_throne.story.llm import LLMClient, LLMError
from bottle_throne.story.storyline import storyline
from bottle_throne.story.validate import alive_before_each_beat

log = logging.getLogger(__name__)

DEFAULT_CONCURRENCY = 4
RATE_LIMIT_WAIT_DEFAULT = 6.0
RATE_LIMIT_WAIT_MAX = 20.0
T = TypeVar("T")


@dataclass
class StoryState:
    """Thread-safe story progress for one show. Delivered items never change once set."""

    fate: FateScript
    seed: str
    storyline: Storyline = field(init=False)
    bible: ShowBible | None = None
    chronicle: ChronicleTexts | None = None
    scenes: dict[int, SceneScript] = field(default_factory=dict)
    statuses: list[BeatStatus] = field(default_factory=list)
    complete: bool = False
    events: list[dict[str, Any]] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def __post_init__(self) -> None:
        self.statuses = ["pending"] * len(self.fate.beats)
        self.storyline = storyline(self.fate)

    def _publish(self, event: dict[str, Any]) -> None:
        self.events.append(event)

    def set_bible(self, bible: ShowBible) -> None:
        with self._lock:
            if self.bible is None:
                self.bible = bible
                self._publish({"type": "bible"})

    def set_scene(self, scene: SceneScript) -> None:
        with self._lock:
            if scene.beat_index in self.scenes:
                return
            self.scenes[scene.beat_index] = scene
            status: BeatStatus = "fallback" if scene.is_fallback else "ready"
            self.statuses[scene.beat_index] = status
            self._publish({"type": "beat", "index": scene.beat_index, "status": status})

    def set_chronicle(self, texts: ChronicleTexts) -> None:
        with self._lock:
            if self.chronicle is None:
                self.chronicle = texts
                self._publish({"type": "chronicle"})

    def finish(self) -> None:
        with self._lock:
            if not self.complete:
                self.complete = True
                self._publish({"type": "complete"})

    def events_since(self, cursor: int) -> list[dict[str, Any]]:
        with self._lock:
            return list(self.events[cursor:])

    def status(self) -> GenerationStatus:
        with self._lock:
            return GenerationStatus(
                beats=list(self.statuses),
                bible_ready=self.bible is not None,
                chronicle_ready=self.chronicle is not None,
                complete=self.complete,
            )


async def _twice(make: Callable[[str | None], Awaitable[T]], what: str) -> T | None:
    """Run an agent call; retry once with a corrective hint; None if both attempts fail."""
    hint: str | None = None
    for attempt in (1, 2):
        try:
            return await make(hint)
        except LLMError as error:
            log.warning("%s attempt %d failed (%s): %s", what, attempt, error.kind, error)
            hint = agents.retry_hint_for(error)
            if attempt == 1 and error.kind == "rate_limit":
                await asyncio.sleep(min(error.retry_after or RATE_LIMIT_WAIT_DEFAULT, RATE_LIMIT_WAIT_MAX))
    return None


async def generate_story(state: StoryState, llm: LLMClient | None, concurrency: int = DEFAULT_CONCURRENCY) -> None:
    fate, seed = state.fate, state.seed
    try:
        if llm is None:
            state.set_bible(fallback_bible(fate, seed))
            for beat in fate.beats:
                state.set_scene(fallback_scene(fate, beat, seed))
            state.set_chronicle(fallback_chronicle(fate, seed))
            return

        bible = await _twice(lambda hint: agents.direct(llm, fate, hint), "bible") or fallback_bible(fate, seed)
        state.set_bible(bible)

        alive = alive_before_each_beat(fate)
        gate = asyncio.Semaphore(concurrency)

        async def scene(index: int) -> None:
            beat = fate.beats[index]
            async with gate:
                result = await _twice(
                    lambda hint: agents.voice_scene(llm, fate, beat, bible, alive[index], hint), f"scene {index}"
                )
            state.set_scene(result or fallback_scene(fate, beat, seed))

        async def chronicle() -> None:
            async with gate:
                texts = await _twice(lambda hint: agents.chronicle(llm, fate, bible, hint), "chronicle")
            state.set_chronicle(texts or fallback_chronicle(fate, seed))

        # Tasks are created in beat order, so the semaphore serves early beats first.
        tasks = [asyncio.create_task(scene(i)) for i in range(len(fate.beats))]
        tasks.append(asyncio.create_task(chronicle()))
        await asyncio.gather(*tasks)
        log.info(
            "Story generated: %d calls, %d prompt tokens, %d completion tokens",
            llm.usage.calls,
            llm.usage.prompt_tokens,
            llm.usage.completion_tokens,
        )
    except Exception:  # noqa: BLE001 - the show must go on with fallbacks
        log.exception("Story generation failed; filling the rest with fallbacks")
    finally:
        state.set_bible(fallback_bible(fate, seed))
        for beat in fate.beats:
            state.set_scene(fallback_scene(fate, beat, seed))
        state.set_chronicle(fallback_chronicle(fate, seed))
        state.finish()


class StoryWorker:
    """Runs story generation on its own event loop thread, independent of HTTP requests."""

    def __init__(self, llm: LLMClient | None, concurrency: int = DEFAULT_CONCURRENCY) -> None:
        self.llm = llm
        self.concurrency = concurrency
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, name="story-worker", daemon=True)
        self._thread.start()

    def start(self, state: StoryState) -> Future[None]:
        return asyncio.run_coroutine_threadsafe(generate_story(state, self.llm, self.concurrency), self._loop)

    def stop(self) -> None:
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)
