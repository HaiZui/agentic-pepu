"""Foundry chat-model access through the OpenAI SDK. Used by the backend only."""

import json
import logging
from dataclasses import dataclass, field
from typing import Literal, TypeVar
from urllib.parse import urlsplit

import httpx
import openai
from openai import AsyncAzureOpenAI, AsyncOpenAI
from pydantic import BaseModel, ValidationError

from bottle_throne.config import Settings

log = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 45.0
M = TypeVar("M", bound=BaseModel)

ErrorKind = Literal[
    "config", "auth", "not_found", "network", "timeout", "content_filter", "invalid", "rate_limit", "http"
]


class LLMError(Exception):
    def __init__(self, kind: ErrorKind, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.kind = kind
        self.retry_after = retry_after


def resource_root(endpoint: str) -> str:
    """Scheme and host of a Foundry or Azure OpenAI endpoint, whatever path was configured."""
    parts = urlsplit(endpoint.strip())
    if not parts.scheme or not parts.netloc:
        raise LLMError("config", "FOUNDRY_API_ENDPOINT is not a valid URL")
    return f"{parts.scheme}://{parts.netloc}"


def v1_base_url(endpoint: str) -> str:
    return f"{resource_root(endpoint)}/openai/v1/"


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass
class LLMClient:
    client: AsyncOpenAI
    deployment: str
    mode: Literal["v1", "azure"]
    strict_schema: bool = True
    custom_temperature: bool = True
    reasoning_effort: str | None = "low"
    usage: Usage = field(default_factory=Usage)

    async def json(
        self,
        messages: list[dict[str, str]],
        schema: type[M],
        *,
        temperature: float = 0.9,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> M:
        """One chat completion whose reply must validate as `schema`. Raises LLMError."""
        try:
            for _ in range(4):
                try:
                    if self.strict_schema:
                        return await self._parse(messages, schema, temperature, timeout)
                    return await self._json_object(messages, schema, temperature, timeout)
                except openai.BadRequestError as exc:
                    if self.custom_temperature and _rejects(exc, "temperature"):
                        log.warning("Deployment only supports its default temperature; omitting it")
                        self.custom_temperature = False
                    elif self.reasoning_effort and _rejects(exc, "reasoning_effort"):
                        log.warning("Deployment does not take reasoning_effort; omitting it")
                        self.reasoning_effort = None
                    elif self.strict_schema and _schema_unsupported(exc):
                        log.warning("Deployment rejects strict JSON schema; falling back to json_object mode")
                        self.strict_schema = False
                    else:
                        raise
            raise LLMError("http", "the deployment rejected every request variant")
        except LLMError:
            raise
        except Exception as exc:  # noqa: BLE001 - every SDK failure maps to a category
            raise classify(exc) from exc

    def _sampling(self, temperature: float) -> dict[str, object]:
        params: dict[str, object] = {}
        if self.custom_temperature:
            params["temperature"] = temperature
        if self.reasoning_effort:
            params["reasoning_effort"] = self.reasoning_effort
        return params

    async def _parse(self, messages: list[dict[str, str]], schema: type[M], temperature: float, timeout: float) -> M:
        completion = await self.client.chat.completions.parse(
            model=self.deployment,
            messages=messages,  # type: ignore[arg-type]
            response_format=schema,
            timeout=timeout,
            **self._sampling(temperature),  # type: ignore[arg-type]
        )
        self._count(completion)
        message = completion.choices[0].message
        if message.refusal:
            raise LLMError("content_filter", "the model refused the request")
        if message.parsed is None:
            raise LLMError("invalid", "empty structured reply")
        return message.parsed

    async def _json_object(
        self, messages: list[dict[str, str]], schema: type[M], temperature: float, timeout: float
    ) -> M:
        instruction = {
            "role": "system",
            "content": "Reply with one JSON object only, matching this JSON schema:\n"
            + json.dumps(schema.model_json_schema()),
        }
        completion = await self.client.chat.completions.create(
            model=self.deployment,
            messages=[*messages, instruction],  # type: ignore[list-item]
            response_format={"type": "json_object"},
            timeout=timeout,
            **self._sampling(temperature),  # type: ignore[arg-type]
        )
        self._count(completion)
        choice = completion.choices[0]
        if choice.finish_reason == "content_filter":
            raise LLMError("content_filter", "the reply was blocked by the content filter")
        try:
            return schema.model_validate_json(choice.message.content or "")
        except ValidationError as exc:
            raise LLMError("invalid", f"reply does not match the schema: {exc.error_count()} errors") from exc

    def _count(self, completion: object) -> None:
        self.usage.calls += 1
        usage = getattr(completion, "usage", None)
        if usage is not None:
            self.usage.prompt_tokens += usage.prompt_tokens or 0
            self.usage.completion_tokens += usage.completion_tokens or 0


def _schema_unsupported(exc: openai.BadRequestError) -> bool:
    text = str(exc).lower()
    return "response_format" in text or "json_schema" in text


def _rejects(exc: openai.BadRequestError, param: str) -> bool:
    body = exc.body if isinstance(exc.body, dict) else {}
    return body.get("param") == param or f"'{param}'" in str(exc).lower() or f"{param} " in str(exc).lower()


def _retry_after(exc: openai.APIStatusError) -> float | None:
    headers = exc.response.headers if exc.response is not None else {}
    try:
        if "retry-after-ms" in headers:
            return float(headers["retry-after-ms"]) / 1000
        if "retry-after" in headers:
            return float(headers["retry-after"])
    except ValueError:
        return None
    return None


def classify(exc: BaseException) -> LLMError:
    if isinstance(exc, LLMError):
        return exc
    if isinstance(exc, openai.ContentFilterFinishReasonError):
        return LLMError("content_filter", "the reply was blocked by the content filter")
    if isinstance(exc, openai.LengthFinishReasonError):
        return LLMError("invalid", "the reply was cut off before it was complete")
    if isinstance(exc, openai.APITimeoutError):
        return LLMError("timeout", "the model did not answer in time")
    if isinstance(exc, openai.APIConnectionError):
        return LLMError("network", "could not connect to the Foundry endpoint")
    if isinstance(exc, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return LLMError("auth", "the API key was rejected")
    if isinstance(exc, openai.NotFoundError):
        return LLMError("not_found", "deployment not found at the configured endpoint")
    if isinstance(exc, openai.RateLimitError):
        return LLMError("rate_limit", "rate limited by the deployment", _retry_after(exc))
    if isinstance(exc, openai.BadRequestError):
        if (exc.code or "") == "content_filter" or "content_filter" in str(exc).lower():
            return LLMError("content_filter", "the request was blocked by the content filter")
        return LLMError("http", f"bad request ({exc.status_code})")
    if isinstance(exc, openai.APIStatusError):
        return LLMError("http", f"HTTP {exc.status_code} from the deployment")
    if isinstance(exc, ValidationError):
        return LLMError("invalid", "reply does not match the schema")
    return LLMError("http", type(exc).__name__)


def create_llm(settings: Settings, http_client: httpx.AsyncClient | None = None) -> LLMClient | None:
    """Client for the configured deployment, or None when Foundry configuration is incomplete."""
    if settings.missing_foundry_variables():
        return None
    assert settings.foundry_api_key and settings.foundry_api_endpoint and settings.foundry_llm_deployment_name
    key = settings.foundry_api_key.get_secret_value()
    common = {"api_key": key, "timeout": DEFAULT_TIMEOUT, "max_retries": 0, "http_client": http_client}
    if settings.foundry_api_version:
        client: AsyncOpenAI = AsyncAzureOpenAI(
            azure_endpoint=resource_root(settings.foundry_api_endpoint),
            api_version=settings.foundry_api_version,
            **common,  # type: ignore[arg-type]
        )
        mode: Literal["v1", "azure"] = "azure"
    else:
        client = AsyncOpenAI(base_url=v1_base_url(settings.foundry_api_endpoint), **common)  # type: ignore[arg-type]
        mode = "v1"
    return LLMClient(client=client, deployment=settings.foundry_llm_deployment_name, mode=mode)
