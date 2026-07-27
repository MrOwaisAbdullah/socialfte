"""BOOTSTRAP wizard — Week 4, US7.

One-time guided setup flow for onboarding a brand. Available as both a CLI entry point
(`python -m worker bootstrap`) and a dashboard page (`/setup`). Built last because Step 6
(verify-and-finish) exercises every other feature (render, publish, notify, LLM call).

Per FR-018: refuses to run once BOOTSTRAP.md no longer exists (setup marked complete).
Per FR-019: every brand-specific value comes from what this wizard collects, not hardcoded.
"""

from .steps import run_bootstrap
