import json

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


async def test_falls_back_to_json_object_when_schema_unsupported() -> None:
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


async def test_drops_temperature_when_model_only_supports_default() -> None:
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


async def test_rate_limit_carries_retry_after() -> None:
    response = httpx.Response(429, headers={"retry-after": "3"}, json={"error": {"message": "slow down"}})
    llm = create_llm(settings("https://r.services.ai.azure.com"), mock_client(lambda r: response))
    assert llm is not None
    with pytest.raises(LLMError) as error:
        await llm.json([{"role": "user", "content": "hi"}], Reply)
    assert error.value.kind == "rate_limit" and error.value.retry_after == 3.0


async def test_drops_reasoning_effort_when_unsupported() -> None:
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
