from bottle_throne.fate.catalog import ARCHETYPE_LABELS
from bottle_throne.fate.rng import Stream
from bottle_throne.models.fate import Beat, Character, House, ProphecyHint

CROWD_CARDS = frozenset(
    {
        "grey_plague",
        "muddy_field_battle",
        "crimson_feast",
        "wildfire",
        "march_of_pale_ones",
        "bridge_gives_way",
        "grey_cloak_mutiny",
        "kingsmoot_exile",
    }
)


def _article(word: str) -> str:
    return "an" if word[0].lower() in "aeiou" else "a"


def winner_facts(
    winner: str, characters: list[Character], houses: list[House], beats: list[Beat]
) -> dict[str, str]:
    """True facts about the winner's path, as fact id -> prophecy text. Never names the winner."""
    by_id = {c.id: c for c in characters}
    sigils = {h.id: h.sigil for h in houses}
    me = by_id[winner]
    facts: dict[str, str] = {}

    for beat in beats:
        roles = [(r.role, r.character) for r in beat.roles]
        if winner in beat.resurrections:
            facts["resurrected"] = "One who returned from death"
        if beat.card in ("knife_in_the_back", "knife_foiled") and ("victim", winner) in roles:
            facts["betrayed"] = "One who was betrayed by a sworn ally"
        if beat.card in CROWD_CARDS and ("survivor", winner) in roles:
            event = beat.title[4:] if beat.title.startswith("The ") else beat.title
            facts[f"survived_crowd:{beat.card}"] = f"One who walked out of the {event}"
        if beat.card == "wound" and ("wounded", winner) in roles:
            facts["wounded"] = "One who bled and did not fall"
        if beat.card == "dragon_egg" and ("bearer", winner) in roles:
            facts["dragon_egg"] = "One who held the dragon's egg"
        if beat.card == "final_duel":
            rival = next(c for role, c in roles if role == "rival")
            archetype = by_id[rival].archetype
            if archetype:
                label = ARCHETYPE_LABELS[archetype]
                facts[f"final_rival:{archetype}"] = f"One who faces {_article(label)} {label} at the last"

    if me.house:
        facts[f"house:{me.house}"] = f"One who bears the sign of the {sigils[me.house]}"
    if me.is_old_king:
        facts["old_king_returns"] = "One whose brow has worn the crown before"
    if me.archetype:
        label = ARCHETYPE_LABELS[me.archetype]
        facts[f"archetype:{me.archetype}"] = f"One the realm calls {_article(label)} {label}"
    return facts


def choose_hints(facts: dict[str, str], stream: Stream) -> list[ProphecyHint]:
    """Pick 2-3 hints, preferring path facts over the plain archetype."""
    preferred = [f for f in facts if not f.startswith("archetype:")]
    fallback = [f for f in facts if f.startswith("archetype:")]
    count = 3 if len(preferred) >= 3 else 2
    picked = stream.sample(preferred, min(count, len(preferred)))
    picked += fallback[: max(0, 2 - len(picked))]
    return [ProphecyHint(id=fact, text=facts[fact]) for fact in picked]
