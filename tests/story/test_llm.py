import asyncio
import json
import sqlite3
from contextlib import closing
from pathlib import Path

import httpx
import pytest
from pydantic import BaseModel

from bottle_throne.config import Settings
from bottle_throne.story.llm import LLMError, create_llm, resource_root, v1_base_url

KEY = "sk-test-key-123"


class Reply(BaseModel):
    word: str


def completion(content: str, finish_reason: str = "stop") -> dict:
    return {
        "id": "c1",
        "object": "chat.completion",
        "created": 0,
        "model": "gpt-test",
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": finish_reason}
        ],
        "usage": {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7},
    }


def settings(endpoint: str, api_version: str | None = None) -> Settings:
    values = {
        "FOUNDRY_API_KEY": KEY,
        "FOUNDRY_API_ENDPOINT": endpoint,
        "FOUNDRY_LLM_DEPLOYMENT_NAME": "gpt-test",
    }
    if api_version:
        values["FOUNDRY_API_VERSION"] = api_version
    return Settings(_env_file=None, **values)


def mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def exchanges(path: Path) -> list[sqlite3.Row]:
    with closing(sqlite3.connect(path)) as connection:
        connection.row_factory = sqlite3.Row
        return list(connection.execute(
            """SELECT q.*, s.finished_at, s.duration_ms, s.outcome, s.http_status,
                      s.response_body, s.error_type, s.error_message
               FROM model_requests q LEFT JOIN model_responses s USING(attempt_id)
               ORDER BY q.rowid"""
        ))


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://my-res.services.ai.azure.com",
        "https://my-res.services.ai.azure.com/",
        "https://my-res.services.ai.azure.com/api/projects/raffle",
        "https://my-res.openai.azure.com/openai/v1/",
    ],
)
def test_v1_base_url_normalization(endpoint: str) -> None:
    assert v1_base_url(endpoint) == f"{resource_root(endpoint)}/openai/v1/"
    assert v1_base_url(endpoint).count("/openai/v1/") == 1


def test_invalid_endpoint_is_config_error() -> None:
    with pytest.raises(LLMError) as error:
        resource_root("not a url")
    assert error.value.kind == "config"


async def test_v1_mode_request_shape() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=completion('{"word": "crown"}'))

    llm = create_llm(settings("https://my-res.services.ai.azure.com/api/projects/x"), mock_client(handler))
    assert llm is not None and llm.mode == "v1"

    reply = await llm.json([{"role": "user", "content": "hi"}], Reply)

    assert reply == Reply(word="crown")
    request = seen[0]
    assert str(request.url) == "https://my-res.services.ai.azure.com/openai/v1/chat/completions"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    body = json.loads(request.content)
    assert body["model"] == "gpt-test"
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True
    assert llm.usage.calls == 1 and llm.usage.completion_tokens == 4


@pytest.mark.parametrize("api_version", [None, "2024-10-21"])
async def test_default_transport_logs_real_http_exchange(
    llm_log_path: Path, monkeypatch: pytest.MonkeyPatch, api_version: str | None
) -> None:
    monkeypatch.setenv("NO_PROXY", "127.0.0.1")
    received: list[dict] = []
    raw = json.dumps(completion('{"word":"crown"}')).encode()

    async def respond(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            headers = await reader.readuntil(b"\r\n\r\n")
            length = next(
                int(line.split(b":", 1)[1])
                for line in headers.split(b"\r\n")
                if line.lower().startswith(b"content-length:")
            )
            received.append(json.loads(await reader.readexactly(length)))
            writer.write(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                + f"Content-Length: {len(raw)}\r\nConnection: close\r\n\r\n".encode()
                + raw
            )
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(respond, "127.0.0.1", 0)
    async with server:
        port = server.sockets[0].getsockname()[1]
        llm = create_llm(settings(f"http://127.0.0.1:{port}", api_version))
        assert llm is not None
        try:
            reply = await asyncio.wait_for(llm.json([{"role": "user", "content": "hi"}], Reply), 10)
        finally:
            await llm.client.close()

    assert reply == Reply(word="crown")
    record, = exchanges(llm_log_path)
    assert json.loads(record["request_body"]) == received[0]
    assert record["response_body"] == raw.decode()
    assert record["outcome"] == "http_response" and record["http_status"] == 200
    assert record["error_type"] is None


async def test_azure_mode_request_shape() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=completion('{"word": "throne"}'))

    llm = create_llm(settings("https://my-res.openai.azure.com/", "2024-10-21"), mock_client(handler))
    assert llm is not None and llm.mode == "azure"

    assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="throne")
    url = seen[0].url
    assert url.path == "/openai/deployments/gpt-test/chat/completions"
    assert url.params["api-version"] == "2024-10-21"
    assert seen[0].headers["api-key"] == KEY


async def test_falls_back_to_json_object_when_schema_unsupported(llm_log_path: Path) -> None:
    formats: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        kind = json.loads(request.content)["response_format"]["type"]
        formats.append(kind)
        if kind == "json_schema":
            return httpx.Response(400, json={"error": {"message": "response_format json_schema is not supported"}})
        return httpx.Response(200, json=completion('{"word": "goat"}'))

    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
    assert llm is not None

    assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="goat")
    assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="goat")
    assert formats == ["json_schema", "json_object", "json_object"]
    assert llm.strict_schema is False
    records = exchanges(llm_log_path)
    assert [json.loads(row["request_body"])["response_format"]["type"] for row in records] == formats
    assert [row["attempt_number"] for row in records] == [1, 2, 1]
    assert records[0]["invocation_id"] == records[1]["invocation_id"] != records[2]["invocation_id"]
    assert [row["http_status"] for row in records] == [400, 200, 200]
    assert "matching this JSON schema" in json.loads(records[1]["request_body"])["messages"][-1]["content"]


async def test_drops_temperature_when_model_only_supports_default(llm_log_path: Path) -> None:
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(body)
        if "temperature" in body:
            return httpx.Response(
                400,
                json={
                    "error": {
                        "code": "unsupported_value",
                        "param": "temperature",
                        "message": "Unsupported value: 'temperature' does not support 0.9 with this model.",
                    }
                },
            )
        return httpx.Response(200, json=completion('{"word": "egg"}'))

    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
    assert llm is not None

    assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="egg")
    assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="egg")
    assert ["temperature" in body for body in sent] == [True, False, False]
    assert llm.custom_temperature is False and llm.strict_schema is True
    records = exchanges(llm_log_path)
    assert [json.loads(row["request_body"]) for row in records] == sent
    assert [row["attempt_number"] for row in records] == [1, 2, 1]
    assert records[0]["invocation_id"] == records[1]["invocation_id"] != records[2]["invocation_id"]


async def test_rate_limit_carries_retry_after() -> None:
    response = httpx.Response(429, headers={"retry-after": "3"}, json={"error": {"message": "slow down"}})
    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(lambda r: response))
    assert llm is not None
    with pytest.raises(LLMError) as error:
        await llm.json([{"role": "user", "content": "hi"}], Reply)
    assert error.value.kind == "rate_limit" and error.value.retry_after == 3.0


async def test_drops_reasoning_effort_when_unsupported(llm_log_path: Path) -> None:
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append(body)
        if "reasoning_effort" in body:
            return httpx.Response(
                400, json={"error": {"param": "reasoning_effort", "message": "Unrecognized request argument"}}
            )
        return httpx.Response(200, json=completion('{"word": "egg"}'))

    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
    assert llm is not None

    assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="egg")
    assert [body.get("reasoning_effort") for body in sent] == ["low", None]
    assert llm.reasoning_effort is None
    records = exchanges(llm_log_path)
    assert [json.loads(row["request_body"]) for row in records] == sent
    assert [row["attempt_number"] for row in records] == [1, 2]
    assert records[0]["invocation_id"] == records[1]["invocation_id"]


@pytest.mark.parametrize(
    ("status", "body", "kind"),
    [
        (401, {"error": {"message": "bad key"}}, "auth"),
        (404, {"error": {"code": "DeploymentNotFound", "message": "no such deployment"}}, "not_found"),
        (400, {"error": {"code": "content_filter", "message": "filtered"}}, "content_filter"),
        (429, {"error": {"message": "slow down"}}, "rate_limit"),
        (500, {"error": {"message": "boom"}}, "http"),
    ],
)
async def test_errors_are_categorized(status: int, body: dict, kind: str) -> None:
    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(lambda r: httpx.Response(status, json=body)))
    assert llm is not None

    with pytest.raises(LLMError) as error:
        await llm.json([{"role": "user", "content": "hi"}], Reply)

    assert error.value.kind == kind
    assert KEY not in str(error.value)


async def test_content_filter_finish_reason() -> None:
    llm = create_llm(
        settings("https://r.services.ai.azure.com"),
        mock_client(lambda r: httpx.Response(200, json=completion("", finish_reason="content_filter"))),
    )
    assert llm is not None
    with pytest.raises(LLMError) as error:
        await llm.json([{"role": "user", "content": "hi"}], Reply)
    assert error.value.kind == "content_filter"


async def test_timeout_and_network_errors() -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    def offline(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    for handler, kind in ((timeout, "timeout"), (offline, "network")):
        llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
        assert llm is not None
        with pytest.raises(LLMError) as error:
            await llm.json([{"role": "user", "content": "hi"}], Reply)
        assert error.value.kind == kind


def test_incomplete_config_gives_no_client() -> None:
    assert create_llm(Settings(_env_file=None, FOUNDRY_API_KEY=KEY)) is None


def test_key_masked_in_client_repr() -> None:
    llm = create_llm(settings("https://r.services.ai.azure.com"))
    assert llm is not None
    assert KEY not in repr(llm)


def test_factory_uses_isolated_path_without_initializing(llm_log_path: Path) -> None:
    config = settings("https://r.services.ai.azure.com")
    assert config.llm_log_db == llm_log_path
    llm = create_llm(config)
    assert llm is not None and llm.exchange_capture is not None
    assert llm.exchange_capture.store.path == llm_log_path
    assert not llm_log_path.exists()


@pytest.mark.parametrize("api_version", [None, "2024-10-21"])
async def test_logs_actual_bodies_and_preserves_http_hooks(llm_log_path: Path, api_version: str | None) -> None:
    seen_requests: list[str] = []
    seen_responses: list[str] = []

    async def request_hook(req: httpx.Request) -> None:
        seen_requests.append(req.content.decode())

    async def response_hook(res: httpx.Response) -> None:
        await res.aread()
        seen_responses.append(res.text)

    http = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json=completion('{"word": "crown"}'))),
        event_hooks={"request": [request_hook], "response": [response_hook]},
    )
    llm = create_llm(settings("https://r.services.ai.azure.com", api_version), http)
    assert llm is not None
    messages = [
        {"role": "system", "content": "The theatre"},
        {"role": "user", "content": "Jääskeläinen " * 3000},
    ]
    assert await llm.json(messages, Reply) == Reply(word="crown")
    record, = exchanges(llm_log_path)
    assert record["request_body"] == seen_requests[0]
    assert json.loads(record["request_body"])["messages"] == messages
    assert record["response_body"] == seen_responses[0]
    assert record["api_mode"] == ("azure" if api_version else "v1")
    assert record["deployment"] == "gpt-test"
    assert record["started_at"].endswith("+00:00") and record["finished_at"].endswith("+00:00")
    assert record["duration_ms"] >= 0 and record["outcome"] == "http_response"
    assert KEY not in str(dict(record))
    assert http.event_hooks["request"][0] is request_hook
    assert http.event_hooks["response"][0] is response_hook
    assert llm.exchange_capture is not None
    assert http.event_hooks["request"].count(llm.exchange_capture.on_request) == 1
    assert http.event_hooks["response"].count(llm.exchange_capture.on_response) == 1
    await llm.client.close()


@pytest.mark.parametrize("strict", [True, False])
@pytest.mark.parametrize("case", ["valid", "malformed", "schema", "refusal", "length", "filter", "http"])
async def test_raw_output_retained_before_parsing(llm_log_path: Path, strict: bool, case: str) -> None:
    content = {"valid": '{"word":"egg"}', "malformed": '{"word":', "schema": '{"wrong":1}'}.get(case, "")
    reason = {"length": "length", "filter": "content_filter"}.get(case, "stop")
    body = completion(content, reason)
    status = 200
    if case == "refusal":
        body["choices"][0]["message"]["refusal"] = "Cannot help"
    if case == "http":
        status, body = 429, {"error": {"message": "slow down"}}
    raw = json.dumps(body, ensure_ascii=False)
    llm = create_llm(
        settings("https://r.services.ai.azure.com"),
        mock_client(lambda req: httpx.Response(status, content=raw, headers={"content-type": "application/json"})),
    )
    assert llm is not None
    llm.strict_schema = strict
    if case == "valid":
        assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="egg")
    else:
        with pytest.raises(LLMError) as error:
            await llm.json([{"role": "user", "content": "hi"}], Reply)
        expected = "invalid"
        if case == "http":
            expected = "rate_limit"
        elif case == "filter" or (case == "refusal" and strict):
            expected = "content_filter"
        assert error.value.kind == expected
    record, = exchanges(llm_log_path)
    assert record["response_body"] == raw and record["http_status"] == status
    assert record["outcome"] == "http_response" and record["error_type"] is None


@pytest.mark.parametrize("failure", [httpx.ReadTimeout, httpx.ConnectError])
async def test_transport_failure_has_no_fabricated_output(llm_log_path: Path, failure: type[httpx.RequestError]) -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        raise failure("could not connect", request=req)

    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
    assert llm is not None
    with pytest.raises(LLMError):
        await llm.json([{"role": "user", "content": "hi"}], Reply)
    record, = exchanges(llm_log_path)
    assert record["outcome"] == "transport_error" and record["http_status"] is None
    assert record["response_body"] is None and record["error_type"] == failure.__name__


async def test_partial_read_failure_then_new_invocation(llm_log_path: Path) -> None:
    class BrokenStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'{"partial":'
            raise httpx.ReadError("broken response")

    calls = 0

    def handler(req: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(200, stream=BrokenStream())
        return httpx.Response(200, json=completion('{"word": "recovered"}'))

    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
    assert llm is not None
    with pytest.raises(LLMError) as error:
        await llm.json([{"role": "user", "content": "first"}], Reply)
    assert error.value.kind == "network"
    assert await llm.json([{"role": "user", "content": "second"}], Reply) == Reply(word="recovered")
    first, second = exchanges(llm_log_path)
    assert first["outcome"] == "transport_error" and first["http_status"] == 200
    assert first["response_body"] == '{"partial":'
    assert first["error_type"] == "ReadError"
    assert second["outcome"] == "http_response"
    assert first["invocation_id"] != second["invocation_id"]
    assert first["attempt_number"] == second["attempt_number"] == 1


async def test_cancellation_records_result_and_cleans_context(llm_log_path: Path) -> None:
    entered = asyncio.Event()

    async def handler(req: httpx.Request) -> httpx.Response:
        if json.loads(req.content)["messages"][0]["content"] == "wait":
            entered.set()
            await asyncio.Event().wait()
        return httpx.Response(200, json=completion('{"word":"done"}'))

    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
    assert llm is not None
    task = asyncio.create_task(llm.json([{"role": "user", "content": "wait"}], Reply))
    await asyncio.wait_for(entered.wait(), 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await llm.json([{"role": "user", "content": "next"}], Reply)
    first, second = exchanges(llm_log_path)
    assert first["outcome"] == "cancelled" and first["response_body"] is None
    assert first["error_type"] == "CancelledError"
    assert first["invocation_id"] != second["invocation_id"]


@pytest.mark.parametrize("api_version", [None, "2024-10-21"])
async def test_echoed_key_is_only_masked_in_logs(llm_log_path: Path, api_version: str | None) -> None:
    escaped = "".join(f"\\u{ord(char):04x}" for char in KEY)
    raw = json.dumps(completion(json.dumps({"word": KEY}))).replace(KEY, escaped)
    llm = create_llm(
        settings("https://r.services.ai.azure.com", api_version),
        mock_client(lambda req: httpx.Response(200, content=raw)),
    )
    assert llm is not None
    assert await llm.json([{"role": "user", "content": KEY}], Reply) == Reply(word=KEY)
    record, = exchanges(llm_log_path)
    assert KEY not in str(dict(record)) and escaped not in record["response_body"]
    assert json.loads(record["request_body"])["messages"][0]["content"] == "***"
    assert "***" in record["response_body"]


@pytest.mark.parametrize("status", [200, 401])
async def test_logging_failure_does_not_change_model_behavior(
    llm_log_path: Path, caplog: pytest.LogCaptureFixture, status: int
) -> None:
    llm_log_path.mkdir()
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(status, json=completion('{"word":"egg"}') if status == 200 else {"error": {}})

    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(handler))
    assert llm is not None
    if status == 200:
        assert await llm.json([{"role": "user", "content": "hi"}], Reply) == Reply(word="egg")
        assert llm.usage.calls == 1 and llm.usage.completion_tokens == 4
    else:
        with pytest.raises(LLMError) as error:
            await llm.json([{"role": "user", "content": "hi"}], Reply)
        assert error.value.kind == "auth" and llm.usage.calls == 0
    assert len(seen) == 1
    assert "logging request failed" in caplog.text and "logging response failed" in caplog.text
    assert KEY not in caplog.text
