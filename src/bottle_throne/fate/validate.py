"""Independent checks of every fate-engine invariant. Returns a list of 'code: message' errors."""

from collections import Counter

from bottle_throne.fate.cards import CARDS
from bottle_throne.fate.catalog import SECTIONS, house_count
from bottle_throne.fate.hints import winner_facts
from bottle_throne.fate.state import TimelineState
from bottle_throne.models.fate import FateScript

MIN_BEATS, MAX_BEATS = 16, 24
MIN_SECONDS, MAX_SECONDS = 540, 660


def validate(script: FateScript) -> list[str]:
    errors: list[str] = []

    def err(code: str, message: str) -> None:
        errors.append(f"{code}: {message}")

    chars = {c.id: c for c in script.characters}
    participants = [c.id for c in script.characters if c.kind == "participant"]
    npcs = [c.id for c in script.characters if c.kind == "npc"]
    n = script.roster_size
    beats = script.beats

    if len(participants) != n:
        err("roster", f"{len(participants)} participants for roster size {n}")
    if script.winner not in participants:
        err("winner", "winner is not a participant")
    old_king = chars.get(script.old_king)
    if old_king is None or not old_king.is_old_king:
        err("old_king", "old_king does not reference the Old King character")

    # Structure and pacing.
    if [b.index for b in beats] != list(range(len(beats))):
        err("index", "beat indices are not sequential")
    section_ranks = [SECTIONS.index(b.section) for b in beats]
    if section_ranks != sorted(section_ranks):
        err("section_order", "sections are out of order")
    for section in SECTIONS:
        if not any(b.section == section for b in beats):
            err("section_empty", f"section {section} has no beats")
    if not MIN_BEATS <= len(beats) <= MAX_BEATS:
        err("beat_count", f"{len(beats)} beats")
    total = sum(b.budget_seconds for b in beats)
    if total != script.total_budget_seconds:
        err("budget_total", "total_budget_seconds does not match the beats")
    if not MIN_SECONDS <= total <= MAX_SECONDS:
        err("budget_range", f"total budget {total}s")
    if any(b.budget_seconds <= 0 for b in beats):
        err("budget_beat", "a beat has no time budget")

    # Replay the timeline.
    others = npcs + ([script.old_king] if script.old_king not in participants else [])
    state = TimelineState.start(participants, others)
    resurrections: list[tuple[int, str]] = []
    act3_start_alive: int | None = None
    old_king_beats: list[int] = []
    npc_active = False

    for beat in beats:
        card = CARDS.get(beat.card)
        if card is None:
            err("card_unknown", f"beat {beat.index}: {beat.card}")
            continue
        if beat.kind != card.kind or beat.dramatic != card.dramatic:
            err("card_meta", f"beat {beat.index}: kind/dramatic differ from card {card.id}")
        if beat.section not in card.sections:
            err("card_section", f"beat {beat.index}: {card.id} not allowed in {beat.section}")
        if beat.setting not in card.settings:
            err("card_setting", f"beat {beat.index}: {card.id} cannot take place in {beat.setting}")
        if beat.section == "act_3" and act3_start_alive is None:
            act3_start_alive = len(state.alive_participants())

        roles: dict[str, list[str]] = {}
        for role in beat.roles:
            roles.setdefault(role.role, []).append(role.character)
            if role.character not in chars:
                err("role_unknown", f"beat {beat.index}: unknown character {role.character}")
                continue
            if role.role == "risen":
                if state.is_alive(role.character):
                    err("risen_alive", f"beat {beat.index}: {role.character} is not dead")
            elif not state.is_alive(role.character):
                err("dead_actor", f"beat {beat.index}: {role.character} acts after elimination")
            if role.character == script.old_king:
                old_king_beats.append(beat.index)
            if role.character in npcs:
                npc_active = True

        first = lambda name: (roles.get(name) or [None])[0]  # noqa: E731
        if beat.card in ("knife_in_the_back", "knife_foiled"):
            if not state.allied(first("betrayer") or "", first("victim") or ""):
                err("precondition", f"beat {beat.index}: betrayal without a standing alliance")
        if beat.card == "faceless_strike" and first("target") not in state.contracts:
            err("precondition", f"beat {beat.index}: strike without a contract")
        if beat.card == "muddy_field_battle":
            commander_houses = {chars[c].house for c in roles.get("commander", []) if c in chars}
            if len(commander_houses) != 2 or None in commander_houses:
                err("precondition", f"beat {beat.index}: battle needs commanders of two houses")
        if beat.card == "final_duel" and first("champion") != script.winner:
            err("final_duel", "the final duel champion is not the winner")
        if beat.card == "coronation" and first("crowned") != script.winner:
            err("coronation", "the crowned character is not the winner")

        participant_victims = [e for e in beat.eliminations if e.character in participants]
        for elimination in beat.eliminations:
            if not state.is_alive(elimination.character):
                err("double_elimination", f"beat {beat.index}: {elimination.character} is already out")
            if state.is_immune(elimination.character, beat.index):
                err("immunity", f"beat {beat.index}: {elimination.character} holds the dragon egg's protection")
        if card.kind == "crowd":
            if len(participant_victims) < 2:
                err("crowd_size", f"beat {beat.index}: crowd event with fewer than two eliminations")
            if n <= 6 and len(participant_victims) > 2:
                err("crowd_small_roster", f"beat {beat.index}: crowd of {len(participant_victims)} for {n} people")
        elif card.kind == "single" and len(participant_victims) != 1:
            err("single_size", f"beat {beat.index}: single elimination card removed {len(participant_victims)}")
        elif card.kind == "drama" and participant_victims:
            err("drama_elimination", f"beat {beat.index}: drama card eliminated a participant")
        if beat.section == "act_3" and card.kind == "crowd":
            err("act3_crowd", f"beat {beat.index}: crowd event in Act III")

        for risen in beat.resurrections:
            resurrections.append((beat.index, risen))
            if beat.section != "act_2":
                err("resurrection_section", f"beat {beat.index}: resurrection outside Act II")

        state.apply(beat)

    # Outcome.
    if state.alive_participants() != [script.winner]:
        err("survivors", f"alive at the end: {state.alive_participants()}")
    if act3_start_alive is not None and act3_start_alive not in (2, 3):
        err("act3_contenders", f"Act III starts with {act3_start_alive} participants")
    act3 = [b for b in beats if b.section == "act_3"]
    if not act3 or act3[-1].card != "final_duel":
        err("final_duel", "Act III does not end with the final duel")
    if n >= 6:
        modes = Counter(e.mode for b in beats for e in b.eliminations if e.character in participants)
        if modes["forfeited"] + modes["exiled"] == 0:
            err("nonlethal", "no forfeited or exiled participant")
    if len(resurrections) > 1:
        err("resurrection_count", f"{len(resurrections)} resurrections")
    if resurrections and n < 6:
        err("resurrection_roster", "resurrection with fewer than six participants")

    # Old King, NPCs, houses.
    cold_open = [b.index for b in beats if b.section == "cold_open"]
    if not any(i in cold_open for i in old_king_beats):
        err("old_king_cold_open", "the Old King does not appear in the cold open")
    if not any(i not in cold_open for i in old_king_beats):
        err("old_king_later", "the Old King does not appear after the cold open")
    if n <= 14:
        if len(npcs) < 2:
            err("npc_count", f"{len(npcs)} NPC extras for {n} participants")
        if not npc_active:
            err("npc_active", "no NPC extra takes a role")

    expected_houses = house_count(n)
    if len(script.houses) != expected_houses:
        err("house_count", f"{len(script.houses)} houses, expected {expected_houses}")
    if script.houses:
        sizes = [len(h.members) for h in script.houses]
        if max(sizes) - min(sizes) > 1:
            err("house_balance", f"house sizes {sizes}")
        members = sorted(m for h in script.houses for m in h.members)
        if members != sorted(participants):
            err("house_members", "houses do not partition the participants")
        for house in script.houses:
            if any(chars[m].house != house.id for m in house.members if m in chars):
                err("house_members", f"member house mismatch in {house.id}")

    # Prophecy.
    prophecies = [b for b in beats if b.card == "prophecy"]
    if len(prophecies) != 1 or prophecies[0].section != "act_1":
        err("prophecy", "there must be exactly one prophecy, in Act I")
    else:
        hints = prophecies[0].prophecy_hints
        if not 2 <= len(hints) <= 3:
            err("prophecy_hints", f"{len(hints)} hints")
        facts = winner_facts(script.winner, script.characters, script.houses, beats)
        for hint in hints:
            if hint.id not in facts:
                err("prophecy_false", f"hint {hint.id} is not true of the winner")
        winner_name = chars[script.winner].name if script.winner in chars else ""
        if any(winner_name and winner_name in hint.text for hint in hints):
            err("prophecy_names_winner", "a hint names the winner")

    return errors
