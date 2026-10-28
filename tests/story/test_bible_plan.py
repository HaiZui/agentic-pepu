import json

import pytest

from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import Beat, Elimination, FateScript, Role
from bottle_throne.models.story import BeatSynopsis, ExitReason, Motivation, ShowBible, StoryThread
from bottle_throne.story import agents
from bottle_throne.story.bible import participant_exits, repair_plan
from bottle_throne.story.context import beat_facts, outline, persona_cards
from bottle_throne.story.fallback import fallback_bible
from bottle_throne.story.storyline import storyline

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna"]


@pytest.fixture(scope="module")
def fate() -> FateScript:
    return generate_fate("bible-plan-test", NAMES, None, "manual")


def resurrection_fate() -> FateScript:
    for n in range(200):
        fate = generate_fate(f"bible-risen-{n}", NAMES, None, "manual")
        if any(b.resurrections for b in fate.beats):
            return fate
    raise AssertionError("no resurrection in 200 seeds")


def name(fate: FateScript, cid: str) -> str:
    return next(c.name for c in fate.characters if c.id == cid)


def empty_bible(fate: FateScript, **update) -> ShowBible:
    bible = ShowBible(
        title="T", prophecy="A crown, a goat.", motifs=["goat"],
        beats=[BeatSynopsis(index=b.index, synopsis="x") for b in fate.beats],
        threads=[], motivations=[], exit_reasons=[],
    )
    return bible.model_copy(update=update)


# --- 2.1 role-aware facts ----------------------------------------------------------------------------------


def test_poisoner_drank_is_stated_in_scene_and_director_payloads(fate: FateScript) -> None:
    ids = [c.id for c in fate.characters if c.kind == "participant"]
    davido, caesar = ids[2], ids[5]
    goblet = Beat(
        index=3, section="act_1", card="poisoned_goblet", title="The Poisoned Goblet", kind="single",
        setting="feast_hall", roles=[Role(role="poisoner", character=davido), Role(role="intended", character=caesar)],
        eliminations=[Elimination(character=davido, mode="killed")], resurrections=[], alliances_formed=[],
        alliances_broken=[], facts=["first_blood", "poisoner_drank"], prophecy_hints=[], budget_seconds=30, dramatic=True,
    )
    expected = (
        f"{name(fate, davido)} poisons a goblet meant for {name(fate, caesar)}, but the cups get swapped "
        f"and {name(fate, davido)} drinks it."
    )

    facts = beat_facts(fate, goblet)
    assert facts["what_happens"].startswith(expected)
    assert "first blood" in facts["what_happens"]
    assert facts["cause"] == f"poisoned by the goblet meant for {name(fate, caesar)}"
    assert "notes" not in facts

    swapped = fate.model_copy(update={"beats": [*fate.beats[:3], goblet, *fate.beats[4:]]})
    timeline = outline(swapped)
    assert timeline[3]["what_happens"].startswith(expected)
    assert "who" not in timeline[3]


def test_director_payload_carries_plan_inputs(fate: FateScript) -> None:
    payload = agents.director_payload(fate)
    story = storyline(fate)
    assert [t["what_happens"] for t in payload["timeline"]] == [s.statement for s in story.beats]
    assert [(e["id"], e["beat"]) for e in payload["exits_to_explain"]] == participant_exits(fate)
    planned = {(s.index, p) for s in story.beats for p in s.bystanders}
    shown = {(b["beat"], n) for b in payload["bystander_plan"] for n in b["bystanders"]}
    assert len(shown) == len(planned)
    assert payload["thread_ideas"] and all(len(t["beats"]) >= 2 for t in payload["thread_ideas"])
    assert "seed" not in json.dumps(payload)


# --- 2.2 persona status ------------------------------------------------------------------------------------


def test_risen_is_returning_not_a_ghost_and_bystanders_are_marked() -> None:
    fate = resurrection_fate()
    beat = next(b for b in fate.beats if b.resurrections)
    alive_other = next(
        p for p in storyline(fate).beats[beat.index].survivors_before if p not in {r.character for r in beat.roles}
    )
    cards = {c["id"]: c for c in persona_cards(fate, beat, [alive_other])}
    (risen,) = beat.resurrections
    assert cards[risen]["status"].startswith("returning to life in this beat")
    assert "ghost" not in cards[risen]["status"].replace("not a ghost", "")
    assert cards[alive_other]["status"] == "alive"
    assert "must not leave" in cards[alive_other]["bystander"]
    assert "bystander" not in cards[risen]


# --- 2.3 the Director's plan is repaired, not rejected -----------------------------------------------------


def test_missing_and_unnamed_exit_reasons_are_filled(fate: FateScript) -> None:
    exits = participant_exits(fate)
    first_id, first_beat = exits[0]
    bible = empty_bible(fate, exit_reasons=[
        ExitReason(character=first_id, beat=first_beat, reason=f"{name(fate, first_id)} had it coming."),
        ExitReason(character=exits[1][0], beat=exits[1][1], reason="Someone leaves."),
    ])

    fixed = repair_plan(fate, storyline(fate), bible)

    assert [(r.character, r.beat) for r in fixed.exit_reasons] == exits
    assert fixed.exit_reasons[0].reason == f"{name(fate, first_id)} had it coming."
    for r in fixed.exit_reasons:
        assert name(fate, r.character) in r.reason


def test_invalid_thread_beats_are_dropped(fate: FateScript) -> None:
    last = len(fate.beats) - 1
    bible = empty_bible(fate, threads=[
        StoryThread(title="Good", beats=[5, 2, 2, 99], summary="Setup, payoff."),
        StoryThread(title="Too short", beats=[3, -1, 400], summary="Nothing."),
        StoryThread(title="Also good", beats=[1, last], summary="Bookends."),
    ])

    fixed = repair_plan(fate, storyline(fate), bible)

    assert [(t.title, t.beats) for t in fixed.threads] == [("Good", [2, 5]), ("Also good", [1, last])]


def test_empty_threads_fall_back_to_the_winners_road(fate: FateScript) -> None:
    fixed = repair_plan(fate, storyline(fate), empty_bible(fate))
    (thread,) = fixed.threads
    assert thread.title == f"{name(fate, fate.winner)}'s road" and len(thread.beats) >= 2


def test_motivation_for_every_participant(fate: FateScript) -> None:
    first = next(c.id for c in fate.characters if c.kind == "participant")
    bible = empty_bible(fate, motivations=[Motivation(character=first, want="Wants the goat."), Motivation(character="ghost", want="x")])
    fixed = repair_plan(fate, storyline(fate), bible)
    assert [m.character for m in fixed.motivations] == [c.id for c in fate.characters if c.kind == "participant"]
    assert fixed.motivations[0].want == "Wants the goat."


async def test_direct_returns_a_repaired_plan(fate: FateScript) -> None:
    class OneReply:
        async def json(self, messages, schema, **_):
            return empty_bible(fate)

    bible = await agents.direct(OneReply(), fate)  # type: ignore[arg-type]
    assert len(bible.exit_reasons) == len(participant_exits(fate))
    assert 1 <= len(bible.threads) <= 4


def test_bible_schema_is_strict_safe() -> None:
    import openai.lib._pydantic as strict

    strict.to_strict_json_schema(ShowBible)


# --- 2.4 template bible ------------------------------------------------------------------------------------


def test_fallback_bible_still_explains_exits(fate: FateScript) -> None:
    bible = fallback_bible(fate, "seed")
    exits = participant_exits(fate)
    assert [(r.character, r.beat) for r in bible.exit_reasons] == exits
    for r in bible.exit_reasons:
        assert name(fate, r.character) in r.reason
    assert 1 <= len(bible.threads) <= 4 and all(len(t.beats) >= 2 for t in bible.threads)
    assert [m.character for m in bible.motivations] == [c.id for c in fate.characters if c.kind == "participant"]
    assert [b.synopsis for b in bible.beats] == [s.statement for s in storyline(fate).beats]
