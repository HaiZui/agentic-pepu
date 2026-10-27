"""What the model is allowed to know: names, archetypes, houses and story facts from the fate script."""

from typing import Any

from bottle_throne.fate.catalog import ARCHETYPE_LABELS
from bottle_throne.fate.state import TimelineState
from bottle_throne.models.fate import Beat, FateScript
from bottle_throne.story.catalog import reading_seconds

SECTION_NAMES = {
    "cold_open": "Cold open",
    "act_1": "Act I",
    "act_2": "Act II",
    "act_3": "Act III",
    "coronation": "Coronation",
}

# Earlier beats that leave a grudge: card -> (holder role, target role, description).
GRUDGES = {
    "knife_foiled": ("victim", "betrayer", "tried to stab them in the back"),
    "wound": ("wounded", "attacker", "wounded them"),
    "old_kings_pardon": ("pardoned", "old_king", "pardoned them, for now"),
    "debt_paid": ("debtor", "payer", "paid their debt to the Iron Vault"),
    "faceless_contract": ("client", "target", "secretly hired the Faceless against them"),
}


def cast_sheet(fate: FateScript) -> list[dict[str, Any]]:
    houses = {h.id: h.name for h in fate.houses}
    sheet = []
    for c in fate.characters:
        entry: dict[str, Any] = {"id": c.id, "name": c.name}
        if c.kind == "participant":
            entry["archetype"] = ARCHETYPE_LABELS.get(c.archetype or "", None)
            if c.house:
                entry["house"] = houses[c.house]
        elif c.kind == "npc":
            entry["role"] = c.name
        if c.is_old_king:
            entry["old_king"] = True
        sheet.append(entry)
    return sheet


def beat_facts(fate: FateScript, beat: Beat) -> dict[str, Any]:
    names = {c.id: c.name for c in fate.characters}
    facts: dict[str, Any] = {
        "index": beat.index,
        "section": SECTION_NAMES[beat.section],
        "event": beat.title,
        "setting": beat.setting.replace("_", " "),
        "roles": [{"role": r.role, "id": r.character, "name": names[r.character]} for r in beat.roles],
        "eliminated": [
            {"id": e.character, "name": names[e.character], "how": e.mode} for e in beat.eliminations
        ],
        "returns_from_death": [{"id": r, "name": names[r]} for r in beat.resurrections],
        "alliances_formed": [[names[a.a], names[a.b]] for a in beat.alliances_formed],
        "alliances_broken": [[names[a.a], names[a.b]] for a in beat.alliances_broken],
        "notes": beat.facts,
        "seconds": beat.budget_seconds,
    }
    if beat.prophecy_hints:
        facts["prophecy_hints"] = [h.text for h in beat.prophecy_hints]
    return facts


def outline(fate: FateScript) -> list[dict[str, Any]]:
    names = {c.id: c.name for c in fate.characters}
    return [
        {
            "index": b.index,
            "section": SECTION_NAMES[b.section],
            "event": b.title,
            "who": sorted({names[r.character] for r in b.roles}),
            "out": [f"{names[e.character]} ({e.mode})" for e in b.eliminations],
            "returns": [names[r] for r in b.resurrections],
        }
        for b in fate.beats
    ]


def persona_cards(fate: FateScript, beat: Beat) -> list[dict[str, Any]]:
    """Persona cards for everyone in the beat, built only from earlier beats of the fate script."""
    names = {c.id: c.name for c in fate.characters}
    sheet = {entry["id"]: entry for entry in cast_sheet(fate)}
    participants = [c.id for c in fate.characters if c.kind == "participant"]
    state = TimelineState.start(participants, [c.id for c in fate.characters if c.kind != "participant"])
    grudges: dict[str, list[str]] = {}
    for earlier in fate.beats[: beat.index]:
        roles = {r.role: r.character for r in earlier.roles}
        if earlier.card in GRUDGES:
            holder, target, text = GRUDGES[earlier.card]
            if holder in roles and target in roles:
                grudges.setdefault(roles[holder], []).append(f"{names[roles[target]]} {text}")
        state.apply(earlier)

    cards = []
    for cid in dict.fromkeys(r.character for r in beat.roles):
        card = dict(sheet[cid])
        card["status"] = "alive" if state.is_alive(cid) else "dead (speaks only as a ghost)"
        allies = [names[a] for a in state.allies_of(cid)]
        if allies:
            card["allies"] = allies
        if cid in grudges:
            card["history"] = grudges[cid][-3:]
        cards.append(card)
    return cards


def max_lines(beat: Beat) -> int:
    """Rough line budget so a scene fits its time: average line ~4.5 s at 1x."""
    return max(2, min(9, int(beat.budget_seconds / 4.5)))


def line_budget_note(beat: Beat) -> str:
    return (
        f"The scene must be readable in {beat.budget_seconds} seconds: at most {max_lines(beat)} lines plus captions, "
        f"each line under 100 characters (a line takes about {reading_seconds('x' * 60):.1f}s for 60 characters)."
    )
