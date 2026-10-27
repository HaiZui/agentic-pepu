import secrets
import threading
from dataclasses import dataclass
from typing import Literal

from bottle_throne.models.show import OldKing, Participant, ShowRequest, ShowSession, resolve_old_king


@dataclass
class SessionRecord:
    """Server-side session state. Holds fields (like the manual seed) never sent to the browser."""

    id: str
    participants: list[Participant]
    old_king: OldKing
    seed_mode: Literal["auto", "manual"]
    manual_seed: str | None

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
        with self._lock:
            show_id = secrets.token_urlsafe(9)
            while show_id in self._sessions:
                show_id = secrets.token_urlsafe(9)
            record = SessionRecord(
                id=show_id,
                participants=participants,
                old_king=old_king,
                seed_mode="manual" if request.seed else "auto",
                manual_seed=request.seed,
            )
            self._sessions[show_id] = record
        return record

    def get(self, show_id: str) -> SessionRecord | None:
        with self._lock:
            return self._sessions.get(show_id)

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)
