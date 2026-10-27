import random

import pytest

from bottle_throne.fate.fairness import canonical_roster, select_winner_index
from bottle_throne.fate.solver import MAX_ATTEMPTS, generate_fate, solve

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna", "Timo", "Ulla"]


def roster(n: int) -> list[str]:
    return [f"Peasant {i:02d}" for i in range(n)]


@pytest.mark.parametrize("n", range(3, 41))
def test_retries_stay_under_cap(n: int) -> None:
    worst = max(solve(f"retry-{n}-{s}", roster(n), None).attempts for s in range(200))
    assert worst < MAX_ATTEMPTS // 4


def test_deterministic_for_same_inputs() -> None:
    a = generate_fate("friday-42", NAMES, "Aino")
    b = generate_fate("friday-42", NAMES, "Aino")
    assert a == b


def test_entry_order_does_not_matter() -> None:
    shuffled = NAMES[:]
    random.Random(7).shuffle(shuffled)
    assert generate_fate("friday-42", shuffled, None) == generate_fate("friday-42", NAMES, None)


def test_winner_matches_fair_selection() -> None:
    for s in range(50):
        script = generate_fate(f"w{s}", NAMES, None)
        canonical = canonical_roster(NAMES)
        winner_name = next(c.name for c in script.characters if c.id == script.winner)
        assert winner_name == canonical[select_winner_index(f"w{s}", canonical)]


def test_old_king_does_not_change_winner() -> None:
    for s in range(30):
        plain = generate_fate(f"k{s}", NAMES, None)
        competing = generate_fate(f"k{s}", NAMES, "Aino")
        assert plain.winner == competing.winner
        assert plain.seal != competing.seal


def test_old_king_not_competing_appears_twice() -> None:
    script = generate_fate("ok", NAMES, "Jukka")
    king = next(c for c in script.characters if c.id == script.old_king)
    assert king.kind == "old_king" and king.name == "Jukka"
    appearances = [b.section for b in script.beats if any(r.character == king.id for r in b.roles)]
    assert appearances[0] == "cold_open" and len(appearances) >= 2


def test_seed_not_in_script() -> None:
    script = generate_fate("very-secret-seed", NAMES, None)
    assert "very-secret-seed" not in script.model_dump_json()
