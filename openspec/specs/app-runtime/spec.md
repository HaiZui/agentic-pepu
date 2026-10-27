# app-runtime Specification

## Purpose

Defines how The Bottle Throne is started, configured and served on the presenter's laptop, including how Foundry credentials are loaded and protected.

## Requirements

### Requirement: Single-command local start
The system SHALL start the backend and serve the front end with a single documented command on Windows, then open or print the local URL of the setup screen.

#### Scenario: Presenter starts the app
- **WHEN** the presenter runs the documented start command from the repository root
- **THEN** the application starts and the setup screen is reachable at the printed local URL

### Requirement: Localhost-only binding
The system SHALL bind its HTTP server to the loopback interface by default so that other machines on the network cannot reach it.

#### Scenario: Default binding
- **WHEN** the application starts without overriding the host
- **THEN** the server listens only on a loopback address

### Requirement: Foundry configuration from environment
The system SHALL read `FOUNDRY_API_KEY`, `FOUNDRY_API_ENDPOINT` and `FOUNDRY_LLM_DEPLOYMENT_NAME` from a `.env` file in the repository root or from process environment variables, with process environment taking precedence.

#### Scenario: Values loaded from .env
- **WHEN** `.env` defines all three Foundry variables and the process environment does not
- **THEN** the backend uses the values from `.env`

#### Scenario: Process environment overrides .env
- **WHEN** a Foundry variable is set both in the process environment and in `.env`
- **THEN** the backend uses the process environment value

### Requirement: Secrets never reach the browser
The system MUST NOT include the Foundry API key in any HTTP response, front-end bundle, log line or error message.

#### Scenario: Health endpoint hides the key
- **WHEN** the front end requests the configuration health status
- **THEN** the response reports whether each Foundry variable is present without revealing any value of `FOUNDRY_API_KEY`

#### Scenario: Error does not leak key
- **WHEN** an error occurs while configuration is loaded
- **THEN** the logged and returned error text does not contain the API key value

### Requirement: Configuration health reporting
The system SHALL expose a health status that tells the front end whether Foundry configuration is complete, and the setup screen SHALL show a visible warning when it is incomplete.

#### Scenario: Missing Foundry variable
- **WHEN** `FOUNDRY_LLM_DEPLOYMENT_NAME` is absent
- **THEN** the application still starts and the setup screen shows a warning naming the missing variable

#### Scenario: Complete configuration
- **WHEN** all three Foundry variables are present
- **THEN** the setup screen shows no configuration warning
