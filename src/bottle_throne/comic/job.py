"""Comic PDF generation: once a show's story is final, headless Chromium prints the /comic/{id} page."""

import asyncio
import json
import logging
import threading
from collections.abc import Awaitable, Callable
from concurrent.futures import Future
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel

if TYPE_CHECKING:
    from bottle_throne.sessions import SessionRecord

log = logging.getLogger(__name__)

ComicStatus = Literal["pending", "generating", "ready", "failed", "off"]
FINAL: frozenset[str] = frozenset({"ready", "failed", "off"})
READY_TIMEOUT_MS = 120_000

# (page url, pdf path, allowed origin) -> writes the PDF
Renderer = Callable[[str, Path, str], Awaitable[None]]


class ComicInfo(BaseModel):
    """Public comic status. The file's location on disk is never sent to the browser."""

    status: ComicStatus
    error: str | None = None
    file_name: str | None = None


@dataclass
class ComicState:
    status: ComicStatus = "pending"
    path: Path | None = None
    folder: Path | None = None
    error: str | None = None
    version: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def set(self, status: ComicStatus, path: Path | None = None, error: str | None = None) -> None:
        with self._lock:
            self.status = status
            self.path = path
            self.error = error
            self.version += 1

    @property
    def final(self) -> bool:
        return self.status in FINAL

    def info(self) -> ComicInfo:
        with self._lock:
            return ComicInfo(status=self.status, error=self.error, file_name=self.path.name if self.path else None)


def output_folder(root: Path, created_at: datetime) -> Path:
    """`output/<YYYY-MM-DD_HHMM>`, with a numeric suffix when two shows start in the same minute."""
    base = root / created_at.strftime("%Y-%m-%d_%H%M")
    folder, n = base, 2
    while folder.exists():
        folder = base.with_name(f"{base.name}_{n}")
        n += 1
    return folder


def show_record(record: "SessionRecord") -> dict:
    """The archival record: everything needed to re-check the result and regenerate the comic."""
    story = record.story
    return {
        "show": record.public().model_dump(mode="json"),
        "reveal": record.reveal().model_dump(mode="json"),
        "roster": record.canonical_roster,
        "fate": record.fate.model_dump(mode="json"),
        "bible": story.bible.model_dump(mode="json") if story.bible else None,
        "scenes": [story.scenes[i].model_dump(mode="json") for i in sorted(story.scenes)],
        "chronicle": story.chronicle.model_dump(mode="json") if story.chronicle else None,
    }


def failure_reason(error: BaseException) -> str:
    text = str(error).strip().splitlines()
    reason = text[0] if text else type(error).__name__
    if "Executable doesn't exist" in str(error):
        reason = "Headless Chromium is not installed. Run: python -m playwright install chromium"
    return reason[:300]


async def print_with_playwright(url: str, pdf: Path, origin: str) -> None:
    from playwright.async_api import Error as PlaywrightError
    from playwright.async_api import async_playwright

    async with async_playwright() as playwright:
        try:
            browser = await playwright.chromium.launch()
        except PlaywrightError as missing:
            # Without Playwright's own Chromium, an installed Chrome or Edge works too.
            for channel in ("chrome", "msedge"):
                try:
                    browser = await playwright.chromium.launch(channel=channel)
                    break
                except PlaywrightError:
                    continue
            else:
                raise missing
        try:
            page = await browser.new_page()

            async def local_only(route) -> None:  # noqa: ANN001 - Playwright route
                request_url = route.request.url
                if request_url.startswith(origin) or request_url.startswith(("data:", "blob:")):
                    await route.continue_()
                else:
                    await route.abort()

            await page.route("**/*", local_only)
            await page.goto(url, wait_until="load")
            await page.wait_for_function("window.__comicReady === true || !!window.__comicError", timeout=READY_TIMEOUT_MS)
            error = await page.evaluate("window.__comicError || null")
            if error:
                raise RuntimeError(f"The comic page failed: {error}")
            await page.pdf(path=str(pdf), format="A4", print_background=True, prefer_css_page_size=True)
        finally:
            await browser.close()


class ComicWorker:
    """Runs comic jobs on its own event loop thread, so printing never touches the live show."""

    def __init__(self, output_dir: Path, base_url: str, enabled: bool = True, renderer: Renderer | None = None) -> None:
        self.output_dir = output_dir
        self.base_url = base_url.rstrip("/")
        self.enabled = enabled
        self.renderer = renderer or print_with_playwright
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, name="comic-worker", daemon=True)
        self._thread.start()

    def start(self, record: "SessionRecord") -> Future[None] | None:
        if not self.enabled:
            record.comic.set("off")
            return None
        if record.comic.status == "generating":
            return None
        record.comic.set("generating")
        return asyncio.run_coroutine_threadsafe(self._run(record), self._loop)

    async def _run(self, record: "SessionRecord") -> None:
        state = record.comic
        try:
            folder = state.folder or output_folder(self.output_dir, record.created_at)
            folder.mkdir(parents=True, exist_ok=True)
            state.folder = folder
            (folder / "show.json").write_text(
                json.dumps(show_record(record), ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
            )
            pdf = folder / f"bottle-throne_{record.created_at:%Y-%m-%d}.pdf"
            await self.renderer(f"{self.base_url}/comic/{record.id}?print=1", pdf, self.base_url)
            if not pdf.is_file():
                raise RuntimeError("The browser finished without writing a PDF")
            state.set("ready", path=pdf)
            log.info("Comic ready: %s", pdf)
        except Exception as error:  # noqa: BLE001 - a failed comic must never disturb the show
            log.exception("Comic generation failed for show %s", record.id)
            state.set("failed", error=failure_reason(error))

    def stop(self) -> None:
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=5)


def reveal_in_explorer(path: Path) -> None:
    """Open the system file browser with the file selected (Windows) or its folder (elsewhere)."""
    import subprocess
    import sys

    if sys.platform == "win32":
        subprocess.Popen(["explorer.exe", f"/select,{path}"])  # noqa: S603, S607 - fixed program, session-owned path
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", str(path)])  # noqa: S603, S607
    else:
        subprocess.Popen(["xdg-open", str(path.parent)])  # noqa: S603, S607
