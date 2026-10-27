"""Declarative event cards. Each card checks its precondition and casts roles from the timeline state."""

from collections.abc import Callable
from dataclasses import dataclass, field

from bottle_throne.fate.catalog import CardKind, EliminationMode, Section, SettingId
from bottle_throne.fate.rng import Stream
from bottle_throne.fate.state import TimelineState

ACTS_I_II: frozenset[Section] = frozenset({"act_1", "act_2"})
ACTS_ALL: frozenset[Section] = frozenset({"act_1", "act_2", "act_3"})


@dataclass
class Draft:
    """A cast card before it becomes a Beat: who does what, and the state effects."""

    setting: SettingId
    roles: list[tuple[str, str]]
    eliminations: list[tuple[str, EliminationMode]] = field(default_factory=list)
    resurrections: list[str] = field(default_factory=list)
    alliances_formed: list[tuple[str, str]] = field(default_factory=list)
    alliances_broken: list[tuple[str, str]] = field(default_factory=list)
    facts: list[str] = field(default_factory=list)


@dataclass
class CastContext:
    state: TimelineState
    stream: Stream
    beat_index: int
    section: Section
    winner: str
    old_king: str
    npc_roles: dict[str, str]  # npc character id -> npc role
    houses: dict[str, str]  # participant id -> house id
    protected: frozenset[str] = frozenset()
    forced_victim: str | None = None
    crowd_size: int = 0
    risen: str | None = None

    def open_pool(self) -> list[str]:
        """Participants that may be eliminated here, ignoring any forced victim."""
        return [
            p
            for p in self.state.alive_participants()
            if p not in self.protected and not self.state.is_immune(p, self.beat_index)
        ]

    def victim_pool(self) -> list[str]:
        """Participants a single-elimination card may pick: only the forced victim when one is set."""
        if self.forced_victim is not None:
            victim = self.forced_victim
            ok = self.state.is_alive(victim) and not self.state.is_immune(victim, self.beat_index)
            return [victim] if ok else []
        return self.open_pool()

    def crowd_victims(self, exclude: tuple[str, ...] = ()) -> list[str] | None:
        """Pick `crowd_size` victims, always including the forced victim when one is set."""
        forced = [v for v in self.victim_pool() if v not in exclude] if self.forced_victim else []
        if self.forced_victim and not forced:
            return None
        pool = [p for p in self.open_pool() if p not in exclude and p not in forced]
        need = self.crowd_size - len(forced)
        if self.crowd_size < 2 or need > len(pool):
            return None
        return sorted(forced + self.stream.sample(pool, need))

    def alive_npcs(self) -> list[str]:
        return sorted(n for n in self.npc_roles if self.state.is_alive(n))

    def npc_with_role(self, *roles: str) -> str | None:
        for role in roles:
            for npc in self.alive_npcs():
                if self.npc_roles[npc] == role:
                    return npc
        return None

    def actors(self, exclude: tuple[str, ...] = ()) -> list[str]:
        """Alive participants and NPCs who can act in a scene."""
        return [c for c in self.state.alive_participants() + self.alive_npcs() if c not in exclude]

    def old_king_alive(self) -> bool:
        return self.state.is_alive(self.old_king)

    def alliance_pairs(self) -> list[tuple[str, str]]:
        return sorted(tuple(sorted(p)) for p in self.state.alliances)  # type: ignore[misc]


@dataclass(frozen=True)
class Card:
    id: str
    title: str
    kind: CardKind
    sections: frozenset[Section]
    settings: tuple[SettingId, ...]
    base_seconds: int
    dramatic: bool
    weight: int
    precondition: Callable[[CastContext], bool]
    cast_roles: Callable[[CastContext, "Card"], Draft | None]
    mode: EliminationMode | None = None

    def cast(self, ctx: CastContext) -> Draft | None:
        if ctx.section not in self.sections or not self.precondition(ctx):
            return None
        return self.cast_roles(ctx, self)

    def pick_setting(self, ctx: CastContext) -> SettingId:
        return ctx.stream.choice(self.settings)


def _always(_: CastContext) -> bool:
    return True


# --- single-elimination cards -------------------------------------------------------------


def _knife_pairs(ctx: CastContext, victims: list[str]) -> list[tuple[str, str]]:
    pairs = []
    for a, b in ctx.alliance_pairs():
        if b in victims and ctx.state.is_alive(a):
            pairs.append((a, b))
        if a in victims and ctx.state.is_alive(b):
            pairs.append((b, a))
    return pairs


def _knife_in_the_back(ctx: CastContext, card: Card) -> Draft | None:
    pairs = _knife_pairs(ctx, ctx.victim_pool())
    if not pairs:
        return None
    betrayer, victim = ctx.stream.choice(pairs)
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("betrayer", betrayer), ("victim", victim)],
        eliminations=[(victim, "killed")],
        alliances_broken=[(betrayer, victim)],
    )


def _trial_by_combat(ctx: CastContext, card: Card) -> Draft | None:
    pool = ctx.victim_pool()
    if not pool:
        return None
    fallen = ctx.stream.choice(pool)
    challengers = ctx.actors(exclude=(fallen,))
    if not challengers:
        return None
    guard = ctx.npc_with_role("guard")
    challenger = guard if guard and ctx.stream.chance(1, 3) else ctx.stream.choice(challengers)
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("challenger", challenger), ("fallen", fallen)],
        eliminations=[(fallen, "killed")],
    )


def _poisoned_goblet(ctx: CastContext, card: Card) -> Draft | None:
    pool = ctx.victim_pool()
    if not pool:
        return None
    victim = ctx.stream.choice(pool)
    others = [p for p in ctx.state.alive_participants() if p != victim]
    if others and ctx.stream.chance(1, 3):
        intended = ctx.stream.choice(others)
        return Draft(
            setting=card.pick_setting(ctx),
            roles=[("poisoner", victim), ("intended", intended)],
            eliminations=[(victim, "killed")],
            facts=["poisoner_drank"],
        )
    poisoners = ctx.actors(exclude=(victim,))
    if not poisoners:
        return None
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("poisoner", ctx.stream.choice(poisoners)), ("victim", victim)],
        eliminations=[(victim, "killed")],
    )


def _grey_cloak(ctx: CastContext, card: Card) -> Draft | None:
    pool = ctx.victim_pool()
    if not pool:
        return None
    deserter = ctx.stream.choice(pool)
    return Draft(setting=card.pick_setting(ctx), roles=[("deserter", deserter)], eliminations=[(deserter, "forfeited")])


def _faceless_strike(ctx: CastContext, card: Card) -> Draft | None:
    pool = set(ctx.victim_pool())
    targets = sorted(t for t in ctx.state.contracts if t in pool)
    if not targets:
        return None
    target = ctx.stream.choice(targets)
    roles = [("target", target)]
    client = ctx.state.contracts[target]
    if ctx.state.is_alive(client):
        roles.append(("client", client))
    return Draft(setting=card.pick_setting(ctx), roles=roles, eliminations=[(target, "killed")])


def _iron_vault_debt(ctx: CastContext, card: Card) -> Draft | None:
    pool = ctx.victim_pool()
    if not pool:
        return None
    debtor = ctx.stream.choice(pool)
    return Draft(setting=card.pick_setting(ctx), roles=[("debtor", debtor)], eliminations=[(debtor, "exiled")])


def _old_kings_gambit(ctx: CastContext, card: Card) -> Draft | None:
    pool = [p for p in ctx.victim_pool() if p != ctx.old_king]
    if not pool:
        return None
    banished = ctx.stream.choice(pool)
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("old_king", ctx.old_king), ("banished", banished)],
        eliminations=[(banished, "exiled")],
    )


# --- drama cards (no participant eliminations) ------------------------------------------------


def _sworn_alliance(ctx: CastContext, card: Card) -> Draft | None:
    alive = ctx.state.alive_participants()
    pairs = [(a, b) for i, a in enumerate(alive) for b in alive[i + 1 :] if not ctx.state.allied(a, b)]
    if not pairs:
        return None
    a, b = ctx.stream.choice(pairs)
    return Draft(setting=card.pick_setting(ctx), roles=[("ally", a), ("ally", b)], alliances_formed=[(a, b)])


def _knife_foiled(ctx: CastContext, card: Card) -> Draft | None:
    pairs = _knife_pairs(ctx, ctx.state.alive_participants())
    if not pairs:
        return None
    weights = [3 if victim == ctx.winner else 1 for _, victim in pairs]
    betrayer, victim = ctx.stream.weighted_choice(pairs, weights)
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("betrayer", betrayer), ("victim", victim)],
        alliances_broken=[(betrayer, victim)],
        facts=["attempt_failed"],
    )


def _faceless_contract(ctx: CastContext, card: Card) -> Draft | None:
    targets = [
        p
        for p in ctx.state.alive_participants()
        if p not in ctx.protected and p not in ctx.state.contracts
    ]
    if not targets:
        return None
    target = ctx.stream.choice(targets)
    adviser = ctx.npc_with_role("adviser")
    clients = [c for c in ctx.state.alive_participants() if c != target] + ([adviser] if adviser else [])
    if not clients:
        return None
    return Draft(setting=card.pick_setting(ctx), roles=[("client", ctx.stream.choice(clients)), ("target", target)])


def _dragon_egg(ctx: CastContext, card: Card) -> Draft | None:
    alive = ctx.state.alive_participants()
    if not alive:
        return None
    return Draft(setting=card.pick_setting(ctx), roles=[("bearer", ctx.stream.choice(alive))])


def _old_kings_pardon(ctx: CastContext, card: Card) -> Draft | None:
    candidates = [p for p in ctx.state.alive_participants() if p != ctx.old_king]
    if not candidates:
        return None
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("old_king", ctx.old_king), ("pardoned", ctx.stream.choice(candidates))],
        facts=["pardoned"],
    )


def _debt_paid(ctx: CastContext, card: Card) -> Draft | None:
    debtors = [p for p in ctx.state.alive_participants() if ctx.state.allies_of(p)]
    if not debtors:
        return None
    debtor = ctx.stream.choice(debtors)
    payer = ctx.stream.choice([a for a in ctx.state.allies_of(debtor) if ctx.state.is_alive(a)])
    return Draft(setting=card.pick_setting(ctx), roles=[("debtor", debtor), ("payer", payer)], facts=["debt_paid"])


def _near_miss(ctx: CastContext, card: Card) -> Draft | None:
    alive = ctx.state.alive_participants()
    if not alive:
        return None
    return Draft(setting=card.pick_setting(ctx), roles=[("survivor", ctx.stream.choice(alive))])


def _wound(ctx: CastContext, card: Card) -> Draft | None:
    alive = ctx.state.alive_participants()
    if not alive:
        return None
    wounded = ctx.stream.choice(alive)
    attackers = ctx.actors(exclude=(wounded,))
    if not attackers:
        return None
    return Draft(setting=card.pick_setting(ctx), roles=[("wounded", wounded), ("attacker", ctx.stream.choice(attackers))])


def _with_announcer(ctx: CastContext, roles: list[tuple[str, str]]) -> list[tuple[str, str]]:
    announcer = ctx.npc_with_role("herald", "adviser", "jester", "guard", "food_taster")
    return roles + ([("announcer", announcer)] if announcer else [])


def _decree(ctx: CastContext, card: Card) -> Draft | None:
    return Draft(setting=card.pick_setting(ctx), roles=_with_announcer(ctx, [("old_king", ctx.old_king)]))


def _prophecy(ctx: CastContext, card: Card) -> Draft | None:
    alive = ctx.state.alive_participants()
    if not alive:
        return None
    roles = [("listener", ctx.stream.choice(alive))]
    seer = ctx.npc_with_role("jester", "adviser", "herald", "guard", "food_taster")
    if seer:
        roles.insert(0, ("seer", seer))
    return Draft(setting=card.pick_setting(ctx), roles=roles)


def _taster_falls(ctx: CastContext, card: Card) -> Draft | None:
    taster = ctx.npc_with_role("food_taster")
    alive = ctx.state.alive_participants()
    if taster is None or not alive:
        return None
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("taster", taster), ("intended", ctx.stream.choice(alive))],
        eliminations=[(taster, "killed")],
    )


# --- crowd cards ---------------------------------------------------------------------------------


def _crowd_survivors(ctx: CastContext, victims: list[str], extra: tuple[str, ...] = ()) -> list[tuple[str, str]]:
    others = [p for p in ctx.state.alive_participants() if p not in victims and p not in extra]
    survivors: list[str] = []
    if ctx.winner in others and ctx.stream.chance(1, 2):
        survivors.append(ctx.winner)
    rest = [p for p in others if p not in survivors]
    if rest:
        survivors.append(ctx.stream.choice(rest))
    return [("survivor", s) for s in survivors]


def _crowd(ctx: CastContext, card: Card) -> Draft | None:
    victims = ctx.crowd_victims()
    if victims is None:
        return None
    assert card.mode is not None
    roles = [("fallen", v) for v in victims] + _crowd_survivors(ctx, victims)
    return Draft(setting=card.pick_setting(ctx), roles=roles, eliminations=[(v, card.mode) for v in victims])


def _muddy_field_battle(ctx: CastContext, card: Card) -> Draft | None:
    victims = ctx.crowd_victims()
    if victims is None:
        return None
    by_house: dict[str, list[str]] = {}
    for p in ctx.state.alive_participants():
        if p not in victims and p in ctx.houses:
            by_house.setdefault(ctx.houses[p], []).append(p)
    if len(by_house) < 2:
        return None
    first, second = ctx.stream.sample(sorted(by_house), 2)
    commanders = (ctx.stream.choice(by_house[first]), ctx.stream.choice(by_house[second]))
    roles = [("commander", commanders[0]), ("commander", commanders[1])]
    roles += [("fallen", v) for v in victims] + _crowd_survivors(ctx, victims, extra=commanders)
    return Draft(setting=card.pick_setting(ctx), roles=roles, eliminations=[(v, "killed") for v in victims])


def _crimson_feast(ctx: CastContext, card: Card) -> Draft | None:
    hosts = ctx.state.alive_participants()
    if not hosts:
        return None
    host = ctx.stream.choice(hosts)
    if host == ctx.forced_victim:
        return None
    pool = [p for p in ctx.open_pool() if p != host and p != ctx.forced_victim]
    forced = [ctx.forced_victim] if ctx.forced_victim else []
    need = ctx.crowd_size - len(forced)
    if ctx.crowd_size < 2 or len(pool) < need:
        return None
    host_house = ctx.houses.get(host)
    outsiders = [p for p in pool if host_house is None or ctx.houses.get(p) != host_house]
    insiders = [p for p in pool if p not in outsiders]
    victims = forced + ctx.stream.sample(outsiders, min(len(outsiders), need))
    victims += ctx.stream.sample(insiders, ctx.crowd_size - len(victims))
    victims = sorted(victims)
    roles = [("host", host)] + [("fallen", v) for v in victims] + _crowd_survivors(ctx, victims, extra=(host,))
    return Draft(setting=card.pick_setting(ctx), roles=roles, eliminations=[(v, "killed") for v in victims])


# --- structural cards ------------------------------------------------------------------------------


def _cold_open(ctx: CastContext, card: Card) -> Draft | None:
    return Draft(setting=card.pick_setting(ctx), roles=_with_announcer(ctx, [("old_king", ctx.old_king)]))


def _red_priestess(ctx: CastContext, card: Card) -> Draft | None:
    risen = ctx.risen
    if risen is None or ctx.state.is_alive(risen) or risen not in ctx.state.participants:
        return None
    return Draft(setting=card.pick_setting(ctx), roles=[("risen", risen)], resurrections=[risen])


def _final_duel(ctx: CastContext, card: Card) -> Draft | None:
    rivals = [p for p in ctx.state.alive_participants() if p != ctx.winner]
    if len(rivals) != 1 or not ctx.state.is_alive(ctx.winner):
        return None
    rival = rivals[0]
    yielded = ctx.stream.chance(1, 3)
    return Draft(
        setting=card.pick_setting(ctx),
        roles=[("champion", ctx.winner), ("rival", rival)],
        eliminations=[(rival, "forfeited" if yielded else "killed")],
        facts=["yielded"] if yielded else [],
    )


def _coronation(ctx: CastContext, card: Card) -> Draft | None:
    roles = [("crowned", ctx.winner)]
    if ctx.old_king != ctx.winner and ctx.old_king_alive():
        roles.append(("old_king", ctx.old_king))
    return Draft(setting=card.pick_setting(ctx), roles=roles)


def _has_pool(ctx: CastContext) -> bool:
    return bool(ctx.victim_pool())


def _has_alliance_victim(ctx: CastContext) -> bool:
    return bool(_knife_pairs(ctx, ctx.victim_pool()))


def _has_alliance(ctx: CastContext) -> bool:
    return bool(_knife_pairs(ctx, ctx.state.alive_participants()))


def _has_contract_victim(ctx: CastContext) -> bool:
    pool = set(ctx.victim_pool())
    return any(t in pool for t in ctx.state.contracts)


def _old_king_alive(ctx: CastContext) -> bool:
    return ctx.old_king_alive()


def _taster_alive(ctx: CastContext) -> bool:
    return ctx.npc_with_role("food_taster") is not None


def _crowd_fits(ctx: CastContext) -> bool:
    forced = 1 if ctx.forced_victim else 0
    return ctx.crowd_size >= 2 and len(ctx.open_pool()) >= ctx.crowd_size - forced


def _battle_possible(ctx: CastContext) -> bool:
    return _crowd_fits(ctx) and len({ctx.houses[p] for p in ctx.state.alive_participants() if p in ctx.houses}) >= 2


CARDS: dict[str, Card] = {
    card.id: card
    for card in [
        # single eliminations
        Card("knife_in_the_back", "The Knife in the Back", "single", ACTS_ALL,
             ("feast_hall", "dungeon", "city_streets", "forest"), 30, True, 4,
             _has_alliance_victim, _knife_in_the_back, "killed"),
        Card("trial_by_combat", "Trial by Combat", "single", ACTS_ALL,
             ("battlefield", "throne_room"), 30, True, 3, _has_pool, _trial_by_combat, "killed"),
        Card("poisoned_goblet", "The Poisoned Goblet", "single", ACTS_ALL,
             ("feast_hall",), 30, True, 3, _has_pool, _poisoned_goblet, "killed"),
        Card("grey_cloak", "Taking the Grey Cloak", "single", ACTS_ALL,
             ("ice_wall", "temple"), 30, False, 2, _has_pool, _grey_cloak, "forfeited"),
        Card("faceless_strike", "The Faceless Strike", "single", ACTS_ALL,
             ("city_streets", "dungeon", "harbor"), 30, True, 5, _has_contract_victim, _faceless_strike, "killed"),
        Card("iron_vault_debt", "Debt to the Iron Vault", "single", ACTS_ALL,
             ("harbor", "city_streets"), 30, False, 2, _has_pool, _iron_vault_debt, "exiled"),
        Card("old_kings_gambit", "The Old King's Gambit", "single", ACTS_ALL,
             ("throne_room",), 30, False, 2, lambda c: _old_king_alive(c) and _has_pool(c), _old_kings_gambit,
             "exiled"),
        # drama
        Card("sworn_alliance", "A Sworn Alliance", "drama", ACTS_ALL,
             ("temple", "forest", "harbor", "throne_room"), 22, False, 4, _always, _sworn_alliance),
        Card("knife_foiled", "A Knife in the Dark, Foiled", "drama", ACTS_ALL,
             ("dungeon", "feast_hall", "forest"), 22, True, 3, _has_alliance, _knife_foiled),
        Card("faceless_contract", "The Faceless Contract", "drama", ACTS_I_II,
             ("dungeon", "temple", "city_streets"), 22, False, 2, _always, _faceless_contract),
        Card("dragon_egg", "The Dragon Egg", "drama", ACTS_I_II,
             ("harbor", "forest", "ice_wall"), 22, False, 1, _always, _dragon_egg),
        Card("old_kings_pardon", "The Old King's Pardon", "drama", ACTS_ALL,
             ("throne_room",), 22, False, 1, _old_king_alive, _old_kings_pardon),
        Card("debt_paid", "The Debt Is Paid", "drama", ACTS_ALL,
             ("harbor",), 22, False, 1, _has_alliance, _debt_paid),
        Card("near_miss", "A Near Miss", "drama", ACTS_ALL,
             ("bridge", "forest", "city_streets", "battlefield"), 22, False, 2, _always, _near_miss),
        Card("wound", "A Grievous Wound", "drama", ACTS_ALL,
             ("battlefield", "forest", "dungeon"), 22, False, 2, _always, _wound),
        Card("decree", "The Old King's Decree", "drama", ACTS_ALL,
             ("throne_room",), 24, False, 1, _old_king_alive, _decree),
        Card("prophecy", "The Prophecy", "drama", frozenset({"act_1"}),
             ("temple", "forest"), 28, True, 0, _always, _prophecy),
        Card("taster_falls", "The Food Taster's Last Sip", "drama", ACTS_ALL,
             ("feast_hall",), 22, False, 3, _taster_alive, _taster_falls),
        # crowd events
        Card("grey_plague", "The Grey Plague", "crowd", ACTS_I_II,
             ("city_streets", "harbor"), 40, False, 2, _crowd_fits, _crowd, "killed"),
        Card("muddy_field_battle", "Battle of the Muddy Field", "crowd", ACTS_I_II,
             ("battlefield",), 40, False, 3, _battle_possible, _muddy_field_battle, "killed"),
        Card("crimson_feast", "The Crimson Feast", "crowd", ACTS_I_II,
             ("feast_hall",), 40, False, 3, _crowd_fits, _crimson_feast, "killed"),
        Card("wildfire", "Wildfire Below the City", "crowd", ACTS_I_II,
             ("city_streets", "harbor"), 40, False, 2, _crowd_fits, _crowd, "killed"),
        Card("march_of_pale_ones", "March of the Pale Ones", "crowd", ACTS_I_II,
             ("ice_wall",), 40, False, 2, _crowd_fits, _crowd, "killed"),
        Card("bridge_gives_way", "The Bridge Gives Way", "crowd", ACTS_I_II,
             ("bridge",), 40, False, 1, _crowd_fits, _crowd, "killed"),
        Card("grey_cloak_mutiny", "Mutiny of the Grey Cloaks", "crowd", ACTS_I_II,
             ("ice_wall",), 40, False, 2, _crowd_fits, _crowd, "forfeited"),
        Card("kingsmoot_exile", "The Kingsmoot Exile", "crowd", ACTS_I_II,
             ("throne_room",), 40, False, 2, _crowd_fits, _crowd, "exiled"),
        # structure
        Card("cold_open", "The Old King's Court", "structural", frozenset({"cold_open"}),
             ("throne_room",), 50, False, 0, _always, _cold_open),
        Card("red_priestess", "The Red Priestess", "structural", frozenset({"act_2"}),
             ("temple",), 30, True, 0, _always, _red_priestess),
        Card("final_duel", "The Last Duel", "structural", frozenset({"act_3"}),
             ("battlefield", "throne_room", "bridge", "ice_wall"), 40, True, 0, _always, _final_duel),
        Card("coronation", "The Coronation", "structural", frozenset({"coronation"}),
             ("throne_room",), 45, False, 0, _always, _coronation),
    ]
}

SINGLE_CARDS = [c for c in CARDS.values() if c.kind == "single"]
DRAMA_CARDS = [c for c in CARDS.values() if c.kind == "drama" and c.weight > 0]
CROWD_CARDS = [c for c in CARDS.values() if c.kind == "crowd"]
