"""The storyline: deterministic story facts derived from the fate script alone.

Who is in the contest before and after every beat, the stamps announcing exits and returns, which
contestants appear as bystanders so nobody is first seen in their own exit, and thread seeds that link
setups to payoffs. Nothing here calls the LLM, so the stage, the comic and the prompts can rely on it.
"""

from bottle_throne.fate.state import TimelineState
from bottle_throne.models.fate import Beat, FateScript
from bottle_throne.models.story import Announcement, BeatStory, Storyline, StoryThread
from bottle_throne.story import causes

MAX_BYSTANDERS = 2
NO_BYSTANDER_CARDS = frozenset({"cold_open", "coronation"})
ACTS = ("act_1", "act_2", "act_3")
# The role that causes the exits of a card: their victims may later haunt them as the show's one ghost.
RESPONSIBLE = {
    "knife_in_the_back": "betrayer",
    "trial_by_combat": "challenger",
    "poisoned_goblet": "poisoner",
    "faceless_strike": "client",
    "old_kings_gambit": "old_king",
    "crimson_feast": "host",
    "muddy_field_battle": "commander",
    "final_duel": "champion",
}


def survivor_snapshots(fate: FateScript) -> list[tuple[list[str], list[str]]]:
    """(participants in the contest before, after) for every beat. NPCs and the non-playing Old King never count."""
    participants = [c.id for c in fate.characters if c.kind == "participant"]
    state = TimelineState.start(participants, [])
    snapshots = []
    for beat in fate.beats:
        before = state.alive_participants()
        state.apply(beat)
        snapshots.append((before, state.alive_participants()))
    return snapshots


def announcements(fate: FateScript, beat: Beat) -> list[Announcement]:
    cast = {c.id: c for c in fate.characters}
    out = [e.character for e in beat.eliminations if cast[e.character].kind == "participant"]
    result: list[Announcement] = []
    if out:
        cause = causes.out_cause(fate, beat)
        result += [Announcement(kind="out", character=cid, headline=f"{cast[cid].name} is OUT", cause=cause) for cid in out]
        if len(out) >= 2:
            event = causes.crowd_event(beat)
            result.append(Announcement(kind="summary", character=None, headline=f"{len(out)} are OUT", cause=f"in {event}"))
    for cid in beat.resurrections:
        result.append(
            Announcement(kind="return", character=cid, headline=f"{cast[cid].name} RETURNS", cause=causes.return_cause(beat))
        )
    return result


# --- bystander plan ------------------------------------------------------------------------------------------


def _roles(beat: Beat) -> set[str]:
    return {r.character for r in beat.roles}


def plan_bystanders(fate: FateScript, before: list[list[str]]) -> dict[int, list[str]]:
    """Introductions before exits, then the winner once in every act where they have no role (design D3)."""
    beats = fate.beats
    plan: dict[int, list[str]] = {b.index: [] for b in beats}
    participants = {c.id for c in fate.characters if c.kind == "participant"}
    roles = [_roles(b) for b in beats]

    def open_slot(j: int, who: str) -> bool:
        beat = beats[j]
        return (
            beat.card not in NO_BYSTANDER_CARDS
            and who in before[j]
            and who not in roles[j]
            and who not in beat.resurrections
            and who not in plan[j]
            and len(plan[j]) < MAX_BYSTANDERS
        )

    introduced: set[str] = set()
    for k, beat in enumerate(beats):
        if beat.kind == "crowd":
            continue
        for e in beat.eliminations:
            p = e.character
            if p not in participants or p in introduced:
                continue
            introduced.add(p)
            if any(p in roles[j] for j in range(1, k)):
                continue
            slots = [j for j in range(1, k) if open_slot(j, p)]
            if not slots:
                continue
            others = roles[k] - {p}
            best = min(slots, key=lambda j: (0 if roles[j] & others else 1, abs(j - (k - 2)), j))
            plan[best].append(p)

    winner = fate.winner
    for act in ACTS:
        in_act = [b.index for b in beats if b.section == act]
        if not in_act or any(winner in roles[j] or winner in plan[j] for j in in_act):
            continue
        slots = [j for j in in_act if open_slot(j, winner) and beats[j].card != "prophecy"]
        if slots:
            middle = (in_act[0] + in_act[-1]) / 2
            plan[min(slots, key=lambda j: (abs(j - middle), j))].append(winner)
    return plan


# --- the planned ghost -----------------------------------------------------------------------------------


def plan_ghost(fate: FateScript, before: list[list[str]]) -> tuple[int, str] | None:
    """(beat, ghost): a contestant out of the contest returns as a ghost to watch the one who caused their exit fall."""
    participants = {c.id for c in fate.characters if c.kind == "participant"}
    exits: dict[str, list[int]] = {}
    for b in fate.beats:
        for e in b.eliminations:
            exits.setdefault(e.character, []).append(b.index)
    pairs: list[tuple[int, int, str]] = []
    for b in fate.beats:
        role = RESPONSIBLE.get(b.card)
        if role is None or "poisoner_drank" in b.facts:
            continue
        culprits = [r.character for r in b.roles if r.role == role]
        victims = [e.character for e in b.eliminations if e.character in participants and e.character not in culprits]
        for culprit in culprits:
            for j in exits.get(culprit, []):
                later = fate.beats[j]
                if j <= b.index or later.card == "coronation":
                    continue
                for victim in victims:
                    if victim not in before[j] and victim not in later.resurrections and victim not in {r.character for r in later.roles}:
                        pairs.append((j, b.index, victim))
    if not pairs:
        return None
    j, _, victim = min(pairs)
    return j, victim


# --- thread seeds --------------------------------------------------------------------------------------------


def thread_seeds(fate: FateScript) -> list[StoryThread]:
    """Setup -> payoff links found in the fate. Always includes the prophecy and the winner's road."""
    names = {c.id: c.name for c in fate.characters}
    beats = fate.beats
    roles = [_roles(b) for b in beats]
    exit_beat: dict[str, list[int]] = {}
    for b in beats:
        for e in b.eliminations:
            exit_beat.setdefault(e.character, []).append(b.index)

    def next_with(after: int, *who: str) -> int | None:
        return next((j for j in range(after + 1, len(beats)) if roles[j] & set(who)), None)

    seeds: list[StoryThread] = []

    def add(title: str, indexes: list[int | None], summary: str) -> None:
        chain = sorted({i for i in indexes if i is not None})
        if len(chain) >= 2:
            seeds.append(StoryThread(title=title, beats=chain, summary=summary))

    for b in beats:
        r = causes.role_map(b)
        if b.card == "faceless_contract":
            target = r["target"]
            later = [k for k in exit_beat.get(target, []) if k > b.index]
            add(
                f"The Faceless contract on {names[target]}",
                [b.index, later[0] if later else next_with(b.index, target)],
                f"{names[r['client']]} pays the Faceless to kill {names[target]}; the contract hangs over them.",
            )
        elif b.card == "knife_foiled":
            add(
                f"{names[r['betrayer']]} turns on {names[r['victim']]}",
                [b.index, next_with(b.index, r["betrayer"], r["victim"])],
                f"After the failed knife, {names[r['victim']]} knows {names[r['betrayer']]} cannot be trusted.",
            )
        elif b.card == "sworn_alliance":
            together = next((j for j in range(b.index + 1, len(beats)) if {r["ally"], r["ally2"]} <= roles[j]), None)
            add(
                f"The alliance of {names[r['ally']]} and {names[r['ally2']]}",
                [b.index, together],
                f"{names[r['ally']]} and {names[r['ally2']]} swear to stand together, and must face what that costs.",
            )
        elif b.card == "wound":
            wounded = r["wounded"]
            add(
                f"{names[wounded]}'s wound",
                [b.index, next_with(b.index, wounded)],
                f"{names[r['attacker']]} wounded {names[wounded]}, and the wound is not forgotten.",
            )
        elif b.card == "taster_falls":
            intended = r["intended"]
            add(
                f"Someone wants {names[intended]} dead",
                [b.index, next_with(b.index, intended)],
                f"The poison was meant for {names[intended]}; the danger has not passed.",
            )
        elif b.card in ("near_miss", "old_kings_pardon", "dragon_egg"):
            who = r.get("survivor") or r.get("pardoned") or r.get("bearer")
            assert who is not None
            add(
                f"{names[who]} is spared, for now",
                [b.index, next_with(b.index, who)],
                f"{names[who]} escapes once, and the story comes back for them.",
            )
        elif b.card == "red_priestess":
            risen = r["risen"]
            first = [k for k in exit_beat.get(risen, []) if k < b.index]
            later = [k for k in exit_beat.get(risen, []) if k > b.index]
            add(
                f"{names[risen]} cheats death",
                [first[-1] if first else None, b.index, later[0] if later else next_with(b.index, risen)],
                f"{names[risen]} falls, is raised by the Red Priestess, and must live with the price.",
            )

    prophecy = next((b.index for b in beats if b.card == "prophecy"), None)
    coronation = beats[-1].index
    add("The prophecy", [prophecy, coronation], "The seer's riddle is spoken early and fulfilled at the coronation.")
    road = [b.index for b in beats if fate.winner in roles[b.index] and b.card != "prophecy"]
    add(f"{names[fate.winner]}'s road", road, f"{names[fate.winner]} keeps finding a way through.")
    return seeds


def storyline(fate: FateScript) -> Storyline:
    snapshots = survivor_snapshots(fate)
    plan = plan_bystanders(fate, [before for before, _ in snapshots])
    ghost = plan_ghost(fate, [before for before, _ in snapshots])
    return Storyline(
        beats=[
            BeatStory(
                index=beat.index,
                statement=causes.statement(fate, beat),
                announcements=announcements(fate, beat),
                survivors_before=snapshots[beat.index][0],
                survivors_after=snapshots[beat.index][1],
                bystanders=plan[beat.index],
                ghost=ghost[1] if ghost and ghost[0] == beat.index else None,
            )
            for beat in fate.beats
        ],
        thread_seeds=thread_seeds(fate),
    )
