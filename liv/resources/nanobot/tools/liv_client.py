"""
HTTP client for the Liv callback server.
Used by Liv tools to call Electron main process services.
"""

import json
import logging
import os
from typing import Any

import httpx

log = logging.getLogger("liv-client")

DEFAULT_TIMEOUT = 60.0  # seconds


class LivClient:
    """Synchronous HTTP client for the Liv callback server."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        callback_token = os.environ.get("LIV_CALLBACK_TOKEN", "").strip()
        headers = {"X-Liv-Callback-Token": callback_token} if callback_token else {}
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=DEFAULT_TIMEOUT,
            headers=headers,
        )

    async def get(self, path: str, params: dict | None = None) -> Any:
        """GET request to callback server."""
        try:
            resp = await self._client.get(path, params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            log.error(f"HTTP error {e.response.status_code}: {e.response.text}")
            return {"error": f"HTTP {e.response.status_code}: {e.response.text}"}
        except Exception as e:
            log.error(f"Request error: {e}")
            return {"error": str(e)}

    async def post(self, path: str, data: dict | None = None) -> Any:
        """POST request to callback server."""
        try:
            resp = await self._client.post(path, json=data or {})
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            log.error(f"HTTP error {e.response.status_code}: {e.response.text}")
            return {"error": f"HTTP {e.response.status_code}: {e.response.text}"}
        except Exception as e:
            log.error(f"Request error: {e}")
            return {"error": str(e)}

    async def put(self, path: str, data: dict | None = None) -> Any:
        """PUT request to callback server."""
        try:
            resp = await self._client.put(path, json=data or {})
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            log.error(f"HTTP error {e.response.status_code}: {e.response.text}")
            return {"error": f"HTTP {e.response.status_code}: {e.response.text}"}
        except Exception as e:
            log.error(f"Request error: {e}")
            return {"error": str(e)}

    async def delete(self, path: str) -> Any:
        """DELETE request to callback server."""
        try:
            resp = await self._client.delete(path)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            log.error(f"HTTP error {e.response.status_code}: {e.response.text}")
            return {"error": f"HTTP {e.response.status_code}: {e.response.text}"}
        except Exception as e:
            log.error(f"Request error: {e}")
            return {"error": str(e)}

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()
