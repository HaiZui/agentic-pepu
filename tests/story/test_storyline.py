import json
from pathlib import Path

import pytest

from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import Beat, Elimination, FateScript, Role
from bottle_throne.story.storyline import announcements, storyline

NAMES = [
    "Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna", "Timo", "Ulla",
    "Ville", "Åsa", "Eero", "Heli", "Iiro", "Jari", "Kaisa", "Lauri", "Minna", "Niko",
    "Outi", "Paavo", "Riikka", "Saku", "Tiina", "Urho", "Veera", "Ykä", "Aleksi", "Bea",
    "Cecilia", "Daniel", "Elina", "Fredrik", "Greta", "Hannu", "Inka", "Joonas", "Kirsi", "Leevi",
]
ROSTER_CASES = Path(__file__).resolve().parents[1] / "fixtures" / "roster_cases.json"


def sample_fates() -> list[FateScript]:
    return [
        generate_fate(f"storyline-{size}-{n}", NAMES[:size], [None, "Jukka", NAMES[0]][n % 3], "manual")
        for size in (3, 4, 6, 8, 12, 16, 25, 40)
        for n in range(8)
    ]


@pytest.fixture(scope="module")
def fates() -> list[FateScript]:
    return sample_fates()


def participants(fate: FateScript) -> set[str]:
    return {c.id for c in fate.characters if c.kind == "participant"}


def beat(fate: FateScript, card: str, roles: list[tuple[str, str]], out: list[tuple[str, str]], facts=(), kind="single") -> Beat:
    return Beat(
        index=5, section="act_2", card=card, title=card.replace("_", " ").title(), kind=kind, setting="feast_hall",
        roles=[Role(role=r, character=c) for r, c in roles],
        eliminations=[Elimination(character=c, mode=m) for c, m in out],  # type: ignore[arg-type]
        resurrections=[], alliances_formed=[], alliances_broken=[], facts=list(facts), prophecy_hints=[],
        budget_seconds=30, dramatic=True,
    )


# --- survivor state ----------------------------------------------------------------------------------------


def test_count_runs_from_full_roster_to_the_winner(fates: list[FateScript]) -> None:
    for fate in fates:
        story = storyline(fate)
        assert set(story.beats[0].survivors_before) == participants(fate)
        coronation = story.beats[-1]
        assert coronation.survivors_before == [fate.winner] == coronation.survivors_after
        for b, s in zip(fate.beats, story.beats, strict=True):
            out = {e.character for e in b.eliminations} & participants(fate)
            expected = (set(s.survivors_before) - out) | set(b.resurrections)
            assert set(s.survivors_after) == expected
        for prev, nxt in zip(story.beats, story.beats[1:]):
            assert prev.survivors_after == nxt.survivors_before


def test_npc_death_does_not_change_the_count(fates: list[FateScript]) -> None:
    checked = 0
    for fate in fates:
        story = storyline(fate)
        for b in fate.beats:
            if b.card == "taster_falls":
                s = story.beats[b.index]
                assert s.survivors_before == s.survivors_after and s.announcements == []
                checked += 1
    assert checked


def test_resurrection_restores_a_survivor_and_announces_it(fates: list[FateScript]) -> None:
    checked = 0
    for fate in fates:
        names = {c.id: c.name for c in fate.characters}
        story = storyline(fate)
        for b in fate.beats:
            for risen in b.resurrections:
                s = story.beats[b.index]
                assert risen not in s.survivors_before and risen in s.survivors_after
                assert len(s.survivors_after) == len(s.survivors_before) + 1
                (ann,) = [a for a in s.announcements if a.kind == "return"]
                assert ann.headline == f"{names[risen]} RETURNS"
                assert "Red Priestess" in ann.cause and "back in the contest" in ann.cause
                checked += 1
    assert checked


# --- announcements -----------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def fate() -> FateScript:
    return generate_fate("storyline-cards", NAMES[:8], None, "manual")


def ids(fate: FateScript) -> list[str]:
    return [c.id for c in fate.characters if c.kind == "participant"]


def name(fate: FateScript, cid: str) -> str:
    return next(c.name for c in fate.characters if c.id == cid)


def test_killed_by_named_character(fate: FateScript) -> None:
    jester = next(c for c in fate.characters if c.kind == "npc")
    p = ids(fate)[0]
    (ann,) = announcements(fate, beat(fate, "trial_by_combat", [("challenger", jester.id), ("fallen", p)], [(p, "killed")]))
    assert ann.kind == "out" and ann.character == p
    assert ann.headline == f"{name(fate, p)} is OUT"
    assert ann.cause == f"slain by {jester.name} in Trial by Combat"


def test_poisoner_drinks_their_own_cup(fate: FateScript) -> None:
    davido, caesar = ids(fate)[3], ids(fate)[4]
    b = beat(fate, "poisoned_goblet", [("poisoner", davido), ("intended", caesar)], [(davido, "killed")], ["poisoner_drank"])
    (ann,) = announcements(fate, b)
    assert ann.headline == f"{name(fate, davido)} is OUT"
    assert ann.cause == f"poisoned by the goblet meant for {name(fate, caesar)}"


def test_forfeit_names_no_one_else(fate: FateScript) -> None:
    elite = ids(fate)[5]
    (ann,) = announcements(fate, beat(fate, "grey_cloak", [("deserter", elite)], [(elite, "forfeited")]))
    assert ann.headline == f"{name(fate, elite)} is OUT"
    assert ann.cause == "forfeited by taking the Grey Cloak"
    assert not any(name in ann.cause for name in NAMES)


def test_crowd_has_one_announcement_each_and_a_summary(fate: FateScript) -> None:
    victims = ids(fate)[:3]
    b = beat(fate, "grey_plague", [("fallen", v) for v in victims], [(v, "killed") for v in victims], kind="crowd")
    anns = announcements(fate, b)
    assert [a.character for a in anns if a.kind == "out"] == victims
    assert all(a.cause == "taken by the Grey Plague" for a in anns if a.kind == "out")
    (summary,) = [a for a in anns if a.kind == "summary"]
    assert summary.headline == "3 are OUT" and summary.cause == "in the Grey Plague"


def test_storyline_is_deterministic_and_serialisable(fate: FateScript) -> None:
    a, b = storyline(fate), storyline(fate)
    assert a == b
    assert json.loads(a.model_dump_json()) == json.loads(b.model_dump_json())


# --- bystander plan ----------------------------------------------------------------------------------------


def roster_case_fates() -> list[FateScript]:
    cases = json.loads(ROSTER_CASES.read_text(encoding="utf-8"))["cases"]
    rosters = [c["roster"] for c in cases if c["valid"] and len(c.get("roster", [])) >= 3]
    return [generate_fate(f"roster-case-{i}", roster, None, "manual") for i, roster in enumerate(rosters)]


def check_plan(fate: FateScript) -> None:
    story = storyline(fate)
    roles = [{r.character for r in b.roles} for b in fate.beats]
    people = participants(fate)
    for b, s in zip(fate.beats, story.beats, strict=True):
        assert len(s.bystanders) <= 2 and len(set(s.bystanders)) == len(s.bystanders)
        if b.card in ("cold_open", "coronation"):
            assert s.bystanders == []
        for p in s.bystanders:
            assert p in s.survivors_before and p not in roles[b.index]
            assert p not in {e.character for e in b.eliminations}
    seen = [set(s.bystanders) | roles[s.index] for s in story.beats]
    for b in fate.beats:
        if b.kind == "crowd":
            continue
        for e in b.eliminations:
            if e.character in people and not any(e.character in roles[j] for j in range(1, b.index)):
                assert any(e.character in seen[j] for j in range(1, b.index)), (fate.seal, e.character, b.index)
    for act in ("act_1", "act_2", "act_3"):
        in_act = [b.index for b in fate.beats if b.section == act]
        assert any(fate.winner in seen[j] for j in in_act), (fate.seal, act)


def test_plan_is_complete_for_roster_cases() -> None:
    for fate in roster_case_fates():
        check_plan(fate)


def test_plan_is_complete_for_random_seeds() -> None:
    for size in range(3, 41):
        for n in range(6):
            check_plan(generate_fate(f"plan-{size}-{n}", NAMES[:size], [None, "Jukka", NAMES[0]][n % 3], "manual"))


def test_contestant_introduced_before_falling(fates: list[FateScript]) -> None:
    checked = 0
    for fate in fates:
        story = storyline(fate)
        roles = [{r.character for r in b.roles} for b in fate.beats]
        for b in fate.beats:
            if b.kind == "crowd" or b.section != "act_3":
                continue
            for e in b.eliminations:
                if e.character in participants(fate) and not any(e.character in roles[j] for j in range(1, b.index)):
                    assert any(e.character in story.beats[j].bystanders for j in range(1, b.index))
                    checked += 1
    assert checked, "no late first appearance in the sample; widen the sample"


def test_winner_visible_in_every_act(fates: list[FateScript]) -> None:
    for fate in fates:
        story = storyline(fate)
        for act in ("act_1", "act_2", "act_3"):
            in_act = [b for b in fate.beats if b.section == act]
            if not any(fate.winner in {r.character for r in b.roles} for b in in_act):
                assert any(fate.winner in story.beats[b.index].bystanders for b in in_act)


# --- thread seeds ------------------------------------------------------------------------------------------


def test_every_fate_has_the_winners_road_and_valid_seeds(fates: list[FateScript]) -> None:
    for fate in fates:
        winner = next(c.name for c in fate.characters if c.id == fate.winner)
        seeds = storyline(fate).thread_seeds
        road = [t for t in seeds if t.title == f"{winner}'s road"]
        assert road and len(road[0].beats) >= 2
        assert road[0].beats[-1] == fate.beats[-1].index
        for thread in seeds:
            assert len(thread.beats) >= 2
            assert thread.beats == sorted(set(thread.beats))
            assert all(0 <= i < len(fate.beats) for i in thread.beats)
            assert "{" not in thread.title + thread.summary


def test_resurrection_seed_links_death_return_and_after(fates: list[FateScript]) -> None:
    checked = 0
    for fate in fates:
        for b in fate.beats:
            for risen in b.resurrections:
                name = next(c.name for c in fate.characters if c.id == risen)
                (thread,) = [t for t in storyline(fate).thread_seeds if t.title == f"{name} cheats death"]
                assert thread.beats[0] < b.index and b.index in thread.beats
                checked += 1
    assert checked


# --- the planned ghost -------------------------------------------------------------------------------------

RESPONSIBLE = {
    "knife_in_the_back": "betrayer", "trial_by_combat": "challenger", "poisoned_goblet": "poisoner",
    "faceless_strike": "client", "old_kings_gambit": "old_king", "crimson_feast": "host",
    "muddy_field_battle": "commander", "final_duel": "champion",
}


def qualifying(fate: FateScript) -> list[tuple[int, int, str]]:
    """Every (later beat, exit beat, victim) where the one who caused the victim's exit is eliminated in that later beat."""
    story = storyline(fate)
    found = []
    for b in fate.beats:
        role = RESPONSIBLE.get(b.card)
        if role is None or "poisoner_drank" in b.facts:
            continue
        culprits = {r.character for r in b.roles if r.role == role}
        for later in fate.beats[b.index + 1 : -1]:
            if not culprits & {e.character for e in later.eliminations}:
                continue
            for e in b.eliminations:
                v = e.character
                if v in participants(fate) and v not in culprits and v not in story.beats[later.index].survivors_before:
                    if v not in later.resurrections and v not in {r.character for r in later.roles}:
                        found.append((later.index, b.index, v))
    return found


def test_at_most_one_ghost_and_it_watches_its_killer_fall() -> None:
    planned = 0
    for size in (4, 6, 8, 12, 16, 25, 40):
        for n in range(10):
            fate = generate_fate(f"ghost-{size}-{n}", NAMES[:size], [None, "Jukka", NAMES[0]][n % 3], "manual")
            story = storyline(fate)
            ghosts = [(s.index, s.ghost) for s in story.beats if s.ghost]
            pairs = qualifying(fate)
            assert len(ghosts) <= 1
            if not pairs:
                assert ghosts == []
                continue
            first = min(pairs)  # earliest later beat; then the longest-held grudge
            assert ghosts == [(first[0], first[2])]
            (beat, ghost), = ghosts
            assert ghost not in story.beats[beat].survivors_before and fate.beats[beat].card != "coronation"
            assert ghost not in story.beats[beat].bystanders
            planned += 1
    assert planned > 20
