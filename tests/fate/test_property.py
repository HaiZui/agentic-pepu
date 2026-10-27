"""Property test over every roster size: all generated timelines satisfy the spec."""

from collections import Counter

import pytest

from bottle_throne.fate.hints import CROWD_CARDS, winner_facts
from bottle_throne.fate.solver import generate_fate
from bottle_throne.fate.validate import validate

SEEDS_PER_SIZE = 500


@pytest.mark.parametrize("n", range(3, 41))
def test_every_timeline_is_valid(n: int) -> None:
    roster = [f"Peasant {i:02d}" for i in range(n)]
    for s in range(SEEDS_PER_SIZE):
        old_king = roster[s % n] if s % 3 == 0 else ("Jukka" if s % 3 == 1 else None)
        script = generate_fate(f"prop-{n}-{s}", roster, old_king)

        assert validate(script) == [], (n, s)
        assert 540 <= script.total_budget_seconds <= 660
        assert 16 <= len(script.beats) <= 24

        prophecy = next(b for b in script.beats if b.card == "prophecy")
        facts = winner_facts(script.winner, script.characters, script.houses, script.beats)
        assert prophecy.prophecy_hints and all(h.id in facts for h in prophecy.prophecy_hints)

        participants = {c.id for c in script.characters if c.kind == "participant"}
        crowds = [
            sum(1 for e in b.eliminations if e.character in participants)
            for b in script.beats
            if b.card in CROWD_CARDS
        ]
        if n == 30:
            assert len(crowds) >= 3 and min(crowds) >= 2
        if n == 6:
            assert all(size <= 2 for size in crowds)
        if n == 10:
            modes = Counter(e.mode for b in script.beats for e in b.eliminations if e.character in participants)
            assert modes["forfeited"] + modes["exiled"] >= 1
