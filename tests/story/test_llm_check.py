import json
import sqlite3
from contextlib import closing
from pathlib import Path

import httpx
import pytest

from bottle_throne.config import Settings
from bottle_throne.story import check
from bottle_throne.story.llm import create_llm

KEY = "sk-check-key-999"


def settings(**overrides: str) -> Settings:
    values = {
        "FOUNDRY_API_KEY": KEY,
        "FOUNDRY_API_ENDPOINT": "https://r.services.ai.azure.com",
        "FOUNDRY_LLM_DEPLOYMENT_NAME": "gpt-test",
    }
    values.update(overrides)
    return Settings(_env_file=None, **{k: v for k, v in values.items() if v})


def patch_transport(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    def fake_create(s: Settings):
        return create_llm(s, httpx.AsyncClient(transport=httpx.MockTransport(handler)))

    monkeypatch.setattr(check, "create_llm", fake_create)


async def test_missing_config(llm_log_path: Path) -> None:
    ok, lines = await check.llm_check(settings(FOUNDRY_LLM_DEPLOYMENT_NAME=""))
    assert not ok
    assert lines[0] == "FAIL config: missing FOUNDRY_LLM_DEPLOYMENT_NAME"
    assert not llm_log_path.exists()


async def test_deployment_not_found(monkeypatch: pytest.MonkeyPatch, llm_log_path: Path) -> None:
    patch_transport(monkeypatch, lambda r: httpx.Response(404, json={"error": {"code": "DeploymentNotFound"}}))

    ok, lines = await check.llm_check(settings())

    assert not ok
    assert lines[0].startswith("FAIL not_found")
    assert all(KEY not in line for line in lines)
    with closing(sqlite3.connect(llm_log_path)) as connection:
        row, = connection.execute("SELECT http_status, response_body FROM model_responses").fetchall()
    assert row[0] == 404 and json.loads(row[1])["error"]["code"] == "DeploymentNotFound"


async def test_success_reports_mode(monkeypatch: pytest.MonkeyPatch, llm_log_path: Path) -> None:
    body = {
        "id": "c",
        "object": "chat.completion",
        "created": 0,
        "model": "m",
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": '{"ok": true, "word": "throne"}'}, "finish_reason": "stop"}
        ],
    }
    patch_transport(monkeypatch, lambda r: httpx.Response(200, json=body))

    ok, lines = await check.llm_check(settings())

    assert ok
    assert "Structured output: strict JSON schema" in lines
    assert lines[-1] == "OK"
    assert all(KEY not in line for line in lines)
    with closing(sqlite3.connect(llm_log_path)) as connection:
        row, = connection.execute(
            "SELECT request_body, response_body FROM model_requests JOIN model_responses USING(attempt_id)"
        ).fetchall()
    assert "connectivity check" in json.loads(row[0])["messages"][0]["content"]
    assert json.loads(row[1]) == body
