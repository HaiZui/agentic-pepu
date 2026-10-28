"""The story plan inside the show bible: deterministic defaults and the repair rules for what the Director writes.

The Director's plan is repaired rather than rejected (design D4): one bad field must not cost the show its bible.
"""

from bottle_throne.models.fate import FateScript
from bottle_throne.models.story import ExitReason, Motivation, ShowBible, Storyline, StoryThread

MAX_THREADS = 4

WANTS = {
    "schemer": "wants the throne and plots every step toward it",
    "brute": "wants the throne and means to take it by force",
    "fool": "wants the throne, or at least the bottle",
    "zealot": "believes the throne is a sacred duty",
    "honorable": "wants to win the throne the honest way",
    "coward": "wants the throne without ever being in danger",
    "bard": "wants the throne and a song about winning it",
}


def participant_exits(fate: FateScript) -> list[tuple[str, int]]:
    """(participant id, beat index) for every participant elimination, in beat order."""
    participants = {c.id for c in fate.characters if c.kind == "participant"}
    return [(e.character, b.index) for b in fate.beats for e in b.eliminations if e.character in participants]


def default_exit_reason(fate: FateScript, story: Storyline, character: str, beat: int) -> ExitReason:
    stamp = next(a for a in story.beats[beat].announcements if a.kind == "out" and a.character == character)
    name = stamp.headline.removesuffix(" is OUT")
    return ExitReason(character=character, beat=beat, reason=f"{name} is out, {stamp.cause}.")


def default_motivation(fate: FateScript, character: str) -> Motivation:
    who = next(c for c in fate.characters if c.id == character)
    return Motivation(character=character, want=f"{who.name} {WANTS.get(who.archetype or '', 'wants the throne')}.")


def default_threads(story: Storyline) -> list[StoryThread]:
    """The winner's road and the prophecy first (they always exist), then the longest other seeds."""
    seeds = story.thread_seeds
    fixed = [t for t in seeds if t.title.endswith("'s road")] + [t for t in seeds if t.title == "The prophecy"]
    others = sorted((t for t in seeds if t not in fixed), key=lambda t: (-len(t.beats), t.beats[0]))
    return (fixed + others)[:MAX_THREADS]


def repair_plan(fate: FateScript, story: Storyline, bible: ShowBible) -> ShowBible:
    """Keeps every valid part of the Director's plan and fills the rest deterministically."""
    names = {c.id: c.name for c in fate.characters}
    n_beats = len(fate.beats)

    threads: list[StoryThread] = []
    for thread in bible.threads:
        beats = sorted({i for i in thread.beats if 0 <= i < n_beats})
        if len(beats) >= 2 and thread.title.strip() and thread.summary.strip():
            threads.append(thread.model_copy(update={"beats": beats}))
    threads = threads[:MAX_THREADS] or default_threads(story)[:1]

    given = {(r.character, r.beat): r for r in bible.exit_reasons}
    exit_reasons = []
    for character, beat in participant_exits(fate):
        reason = given.get((character, beat))
        if reason is None or names[character] not in reason.reason:
            reason = default_exit_reason(fate, story, character, beat)
        exit_reasons.append(reason)

    wants = {m.character: m for m in bible.motivations if m.want.strip()}
    motivations = [
        wants.get(c.id) or default_motivation(fate, c.id) for c in fate.characters if c.kind == "participant"
    ]
    return bible.model_copy(update={"threads": threads, "exit_reasons": exit_reasons, "motivations": motivations})
