"""Mechanical checks that a scene stays true to its beat and fits the stage."""

import re

from bottle_throne.fate.state import TimelineState
from bottle_throne.models.fate import Beat, FateScript
from bottle_throne.models.story import BeatStory, SceneDraft, SceneScript
from bottle_throne.story.catalog import (
    ACTIONS,
    BUDGET_TOLERANCE,
    EMOTIONS,
    FRAMINGS,
    MAX_LINE_CHARS,
    MUSIC_MOODS,
    NARRATOR,
    SFX_CUES,
    reading_seconds,
)
from bottle_throne.story.causes import dragon_resolution

MIN_PANELS, MAX_PANELS = 3, 6
MAX_ONOMATOPOEIA_CHARS = 14
MAX_BYSTANDERS = 2
LEAVING_ACTIONS = frozenset({"fall", "exit", "enter"})
ELIMINATION_ACTION = {"killed": "fall", "forfeited": "exit", "exiled": "exit"}
DEATH_WORDS = re.compile(
    r"\b(dies|died|is dead|lies dead|falls dead|was slain|was killed|has been killed|perishes|perished|"
    r"breathes (his|her|their) last)\b",
    re.IGNORECASE,
)
PROPHECY_WORDS = re.compile(r"\b(prophecy|prophesied|foretold|the seer)\b", re.IGNORECASE)


def alive_before_each_beat(fate: FateScript) -> list[frozenset[str]]:
    """Alive character ids at the start of every beat (participants, NPCs and the Old King)."""
    participants = [c.id for c in fate.characters if c.kind == "participant"]
    others = [c.id for c in fate.characters if c.kind != "participant"]
    state = TimelineState.start(participants, others)
    snapshots = []
    for beat in fate.beats:
        snapshots.append(frozenset(state.alive))
        state.apply(beat)
    return snapshots


def scene_reading_seconds(scene: SceneDraft) -> float:
    return sum(reading_seconds(line.text) for line in scene.lines) + sum(
        reading_seconds(caption.text) for caption in scene.captions
    )


def repair_scene(scene: SceneScript) -> SceneScript:
    """Clamp references that point exactly one past the last line or caption (a common off-by-one)."""
    last_line, n_captions = len(scene.lines) - 1, len(scene.captions)
    if last_line < 0:
        return scene
    fixed = scene.model_copy(deep=True)
    for item in [*fixed.cues, *fixed.onomatopoeia, *fixed.stage_directions]:
        if item.line == last_line + 1:
            item.line = last_line
    for panel in fixed.panels:
        limit = last_line + 1 if panel.ref_kind == "line" else n_captions
        if panel.ref_index == limit and limit > 0:
            panel.ref_index = limit - 1
    return fixed


def strip_speaker_labels(scene: SceneScript, names: dict[str, str]) -> SceneScript:
    """Drops a leading "Aino:" (or "Aino's ghost:") label that repeats the speaker's own name inside the line text."""
    fixed = scene.model_copy(deep=True)
    for line in fixed.lines:
        name = names.get(line.speaker)
        if not name:
            continue
        label = re.match(rf"\s*{re.escape(name)}(?:['’]s ghost)?\s*:\s*", line.text, re.IGNORECASE)
        if label and line.text[label.end():].strip():
            line.text = line.text[label.end():]
    return fixed


def validate_scene(
    scene: SceneDraft,
    beat: Beat,
    fate: FateScript,
    alive_at_start: frozenset[str] | None = None,
    plan: BeatStory | None = None,
) -> list[str]:
    """Returns 'code: message' errors; an empty list means the scene may be shown.

    `plan` is the beat's storyline entry (planned bystanders and ghost); None means compute it from the fate.
    """
    errors: list[str] = []

    def err(code: str, message: str) -> None:
        errors.append(f"{code}: {message}")

    names = {c.id: c.name for c in fate.characters}
    alive = alive_at_start if alive_at_start is not None else alive_before_each_beat(fate)[beat.index]
    risen = set(beat.resurrections)
    if plan is None:
        from bottle_throne.story.storyline import storyline

        plan = storyline(fate).beats[beat.index]
    bystanders, planned_ghost = plan.bystanders, plan.ghost

    if isinstance(scene, SceneScript):
        if scene.setting != beat.setting:
            err("setting", f"scene setting {scene.setting} differs from beat setting {beat.setting}")
        if scene.beat_index != beat.index:
            err("beat_index", "scene is attached to the wrong beat")

    # Catalogs (normally enforced by parsing, re-checked for scenes built in code).
    if scene.music not in MUSIC_MOODS:
        err("catalog", f"unknown music mood {scene.music}")
    for line in scene.lines:
        if line.emotion not in EMOTIONS:
            err("catalog", f"unknown emotion {line.emotion}")
        if line.action is not None and line.action not in ACTIONS:
            err("catalog", f"unknown action {line.action}")
    for cue in scene.cues:
        if cue.sfx not in SFX_CUES:
            err("catalog", f"unknown SFX cue {cue.sfx}")
    for panel in scene.panels:
        if panel.framing not in FRAMINGS:
            err("catalog", f"unknown framing {panel.framing}")

    # Content presence and length.
    if not scene.lines and not scene.captions:
        err("empty", "scene has neither lines nor captions")
    for text in [line.text for line in scene.lines] + [c.text for c in scene.captions]:
        if not text.strip():
            err("empty_text", "a line or caption is empty")
        if len(text) > MAX_LINE_CHARS:
            err("line_length", f"text of {len(text)} characters exceeds {MAX_LINE_CHARS}")
    seconds = scene_reading_seconds(scene)
    if seconds > beat.budget_seconds * BUDGET_TOLERANCE:
        err("budget", f"reading time {seconds:.1f}s exceeds budget {beat.budget_seconds}s by more than 15%")

    # Speakers.
    for i, line in enumerate(scene.lines):
        if line.speaker == NARRATOR:
            continue
        if line.speaker not in names:
            err("unknown_speaker", f"line {i}: {line.speaker!r} is not in the cast")
        elif line.speaker not in alive and line.speaker not in risen and line.emotion != "dead":
            err("dead_speaker", f"line {i}: {names[line.speaker]} is out of the story and not a ghost")

    # Index references.
    n_lines, n_captions = len(scene.lines), len(scene.captions)
    for caption in scene.captions:
        if not 0 <= caption.before_line <= n_lines:
            err("bad_ref", f"caption refers to line {caption.before_line}")
    for item in [*scene.cues, *scene.onomatopoeia, *scene.stage_directions]:
        if not 0 <= item.line < max(n_lines, 1):
            err("bad_ref", f"reference to line {item.line} of {n_lines}")
    for word in scene.onomatopoeia:
        if len(word.text) > MAX_ONOMATOPOEIA_CHARS:
            err("onomatopoeia", f"{word.text!r} is too long")
    if not MIN_PANELS <= len(scene.panels) <= MAX_PANELS:
        err("panel_count", f"{len(scene.panels)} panel moments")
    for panel in scene.panels:
        limit = n_lines if panel.ref_kind == "line" else n_captions
        if not 0 <= panel.ref_index < limit:
            err("bad_ref", f"panel refers to {panel.ref_kind} {panel.ref_index}")
        for character in panel.focus:
            if character not in names:
                err("unknown_focus", f"panel focus {character!r} is not in the cast")
    for direction in scene.stage_directions:
        if direction.character not in names:
            err("unknown_actor", f"stage direction for unknown {direction.character!r}")

    # Fidelity: exactly the beat's eliminations are acted out.
    performed: dict[str, set[str]] = {}
    for line in scene.lines:
        if line.action:
            performed.setdefault(line.speaker, set()).add(line.action)
    for direction in scene.stage_directions:
        performed.setdefault(direction.character, set()).add(direction.action)
    eliminated = {e.character: e.mode for e in beat.eliminations}
    npc_extras_here = {r.character for r in beat.roles} & {c.id for c in fate.characters if c.kind == "npc"}
    for character, mode in eliminated.items():
        if ELIMINATION_ACTION[mode] not in performed.get(character, set()):
            err("missing_elimination", f"{names.get(character, character)} must {ELIMINATION_ACTION[mode]}")

    # Who is in the scene: role holders, bystanders (contestants without a role) and the planned ghost, if any.
    participants = {c.id for c in fate.characters if c.kind == "participant"}
    in_roles = {r.character for r in beat.roles}
    ghosts = {
        line.speaker
        for line in scene.lines
        if line.emotion == "dead" and line.speaker in names and line.speaker not in alive and line.speaker not in risen
    }
    present = [line.speaker for line in scene.lines] + [d.character for d in scene.stage_directions]
    extras = [p for p in dict.fromkeys(present) if p in participants and p not in in_roles and p not in ghosts and p in alive]
    if len(extras) > MAX_BYSTANDERS:
        err("too_many_bystanders", f"{len(extras)} contestants without a role appear; at most {MAX_BYSTANDERS}")
    speakers = {line.speaker for line in scene.lines}
    for planned in bystanders:
        if planned not in speakers:
            err("missing_bystander", f"{names.get(planned, planned)} must speak at least one line (planned bystander)")
    for character in extras:
        for action in sorted(performed.get(character, set()) & LEAVING_ACTIONS):
            err("bystander_leaves", f"bystander {names[character]} must not {action}")
    for ghost in sorted(ghosts - {planned_ghost}):
        err("unplanned_ghost", f"{names[ghost]} is out of the story and is not this scene's planned ghost")
    texts_all = [line.text for line in scene.lines] + [c.text for c in scene.captions]
    if planned_ghost is not None:
        if planned_ghost not in ghosts:
            err("missing_ghost", f"the ghost of {names[planned_ghost]} must speak at least one line with emotion 'dead'")
        elif not any("ghost" in text.lower() for text in texts_all):
            err("unannounced_ghost", f"a line or caption must call {names[planned_ghost]} a ghost")
    for ghost in ghosts:
        for action in sorted(performed.get(ghost, set()) & LEAVING_ACTIONS):
            err("ghost_action", f"the ghost of {names[ghost]} must not {action}")
    for character in sorted(performed):
        if character in names and character not in alive and character not in risen and character not in ghosts:
            err("dead_actor", f"{names[character]} is out of the story and cannot act")
    for character in risen:
        if any(line.speaker == character and line.emotion == "dead" for line in scene.lines):
            err("risen_as_ghost", f"{names[character]} returns to life in this beat and must not use the 'dead' emotion")
        if "enter" not in performed.get(character, set()):
            err("risen_entrance", f"{names[character]} returns to life and must 'enter'")

    for character, actions in performed.items():
        if character in eliminated or character in extras or character in ghosts:
            continue
        for action in actions & {"fall", "exit"}:
            if action == "exit" and character in npc_extras_here:
                continue
            err("extra_elimination", f"{names.get(character, character)} must not {action} in this beat")

    # Heuristic: no death claims about characters who are still in the story after this beat.
    still_in = [cid for cid in alive | risen if cid not in eliminated and cid in names]
    gone_names = [names[cid] for cid in eliminated if cid in names]
    texts = [line.text for line in scene.lines] + [c.text for c in scene.captions]
    resolution = dragon_resolution(fate, beat)
    if resolution:
        hero = beat.roles[0].character
        anchors = [i for i, caption in enumerate(scene.captions) if caption.text == resolution]
        opening = [i for i, caption in enumerate(scene.captions) if caption.before_line == 0 and caption.text != resolution]
        wide_captions = {p.ref_index for p in scene.panels if p.ref_kind == "caption" and p.framing == "wide"}
        if len(anchors) != 1 or not opening or not wide_captions.intersection(opening):
            err("dragon_anchor", "duel needs an opening wide panel and one exact resolution caption")
        else:
            anchor = scene.captions[anchors[0]].before_line
            decisive = [i for i, line in enumerate(scene.lines) if line.speaker == hero and line.action]
            decisive += [d.line for d in scene.stage_directions if d.character == hero]
            if anchors[0] not in wide_captions or not decisive or anchor <= max(decisive):
                err("dragon_anchor", "wide resolution caption must follow the hero's actions")
        for character, actions in performed.items():
            if character != hero and actions & {"strike", "draw_weapon", "lunge", "fall", "exit", "flee"}:
                err("dragon_spectator", "only the hero may fight the dragon")
        fatal = beat.card == "dragon_defeat"
        dragon_death = re.compile(
            r"\b(?:dragon (?:dies|died|falls dead|is dead|is slain|was slain)|"
            r"(?:slay|slays|slain|kill|kills|killed) the dragon)\b", re.I,
        )
        for text in texts:
            if fatal and dragon_death.search(text):
                err("dragon_outcome", "the dragon must survive this defeat")
            if not fatal and re.search(
                rf"\b(?:{re.escape(names[hero])} (?:dies|died|falls dead|is dead)|"
                rf"dragon (?:slays|kills) {re.escape(names[hero])})\b", text, re.I,
            ):
                err("dragon_outcome", "the hero must survive this victory")
        if fatal:
            all_text = " ".join(texts).lower()
            if "sword_accident" in beat.facts and re.search(r"dragon (?:slays|kills)", all_text):
                err("dragon_outcome", "the death is an accident, not a dragon kill")
            if "dragon_slaying" in beat.facts and re.search(r"trips? onto (?:their|his|her) own sword", all_text):
                err("dragon_outcome", "the dragon kills the hero, not a sword accident")
    if len(eliminated) == 1:
        (gone,) = eliminated
        if not any(names.get(gone, gone).lower() in text.lower() for text in texts):
            err("unnamed_elimination", f"no line or caption names {names.get(gone, gone)}, who leaves the story here")
    for text in texts:
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            if resolution and beat.card == "dragon_victory" and re.fullmatch(
                r"(?:The )?dragon (?:dies|is dead|was slain|is slain)\.", sentence, re.I
            ):
                continue
            if not DEATH_WORDS.search(sentence) or any(name in sentence for name in gone_names):
                continue
            if any(names[cid] in sentence for cid in still_in):
                err("death_claim", f"text claims a death that is not in the fate: {sentence[:60]!r}")

    if beat.card == "prophecy":
        winner = names.get(fate.winner, "")
        if winner and any(winner in text for text in texts):
            err("prophecy_names_winner", "the prophecy scene names the winner")
    if beat.card == "coronation" and not any(PROPHECY_WORDS.search(text) for text in texts):
        err("prophecy_payoff", "the coronation does not refer back to the prophecy")

    return errors
