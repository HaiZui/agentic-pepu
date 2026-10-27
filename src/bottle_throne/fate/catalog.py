from typing import Literal

Section = Literal["cold_open", "act_1", "act_2", "act_3", "coronation"]
SECTIONS: tuple[Section, ...] = ("cold_open", "act_1", "act_2", "act_3", "coronation")

SettingId = Literal[
    "throne_room",
    "feast_hall",
    "battlefield",
    "ice_wall",
    "forest",
    "dungeon",
    "harbor",
    "city_streets",
    "temple",
    "bridge",
]
SETTINGS: tuple[SettingId, ...] = (
    "throne_room",
    "feast_hall",
    "battlefield",
    "ice_wall",
    "forest",
    "dungeon",
    "harbor",
    "city_streets",
    "temple",
    "bridge",
)

Archetype = Literal["schemer", "brute", "fool", "zealot", "honorable", "coward", "bard"]
ARCHETYPES: tuple[Archetype, ...] = ("schemer", "brute", "fool", "zealot", "honorable", "coward", "bard")
ARCHETYPE_LABELS: dict[str, str] = {
    "schemer": "Schemer",
    "brute": "Brute",
    "fool": "Fool",
    "zealot": "Zealot",
    "honorable": "Honorable One",
    "coward": "Coward",
    "bard": "Bard",
}

# (id, sigil); display name is "House <Sigil>".
HOUSE_CATALOG: tuple[tuple[str, str], ...] = (
    ("wolf", "Wolf"),
    ("eel", "Eel"),
    ("goat", "Goat"),
    ("raven", "Raven"),
    ("boar", "Boar"),
    ("stag", "Stag"),
    ("owl", "Owl"),
    ("crab", "Crab"),
)

NPC_ROLES: dict[str, str] = {
    "adviser": "the Royal Adviser",
    "guard": "the Guard Captain",
    "food_taster": "the Food Taster",
    "herald": "the Herald",
    "jester": "the Jester",
}

EliminationMode = Literal["killed", "forfeited", "exiled"]
CardKind = Literal["single", "crowd", "drama", "structural"]


def house_count(roster_size: int) -> int:
    if roster_size <= 5:
        return 0
    if roster_size <= 8:
        return 2
    if roster_size <= 14:
        return 3
    if roster_size <= 24:
        return 4
    return 5


def npc_count(roster_size: int) -> int:
    if roster_size <= 8:
        return 3
    if roster_size <= 14:
        return 2
    return 0
