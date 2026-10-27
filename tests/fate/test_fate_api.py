from fastapi.testclient import TestClient

from bottle_throne.app import create_app
from bottle_throne.config import Settings
from bottle_throne.fate.fairness import seal_of_fate
from bottle_throne.fate.validate import validate
from bottle_throne.models.fate import FateScript

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa"]


def client() -> TestClient:
    return TestClient(create_app(Settings(_env_file=None)))


def test_fate_is_generated_at_creation_without_seed() -> None:
    c = client()
    show = c.post("/api/shows", json={"participants": NAMES, "old_king": "aino"}).json()
    seed = c.app.state.sessions.get(show["id"]).seed

    response = c.get(f"/api/shows/{show['id']}/fate")

    assert response.status_code == 200
    assert seed not in response.text
    assert "seed" not in response.json()
    script = FateScript.model_validate(response.json())
    assert validate(script) == []
    assert script.seed_mode == "auto"
    assert next(ch for ch in script.characters if ch.id == script.old_king).name == "Aino"


def test_reveal_reproduces_seal() -> None:
    c = client()
    show = c.post("/api/shows", json={"participants": NAMES, "old_king": "Jukka", "seed": "friday-42"}).json()
    fate = c.get(f"/api/shows/{show['id']}/fate").json()

    reveal = c.post(f"/api/shows/{show['id']}/reveal").json()

    assert reveal == {"seed": "friday-42", "seed_mode": "manual", "engine_version": "fate-1", "seal": fate["seal"]}
    assert seal_of_fate(reveal["seed"], NAMES, "Jukka", reveal["engine_version"]) == fate["seal"]


def test_manual_seed_replays_identically() -> None:
    c = client()
    a = c.post("/api/shows", json={"participants": NAMES, "seed": "replay"}).json()
    b = c.post("/api/shows", json={"participants": list(reversed(NAMES)), "seed": "replay"}).json()

    assert c.get(f"/api/shows/{a['id']}/fate").json() == c.get(f"/api/shows/{b['id']}/fate").json()


def test_unknown_show_endpoints_404() -> None:
    c = client()
    assert c.get("/api/shows/nope/fate").status_code == 404
    assert c.post("/api/shows/nope/reveal").status_code == 404
