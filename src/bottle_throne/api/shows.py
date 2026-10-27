from fastapi import APIRouter, HTTPException, Request, status

from bottle_throne.models.show import ShowRequest, ShowSession
from bottle_throne.sessions import SessionStore

router = APIRouter(prefix="/shows", tags=["shows"])


def _store(request: Request) -> SessionStore:
    return request.app.state.sessions


@router.post("", response_model=ShowSession, status_code=status.HTTP_201_CREATED)
def create_show(body: ShowRequest, request: Request) -> ShowSession:
    return _store(request).create(body).public()


@router.get("/{show_id}", response_model=ShowSession)
def get_show(show_id: str, request: Request) -> ShowSession:
    record = _store(request).get(show_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Show not found")
    return record.public()
