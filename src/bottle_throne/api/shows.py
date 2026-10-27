from fastapi import APIRouter, HTTPException, Request, status

from bottle_throne.models.fate import FateScript, Reveal
from bottle_throne.models.show import ShowRequest, ShowSession
from bottle_throne.sessions import SessionRecord, SessionStore

router = APIRouter(prefix="/shows", tags=["shows"])


def _store(request: Request) -> SessionStore:
    return request.app.state.sessions


@router.post("", response_model=ShowSession, status_code=status.HTTP_201_CREATED)
def create_show(body: ShowRequest, request: Request) -> ShowSession:
    record = _store(request).create(body)
    story = request.app.state.story_worker.start(record.story)
    comic_worker = request.app.state.comic_worker
    # The comic is printed once every scene and the chronicle texts are final.
    story.add_done_callback(lambda _: comic_worker.start(record))
    return record.public()


@router.get("/{show_id}", response_model=ShowSession)
def get_show(show_id: str, request: Request) -> ShowSession:
    return show_record(request, show_id).public()


@router.get("/{show_id}/fate", response_model=FateScript)
def get_fate(show_id: str, request: Request) -> FateScript:
    return show_record(request, show_id).fate


@router.post("/{show_id}/reveal", response_model=Reveal)
def reveal(show_id: str, request: Request) -> Reveal:
    return show_record(request, show_id).reveal()


def show_record(request: Request, show_id: str) -> SessionRecord:
    record = _store(request).get(show_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Show not found")
    return record
