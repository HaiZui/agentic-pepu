from pathlib import Path

import pytest

from bottle_throne.config import FOUNDRY_VARIABLES, REPO_ROOT, Settings

ENV_CONTENT = (
    "FOUNDRY_API_KEY=key-from-dotenv\n"
    "FOUNDRY_API_ENDPOINT=https://dotenv.example.com\n"
    "FOUNDRY_LLM_DEPLOYMENT_NAME=dotenv-deployment\n"
)


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (*FOUNDRY_VARIABLES, "BOTTLE_THRONE_PORT", "BOTTLE_THRONE_HOST"):
        monkeypatch.delenv(name, raising=False)


def write_env(tmp_path: Path, content: str) -> Path:
    env_file = tmp_path / ".env"
    env_file.write_text(content, encoding="utf-8")
    return env_file


def test_values_loaded_from_dotenv(tmp_path: Path) -> None:
    settings = Settings(_env_file=write_env(tmp_path, ENV_CONTENT))

    assert settings.foundry_api_key is not None
    assert settings.foundry_api_key.get_secret_value() == "key-from-dotenv"
    assert settings.foundry_api_endpoint == "https://dotenv.example.com"
    assert settings.foundry_llm_deployment_name == "dotenv-deployment"
    assert settings.missing_foundry_variables() == []


def test_process_environment_overrides_dotenv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOUNDRY_LLM_DEPLOYMENT_NAME", "env-deployment")
    monkeypatch.setenv("FOUNDRY_API_KEY", "key-from-env")

    settings = Settings(_env_file=write_env(tmp_path, ENV_CONTENT))

    assert settings.foundry_llm_deployment_name == "env-deployment"
    assert settings.foundry_api_key is not None
    assert settings.foundry_api_key.get_secret_value() == "key-from-env"
    assert settings.foundry_api_endpoint == "https://dotenv.example.com"


def test_missing_variables_reported(tmp_path: Path) -> None:
    env_file = write_env(tmp_path, "FOUNDRY_API_KEY=abc\nFOUNDRY_API_ENDPOINT=\n")

    settings = Settings(_env_file=env_file)

    assert settings.missing_foundry_variables() == [
        "FOUNDRY_API_ENDPOINT",
        "FOUNDRY_LLM_DEPLOYMENT_NAME",
    ]


def test_no_env_file_at_all(tmp_path: Path) -> None:
    settings = Settings(_env_file=tmp_path / "does-not-exist.env")

    assert settings.missing_foundry_variables() == list(FOUNDRY_VARIABLES)
    assert settings.secret_values() == []


def test_api_key_masked_in_repr(tmp_path: Path) -> None:
    settings = Settings(_env_file=write_env(tmp_path, ENV_CONTENT))

    assert "key-from-dotenv" not in repr(settings)
    assert "key-from-dotenv" not in str(settings.model_dump())


def test_defaults_bind_loopback_and_port_configurable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=tmp_path / "none.env")
    assert settings.host == "127.0.0.1"
    assert settings.port == 8765

    monkeypatch.setenv("BOTTLE_THRONE_PORT", "9001")
    assert Settings(_env_file=tmp_path / "none.env").port == 9001


def test_llm_log_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BOTTLE_THRONE_LLM_LOG_DB", raising=False)
    assert Settings(_env_file=None).llm_log_db == REPO_ROOT / "output" / "model-exchanges.sqlite3"


def test_llm_log_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BOTTLE_THRONE_LLM_LOG_DB", "local-logs/exchanges.sqlite3")
    monkeypatch.chdir(tmp_path)
    assert Settings(_env_file=None).llm_log_db == REPO_ROOT / "local-logs" / "exchanges.sqlite3"

    absolute = tmp_path / "exchanges.sqlite3"
    monkeypatch.setenv("BOTTLE_THRONE_LLM_LOG_DB", str(absolute))
    assert Settings(_env_file=None).llm_log_db == absolute


def test_llm_log_environment_overrides_dotenv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_file = write_env(tmp_path, "BOTTLE_THRONE_LLM_LOG_DB=dotenv.sqlite3\n")
    monkeypatch.setenv("BOTTLE_THRONE_LLM_LOG_DB", "process.sqlite3")
    assert Settings(_env_file=env_file).llm_log_db == REPO_ROOT / "process.sqlite3"
