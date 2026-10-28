"""Fixed, LLM-free wording for every card: what happens (for prompts) and who is out or back (for stamps).

Each statement names every role holder with what they do, so a model cannot confuse who acts on whom.
Announcements are shared word for word by the stage, the comic and the fallback writer.
"""

import re
from dataclasses import dataclass

from bottle_throne.models.fate import Beat, FateScript

# Missing optional roles read naturally instead of breaking a template.
MISSING_ROLE = {
    "announcer": "the court",
    "seer": "a seer",
    "client": "a hidden hand",
    "old_king": "the old crown",
}


@dataclass(frozen=True)
class Wording:
    statement: str
    out: str | None = None  # cause after "<name> is OUT, "; per eliminated character
    crowd: str | None = None  # crowd summary event name, e.g. "the Grey Plague"


WORDING: dict[str, Wording] = {
    # single eliminations
    "knife_in_the_back": Wording(
        "{betrayer} betrays their ally {victim} with a knife in the back. {victim} is killed and the alliance is over.",
        out="stabbed in the back by their ally {betrayer}",
    ),
    "trial_by_combat": Wording(
        "{challenger} meets {fallen} in a trial by combat and wins. {fallen} is killed.",
        out="slain by {challenger} in Trial by Combat",
    ),
    "poisoned_goblet": Wording(
        "{poisoner} poisons a goblet and serves it to {victim}. {victim} drinks it and dies.",
        out="poisoned by {poisoner}",
    ),
    "poisoned_goblet:poisoner_drank": Wording(
        "{poisoner} poisons a goblet meant for {intended}, but the cups get swapped and {poisoner} drinks it. "
        "{poisoner} dies; {intended} survives, unharmed.",
        out="poisoned by the goblet meant for {intended}",
    ),
    "grey_cloak": Wording(
        "{deserter} renounces the crown, takes the Grey Cloak and leaves the contest for the Wall.",
        out="forfeited by taking the Grey Cloak",
    ),
    "faceless_strike": Wording(
        "A Faceless assassin hired by {client} carries out the contract and kills {target}.",
        out="slain by a Faceless assassin hired by {client}",
    ),
    "faceless_strike:no_client": Wording(
        "A Faceless assassin carries out an old contract and kills {target}. Whoever paid for it is long gone.",
        out="slain by a Faceless assassin",
    ),
    "iron_vault_debt": Wording(
        "The Iron Vault calls in {debtor}'s debt. {debtor} cannot pay and is exiled from the realm.",
        out="exiled by the Iron Vault for an unpaid debt",
    ),
    "old_kings_gambit": Wording(
        "{old_king} sees {banished} as a threat to the throne and banishes them from the realm.",
        out="exiled by {old_king}",
    ),
    # drama
    "sworn_alliance": Wording("{ally} and {ally2} swear an alliance to stand together."),
    "knife_foiled": Wording(
        "{betrayer} tries to stab their ally {victim} in the back, but fails. {victim} survives, "
        "and the alliance between them is broken."
    ),
    "faceless_contract": Wording(
        "{client} secretly pays the Faceless assassins to kill {target}. The contract is not carried out yet."
    ),
    "dragon_egg": Wording("{bearer} finds a dragon egg, which protects them from harm for a while."),
    "old_kings_pardon": Wording("{old_king} pardons {pardoned} for an offence against the crown, for now."),
    "debt_paid": Wording("{payer} pays {debtor}'s debt to the Iron Vault and saves them from exile."),
    "near_miss": Wording("{survivor} narrowly escapes a deadly accident and stays in the contest."),
    "wound": Wording("{attacker} wounds {wounded} in a fight. {wounded} survives, but is hurt."),
    "decree": Wording(
        "{old_king} decrees that the Friday bottle and the throne go to the last contestant standing. "
        "{announcer} proclaims it."
    ),
    "prophecy": Wording("{seer} speaks a prophecy about who will win the throne, and {listener} hears it."),
    "taster_falls": Wording(
        "Someone tries to poison {intended}. {taster} tastes the food first and dies in their place. "
        "{intended} survives."
    ),
    # crowd events
    "grey_plague": Wording(
        "The Grey Plague sweeps the city. {fallen} die of it.", out="taken by the Grey Plague", crowd="the Grey Plague"
    ),
    "muddy_field_battle": Wording(
        "{commander} and {commander2} lead their houses into battle on a muddy field. {fallen} are killed.",
        out="killed in the Battle of the Muddy Field",
        crowd="the Battle of the Muddy Field",
    ),
    "crimson_feast": Wording(
        "{host} hosts a feast that turns into a massacre. {fallen} are killed.",
        out="killed at the Crimson Feast hosted by {host}",
        crowd="the Crimson Feast",
    ),
    "wildfire": Wording(
        "Wildfire explodes beneath the city. {fallen} die in the blaze.",
        out="lost in the wildfire",
        crowd="the wildfire",
    ),
    "march_of_pale_ones": Wording(
        "The Pale Ones march from beyond the ice wall. {fallen} are killed.",
        out="taken by the Pale Ones",
        crowd="the March of the Pale Ones",
    ),
    "bridge_gives_way": Wording(
        "A bridge gives way. {fallen} fall to their doom.", out="lost when the bridge gave way", crowd="the bridge collapse"
    ),
    "grey_cloak_mutiny": Wording(
        "{fallen} take the Grey Cloak together and leave the contest for the Wall.",
        out="forfeited by joining the Grey Cloaks",
        crowd="the Mutiny of the Grey Cloaks",
    ),
    "kingsmoot_exile": Wording(
        "The kingsmoot votes to exile {fallen} from the realm.", out="exiled by the kingsmoot", crowd="the Kingsmoot"
    ),
    # structure
    "cold_open": Wording("The court of {old_king} assembles, and {announcer} opens the show."),
    "cold_open:alone": Wording("The court of {old_king} assembles to open the show."),
    "red_priestess": Wording(
        "The Red Priestess brings {risen} back from the dead. {risen} is alive again and back in the contest."
    ),
    "final_duel": Wording(
        "{champion} and {rival}, the last two contestants, fight the final duel. {rival} is killed.",
        out="defeated by {champion} in the Last Duel",
    ),
    "final_duel:yielded": Wording(
        "{champion} and {rival}, the last two contestants, face each other. {rival} yields and leaves the contest.",
        out="yielded to {champion} in the Last Duel",
    ),
    "coronation": Wording("{crowned} is crowned the new monarch of the Bottle Throne by {old_king}."),
    "coronation:alone": Wording("{crowned} is crowned the new monarch of the Bottle Throne."),
}

RETURN_CAUSE = {"red_priestess": "raised from the dead by the Red Priestess and back in the contest"}
RETURN_DEFAULT = "back from the dead and back in the contest"


def join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} and {names[-1]}"


def role_map(beat: Beat) -> dict[str, str]:
    """Role key -> character id. Repeated roles get suffixes: ally, ally2, commander, commander2."""
    mapping: dict[str, str] = {}
    for role in beat.roles:
        if beat.kind == "crowd" and role.role in ("fallen", "survivor"):
            continue
        key, n = role.role, 2
        while key in mapping:
            key = f"{role.role}{n}"
            n += 1
        mapping[key] = role.character
    return mapping


def wording_key(beat: Beat) -> str:
    roles = {r.role for r in beat.roles}
    if beat.card == "faceless_strike" and "client" not in roles:
        return "faceless_strike:no_client"
    if beat.card == "coronation" and "old_king" not in roles:
        return "coronation:alone"
    if beat.card == "cold_open" and "announcer" not in roles:
        return "cold_open:alone"
    for fact in ("poisoner_drank", "yielded"):
        if fact in beat.facts and f"{beat.card}:{fact}" in WORDING:
            return f"{beat.card}:{fact}"
    return beat.card


def _sentence_case(text: str) -> str:
    """Capitalises a sentence-initial 'the' or 'a' (NPC names such as 'the Herald') without touching participant names."""
    return re.sub(r"(^|[.!?] )(the|a) ", lambda m: f"{m.group(1)}{m.group(2).capitalize()} ", text)


def _values(fate: FateScript, beat: Beat) -> dict[str, str]:
    names = {c.id: c.name for c in fate.characters}
    values = {key: names[cid] for key, cid in role_map(beat).items()}
    for key, text in MISSING_ROLE.items():
        values.setdefault(key, text)
    if beat.kind == "crowd":
        values["fallen"] = join_names([names[r.character] for r in beat.roles if r.role == "fallen"])
    return values


def statement(fate: FateScript, beat: Beat) -> str:
    names = {c.id: c.name for c in fate.characters}
    text = WORDING[wording_key(beat)].statement.format(**_values(fate, beat))
    survivors = [names[r.character] for r in beat.roles if r.role == "survivor"] if beat.kind == "crowd" else []
    if survivors:
        text += f" {join_names(survivors)} {'escapes' if len(survivors) == 1 else 'escape'}."
    if "first_blood" in beat.facts:
        text += " This is the first blood of the contest."
    return _sentence_case(text)


def out_cause(fate: FateScript, beat: Beat) -> str:
    wording = WORDING[wording_key(beat)]
    if wording.out is None:
        mode_words = {"killed": "killed", "exiled": "exiled", "forfeited": "forfeited"}
        modes = {e.mode for e in beat.eliminations}
        return f"{mode_words.get(next(iter(modes), 'killed'), 'gone')} in {beat.title}"
    return wording.out.format(**_values(fate, beat))


def crowd_event(beat: Beat) -> str:
    wording = WORDING[wording_key(beat)]
    return wording.crowd or beat.title


def return_cause(beat: Beat) -> str:
    return RETURN_CAUSE.get(beat.card, RETURN_DEFAULT)
