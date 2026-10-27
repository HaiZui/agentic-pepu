from functools import cache
from pathlib import Path

PROMPT_DIR = Path(__file__).parent / "prompts"


@cache
def prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}.txt").read_text(encoding="utf-8")


def prompt_version(name: str) -> str:
    """Version id from the first line, e.g. 'voices-1'."""
    first = prompt(name).splitlines()[0]
    return first[first.index("(") + 1 : first.index(")")]


def system_prompt(name: str) -> str:
    return f"{prompt('style')}\n\n{prompt(name)}"
