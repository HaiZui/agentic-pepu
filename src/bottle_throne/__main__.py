import argparse
import json
import socket
import sys
import threading
import webbrowser
from pathlib import Path

from bottle_throne.config import get_settings


def _port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((host, port))
        except OSError:
            return False
    return True


def serve(args: argparse.Namespace) -> int:
    import uvicorn

    from bottle_throne.app import create_app

    settings = get_settings()
    host = args.host or settings.host
    port = args.port or settings.port

    if not _port_available(host, port):
        print(
            f"Port {port} on {host} is already in use. "
            "Stop the other process or set BOTTLE_THRONE_PORT to a free port.",
            file=sys.stderr,
        )
        return 1

    url = f"http://{host}:{port}/"
    print(f"The Bottle Throne is starting at {url}")
    missing = settings.missing_foundry_variables()
    if missing:
        print(f"Warning: missing Foundry configuration: {', '.join(missing)}", file=sys.stderr)

    if args.open:
        threading.Timer(1.5, webbrowser.open, args=(url,)).start()

    uvicorn.run(create_app(settings), host=host, port=port, log_level="info")
    return 0


def dump_openapi(args: argparse.Namespace) -> int:
    from bottle_throne.app import create_app
    from bottle_throne.config import Settings

    schema = create_app(Settings(_env_file=None)).openapi()
    text = json.dumps(schema, indent=2, ensure_ascii=False) + "\n"
    target = Path(args.path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {args.path}")
    return 0


def verify(args: argparse.Namespace) -> int:
    from bottle_throne.fate.characters import resolve_old_king_name
    from bottle_throne.fate.fairness import ENGINE_VERSION, canonical_roster, seal_of_fate, select_winner_index
    from bottle_throne.models.show import clean_name

    if args.engine != ENGINE_VERSION:
        print(
            f"This build implements engine {ENGINE_VERSION}; check out the release that matches {args.engine}.",
            file=sys.stderr,
        )
        return 2
    lines = Path(args.roster).read_text(encoding="utf-8-sig").splitlines()
    roster = canonical_roster([name for name in (clean_name(line) for line in lines) if name])
    if not roster:
        print("The roster file contains no names.", file=sys.stderr)
        return 2
    old_king = clean_name(args.old_king) if args.old_king else None
    seal_old_king, _ = resolve_old_king_name(roster, old_king or None)

    print(f"Engine:       {ENGINE_VERSION}")
    print(f"Participants: {len(roster)}")
    print(f"Seal of Fate: {seal_of_fate(args.seed, roster, seal_old_king)}")
    print(f"Winner:       {roster[select_winner_index(args.seed, roster)]}")
    return 0


def llm_check(args: argparse.Namespace) -> int:
    import asyncio

    from bottle_throne.story.check import llm_check as run_check

    ok, lines = asyncio.run(run_check(get_settings()))
    for line in lines:
        if line:
            print(line, file=sys.stdout if ok else sys.stderr)
    return 0 if ok else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m bottle_throne", description="The Bottle Throne")
    parser.add_argument("--open", action="store_true", help="open the setup screen in the browser")
    parser.add_argument("--host", help="interface to bind (default 127.0.0.1)")
    parser.add_argument("--port", type=int, help="port to listen on (default 8765)")
    parser.set_defaults(handler=serve)

    commands = parser.add_subparsers(title="commands")
    dump = commands.add_parser("dump-openapi", help="write the OpenAPI schema to a file")
    dump.add_argument("path")
    dump.set_defaults(handler=dump_openapi)

    check = commands.add_parser("verify", help="recompute the Seal of Fate and the winner of a show (offline)")
    check.add_argument("--seed", required=True, help="the seed revealed in the credits")
    check.add_argument("--roster", required=True, help="text file with one participant name per line")
    check.add_argument("--old-king", help="last week's winner, if one was entered")
    check.add_argument("--engine", default="fate-1", help="engine version shown in the credits")
    check.set_defaults(handler=verify)

    ping = commands.add_parser("llm-check", help="send one tiny request to the configured Foundry deployment")
    ping.set_defaults(handler=llm_check)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
