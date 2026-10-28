import pytest

from bottle_throne.fate.cards import CARDS
from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import FateScript
from bottle_throne.story import causes

NAMES = [
    "Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna", "Timo", "Ulla",
    "Ville", "Åsa", "Eero", "Heli", "Iiro", "Jari", "Kaisa", "Lauri", "Minna", "Niko",
]


def fates() -> list[FateScript]:
    return [
        generate_fate(f"causes-{size}-{n}", NAMES[:size], [None, "Jukka", NAMES[0]][n % 3], "manual")
        for size in (3, 6, 9, 14, 20)
        for n in range(6)
    ]


@pytest.fixture(scope="module")
def many() -> list[FateScript]:
    return fates()


def test_every_card_has_wording() -> None:
    assert set(CARDS) <= set(causes.WORDING)
    for card in CARDS.values():
        if card.mode is not None:
            assert causes.WORDING[card.id].out, f"{card.id} eliminates but has no announcement wording"
        if card.kind == "crowd":
            assert causes.WORDING[card.id].crowd


def test_statements_name_every_role_holder_exactly(many: list[FateScript]) -> None:
    for fate in many:
        cast = {c.id: c for c in fate.characters}
        for beat in fate.beats:
            text = causes.statement(fate, beat)
            assert "{" not in text and "}" not in text
            for role in beat.roles:
                who = cast[role.character]
                if who.kind == "participant":
                    assert who.name in text, (beat.card, role.role, text)
                else:
                    assert who.name.lower() in text.lower(), (beat.card, role.role, text)


def test_out_causes_render_for_every_elimination(many: list[FateScript]) -> None:
    seen = set()
    for fate in many:
        for beat in fate.beats:
            if beat.eliminations:
                cause = causes.out_cause(fate, beat)
                assert cause and "{" not in cause
                seen.add(beat.card)
    assert {"trial_by_combat", "poisoned_goblet"} <= seen


def test_sentence_initial_npc_names_are_capitalised(many: list[FateScript]) -> None:
    for fate in many:
        for beat in fate.beats:
            text = causes.statement(fate, beat)
            assert not text.startswith(("the ", "a "))
            assert ". the " not in text and ". a " not in text


def test_join_names() -> None:
    assert causes.join_names(["Aino"]) == "Aino"
    assert causes.join_names(["Aino", "Öhman"]) == "Aino and Öhman"
    assert causes.join_names(["Aino", "Öhman", "Åsa"]) == "Aino, Öhman and Åsa"


FACT_PHRASES = {
    "first_blood": "first blood",
    "poisoner_drank": "drinks it",
    "attempt_failed": "but fails",
    "pardoned": "pardons",
    "debt_paid": "pays",
    "yielded": "yields",
}


def test_every_recorded_fact_is_expressed(many: list[FateScript]) -> None:
    seen = set()
    for fate in many:
        for beat in fate.beats:
            text = causes.statement(fate, beat)
            for fact in beat.facts:
                assert fact in FACT_PHRASES, f"no wording check for fact {fact}"
                assert FACT_PHRASES[fact] in text, (fact, text)
                seen.add(fact)
    assert {"first_blood", "poisoner_drank", "attempt_failed"} <= seen
