# Tasks

## 1. SQLite storage and configuration

- [x] 1.1 Add `Settings.llm_log_db` and `BOTTLE_THRONE_LLM_LOG_DB` with the repository-relative default and relative-path normalization described in the design; verify default, absolute override, relative override, and process-environment precedence in `tests/test_config.py`.
- [x] 1.2 Implement `story/exchange_log.py` with the `model_requests` and `model_responses` tables, indexes, parameterized inserts, lazy initialization, and request-first/result-second commits; verify schema, joins, no orphaned responses, pending requests, idempotent initialization, and history preservation across fresh instances in `tests/story/test_exchange_log.py`.
- [x] 1.3 Run short SQLite operations off the event loop with per-operation connections, WAL, and a 250 ms busy timeout; verify concurrent writes, an explicitly held database write lock, bounded wait with a tolerant timing assertion, and successful writes after the lock is released.
- [x] 1.4 Add instance-local secret masking and explicit fail-open logging for initialization, serialization, and write failures, including atomic request/result recovery after a failed request insert; verify an invalid database path, corrupt database, simulated write failure, ordinary and JSON-escaped echoed keys, intact Unicode content, and successful later logging.
- [x] 1.5 Document the path setting, persistence, table layout, local-content privacy, manual cleanup, and fail-open gaps in README; add narrow database/companion ignore patterns and verify the documented default and basename are ignored with `git check-ignore`.

## 2. Capture every Foundry HTTP attempt

- [x] 2.1 Add invocation-local IDs, ordered attempt IDs, and request hooks through `create_llm` for both API modes without replacing existing HTTPX hooks or injected transports; verify one row per actual request, complete messages/schema/parameters, long Unicode content, and preserved caller hooks with `MockTransport`.
- [x] 2.2 Capture response bodies before SDK parsing while leaving them readable by the SDK; verify raw stored output and unchanged return values/error categories for strict and JSON-object modes, malformed JSON, schema-invalid output, refusals, length finish reasons, and HTTP error bodies in `tests/story/test_llm.py`.
- [x] 2.3 Finalize outstanding attempts on network failure, timeout, response-read failure, and cancellation without duplicating an already captured response; verify absent versus partial bodies, honest transport outcomes, missing-result inspection, and context cleanup after failure.
- [x] 2.4 Verify parameter-negotiation coverage for unsupported schema, temperature, and reasoning effort: assert exact HTTP request counts, matching stored bodies, ordered shared invocation IDs, and distinct subsequent invocations using the existing compatibility tests.
- [x] 2.5 Verify logging failures leave model calls, usage accounting, return values, and Foundry error classification unchanged; verify no credentials in either table or diagnostic text for both v1 and dated Azure modes.
- [x] 2.6 Add README read-only SQL examples joining requests and responses, inspecting prompts/raw output, and locating interrupted attempts; execute the examples against a temporary populated database and verify the results match stored exchanges.

## 3. Shared-client integration and regression verification

- [x] 3.1 Isolate exchange-log paths in test fixtures, including existing client factories and direct settings construction; verify selected tests create databases only under temporary test paths and preserve the ability to test the default configuration explicitly.
- [x] 3.2 Extend connectivity-check tests to verify request/response logging with unchanged success and failure reports; verify missing configuration, template-only generation, app creation, and OpenAPI export do not initialize the database or expose its content through HTTP routes.
- [x] 3.3 Add a scheduler integration test using mocked Foundry HTTP responses and temporary SQLite storage: verify bible, scene, and chronicle attempts, corrective-hint retries, concurrent out-of-order pairing, and no fabricated model rows for template fallbacks.
- [x] 3.4 Run the targeted backend tests covering exchange storage, LLM requests, connectivity checks, scheduler integration, configuration, secret masking, application routes, and OpenAPI; verify no failed assertions, no changes to frontend/API contracts, and no writes to the real exchange database.
