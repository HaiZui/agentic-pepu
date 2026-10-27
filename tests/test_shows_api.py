import pytest
from fastapi.testclient import TestClient

from bottle_throne.app import create_app
from bottle_throne.config import Settings


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(Settings(_env_file=None), tmp_path / "dist"))


def session_count(client: TestClient) -> int:
    return len(client.app.state.sessions)


def test_create_show_returns_201_and_id(client: TestClient) -> None:
    response = client.post(
        "/api/shows", json={"participants": ["Matti", "", "  Aino  ", "Jääskeläinen"]}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["id"]
    assert [p["name"] for p in body["participants"]] == ["Matti", "Aino", "Jääskeläinen"]
    assert body["old_king"] == {"name": "the Mad King", "is_mad_king": True, "is_participant": False}
    assert body["seed_mode"] == "auto"


def test_get_show_round_trip(client: TestClient) -> None:
    created = client.post(
        "/api/shows", json={"participants": ["Matti", "Aino", "Kalle"], "old_king": "Aino"}
    ).json()

    response = client.get(f"/api/shows/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created
    assert response.json()["old_king"]["is_participant"] is True


def test_manual_seed_marked_and_not_exposed(client: TestClient) -> None:
    response = client.post(
        "/api/shows", json={"participants": ["Matti", "Aino", "Kalle"], "seed": "friday-42"}
    )

    assert response.json()["seed_mode"] == "manual"
    assert "friday-42" not in response.text
    assert "friday-42" not in client.get(f"/api/shows/{response.json()['id']}").text


def test_unknown_show_404(client: TestClient) -> None:
    assert client.get("/api/shows/does-not-exist").status_code == 404


@pytest.mark.parametrize(
    ("payload", "rule"),
    [
        ({"participants": ["Matti", "Aino"]}, "roster_too_small"),
        ({"participants": [f"P{i}" for i in range(41)]}, "roster_too_large"),
        ({"participants": ["Matti", "matti", "Aino"]}, "duplicate_name"),
        ({"participants": ["Matti", "Aino", "x" * 25]}, "name_too_long"),
        ({"participants": ["Matti", "Aino", "Kalle"], "old_king": "y" * 25}, "old_king_too_long"),
    ],
)
def test_invalid_requests_create_no_session(client: TestClient, payload: dict, rule: str) -> None:
    response = client.post("/api/shows", json=payload)

    assert response.status_code == 422
    assert rule in {e["type"] for e in response.json()["detail"]}
    assert session_count(client) == 0
