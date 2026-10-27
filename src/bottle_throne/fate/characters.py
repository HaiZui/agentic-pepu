from dataclasses import dataclass

from bottle_throne.fate.catalog import ARCHETYPES, HOUSE_CATALOG, NPC_ROLES, house_count, npc_count
from bottle_throne.fate.rng import Stream
from bottle_throne.models.fate import Character, House
from bottle_throne.models.show import MAD_KING_NAME, name_key


def participant_id(index: int) -> str:
    return f"p{index + 1:02d}"


@dataclass
class Cast:
    characters: list[Character]
    houses: list[House]
    participant_ids: list[str]  # canonical order
    npc_roles: dict[str, str]  # npc id -> role
    house_of: dict[str, str]  # participant id -> house id
    old_king_id: str
    old_king_is_participant: bool


def resolve_old_king_name(roster: list[str], old_king: str | None) -> tuple[str | None, int | None]:
    """Returns (seal value, canonical index if the Old King competes). None means the Mad King."""
    if old_king is None:
        return None, None
    for index, name in enumerate(roster):
        if name_key(name) == name_key(old_king):
            return name, index
    return old_king, None


def assign_houses(seed: str, participant_ids: list[str]) -> tuple[list[House], dict[str, str]]:
    count = house_count(len(participant_ids))
    if count == 0:
        return [], {}
    stream = Stream(seed, "houses")
    chosen = stream.sample(list(HOUSE_CATALOG), count)
    order = stream.shuffle(participant_ids)
    members: dict[str, list[str]] = {house_id: [] for house_id, _ in chosen}
    house_of: dict[str, str] = {}
    for position, pid in enumerate(order):
        house_id = chosen[position % count][0]
        members[house_id].append(pid)
        house_of[pid] = house_id
    houses = [
        House(id=house_id, name=f"House {sigil}", sigil=sigil, members=sorted(members[house_id]))
        for house_id, sigil in chosen
    ]
    return houses, house_of


def assign_archetypes(seed: str, count: int) -> list[str]:
    stream = Stream(seed, "archetypes")
    return [stream.choice(ARCHETYPES) for _ in range(count)]


def assign_npcs(seed: str, roster_size: int) -> dict[str, str]:
    count = npc_count(roster_size)
    if count == 0:
        return {}
    roles = Stream(seed, "npcs").sample(list(NPC_ROLES), count)
    return {f"npc_{role}": role for role in sorted(roles, key=list(NPC_ROLES).index)}


def build_cast(seed: str, roster: list[str], old_king: str | None) -> Cast:
    """`roster` must already be canonical. `old_king` None means the Mad King."""
    participant_ids = [participant_id(i) for i in range(len(roster))]
    houses, house_of = assign_houses(seed, participant_ids)
    archetypes = assign_archetypes(seed, len(roster))
    npc_roles = assign_npcs(seed, len(roster))
    old_king_name, old_king_index = resolve_old_king_name(roster, old_king)

    characters = [
        Character(
            id=pid,
            name=roster[i],
            kind="participant",
            house=house_of.get(pid),
            archetype=archetypes[i],  # type: ignore[arg-type]
            is_old_king=i == old_king_index,
        )
        for i, pid in enumerate(participant_ids)
    ]
    if old_king_index is None:
        old_king_id = "old_king"
        characters.append(
            Character(id=old_king_id, name=old_king_name or MAD_KING_NAME, kind="old_king", is_old_king=True)
        )
    else:
        old_king_id = participant_ids[old_king_index]
    characters += [
        Character(id=npc_id, name=NPC_ROLES[role], kind="npc", npc_role=role) for npc_id, role in npc_roles.items()
    ]
    return Cast(
        characters=characters,
        houses=houses,
        participant_ids=participant_ids,
        npc_roles=npc_roles,
        house_of=house_of,
        old_king_id=old_king_id,
        old_king_is_participant=old_king_index is not None,
    )
