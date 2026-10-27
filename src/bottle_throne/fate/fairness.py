import hashlib
import json
import secrets

from bottle_throne.fate.rng import Stream

ENGINE_VERSION = "fate-1"


def canonical_roster(names: list[str]) -> list[str]:
    """Order-independent roster: case-insensitive sort, ties broken by the exact name."""
    return sorted(names, key=lambda name: (name.casefold(), name))


def new_auto_seed() -> str:
    return secrets.token_hex(16)


def select_winner_index(seed: str, roster: list[str]) -> int:
    """Uniform pick over the canonical roster. Uses nothing but the seed and the roster size."""
    return Stream(seed, "winner").uniform_int(len(roster))


def seal_of_fate(seed: str, roster: list[str], old_king: str | None, engine_version: str = ENGINE_VERSION) -> str:
    """SHA-256 commitment over seed, canonical roster, Old King (None = the Mad King) and engine version."""
    payload = {
        "engine_version": engine_version,
        "old_king": old_king,
        "roster": canonical_roster(roster),
        "seed": seed,
    }
    data = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def short_seal(seal: str) -> str:
    return " ".join(seal[i : i + 4] for i in range(0, 12, 4))
