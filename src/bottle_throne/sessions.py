import secrets
import threading
from dataclasses import dataclass, field
from typing import Literal

from bottle_throne.fate.fairness import ENGINE_VERSION, canonical_roster, new_auto_seed
from bottle_throne.fate.solver import generate_fate
from bottle_throne.models.fate import FateScript, Reveal
from bottle_throne.models.show import OldKing, Participant, ShowRequest, ShowSession, resolve_old_king
from bottle_throne.story.scheduler import StoryState


@dataclass
class SessionRecord:
    """Server-side session state. Holds fields (like the seed) never sent to the browser before the reveal."""

    id: str
    participants: list[Participant]
    old_king: OldKing
    seed_mode: Literal["auto", "manual"]
    seed: str
    fate: FateScript
    story: StoryState = field(init=False)

    def __post_init__(self) -> None:
        self.story = StoryState(fate=self.fate, seed=self.seed)

    @property
    def canonical_roster(self) -> list[str]:
        return canonical_roster([p.name for p in self.participants])

    def reveal(self) -> Reveal:
        return Reveal(seed=self.seed, seed_mode=self.seed_mode, engine_version=ENGINE_VERSION, seal=self.fate.seal)

    def public(self) -> ShowSession:
        return ShowSession(
            id=self.id,
            participants=self.participants,
            old_king=self.old_king,
            seed_mode=self.seed_mode,
        )


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}
        self._lock = threading.Lock()

    def create(self, request: ShowRequest) -> SessionRecord:
        participants, old_king = resolve_old_king(request.participants, request.old_king)
        seed_mode: Literal["auto", "manual"] = "manual" if request.seed else "auto"
        seed = request.seed or new_auto_seed()
        fate = generate_fate(seed, request.participants, None if old_king.is_mad_king else old_king.name, seed_mode)
        with self._lock:
            show_id = secrets.token_urlsafe(9)
            while show_id in self._sessions:
                show_id = secrets.token_urlsafe(9)
            record = SessionRecord(
                id=show_id,
                participants=participants,
                old_king=old_king,
                seed_mode=seed_mode,
                seed=seed,
                fate=fate,
            )
            self._sessions[show_id] = record
        return record

    def get(self, show_id: str) -> SessionRecord | None:
        with self._lock:
            return self._sessions.get(show_id)

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)
