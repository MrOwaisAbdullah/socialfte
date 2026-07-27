"""CLI entry point for the BOOTSTRAP wizard — `python -m worker bootstrap`.

Runs the six-step guided setup flow interactively. Refuses to run if BOOTSTRAP.md
exists (setup marked complete, per FR-018).

`--env=<path>` (Week 5, US6) points the whole wizard at an isolated directory
instead of the real repo root — every step's file writes (SOUL.md, BRAND.md,
HEARTBEAT.md, IDENTITY.md, BOOTSTRAP.md, .env.local) land under that directory
instead, so a second brand's setup can be exercised without ever touching the
first brand's identity files. `<path>` is the target `.env` file itself; its
parent directory becomes the target root (e.g. `clients/test-client-2/.env`
-> root `clients/test-client-2/`).
"""
import argparse
import asyncio
import logging
from pathlib import Path

from .steps import run_bootstrap


def main(argv: list[str] | None = None):
    """`argv` defaults to None (argparse reads sys.argv[1:]) for standalone use
    (`python -m bootstrap.cli --env=...`); worker/__main__.py's `bootstrap`
    subcommand dispatcher passes `sys.argv[2:]` explicitly instead, since
    sys.argv[1:] there still has the leading "bootstrap" token in it."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    parser = argparse.ArgumentParser(description="SocialFTE BOOTSTRAP wizard")
    parser.add_argument(
        "--env",
        type=str,
        default=None,
        help="Path to an isolated client's .env file — its parent directory becomes "
        "the target root for this run's identity files, instead of the real repo root.",
    )
    args = parser.parse_args(argv)

    root = Path(args.env).resolve().parent if args.env else None
    asyncio.run(run_bootstrap(root))


if __name__ == "__main__":
    main()
