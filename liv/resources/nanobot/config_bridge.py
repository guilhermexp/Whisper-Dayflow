"""
Bridge configuration for Liv ↔ Nanobot integration.
Reads environment variables injected by the Electron main process
and returns a structured config dict for the gateway.
"""

import os
from pathlib import Path


def get_config() -> dict:
    """Read Liv bridge configuration from environment variables."""
    return {
        "api_key": os.environ.get("LIV_API_KEY", ""),
        "model": os.environ.get("LIV_MODEL", "anthropic/claude-sonnet-4-20250514"),
        "provider": os.environ.get("LIV_PROVIDER", "anthropic"),
        "workspace": Path(os.environ.get("LIV_WORKSPACE", "~/.liv/nanobot-workspace")).expanduser(),
        "callback_port": int(os.environ.get("LIV_CALLBACK_PORT", "0")),
        "gateway_port": int(os.environ.get("LIV_GATEWAY_PORT", "0")),
        "max_iterations": int(os.environ.get("LIV_MAX_ITERATIONS", "20")),
        "temperature": float(os.environ.get("LIV_TEMPERATURE", "0.7")),
        "max_tokens": int(os.environ.get("LIV_MAX_TOKENS", "8192")),
        "memory_window": int(os.environ.get("LIV_MEMORY_WINDOW", "50")),
        "log_level": os.environ.get("LIV_LOG_LEVEL", "INFO"),
    }


def get_provider_api_base(provider: str) -> str | None:
    """Get provider-specific API base URL override."""
    base_url = os.environ.get("LIV_API_BASE", "")
    if base_url:
        return base_url

    defaults = {
        "groq": "https://api.groq.com/openai/v1",
        "openrouter": "https://openrouter.ai/api/v1",
    }
    return defaults.get(provider)
