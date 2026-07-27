"""LLM agents — caption writing, vision tagging (Week 4).

Named `brain`, not `agents` — a package named `agents` here would shadow the
pip-installed OpenAI Agents SDK (also `agents`) for every module in this worker,
since `apps/worker` is the import root. See research.md Decision 8.
"""
