import asyncio
import logging
import re
import sqlite3
import time
from contextlib import closing
from pathlib import Path

import pytest

from bottle_throne.story.exchange_log import ExchangeLog, RequestRecord, ResponseRecord


def request(number: int = 1, body: str = '{"messages": []}') -> RequestRecord:
    return RequestRecord(f"a{number}", "invocation", number, "2026-10-28T17:00:00+00:00", "v1", "model", body)


def response(body: str = '{"choices": []}') -> ResponseRecord:
    return ResponseRecord("2026-10-28T17:00:01+00:00", 1000, "http_response", 200, body)


def rows(path: Path, table: str) -> list[sqlite3.Row]:
    assert table in {"model_requests", "model_responses"}
    with closing(sqlite3.connect(path)) as connection:
        connection.row_factory = sqlite3.Row
        return list(connection.execute(f"SELECT * FROM {table} ORDER BY rowid"))


async def test_lazy_schema_pending_and_persistent_history(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "log.sqlite3"
    store = ExchangeLog(path, [])
    assert not path.exists()
    await store.record_request(request())
    assert len(rows(path, "model_requests")) == 1
    assert rows(path, "model_responses") == []

    await ExchangeLog(path, []).record_response(request(), response())
    await ExchangeLog(path, []).record_response(request(2), response("second"))
    await store.record_response(request(), response("must not overwrite"))
    assert len(rows(path, "model_requests")) == 2
    assert [row["response_body"] for row in rows(path, "model_responses")] == ['{"choices": []}', "second"]
    with closing(sqlite3.connect(path)) as connection:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute(
            "SELECT count(*) FROM model_requests JOIN model_responses USING(attempt_id)"
        ).fetchone()[0] == 2
        connection.execute("PRAGMA foreign_keys=ON")
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO model_responses VALUES ('orphan', 'now', 0, 'http_response', 200, '', NULL, NULL)"
            )


async def test_concurrent_operations_off_event_loop(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import threading

    store = ExchangeLog(tmp_path / "log.sqlite3", [])
    loop_thread = threading.get_ident()
    thread_ids: list[int] = []
    original = store._write

    def write(req: RequestRecord, res: ResponseRecord | None) -> None:
        thread_ids.append(threading.get_ident())
        original(req, res)

    monkeypatch.setattr(store, "_write", write)
    await asyncio.gather(*(store.record_response(request(i), response(str(i))) for i in range(12)))
    assert len(rows(store.path, "model_responses")) == 12
    assert all(thread != loop_thread for thread in thread_ids)


async def test_locked_database_is_bounded_and_recovers(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    store = ExchangeLog(tmp_path / "log.sqlite3", [])
    await store.record_request(request())
    with closing(sqlite3.connect(store.path)) as blocker:
        blocker.execute("BEGIN IMMEDIATE")
        start = time.monotonic()
        await store.record_request(request(2))
        elapsed = time.monotonic() - start
        assert 0.15 <= elapsed < 2.0
        assert "logging request failed" in caplog.text
        blocker.rollback()
    await store.record_response(request(2), response())
    assert len(rows(store.path, "model_requests")) == 2
    assert len(rows(store.path, "model_responses")) == 1


async def test_request_write_failure_recovered_with_result(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    store = ExchangeLog(tmp_path / "log.sqlite3", [])
    original = store._write

    def fail(req: RequestRecord, res: ResponseRecord | None) -> None:
        raise sqlite3.OperationalError("simulated write failure")

    monkeypatch.setattr(store, "_write", fail)
    await store.record_request(request())
    assert "simulated write failure" in caplog.text
    monkeypatch.setattr(store, "_write", original)
    await store.record_response(request(), response())
    assert len(rows(store.path, "model_requests")) == len(rows(store.path, "model_responses")) == 1


@pytest.mark.parametrize("kind", ["directory", "corrupt", "parent_file", "schema"])
async def test_invalid_database_reports_error(tmp_path: Path, caplog: pytest.LogCaptureFixture, kind: str) -> None:
    path = tmp_path / "log.sqlite3"
    if kind == "directory":
        path.mkdir()
    elif kind == "corrupt":
        path.write_text("not a database")
    elif kind == "parent_file":
        path.write_text("parent is a file")
        path = path / "child.sqlite3"
    else:
        with closing(sqlite3.connect(path)) as connection:
            connection.execute("CREATE TABLE model_requests (wrong_column TEXT)")
    await ExchangeLog(path, []).record_request(request())
    assert "Model exchange logging request failed" in caplog.text


async def test_masks_literal_and_json_escaped_secrets_without_clipping(tmp_path: Path) -> None:
    secret = "sk-private-123"
    escaped = "".join(f"\\u{ord(char):04x}" for char in secret)
    store = ExchangeLog(tmp_path / "log.sqlite3", [secret])
    body = '{"name": "Jääskeläinen", "text": "' + ("story " * 5000) + secret + " " + escaped + '"}'
    await store.record_response(request(body=body), response(body))
    for table, field in (("model_requests", "request_body"), ("model_responses", "response_body")):
        logged = rows(store.path, table)[0][field]
        assert logged == body.replace(secret, "***").replace(escaped, "***")
    assert store.mask("key=" + secret) == "key=***"


@pytest.mark.parametrize("secret", ['sk-A/b"é', "sk-A🔑"])
def test_mask_handles_mixed_and_nested_json_escapes(tmp_path: Path, secret: str) -> None:
    store = ExchangeLog(tmp_path / "log.sqlite3", [secret])
    encoded = "".join(
        char if index % 2 == 0 else (
            f"\\u{ord(char):04X}" if ord(char) <= 0xFFFF else "\\uD83D\\uDD11"
        )
        for index, char in enumerate(secret)
    )
    assert store.mask(encoded) == "***"
    assert store.mask(encoded.replace("\\", "\\\\")) == "***"
    assert store.mask("not the key") == "not the key"


async def test_serialization_failure_is_visible_and_masks_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    store = ExchangeLog(tmp_path / "log.sqlite3", ["sk-sensitive"])

    def fail(req: RequestRecord, res: ResponseRecord | None) -> None:
        raise ValueError("cannot serialize sk-sensitive")

    monkeypatch.setattr(store, "_write", fail)
    with caplog.at_level(logging.ERROR):
        await store.record_response(request(), response())
    assert "logging response failed" in caplog.text
    assert "cannot serialize ***" in caplog.text
    assert "sk-sensitive" not in caplog.text


async def test_readme_queries_show_full_exchanges_and_pending_requests(tmp_path: Path) -> None:
    store = ExchangeLog(tmp_path / "log.sqlite3", [])
    body = '{"messages":[{"role":"user","content":"full prompt"}]}'
    await store.record_response(request(body=body), response("raw output"))
    await store.record_request(request(2, body))
    readme = Path(__file__).resolve().parents[2] / "README.md"
    queries = re.findall(r"```sql\n(.*?)```", readme.read_text(encoding="utf-8"), flags=re.DOTALL)
    assert len(queries) == 2
    with closing(sqlite3.connect(store.path)) as connection:
        connection.row_factory = sqlite3.Row
        all_attempts = connection.execute(queries[0]).fetchall()
        pending = connection.execute(queries[1]).fetchall()
    assert len(all_attempts) == 2
    assert all_attempts[0]["request_body"] == body and all_attempts[0]["response_body"] == "raw output"
    assert '"full prompt"' in all_attempts[0]["messages"]
    assert [row["attempt_id"] for row in pending] == ["a2"]
