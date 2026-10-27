import json

from fastapi.testclient import TestClient

from bottle_throne.app import create_app
from bottle_throne.config import Settings
from bottle_throne.models.show import ShowRequest
from bottle_throne.models.story import SceneScript

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa"]


def read_events(client: TestClient, show_id: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    with client.stream("GET", f"/api/shows/{show_id}/events") as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        name = ""
        for line in response.iter_lines():
            if line.startswith("event: "):
                name = line[len("event: ") :]
            elif line.startswith("data: "):
                events.append((name, json.loads(line[len("data: ") :])))
    return events


def test_events_then_identical_scene_fetches() -> None:
    with TestClient(create_app(Settings(_env_file=None))) as client:
        show = client.post("/api/shows", json={"participants": NAMES}).json()
        fate = client.get(f"/api/shows/{show['id']}/fate").json()

        events = read_events(client, show["id"])

        names = [name for name, _ in events]
        assert names[0] == "status" and names[-1] == "complete"
        beat_events = [data for name, data in events if name == "beat"]
        assert sorted(e["index"] for e in beat_events) == list(range(len(fate["beats"])))
        assert {e["status"] for e in beat_events} == {"fallback"}

        for index in range(len(fate["beats"])):
            first = client.get(f"/api/shows/{show['id']}/scenes/{index}")
            second = client.get(f"/api/shows/{show['id']}/scenes/{index}")
            assert first.status_code == 200 and first.json() == second.json()
            scene = SceneScript.model_validate(first.json())
            assert scene.is_fallback and scene.beat_index == index

        status = client.get(f"/api/shows/{show['id']}/story").json()
        assert status["complete"] and status["bible_ready"] and status["chronicle_ready"]
        assert client.get(f"/api/shows/{show['id']}/bible").status_code == 200
        texts = client.get(f"/api/shows/{show['id']}/chronicle-texts").json()
        assert len(texts["epilogue"].split()) <= 120


def test_unknown_beat_and_show() -> None:
    with TestClient(create_app(Settings(_env_file=None))) as client:
        show = client.post("/api/shows", json={"participants": NAMES}).json()
        assert client.get(f"/api/shows/{show['id']}/scenes/999").status_code == 404
        assert client.get("/api/shows/nope/scenes/0").status_code == 404
        assert client.get("/api/shows/nope/events").status_code == 404


def test_scene_not_ready_is_409() -> None:
    with TestClient(create_app(Settings(_env_file=None))) as client:
        record = client.app.state.sessions.create(ShowRequest(participants=NAMES))
        assert client.get(f"/api/shows/{record.id}/scenes/0").status_code == 409
        assert client.get(f"/api/shows/{record.id}/bible").status_code == 409
