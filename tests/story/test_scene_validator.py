import pytest

from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import Beat, FateScript
from bottle_throne.models.story import (
    Caption,
    Cue,
    Line,
    Onomatopoeia,
    PanelMoment,
    SceneDraft,
    SceneScript,
    StageDirection,
)
from bottle_throne.story.storyline import storyline
from bottle_throne.story.causes import dragon_resolution
from bottle_throne.story.validate import validate_scene

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka", "Sanna", "Timo", "Ulla"]


@pytest.fixture(scope="module")
def fate() -> FateScript:
    for s in range(200):
        script = generate_fate(f"validator-{s}", NAMES, None)
        cards = {b.card for b in script.beats}
        if "trial_by_combat" in cards and any(b.kind == "crowd" for b in script.beats):
            return script
    raise AssertionError("no suitable fate")


def bystanders_of(fate: FateScript, beat: Beat) -> list[str]:
    return storyline(fate).beats[beat.index].bystanders


def beat_of(fate: FateScript, predicate) -> Beat:
    return next(b for b in fate.beats if predicate(b))


def good_scene(fate: FateScript, beat: Beat) -> SceneScript:
    """A minimal valid scene: one line per role, markers for eliminations, three panels."""
    names = {c.id: c.name for c in fate.characters}
    victims = {e.character: e.mode for e in beat.eliminations}
    actors = [r.character for r in beat.roles if r.character not in victims][:2] or ["narrator"]
    lines = [Line(speaker=a, emotion="smug", action=None, text="Mark my words.") for a in actors]
    lines += [Line(speaker=b, emotion="neutral", action=None, text="I saw it all.") for b in bystanders_of(fate, beat)]
    ghost = storyline(fate).beats[beat.index].ghost
    if ghost:
        lines.append(Line(speaker=ghost, emotion="dead", action=None, text="A ghost never forgets."))
    ending = f"And so {names[next(iter(victims))]} was gone." if len(victims) == 1 else "And so it was."
    lines.append(Line(speaker="narrator", emotion="neutral", action=None, text=ending))
    if beat.card == "coronation":
        lines.append(Line(speaker="narrator", emotion="triumphant", action=None, text="The prophecy is fulfilled."))
    directions = [
        StageDirection(character=c, action="fall" if mode == "killed" else "exit", line=len(lines) - 1)
        for c, mode in victims.items()
    ] + [StageDirection(character=r, action="enter", line=0) for r in beat.resurrections]
    scene = SceneScript(
        beat_index=beat.index,
        setting=beat.setting,
        music="intrigue",
        lines=lines,
        captions=[Caption(text="MEANWHILE...", before_line=0)],
        stage_directions=directions,
        onomatopoeia=[Onomatopoeia(text="SHINK!", line=0)],
        cues=[Cue(sfx="shink", line=0)],
        panels=[
            PanelMoment(framing="wide", ref_kind="caption", ref_index=0, focus=[]),
            PanelMoment(framing="close_up", ref_kind="line", ref_index=0, focus=[]),
            PanelMoment(framing="medium", ref_kind="line", ref_index=len(lines) - 1, focus=[]),
        ],
        is_fallback=False,
        prompt_version="test",
    )
    resolution = dragon_resolution(fate, beat)
    if resolution:
        hero = beat.roles[0].character
        if not victims:
            scene.stage_directions.append(StageDirection(character=hero, action="strike", line=0))
        scene.captions.append(Caption(text=resolution, before_line=len(lines)))
        scene.panels[-1] = PanelMoment(framing="wide", ref_kind="caption", ref_index=1, focus=[hero])
    return scene


def codes(scene: SceneDraft, beat: Beat, fate: FateScript) -> set[str]:
    return {e.split(":", 1)[0] for e in validate_scene(scene, beat, fate)}


def test_good_scenes_pass_for_every_beat(fate: FateScript) -> None:
    for beat in fate.beats:
        assert validate_scene(good_scene(fate, beat), beat, fate) == [], beat.card


def test_invented_cue_rejected(fate: FateScript) -> None:
    beat = fate.beats[1]
    scene = good_scene(fate, beat)
    scene.cues[0] = Cue.model_construct(sfx="dramatic_lute_sting_7", line=0)
    assert "catalog" in codes(scene, beat, fate)


def test_unknown_speaker(fate: FateScript) -> None:
    beat = fate.beats[1]
    scene = good_scene(fate, beat)
    scene.lines[0].speaker = "Gandalf"
    assert "unknown_speaker" in codes(scene, beat, fate)


def test_dead_speaker_needs_ghost_emotion(fate: FateScript) -> None:
    risen = {r for b in fate.beats for r in b.resurrections}
    kill = beat_of(fate, lambda b: b.kind == "single" and b.eliminations[0].character not in risen)
    victim = kill.eliminations[0].character
    later = next(b for b in fate.beats if b.index > kill.index and b.card != "coronation")
    scene = good_scene(fate, later)
    scene.lines.append(Line(speaker=victim, emotion="furious", action=None, text="I am back!"))
    assert "dead_speaker" in codes(scene, later, fate)
    scene.lines[-1].emotion = "dead"
    assert "dead_speaker" not in codes(scene, later, fate)


def test_missing_and_extra_elimination(fate: FateScript) -> None:
    beat = beat_of(fate, lambda b: b.card == "trial_by_combat")
    scene = good_scene(fate, beat)
    scene.stage_directions = []
    assert "missing_elimination" in codes(scene, beat, fate)

    scene = good_scene(fate, beat)
    survivor = next(r.character for r in beat.roles if r.character not in {e.character for e in beat.eliminations})
    scene.stage_directions.append(StageDirection(character=survivor, action="fall", line=0))
    assert "extra_elimination" in codes(scene, beat, fate)


def test_crowd_victims_marked_by_stage_directions(fate: FateScript) -> None:
    beat = beat_of(fate, lambda b: b.kind == "crowd")
    scene = good_scene(fate, beat)
    assert validate_scene(scene, beat, fate) == []
    scene.stage_directions.pop()
    assert "missing_elimination" in codes(scene, beat, fate)


def test_death_claim_heuristic(fate: FateScript) -> None:
    beat = fate.beats[1]
    names = {c.id: c.name for c in fate.characters}
    alive_name = names[fate.winner]
    scene = good_scene(fate, beat)
    scene.lines[0].text = f"{alive_name} was slain in the night."
    assert "death_claim" in codes(scene, beat, fate)


def test_panel_rules(fate: FateScript) -> None:
    beat = fate.beats[1]
    scene = good_scene(fate, beat)
    scene.panels = scene.panels[:2]
    assert "panel_count" in codes(scene, beat, fate)

    scene = good_scene(fate, beat)
    scene.panels[1].ref_index = 99
    assert "bad_ref" in codes(scene, beat, fate)


def test_line_length_and_budget(fate: FateScript) -> None:
    beat = fate.beats[1]
    scene = good_scene(fate, beat)
    scene.lines[0].text = "x" * 141
    assert "line_length" in codes(scene, beat, fate)

    scene = good_scene(fate, beat)
    scene.lines = [Line(speaker="narrator", emotion="neutral", action=None, text="y" * 130)] * 12
    assert "budget" in codes(scene, beat, fate)


def test_setting_must_match(fate: FateScript) -> None:
    beat = fate.beats[1]
    scene = good_scene(fate, beat)
    scene.setting = "bridge" if beat.setting != "bridge" else "forest"
    assert "setting" in codes(scene, beat, fate)


def test_coronation_must_recall_prophecy(fate: FateScript) -> None:
    beat = fate.beats[-1]
    scene = good_scene(fate, beat)
    scene.lines = [line for line in scene.lines if "prophecy" not in line.text]
    assert "prophecy_payoff" in codes(scene, beat, fate)


def test_prophecy_must_not_name_winner(fate: FateScript) -> None:
    beat = beat_of(fate, lambda b: b.card == "prophecy")
    winner = next(c.name for c in fate.characters if c.id == fate.winner)
    scene = good_scene(fate, beat)
    scene.lines[0].text = f"The crown goes to {winner}."
    assert "prophecy_names_winner" in codes(scene, beat, fate)


def test_npc_extra_may_leave_the_stage(fate: FateScript) -> None:
    npcs = {c.id for c in fate.characters if c.kind == "npc"}
    beat = beat_of(fate, lambda b: any(r.character in npcs for r in b.roles) and not b.eliminations)
    npc = next(r.character for r in beat.roles if r.character in npcs)
    scene = good_scene(fate, beat)
    scene.stage_directions.append(StageDirection(character=npc, action="exit", line=0))
    assert "extra_elimination" not in codes(scene, beat, fate)
    scene.stage_directions[-1].action = "fall"
    assert "extra_elimination" in codes(scene, beat, fate)


def test_repair_clamps_one_past_the_end(fate: FateScript) -> None:
    from bottle_throne.story.validate import repair_scene

    beat = fate.beats[1]
    scene = good_scene(fate, beat)
    n = len(scene.lines)
    scene.cues[0].line = n
    scene.panels[1].ref_index = n
    repaired = repair_scene(scene)
    assert repaired.cues[0].line == n - 1 and repaired.panels[1].ref_index == n - 1
    assert validate_scene(repaired, beat, fate) == []
    scene.cues[0].line = n + 1
    assert "bad_ref" in codes(repair_scene(scene), beat, fate)


# --- bystanders, naming, returns and ghosts ----------------------------------------------------------------


@pytest.fixture(scope="module")
def risen_fate() -> FateScript:
    for s in range(300):
        script = generate_fate(f"validator-risen-{s}", NAMES, None)
        if any(b.resurrections for b in script.beats):
            return script
    raise AssertionError("no resurrection")


def planned_beat(fate: FateScript) -> Beat:
    return beat_of(fate, lambda b: bool(bystanders_of(fate, b)))


def test_planned_bystander_missing(fate: FateScript) -> None:
    beat = planned_beat(fate)
    scene = good_scene(fate, beat)
    missing = bystanders_of(fate, beat)[0]
    scene.lines = [line for line in scene.lines if line.speaker != missing]
    scene.panels[-1].ref_index = len(scene.lines) - 1
    for d in scene.stage_directions:
        d.line = min(d.line, len(scene.lines) - 1)
    assert "missing_bystander" in codes(scene, beat, fate)


def test_too_many_bystanders(fate: FateScript) -> None:
    beat = fate.beats[1]
    story = storyline(fate).beats[beat.index]
    roles = {r.character for r in beat.roles}
    extra = [p for p in story.survivors_before if p not in roles][:3]
    scene = good_scene(fate, beat)
    scene.lines += [Line(speaker=p, emotion="neutral", action=None, text="Me too.") for p in extra]
    assert "too_many_bystanders" in codes(scene, beat, fate)


def test_bystander_falls_or_enters(fate: FateScript) -> None:
    beat = planned_beat(fate)
    who = bystanders_of(fate, beat)[0]
    for action in ("fall", "exit", "enter"):
        scene = good_scene(fate, beat)
        scene.stage_directions.append(StageDirection(character=who, action=action, line=0))
        assert "bystander_leaves" in codes(scene, beat, fate), action


def test_unnamed_single_elimination(fate: FateScript) -> None:
    beat = beat_of(fate, lambda b: b.card == "trial_by_combat")
    scene = good_scene(fate, beat)
    assert "unnamed_elimination" not in codes(scene, beat, fate)
    scene.lines[-1].text = "And so it was."
    assert "unnamed_elimination" in codes(scene, beat, fate)


def test_crowd_scene_need_not_name_everyone(fate: FateScript) -> None:
    beat = beat_of(fate, lambda b: b.kind == "crowd")
    assert "unnamed_elimination" not in codes(good_scene(fate, beat), beat, fate)


def test_risen_must_not_be_a_ghost_and_must_enter(risen_fate: FateScript) -> None:
    beat = beat_of(risen_fate, lambda b: bool(b.resurrections))
    (risen,) = beat.resurrections
    scene = good_scene(risen_fate, beat)
    assert validate_scene(scene, beat, risen_fate) == []
    scene.lines.insert(0, Line(speaker=risen, emotion="dead", action=None, text="I return!"))
    scene.captions[0].before_line = 0
    assert "risen_as_ghost" in codes(scene, beat, risen_fate)
    scene = good_scene(risen_fate, beat)
    scene.stage_directions = [d for d in scene.stage_directions if d.action != "enter"]
    assert "risen_entrance" in codes(scene, beat, risen_fate)


def ghost_fate() -> tuple[FateScript, Beat, str]:
    for n in range(300):
        script = generate_fate(f"validator-ghost-{n}", NAMES, None)
        planned = next((s for s in storyline(script).beats if s.ghost), None)
        if planned:
            return script, script.beats[planned.index], planned.ghost  # type: ignore[return-value]
    raise AssertionError("no planned ghost")


def test_planned_ghost_passes_and_others_do_not() -> None:
    fate, beat, ghost = ghost_fate()
    scene = good_scene(fate, beat)
    assert validate_scene(scene, beat, fate) == []
    story = storyline(fate)
    other = next(p for p in (c.id for c in fate.characters if c.kind == "participant")
                 if p != ghost and p not in story.beats[beat.index].survivors_before and p not in {r.character for r in beat.roles})
    scene.lines.append(Line(speaker=other, emotion="dead", action=None, text="Me too."))
    assert "unplanned_ghost" in codes(scene, beat, fate)


def test_planned_ghost_must_speak_and_be_called_a_ghost() -> None:
    fate, beat, ghost = ghost_fate()
    scene = good_scene(fate, beat)
    scene.lines = [line for line in scene.lines if line.speaker != ghost]
    assert "missing_ghost" in codes(scene, beat, fate)
    scene = good_scene(fate, beat)
    for line in scene.lines:
        line.text = line.text.replace("ghost", "spirit")
    assert "unannounced_ghost" in codes(scene, beat, fate)


def test_ghost_where_none_is_planned(fate: FateScript) -> None:
    story = storyline(fate)
    risen = {r for b in fate.beats for r in b.resurrections}
    first = next(b for b in fate.beats if b.eliminations and b.eliminations[0].character not in risen)
    dead = first.eliminations[0].character
    later = next(b for b in fate.beats if b.index > first.index and b.card != "coronation" and story.beats[b.index].ghost is None)
    scene = good_scene(fate, later)
    scene.lines.append(Line(speaker=dead, emotion="dead", action=None, text="Boo."))
    assert "unplanned_ghost" in codes(scene, later, fate)


def test_ghost_may_not_enter_fall_or_exit() -> None:
    fate, beat, ghost = ghost_fate()
    scene = good_scene(fate, beat)
    for line in scene.lines:
        if line.speaker == ghost:
            line.action = "enter"
    assert "ghost_action" in codes(scene, beat, fate)


def ghosts_and_beat(fate: FateScript) -> tuple[list[str], Beat]:
    risen = {r for b in fate.beats for r in b.resurrections}
    dead: list[str] = []
    for b in fate.beats:
        if len(dead) >= 2:
            later = next(x for x in fate.beats if x.index > b.index and x.card != "coronation" and not x.resurrections)
            return dead[:2], later
        dead += [e.character for e in b.eliminations if e.character not in risen]
    raise AssertionError("not enough eliminations")


def test_dead_character_cannot_act_silently(fate: FateScript) -> None:
    (a, _), beat = ghosts_and_beat(fate)
    scene = good_scene(fate, beat)
    scene.stage_directions.append(StageDirection(character=a, action="point", line=0))
    assert "dead_actor" in codes(scene, beat, fate)


def test_speaker_labels_are_stripped(fate: FateScript) -> None:
    from bottle_throne.story.validate import strip_speaker_labels

    beat = fate.beats[1]
    scene = good_scene(fate, beat)
    speaker = next(line.speaker for line in scene.lines if line.speaker != "narrator")
    name = next(c.name for c in fate.characters if c.id == speaker)
    scene.lines[0].speaker = speaker
    scene.lines[0].text = f"{name}: Mark my words."
    scene.lines.append(Line(speaker=speaker, emotion="neutral", action=None, text=f"{name}'s ghost: Boo."))
    scene.lines.append(Line(speaker=speaker, emotion="neutral", action=None, text=f"{name} is here."))
    fixed = strip_speaker_labels(scene, {c.id: c.name for c in fate.characters})
    assert [line.text for line in fixed.lines[-2:]] == ["Boo.", f"{name} is here."]
    assert fixed.lines[0].text == "Mark my words."
