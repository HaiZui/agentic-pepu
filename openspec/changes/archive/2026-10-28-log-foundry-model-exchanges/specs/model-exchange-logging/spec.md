# Spec Delta

## Purpose

Retains local, queryable records of prompts sent to Azure Foundry and the corresponding raw model responses, so model behavior and failures can be investigated after generation.

## ADDED Requirements

### Requirement: Every outbound model attempt is logged
The backend SHALL log every actual Foundry chat-completion request attempt in SQLite, including bible, scene, chronicle, connectivity-check, compatibility-retry, and application-retry requests. Each attempt SHALL have a distinct identifier. Template-only generation SHALL NOT be recorded as a model exchange.

#### Scenario: Compatibility retry
- **WHEN** a deployment rejects a request parameter and the backend sends an adjusted request
- **THEN** the database contains two distinct attempt records, each with the request actually sent and its corresponding result

#### Scenario: Connectivity check
- **WHEN** the presenter runs a configured connectivity check
- **THEN** each request sent by the check is logged through the same mechanism as story-generation requests

#### Scenario: Application retry and offline fallback
- **WHEN** a scene request fails and generation retries it with a corrective hint
- **THEN** both attempts are recorded with their respective prompts, while any subsequent template fallback is not recorded as model output

### Requirement: Complete outbound prompt capture
Each attempt SHALL retain the complete ordered messages and serialized request body sent to Foundry, including system instructions, corrective hints, response schema or JSON instructions, deployment, and generation parameters. Content SHALL NOT be truncated or summarized, except for credential masking.

#### Scenario: JSON-object compatibility mode
- **WHEN** a request uses JSON-object mode with an appended schema instruction
- **THEN** its stored request contains that additional instruction and the actual response-format and sampling parameters

#### Scenario: Unicode and long prompts
- **WHEN** a prompt contains Finnish participant names and a long story recap
- **THEN** querying the stored request reproduces the complete Unicode content without clipping

### Requirement: Raw output survives parsing failures
The backend SHALL retain the complete response body received for an attempt before structured-output parsing or story validation. This SHALL include successful completions, refusals, malformed output, truncated completions, and HTTP error bodies. A request with no response SHALL have an explicit failure result rather than an invented response.

#### Scenario: Invalid structured reply
- **WHEN** Foundry returns a completion whose content fails structured-output parsing
- **THEN** the complete raw completion remains queryable even though generation rejects it

#### Scenario: HTTP rejection
- **WHEN** Foundry returns a content-filter or rate-limit error
- **THEN** the response record includes its HTTP status and complete response body

#### Scenario: Network failure
- **WHEN** a request times out or cannot connect before receiving a response
- **THEN** its result identifies the transport failure and has no fabricated model output

### Requirement: Correlated and honest exchange metadata
The database SHALL correlate each result with its request and retain UTC start and finish timestamps, elapsed duration, API mode, deployment, and HTTP status or transport failure. Attempts within one model invocation SHALL be ordered and share an invocation identifier. A successful HTTP exchange SHALL NOT imply that the application accepted the generated content.

#### Scenario: Concurrent scenes
- **WHEN** multiple scenes generate concurrently and responses arrive out of order
- **THEN** each result joins only to its own request and compatibility attempts remain ordered within their invocation

#### Scenario: Process interruption
- **WHEN** the process exits after storing a request but before storing its result
- **THEN** the request remains queryable without a completed result and is not reported as a successful exchange

### Requirement: Persistent local SQLite history
Logging SHALL be enabled by default and use `output/model-exchanges.sqlite3` relative to the repository root unless `BOTTLE_THRONE_LLM_LOG_DB` overrides the path. Relative overrides SHALL resolve against the repository root. History SHALL survive application restarts without automatic deletion. Parent directories and tables SHALL be initialized as needed.

#### Scenario: Restart preserves history
- **WHEN** the application restarts and sends another model request
- **THEN** earlier exchanges remain in the database and new exchanges are appended

#### Scenario: Explicit database location
- **WHEN** `BOTTLE_THRONE_LLM_LOG_DB` names another database file
- **THEN** subsequent exchanges are stored at that location and the default database is not written

### Requirement: Credentials and local content protection
The database SHALL NOT store authentication headers, API keys, or configured secret values, including secrets echoed in request or response content. Other prompt and response content SHALL remain intact. Database content SHALL NOT be exposed by application HTTP routes or front-end assets, and generated default database files SHALL be excluded from source control.

#### Scenario: Echoed credential
- **WHEN** a response or transport error contains the configured Foundry key
- **THEN** database content and diagnostic messages mask that value

#### Scenario: Local inspection only
- **WHEN** a browser requests exchange records through the application
- **THEN** the application provides no exchange-log API or downloadable database

### Requirement: Logging failures do not interrupt generation
A database initialization, serialization, or write failure SHALL produce an explicit application-log error without changing the model request, response, retry decisions, or fallback behavior. Database lock waits SHALL be bounded. Subsequent exchanges SHALL attempt logging again after a temporary failure.

#### Scenario: Unwritable database
- **WHEN** a configured database cannot be initialized
- **THEN** an error identifies the logging operation and safe failure reason, while the model request proceeds normally

#### Scenario: Locked database recovers
- **WHEN** another writer holds the database lock longer than the bounded wait
- **THEN** the logging operation reports a failure without waiting indefinitely, and later exchanges can be logged after the lock is released

### Requirement: Documented inspection and cleanup
The project SHALL document the database path setting, request/result tables and correlation, read-only SQL examples, manual cleanup, and that logs contain participant names and complete story content. Documentation SHALL explain that logging failures can leave missing records and that HTTP success does not prove story acceptance.

#### Scenario: Inspect a rejected response
- **WHEN** a developer follows the documented query to inspect an attempt and its result
- **THEN** the query shows the stored prompt, raw output or transport failure, and correlation metadata without requiring a new service
