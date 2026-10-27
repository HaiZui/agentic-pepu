from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from bottle_throne.__main__ import main
from bottle_throne.app import create_app
from bottle_throne.config import Settings

NAMES = ["Matti", "Aino", "Kalle", "Jääskeläinen", "Öhman", "Liisa", "Pekka"]


def run_verify(capsys: pytest.CaptureFixture[str], *args: str) -> dict[str, str]:
    assert main(["verify", *args]) == 0
    lines = capsys.readouterr().out.splitlines()
    return {k.strip(): v.strip() for k, v in (line.split(":", 1) for line in lines)}


@pytest.mark.parametrize(("old_king", "seed"), [(None, None), ("aino", None), ("Jukka", "friday-42")])
def test_verify_matches_api_show(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], old_king: str | None, seed: str | None
) -> None:
    client = TestClient(create_app(Settings(_env_file=None)))
    show = client.post("/api/shows", json={"participants": NAMES, "old_king": old_king, "seed": seed}).json()
    fate = client.get(f"/api/shows/{show['id']}/fate").json()
    reveal = client.post(f"/api/shows/{show['id']}/reveal").json()
    winner = next(c["name"] for c in fate["characters"] if c["id"] == fate["winner"])

    roster_file = tmp_path / "roster.txt"
    roster_file.write_text("\n".join(reversed(NAMES)) + "\n\n", encoding="utf-8")
    args = ["--seed", reveal["seed"], "--roster", str(roster_file), "--engine", reveal["engine_version"]]
    if old_king:
        args += ["--old-king", old_king]

    out = run_verify(capsys, *args)

    assert out["Seal of Fate"] == fate["seal"]
    assert out["Winner"] == winner
    assert out["Participants"] == str(len(NAMES))


def test_verify_rejects_unknown_engine(tmp_path: Path) -> None:
    roster_file = tmp_path / "roster.txt"
    roster_file.write_text("A\nB\nC\n", encoding="utf-8")
    assert main(["verify", "--seed", "s", "--roster", str(roster_file), "--engine", "fate-0"]) == 2
