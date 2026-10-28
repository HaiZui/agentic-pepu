import pytest

from bottle_throne.fate.cards import CARDS, CROWD_CARDS, DRAMA_CARDS, SINGLE_CARDS, CastContext
from bottle_throne.fate.catalog import SETTINGS
from bottle_throne.fate.planner import Slot
from bottle_throne.fate.rng import Stream
from bottle_throne.fate.solver import _to_beat
from bottle_throne.fate.state import TimelineState

PARTICIPANTS = ["p01", "p02", "p03", "p04", "p05", "p06"]
NPC_ROLES = {"npc_guard": "guard", "npc_food_taster": "food_taster", "npc_herald": "herald"}
HOUSES = {"p01": "wolf", "p02": "wolf", "p03": "wolf", "p04": "eel", "p05": "eel", "p06": "eel"}


def new_state() -> TimelineState:
    return TimelineState.start(PARTICIPANTS, [*NPC_ROLES, "old_king"])


def ctx(state: TimelineState, seed: str = "t", **overrides) -> CastContext:
    values = dict(
        state=state,
        stream=Stream(seed, "card-test"),
        beat_index=5,
        section="act_2",
        winner="p01",
        old_king="old_king",
        npc_roles=NPC_ROLES,
        houses=HOUSES,
    )
    values.update(overrides)
    return CastContext(**values)


def play(card_id: str, context: CastContext, slot_type: str = "drama"):
    card = CARDS[card_id]
    draft = card.cast(context)
    assert draft is not None, f"{card_id} could not be cast"
    beat = _to_beat(context.beat_index, Slot(context.section, slot_type), card, draft)  # type: ignore[arg-type]
    context.state.apply(beat)
    return beat


def roles_of(beat) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for r in beat.roles:
        out.setdefault(r.role, []).append(r.character)
    return out


# --- registry ------------------------------------------------------------------------------------


def test_registry_is_well_formed() -> None:
    for card in CARDS.values():
        assert card.settings and set(card.settings) <= set(SETTINGS), card.id
        assert card.base_seconds > 0
        if card.kind in ("single", "crowd"):
            assert card.mode in ("killed", "forfeited", "exiled"), card.id
    assert CARDS["poisoned_goblet"].settings == ("feast_hall",)
    assert {c.id for c in CROWD_CARDS} == {
        "grey_plague", "muddy_field_battle", "crimson_feast", "wildfire",
        "march_of_pale_ones", "bridge_gives_way", "grey_cloak_mutiny", "kingsmoot_exile",
    }
    assert {"prophecy", "near_miss", "wound", "decree"} <= {c.id for c in DRAMA_CARDS} | {"prophecy"}
    assert len(SINGLE_CARDS) == 7


def test_section_restrictions() -> None:
    state = new_state()
    assert CARDS["prophecy"].cast(ctx(state, section="act_2")) is None
    assert CARDS["dragon_egg"].cast(ctx(state, section="act_3")) is None
    assert CARDS["grey_plague"].cast(ctx(state, section="act_3", crowd_size=2)) is None
    assert CARDS["red_priestess"].cast(ctx(state, section="act_1", risen="p02")) is None


def test_dragon_cards_respect_victims_and_sections() -> None:
    variants = set()
    heroes = set()
    for seed in range(40):
        state = new_state()
        victory = CARDS["dragon_victory"].cast(ctx(state, seed=str(seed)))
        assert victory is not None and not victory.eliminations
        assert len(victory.roles) == 1 and victory.roles[0][0] == "hero"
        heroes.add(victory.roles[0][1])
        defeat = CARDS["dragon_defeat"].cast(ctx(state, seed=str(seed), forced_victim="p02"))
        assert defeat is not None and defeat.roles == [("hero", "p02")]
        assert defeat.eliminations == [("p02", "killed")]
        variants.update(defeat.facts)
    assert variants == {"dragon_slaying", "sword_accident"}
    assert heroes - {"p01"}
    state.immune_until["p02"] = 5
    assert CARDS["dragon_defeat"].cast(ctx(state, forced_victim="p02")) is None
    assert CARDS["dragon_defeat"].cast(ctx(new_state(), forced_victim="p01")) is None
    for card in ("dragon_victory", "dragon_defeat"):
        assert CARDS[card].cast(ctx(new_state(), section="act_3")) is None


# --- state model ---------------------------------------------------------------------------------


def test_state_tracks_alliances_and_eliminations() -> None:
    state = new_state()
    beat = play("sworn_alliance", ctx(state))
    a, b = roles_of(beat)["ally"]
    assert state.allied(a, b)

    play("trial_by_combat", ctx(state, forced_victim=a), "single")
    assert not state.is_alive(a)
    assert not state.allied(a, b)
    assert state.eliminated[a] == "killed"


# --- character cards ---------------------------------------------------------------------------------


def test_knife_in_the_back_requires_alliance() -> None:
    state = new_state()
    assert CARDS["knife_in_the_back"].cast(ctx(state)) is None

    state.alliances.add(frozenset({"p02", "p03"}))
    beat = play("knife_in_the_back", ctx(state, protected=frozenset({"p02"})), "single")
    assert roles_of(beat) == {"betrayer": ["p02"], "victim": ["p03"]}
    assert [(e.character, e.mode) for e in beat.eliminations] == [("p03", "killed")]
    assert not state.allied("p02", "p03")
    assert beat.dramatic


def test_knife_foiled_breaks_alliance_without_death() -> None:
    state = new_state()
    state.alliances.add(frozenset({"p01", "p04"}))
    beat = play("knife_foiled", ctx(state))
    assert beat.eliminations == []
    assert "attempt_failed" in beat.facts
    assert not state.allied("p01", "p04")


def test_trial_by_combat_respects_protection() -> None:
    for seed in range(20):
        state = new_state()
        protected = frozenset(PARTICIPANTS[:-1])
        beat = play("trial_by_combat", ctx(state, seed=str(seed), protected=protected), "single")
        assert [e.character for e in beat.eliminations] == ["p06"]
        assert roles_of(beat)["challenger"] != ["p06"]


def test_poisoned_goblet_variants_and_setting() -> None:
    variants = set()
    for seed in range(30):
        state = new_state()
        beat = play("poisoned_goblet", ctx(state, seed=str(seed), protected=frozenset({"p01"})), "single")
        assert beat.setting == "feast_hall"
        victim = beat.eliminations[0].character
        assert victim != "p01"
        if "poisoner_drank" in beat.facts:
            assert roles_of(beat)["poisoner"] == [victim]
            variants.add("drank")
        else:
            assert roles_of(beat)["victim"] == [victim]
            variants.add("normal")
    assert variants == {"drank", "normal"}


def test_grey_cloak_forfeits_and_iron_vault_exiles() -> None:
    state = new_state()
    assert play("grey_cloak", ctx(state), "single").eliminations[0].mode == "forfeited"
    assert play("iron_vault_debt", ctx(state), "single").eliminations[0].mode == "exiled"


def test_faceless_contract_then_strike() -> None:
    state = new_state()
    assert CARDS["faceless_strike"].cast(ctx(state)) is None

    contract = play("faceless_contract", ctx(state, protected=frozenset({"p01"})))
    target = roles_of(contract)["target"][0]
    assert state.contracts[target] == roles_of(contract)["client"][0]

    strike = play("faceless_strike", ctx(state, protected=frozenset({"p01"})), "single")
    assert strike.eliminations[0].character == target
    assert target not in state.contracts


def test_dragon_egg_grants_immunity_for_next_beat() -> None:
    state = new_state()
    beat = play("dragon_egg", ctx(state, beat_index=4))
    bearer = roles_of(beat)["bearer"][0]
    assert bearer not in ctx(state, beat_index=5).victim_pool()
    assert bearer in ctx(state, beat_index=6).victim_pool()


def test_red_priestess_raises_only_the_dead() -> None:
    state = new_state()
    assert CARDS["red_priestess"].cast(ctx(state, risen="p02")) is None
    play("trial_by_combat", ctx(state, forced_victim="p02"), "single")
    beat = play("red_priestess", ctx(state, risen="p02"), "resurrection")
    assert beat.resurrections == ["p02"]
    assert state.is_alive("p02") and "p02" in state.resurrected


def test_old_kings_gambit_and_pardon_need_living_king() -> None:
    state = new_state()
    beat = play("old_kings_gambit", ctx(state), "single")
    assert roles_of(beat)["old_king"] == ["old_king"]
    assert beat.eliminations[0].mode == "exiled"
    assert "pardoned" in play("old_kings_pardon", ctx(state)).facts

    state.alive.discard("old_king")
    assert CARDS["old_kings_gambit"].cast(ctx(state)) is None
    assert CARDS["old_kings_pardon"].cast(ctx(state)) is None
    assert CARDS["decree"].cast(ctx(state)) is None


def test_iron_vault_debt_paid_by_ally() -> None:
    state = new_state()
    assert CARDS["debt_paid"].cast(ctx(state)) is None
    state.alliances.add(frozenset({"p03", "p05"}))
    beat = play("debt_paid", ctx(state))
    assert sorted(roles_of(beat)["debtor"] + roles_of(beat)["payer"]) == ["p03", "p05"]
    assert beat.eliminations == []


def test_forced_victim_is_used_by_single_cards() -> None:
    for card_id in ("trial_by_combat", "poisoned_goblet", "grey_cloak", "iron_vault_debt"):
        state = new_state()
        beat = play(card_id, ctx(state, forced_victim="p04"), "single")
        assert [e.character for e in beat.eliminations] == ["p04"], card_id


# --- drama cards -----------------------------------------------------------------------------------


def test_drama_cards_never_eliminate_participants() -> None:
    state = new_state()
    state.alliances.add(frozenset({"p02", "p03"}))
    for card_id in ("sworn_alliance", "near_miss", "wound", "decree", "knife_foiled", "dragon_egg"):
        beat = play(card_id, ctx(state, section="act_1"))
        assert not [e for e in beat.eliminations if e.character in PARTICIPANTS], card_id


def test_prophecy_has_seer_and_listener() -> None:
    beat = play("prophecy", ctx(new_state(), section="act_1"))
    roles = roles_of(beat)
    assert roles["seer"][0].startswith("npc_")
    assert roles["listener"][0] in PARTICIPANTS


def test_wound_and_decree_effects() -> None:
    state = new_state()
    beat = play("wound", ctx(state))
    assert roles_of(beat)["wounded"][0] in state.wounds
    decree = play("decree", ctx(state))
    assert roles_of(decree) == {"old_king": ["old_king"], "announcer": ["npc_herald"]}


def test_taster_falls_kills_only_the_npc() -> None:
    state = new_state()
    beat = play("taster_falls", ctx(state))
    assert [(e.character, e.mode) for e in beat.eliminations] == [("npc_food_taster", "killed")]
    assert CARDS["taster_falls"].cast(ctx(state)) is None


# --- crowd cards -----------------------------------------------------------------------------------


@pytest.mark.parametrize("card_id", [c.id for c in CROWD_CARDS])
def test_crowd_cards_remove_exact_size(card_id: str) -> None:
    state = new_state()
    card = CARDS[card_id]
    beat = play(card_id, ctx(state, crowd_size=3, protected=frozenset({"p01"})), "crowd")
    victims = [e.character for e in beat.eliminations]
    assert len(victims) == 3
    assert "p01" not in victims
    assert all(e.mode == card.mode for e in beat.eliminations)
    assert sorted(roles_of(beat)["fallen"]) == sorted(victims)


def test_crowd_needs_enough_victims() -> None:
    state = new_state()
    protected = frozenset(PARTICIPANTS[:5])
    assert CARDS["grey_plague"].cast(ctx(state, crowd_size=2, protected=protected)) is None


def test_crowd_includes_forced_victim() -> None:
    for seed in range(10):
        beat = play("wildfire", ctx(new_state(), seed=str(seed), crowd_size=2, forced_victim="p05"), "crowd")
        assert "p05" in [e.character for e in beat.eliminations]


def test_battle_needs_commanders_from_two_houses() -> None:
    state = new_state()
    beat = play("muddy_field_battle", ctx(state, crowd_size=2), "crowd")
    commanders = roles_of(beat)["commander"]
    assert {HOUSES[c] for c in commanders} == {"wolf", "eel"}
    assert not set(commanders) & {e.character for e in beat.eliminations}

    no_houses = ctx(new_state(), crowd_size=2, houses={})
    assert CARDS["muddy_field_battle"].cast(no_houses) is None


def test_crimson_feast_host_survives() -> None:
    for seed in range(10):
        beat = play("crimson_feast", ctx(new_state(), seed=str(seed), crowd_size=2), "crowd")
        host = roles_of(beat)["host"][0]
        assert host not in [e.character for e in beat.eliminations]
        assert beat.setting == "feast_hall"


# --- structure ------------------------------------------------------------------------------------


def test_final_duel_and_coronation() -> None:
    state = new_state()
    assert CARDS["final_duel"].cast(ctx(state, section="act_3")) is None
    for p in PARTICIPANTS[2:]:
        state.alive.discard(p)
    beat = play("final_duel", ctx(state, section="act_3"), "final")
    assert roles_of(beat) == {"champion": ["p01"], "rival": ["p02"]}
    assert state.alive_participants() == ["p01"]

    coronation = play("coronation", ctx(state, section="coronation"), "coronation")
    assert roles_of(coronation) == {"crowned": ["p01"], "old_king": ["old_king"]}
