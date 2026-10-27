from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from bottle_throne import __version__
from bottle_throne.api import catalog, comic, health, shows, story
from bottle_throne.comic.job import ComicWorker
from bottle_throne.config import REPO_ROOT, Settings, get_settings
from bottle_throne.logging_utils import install_secret_masking
from bottle_throne.sessions import SessionStore
from bottle_throne.story.llm import create_llm
from bottle_throne.story.scheduler import StoryWorker

DEFAULT_STATIC_DIR = REPO_ROOT / "web" / "dist"

NOT_BUILT_HTML = """<!doctype html><html><body style="font-family:sans-serif">
<h1>The Bottle Throne</h1><p>The front end has not been built yet.
Run <code>npm install</code> and <code>npm run build</code> in <code>web/</code>,
or start the app with <code>scripts/start.ps1</code>.</p></body></html>"""


@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield
    app.state.story_worker.stop()
    app.state.comic_worker.stop()


def create_app(settings: Settings | None = None, static_dir: Path | None = None) -> FastAPI:
    settings = settings or get_settings()
    install_secret_masking(settings.secret_values())

    app = FastAPI(title="The Bottle Throne", version=__version__, lifespan=_lifespan)
    app.state.settings = settings
    app.state.sessions = SessionStore()
    app.state.story_worker = StoryWorker(create_llm(settings))
    app.state.comic_worker = ComicWorker(
        settings.output_dir, f"http://127.0.0.1:{settings.port}", enabled=settings.comic_enabled
    )

    api = APIRouter(prefix="/api")
    api.include_router(health.router)
    api.include_router(catalog.router)
    api.include_router(shows.router)
    api.include_router(story.router)
    api.include_router(comic.router)
    app.include_router(api)

    @app.api_route("/api/{_rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    def api_not_found(_rest: str) -> None:
        raise HTTPException(status_code=404, detail="Not Found")

    _mount_spa(app, (static_dir or DEFAULT_STATIC_DIR).resolve())
    return app


def _mount_spa(app: FastAPI, static_dir: Path) -> None:
    """Serve built front-end files, falling back to index.html for client-side routes."""

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        index = static_dir / "index.html"
        if not index.is_file():
            return HTMLResponse(NOT_BUILT_HTML, status_code=503)
        if full_path:
            candidate = (static_dir / full_path).resolve()
            if candidate.is_relative_to(static_dir) and candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(index)
