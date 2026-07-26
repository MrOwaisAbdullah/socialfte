"""Telegram Bot API notification channel — not yet implemented.

Discord is the primary channel for Week 3 (see notify/discord.py). This stub
exists so NOTIFY_CHANNEL=telegram fails fast with a clear error instead of an
ImportError, once a caller wires it up.
"""


async def send(text: str, media_url: str | None = None) -> str:
    raise NotImplementedError("Telegram notify channel is not implemented yet")
