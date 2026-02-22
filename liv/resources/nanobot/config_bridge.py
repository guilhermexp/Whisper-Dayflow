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


def get_channels_config() -> dict:
    """Read channel integration config from environment variables.

    Returns a dict with enabled channels and their credentials.
    Only channels with LIV_<CHANNEL>_ENABLED=true are included.
    """
    channels = {}

    if os.environ.get("LIV_TELEGRAM_ENABLED", "").lower() == "true":
        channels["telegram"] = {
            "enabled": True,
            "token": os.environ.get("LIV_TELEGRAM_TOKEN", ""),
        }

    if os.environ.get("LIV_WHATSAPP_ENABLED", "").lower() == "true":
        channels["whatsapp"] = {
            "enabled": True,
            "bridge_url": os.environ.get("LIV_WHATSAPP_BRIDGE_URL", ""),
            "bridge_token": os.environ.get("LIV_WHATSAPP_BRIDGE_TOKEN", ""),
        }

    if os.environ.get("LIV_SLACK_ENABLED", "").lower() == "true":
        channels["slack"] = {
            "enabled": True,
            "bot_token": os.environ.get("LIV_SLACK_BOT_TOKEN", ""),
            "app_token": os.environ.get("LIV_SLACK_APP_TOKEN", ""),
        }

    if os.environ.get("LIV_DISCORD_ENABLED", "").lower() == "true":
        channels["discord"] = {
            "enabled": True,
            "token": os.environ.get("LIV_DISCORD_TOKEN", ""),
        }

    if os.environ.get("LIV_EMAIL_ENABLED", "").lower() == "true":
        channels["email"] = {
            "enabled": True,
            "imap_host": os.environ.get("LIV_EMAIL_IMAP_HOST", ""),
            "imap_user": os.environ.get("LIV_EMAIL_IMAP_USER", ""),
            "imap_pass": os.environ.get("LIV_EMAIL_IMAP_PASS", ""),
            "smtp_host": os.environ.get("LIV_EMAIL_SMTP_HOST", ""),
            "smtp_user": os.environ.get("LIV_EMAIL_SMTP_USER", ""),
            "smtp_pass": os.environ.get("LIV_EMAIL_SMTP_PASS", ""),
        }

    return channels
