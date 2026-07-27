"""CLI entry point for the BOOTSTRAP wizard — `python -m worker bootstrap`.

Runs the six-step guided setup flow interactively. Refuses to run if BOOTSTRAP.md
exists (setup marked complete, per FR-018).
"""
import asyncio
import logging
import sys

from .steps import run_bootstrap


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(run_bootstrap())


if __name__ == "__main__":
    main()
