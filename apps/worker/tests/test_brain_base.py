"""Tests for the LLM routing foundation — Week 4, Step 1.

Verifies model() resolves every role to a valid litellm/openrouter/... string, and
(if a real OPENROUTER_API_KEY is configured) that a real round-trip through
OpenRouter's free tier succeeds — proving the whole chain (Agents SDK -> LiteLLM ->
OpenRouter) actually works, not just that the string is well-formed.
"""
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

try:
    import litellm  # noqa: F401
    _has_litellm = True
except ImportError:
    _has_litellm = False


def test_model_map_covers_every_role():
    from brain.base import MODEL_MAP, model

    for role in ("caption", "judgement", "vision", "embed", "free"):
        assert role in MODEL_MAP
        assert model(role) == f"litellm/openrouter/{MODEL_MAP[role]}"


def test_model_rejects_unknown_role():
    from brain.base import model

    with pytest.raises(KeyError):
        model("not_a_real_role")


def test_load_prompt_skips_missing_files(tmp_path, monkeypatch):
    import brain.base as base

    monkeypatch.setattr(base, "REPO", tmp_path)
    (tmp_path / "SOUL.md").write_text("Be direct.", encoding="utf-8")
    # BRAND.md deliberately not created — load_prompt must not raise.

    result = base.load_prompt("SOUL.md", "BRAND.md")
    assert result == "Be direct."


@pytest.mark.asyncio
@pytest.mark.skipif(
    not _has_litellm,
    reason="litellm not installed in this environment; test requires litellm runtime import",
)
async def test_embed_uses_litellm_native_model_string_and_returns_vector():
    from brain.base import MODEL_MAP, embed

    mock_response = MagicMock()
    mock_response.data = [{"embedding": [0.1, 0.2, 0.3]}]

    with patch("litellm.aembedding", new_callable=AsyncMock) as mock_aembedding:
        mock_aembedding.return_value = mock_response

        result = await embed("a caption")

        assert result == [0.1, 0.2, 0.3]
        call_kwargs = mock_aembedding.call_args.kwargs
        assert call_kwargs["model"] == f"openrouter/{MODEL_MAP['embed']}"
        assert not call_kwargs["model"].startswith("litellm/")


@pytest.mark.asyncio
@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="No OPENROUTER_API_KEY configured in this environment — dry-run round-trip requires a real key",
)
async def test_free_tier_round_trip():
    """Real round-trip: proves the Agents SDK -> LiteLLM -> OpenRouter chain works.

    Uses MODEL_FREE specifically so this never burns paid-tier budget.
    """
    from agents import Agent, Runner
    from brain.base import model

    agent = Agent(
        name="DryRunAgent",
        instructions="Respond with exactly one word.",
        model=model("free"),
    )
    result = await Runner.run(agent, "Say hello.")
    assert result.final_output
