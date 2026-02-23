"""
Liv-specific tools for the nanobot agent.

These tools let the agent interact with all Liv services
via the callback server running in the Electron main process.
"""

import json
import logging
from typing import Any

# Import nanobot Tool base class
import sys, os
ref = os.environ.get("LIV_NANOBOT_REF", "")
if ref and ref not in sys.path:
    sys.path.insert(0, ref)

from nanobot.agent.tools.base import Tool
from tools.liv_client import LivClient

log = logging.getLogger("liv-tools")


def _json_result(data: Any) -> str:
    """Format result as compact JSON string for the LLM."""
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


# ---------------------------------------------------------------------------
# 1. Journal Tool
# ---------------------------------------------------------------------------

class LivJournalTool(Tool):
    def __init__(self, client: LivClient):
        self.client = client

    @property
    def name(self) -> str:
        return "liv_journal"

    @property
    def description(self) -> str:
        return (
            "Access auto-journal entries. Actions: "
            "'list' to get recent journal runs, "
            "'trigger' to run auto-journal now, "
            "'status' to check scheduler status, "
            "'delete' to remove a journal entry by ID."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "trigger", "status", "delete"],
                    "description": "Action to perform",
                },
                "entry_id": {
                    "type": "string",
                    "description": "Journal entry ID (for delete action)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max entries to return (default 10)",
                },
                "from_ts": {
                    "type": "integer",
                    "description": "Start timestamp (epoch ms) for filtering",
                },
                "to_ts": {
                    "type": "integer",
                    "description": "End timestamp (epoch ms) for filtering",
                },
                "window_minutes": {
                    "type": "integer",
                    "description": "Time window in minutes for trigger action",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "list")

        if action == "list":
            params = {}
            if kwargs.get("limit"):
                params["limit"] = str(kwargs["limit"])
            if kwargs.get("from_ts"):
                params["from"] = str(kwargs["from_ts"])
            if kwargs.get("to_ts"):
                params["to"] = str(kwargs["to_ts"])
            result = await self.client.get("/journal/entries", params or None)
            return _json_result(result)

        elif action == "trigger":
            data = {}
            if kwargs.get("window_minutes"):
                data["windowMinutes"] = kwargs["window_minutes"]
            result = await self.client.post("/journal/trigger", data or None)
            return _json_result(result)

        elif action == "status":
            result = await self.client.get("/journal/status")
            return _json_result(result)

        elif action == "delete":
            entry_id = kwargs.get("entry_id")
            if not entry_id:
                return "Error: entry_id required for delete"
            result = await self.client.delete(f"/journal/entries/{entry_id}")
            return _json_result(result)

        return f"Unknown action: {action}"


# ---------------------------------------------------------------------------
# 2. Kanban Tool
# ---------------------------------------------------------------------------

class LivKanbanTool(Tool):
    def __init__(self, client: LivClient):
        self.client = client

    @property
    def name(self) -> str:
        return "liv_kanban"

    @property
    def description(self) -> str:
        return (
            "Manage the multi-board Kanban workspace. Actions: "
            "'list_boards' to list all boards with IDs and card counts, "
            "'get' to read a single board (default: auto-analysis), "
            "'create_board' to create a new board, "
            "'update_board' to update board metadata (name, description, color), "
            "'delete_board' to remove a board (cannot delete auto-analysis), "
            "'add_column' to add a column to a board, "
            "'create' to add a card to a board column, "
            "'update' to modify a card, "
            "'delete' to remove a card, "
            "'move' to move a card between columns."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "list_boards", "get",
                        "create_board", "update_board", "delete_board",
                        "add_column",
                        "create", "update", "delete", "move",
                    ],
                    "description": "Action to perform",
                },
                "board_id": {
                    "type": "string",
                    "description": "Board ID (optional, defaults to 'auto-analysis')",
                },
                "card_id": {
                    "type": "string",
                    "description": "Card ID (for update/delete/move)",
                },
                "column_id": {
                    "type": "string",
                    "description": "Column ID (any string, e.g. 'pending', 'todo', 'doing', 'done')",
                },
                "name": {
                    "type": "string",
                    "description": "Board name (for create_board/update_board)",
                },
                "title": {
                    "type": "string",
                    "description": "Card or column title (for create/update/add_column)",
                },
                "description": {
                    "type": "string",
                    "description": "Description (for create/update/create_board/update_board)",
                },
                "bullets": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Bullet points (for create/update card)",
                },
                "status": {
                    "type": "string",
                    "enum": ["open", "done"],
                    "description": "Card status (for update)",
                },
                "color": {
                    "type": "string",
                    "description": "Accent color hex (for create_board/update_board/add_column)",
                },
                "icon": {
                    "type": "string",
                    "description": "Icon identifier (for create_board/update_board/add_column)",
                },
                "columns": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "color": {"type": "string"},
                            "icon": {"type": "string"},
                        },
                        "required": ["title"],
                    },
                    "description": "Column definitions for create_board (optional, defaults to A Fazer/Em Andamento/Concluido)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "get")
        board_id = kwargs.get("board_id", "auto-analysis")

        if action == "list_boards":
            result = await self.client.get("/kanban/workspace")
            if isinstance(result, dict) and "boards" in result:
                summary = []
                for b in result["boards"]:
                    card_count = sum(len(col.get("cards", [])) for col in b.get("columns", []))
                    summary.append({
                        "id": b["id"],
                        "name": b["name"],
                        "description": b.get("description"),
                        "createdBy": b.get("createdBy"),
                        "columns": len(b.get("columns", [])),
                        "cards": card_count,
                    })
                return _json_result({"boards": summary})
            return _json_result(result)

        elif action == "get":
            if board_id == "auto-analysis":
                result = await self.client.get("/kanban/board")
            else:
                ws = await self.client.get("/kanban/workspace")
                if isinstance(ws, dict) and "boards" in ws:
                    board = next((b for b in ws["boards"] if b["id"] == board_id), None)
                    if board:
                        return _json_result(board)
                    return f"Error: Board '{board_id}' not found"
                result = ws
            return _json_result(result)

        elif action == "create_board":
            data = {
                "name": kwargs.get("name", "New Board"),
                "createdBy": "agent",
            }
            if kwargs.get("description"):
                data["description"] = kwargs["description"]
            if kwargs.get("color"):
                data["color"] = kwargs["color"]
            if kwargs.get("icon"):
                data["icon"] = kwargs["icon"]
            if kwargs.get("columns"):
                data["columns"] = kwargs["columns"]
            result = await self.client.post("/kanban/board", data)
            return _json_result(result)

        elif action == "update_board":
            data = {}
            if kwargs.get("name"):
                data["name"] = kwargs["name"]
            if kwargs.get("description") is not None:
                data["description"] = kwargs["description"]
            if kwargs.get("color"):
                data["color"] = kwargs["color"]
            if kwargs.get("icon"):
                data["icon"] = kwargs["icon"]
            result = await self.client.put(f"/kanban/board/{board_id}", data)
            return _json_result(result)

        elif action == "delete_board":
            result = await self.client.delete(f"/kanban/board/{board_id}")
            return _json_result(result)

        elif action == "add_column":
            data = {"title": kwargs.get("title", "New Column")}
            if kwargs.get("color"):
                data["color"] = kwargs["color"]
            if kwargs.get("icon"):
                data["icon"] = kwargs["icon"]
            result = await self.client.post(f"/kanban/board/{board_id}/column", data)
            return _json_result(result)

        elif action == "create":
            data = {
                "boardId": board_id,
                "columnId": kwargs.get("column_id", "pending"),
                "title": kwargs.get("title", "New Task"),
            }
            if kwargs.get("description"):
                data["description"] = kwargs["description"]
            if kwargs.get("bullets"):
                data["bullets"] = kwargs["bullets"]
            result = await self.client.post("/kanban/card", data)
            return _json_result(result)

        elif action == "update":
            card_id = kwargs.get("card_id")
            if not card_id:
                return "Error: card_id required for update"
            data = {"boardId": board_id}
            for key in ("title", "description", "bullets", "status"):
                if kwargs.get(key) is not None:
                    data[key] = kwargs[key]
            if kwargs.get("column_id"):
                data["lane"] = kwargs["column_id"]
            result = await self.client.put(f"/kanban/card/{card_id}", data)
            return _json_result(result)

        elif action == "delete":
            card_id = kwargs.get("card_id")
            if not card_id:
                return "Error: card_id required for delete"
            result = await self.client.delete(f"/kanban/card/{card_id}")
            return _json_result(result)

        elif action == "move":
            card_id = kwargs.get("card_id")
            if not card_id:
                return "Error: card_id required for move"
            data = {
                "toColumnId": kwargs.get("column_id", "pending"),
                "boardId": board_id,
            }
            result = await self.client.post(f"/kanban/move/{card_id}", data)
            return _json_result(result)

        return f"Unknown action: {action}"


# ---------------------------------------------------------------------------
# 3. Memory Tool
# ---------------------------------------------------------------------------

class LivMemoryTool(Tool):
    def __init__(self, client: LivClient):
        self.client = client

    @property
    def name(self) -> str:
        return "liv_memory"

    @property
    def description(self) -> str:
        return (
            "Search or write to Liv's vectorized memory (SQLite + FTS5 + embeddings). "
            "Actions: 'search' to find memories by query, "
            "'write' to add new content to memory."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["search", "write"],
                    "description": "Action to perform",
                },
                "query": {
                    "type": "string",
                    "description": "Search query (for search action)",
                },
                "content": {
                    "type": "string",
                    "description": "Content to write (for write action)",
                },
                "section": {
                    "type": "string",
                    "description": "Memory section to write to (optional)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 6)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "search")

        if action == "search":
            query = kwargs.get("query", "")
            if not query:
                return "Error: 'query' is required for search"
            data = {"query": query}
            if kwargs.get("limit"):
                data["limit"] = kwargs["limit"]
            result = await self.client.post("/memory/search", data)
            return _json_result(result)

        elif action == "write":
            content = kwargs.get("content", "")
            if not content:
                return "Error: 'content' is required for write"
            data = {"content": content}
            if kwargs.get("section"):
                data["section"] = kwargs["section"]
            result = await self.client.post("/memory/write", data)
            return _json_result(result)

        return f"Unknown action: {action}"


# ---------------------------------------------------------------------------
# 4. Life OS Tool
# ---------------------------------------------------------------------------

class LivLifeOSTool(Tool):
    def __init__(self, client: LivClient):
        self.client = client

    @property
    def name(self) -> str:
        return "liv_life_os"

    @property
    def description(self) -> str:
        return (
            "Access the Life OS (Telos framework). Actions: "
            "'get_context' to read mission/dimensions/goals/principles, "
            "'update_context' to update the life context, "
            "'get_analysis' to read the latest life analysis, "
            "'refresh_analysis' to generate a new life analysis."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["get_context", "update_context", "get_analysis", "refresh_analysis"],
                    "description": "Action to perform",
                },
                "context": {
                    "type": "object",
                    "description": "Life context data (for update_context)",
                },
                "window_days": {
                    "type": "integer",
                    "description": "Analysis window in days (default 14)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "get_context")

        if action == "get_context":
            result = await self.client.get("/life/context")
            return _json_result(result)

        elif action == "update_context":
            context = kwargs.get("context")
            if not context:
                return "Error: 'context' is required for update_context"
            result = await self.client.put("/life/context", context)
            return _json_result(result)

        elif action == "get_analysis":
            result = await self.client.get("/life/analysis")
            return _json_result(result)

        elif action == "refresh_analysis":
            data = {}
            if kwargs.get("window_days"):
                data["windowDays"] = kwargs["window_days"]
            result = await self.client.post("/life/analysis/refresh", data or None)
            return _json_result(result)

        return f"Unknown action: {action}"


# ---------------------------------------------------------------------------
# 5. Profile Tool
# ---------------------------------------------------------------------------

class LivProfileTool(Tool):
    def __init__(self, client: LivClient):
        self.client = client

    @property
    def name(self) -> str:
        return "liv_profile"

    @property
    def description(self) -> str:
        return (
            "Access the autonomous profile board (insights about work patterns, "
            "time, topics, people, projects, focus risks). "
            "Actions: 'get' to read the profile, 'refresh' to regenerate."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["get", "refresh"],
                    "description": "Action to perform",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "get")

        if action == "get":
            result = await self.client.get("/profile/board")
            return _json_result(result)

        elif action == "refresh":
            result = await self.client.post("/profile/refresh")
            return _json_result(result)

        return f"Unknown action: {action}"


# ---------------------------------------------------------------------------
# 6. Recordings Tool
# ---------------------------------------------------------------------------

class LivRecordingsTool(Tool):
    def __init__(self, client: LivClient):
        self.client = client

    @property
    def name(self) -> str:
        return "liv_recordings"

    @property
    def description(self) -> str:
        return (
            "Access audio recording transcriptions. Actions: "
            "'list' to get recent recordings, "
            "'search' to find recordings by text/tags/date, "
            "'delete' to remove a recording by ID, "
            "'update' to modify recording metadata (tags)."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "search", "delete", "update"],
                    "description": "Action to perform",
                },
                "recording_id": {
                    "type": "string",
                    "description": "Recording ID (for delete/update)",
                },
                "text": {
                    "type": "string",
                    "description": "Text query for search action",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tags to filter by (for search) or set (for update)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max recordings to return (default 20)",
                },
                "from_ts": {
                    "type": "integer",
                    "description": "Start timestamp (epoch ms)",
                },
                "to_ts": {
                    "type": "integer",
                    "description": "End timestamp (epoch ms)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "list")

        if action == "list":
            params = {}
            if kwargs.get("limit"):
                params["limit"] = str(kwargs["limit"])
            if kwargs.get("from_ts"):
                params["from"] = str(kwargs["from_ts"])
            if kwargs.get("to_ts"):
                params["to"] = str(kwargs["to_ts"])
            result = await self.client.get("/recordings", params or None)
            return _json_result(result)

        elif action == "search":
            data = {}
            if kwargs.get("text"):
                data["text"] = kwargs["text"]
            if kwargs.get("tags"):
                data["tags"] = kwargs["tags"]
            if kwargs.get("from_ts"):
                data["from_ts"] = kwargs["from_ts"]
            if kwargs.get("to_ts"):
                data["to_ts"] = kwargs["to_ts"]
            result = await self.client.post("/recordings/search", data)
            return _json_result(result)

        elif action == "delete":
            recording_id = kwargs.get("recording_id")
            if not recording_id:
                return "Error: recording_id required for delete"
            result = await self.client.delete(f"/recordings/{recording_id}")
            return _json_result(result)

        elif action == "update":
            recording_id = kwargs.get("recording_id")
            if not recording_id:
                return "Error: recording_id required for update"
            data = {}
            if kwargs.get("tags") is not None:
                data["tags"] = kwargs["tags"]
            result = await self.client.put(f"/recordings/{recording_id}", data)
            return _json_result(result)

        return f"Unknown action: {action}"


# ---------------------------------------------------------------------------
# 7. App Control Tool
# ---------------------------------------------------------------------------

class LivAppTool(Tool):
    def __init__(self, client: LivClient):
        self.client = client

    @property
    def name(self) -> str:
        return "liv_app"

    @property
    def description(self) -> str:
        return (
            "Control the Liv desktop app. Actions: "
            "'navigate' to open a page (routes: /pile/:name, /timeline, /auto-journal, "
            "/dashboard, /chat, /search, /kanban, /profile, /settings), "
            "'notify' to show a desktop notification, "
            "'status' to get app status."
        )

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["navigate", "notify", "status"],
                    "description": "Action to perform",
                },
                "route": {
                    "type": "string",
                    "description": "Route to navigate to (for navigate action)",
                },
                "title": {
                    "type": "string",
                    "description": "Notification title (for notify action)",
                },
                "message": {
                    "type": "string",
                    "description": "Notification message (for notify action)",
                },
            },
            "required": ["action"],
        }

    async def execute(self, **kwargs) -> str:
        action = kwargs.get("action", "status")

        if action == "navigate":
            route = kwargs.get("route", "/")
            result = await self.client.post("/app/navigate", {"route": route})
            return _json_result(result)

        elif action == "notify":
            data = {
                "title": kwargs.get("title", "Liv"),
                "message": kwargs.get("message", ""),
            }
            result = await self.client.post("/app/notify", data)
            return _json_result(result)

        elif action == "status":
            result = await self.client.get("/app/status")
            return _json_result(result)

        return f"Unknown action: {action}"


# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

def create_liv_tools(callback_url: str) -> list[Tool]:
    """Create all Liv tools connected to the given callback server URL."""
    client = LivClient(callback_url)
    return [
        LivJournalTool(client),
        LivKanbanTool(client),
        LivMemoryTool(client),
        LivLifeOSTool(client),
        LivProfileTool(client),
        LivRecordingsTool(client),
        LivAppTool(client),
    ]
