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

from config_bridge import get_config, get_provider_api_base, get_channels_config

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

    async def initialize(self):
        """Initialize the agent with config from environment."""
        self.config = get_config()
        workspace = self.config["workspace"]
        workspace.mkdir(parents=True, exist_ok=True)

        # Ensure memory directory exists
        (workspace / "memory").mkdir(parents=True, exist_ok=True)
        (workspace / "sessions").mkdir(parents=True, exist_ok=True)
        (workspace / "skills").mkdir(parents=True, exist_ok=True)

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
        log.info("Agent initialized successfully")

    async def start(self):
        """Start agent loop, cron, and channels in background."""
        if self.agent:
            self.loop_task = asyncio.create_task(self.agent.run())
        if self.cron:
            await self.cron.start()

        # Initialize channel integrations if configured
        await self.start_channels()

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
    """Full status including cron and sessions."""
    cron_status = state.cron.status() if state.cron else {}
    sessions = state.session_manager.list_sessions() if state.session_manager else []
    tools = state.agent.tools.get_definitions() if state.agent else []

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
                },
                "message": j.payload.message,
                "last_run": j.state.last_run_ms,
                "next_run": j.state.next_run_ms,
                "status": j.state.status,
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


@app.delete("/api/cron/jobs/{job_id}")
async def remove_cron_job(job_id: str):
    """Remove a cron job."""
    if not state.cron:
        raise HTTPException(status_code=503, detail="Cron service not available")

    removed = state.cron.remove_job(job_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "removed"}


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
