import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from bottle_throne.models.show import MAD_KING_NAME, ShowRequest, resolve_old_king

FIXTURE = Path(__file__).parent / "fixtures" / "roster_cases.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_roster_cases(case: dict) -> None:
    payload = {"participants": case["participants"], "old_king": case.get("old_king")}

    if case["valid"]:
        request = ShowRequest.model_validate(payload)
        if "roster" in case:
            assert request.participants == case["roster"]
    else:
        with pytest.raises(ValidationError) as error:
            ShowRequest.model_validate(payload)
        assert {e["type"] for e in error.value.errors()} == {case["error"]}


def test_blank_old_king_and_seed_become_none() -> None:
    request = ShowRequest(participants=["A", "B", "C"], old_king="  ", seed="")

    assert request.old_king is None
    assert request.seed is None


def test_mad_king_when_no_old_king() -> None:
    roster, old_king = resolve_old_king(["Matti", "Aino", "Kalle"], None)

    assert old_king.name == MAD_KING_NAME
    assert old_king.is_mad_king
    assert not old_king.is_participant
    assert not any(p.is_old_king for p in roster)


def test_old_king_also_competes_matches_case_insensitively() -> None:
    roster, old_king = resolve_old_king(["Matti", "Aino", "Kalle"], "aino")

    assert old_king.name == "Aino"
    assert old_king.is_participant
    assert not old_king.is_mad_king
    assert [p.name for p in roster if p.is_old_king] == ["Aino"]


def test_old_king_not_competing() -> None:
    roster, old_king = resolve_old_king(["Matti", "Aino", "Kalle"], "Jukka")

    assert old_king.name == "Jukka"
    assert not old_king.is_participant
    assert not old_king.is_mad_king
    assert not any(p.is_old_king for p in roster)
