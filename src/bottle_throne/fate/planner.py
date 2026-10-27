from dataclasses import dataclass, field
from typing import Literal

from bottle_throne.fate.catalog import Section
from bottle_throne.fate.rng import Stream

SlotType = Literal[
    "cold_open", "decree", "prophecy", "drama", "single", "crowd", "resurrection", "final", "coronation"
]
ELIMINATING: frozenset[str] = frozenset({"single", "crowd"})
MAX_CROWD = 6


@dataclass
class Slot:
    section: Section
    type: SlotType
    size: int = 0
    first_blood: bool = False
    nonlethal: bool = False


@dataclass
class Plan:
    slots: list[Slot]
    contenders: int  # k: participants alive when Act III starts
    resurrection: bool
    singles: int  # single-elimination slots in Acts I and II
    crowd_sizes: list[int] = field(default_factory=list)

    @property
    def act_eliminations(self) -> int:
        """Participant elimination events planned for Acts I and II."""
        return self.singles + sum(self.crowd_sizes)


def _template(n: int, stream: Stream) -> tuple[int, int, int]:
    if n >= 25:
        return 6, 10, stream.choice([3, 4])
    act2 = stream.choice([8, 9]) if n <= 8 else stream.choice([8, 9, 10])
    return stream.choice([5, 6]), act2, stream.choice([3, 4])


def _split_crowds(total: int, count: int, stream: Stream) -> list[int]:
    sizes = [total // count] * count
    for i in stream.sample(list(range(count)), total % count):
        sizes[i] += 1
    return sizes


def _elimination_mix(n: int, eliminations: int, capacity: int, stream: Stream) -> tuple[int, list[int]]:
    """Choose singles and crowd sizes so that singles + sum(crowds) == eliminations within `capacity` slots."""
    crowds = 0
    while True:
        singles = min(capacity - crowds, eliminations - 2 * crowds)
        if singles >= 0 and singles + MAX_CROWD * crowds >= eliminations:
            break
        crowds += 1
        if 2 * crowds > eliminations and crowds > 0 and eliminations > 0:
            raise ValueError("no feasible elimination mix")
    # Medium and large rosters get one extra, smaller crowd event for spectacle when it still fits.
    if n >= 12:
        extra = crowds + 1
        extra_singles = min(capacity - extra, eliminations - 2 * extra)
        if extra_singles >= 2 and extra_singles + MAX_CROWD * extra >= eliminations:
            crowds, singles = extra, extra_singles
    sizes = _split_crowds(eliminations - singles, crowds, stream) if crowds else []
    return singles, sizes


def make_plan(n: int, stream: Stream) -> Plan:
    act1, act2, act3 = _template(n, stream)
    k = stream.choice([2, 3])
    resurrection = n >= 6 and stream.chance(1, 2)
    eliminations = n - k + (1 if resurrection else 0)

    free1 = act1 - 2  # decree + prophecy are fixed in Act I
    free2 = act2 - (1 if resurrection else 0)
    free = free1 + free2
    min_drama = 2 if free >= 6 else 0
    singles, crowd_sizes = _elimination_mix(n, eliminations, free - min_drama, stream)

    single_slots = [Slot("act_1", "single") for _ in range(singles)]
    crowd_slots = [Slot("act_2", "crowd", size=s) for s in crowd_sizes]

    n1 = min(singles, max(1 if singles else 0, free1 - 1))
    act1_slots = single_slots[:n1]
    remaining = single_slots[n1:] + crowd_slots
    while len(remaining) > free2:
        act1_slots.append(remaining.pop(0))
    act1_slots += [Slot("act_1", "drama") for _ in range(free1 - len(act1_slots))]
    act2_slots = remaining + [Slot("act_2", "drama") for _ in range(free2 - len(remaining))]
    for slot in act1_slots:
        slot.section = "act_1"
    for slot in act2_slots:
        slot.section = "act_2"

    act1_order = stream.shuffle(act1_slots)
    act1_order.insert(stream.choice([0, 1]), Slot("act_1", "prophecy"))
    act1_order.insert(0, Slot("act_1", "decree"))

    act2_order = stream.shuffle(act2_slots)
    if resurrection:
        positions = [p for p in range(1, len(act2_order)) if any(s.type in ELIMINATING for s in act2_order[p:])]
        act2_order.insert(stream.choice(positions or [1]), Slot("act_2", "resurrection"))

    act3_body = [Slot("act_3", "single")] if k == 3 else []
    act3_body += [Slot("act_3", "drama") for _ in range(act3 - 1 - len(act3_body))]
    act3_order = stream.shuffle(act3_body) + [Slot("act_3", "final")]

    if resurrection:
        act1_singles = [s for s in act1_order if s.type == "single"]
        first = act1_singles[0] if act1_singles else next(s for s in act1_order + act2_order if s.type in ELIMINATING)
        first.first_blood = True

    if n >= 6:
        candidates = [s for s in act1_order + act2_order + act3_order if s.type == "single" and not s.first_blood]
        if not candidates:
            candidates = [s for s in act1_order + act2_order if s.type == "crowd" and not s.first_blood]
        stream.choice(candidates).nonlethal = True

    slots = [Slot("cold_open", "cold_open"), *act1_order, *act2_order, *act3_order, Slot("coronation", "coronation")]
    return Plan(slots=slots, contenders=k, resurrection=resurrection, singles=singles, crowd_sizes=crowd_sizes)
