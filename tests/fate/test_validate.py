from collections.abc import Callable

import pytest

from bottle_throne.models.fate import Elimination, FateScript, ProphecyHint, Role
from bottle_throne.fate.solver import generate_fate
from bottle_throne.fate.validate import validate


def roster(n: int) -> list[str]:
    return [f"Peasant {i:02d}" for i in range(n)]


def find(n: int, predicate: Callable[[FateScript], bool]) -> FateScript:
    for s in range(500):
        script = generate_fate(f"v-{n}-{s}", roster(n), None)
        if predicate(script):
            return script.model_copy(deep=True)
    raise AssertionError("no matching script")


def codes(script: FateScript) -> set[str]:
    return {e.split(":", 1)[0] for e in validate(script)}


def participants(script: FateScript) -> set[str]:
    return {c.id for c in script.characters if c.kind == "participant"}


@pytest.fixture
def script() -> FateScript:
    return find(10, lambda s: True)


def test_valid_script_has_no_errors(script: FateScript) -> None:
    assert validate(script) == []


@pytest.mark.parametrize("mutation", ["duplicate", "act", "npc", "dead", "facts", "effect"])
def test_invalid_dragon_duels(mutation: str) -> None:
    script = find(10, lambda s: any(b.card == "dragon_defeat" for b in s.beats))
    beat = next(b for b in script.beats if b.card == "dragon_defeat")
    if mutation == "duplicate":
        script.beats.insert(beat.index + 1, beat.model_copy(deep=True))
    elif mutation == "act":
        beat.section = "act_3"
    elif mutation == "npc":
        beat.roles[0].character = script.old_king
    elif mutation == "dead":
        earlier = next(b for b in script.beats if b.eliminations)
        if earlier is beat:
            later = script.beats[-1]
            later.card, later.roles, later.facts = beat.card, beat.roles, beat.facts
        else:
            beat.roles[0].character = earlier.eliminations[0].character
    elif mutation == "facts":
        beat.facts = ["sword_accident", "dragon_slaying"]
    else:
        beat.eliminations = []
    assert "dragon" in codes(script)


def test_section_order(script: FateScript) -> None:
    script.beats[1].section, script.beats[-2].section = script.beats[-2].section, script.beats[1].section
    assert "section_order" in codes(script)


def test_budget_out_of_range(script: FateScript) -> None:
    script.beats[0].budget_seconds += 200
    script.total_budget_seconds += 200
    assert "budget_range" in codes(script)


def test_betrayal_without_alliance(script: FateScript) -> None:
    beat = next(b for b in script.beats if b.kind == "single" and b.section != "act_3")
    victim = beat.eliminations[0].character
    betrayer = next(p for p in sorted(participants(script)) if p != victim)
    beat.card, beat.title, beat.setting, beat.dramatic = "knife_in_the_back", "x", "dungeon", True
    beat.roles = [Role(role="betrayer", character=betrayer), Role(role="victim", character=victim)]
    beat.eliminations = [Elimination(character=victim, mode="killed")]
    assert "precondition" in codes(script)


def test_goblet_outside_feast(script: FateScript) -> None:
    script = find(10, lambda s: any(b.card == "poisoned_goblet" for b in s.beats))
    next(b for b in script.beats if b.card == "poisoned_goblet").setting = "battlefield"
    assert "card_setting" in codes(script)


def test_dead_character_acting() -> None:
    def victim_stays_dead(s: FateScript) -> bool:
        first = next(b for b in s.beats if b.kind == "single")
        return not any(first.eliminations[0].character in b.resurrections for b in s.beats)

    script = find(10, victim_stays_dead)
    first = next(b for b in script.beats if b.kind == "single")
    script.beats[-1].roles.append(Role(role="survivor", character=first.eliminations[0].character))
    assert "dead_actor" in codes(script)


def test_wrong_survivor_and_crown(script: FateScript) -> None:
    duel = next(b for b in script.beats if b.card == "final_duel")
    duel.eliminations = []
    assert "survivors" in codes(script)

    script = find(10, lambda s: True)
    coronation = script.beats[-1]
    other = next(p for p in sorted(participants(script)) if p != script.winner)
    coronation.roles = [Role(role="crowned", character=other)]
    assert {"coronation", "dead_actor"} <= codes(script)


def test_act3_contender_count() -> None:
    script = find(10, lambda s: any(b.section == "act_3" and b.kind == "single" for b in s.beats))
    act2_single = next(b for b in script.beats if b.section == "act_2" and b.kind == "single")
    act2_single.eliminations = []
    assert "act3_contenders" in codes(script)


def test_crowd_event_in_act3() -> None:
    script = find(10, lambda s: any(b.section == "act_3" and b.kind == "drama" for b in s.beats))
    beat = next(b for b in script.beats if b.section == "act_3" and b.kind == "drama")
    beat.card, beat.kind, beat.setting = "grey_plague", "crowd", "city_streets"
    assert "act3_crowd" in codes(script)


def test_nonlethal_required(script: FateScript) -> None:
    for beat in script.beats:
        for elimination in beat.eliminations:
            elimination.mode = "killed"
    assert "nonlethal" in codes(script)


def test_resurrection_limits() -> None:
    script = find(10, lambda s: any(b.resurrections for b in s.beats))
    rising = next(b for b in script.beats if b.resurrections)
    rising.section = "act_3"
    assert "resurrection_section" in codes(script)

    script = find(10, lambda s: any(b.resurrections for b in s.beats))
    rising = next(b for b in script.beats if b.resurrections)
    later = next(b for b in script.beats if b.index > rising.index and b.eliminations)
    victim = later.eliminations[0].character
    script.beats[-1].resurrections = [victim]
    assert "resurrection_count" in codes(script)


def test_old_king_must_appear_later(script: FateScript) -> None:
    for beat in script.beats[1:]:
        beat.roles = [r for r in beat.roles if r.character != script.old_king]
    assert "old_king_later" in codes(script)


def test_npcs_must_act(script: FateScript) -> None:
    npcs = {c.id for c in script.characters if c.kind == "npc"}
    assert npcs
    for beat in script.beats:
        beat.roles = [r for r in beat.roles if r.character not in npcs]
        beat.eliminations = [e for e in beat.eliminations if e.character not in npcs]
    assert "npc_active" in codes(script)


def test_npcs_required_for_small_rosters(script: FateScript) -> None:
    script.characters = [c for c in script.characters if c.kind != "npc"]
    assert "npc_count" in codes(script)


def test_house_balance(script: FateScript) -> None:
    moved = script.houses[0].members.pop()
    script.houses[1].members.append(moved)
    script.houses[1].members.append(script.houses[0].members.pop())
    assert {"house_balance", "house_members"} & codes(script)


def test_prophecy_must_be_true() -> None:
    script = find(10, lambda s: not any(s.winner in b.resurrections for b in s.beats))
    prophecy = next(b for b in script.beats if b.card == "prophecy")
    prophecy.prophecy_hints[0] = ProphecyHint(id="resurrected", text="One who returned from death")
    assert "prophecy_false" in codes(script)


def test_prophecy_must_not_name_winner(script: FateScript) -> None:
    winner_name = next(c.name for c in script.characters if c.id == script.winner)
    prophecy = next(b for b in script.beats if b.card == "prophecy")
    prophecy.prophecy_hints[0].text = f"It will be {winner_name}"
    assert "prophecy_names_winner" in codes(script)


def test_dragon_egg_immunity() -> None:
    def egg_then_single(s: FateScript) -> bool:
        return any(
            b.card == "dragon_egg" and s.beats[b.index + 1].kind == "single" for b in s.beats[:-1]
        )

    script = find(12, egg_then_single)
    egg = next(b for b in script.beats if b.card == "dragon_egg" and script.beats[b.index + 1].kind == "single")
    bearer = egg.roles[0].character
    script.beats[egg.index + 1].eliminations.append(Elimination(character=bearer, mode="killed"))
    assert "immunity" in codes(script)
