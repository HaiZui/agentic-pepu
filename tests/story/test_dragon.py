import pytest

from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.story import Caption, SceneDraft
from bottle_throne.story.causes import dragon_resolution
from bottle_throne.story.context import beat_facts, outline
from bottle_throne.story.fallback import fallback_scene, variants_for
from bottle_throne.story.storyline import RESPONSIBLE, storyline
from bottle_throne.story.validate import validate_scene


def encounters():
    seen = set()
    for seed in range(300):
        fate = generate_fate(f"duel-{seed}", ["Åsa", "Öhman", "Jääskeläinen", "A", "B", "C", "D", "E"], None)
        for beat in fate.beats:
            if beat.card not in ("dragon_victory", "dragon_defeat"):
                continue
            key = "victory" if beat.card == "dragon_victory" else next(f for f in beat.facts if f != "first_blood")
            if key not in seen:
                seen.add(key)
                yield fate, beat
        if len(seen) == 3:
            return
    raise AssertionError(f"Missing encounter variants: {seen}")


def test_duel_context_stamps_and_fallbacks() -> None:
    for fate, beat in encounters():
        hero = beat.roles[0].character
        name = next(c.name for c in fate.characters if c.id == hero)
        story = storyline(fate).beats[beat.index]
        assert name in beat_facts(fate, beat)["what_happens"]
        assert name in outline(fate)[beat.index]["what_happens"]
        assert beat_facts(fate, beat)["dragon_duel"]["resolution_caption"] == dragon_resolution(fate, beat)
        assert beat.card not in RESPONSIBLE
        if beat.card == "dragon_victory":
            assert story.survivors_before == story.survivors_after
            assert not story.announcements
        else:
            stamp = story.announcements[0]
            assert stamp.character == hero and name in stamp.headline
            assert ("own sword" in stamp.cause) == ("sword_accident" in beat.facts)
        for variant in range(len(variants_for(beat))):
            scene = fallback_scene(fate, beat, "s", variant)
            assert validate_scene(scene, beat, fate) == []
            assert len(scene.panels) == 3


def test_duel_outcome_and_anchor_validation() -> None:
    for fate, beat in encounters():
        scene = fallback_scene(fate, beat, "s")
        broken = scene.model_copy(deep=True)
        broken.captions.pop()
        assert any(e.startswith("dragon_anchor:") for e in validate_scene(broken, beat, fate))
        broken = scene.model_copy(deep=True)
        hero = next(c.name for c in fate.characters if c.id == beat.roles[0].character)
        wrong = f"The dragon slays {hero}." if beat.card == "dragon_victory" else f"{hero} slays the dragon."
        broken.captions.append(Caption(text=wrong, before_line=len(scene.lines)))
        assert any(e.startswith("dragon_outcome:") for e in validate_scene(broken, beat, fate))


@pytest.mark.asyncio
async def test_reversed_duel_retries_then_falls_back() -> None:
    from bottle_throne.story.scheduler import StoryState, generate_story
    from tests.story.test_scheduler import ScriptedLLM, beat_index_of, good_draft

    fate, beat = next(encounters())
    original = fate.model_dump_json()
    attempts = 0

    def reply(llm, messages):
        nonlocal attempts
        draft = good_draft(llm, messages)
        if beat_index_of(messages) == beat.index:
            attempts += 1
            draft.captions = []
        return SceneDraft.model_validate(draft)

    state = StoryState(fate=fate, seed="s")
    await generate_story(state, ScriptedLLM(fate, reply))
    assert attempts == 2 and state.statuses[beat.index] == "fallback"
    assert validate_scene(state.scenes[beat.index], beat, fate) == []
    assert fate.model_dump_json() == original
