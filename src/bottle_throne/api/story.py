import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from bottle_throne.api.shows import show_record
from bottle_throne.comic.job import FINAL
from bottle_throne.models.story import ChronicleTexts, GenerationStatus, SceneScript, ShowBible

router = APIRouter(prefix="/shows", tags=["story"])

POLL_SECONDS = 0.25


def _not_ready(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{what} is not ready yet")


@router.get("/{show_id}/story", response_model=GenerationStatus)
def story_status(show_id: str, request: Request) -> GenerationStatus:
    return show_record(request, show_id).story.status()


@router.get("/{show_id}/bible", response_model=ShowBible)
def get_bible(show_id: str, request: Request) -> ShowBible:
    bible = show_record(request, show_id).story.bible
    if bible is None:
        raise _not_ready("The show bible")
    return bible


@router.get("/{show_id}/chronicle-texts", response_model=ChronicleTexts)
def get_chronicle_texts(show_id: str, request: Request) -> ChronicleTexts:
    texts = show_record(request, show_id).story.chronicle
    if texts is None:
        raise _not_ready("The chronicle")
    return texts


@router.get("/{show_id}/scenes/{beat}", response_model=SceneScript)
def get_scene(show_id: str, beat: int, request: Request) -> SceneScript:
    story = show_record(request, show_id).story
    if not 0 <= beat < len(story.fate.beats):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such beat")
    scene = story.scenes.get(beat)
    if scene is None:
        raise _not_ready(f"Scene {beat}")
    return scene


@router.get("/{show_id}/events", response_class=StreamingResponse)
async def story_events(show_id: str, request: Request) -> StreamingResponse:
    """Server-Sent Events: a status snapshot, bible/beat/chronicle events and 'complete', then 'comic'
    status events; the stream ends after the comic is final (ready, failed or off)."""
    record = show_record(request, show_id)
    story = record.story
    comic = record.comic

    async def stream() -> AsyncIterator[str]:
        yield f"event: status\ndata: {story.status().model_dump_json()}\n\n"
        cursor = 0
        story_done = False
        comic_version = -1
        while True:
            if not story_done:
                events = story.events_since(cursor)
                cursor += len(events)
                for event in events:
                    yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
                    story_done = story_done or event["type"] == "complete"
            if story_done and comic.version != comic_version:
                comic_version = comic.version
                info = comic.info()
                yield f"event: comic\ndata: {info.model_dump_json()}\n\n"
                if info.status in FINAL:
                    return
            if await request.is_disconnected():
                return
            await asyncio.sleep(POLL_SECONDS)

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
