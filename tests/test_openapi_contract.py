import json
from pathlib import Path

from bottle_throne.app import create_app
from bottle_throne.config import Settings

COMMITTED = Path(__file__).resolve().parents[1] / "web" / "src" / "api" / "openapi.json"


def test_committed_openapi_is_up_to_date() -> None:
    """Fails when backend models change without running `npm run gen:api` in web/."""
    current = json.dumps(create_app(Settings(_env_file=None)).openapi(), indent=2, ensure_ascii=False) + "\n"

    assert COMMITTED.exists(), "Run `npm run gen:api` in web/ to create src/api/openapi.json"
    assert COMMITTED.read_text(encoding="utf-8").replace("\r\n", "\n") == current
