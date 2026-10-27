import runpy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
generator = runpy.run_path(str(ROOT / "scripts" / "gen_stage_fixtures.py"))


@pytest.mark.parametrize("size", [6, 15, 40])
def test_stage_fixtures_are_current(size: int) -> None:
    path = ROOT / "tests" / "fixtures" / "stage" / f"show-{size}.json"
    assert path.read_text(encoding="utf-8") == generator["render"](size), (
        "Stage fixtures are stale; run scripts/gen_stage_fixtures.py"
    )
