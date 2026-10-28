"""Local, best-effort persistence of Foundry HTTP exchanges."""

import asyncio
import json
import logging
import re
import sqlite3
import threading
import time
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager, closing
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

import httpx

from bottle_throne.logging_utils import SecretMaskingFilter

log = logging.getLogger(__name__)
BUSY_TIMEOUT = 0.25

SCHEMA = """
CREATE TABLE IF NOT EXISTS model_requests (
    attempt_id TEXT PRIMARY KEY,
    invocation_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    api_mode TEXT NOT NULL,
    deployment TEXT NOT NULL,
    request_body TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS model_request_invocation
    ON model_requests(invocation_id, attempt_number);
CREATE INDEX IF NOT EXISTS model_request_started ON model_requests(started_at);
CREATE TABLE IF NOT EXISTS model_responses (
    attempt_id TEXT PRIMARY KEY REFERENCES model_requests(attempt_id),
    finished_at TEXT NOT NULL,
    duration_ms REAL NOT NULL,
    outcome TEXT NOT NULL,
    http_status INTEGER,
    response_body TEXT,
    error_type TEXT,
    error_message TEXT
);
"""


@dataclass(frozen=True)
class RequestRecord:
    attempt_id: str
    invocation_id: str
    attempt_number: int
    started_at: str
    api_mode: str
    deployment: str
    request_body: str


@dataclass(frozen=True)
class ResponseRecord:
    finished_at: str
    duration_ms: float
    outcome: Literal["http_response", "transport_error", "cancelled"]
    http_status: int | None = None
    response_body: str | None = None
    error_type: str | None = None
    error_message: str | None = None


def _encoded_secret(secret: str) -> re.Pattern[str]:
    # Match JSON-escaped values without reserializing the captured wire body.
    parts: list[str] = []
    for char in secret:
        unicode_escape = (
            f"\\u{ord(char):04x}" if ord(char) <= 0xFFFF else json.dumps(char, ensure_ascii=True)[1:-1]
        )
        forms = {char, json.dumps(char, ensure_ascii=False)[1:-1], unicode_escape}
        forms.update(json.dumps(form)[1:-1] for form in tuple(forms))
        patterns = [
            f"(?i:{re.escape(form)})" if "\\u" in form else re.escape(form)
            for form in sorted(forms, key=len, reverse=True)
        ]
        parts.append("(?:" + "|".join(patterns) + ")")
    return re.compile("".join(parts))


class ExchangeLog:
    def __init__(self, path: Path, secrets: list[str]) -> None:
        self.path = path
        self._masker = SecretMaskingFilter(secrets)
        self._encoded_secrets = [_encoded_secret(secret) for secret in secrets if secret]
        self._write_lock = threading.Lock()

    def mask(self, text: str) -> str:
        for pattern in self._encoded_secrets:
            text = pattern.sub("***", text)
        return self._masker.mask(text)

    async def record_request(self, request: RequestRecord) -> None:
        await self._record(request, None)

    async def record_response(self, request: RequestRecord, response: ResponseRecord) -> None:
        await self._record(request, response)

    async def _record(self, request: RequestRecord, response: ResponseRecord | None) -> None:
        operation = "request" if response is None else "response"
        try:
            await asyncio.to_thread(self._write, request, response)
        except (OSError, sqlite3.Error, TypeError, ValueError) as error:
            log.error(
                "Model exchange logging %s failed for attempt %s (%s): %s",
                operation,
                request.attempt_id,
                type(error).__name__,
                self.mask(str(error)),
            )

    def _write(self, request: RequestRecord, response: ResponseRecord | None) -> None:
        if not self._write_lock.acquire(timeout=BUSY_TIMEOUT):
            raise sqlite3.OperationalError("exchange logger is busy")
        try:
            self._write_locked(request, response)
        finally:
            self._write_lock.release()

    def _write_locked(self, request: RequestRecord, response: ResponseRecord | None) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=BUSY_TIMEOUT)) as connection:
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)
            with connection:
                connection.execute(
                    """INSERT INTO model_requests VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(attempt_id) DO NOTHING""",
                    (
                        request.attempt_id,
                        request.invocation_id,
                        request.attempt_number,
                        request.started_at,
                        self.mask(request.api_mode),
                        self.mask(request.deployment),
                        self.mask(request.request_body),
                    ),
                )
                if response is not None:
                    connection.execute(
                        """INSERT INTO model_responses VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(attempt_id) DO NOTHING""",
                        (
                            request.attempt_id,
                            response.finished_at,
                            response.duration_ms,
                            response.outcome,
                            response.http_status,
                            self.mask(response.response_body) if response.response_body is not None else None,
                            self.mask(response.error_type) if response.error_type is not None else None,
                            self.mask(response.error_message) if response.error_message is not None else None,
                        ),
                    )


@dataclass
class _Attempt:
    request: RequestRecord
    started: float
    finished: bool = False


@dataclass
class _Invocation:
    identifier: str = field(default_factory=lambda: str(uuid4()))
    count: int = 0
    pending: _Attempt | None = None


class _CaptureStream(httpx.AsyncByteStream):
    def __init__(self, stream: httpx.AsyncByteStream) -> None:
        self.stream = stream
        self.partial = bytearray()

    async def __aiter__(self) -> AsyncIterator[bytes]:
        async for chunk in self.stream:
            self.partial.extend(chunk)
            yield chunk

    async def aclose(self) -> None:
        await self.stream.aclose()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ExchangeCapture:
    def __init__(self, store: ExchangeLog, endpoint: str, mode: str, deployment: str) -> None:
        self.store = store
        self.endpoint = httpx.URL(endpoint)
        self.mode = mode
        self.deployment = deployment
        self._state: ContextVar[_Invocation | None] = ContextVar("model_exchange", default=None)

    @asynccontextmanager
    async def invocation(self) -> AsyncGenerator[None]:
        state = _Invocation()
        token = self._state.set(state)
        try:
            yield
        except (Exception, asyncio.CancelledError) as error:
            attempt = state.pending
            if attempt is not None and not attempt.finished:
                await self._finish_error(attempt, error)
            raise
        finally:
            self._state.reset(token)

    async def on_request(self, request: httpx.Request) -> None:
        state = self._state.get()
        if (
            state is None
            or request.method != "POST"
            or not request.url.path.endswith("/chat/completions")
            or (request.url.scheme, request.url.host, request.url.port)
            != (self.endpoint.scheme, self.endpoint.host, self.endpoint.port)
        ):
            return
        state.count += 1
        started = time.monotonic()
        body = await request.aread()
        record = RequestRecord(
            str(uuid4()), state.identifier, state.count, _utc_now(),
            self.mode, self.deployment, body.decode("utf-8", errors="replace"),
        )
        attempt = _Attempt(record, started)
        state.pending = attempt
        request.extensions["bottle_throne.exchange"] = attempt
        await self.store.record_request(record)

    async def on_response(self, response: httpx.Response) -> None:
        attempt = response.request.extensions.get("bottle_throne.exchange")
        state = self._state.get()
        if not isinstance(attempt, _Attempt) or state is None or state.pending is not attempt:
            return
        assert isinstance(response.stream, httpx.AsyncByteStream)
        stream = _CaptureStream(response.stream)
        response.stream = stream
        try:
            await response.aread()
        except (Exception, asyncio.CancelledError) as error:
            await self._finish_error(
                attempt, error, response.status_code,
                stream.partial.decode("utf-8", errors="replace") if stream.partial else None,
            )
            raise
        attempt.finished = True
        await self.store.record_response(
            attempt.request,
            ResponseRecord(
                _utc_now(), (time.monotonic() - attempt.started) * 1000,
                "http_response", response.status_code, response.text,
            ),
        )

    async def _finish_error(
        self, attempt: _Attempt, error: BaseException, status: int | None = None, partial: str | None = None
    ) -> None:
        attempt.finished = True
        cause = error
        seen = {id(cause)}
        while cause.__cause__ is not None and id(cause.__cause__) not in seen:
            cause = cause.__cause__
            seen.add(id(cause))
        await self.store.record_response(
            attempt.request,
            ResponseRecord(
                _utc_now(), (time.monotonic() - attempt.started) * 1000,
                "cancelled" if isinstance(error, asyncio.CancelledError) else "transport_error",
                status, partial, type(cause).__name__, str(cause),
            ),
        )
