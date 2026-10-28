import pytest

from bottle_throne.fate.cards import CARDS
from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import FateScript
from bottle_throne.story.fallback import (
    CROWD_TEMPLATES,
    TEMPLATES,
    fallback_bible,
    fallback_chronicle,
    fallback_scene,
    variants_for,
)
from bottle_throne.story.validate import alive_before_each_beat, validate_scene

SIZES = [3, 6, 15, 40]
SEEDS = 25


def fates(n: int) -> list[FateScript]:
    roster = ["Jääskeläinen", "Öhman", "Åsa"] + [f"Peasant {i:02d}" for i in range(n - 3)]
    return [generate_fate(f"fallback-{n}-{s}", roster, "Jukka" if s % 2 else None) for s in range(SEEDS)]


def test_every_card_has_templates() -> None:
    for card in CARDS:
        assert card in TEMPLATES or card in CROWD_TEMPLATES, card
    for variants in [*TEMPLATES.values(), *CROWD_TEMPLATES.values()]:
        assert 2 <= len(variants) <= 4


@pytest.mark.parametrize("n", SIZES)
def test_every_variant_passes_the_validator(n: int) -> None:
    covered: set[str] = set()
    for fate in fates(n):
        alive = alive_before_each_beat(fate)
        for beat in fate.beats:
            for variant in range(len(variants_for(beat))):
                scene = fallback_scene(fate, beat, "seed", variant)
                errors = validate_scene(scene, beat, fate, alive[beat.index])
                assert errors == [], (n, beat.card, variant, errors)
                assert scene.is_fallback
            covered.add(beat.card)
    assert {"cold_open", "decree", "prophecy", "final_duel", "coronation"} <= covered


def test_variant_choice_is_deterministic_and_varied() -> None:
    fate = fates(15)[0]
    first = [fallback_scene(fate, b, "s1") for b in fate.beats]
    again = [fallback_scene(fate, b, "s1") for b in fate.beats]
    other = [fallback_scene(fate, b, "s2") for b in fate.beats]
    assert first == again
    assert first != other


def test_all_cards_covered_across_sizes() -> None:
    seen = {b.card for n in SIZES for f in fates(n) for b in f.beats}
    assert seen == set(CARDS), set(CARDS) - seen


def test_fallback_chronicle_texts() -> None:
    for n in SIZES:
        for fate in fates(n)[:5]:
            chronicle = fallback_chronicle(fate, "s")
            winner = next(c.name for c in fate.characters if c.id == fate.winner)
            assert len(chronicle.epilogue.split()) <= 120
            assert winner in chronicle.epilogue
            assert winner not in chronicle.blurb
            assert all([chronicle.act_titles.act_1, chronicle.act_titles.act_2, chronicle.act_titles.act_3])
            assert chronicle.cover_title


def test_fallback_bible_covers_every_beat() -> None:
    fate = fates(6)[0]
    bible = fallback_bible(fate, "s")
    assert [b.index for b in bible.beats] == [b.index for b in fate.beats]
    winner = next(c.name for c in fate.characters if c.id == fate.winner)
    assert winner not in bible.prophecy


def test_fallback_scenes_stage_bystanders_names_and_returns() -> None:
    from bottle_throne.story.storyline import storyline

    checked = {"bystander": 0, "named": 0, "risen": 0, "ghost": 0}
    for n in (6, 9, 16, 30):
        for fate in fates(n):
            names = {c.id: c.name for c in fate.characters}
            story = storyline(fate)
            for beat in fate.beats:
                scene = fallback_scene(fate, beat, "seed")
                speakers = [line.speaker for line in scene.lines]
                for who in story.beats[beat.index].bystanders:
                    assert who in speakers
                    assert all(len(line.text) < 60 for line in scene.lines if line.speaker == who)
                    checked["bystander"] += 1
                if len(beat.eliminations) == 1:
                    gone = names[beat.eliminations[0].character].lower()
                    assert any(gone in t.text.lower() for t in [*scene.lines, *scene.captions])
                    checked["named"] += 1
                ghost = story.beats[beat.index].ghost
                if ghost:
                    assert any(line.speaker == ghost and line.emotion == "dead" for line in scene.lines)
                    assert any("ghost" in line.text.lower() for line in scene.lines)
                    checked["ghost"] += 1
                for risen in beat.resurrections:
                    entered = {d.character for d in scene.stage_directions if d.action == "enter"}
                    entered |= {line.speaker for line in scene.lines if line.action == "enter"}
                    assert risen in entered
                    assert all(line.emotion != "dead" for line in scene.lines if line.speaker == risen)
                    checked["risen"] += 1
    assert all(checked.values()), checked
