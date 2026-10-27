"""Serves the app with Foundry switched off, so every scene is a template fallback.

Used by the Playwright end-to-end test; also handy for rehearsing without network access.
Run: .venv\\Scripts\\python.exe scripts\\serve_fallback.py [port]
"""

import sys

import uvicorn

from bottle_throne.app import create_app
from bottle_throne.config import Settings


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
    settings = Settings(
        _env_file=None,
        foundry_api_key=None,
        foundry_api_endpoint=None,
        foundry_llm_deployment_name=None,
    )
    uvicorn.run(create_app(settings), host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
