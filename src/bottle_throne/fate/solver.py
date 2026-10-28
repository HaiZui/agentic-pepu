from collections import Counter
from dataclasses import dataclass

from bottle_throne.fate.cards import CARDS, CROWD_CARDS, DRAMA_CARDS, SINGLE_CARDS, Card, CastContext, Draft
from bottle_throne.fate.characters import Cast, build_cast, resolve_old_king_name
from bottle_throne.fate.fairness import ENGINE_VERSION, canonical_roster, seal_of_fate, select_winner_index
from bottle_throne.fate.hints import choose_hints, winner_facts
from bottle_throne.fate.planner import Plan, Slot, make_plan
from bottle_throne.fate.rng import Stream
from bottle_throne.fate.state import TimelineState
from bottle_throne.models.fate import Alliance, Beat, Elimination, FateScript, Role

MAX_ATTEMPTS = 64
TARGET_SECONDS = 600

STRUCTURAL_SLOTS = {
    "cold_open": "cold_open",
    "decree": "decree",
    "prophecy": "prophecy",
    "resurrection": "red_priestess",
    "final": "final_duel",
    "coronation": "coronation",
}


class FateError(RuntimeError):
    pass


@dataclass
class Solution:
    script: FateScript
    attempts: int
    plan: Plan


def _candidates(slot: Slot) -> list[Card]:
    if slot.type in STRUCTURAL_SLOTS:
        return [CARDS[STRUCTURAL_SLOTS[slot.type]]]
    if slot.type == "single":
        cards = SINGLE_CARDS
    elif slot.type == "crowd":
        cards = CROWD_CARDS
    else:
        cards = [c for c in DRAMA_CARDS if c.id != "decree" or slot.section != "act_1"]
    if slot.first_blood:
        cards = [c for c in cards if c.mode == "killed"]
    if slot.nonlethal:
        cards = [c for c in cards if c.mode in ("forfeited", "exiled")]
    return cards


def _weight(card: Card, slot: Slot, used: Counter[str]) -> int:
    weight = max(card.weight, 1) * 6
    if card.id == "sworn_alliance" and slot.section == "act_1":
        weight *= 3
    return max(1, weight // (1 + 3 * used[card.id]))


def _weighted_order(cards: list[Card], slot: Slot, used: Counter[str], stream: Stream) -> list[Card]:
    remaining = list(cards)
    order = []
    while remaining:
        card = stream.weighted_choice(remaining, [_weight(c, slot, used) for c in remaining])
        order.append(card)
        remaining.remove(card)
    return order


def _to_beat(index: int, slot: Slot, card: Card, draft: Draft) -> Beat:
    return Beat(
        index=index,
        section=slot.section,
        card=card.id,
        title=card.title,
        kind=card.kind,
        setting=draft.setting,
        roles=[Role(role=r, character=c) for r, c in draft.roles],
        eliminations=[Elimination(character=c, mode=m) for c, m in draft.eliminations],
        resurrections=draft.resurrections,
        alliances_formed=[Alliance(a=a, b=b) for a, b in draft.alliances_formed],
        alliances_broken=[Alliance(a=a, b=b) for a, b in draft.alliances_broken],
        facts=(["first_blood"] if slot.first_blood else []) + draft.facts,
        prophecy_hints=[],
        budget_seconds=card.base_seconds,
        dramatic=card.dramatic,
    )


def scale_budgets(beats: list[Beat], target: int = TARGET_SECONDS) -> None:
    """Scale base durations so they sum exactly to `target` seconds (largest-remainder rounding)."""
    base = [b.budget_seconds for b in beats]
    factor = target / sum(base)
    raw = [s * factor for s in base]
    whole = [int(r) for r in raw]
    shortfall = target - sum(whole)
    by_remainder = sorted(range(len(raw)), key=lambda i: (-(raw[i] - whole[i]), i))
    for i in by_remainder[:shortfall]:
        whole[i] += 1
    for beat, seconds in zip(beats, whole, strict=True):
        beat.budget_seconds = seconds


def _attempt(seed: str, attempt: int, cast: Cast, winner: str) -> tuple[list[Beat], Plan] | None:
    n = len(cast.participant_ids)
    plan_stream = Stream(seed, f"plan#{attempt}")
    plan = make_plan(n, plan_stream)
    encounter_stream = Stream(seed, f"dragon#{attempt}")
    eligible = [
        i for i, slot in enumerate(plan.slots)
        if slot.section in ("act_1", "act_2")
        and (slot.type == "drama" or (slot.type == "single" and not slot.nonlethal))
    ]
    encounter = encounter_stream.choice(eligible) if eligible and encounter_stream.chance(1, 3) else None

    others = [p for p in cast.participant_ids if p != winner]
    contenders = frozenset([winner, *plan_stream.sample(others, plan.contenders - 1)])
    risen: str | None = None
    if plan.resurrection:
        options = [winner, *sorted(contenders - {winner})]
        non_contenders = [p for p in cast.participant_ids if p not in contenders]
        if non_contenders:
            options.append(plan_stream.choice(non_contenders))
        risen = plan_stream.choice(options)

    state = TimelineState.start(cast.participant_ids, list(cast.npc_roles) + [cast.old_king_id])
    beats: list[Beat] = []
    used: Counter[str] = Counter()
    first_blood_done = False
    for index, slot in enumerate(plan.slots):
        if slot.section in ("act_1", "act_2"):
            protected = set(contenders)
            if risen and not first_blood_done:
                protected.add(risen)
        elif slot.section == "act_3":
            protected = {winner}
        else:
            protected = set(cast.participant_ids)
        stream = Stream(seed, f"cast#{attempt}:{index}")
        ctx = CastContext(
            state=state,
            stream=stream,
            beat_index=index,
            section=slot.section,
            winner=winner,
            old_king=cast.old_king_id,
            npc_roles=cast.npc_roles,
            houses=cast.house_of,
            protected=frozenset(protected - ({risen} if slot.first_blood and risen else set())),
            forced_victim=risen if slot.first_blood else None,
            crowd_size=slot.size,
            risen=risen,
        )
        candidates = _weighted_order(_candidates(slot), slot, used, stream)
        if index == encounter:
            candidates.insert(0, CARDS["dragon_victory" if slot.type == "drama" else "dragon_defeat"])
        for card in candidates:
            draft = card.cast(ctx)
            if draft is not None:
                break
        else:
            return None
        used[card.id] += 1
        beat = _to_beat(index, slot, card, draft)
        state.apply(beat)
        beats.append(beat)
        if slot.first_blood:
            first_blood_done = True
    return beats, plan


def solve(seed: str, roster: list[str], old_king: str | None, seed_mode: str = "auto") -> Solution:
    """Build the fate script. `old_king` None means the Mad King; a roster name means the king competes."""
    from bottle_throne.fate.validate import validate

    canonical = canonical_roster(roster)
    cast = build_cast(seed, canonical, old_king)
    winner = cast.participant_ids[select_winner_index(seed, canonical)]
    seal_old_king, _ = resolve_old_king_name(canonical, old_king)
    seal = seal_of_fate(seed, canonical, seal_old_king)

    for attempt in range(MAX_ATTEMPTS):
        result = _attempt(seed, attempt, cast, winner)
        if result is None:
            continue
        beats, plan = result
        scale_budgets(beats)
        prophecy = next(b for b in beats if b.card == "prophecy")
        facts = winner_facts(winner, cast.characters, cast.houses, beats)
        prophecy.prophecy_hints = choose_hints(facts, Stream(seed, f"hints#{attempt}"))
        script = FateScript(
            engine_version=ENGINE_VERSION,
            seal=seal,
            seed_mode=seed_mode,  # type: ignore[arg-type]
            roster_size=len(canonical),
            characters=cast.characters,
            houses=cast.houses,
            old_king=cast.old_king_id,
            winner=winner,
            beats=beats,
            total_budget_seconds=sum(b.budget_seconds for b in beats),
        )
        if not validate(script):
            return Solution(script=script, attempts=attempt + 1, plan=plan)
    raise FateError(f"no valid timeline after {MAX_ATTEMPTS} attempts")


def generate_fate(seed: str, roster: list[str], old_king: str | None, seed_mode: str = "auto") -> FateScript:
    return solve(seed, roster, old_king, seed_mode).script
