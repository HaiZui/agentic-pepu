import json
import random
import re
from collections import Counter

from fastapi.testclient import TestClient

from bottle_throne.app import create_app
from bottle_throne.config import Settings
from bottle_throne.fate.fairness import (
    ENGINE_VERSION,
    canonical_roster,
    seal_of_fate,
    select_winner_index,
    short_seal,
)
from bottle_throne.models.show import ShowRequest
from bottle_throne.sessions import SessionStore

ROSTER_15 = [
    "Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna",
    "Timo", "Ulla", "Ville", "Åsa", "Eero", "Heli", "Iiro",
]
# Chi-square critical value for 14 degrees of freedom at the 0.001 significance level.
CHI2_CRITICAL_DF14_P001 = 36.123


def test_canonical_order_is_independent_of_entry_order() -> None:
    shuffled = ROSTER_15[:]
    random.Random(1).shuffle(shuffled)

    assert canonical_roster(shuffled) == canonical_roster(ROSTER_15)
    assert canonical_roster(["matti K.", "Aino", "Matti A."]) == ["Aino", "Matti A.", "matti K."]


def test_session_stores_canonical_roster_and_auto_seed() -> None:
    store = SessionStore()
    a = store.create(ShowRequest(participants=["Kalle", "Aino", "Matti"]))
    b = store.create(ShowRequest(participants=["Matti", "Kalle", "Aino"]))

    assert a.canonical_roster == b.canonical_roster == ["Aino", "Kalle", "Matti"]
    assert a.seed_mode == "auto"
    assert re.fullmatch(r"[0-9a-f]{32}", a.seed)  # 128 bits
    assert a.seed != b.seed


def test_session_keeps_manual_seed() -> None:
    record = SessionStore().create(ShowRequest(participants=["A", "B", "C"], seed="friday-42"))

    assert record.seed_mode == "manual"
    assert record.seed == "friday-42"


def test_seed_never_in_public_responses() -> None:
    client = TestClient(create_app(Settings(_env_file=None)))
    body = client.post("/api/shows", json={"participants": ["A", "B", "C"]}).json()
    seed = client.app.state.sessions.get(body["id"]).seed

    assert seed not in json.dumps(body)


def test_winner_selection_is_deterministic() -> None:
    roster = canonical_roster(ROSTER_15)
    assert select_winner_index("friday-42", roster) == select_winner_index("friday-42", roster)
    assert select_winner_index("friday-42", roster) == 10  # pinned: Stream("friday-42","winner") vector


def test_winner_selection_is_uniform() -> None:
    roster = canonical_roster(ROSTER_15)
    trials = 20_000
    counts = Counter(select_winner_index(f"seed-{i}", roster) for i in range(trials))
    expected = trials / len(roster)
    chi2 = sum((counts[i] - expected) ** 2 / expected for i in range(len(roster)))

    assert chi2 < CHI2_CRITICAL_DF14_P001


def test_old_king_has_no_advantage() -> None:
    roster = canonical_roster(ROSTER_15)
    old_king_index = roster.index("Aino")
    trials = 15_000
    wins = sum(select_winner_index(f"ok-{i}", roster) == old_king_index for i in range(trials))

    # Selection ignores the Old King entirely; the win share stays at 1/N (±4 standard deviations).
    expected = trials / len(roster)
    sd = (trials * (1 / 15) * (14 / 15)) ** 0.5
    assert abs(wins - expected) < 4 * sd


def test_seal_is_deterministic_and_sensitive() -> None:
    base = seal_of_fate("friday-42", ROSTER_15, None)

    assert base == seal_of_fate("friday-42", list(reversed(ROSTER_15)), None)
    assert re.fullmatch(r"[0-9a-f]{64}", base)
    assert base != seal_of_fate("friday-43", ROSTER_15, None)
    assert base != seal_of_fate("friday-42", ROSTER_15, "Aino")
    assert base != seal_of_fate("friday-42", ROSTER_15[:-1], None)
    assert base != seal_of_fate("friday-42", ROSTER_15, None, engine_version="fate-2")
    assert ENGINE_VERSION == "fate-1"


def test_short_seal_format() -> None:
    assert short_seal("0123456789abcdef" * 4) == "0123 4567 89ab"
