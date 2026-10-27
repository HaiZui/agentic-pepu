from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse

from bottle_throne.api.shows import show_record
from bottle_throne.comic.job import ComicInfo, reveal_in_explorer

router = APIRouter(prefix="/shows", tags=["comic"])


def _ready_path(request: Request, show_id: str):
    comic = show_record(request, show_id).comic
    # The file location only ever comes from the session, never from the request.
    if comic.status != "ready" or comic.path is None or not comic.path.is_file():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The comic is not ready")
    return comic.path


@router.get("/{show_id}/comic", response_model=ComicInfo)
def comic_status(show_id: str, request: Request) -> ComicInfo:
    return show_record(request, show_id).comic.info()


@router.get("/{show_id}/comic.pdf", response_class=FileResponse)
def comic_pdf(show_id: str, request: Request) -> FileResponse:
    path = _ready_path(request, show_id)
    return FileResponse(path, media_type="application/pdf", filename=path.name, content_disposition_type="inline")


@router.post("/{show_id}/comic/reveal", status_code=status.HTTP_204_NO_CONTENT)
def comic_reveal(show_id: str, request: Request) -> Response:
    reveal_in_explorer(_ready_path(request, show_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{show_id}/comic/retry", response_model=ComicInfo, status_code=status.HTTP_202_ACCEPTED)
def comic_retry(show_id: str, request: Request) -> ComicInfo:
    record = show_record(request, show_id)
    if record.comic.status != "failed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only a failed comic can be retried")
    request.app.state.comic_worker.start(record)
    return record.comic.info()
