"""Worker entry point — supports `python -m worker bootstrap` and `python -m worker` (runs the scheduler).
"""
import sys


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "bootstrap":
        from bootstrap.cli import main as bootstrap_main
        bootstrap_main(sys.argv[2:])  # strip the "bootstrap" subcommand token itself
    else:
        from main import main as worker_main
        worker_main()


if __name__ == "__main__":
    main()
