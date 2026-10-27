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


def beat_of(fate: FateScript, predicate) -> Beat:
    return next(b for b in fate.beats if predicate(b))


def good_scene(fate: FateScript, beat: Beat) -> SceneScript:
    """A minimal valid scene: one line per role, markers for eliminations, three panels."""
    victims = {e.character: e.mode for e in beat.eliminations}
    actors = [r.character for r in beat.roles if r.character not in victims][:2] or ["narrator"]
    lines = [Line(speaker=a, emotion="smug", action=None, text="Mark my words.") for a in actors]
    lines.append(Line(speaker="narrator", emotion="neutral", action=None, text="And so it was."))
    if beat.card == "coronation":
        lines.append(Line(speaker="narrator", emotion="triumphant", action=None, text="The prophecy is fulfilled."))
    directions = [
        StageDirection(character=c, action="fall" if mode == "killed" else "exit", line=len(lines) - 1)
        for c, mode in victims.items()
    ]
    return SceneScript(
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
