import argparse
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bottle_throne.app import create_app
from bottle_throne.config import FOUNDRY_VARIABLES, Settings

SECRET = "sk-super-secret-value-123"


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in FOUNDRY_VARIABLES:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>INDEX</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('app')", encoding="utf-8")
    (tmp_path / "outside.txt").write_text("OUTSIDE", encoding="utf-8")
    return dist


def make_settings(**overrides: str) -> Settings:
    values = {
        "FOUNDRY_API_KEY": SECRET,
        "FOUNDRY_API_ENDPOINT": "https://example.openai.azure.com",
        "FOUNDRY_LLM_DEPLOYMENT_NAME": "gpt-test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **{k: v for k, v in values.items() if v})


def test_root_returns_index(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(), static_dir))

    response = client.get("/")

    assert response.status_code == 200
    assert "INDEX" in response.text


def test_unknown_client_route_returns_index(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(), static_dir))

    response = client.get("/show/abc123")

    assert response.status_code == 200
    assert "INDEX" in response.text


def test_static_asset_served(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(), static_dir))

    response = client.get("/assets/app.js")

    assert response.status_code == 200
    assert "console.log" in response.text


def test_path_traversal_falls_back_to_index(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(), static_dir))

    response = client.get("/..%2Foutside.txt")

    assert "OUTSIDE" not in response.text


def test_unknown_api_route_is_404_json(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(), static_dir))

    response = client.get("/api/nope")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_missing_build_explains(tmp_path: Path) -> None:
    client = TestClient(create_app(make_settings(), tmp_path / "missing"))

    response = client.get("/")

    assert response.status_code == 503
    assert "npm run build" in response.text


def test_health_complete_config_hides_key(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(), static_dir))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"foundry": {"api_key": True, "endpoint": True, "deployment": True}}
    assert SECRET not in response.text


def test_health_reports_missing_deployment(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(FOUNDRY_LLM_DEPLOYMENT_NAME=""), static_dir))

    response = client.get("/api/health")

    assert response.json()["foundry"] == {"api_key": True, "endpoint": True, "deployment": False}
    assert SECRET not in response.text


def test_openapi_does_not_contain_key(static_dir: Path) -> None:
    client = TestClient(create_app(make_settings(), static_dir))

    assert SECRET not in client.get("/openapi.json").text


def test_app_and_openapi_export_do_not_initialize_database(
    static_dir: Path, llm_log_path: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from bottle_throne.__main__ import dump_openapi

    with TestClient(create_app(make_settings(), static_dir)) as client:
        assert client.get("/openapi.json").status_code == 200
    monkeypatch.setenv("FOUNDRY_API_KEY", SECRET)
    monkeypatch.setenv("FOUNDRY_API_ENDPOINT", "https://r.services.ai.azure.com")
    monkeypatch.setenv("FOUNDRY_LLM_DEPLOYMENT_NAME", "test")
    from bottle_throne.config import get_settings

    get_settings.cache_clear()
    try:
        assert dump_openapi(argparse.Namespace(path=str(tmp_path / "openapi.json"))) == 0
    finally:
        get_settings.cache_clear()
    assert not llm_log_path.exists()


@pytest.mark.parametrize("filename", ["assets/model-exchanges.sqlite3", "index.html"])
def test_database_and_companions_are_never_static_assets(static_dir: Path, filename: str) -> None:
    database = static_dir / filename
    if database.exists():
        database.unlink()
    with closing(sqlite3.connect(database)) as connection:
        connection.execute("CREATE TABLE sensitive_content (content TEXT)")
        connection.execute("INSERT INTO sensitive_content VALUES ('PRIVATE STORY CONTENT')")
        connection.commit()
    config = make_settings(BOTTLE_THRONE_LLM_LOG_DB=str(database))
    for suffix in ("-wal", "-shm", "-journal"):
        database.with_name(database.name + suffix).write_text("PRIVATE STORY CONTENT")
    with TestClient(create_app(config, static_dir)) as client:
        for suffix in ("", "-wal", "-shm", "-journal"):
            result = client.get("/" + filename + suffix)
            assert result.status_code == 404
            assert "PRIVATE STORY CONTENT" not in result.text
        assert client.get("/api/model-exchanges").status_code == 404
