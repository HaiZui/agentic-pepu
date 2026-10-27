from fastapi.testclient import TestClient

from bottle_throne.app import create_app
from bottle_throne.config import Settings
from bottle_throne.fate.catalog import SETTINGS


def test_catalog_endpoint() -> None:
    body = TestClient(create_app(Settings(_env_file=None))).get("/api/catalog").json()

    assert body["emotions"] == [
        "neutral", "smug", "scheming", "furious", "terrified", "grieving", "triumphant", "dead",
    ]
    assert "fall" in body["actions"] and "exit" in body["actions"]
    assert len(body["sfx_cues"]) == 20 and "shink" in body["sfx_cues"]
    assert body["music_moods"][0] == "overture"
    assert "splash" in body["framings"]
    assert body["settings"] == list(SETTINGS)
    assert body["narrator"] == "narrator"
    assert body["reading"] == {"base_seconds": 1.2, "per_char_seconds": 0.055, "max_line_chars": 140}
