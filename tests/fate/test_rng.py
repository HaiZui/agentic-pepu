import hashlib
import hmac
from collections import Counter

import pytest

from bottle_throne.fate.rng import Stream


def test_raw_bytes_follow_definition() -> None:
    expected = b"".join(
        hmac.new(b"seed", b"label\x00" + i.to_bytes(8, "big"), hashlib.sha256).digest() for i in range(2)
    )
    assert Stream("seed", "label").read(64) == expected


def test_known_answer_vectors() -> None:
    # Pinned values: changing them changes every show result, which requires a new engine version.
    winner = Stream("friday-42", "winner")
    assert [winner.uniform_int(15) for _ in range(10)] == [10, 13, 11, 14, 13, 13, 14, 4, 6, 12]
    assert Stream("friday-42", "houses").shuffle(list(range(8))) == [3, 0, 4, 7, 1, 5, 6, 2]
    assert Stream("a" * 32, "x").read(8).hex() == "f49938f42527c3df"


def test_labels_are_independent() -> None:
    a = Stream("seed", "winner").read(32)
    b = Stream("seed", "houses").read(32)
    assert a != b

    # Consuming one stream does not affect another stream's output.
    s1 = Stream("seed", "archetypes")
    Stream("seed", "winner").read(1000)
    assert s1.read(32) == Stream("seed", "archetypes").read(32)


def test_same_seed_and_label_is_deterministic() -> None:
    assert [Stream("s", "l").uniform_int(1000) for _ in range(3)] == [Stream("s", "l").uniform_int(1000)] * 3


def test_uniform_int_range_and_rough_uniformity() -> None:
    stream = Stream("uniformity", "test")
    counts = Counter(stream.uniform_int(6) for _ in range(6000))
    assert set(counts) == set(range(6))
    assert all(850 < c < 1150 for c in counts.values())


def test_uniform_int_edge_cases() -> None:
    stream = Stream("s", "edge")
    assert stream.uniform_int(1) == 0
    with pytest.raises(ValueError):
        stream.uniform_int(0)


def test_shuffle_is_permutation() -> None:
    items = list(range(40))
    shuffled = Stream("s", "shuffle").shuffle(items)
    assert sorted(shuffled) == items
    assert shuffled != items


def test_choice_and_weighted_choice() -> None:
    stream = Stream("s", "choice")
    assert stream.choice(["only"]) == "only"
    picks = Counter(stream.weighted_choice(["a", "b"], [1, 0]) for _ in range(50))
    assert picks == {"a": 50}
