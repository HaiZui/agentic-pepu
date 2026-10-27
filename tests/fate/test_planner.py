import pytest

from bottle_throne.fate.planner import ELIMINATING, make_plan
from bottle_throne.fate.rng import Stream


@pytest.mark.parametrize("n", range(3, 41))
def test_eliminations_sum_to_roster_minus_one(n: int) -> None:
    for s in range(100):
        plan = make_plan(n, Stream(f"seed-{s}", f"plan-{n}"))
        act3_eliminations = plan.contenders - 1
        expected = n - 1 + (1 if plan.resurrection else 0)
        assert plan.act_eliminations + act3_eliminations == expected
        assert plan.contenders in (2, 3)
        assert all(2 <= size <= 6 for size in plan.crowd_sizes)
        if plan.resurrection:
            assert n >= 6


@pytest.mark.parametrize("n", range(3, 41))
def test_plan_shape(n: int) -> None:
    for s in range(50):
        plan = make_plan(n, Stream(f"shape-{s}", str(n)))
        sections = [slot.section for slot in plan.slots]
        assert sections[0] == "cold_open" and sections[-1] == "coronation"
        assert 16 <= len(plan.slots) <= 24
        act1 = [slot for slot in plan.slots if slot.section == "act_1"]
        assert act1[0].type == "decree"
        assert [slot.type for slot in act1].count("prophecy") == 1
        act3 = [slot for slot in plan.slots if slot.section == "act_3"]
        assert act3[-1].type == "final"
        assert not [slot for slot in act3 if slot.type == "crowd"]
        assert sum(1 for slot in act3 if slot.type == "single") == plan.contenders - 2

        if plan.resurrection:
            ordered = [slot for slot in plan.slots if slot.section in ("act_1", "act_2")]
            first_blood = [i for i, slot in enumerate(ordered) if slot.first_blood]
            rising = [i for i, slot in enumerate(ordered) if slot.type == "resurrection"]
            assert len(first_blood) == 1 and len(rising) == 1
            assert first_blood[0] < rising[0]
            assert any(slot.type in ELIMINATING for slot in ordered[rising[0] + 1 :])
        if n >= 6:
            assert sum(1 for slot in plan.slots if slot.nonlethal) == 1


def test_large_roster_needs_crowds() -> None:
    for s in range(100):
        assert len(make_plan(30, Stream(f"s{s}", "p")).crowd_sizes) >= 3


def test_small_roster_has_no_big_crowds() -> None:
    for s in range(100):
        assert all(size <= 2 for size in make_plan(6, Stream(f"s{s}", "p")).crowd_sizes)
