import os
from pathlib import Path

import pytest

# The comic job launches a headless browser; tests opt in explicitly (see tests/comic).
os.environ.setdefault("BOTTLE_THRONE_COMIC", "0")


@pytest.fixture
def llm_log_path(tmp_path: Path) -> Path:
    return tmp_path / "model-exchanges.sqlite3"


@pytest.fixture(autouse=True)
def isolate_exchange_logs(llm_log_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BOTTLE_THRONE_LLM_LOG_DB", str(llm_log_path))
