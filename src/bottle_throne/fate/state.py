from dataclasses import dataclass, field

from bottle_throne.models.fate import Beat


def pair(a: str, b: str) -> frozenset[str]:
    return frozenset((a, b))


@dataclass
class TimelineState:
    """Mutable world state while walking the beats. Solver and validator replay it identically."""

    participants: frozenset[str]
    alive: set[str]
    eliminated: dict[str, str] = field(default_factory=dict)
    alliances: set[frozenset[str]] = field(default_factory=set)
    contracts: dict[str, str] = field(default_factory=dict)  # target -> client
    wounds: set[str] = field(default_factory=set)
    immune_until: dict[str, int] = field(default_factory=dict)  # character -> last protected beat index
    resurrected: set[str] = field(default_factory=set)

    @classmethod
    def start(cls, participants: list[str], others: list[str]) -> "TimelineState":
        return cls(participants=frozenset(participants), alive=set(participants) | set(others))

    def is_alive(self, character: str) -> bool:
        return character in self.alive

    def alive_participants(self) -> list[str]:
        return sorted(c for c in self.alive if c in self.participants)

    def allied(self, a: str, b: str) -> bool:
        return pair(a, b) in self.alliances

    def allies_of(self, character: str) -> list[str]:
        return sorted(next(iter(p - {character})) for p in self.alliances if character in p)

    def is_immune(self, character: str, beat_index: int) -> bool:
        return self.immune_until.get(character, -1) >= beat_index

    def apply(self, beat: Beat) -> None:
        roles = {r.role: r.character for r in beat.roles}

        for alliance in beat.alliances_broken:
            self.alliances.discard(pair(alliance.a, alliance.b))
        for alliance in beat.alliances_formed:
            self.alliances.add(pair(alliance.a, alliance.b))

        if beat.card == "faceless_contract":
            self.contracts[roles["target"]] = roles["client"]
        elif beat.card == "faceless_strike":
            self.contracts.pop(roles["target"], None)
        elif beat.card == "dragon_egg":
            self.immune_until[roles["bearer"]] = beat.index + 1
        elif beat.card == "wound":
            self.wounds.add(roles["wounded"])

        for elimination in beat.eliminations:
            victim = elimination.character
            self.alive.discard(victim)
            self.eliminated[victim] = elimination.mode
            self.alliances = {p for p in self.alliances if victim not in p}
            self.contracts.pop(victim, None)

        for risen in beat.resurrections:
            self.alive.add(risen)
            self.eliminated.pop(risen, None)
            self.resurrected.add(risen)
