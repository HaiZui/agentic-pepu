"""Comic PDF job: real browser integration, failure handling and session-only file paths."""

import json
import socket
import threading
import time
from pathlib import Path

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient

from bottle_throne.app import create_app
from bottle_throne.comic import job
from bottle_throne.config import REPO_ROOT, Settings

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Liisa", "Pekka"]
A4 = (595, 842)  # points, portrait


def settings(tmp_path: Path, port: int = 8765, **overrides) -> Settings:
    values = {"comic_enabled": True, "output_dir": tmp_path / "output", "port": port, **overrides}
    return Settings(
        _env_file=None,
        foundry_api_key=None,
        foundry_api_endpoint=None,
        foundry_llm_deployment_name=None,
        **values,
    )


def wait_final(get, show_id: str, timeout: float = 150) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        info = get(f"/api/shows/{show_id}/comic").json()
        if info["status"] in job.FINAL:
            return info
        time.sleep(0.25)
    raise AssertionError("The comic did not finish in time")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.skipif(not (REPO_ROOT / "web" / "dist" / "index.html").is_file(), reason="needs the built front end (npm run build)")
def test_fallback_show_prints_an_a4_comic(tmp_path: Path) -> None:
    from pypdf import PdfReader

    port = free_port()
    server = uvicorn.Server(uvicorn.Config(create_app(settings(tmp_path, port)), host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        while not server.started:
            time.sleep(0.05)
        with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=30) as client:
            show = client.post("/api/shows", json={"participants": NAMES}).json()
            info = wait_final(client.get, show["id"])
            assert info["status"] == "ready", info
            assert info["file_name"].startswith("bottle-throne_") and info["file_name"].endswith(".pdf")

            folders = list((tmp_path / "output").iterdir())
            assert len(folders) == 1
            pdf = folders[0] / info["file_name"]
            assert pdf.is_file()
            record = json.loads((folders[0] / "show.json").read_text(encoding="utf-8"))
            assert {"show", "reveal", "roster", "fate", "storyline", "bible", "scenes", "chronicle"} <= record.keys()
            assert record["show"]["id"] == show["id"]

            reader = PdfReader(pdf)
            assert 16 <= len(reader.pages) <= 32
            for page in reader.pages:
                size = (round(float(page.mediabox.width)), round(float(page.mediabox.height)))
                assert size == A4
                # Figures, scenery and lettering are vector paths and embedded fonts, never raster images.
                xobjects = (page.get("/Resources") or {}).get("/XObject")
                images = [x for x in (xobjects.get_object().values() if xobjects else []) if x.get_object().get("/Subtype") == "/Image"]
                assert images == []
            assert NAMES[3] in reader.pages[0].extract_text()  # the cover's "Starring" line is real text

            served = client.get(f"/api/shows/{show['id']}/comic.pdf")
            assert served.status_code == 200
            assert served.headers["content-type"] == "application/pdf"
            assert served.content == pdf.read_bytes()
    finally:
        server.should_exit = True
        thread.join(timeout=10)


def test_launch_failure_is_reported_and_the_show_is_unaffected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def broken(url: str, pdf: Path, origin: str) -> None:
        calls.append(url)
        if len(calls) == 1:
            raise RuntimeError("BrowserType.launch: Executable doesn't exist at C:\\nowhere\\chrome.exe\nmore details")
        pdf.write_bytes(b"%PDF-1.7 fake")

    monkeypatch.setattr(job, "print_with_playwright", broken)
    with TestClient(create_app(settings(tmp_path))) as client:
        show = client.post("/api/shows", json={"participants": NAMES}).json()
        info = wait_final(client.get, show["id"], timeout=30)
        assert info["status"] == "failed"
        assert "playwright install chromium" in info["error"]
        assert "nowhere" not in info["error"]

        # The show itself keeps working.
        assert client.get(f"/api/shows/{show['id']}/fate").status_code == 200
        assert client.get(f"/api/shows/{show['id']}/scenes/0").status_code == 200
        assert client.get(f"/api/shows/{show['id']}/chronicle-texts").status_code == 200
        assert client.get(f"/api/shows/{show['id']}/comic.pdf").status_code == 409

        retried = client.post(f"/api/shows/{show['id']}/comic/retry")
        assert retried.status_code == 202
        assert wait_final(client.get, show["id"], timeout=30)["status"] == "ready"
        assert client.post(f"/api/shows/{show['id']}/comic/retry").status_code == 409
        assert calls[0].endswith(f"/comic/{show['id']}?print=1")


def test_comic_off_is_final(tmp_path: Path) -> None:
    with TestClient(create_app(settings(tmp_path, comic_enabled=False))) as client:
        show = client.post("/api/shows", json={"participants": NAMES}).json()
        assert wait_final(client.get, show["id"], timeout=30) == {"status": "off", "error": None, "file_name": None}
        assert not (tmp_path / "output").exists()


def test_file_paths_come_from_the_session_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(url: str, pdf: Path, origin: str) -> None:
        pdf.write_bytes(b"%PDF-1.7 fake")

    revealed: list[Path] = []
    monkeypatch.setattr(job, "print_with_playwright", fake)
    monkeypatch.setattr("bottle_throne.api.comic.reveal_in_explorer", revealed.append)
    secret = tmp_path / "secret.pdf"
    secret.write_bytes(b"%PDF secret")

    with TestClient(create_app(settings(tmp_path))) as client:
        show = client.post("/api/shows", json={"participants": NAMES}).json()
        info = wait_final(client.get, show["id"], timeout=30)
        assert info["status"] == "ready"
        assert set(info) == {"status", "error", "file_name"}  # no folder or full path is exposed

        base = f"/api/shows/{show['id']}/comic"
        hostile = {"path": str(secret), "file": "..\\..\\secret.pdf", "folder": str(tmp_path)}
        assert client.post(f"{base}/reveal", params=hostile, json=hostile).status_code == 204
        response = client.get(f"{base}.pdf", params=hostile)
        assert response.content == b"%PDF-1.7 fake"

        record = client.app.state.sessions.get(show["id"])
        assert revealed == [record.comic.path]
        assert record.comic.path.parent.parent == tmp_path / "output"

        # Unknown shows and path-like ids never reach the file system.
        assert client.post("/api/shows/..%5C..%5Csecret/comic/reveal").status_code == 404
        assert client.get("/api/shows/nope/comic.pdf").status_code == 404
        assert len(revealed) == 1


def test_output_folder_suffix(tmp_path: Path) -> None:
    from datetime import datetime

    when = datetime(2026, 10, 30, 15, 4)
    first = job.output_folder(tmp_path, when)
    assert first.name == "2026-10-30_1504"
    first.mkdir()
    assert job.output_folder(tmp_path, when).name == "2026-10-30_1504_2"
