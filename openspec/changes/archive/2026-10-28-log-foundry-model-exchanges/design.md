# Design

## Context

See [proposal.md](proposal.md) for motivation and scope and the [capability delta](specs/model-exchange-logging/spec.md) for the behavior contract.

Observed implementation:

- `story/llm.py` constructs both OpenAI v1 and dated Azure clients, disables SDK retries, and exposes one `LLMClient.json` entry point.
- `json` negotiates unsupported parameters through up to four HTTP attempts. `_json_object` appends a system schema instruction that is not present in the caller's messages.
- Strict parsing happens inside `chat.completions.parse`; invalid or truncated output can raise before `_parse` receives a completion.
- `story/scheduler.py` retries agent operations once and schedules up to four concurrent scene/chronicle operations on a worker event loop thread.
- `story/check.py` uses the same client factory for connectivity checks. Tests inject HTTPX clients with `MockTransport`.
- Existing secret masking protects ordinary logging records, not arbitrary SQLite values. There is no existing SQLite persistence layer.

## Goals / Non-Goals

**Goals:**

- Capture the actual wire-level request body and raw response before parsing, without reconstructing requests from agent inputs.
- Preserve request/result pairing under concurrent invocation, parameter negotiation, errors, and process interruption.
- Keep database ownership local and SQLite work bounded and off the generation event loop.

**Non-Goals:**

- No replacement of SDK structured parsing, error classification, story validation, retries, or fallback scheduling.
- No assertion that HTTP 200 means a scene passed validation.
- No new show-history service, UI, replay command, parsed-output duplicate, or automatic database purging.
- No mandatory show identifier or agent-stage plumbing: invocation and attempt IDs plus full prompt content provide the requested correlation.

## Decisions

### 1. Capture actual HTTP exchanges, not parsed model objects

Install asynchronous request and response hooks on the HTTPX client used by `create_llm`. For the default path, explicitly construct the HTTP client; for an injected client, preserve its transport, existing hooks, configuration, and test behavior. Register logging hooks once per constructed Foundry client and never overwrite unrelated hooks.

Scope capture to chat-completion requests for that configured Foundry endpoint. Capture no authorization headers or full URLs/query strings. Deployment and API mode come from safe client context.

The request hook reads the complete serialized request body and records it before dispatch. The response hook calls `await response.aread()` before logging, retaining the buffered body for the SDK to consume normally. This application uses non-streaming completions; introducing streaming later requires a separate design.

Use the surrounding `LLMClient.json` exception/finalization boundary to complete an outstanding attempt when HTTPX never produces a response hook, including connection, timeout, response-read failure, or cancellation. Do not write a second result for HTTP responses already captured. Retain any available partial response information on read failure and explicitly mark incomplete bodies rather than claiming completeness.

Alternative rejected: logging only around `_parse` and `_json_object` loses strict-parser failures and can miss the appended JSON instruction or negotiated parameters. Replacing `.parse` with hand-written SDK parsing would unnecessarily change existing behavior.

### 2. Invocation-local correlation

At entry to `LLMClient.json`, create a UUID invocation ID and a fresh invocation-local context using `contextvars`. Every actual request obtains a new UUID attempt ID and an increasing attempt number within that invocation. Preserve/reset context tokens in `finally`; never keep a shared mutable "current request" field on the shared client.

HTTP request extensions or invocation-local state connect the response to its original attempt. Compatibility variants share an invocation ID; scheduler retries are distinct invocations, with the corrective prompt retained in the request. Generate IDs before any database operation so result logging and error messages remain correlated if request insertion fails.

### 3. Two queryable SQLite tables

Add a focused `story/exchange_log.py` module using standard-library `sqlite3`, parameterized SQL, and idempotent schema creation:

| Table | Columns |
| --- | --- |
| `model_requests` | `attempt_id TEXT PRIMARY KEY`, `invocation_id TEXT NOT NULL`, `attempt_number INTEGER NOT NULL`, `started_at TEXT NOT NULL`, `api_mode TEXT NOT NULL`, `deployment TEXT NOT NULL`, `request_body TEXT NOT NULL` |
| `model_responses` | `attempt_id TEXT PRIMARY KEY REFERENCES model_requests(attempt_id)`, `finished_at TEXT NOT NULL`, `duration_ms REAL NOT NULL`, `outcome TEXT NOT NULL`, `http_status INTEGER`, `response_body TEXT`, `error_type TEXT`, `error_message TEXT` |

Use UTC ISO timestamps and a monotonic timer for durations. Request bodies are JSON text; response bodies retain the received text, even if not valid JSON. Preserve Unicode and avoid truncation. An HTTP result has outcome `http_response`; a transport/read failure uses `transport_error`; cancellation uses `cancelled`. `http_status` distinguishes HTTP errors from successful transport. A failed partial response read is never labelled a complete HTTP response.

Use a unique index on `(invocation_id, attempt_number)` and an index on request start time. JSON request fields, including messages, model, schema, and sampling parameters, remain inspectable with SQLite JSON functions; do not duplicate them into separate prompt tables. Completion envelopes already contain model text, refusal, finish reason, request identifier, and token usage when provided.

Commit request insertion before dispatch and commit the response separately. Requests without responses represent interrupted or unrecorded completions, not success. When completing an attempt after a failed request write, retry inserting its retained request and result together in one transaction, without overwriting existing records. Enable foreign keys and use one result per attempt to prevent orphaned or mispaired output.

Alternative rejected: one completion-only row cannot distinguish an interrupted request from a request that never happened. An ORM or external database introduces unnecessary dependencies.

### 4. Local path, lazy initialization, and concurrent access

Add `Settings.llm_log_db` exposed as `BOTTLE_THRONE_LLM_LOG_DB`, defaulting to `REPO_ROOT / "output" / "model-exchanges.sqlite3"`. Normalize relative overrides against `REPO_ROOT`, not the caller's working directory. Do not tie this database to per-show comic directories or the comic-enabled setting.

Initialize parent directories and tables lazily on the first attempted exchange. Missing Foundry configuration, template-only shows, app import, and OpenAPI generation must not create a database. Preserve existing rows on startup; no retention job is added.

Run each short database operation through `asyncio.to_thread`, opening and closing a connection inside that operation. Never share a connection across the main thread, story worker, connectivity-check event loop, or worker threads. Configure a 250 ms SQLite busy timeout; use WAL mode for concurrent local readers and brief transactions for writes. Report incompatible/corrupt schemas as logging errors; do not drop or reset them.

The default database is already below the ignored `output/` directory. Add narrow ignore patterns for the documented database basename and its WAL/SHM/journal companions if created elsewhere in the checkout; document that arbitrary custom database names need their own ignore rules.

Alternative rejected: unbounded synchronous SQLite calls block scene generation; a permanent background queue adds shutdown/drain complexity and risks losing the final responses.

### 5. Safe, visible fail-open logging

Use an instance-local `SecretMaskingFilter` or its existing masking helper, initialized from `Settings.secret_values()`, for database-bound content and diagnostic messages. Do not depend solely on app-wide log installation: connectivity checks also need protection. Mask configured secret values in decoded bodies and error text, preserving everything else. Never persist headers, credentials, or raw exception tracebacks.

Contain failures only inside the logging boundary. Catch expected filesystem, SQLite, and serialization errors, report an ERROR with the operation, attempt ID, and masked failure category/reason, then return control to the unchanged model path. Do not accidentally swallow transport exceptions or SDK validation failures. Treat database insertion failures as logging failures, not Foundry failures, so they cannot trigger generation retries.

Retry logging on subsequent operations rather than permanently disabling it after initialization failure. There is no promise of lossless logging while persistence is unavailable; the user explicitly chose continued generation with visible errors. Record this limitation in documentation.

### 6. Inspection and test isolation

Document SQL joining requests to responses by `attempt_id`, ordering by start time and invocation attempt number, and selecting request messages and raw output. Use a standard SQLite viewer or an optional locally available SQLite CLI; do not introduce a runtime inspection API.

Route test logging to temporary paths through test fixtures and explicit settings. Do not let existing client tests write to the real ignored output directory or an environment-configured personal database. Verify masking with direct database queries, including escaped secret text and both API authentication modes.

## Risks / Trade-offs

- Full prompts contain participant names and future story details -> store locally, exclude generated files from Git, expose no HTTP route, and document access and manual cleanup.
- Unlimited history can fill disk -> clearly document no automatic retention; fail open with explicit errors when writes fail.
- Reading response bodies in hooks changes when buffering happens -> verify that both SDK parsing modes receive identical output and exception categories, including invalid JSON and truncated completions.
- Cancellation or process exit can leave incomplete attempts -> persist requests first and use a left join to make missing results visible; do not fabricate completion.
- Contention introduces bounded extra latency -> offload SQLite work, use 250 ms lock waits and short transactions, and test concurrent calls plus a held write lock.
- Fail-open behavior permits gaps -> report each failed logging operation and retry on subsequent operations; do not claim a complete audit trail.
- Secret masking intentionally changes echoed credentials -> document this sole content-preservation exception and test escaped Unicode/JSON representations.

## Migration Plan

1. Add configuration, storage, and capture hooks with temporary-database tests; no migration of existing shows is needed.
2. The first configured Foundry exchange creates the database and tables. Existing history is preserved on subsequent launches.
3. Update README inspection and privacy guidance with the setting and table names.
4. Roll back by reverting the implementation; the local database remains available for inspection. To remove history, stop the application and close database viewers before deleting the chosen database and its SQLite companion files.
