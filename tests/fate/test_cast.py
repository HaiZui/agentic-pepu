from collections import Counter

import pytest

from bottle_throne.fate.catalog import ARCHETYPES, house_count, npc_count
from bottle_throne.fate.characters import assign_archetypes, assign_houses, build_cast, participant_id
from bottle_throne.fate.fairness import canonical_roster


@pytest.mark.parametrize(
    ("n", "houses"),
    [(3, 0), (5, 0), (6, 2), (8, 2), (9, 3), (14, 3), (15, 4), (24, 4), (25, 5), (40, 5)],
)
def test_house_band_table(n: int, houses: int) -> None:
    assert house_count(n) == houses
    built, _ = assign_houses("seed", [participant_id(i) for i in range(n)])
    assert len(built) == houses


@pytest.mark.parametrize("n", range(3, 41))
def test_houses_balanced_and_partition(n: int) -> None:
    ids = [participant_id(i) for i in range(n)]
    houses, house_of = assign_houses(f"seed-{n}", ids)
    if not houses:
        assert house_of == {}
        return
    sizes = [len(h.members) for h in houses]
    assert max(sizes) - min(sizes) <= 1
    assert sorted(m for h in houses for m in h.members) == sorted(ids)
    assert len({h.id for h in houses}) == len(houses)


def test_fifteen_participants_get_four_houses_of_4_4_4_3() -> None:
    houses, _ = assign_houses("friday", [participant_id(i) for i in range(15)])
    assert sorted(len(h.members) for h in houses) == [3, 4, 4, 4]


def test_archetypes_do_not_depend_on_names() -> None:
    roster_a = canonical_roster(["Aino", "Kalle", "Matti", "Pekka"])
    roster_b = canonical_roster(["Aino", "Kalle", "Mikko", "Pekka"])  # same canonical position replaced
    cast_a = build_cast("seed", roster_a, None)
    cast_b = build_cast("seed", roster_b, None)

    assert [c.archetype for c in cast_a.characters[:4]] == [c.archetype for c in cast_b.characters[:4]]
    assert assign_archetypes("seed", 4) == [c.archetype for c in cast_a.characters[:4]]


def test_archetypes_cover_the_catalog() -> None:
    counts = Counter(a for s in range(50) for a in assign_archetypes(f"s{s}", 10))
    assert set(counts) == set(ARCHETYPES)


@pytest.mark.parametrize(("n", "npcs"), [(3, 3), (8, 3), (9, 2), (14, 2), (15, 0), (40, 0)])
def test_npc_counts(n: int, npcs: int) -> None:
    assert npc_count(n) == npcs
    cast = build_cast("seed", [f"P{i:02d}" for i in range(n)], None)
    assert len(cast.npc_roles) == npcs
    assert all(c.kind == "npc" for c in cast.characters if c.id.startswith("npc_"))


def test_old_king_resolution() -> None:
    roster = ["Aino", "Kalle", "Matti"]
    mad = build_cast("s", roster, None)
    assert mad.old_king_id == "old_king" and not mad.old_king_is_participant
    assert next(c for c in mad.characters if c.id == "old_king").name == "the Mad King"

    named = build_cast("s", roster, "Jukka")
    assert next(c for c in named.characters if c.id == "old_king").name == "Jukka"

    competing = build_cast("s", roster, "kalle")
    assert competing.old_king_is_participant
    king = next(c for c in competing.characters if c.id == competing.old_king_id)
    assert king.name == "Kalle" and king.is_old_king and king.kind == "participant"
