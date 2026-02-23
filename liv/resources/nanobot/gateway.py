"""
Nanobot HTTP/WebSocket Gateway for Liv.

Wraps the nanobot AgentLoop in a FastAPI server, exposing:
  - POST /api/message    — send a message and get a response
  - GET  /health         — health check
  - GET  /api/status     — agent and cron status
  - WS   /ws/chat        — streaming WebSocket for real-time chat
  - GET  /api/sessions   — list sessions
  - GET  /api/memory     — read MEMORY.md
  - GET  /api/cron/jobs  — list cron jobs
  - POST /api/cron/jobs  — add cron job
  - DELETE /api/cron/jobs/{id} — remove cron job

The Electron main process spawns this as a child process and communicates
via HTTP (request/response) and WebSocket (streaming tokens).
"""

import asyncio
import json
import logging
import os
import signal
import sys
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Add nanobot-ref to path so we can import the nanobot package
NANOBOT_REF = os.environ.get("LIV_NANOBOT_REF", "")
if NANOBOT_REF:
    sys.path.insert(0, NANOBOT_REF)

from nanobot.agent.loop import AgentLoop
from nanobot.bus.queue import MessageBus
from nanobot.providers.litellm_provider import LiteLLMProvider
from nanobot.cron.service import CronService
from nanobot.session.manager import SessionManager

from config_bridge import get_config, get_provider_api_base, get_channels_config, get_composio_config

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=os.environ.get("LIV_LOG_LEVEL", "INFO"),
    format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("liv-gateway")

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class MessageRequest(BaseModel):
    content: str
    session_id: str = "liv:chat"
    channel: str = "liv"
    chat_id: str = "chat"

class MessageResponse(BaseModel):
    content: str
    session_key: str
    tools_used: list[str] = Field(default_factory=list)

class CronJobRequest(BaseModel):
    name: str
    schedule_type: str  # "every", "cron", "at"
    interval: int | None = None  # seconds (for "every")
    expression: str | None = None  # cron expression
    at_timestamp: int | None = None  # epoch ms (for "at")
    message: str = ""
    enabled: bool = True

# ---------------------------------------------------------------------------
# Gateway state
# ---------------------------------------------------------------------------

class GatewayState:
    def __init__(self):
        self.agent: AgentLoop | None = None
        self.bus: MessageBus | None = None
        self.cron: CronService | None = None
        self.session_manager: SessionManager | None = None
        self.channel_manager = None
        self.channel_tasks: list[asyncio.Task] = []
        self.loop_task: asyncio.Task | None = None
        self.config: dict = {}
        self.started_at: float = 0
        self.ready = False
        self.custom_tools: list = []
        self.composio = None  # ComposioBridge instance (if API key set)

    def _ensure_bootstrap_files(self, workspace: Path):
        """Create bootstrap files if they don't exist (AGENTS.md, SOUL.md, USER.md, MEMORY.md)."""
        agents_file = workspace / "AGENTS.md"
        if not agents_file.exists():
            agents_file.write_text("""# Agent Instructions

You are Liv's AI agent — a personal assistant embedded in a journaling and productivity desktop app.

## Guidelines

- Always explain what you're doing before taking actions
- Ask for clarification when the request is ambiguous
- Use tools to help accomplish tasks (recordings, journal, kanban, profile)
- Remember important information in memory/MEMORY.md
- Past events are logged in memory/HISTORY.md — grep it to recall
- Respond in the same language the user writes to you
- Be concise and actionable — the user values efficiency
""", encoding="utf-8")
            log.info("Created AGENTS.md")

        soul_file = workspace / "SOUL.md"
        if not soul_file.exists():
            soul_file.write_text("""# Soul

I am Liv, an AI assistant embedded in a personal journaling and productivity app.

## Personality

- Helpful and proactive
- Concise and to the point
- Observant — I notice patterns in the user's data
- Warm but professional

## Values

- User privacy above all
- Accuracy over speed
- Transparency in actions taken
- Continuous self-improvement through memory
""", encoding="utf-8")
            log.info("Created SOUL.md")

        user_file = workspace / "USER.md"
        if not user_file.exists():
            user_file.write_text("""# User

Information about the user. Update this as you learn more.

## Preferences

- Communication style: (learn from interactions)
- Language: (detect from messages)
- Timezone: (detect from system)

## Context

- Uses Liv for dictation, journaling, and productivity
- Has access to transcription history, auto-journal, kanban, and profile
""", encoding="utf-8")
            log.info("Created USER.md")

        memory_file = workspace / "memory" / "MEMORY.md"
        if not memory_file.exists():
            memory_file.write_text("""# Long-term Memory

This file stores important information that persists across sessions.
I update it automatically as I learn about the user and their patterns.

## User Information

(Important facts about the user)

## Preferences

(User preferences learned over time)

## Important Notes

(Things to remember)
""", encoding="utf-8")
            log.info("Created memory/MEMORY.md")

        history_file = workspace / "memory" / "HISTORY.md"
        if not history_file.exists():
            history_file.write_text("", encoding="utf-8")
            log.info("Created memory/HISTORY.md")

    async def initialize(self):
        """Initialize the agent with config from environment."""
        self.config = get_config()
        workspace = self.config["workspace"]
        workspace.mkdir(parents=True, exist_ok=True)

        # Ensure directory structure exists
        (workspace / "memory").mkdir(parents=True, exist_ok=True)
        (workspace / "sessions").mkdir(parents=True, exist_ok=True)
        (workspace / "skills").mkdir(parents=True, exist_ok=True)

        # Create bootstrap files if they don't exist (equivalent to `nanobot onboard`)
        self._ensure_bootstrap_files(workspace)

        log.info(f"Workspace: {workspace}")
        log.info(f"Model: {self.config['model']}")
        log.info(f"Provider: {self.config['provider']}")

        # Create provider
        api_base = get_provider_api_base(self.config["provider"])
        provider = LiteLLMProvider(
            api_key=self.config["api_key"],
            api_base=api_base,
            default_model=self.config["model"],
            provider_name=self.config["provider"],
        )

        # Create bus and session manager
        self.bus = MessageBus()
        self.session_manager = SessionManager(workspace)

        # Create cron service
        cron_store = workspace / "jobs.json"

        # Copy default jobs if no jobs.json exists
        default_jobs = Path(__file__).parent / "jobs.json"
        if not cron_store.exists() and default_jobs.exists():
            import shutil
            shutil.copy2(default_jobs, cron_store)
            log.info("Copied default cron jobs to workspace")

        async def on_cron_job(job) -> str | None:
            """Handle cron job execution by sending message to agent."""
            if not self.agent:
                return None
            try:
                response = await self.agent.process_direct(
                    content=job.payload.message,
                    session_key="liv:cron",
                    channel="liv",
                    chat_id="cron",
                )
                return response
            except Exception as e:
                log.error(f"Cron job error: {e}")
                return f"Error: {e}"

        self.cron = CronService(
            store_path=cron_store,
            on_job=on_cron_job,
        )

        # Create agent
        self.agent = AgentLoop(
            bus=self.bus,
            provider=provider,
            workspace=workspace,
            model=self.config["model"],
            max_iterations=self.config["max_iterations"],
            temperature=self.config["temperature"],
            max_tokens=self.config["max_tokens"],
            memory_window=self.config["memory_window"],
            cron_service=self.cron,
            session_manager=self.session_manager,
            restrict_to_workspace=False,
        )

        # Register any custom tools (Liv tools added externally)
        for tool in self.custom_tools:
            self.agent.tools.register(tool)

        self.started_at = time.time()

        # Initialize Composio bridge if API key available
        composio_cfg = get_composio_config()
        if composio_cfg.get("api_key"):
            try:
                from composio_bridge import ComposioBridge
                self.composio = ComposioBridge(composio_cfg["api_key"])
                log.info("Composio bridge initialized")
            except Exception as e:
                log.error(f"Failed to initialize Composio bridge: {e}")

        log.info("Agent initialized successfully")

    async def start(self):
        """Start agent loop, cron, and channels in background."""
        if self.agent:
            self.loop_task = asyncio.create_task(self.agent.run())
        if self.cron:
            await self.cron.start()

        # Initialize channel integrations if configured
        await self.start_channels()

        # Auto-register Composio tools for previously connected apps
        if self.composio and self.agent:
            try:
                connections = await self.composio.list_connections()
                for conn in connections:
                    if conn.get("status") == "ACTIVE":
                        app_name = conn.get("appName", "")
                        if app_name:
                            self.composio._connected_apps[app_name] = conn["id"]
                            count = await self.composio.register_app_tools(app_name, self.agent.tools)
                            log.info(f"Auto-registered {count} Composio tools for {app_name}")
            except Exception as e:
                log.error(f"Failed to auto-register Composio tools: {e}")

        self.ready = True
        log.info("Gateway ready")

    async def start_channels(self):
        """Start enabled channel integrations (Telegram, Slack, etc.)."""
        channels_cfg = get_channels_config()
        if not channels_cfg:
            return

        try:
            from nanobot.channels.manager import ChannelManager
            self.channel_manager = ChannelManager(
                agent=self.agent,
                config=channels_cfg,
            )
            self.channel_tasks = await self.channel_manager.start_all()
            enabled = list(channels_cfg.keys())
            log.info(f"Started channels: {', '.join(enabled)}")
        except ImportError:
            log.warning("Channel manager not available in nanobot-ref, skipping channel integrations")
        except Exception as e:
            log.error(f"Failed to start channels: {e}")

    async def stop(self):
        """Gracefully stop agent, cron, and channels."""
        self.ready = False
        # Stop channels first
        if self.channel_manager:
            try:
                await self.channel_manager.stop_all()
            except Exception as e:
                log.error(f"Error stopping channels: {e}")
        for task in self.channel_tasks:
            task.cancel()
        self.channel_tasks.clear()
        if self.cron:
            self.cron.stop()
        if self.agent:
            self.agent.stop()
            if self.loop_task:
                try:
                    await asyncio.wait_for(self.loop_task, timeout=5.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass
            await self.agent.close_mcp()
        if self.composio:
            await self.composio.close()
        log.info("Gateway stopped")


state = GatewayState()

# ---------------------------------------------------------------------------
# Register Liv tools (imported lazily to avoid circular deps)
# ---------------------------------------------------------------------------

def register_liv_tools():
    """Register Liv-specific tools with the agent."""
    callback_port = state.config.get("callback_port", 0)
    if not callback_port:
        log.warning("No LIV_CALLBACK_PORT set, Liv tools won't be available")
        return

    try:
        from tools.liv_tools import create_liv_tools
        tools = create_liv_tools(f"http://127.0.0.1:{callback_port}")
        for tool in tools:
            if state.agent:
                state.agent.tools.register(tool)
            else:
                state.custom_tools.append(tool)
        log.info(f"Registered {len(tools)} Liv tools")
    except ImportError as e:
        log.warning(f"Could not import Liv tools: {e}")
    except Exception as e:
        log.error(f"Error registering Liv tools: {e}")

# ---------------------------------------------------------------------------
# Copy default skills to workspace
# ---------------------------------------------------------------------------

def copy_default_skills():
    """Copy default skill files to workspace if they don't exist."""
    workspace = state.config["workspace"]
    skills_src = Path(__file__).parent / "skills"
    skills_dst = workspace / "skills"

    if not skills_src.exists():
        return

    for skill_dir in skills_src.iterdir():
        if skill_dir.is_dir():
            dst_dir = skills_dst / skill_dir.name
            if not dst_dir.exists():
                import shutil
                shutil.copytree(skill_dir, dst_dir)
                log.info(f"Copied skill: {skill_dir.name}")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    await state.initialize()
    copy_default_skills()
    register_liv_tools()
    await state.start()
    yield
    await state.stop()

app = FastAPI(title="Liv Nanobot Gateway", lifespan=lifespan)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok" if state.ready else "starting",
        "uptime": round(time.time() - state.started_at, 1) if state.started_at else 0,
        "model": state.config.get("model", ""),
    }


@app.get("/api/status")
async def get_status():
    """Full status including cron, sessions, and subagents."""
    cron_status = state.cron.status() if state.cron else {}
    sessions = state.session_manager.list_sessions() if state.session_manager else []
    tools = state.agent.tools.get_definitions() if state.agent else []

    # Subagent info
    subagents_count = 0
    subagents_running = []
    if state.agent and hasattr(state.agent, "subagents") and state.agent.subagents:
        mgr = state.agent.subagents
        subagents_count = mgr.get_running_count()
        # Extract running task info
        for task_id, task in list(mgr._running_tasks.items()):
            subagents_running.append({
                "id": task_id,
                "done": task.done(),
                "cancelled": task.cancelled(),
            })

    return {
        "ready": state.ready,
        "uptime": round(time.time() - state.started_at, 1) if state.started_at else 0,
        "model": state.config.get("model", ""),
        "provider": state.config.get("provider", ""),
        "workspace": str(state.config.get("workspace", "")),
        "sessions_count": len(sessions),
        "tools_count": len(tools),
        "tool_names": [t.get("function", {}).get("name", "") for t in tools],
        "cron": cron_status,
        "subagents_count": subagents_count,
        "subagents": subagents_running,
    }


@app.post("/api/message", response_model=MessageResponse)
async def send_message(req: MessageRequest):
    """Send a message to the agent and get a response."""
    if not state.agent or not state.ready:
        raise HTTPException(status_code=503, detail="Agent not ready")

    try:
        session_key = req.session_id or f"{req.channel}:{req.chat_id}"
        response_text = await state.agent.process_direct(
            content=req.content,
            session_key=session_key,
            channel=req.channel,
            chat_id=req.chat_id,
        )
        return MessageResponse(
            content=response_text or "",
            session_key=session_key,
        )
    except Exception as e:
        log.error(f"Message processing error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/chat")
async def ws_chat(ws: WebSocket):
    """WebSocket endpoint for streaming chat.

    Inbound:  { "type": "user_message", "content": "...", "session_id": "..." }
    Outbound: { "type": "token"|"tool_call"|"tool_result"|"done"|"error", "data": ... }
    """
    await ws.accept()
    log.info("WebSocket client connected")

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "data": {"message": "Invalid JSON"}})
                continue

            if msg.get("type") != "user_message":
                await ws.send_json({"type": "error", "data": {"message": f"Unknown type: {msg.get('type')}"}})
                continue

            content = msg.get("content", "")
            session_id = msg.get("session_id", "liv:chat")

            if not content.strip():
                await ws.send_json({"type": "error", "data": {"message": "Empty content"}})
                continue

            if not state.agent or not state.ready:
                await ws.send_json({"type": "error", "data": {"message": "Agent not ready"}})
                continue

            # Streaming callback
            tools_used = []

            async def on_progress(text: str):
                try:
                    await ws.send_json({"type": "token", "data": text})
                except Exception:
                    pass  # Client may have disconnected

            try:
                response = await state.agent.process_direct(
                    content=content,
                    session_key=session_id,
                    channel="liv",
                    chat_id="chat",
                    on_progress=on_progress,
                )

                await ws.send_json({
                    "type": "done",
                    "data": {
                        "content": response or "",
                        "tools_used": tools_used,
                    },
                })
            except Exception as e:
                log.error(f"WS message error: {e}")
                await ws.send_json({"type": "error", "data": {"message": str(e)}})

    except WebSocketDisconnect:
        log.info("WebSocket client disconnected")
    except Exception as e:
        log.error(f"WebSocket error: {e}")


# --- Session endpoints ---

@app.get("/api/sessions")
async def list_sessions():
    """List all chat sessions."""
    if not state.session_manager:
        return {"sessions": []}
    return {"sessions": state.session_manager.list_sessions()}


@app.get("/api/sessions/{session_key:path}")
async def get_session(session_key: str):
    """Get a specific session's messages."""
    if not state.session_manager:
        raise HTTPException(status_code=503, detail="Session manager not ready")
    session = state.session_manager.get_or_create(session_key)
    messages = []
    for msg in session.messages:
        messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
            "timestamp": msg.get("timestamp", ""),
        })
    return {
        "key": session.key,
        "created_at": session.created_at.isoformat() if hasattr(session.created_at, "isoformat") else str(session.created_at),
        "updated_at": session.updated_at.isoformat() if hasattr(session.updated_at, "isoformat") else str(session.updated_at),
        "messages": messages,
    }


# --- Bootstrap files (AGENTS.md, SOUL.md, USER.md) ---

BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md"]

@app.get("/api/bootstrap")
async def list_bootstrap_files():
    """List bootstrap files with their content."""
    workspace = state.config.get("workspace", Path("."))
    files = {}
    for filename in BOOTSTRAP_FILES:
        file_path = workspace / filename
        if file_path.exists():
            files[filename] = file_path.read_text(encoding="utf-8")
        else:
            files[filename] = ""
    return {"files": files}


@app.get("/api/bootstrap/{filename}")
async def get_bootstrap_file(filename: str):
    """Read a specific bootstrap file."""
    if filename not in BOOTSTRAP_FILES:
        raise HTTPException(status_code=400, detail=f"Invalid file: {filename}")
    workspace = state.config.get("workspace", Path("."))
    file_path = workspace / filename
    if file_path.exists():
        return {"filename": filename, "content": file_path.read_text(encoding="utf-8")}
    return {"filename": filename, "content": ""}


class BootstrapUpdateRequest(BaseModel):
    content: str


@app.put("/api/bootstrap/{filename}")
async def update_bootstrap_file(filename: str, body: BootstrapUpdateRequest):
    """Update a bootstrap file."""
    if filename not in BOOTSTRAP_FILES:
        raise HTTPException(status_code=400, detail=f"Invalid file: {filename}")
    workspace = state.config.get("workspace", Path("."))
    file_path = workspace / filename
    file_path.write_text(body.content, encoding="utf-8")
    return {"filename": filename, "status": "ok"}


# --- Memory endpoints ---

@app.get("/api/memory")
async def get_memory():
    """Read the agent's MEMORY.md file."""
    workspace = state.config.get("workspace", Path("."))
    memory_file = workspace / "memory" / "MEMORY.md"
    if memory_file.exists():
        return {"content": memory_file.read_text(encoding="utf-8")}
    return {"content": ""}


@app.delete("/api/memory")
async def reset_memory():
    """Reset the agent's memory (clear MEMORY.md)."""
    workspace = state.config.get("workspace", Path("."))
    memory_file = workspace / "memory" / "MEMORY.md"
    if memory_file.exists():
        memory_file.write_text("", encoding="utf-8")
    return {"status": "ok"}


# --- Cron endpoints ---

@app.get("/api/cron/jobs")
async def list_cron_jobs():
    """List all cron jobs."""
    if not state.cron:
        return {"jobs": []}
    jobs = state.cron.list_jobs(include_disabled=True)
    return {
        "jobs": [
            {
                "id": j.id,
                "name": j.name,
                "enabled": j.enabled,
                "schedule": {
                    "type": j.schedule.kind,
                    "interval": (j.schedule.every_ms // 1000) if j.schedule.every_ms else None,
                    "expression": j.schedule.expr,
                    "tz": j.schedule.tz,
                },
                "message": j.payload.message,
                "last_run": getattr(j.state, "last_run_at_ms", None),
                "next_run": getattr(j.state, "next_run_at_ms", None),
                "status": getattr(j.state, "last_status", None),
                "last_error": getattr(j.state, "last_error", None),
                "created_at": getattr(j, "created_at_ms", None),
            }
            for j in jobs
        ]
    }


@app.post("/api/cron/jobs")
async def add_cron_job(req: CronJobRequest):
    """Add a new cron job."""
    if not state.cron:
        raise HTTPException(status_code=503, detail="Cron service not available")

    schedule_kwargs = {}
    if req.schedule_type == "every" and req.interval:
        schedule_kwargs = {"kind": "every", "every_ms": req.interval * 1000}
    elif req.schedule_type == "cron" and req.expression:
        schedule_kwargs = {"kind": "cron", "expr": req.expression}
    elif req.schedule_type == "at" and req.at_timestamp:
        schedule_kwargs = {"kind": "at", "at_ms": req.at_timestamp}
    else:
        raise HTTPException(status_code=400, detail="Invalid schedule configuration")

    from nanobot.cron.service import CronSchedule
    schedule = CronSchedule(**schedule_kwargs)

    job = state.cron.add_job(
        name=req.name,
        schedule=schedule,
        message=req.message,
        enabled=req.enabled,
    )
    return {"id": job.id, "name": job.name, "status": "created"}


@app.patch("/api/cron/jobs/{job_id}")
async def toggle_cron_job(job_id: str):
    """Enable or disable a cron job (toggles current state)."""
    if not state.cron:
        raise HTTPException(status_code=503, detail="Cron service not available")

    # Find current state
    jobs = state.cron.list_jobs(include_disabled=True)
    target = next((j for j in jobs if j.id == job_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Job not found")

    updated = state.cron.enable_job(job_id, enabled=not target.enabled)
    if not updated:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"id": updated.id, "enabled": updated.enabled, "status": "toggled"}


@app.delete("/api/cron/jobs/{job_id}")
async def remove_cron_job(job_id: str):
    """Remove a cron job."""
    if not state.cron:
        raise HTTPException(status_code=503, detail="Cron service not available")

    removed = state.cron.remove_job(job_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "removed"}


# --- Subagent endpoints ---

@app.get("/api/agents")
async def list_subagents():
    """List running subagents."""
    if not state.agent or not hasattr(state.agent, "subagents") or not state.agent.subagents:
        return {"agents": [], "count": 0}

    mgr = state.agent.subagents
    agents = []
    for task_id, task in list(mgr._running_tasks.items()):
        agents.append({
            "id": task_id,
            "done": task.done(),
            "cancelled": task.cancelled(),
        })
    return {"agents": agents, "count": len(agents)}


# --- Composio Integration endpoints ---

class ComposioConnectRequest(BaseModel):
    app_name: str
    redirect_url: str | None = None
    integration_id: str | None = None

class ComposioToolRequest(BaseModel):
    app_name: str
    selected_actions: list[str] | None = None


@app.get("/api/composio/status")
async def composio_status():
    """Check Composio API key validity and list connected apps."""
    if not state.composio:
        return {"connected": False, "apps": [], "total_connections": 0, "active_connections": 0}
    return await state.composio.get_status()


@app.get("/api/composio/apps")
async def composio_apps():
    """List available apps from Composio."""
    if not state.composio:
        raise HTTPException(status_code=503, detail="Composio not configured")
    apps = await state.composio.list_apps()
    return {"apps": apps}


@app.get("/api/composio/apps/{name}/actions")
async def composio_app_actions(name: str):
    """Get actions available for an app."""
    if not state.composio:
        raise HTTPException(status_code=503, detail="Composio not configured")
    actions = await state.composio.get_app_actions(name)
    return {"actions": actions}


@app.post("/api/composio/connect")
async def composio_connect(req: ComposioConnectRequest):
    """Initiate an OAuth connection for an app."""
    if not state.composio:
        raise HTTPException(status_code=503, detail="Composio not configured")
    result = await state.composio.initiate_connection(
        app_name=req.app_name,
        integration_id=req.integration_id,
        redirect_url=req.redirect_url,
    )
    return result


@app.get("/api/composio/connections")
async def composio_connections():
    """List all Composio connections."""
    if not state.composio:
        return {"connections": []}
    connections = await state.composio.list_connections()
    return {"connections": connections}


@app.get("/api/composio/connections/{connection_id}")
async def composio_connection_status(connection_id: str):
    """Check status of a specific connection (for polling after OAuth)."""
    if not state.composio:
        raise HTTPException(status_code=503, detail="Composio not configured")
    return await state.composio.check_connection(connection_id)


@app.delete("/api/composio/connections/{connection_id}")
async def composio_disconnect(connection_id: str):
    """Disconnect (delete) a connected account."""
    if not state.composio:
        raise HTTPException(status_code=503, detail="Composio not configured")

    # Find app name for this connection to unregister tools
    conn = await state.composio.check_connection(connection_id)
    app_name = conn.get("appName", "")

    ok = await state.composio.disconnect(connection_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to disconnect")

    # Unregister tools for this app
    if app_name and state.agent:
        await state.composio.unregister_app_tools(app_name, state.agent.tools)

    return {"status": "disconnected"}


@app.post("/api/composio/tools/register")
async def composio_register_tools(req: ComposioToolRequest):
    """Register tools for a connected app into the agent's ToolRegistry."""
    if not state.composio:
        raise HTTPException(status_code=503, detail="Composio not configured")
    if not state.agent:
        raise HTTPException(status_code=503, detail="Agent not ready")

    # Store connected account ID for execution
    connections = await state.composio.list_connections()
    for conn in connections:
        if conn.get("appName") == req.app_name and conn.get("status") == "ACTIVE":
            state.composio._connected_apps[req.app_name] = conn["id"]
            break

    if req.selected_actions:
        count = await state.composio.register_selected_app_tools(
            req.app_name, req.selected_actions, state.agent.tools
        )
    else:
        count = await state.composio.register_app_tools(req.app_name, state.agent.tools)
    return {"count": count, "app_name": req.app_name}


@app.post("/api/composio/tools/unregister")
async def composio_unregister_tools(req: ComposioToolRequest):
    """Remove tools for an app from the agent's ToolRegistry."""
    if not state.composio:
        raise HTTPException(status_code=503, detail="Composio not configured")
    if not state.agent:
        raise HTTPException(status_code=503, detail="Agent not ready")

    await state.composio.unregister_app_tools(req.app_name, state.agent.tools)
    return {"status": "unregistered", "app_name": req.app_name}


@app.get("/api/composio/tools")
async def composio_tools():
    """List all registered Composio tools grouped by app."""
    if not state.composio:
        return {"tools_by_app": {}, "total": 0}
    return {
        "tools_by_app": state.composio.get_registered_tools_by_app(),
        "total": state.composio.get_registered_tools_count(),
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("LIV_GATEWAY_PORT", "18790"))
    log.info(f"Starting Liv Nanobot Gateway on port {port}")

    # Handle SIGTERM for graceful shutdown
    def handle_sigterm(signum, frame):
        log.info("Received SIGTERM, shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sigterm)

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False,
    )
