"""LLM routing foundation — Week 4, Step 1.

Every agent asks for a role ("caption", "judgement", "vision", "embed", "free"),
never a provider or model name directly — swapping DeepSeek for another model later
is a one-line change to the MODEL_* env vars, not a code change.

research.md Decision 1: uses the Agents SDK's `litellm/<provider>/<model>` string
prefix directly on each Agent, not the lower-level LitellmModel class import, and
not a separate LiteLLM Proxy server (no litellm.yaml — that config shape is for a
standalone gateway process, which this single-worker deployment doesn't need).
"""
import os
from pathlib import Path

from config import settings

# LiteLLM's openrouter/ provider reads these from the process environment directly.
# pydantic-settings only populates the Settings object, not os.environ, so set them
# explicitly here rather than relying on how .env happens to be loaded in a given
# deployment (Docker's env_file does export real env vars; a bare local run might not).
if settings.OPENROUTER_API_KEY:
    os.environ.setdefault("OPENROUTER_API_KEY", settings.OPENROUTER_API_KEY)

REPO = Path(__file__).resolve().parent.parent.parent.parent  # repo root — holds SOUL.md, BRAND.md, AGENTS.md, skills/

MODEL_MAP = {
    "caption": settings.MODEL_CAPTION,
    "judgement": settings.MODEL_JUDGEMENT,
    "vision": settings.MODEL_VISION,
    "embed": settings.MODEL_EMBED,
    "free": settings.MODEL_FREE,
}


def model(name: str) -> str:
    """Return the litellm/openrouter/<model> string for a given role.

    Raises KeyError with the valid role names if `name` isn't one of them —
    callers should never pass a raw provider/model string.
    """
    if name not in MODEL_MAP:
        raise KeyError(f"Unknown model role {name!r}; valid roles: {sorted(MODEL_MAP)}")
    return f"litellm/openrouter/{MODEL_MAP[name]}"


async def embed(text: str) -> list[float]:
    """Return the embedding vector for `text` using the configured embed model.

    Uses LiteLLM's own `aembedding()` directly rather than the Agents SDK's
    Agent/Runner (which is chat-completion-only, no embeddings support) — so the
    model string here is LiteLLM-native (`openrouter/<model>`), NOT the
    `litellm/openrouter/<model>` prefix `model()` returns for Agents.
    """
    import litellm

    response = await litellm.aembedding(
        model=f"openrouter/{MODEL_MAP['embed']}",
        input=text,
    )
    return response.data[0]["embedding"]


def load_prompt(*files: str) -> str:
    """Concatenate one or more prompt source files from the repo root.

    Each arg is a path relative to the repo root (e.g. "SOUL.md", "BRAND.md",
    "skills/caption-writer.md"). Missing files are skipped rather than raising —
    a brand that hasn't written every identity file yet shouldn't crash every
    agent call.
    """
    parts = []
    for name in files:
        path = REPO / name
        if path.exists():
            parts.append(path.read_text(encoding="utf-8").strip())
    return "\n\n---\n\n".join(parts)
