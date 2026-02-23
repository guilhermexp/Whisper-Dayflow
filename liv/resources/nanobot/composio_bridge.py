"""
Composio integration bridge for Liv Nanobot.

Connects to the Composio REST API to manage external service credentials
(Gmail, Slack, GitHub, Calendar, etc.) and exposes their actions as
nanobot tools via ComposioToolWrapper.
"""

import json
import logging
import hashlib
import re
from typing import Any

import httpx

from nanobot.agent.tools.base import Tool
from nanobot.agent.tools.registry import ToolRegistry

log = logging.getLogger("composio-bridge")
MAX_TOOL_NAME_LEN = 64


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", value.strip().lower())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned or "x"


def _build_tool_name(app_name: str, action_name: str) -> str:
    app = _slug(app_name)
    action = _slug(action_name)
    base = f"composio_{app}_{action}"
    if len(base) <= MAX_TOOL_NAME_LEN:
        return base

    digest = hashlib.sha1(f"{app_name}:{action_name}".encode("utf-8")).hexdigest()[:8]
    suffix = f"_{digest}"
    allowed = MAX_TOOL_NAME_LEN - len(suffix)
    return f"{base[:allowed]}{suffix}"

# ---------------------------------------------------------------------------
# ComposioToolWrapper — wraps a single Composio action as a nanobot Tool
# (follows the same pattern as MCPToolWrapper in nanobot/agent/tools/mcp.py)
# ---------------------------------------------------------------------------


class ComposioToolWrapper(Tool):
    """Wraps a Composio action as a nanobot Tool."""

    def __init__(self, bridge: "ComposioBridge", app_name: str, action: dict):
        self._bridge = bridge
        self._app_name = app_name
        self._action_name = action["name"]
        self._name = _build_tool_name(app_name, action["name"])
        self._description = action.get("description", action["name"])
        self._parameters = action.get("parameters", {"type": "object", "properties": {}})

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        return self._parameters

    async def execute(self, **kwargs: Any) -> str:
        return await self._bridge.execute_action(
            self._action_name, kwargs, self._app_name
        )


# ---------------------------------------------------------------------------
# ComposioBridge — REST client for Composio API
# ---------------------------------------------------------------------------


class ComposioBridge:
    """Manages Composio connections and tools via REST API."""

    BASE = "https://backend.composio.dev/api"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = httpx.AsyncClient(
            headers={"x-api-key": api_key},
            timeout=30,
        )
        self._connected_apps: dict[str, str] = {}  # app_name -> connected_account_id
        self._registered_tools: dict[str, list[str]] = {}  # app_name -> [tool_names]
        self._integration_cache: dict[str, str] = {}  # app_name -> integration_uuid

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    # --- App discovery ---

    async def list_apps(self) -> list[dict]:
        """List available apps from Composio."""
        try:
            resp = await self.client.get(f"{self.BASE}/v1/apps")
            resp.raise_for_status()
            data = resp.json()
            # API returns {"items": [...]} or a plain list
            items = data if isinstance(data, list) else data.get("items", [])
            return [
                {
                    "name": app.get("key", app.get("name", "")),
                    "display_name": app.get("name", app.get("key", "")),
                    "description": app.get("description", ""),
                    "logo": app.get("logo", ""),
                    "categories": app.get("categories", []),
                }
                for app in items
            ]
        except Exception as e:
            log.error(f"Failed to list Composio apps: {e}")
            return []

    async def get_app_actions(self, app_name: str) -> list[dict]:
        """Get available actions for an app."""
        try:
            resp = await self.client.get(
                f"{self.BASE}/v2/actions",
                params={"appNames": app_name, "limit": 50},
            )
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("items", [])
            return [
                {
                    "name": action.get("name", ""),
                    "display_name": action.get("displayName", action.get("name", "")),
                    "description": action.get("description", ""),
                    "parameters": action.get("parameters", {"type": "object", "properties": {}}),
                }
                for action in items
            ]
        except Exception as e:
            log.error(f"Failed to get actions for {app_name}: {e}")
            return []

    # --- Integration resolution ---

    async def _resolve_integration_id(self, app_name: str) -> str:
        """Resolve the Composio integration UUID for an app.

        The POST /v1/connectedAccounts endpoint requires a UUID integrationId,
        not the plain app name.  This method checks the cache first, then queries
        GET /v1/integrations, and creates a new integration if none exists.
        """
        if app_name in self._integration_cache:
            return self._integration_cache[app_name]

        try:
            resp = await self.client.get(
                f"{self.BASE}/v1/integrations",
                params={"appName": app_name},
            )
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("items", [])

            if items:
                integration_id = items[0].get("id", "")
                if integration_id:
                    self._integration_cache[app_name] = integration_id
                    log.info(f"Resolved integration for {app_name}: {integration_id}")
                    return integration_id
        except Exception as e:
            log.warning(f"Failed to query integrations for {app_name}: {e}")

        # No existing integration — create one
        try:
            resp = await self.client.post(
                f"{self.BASE}/v1/integrations",
                json={
                    "appId": app_name,
                    "name": f"liv-{app_name}",
                    "useComposioAuth": True,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            integration_id = data.get("id", "")
            if integration_id:
                self._integration_cache[app_name] = integration_id
                log.info(f"Created integration for {app_name}: {integration_id}")
                return integration_id
        except Exception as e:
            log.error(f"Failed to create integration for {app_name}: {e}")
            raise

        raise ValueError(f"Could not resolve integration ID for {app_name}")

    # --- Connection management ---

    async def initiate_connection(
        self,
        app_name: str,
        integration_id: str | None = None,
        redirect_url: str | None = None,
        entity_id: str = "default",
    ) -> dict:
        """Initiate an OAuth connection for an app.

        Returns dict with 'url' (OAuth redirect) and 'connectionId'.
        """
        try:
            if not integration_id:
                integration_id = await self._resolve_integration_id(app_name)
            body: dict[str, Any] = {
                "integrationId": integration_id,
                "entityId": entity_id,
            }
            if redirect_url:
                body["redirectUri"] = redirect_url

            resp = await self.client.post(
                f"{self.BASE}/v1/connectedAccounts",
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "url": data.get("redirectUrl", data.get("url", "")),
                "connectionId": data.get("id", data.get("connectedAccountId", "")),
            }
        except Exception as e:
            log.error(f"Failed to initiate connection for {app_name}: {e}")
            raise

    async def check_connection(self, connected_account_id: str) -> dict:
        """Check the status of a connection."""
        try:
            resp = await self.client.get(
                f"{self.BASE}/v1/connectedAccounts/{connected_account_id}",
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "id": data.get("id", connected_account_id),
                "status": data.get("status", "UNKNOWN"),
                "appName": data.get("appName", ""),
            }
        except Exception as e:
            log.error(f"Failed to check connection {connected_account_id}: {e}")
            return {"id": connected_account_id, "status": "ERROR", "appName": ""}

    async def list_connections(self) -> list[dict]:
        """List all connected accounts."""
        try:
            resp = await self.client.get(f"{self.BASE}/v1/connectedAccounts")
            resp.raise_for_status()
            data = resp.json()
            items = data if isinstance(data, list) else data.get("items", [])
            return [
                {
                    "id": conn.get("id", ""),
                    "appName": conn.get("appName", ""),
                    "status": conn.get("status", "UNKNOWN"),
                }
                for conn in items
            ]
        except Exception as e:
            log.error(f"Failed to list connections: {e}")
            return []

    async def disconnect(self, connected_account_id: str) -> bool:
        """Delete a connected account."""
        try:
            resp = await self.client.delete(
                f"{self.BASE}/v1/connectedAccounts/{connected_account_id}",
            )
            resp.raise_for_status()
            # Remove from local cache
            for app_name, cid in list(self._connected_apps.items()):
                if cid == connected_account_id:
                    del self._connected_apps[app_name]
                    break
            return True
        except Exception as e:
            log.error(f"Failed to disconnect {connected_account_id}: {e}")
            return False

    # --- Action execution ---

    async def execute_action(
        self, action_name: str, params: dict, app_name: str
    ) -> str:
        """Execute a Composio action."""
        try:
            # Find the connected account for this app
            connected_account_id = self._connected_apps.get(app_name, "")

            body: dict[str, Any] = {"input": params}
            if connected_account_id:
                body["connectedAccountId"] = connected_account_id
            body["entityId"] = "default"

            resp = await self.client.post(
                f"{self.BASE}/v2/actions/{action_name}/execute",
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

            # Composio returns various result formats
            if isinstance(data, dict):
                result = data.get("data", data.get("response_data", data))
                if isinstance(result, (dict, list)):
                    return json.dumps(result, indent=2, ensure_ascii=False)
                return str(result)
            return str(data)
        except httpx.HTTPStatusError as e:
            error_body = e.response.text[:500] if e.response else ""
            log.error(f"Composio action {action_name} failed: {e} — {error_body}")
            return f"Error executing {action_name}: {e}"
        except Exception as e:
            log.error(f"Composio action {action_name} error: {e}")
            return f"Error executing {action_name}: {e}"

    # --- Tool registration ---

    async def register_app_tools(self, app_name: str, registry: ToolRegistry) -> int:
        """List actions for an app and register them as tools.

        Returns the number of tools registered.
        """
        actions = await self.get_app_actions(app_name)
        registered = []
        for action in actions:
            wrapper = ComposioToolWrapper(self, app_name, action)
            registry.register(wrapper)
            registered.append(wrapper.name)
            log.debug(f"Composio: registered tool '{wrapper.name}'")

        self._registered_tools[app_name] = registered
        log.info(f"Composio: registered {len(registered)} tools for {app_name}")
        return len(registered)

    async def register_selected_app_tools(
        self, app_name: str, selected_actions: list[str], registry: ToolRegistry
    ) -> int:
        """Register only the selected actions for an app as tools.

        Returns the number of tools registered.
        """
        actions = await self.get_app_actions(app_name)
        selected_set = set(selected_actions)
        registered = []
        for action in actions:
            if action["name"] in selected_set:
                wrapper = ComposioToolWrapper(self, app_name, action)
                registry.register(wrapper)
                registered.append(wrapper.name)
                log.debug(f"Composio: registered selected tool '{wrapper.name}'")

        self._registered_tools[app_name] = registered
        log.info(f"Composio: registered {len(registered)}/{len(selected_actions)} selected tools for {app_name}")
        return len(registered)

    async def unregister_app_tools(self, app_name: str, registry: ToolRegistry) -> None:
        """Remove all tools for an app from the registry."""
        tool_names = self._registered_tools.pop(app_name, [])
        for name in tool_names:
            registry.unregister(name)
        log.info(f"Composio: unregistered {len(tool_names)} tools for {app_name}")

    # --- Status ---

    async def get_status(self) -> dict:
        """Check if API key is valid and list connected apps."""
        try:
            connections = await self.list_connections()
            active = [c for c in connections if c["status"] == "ACTIVE"]
            return {
                "connected": True,
                "apps": [c["appName"] for c in active],
                "total_connections": len(connections),
                "active_connections": len(active),
            }
        except Exception:
            return {
                "connected": False,
                "apps": [],
                "total_connections": 0,
                "active_connections": 0,
            }

    def get_registered_tools_count(self) -> int:
        """Return total number of registered Composio tools."""
        return sum(len(v) for v in self._registered_tools.values())

    def get_registered_tools_by_app(self) -> dict[str, list[str]]:
        """Return tool names grouped by app."""
        return dict(self._registered_tools)
