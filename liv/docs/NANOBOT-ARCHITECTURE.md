# Nanobot Agent — Architecture

> Last updated: 2026-02-22

## Overview

The nanobot agent is an autonomous AI assistant embedded in the Liv desktop app. It runs as a Python (FastAPI) child process spawned by the Electron main process, with bidirectional HTTP + WebSocket communication.

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer (React)                      │
│                                                          │
│  useChat hook ──── AIContext ──── Settings UI             │
│       │                │           │        │           │
└───────┼────────────────┼───────────┼────────┼───────────┘
        │ tipcClient     │ tipcClient│        │ tipcClient
        ▼                ▼           ▼        ▼
┌─────────────────────────────────────────────────────────┐
│                 Electron Main Process                    │
│                                                          │
│  tipc.ts ─────── Runtime Service ─────── Bridge Service  │
│     │                   │                     │          │
│     │            Callback Server         spawn python    │
│     │            (HTTP :random)           (:gateway)     │
│     │                   │                     │          │
└─────┼───────────────────┼─────────────────────┼──────────┘
      │                   │                     │
      │                   ▼                     ▼
      │    ┌──────────────────────────────────────────┐
      │    │         Python Gateway (FastAPI)          │
      │    │                                           │
      │    │  AgentLoop ── ToolRegistry ── CronService │
      │    │      │             │    │        │       │
      │    │  SubagentMgr   Liv Tools │    jobs.json  │
      │    │                    │     │                │
      │    │              LivClient  ComposioBridge    │
      │    │                    │         │            │
      │    └────────────────────┼─────────┼────────────┘
      │                         │         │
      │              HTTP back  │         │ Composio REST API
      │                         ▼         ▼
      │              ┌──────────────┐  ┌──────────────────┐
      └──────────────│  Callback    │  │ Composio Cloud   │
                     │  Server      │  │ (OAuth, actions)  │
                     │  (Electron)  │  └──────────────────┘
                     └──────────────┘
```

---

## 1. Process Lifecycle

### Startup

```
1. User enables agent (Settings → Agent toggle)
   ↓
2. configStore.set({ nanobotEnabled: true })
   ↓
3. startNanobotRuntime()           [nanobot-runtime-service.ts]
   ├── startNanobotCallbackServer()    → binds 127.0.0.1:0, returns port
   └── nanobotBridge.start(callbackPort)
       ├── findPython()                → venv > python3.12 > python3.11 > python3
       ├── ensureDependencies()        → pip install requirements.txt + nanobot-ref
       ├── buildEnv()                  → reads config, builds env vars
       │   ├── AI config (provider, model, API key from safeStorage)
       │   ├── Channel tokens (Telegram, Slack, etc.)
       │   └── LIV_COMPOSIO_API_KEY (from safeStorage, if set)
       ├── findFreePort()              → or uses fixed nanobotGatewayPort
       └── spawn("python3 gateway.py") → child process
           ├── polls GET /health every 500ms (max 60s)
           ├── on "ok" → status = "connected"
           ├── initClients(port)       → HTTP + WS client singletons
           └── emits "ready" event
```

### Shutdown

```
stopNanobotRuntime()
├── destroyClients()           → close WS, null HTTP
├── nanobotBridge.stop()       → SIGTERM → 5s → SIGKILL
└── stopNanobotCallbackServer()
```

### Auto-restart

- Exponential backoff: 1s → 2s → 4s → ... → 30s max
- Max 5 attempts, then gives up with `state: "error"`
- Memory watchdog: restarts if RSS > 512MB
- Counter resets on manual restart

---

## 2. Communication Channels

### 2.1 Renderer → Main (TIPC)

IPC procedures in `tipc.ts`:

| Procedure | Input | Returns |
|-----------|-------|---------|
| `getNanobotStatus` | — | `{ state, port, uptime, error }` |
| `startNanobot` | — | status |
| `stopNanobot` | — | status |
| `restartNanobot` | — | status |
| `sendNanobotMessage` | `{ content, sessionId? }` | `{ content, sessionKey, toolsUsed[] }` |
| `getNanobotMemory` | — | `string` |
| `resetNanobotMemory` | — | — |
| `getNanobotBootstrapFiles` | — | `Record<string, string>` |
| `updateNanobotBootstrapFile` | `{ filename, content }` | — |
| `getNanobotSessions` | — | `Session[]` |
| `getNanobotSessionMessages` | `{ sessionKey }` | `{ key, messages[] }` |
| `getNanobotCronJobs` | — | `CronJob[]` |
| `toggleNanobotCronJob` | `{ jobId }` | `{ id, enabled }` |
| `getNanobotSubagents` | — | `{ agents[], count }` |
| `getNanobotToolsAndSkills` | — | `{ tools[], skills[] }` |

**Composio TIPC** (see section 12):

| Procedure | Input | Returns |
|-----------|-------|---------|
| `setComposioApiKey` | `{ key }` | `{ saved, hasKey }` |
| `getComposioApiKeyStatus` | — | `{ hasKey }` |
| `deleteComposioApiKey` | — | `{ deleted }` |
| `getComposioStatus` | — | `{ connected, apps[], total_connections, active_connections }` |
| `getComposioApps` | — | `Array<{ name, display_name, description, logo, categories }>` |
| `getComposioAppActions` | `{ appName }` | `Array<{ name, display_name, description }>` |
| `initiateComposioConnection` | `{ appName }` | `{ url, connectionId }` |
| `getComposioConnectionStatus` | `{ connectionId }` | `{ id, status, appName }` |
| `listComposioConnections` | — | `Array<{ id, appName, status }>` |
| `disconnectComposioApp` | `{ connectionId }` | — |
| `registerComposioTools` | `{ appName }` | `{ count }` |
| `unregisterComposioTools` | `{ appName }` | — |
| `getComposioTools` | — | `{ tools_by_app, total }` |

### 2.2 Main → Gateway (HTTP + WebSocket)

**HTTP Client** (`NanobotHttpClient`):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `sendMessage()` | `POST /api/message` | Send chat message |
| `health()` | `GET /health` | Health check |
| `getStatus()` | `GET /api/status` | Full status + tools + cron + subagents |
| `getMemory()` | `GET /api/memory` | Read MEMORY.md |
| `resetMemory()` | `DELETE /api/memory` | Clear MEMORY.md |
| `listCronJobs()` | `GET /api/cron/jobs` | List all jobs |
| `toggleCronJob()` | `PATCH /api/cron/jobs/{id}` | Enable/disable job |
| `removeCronJob()` | `DELETE /api/cron/jobs/{id}` | Delete job |
| `listSubagents()` | `GET /api/agents` | List running subagents |
| `listSessions()` | `GET /api/sessions` | List all sessions |
| `getSessionMessages()` | `GET /api/sessions/{key}` | Get session messages |
| `getBootstrapFiles()` | `GET /api/bootstrap` | Read identity files |
| `updateBootstrapFile()` | `PUT /api/bootstrap/{file}` | Edit identity file |
| `getComposioStatus()` | `GET /api/composio/status` | Composio connection status |
| `getComposioApps()` | `GET /api/composio/apps` | List available Composio apps |
| `getComposioAppActions()` | `GET /api/composio/apps/{name}/actions` | App action list |
| `initiateComposioConnection()` | `POST /api/composio/connect` | Start OAuth flow |
| `listComposioConnections()` | `GET /api/composio/connections` | All connections |
| `getComposioConnectionStatus()` | `GET /api/composio/connections/{id}` | Poll one connection |
| `disconnectComposioApp()` | `DELETE /api/composio/connections/{id}` | Delete connection |
| `registerComposioTools()` | `POST /api/composio/tools/register` | Register tools for app |
| `unregisterComposioTools()` | `POST /api/composio/tools/unregister` | Remove tools for app |
| `getComposioTools()` | `GET /api/composio/tools` | List registered tools |

**WebSocket** (`NanobotWsClient`):

```
ws://127.0.0.1:{port}/ws/chat

Inbound:  { type: "user_message", content: string, session_id: string }
Outbound: { type: "token", data: string }             ← streaming tokens
        | { type: "tool_call", data: { name, args } }
        | { type: "tool_result", data: { name, result } }
        | { type: "done", data: { content, tools_used[] } }
        | { type: "error", data: { message } }
```

### 2.3 Gateway → Callback Server (HTTP)

The Python agent calls back into Electron via `LivClient`:

```
Python Tool → LivClient → HTTP → nanobot-callback-server.ts → Liv Service
```

All traffic is `127.0.0.1` only (never external).

---

## 3. Gateway Internals

### 3.1 GatewayState

```python
class GatewayState:
    agent: AgentLoop          # Core AI processing
    bus: MessageBus           # Inbound/outbound message routing
    cron: CronService         # Job scheduler
    session_manager           # Conversation history persistence
    channel_manager           # Telegram/Slack/Discord/etc.
    composio: ComposioBridge  # Composio external integrations (if API key set)
    config: dict              # From environment variables
```

### 3.2 Initialization Flow

```python
@asynccontextmanager
async def lifespan(app):
    await state.initialize()      # Config, provider, bus, cron, agent, composio bridge
    copy_default_skills()         # skills/ → workspace/skills/
    register_liv_tools()          # 7 Liv tools via callback URL
    await state.start()           # Agent loop + cron + channels + composio auto-register
    yield
    await state.stop()            # Graceful shutdown (including composio.close())
```

### 3.3 Config Bridge

`config_bridge.py` reads environment variables set by `buildEnv()`:

```python
get_config() → {
    api_key:        LIV_API_KEY
    model:          LIV_MODEL          # default: anthropic/claude-sonnet-4-20250514
    provider:       LIV_PROVIDER
    workspace:      LIV_WORKSPACE      # ~/Documents/Liv/Piles/{pile}/nanobot/
    callback_port:  LIV_CALLBACK_PORT
    temperature:    LIV_TEMPERATURE    # default: 0.7
    max_tokens:     LIV_MAX_TOKENS     # default: 8192
    max_iterations: LIV_MAX_ITERATIONS # default: 20
    memory_window:  LIV_MEMORY_WINDOW  # default: 50
}

get_channels_config() → {
    telegram:  { enabled, token }
    whatsapp:  { enabled, bridge_url, bridge_token }
    slack:     { enabled, bot_token, app_token }
    discord:   { enabled, token }
    email:     { enabled, imap_*, smtp_* }
}

get_composio_config() → {
    api_key:   LIV_COMPOSIO_API_KEY    # from safeStorage via env var
}
```

---

## 4. Agent Loop (nanobot-ref)

### 4.1 Processing Pipeline

```
Message arrives (HTTP or WS or cron or system)
 ↓
SessionManager.get_or_create(session_key)
 ↓
 ContextBuilder.build_messages(history, current_message, skills)
  ├── System prompt (identity, date, workspace)
  ├── MEMORY.md (long-term)
  ├── SKILL.md files (behavioral guidelines)
  └── Session history (last N messages)
 ↓
Provider.chat(messages, tools, model, temperature, max_tokens)
  → LiteLLM → Anthropic/OpenRouter/Groq/OpenAI
 ↓
Parse response
  ├── Text only → return as final response
  └── Tool calls → execute each, append results, loop (max N iterations)
 ↓
Save to session history
 ↓
Return response
```

### 4.2 Tool Registry

All tools registered in `AgentLoop.__init__()`:

```
Built-in (nanobot-ref):          Liv-specific:              Composio (dynamic):
├── read_file                    ├── liv_journal             ├── composio_gmail_*
├── write_file                   ├── liv_kanban              ├── composio_slack_*
├── edit_file                    ├── liv_memory              ├── composio_github_*
├── list_dir                     ├── liv_life_os             ├── composio_gcalendar_*
├── exec (shell)                 ├── liv_profile             └── (auto-registered per app)
├── web_search (Brave)           ├── liv_recordings
├── web_fetch                    └── liv_app
├── message (outbound)
├── spawn (subagents)
└── cron (scheduler)
```

### 4.3 Subagent System

```
Main Agent → spawn(task, label)
 ↓
SubagentManager.spawn()
 ├── task_id = uuid[:8]
 ├── asyncio.create_task(_run_subagent)
 └── _running_tasks[task_id] = task
 ↓
_run_subagent()                         ← Runs in background
 ├── Build restricted tool set (NO spawn, NO message)
 ├── Agent loop (max 15 iterations)
 └── _announce_result()
      ├── InboundMessage(channel="system", sender_id="subagent")
      └── bus.publish_inbound(msg) → Main agent processes result
```

**Properties**:
- In-process (asyncio tasks, not separate processes)
- Cannot spawn sub-sub-agents (no spawn tool)
- Cannot message users directly (no message tool)
- Results auto-announced to main agent via message bus
- Auto-cleanup from `_running_tasks` when done

### 4.4 Cron System

```
CronService
 ├── store: jobs.json (persistent)
 ├── timer: asyncio (rearms after each wake)
 └── on_job callback → agent.process_direct()
```

**Schedule types**:
- `every`: Interval in milliseconds (`every_ms: 3600000` = 1 hour)
- `cron`: Cron expression with timezone (`expr: "0 22 * * *"`, `tz: "America/Sao_Paulo"`)
- `at`: One-time timestamp (`at_ms: 1708866400000`, auto-deletes after run)

**Job lifecycle**:
```
add_job() → compute next_run → save → arm timer
timer fires → _on_timer() → _execute_job()
  ├── on_job(job) → agent.process_direct(message)
  ├── update state (last_run, last_status)
  ├── compute next next_run
  └── save → rearm timer
```

**Default Jobs** (copied from `jobs.json` on first run):

| Job | Schedule | Purpose |
|-----|----------|---------|
| `auto-journal-hourly` | Every 1h | Trigger auto-journal, update kanban, write memory |
| `daily-review` | 22:00 daily | Consolidate journal + kanban, identify next priorities |
| `weekly-life-analysis` | Sunday 20:00 | Refresh life OS analysis, review dimensions/goals |
| `profile-refresh` | Every 4h | Update profile insights, detect focus risks |

---

## 5. Callback Server Endpoints

The callback server runs in Electron main process and gives the Python agent access to all Liv services:

### Journal

| Method | Path | Service | Action |
|--------|------|---------|--------|
| GET | `/journal/entries` | auto-journal-service | List runs (query: `limit`, `from`, `to`) |
| POST | `/journal/trigger` | auto-journal-service | Run now (body: `windowMinutes`) |
| GET | `/journal/status` | auto-journal-service | Scheduler status |
| DELETE | `/journal/entries/{id}` | auto-journal-service | Delete run |

### Kanban

| Method | Path | Service | Action |
|--------|------|---------|--------|
| GET | `/kanban/board` | autonomous-kanban-service | Full board |
| POST | `/kanban/card` | autonomous-kanban-service | Create card |
| PUT | `/kanban/card/{id}` | autonomous-kanban-service | Update card |
| DELETE | `/kanban/card/{id}` | autonomous-kanban-service | Delete card |
| POST | `/kanban/move/{id}` | autonomous-kanban-service | Move card |

### Memory

| Method | Path | Service | Action |
|--------|------|---------|--------|
| GET/POST | `/memory/search` | autonomous-memory-service | Vector search |
| POST | `/memory/write` | autonomous-memory-service | Add content |

### Life OS

| Method | Path | Service | Action |
|--------|------|---------|--------|
| GET | `/life/context` | autonomous-life-service | Telos context |
| PUT | `/life/context` | autonomous-life-service | Update context |
| GET | `/life/analysis` | autonomous-life-service | Current analysis |
| POST | `/life/analysis/refresh` | autonomous-life-service | Regenerate |

### Profile

| Method | Path | Service | Action |
|--------|------|---------|--------|
| GET | `/profile/board` | autonomous-profile-service | Profile insights |
| POST | `/profile/refresh` | autonomous-profile-service | Regenerate |

### Recordings

| Method | Path | Service | Action |
|--------|------|---------|--------|
| GET | `/recordings` | history-store | List (query: `limit`, `from`, `to`) |
| POST | `/recordings/search` | history-analytics | Text/tag/date search |
| PUT | `/recordings/{id}` | history-store | Update metadata |
| DELETE | `/recordings/{id}` | history-store | Delete recording |

### App Control

| Method | Path | Action |
|--------|------|--------|
| POST | `/app/navigate` | Navigate to route (body: `route`) |
| POST | `/app/notify` | Desktop notification (body: `title`, `message`) |
| GET | `/app/status` | App status + config |

---

## 6. Skills

Skills are behavioral guidelines loaded as `SKILL.md` files from `workspace/skills/`. They are injected into the system prompt as context.

| Skill | Purpose | Tools Used |
|-------|---------|------------|
| **liv-journaling** | Reflection tone, connect activities, suggest topics | `liv_journal`, `liv_memory`, `liv_recordings` |
| **liv-memory** | When/what to consolidate in MEMORY.md, structure | `liv_memory` |
| **liv-navigator** | Route navigation, notification guidelines | `liv_app` |
| **liv-life-os** | Telos framework: dimensions, goals, principles, reviews | `liv_life_os` |
| **liv-productivity** | Analytics: deep work ratio, context switches, peak hours | `liv_journal`, `liv_kanban` |

Skills can be created at runtime. The agent has a built-in `skill-creator` from nanobot-ref that generates new `SKILL.md` files via chat.

---

## 6.5. Identity & Self-Improvement

The agent's personality, behavior, and knowledge are defined by **bootstrap files** in the workspace. These are loaded into the system prompt at every turn by the `ContextBuilder`.

### Bootstrap Files

| File | Purpose | Editable by agent? |
|------|---------|-------------------|
| `SOUL.md` | Personality, values, communication style | Yes |
| `AGENTS.md` | Behavior instructions, tool usage guidelines | Yes |
| `USER.md` | User profile, preferences, context | Yes |
| `IDENTITY.md` | Optional custom identity override | Yes |
| `memory/MEMORY.md` | Long-term facts (auto-consolidated) | Yes (automatic) |
| `memory/HISTORY.md` | Chronological event log (append-only) | Yes (automatic) |

### How It Works

```
Every LLM call:
  ContextBuilder.build_system_prompt()
    ├── Core identity (time, runtime, workspace path)
    ├── AGENTS.md content
    ├── SOUL.md content
    ├── USER.md content
    ├── IDENTITY.md content (if exists)
    ├── MEMORY.md content
    └── Skills summary
```

### Self-Improvement

The agent can modify **any** of its bootstrap files using `write_file` or `edit_file` tools. Changes take effect immediately on the next message (the system prompt is rebuilt every turn).

**Memory consolidation** is automatic:
1. When a session exceeds `memory_window` messages (default 50), the agent summarizes old messages
2. A history entry is appended to `HISTORY.md` (1-3 sentence summary with timestamp)
3. `MEMORY.md` is updated with important facts extracted from the conversation
4. The agent calls `save_memory` tool which writes both files to disk

### UI Access

The Settings > Agent > "Identidade do Agente" section lets the user view and edit all bootstrap files directly. The gateway exposes:

| Method | Endpoint | Action |
|--------|----------|--------|
| `GET` | `/api/bootstrap` | List all bootstrap files with content |
| `GET` | `/api/bootstrap/{filename}` | Read a specific file |
| `PUT` | `/api/bootstrap/{filename}` | Update a specific file |

### Workspace Structure

```
~/.liv/nanobot-workspace/
├── AGENTS.md          # behavior instructions
├── SOUL.md            # personality & values
├── USER.md            # user profile
├── memory/
│   ├── MEMORY.md      # long-term facts (auto-consolidated)
│   └── HISTORY.md     # event log (grep-searchable)
├── sessions/
│   ├── liv_chat.jsonl # main chat session
│   ├── liv_cron.jsonl # cron job sessions
│   └── ...
├── skills/
│   ├── liv-journaling/SKILL.md
│   ├── liv-memory/SKILL.md
│   └── ...
└── jobs.json          # cron job definitions
```

---

## 7. Configuration

### 7.1 Config Flow

```
Settings UI (renderer)
 ↓ saveLivConfig({ nanobotTemperature: 0.5 })
configStore.set()                          [config.json]
 ↓ on restart
buildEnv()                                 [nanobot-bridge-service.ts]
 ├── reads configStore (nanobotModel, temperature, channels, etc.)
 ├── reads electron-settings (pileAIProvider, model, baseUrl)
 ├── reads safeStorage (API keys: AI, Composio — encrypted)
 └── builds env var dict
 ↓
LIV_TEMPERATURE=0.5 LIV_COMPOSIO_API_KEY=cmp_... python3 gateway.py
 ↓
config_bridge.get_config()                 [config_bridge.py]
config_bridge.get_composio_config()
 └── returns structured dict from os.environ
```

### 7.2 Config Defaults

```typescript
nanobotEnabled: false
nanobotTemperature: 0.7
nanobotMaxTokens: 8192
nanobotMaxIterations: 20
nanobotGatewayPort: 0          // 0 = auto
composioApiKey: undefined      // stored in safeStorage, not configStore
```

### 7.3 Model Resolution

```
nanobotModel set?
 ├── Yes → use nanobotModel (e.g. "anthropic/claude-sonnet-4-20250514")
 └── No → use Chat model (pileAIProvider + model from electron-settings)
```

### 7.4 API Key Storage

All API keys use Electron `safeStorage` encryption via `src/main/pile-utils/store.ts`:

| Key | Setting Name | Functions |
|-----|-------------|-----------|
| AI (OpenAI) | `aiKey` | `getKey()`, `setKey()`, `deleteKey()` |
| OpenRouter | `openrouterKey` | `getOpenrouterKey()`, `setOpenrouterKey()` |
| Gemini | `geminiKey` | `getGeminiKey()`, `setGeminiKey()`, `deleteGeminiKey()` |
| Groq | `groqKey` | `getGroqKey()`, `setGroqKey()`, `deleteGroqKey()` |
| Deepgram | `deepgramKey` | `getDeepgramKey()`, `setDeepgramKey()`, `deleteDeepgramKey()` |
| Custom | `customKey` | `getCustomKey()`, `setCustomKey()`, `deleteCustomKey()` |
| **Composio** | `composioKey` | `getComposioKey()`, `setComposioKey()`, `deleteComposioKey()` |

---

## 8. Data Flow Examples

### 8.1 User sends chat message

```
User types "o que fiz hoje?" in Chat
 ↓
useChat hook → tipcClient.sendNanobotMessage({ content: "o que fiz hoje?" })
 ↓
tipc.ts → httpClient.sendMessage("o que fiz hoje?", "liv:chat")
 ↓
POST http://127.0.0.1:62398/api/message
 ↓
gateway.py → agent.process_direct(content, session_key="liv:chat")
 ↓
AgentLoop:
  1. Load session history
  2. Build context (system prompt + MEMORY.md + skills)
  3. Call LLM: "o que fiz hoje?"
  4. LLM decides: call liv_journal(action='list', limit=5)
  5. Tool executes: HTTP GET http://127.0.0.1:54321/journal/entries?limit=5
  6. Callback server: listAutoJournalRuns(5) → returns entries
  7. LLM receives entries, calls liv_recordings(action='list', limit=10)
  8. Tool executes: HTTP GET http://127.0.0.1:54321/recordings?limit=10
  9. LLM synthesizes: "Hoje voce trabalhou em X, gravou Y transcricoes..."
 ↓
Response returns through the stack to the UI
```

### 8.2 Cron job executes

```
Timer fires at 22:00 (daily-review job)
 ↓
CronService._on_timer() → _execute_job(daily-review)
 ↓
on_cron_job(job) → agent.process_direct(
  content="Gere revisao diaria...",
  session_key="liv:cron"
)
 ↓
AgentLoop:
  1. Calls liv_journal(action='list') → today's entries
  2. Calls liv_kanban(action='get') → board state
  3. Calls liv_memory(action='write', content="Resumo do dia...")
  4. Calls liv_kanban(action='create', title="Prioridade amanha: ...")
 ↓
Job state updated: last_run_at_ms, last_status = "ok"
next_run_at_ms recalculated for tomorrow 22:00
```

### 8.3 Agent uses Composio tool (e.g. send Gmail)

```
User: "manda um email pro joao@email.com com o resumo do meu dia"
 ↓
AgentLoop:
  1. Calls liv_journal(action='list') → today's entries
  2. Synthesizes summary
  3. Calls composio_gmail_GMAIL_SEND_EMAIL(
       to="joao@email.com",
       subject="Resumo do dia",
       body="..."
     )
 ↓
ComposioToolWrapper.execute(**kwargs)
 ↓
ComposioBridge.execute_action("GMAIL_SEND_EMAIL", params, "gmail")
 ↓
POST https://backend.composio.dev/api/v2/actions/GMAIL_SEND_EMAIL/execute
  headers: { "x-api-key": composio_api_key }
  body: { input: params, connectedAccountId: "...", entityId: "default" }
 ↓
Response: { data: { messageId: "..." } }
 ↓
Agent confirms: "Email enviado com sucesso!"
```

### 8.4 Subagent spawned

```
User: "pesquise sobre tecnicas de GTD e me faca um resumo"
 ↓
AgentLoop decides to spawn:
  spawn(task="Pesquisar tecnicas de GTD...", label="GTD Research")
 ↓
SubagentManager:
  task_id = "a1b2c3d4"
  asyncio.create_task(_run_subagent)
 ↓
Main agent responds immediately:
  "Estou pesquisando sobre GTD. Te aviso quando terminar."
 ↓
Subagent runs in background:
  1. web_search("tecnicas GTD Getting Things Done")
  2. web_fetch(urls...)
  3. write_file("workspace/research/gtd.md", content)
 ↓
Subagent completes → _announce_result()
  InboundMessage(channel="system", sender_id="subagent")
 ↓
Main agent receives system message, summarizes for user:
  "Terminei a pesquisa sobre GTD. Aqui esta o resumo: ..."
```

---

## 9. File Map

```
src/main/
├── tipc.ts                                   # IPC endpoints (nanobot + composio sections)
├── config.ts                                 # configStore with nanobot defaults
├── pile-utils/store.ts                       # safeStorage key management (all API keys incl. Composio)
└── services/
    ├── nanobot-bridge-service.ts              # Spawn/manage Python process (passes Composio env)
    ├── nanobot-runtime-service.ts             # Orchestrate startup/shutdown
    ├── nanobot-callback-server.ts             # HTTP server (Electron → Python)
    └── nanobot-gateway-client.ts              # HTTP + WS client (incl. Composio methods)

src/shared/
└── types.ts                                  # Config type (nanobot* + composioApiKey fields)

src/renderer/src/
├── context/AIContext.jsx                      # nanobotStatus, isNanobotActive
├── hooks/useChat.jsx                         # generateNanobotCompletion
└── pages/pile/Settings/index.jsx             # Agent tab (9 sections) + Integrations tab (Composio)

resources/nanobot/
├── gateway.py                                # FastAPI server (main entry + Composio endpoints)
├── composio_bridge.py                        # ComposioToolWrapper + ComposioBridge REST client
├── config_bridge.py                          # Env vars → config dict (incl. get_composio_config)
├── requirements.txt                          # Python dependencies
├── jobs.json                                 # Default cron jobs (4)
├── tools/
│   ├── liv_tools.py                          # 7 Liv tool classes
│   └── liv_client.py                         # Async HTTP client
└── skills/
    ├── liv-journaling/SKILL.md
    ├── liv-memory/SKILL.md
    ├── liv-navigator/SKILL.md
    ├── liv-life-os/SKILL.md
    └── liv-productivity/SKILL.md

nanobot-ref/nanobot/                          # Core framework (separate repo)
├── agent/
│   ├── loop.py                               # AgentLoop (main processing engine)
│   ├── subagent.py                           # SubagentManager
│   ├── context.py                            # ContextBuilder (system prompt assembly)
│   └── tools/
│       ├── base.py                           # Abstract Tool class
│       ├── registry.py                       # ToolRegistry (register/unregister/execute)
│       ├── spawn.py                          # SpawnTool
│       ├── cron.py                           # CronTool
│       ├── filesystem.py                     # Read/Write/Edit/ListDir tools
│       ├── shell.py                          # ExecTool
│       ├── web.py                            # WebSearch/WebFetch tools
│       ├── message.py                        # MessageTool (outbound)
│       └── mcp.py                            # MCP server wrapper (MCPToolWrapper)
├── cron/
│   ├── service.py                            # CronService (timer, execution, persistence)
│   └── types.py                              # CronJob, CronSchedule, CronPayload
├── providers/
│   └── litellm_provider.py                   # LiteLLM wrapper
├── bus/
│   └── queue.py                              # MessageBus (inbound/outbound async queues)
├── session/
│   └── manager.py                            # SessionManager (conversation persistence)
└── channels/
    └── manager.py                            # ChannelManager (Telegram, Slack, etc.)
```

---

## 10. Settings UI

Settings has **5 tabs**:

| # | Tab | Content |
|---|-----|---------|
| 1 | **Journal** | Theme, language, date format |
| 2 | **Whisper** | Transcription provider, model, quality |
| 3 | **Enhancement** | LLM post-processing, prompts |
| 4 | **Agent** | Nanobot agent config (9 expandable sections) |
| 5 | **Integracoes** | Composio marketplace (external app integrations) |

### Agent Tab — 9 expandable sections

| # | Section | Content |
|---|---------|---------|
| 1 | **Agente** | Toggle on/off, status badge, uptime, restart |
| 2 | **Gateway** | Port (0 = auto) |
| 3 | **Modelo & Parametros** | Separate model toggle, temperature slider, max tokens, max iterations |
| 4 | **Integracoes** | Telegram, WhatsApp, Slack, Discord, Email (toggle + credentials) |
| 5 | **Skills & Tools** | Installed skills list, registered tools, skill-creator info |
| 6 | **Subagentes** | Running count, agent list (id, status), polling every 10s |
| 7 | **Cron Jobs** | Jobs with schedule, last/next run, enable/disable toggle, error display |
| 8 | **Memoria** | Load/clear MEMORY.md |
| 9 | **Identidade do Agente** | SOUL.md, AGENTS.md, USER.md editor |

### Integrations Tab — Composio Marketplace

See section 12 for full details.

---

## 11. Security

- All HTTP traffic is `127.0.0.1` only (localhost)
- API keys encrypted via Electron `safeStorage` (AES-256)
- Shell exec tool has deny patterns (rm -rf, format, etc.)
- File tools optionally restricted to workspace
- No credentials exposed in gateway responses
- Channel tokens stored in configStore (not logged)
- Composio API key stored in safeStorage, passed as env var to gateway only

---

## 12. Composio — External Integrations

### 12.1 Overview

Composio is a platform that manages OAuth credentials and exposes external service actions (Gmail, Slack, GitHub, Calendar, etc.) as tool calls. The Liv agent uses Composio to gain access to external services without implementing individual OAuth flows.

**Decision**: REST API direct via `httpx` (already a dependency), without installing `composio-core` SDK.

### 12.2 Architecture

```
┌──────────────────┐   TIPC    ┌──────────────────┐
│ Settings UI      │──────────→│ main process     │
│ (Integrations    │           │                  │
│  Tab)            │           │ tipc.ts          │
└──────────────────┘           │ store.ts         │ ← safeStorage
                               │ bridge-service   │ ← passes env var
                               └────────┬─────────┘
                                        │ HTTP
                                        ▼
                               ┌──────────────────────────┐
                               │ gateway.py                │
                               │                           │
                               │ /api/composio/* endpoints │
                               │         │                 │
                               │   ComposioBridge          │
                               │         │                 │
                               │   ComposioToolWrapper     │
                               │         │                 │
                               │   ToolRegistry            │
                               └─────────┼────────────────┘
                                         │ HTTPS
                                         ▼
                               ┌──────────────────────────┐
                               │ Composio REST API         │
                               │ backend.composio.dev/api  │
                               │                           │
                               │ /v1/apps                  │
                               │ /v2/actions               │
                               │ /v1/connectedAccounts     │
                               │ /v2/actions/{name}/execute│
                               └──────────────────────────┘
```

### 12.3 Python Layer

#### `composio_bridge.py`

**ComposioToolWrapper** — Wraps a single Composio action as a nanobot Tool (follows the same pattern as `MCPToolWrapper` in `nanobot-ref/nanobot/agent/tools/mcp.py`):

```python
class ComposioToolWrapper(Tool):
    name → "composio_{app_name}_{action_name}"
    description → from Composio API
    parameters → JSON Schema from Composio API
    execute(**kwargs) → bridge.execute_action(action_name, kwargs, app_name)
```

**ComposioBridge** — REST client for the Composio API:

| Method | Composio Endpoint | Purpose |
|--------|-------------------|---------|
| `list_apps()` | `GET /v1/apps` | Discover available apps |
| `get_app_actions(app)` | `GET /v2/actions?appNames=X` | List actions for an app |
| `initiate_connection(app)` | `POST /v1/connectedAccounts` | Start OAuth, returns redirect URL |
| `check_connection(id)` | `GET /v1/connectedAccounts/{id}` | Poll connection status |
| `list_connections()` | `GET /v1/connectedAccounts` | All connected accounts |
| `disconnect(id)` | `DELETE /v1/connectedAccounts/{id}` | Remove connection |
| `execute_action(name, params)` | `POST /v2/actions/{name}/execute` | Execute an action |
| `register_app_tools(app, registry)` | — | List actions + register as tools |
| `unregister_app_tools(app, registry)` | — | Remove tools from registry |
| `get_status()` | — | API key valid? + connected apps |

#### Gateway Endpoints

Added to `gateway.py`:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/composio/status` | API key validity + connected apps |
| `GET` | `/api/composio/apps` | List available apps |
| `GET` | `/api/composio/apps/{name}/actions` | Actions for an app |
| `POST` | `/api/composio/connect` | Initiate OAuth (body: `app_name`) |
| `GET` | `/api/composio/connections` | List all connections |
| `GET` | `/api/composio/connections/{id}` | Poll one connection |
| `DELETE` | `/api/composio/connections/{id}` | Disconnect (also unregisters tools) |
| `POST` | `/api/composio/tools/register` | Register tools for an app |
| `POST` | `/api/composio/tools/unregister` | Remove tools for an app |
| `GET` | `/api/composio/tools` | List registered tools by app |

#### Auto-registration on startup

In `GatewayState.start()`:

```python
if self.composio and self.agent:
    connections = await self.composio.list_connections()
    for conn in connections:
        if conn["status"] == "ACTIVE":
            self.composio._connected_apps[app_name] = conn["id"]
            await self.composio.register_app_tools(app_name, self.agent.tools)
```

### 12.4 TypeScript Layer

#### Store (`pile-utils/store.ts`)

```typescript
getComposioKey(): Promise<string | null>     // decrypt from electron-settings
setComposioKey(key: string): Promise<boolean> // encrypt + save
deleteComposioKey(): Promise<boolean>         // unset
```

#### Bridge Service (`nanobot-bridge-service.ts`)

In `buildEnv()`:

```typescript
const composioKey = await getComposioKey()
if (composioKey) {
  env.LIV_COMPOSIO_API_KEY = composioKey
}
```

#### Gateway Client (`nanobot-gateway-client.ts`)

9 new methods on `NanobotHttpClient`:

```typescript
getComposioStatus()
getComposioApps()
getComposioAppActions(appName)
initiateComposioConnection(appName)
getComposioConnectionStatus(connectionId)
listComposioConnections()
disconnectComposioApp(connectionId)
registerComposioTools(appName)
unregisterComposioTools(appName)
getComposioTools()
```

#### TIPC (`tipc.ts`)

13 new endpoints — see table in section 2.1.

### 12.5 Integrations Tab UI

The "Integracoes" tab in Settings renders `IntegrationsTab`, a full marketplace view:

**Setup screen** (no API key):
- Input field for Composio API key
- Link to composio.dev for account creation
- Save button (encrypts key via safeStorage)

**Marketplace view** (key configured):

```
┌─────────────────────────────────────────────────────┐
│ App Integrations                                     │
│ Connect your favorite apps with this agent           │
│                                                      │
│ [🔍 Search apps...                                ] │
│                                                      │
│ ▾ Connected to this agent  2                         │
│ ┌────────────────────────────────────────────┐       │
│ │ [logo] Gmail         ⚙  6 tools enabled    │       │
│ │ [logo] Slack         ⚙  Connected          │       │
│ └────────────────────────────────────────────┘       │
│                                                      │
│ Available Apps                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│ │ [logo]   │ │ [logo]   │ │ [logo]   │ │ [logo]  │ │
│ │ Gmail    │ │ GitHub   │ │ Calendar │ │ Notion  │ │
│ │ desc...  │ │ desc...  │ │ desc...  │ │ desc... │ │
│ │ [+ Add]  │ │ [+ Add]  │ │ [+ Add]  │ │ [+ Add] │ │
│ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                      │
│ Composio API key configurada    [Remover chave]      │
└─────────────────────────────────────────────────────┘
```

**OAuth flow**:
1. User clicks "+ Add" on an app card
2. `initiateComposioConnection(appName)` → returns `{ url, connectionId }`
3. `window.open(url, "_blank")` opens OAuth in system browser
4. UI polls `getComposioConnectionStatus(connectionId)` every 3s
5. When `status === "ACTIVE"`:
   - `registerComposioTools(appName)` registers actions as nanobot tools
   - Connections list and tools summary refresh
6. Polling stops after 5 minutes timeout

**Disconnect flow**:
1. User clicks disconnect icon on a connected app
2. `disconnectComposioApp(connectionId)` → deletes connection
3. Gateway auto-unregisters tools for that app
4. UI refreshes

---

## 13. Channel Integrations

The agent can connect to external messaging platforms. Each channel runs as an async task managed by `ChannelManager`.

### Supported Channels

| Channel | Config Keys | Protocol |
|---------|-------------|----------|
| **Telegram** | `nanobotTelegramEnabled`, `nanobotTelegramToken` | Bot API polling |
| **WhatsApp** | `nanobotWhatsappEnabled`, `nanobotWhatsappBridgeUrl`, `nanobotWhatsappBridgeToken` | Bridge HTTP |
| **Slack** | `nanobotSlackEnabled`, `nanobotSlackBotToken`, `nanobotSlackAppToken` | Socket Mode |
| **Discord** | `nanobotDiscordEnabled`, `nanobotDiscordToken` | Gateway WS |
| **Email** | `nanobotEmailEnabled`, `nanobotEmailImap*`, `nanobotEmailSmtp*` | IMAP/SMTP |

### Config Flow

1. User enables channel in Settings > Agent > Integracoes section
2. Credentials saved to `configStore` (config.json)
3. On agent restart, `buildEnv()` passes `LIV_<CHANNEL>_*` env vars
4. `config_bridge.get_channels_config()` reads env vars
5. `ChannelManager.start_all()` spawns async tasks for enabled channels

---

## 14. Implementation Guide — Exact Steps Used

This section documents the exact implementation steps and patterns used, serving as a guide for adding similar features.

### 14.1 Pattern: Adding a new tool integration (Composio example)

**Step 1: Python Tool Wrapper** (`resources/nanobot/composio_bridge.py`)

Follow the `MCPToolWrapper` pattern from `nanobot-ref/nanobot/agent/tools/mcp.py`:

```python
from nanobot.agent.tools.base import Tool

class ComposioToolWrapper(Tool):
    def __init__(self, bridge, app_name, action):
        self._name = f"composio_{app_name}_{action['name']}"
        self._description = action.get("description", "")
        self._parameters = action.get("parameters", {"type": "object", "properties": {}})

    @property
    def name(self) -> str: return self._name
    @property
    def description(self) -> str: return self._description
    @property
    def parameters(self) -> dict: return self._parameters

    async def execute(self, **kwargs) -> str:
        return await self._bridge.execute_action(...)
```

Key: extend `Tool` ABC, implement `name`, `description`, `parameters` properties and `execute()` method.

**Step 2: Gateway endpoints** (`resources/nanobot/gateway.py`)

- Add attribute to `GatewayState.__init__()` (e.g. `self.composio = None`)
- Initialize in `GatewayState.initialize()` (read config, create bridge)
- Start in `GatewayState.start()` (auto-register tools for existing connections)
- Cleanup in `GatewayState.stop()` (close HTTP client)
- Add Pydantic request models
- Add FastAPI endpoints under `/api/composio/*`

**Step 3: Config bridge** (`resources/nanobot/config_bridge.py`)

Add `get_composio_config()` reading `os.environ.get("LIV_COMPOSIO_API_KEY", "")`.

**Step 4: Encrypted key storage** (`src/main/pile-utils/store.ts`)

Follow existing pattern for all keys:

```typescript
export async function getComposioKey(): Promise<string | null> {
  const encryptedKey = await settings.get('composioKey');
  if (!encryptedKey || typeof encryptedKey !== 'string') return null;
  return safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
}

export async function setComposioKey(secretKey: string): Promise<boolean> {
  const encryptedKey = safeStorage.encryptString(secretKey);
  await settings.set('composioKey', encryptedKey.toString('base64'));
  return true;
}
```

**Step 5: Bridge env vars** (`src/main/services/nanobot-bridge-service.ts`)

In `buildEnv()`, read key and add to env dict:

```typescript
const composioKey = await getComposioKey()
if (composioKey) env.LIV_COMPOSIO_API_KEY = composioKey
```

**Step 6: Gateway HTTP client** (`src/main/services/nanobot-gateway-client.ts`)

Add methods to `NanobotHttpClient` following existing pattern:

```typescript
async getComposioStatus(): Promise<...> {
  const res = await fetch(`${this.baseUrl}/api/composio/status`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`... failed: ${res.status}`)
  return res.json()
}
```

**Step 7: TIPC endpoints** (`src/main/tipc.ts`)

Follow the lazy import + null check pattern:

```typescript
getComposioStatus: t.procedure.action(async () => {
  const { getHttpClient } = await import("./services/nanobot-gateway-client")
  const client = getHttpClient()
  if (!client) return { connected: false, apps: [] }
  try { return await client.getComposioStatus() }
  catch { return { connected: false, apps: [] } }
}),
```

- Import keys: add to import block from `"./pile-utils/store"`
- Input procedures: use `.input<{ key: string }>().action(async ({ input }) => ...)`
- No-input procedures: use `.action(async () => ...)`

**Step 8: Settings UI** (`src/renderer/src/pages/pile/Settings/index.jsx`)

For a new tab:
1. Import icon from `renderer/icons`
2. Add `<Tabs.Trigger>` in the `<Tabs.List>`
3. Add `<Tabs.Content>` referencing a new component
4. Create the component function with `useState` for local state
5. Use `tipcClient.procedureName()` for all TIPC calls
6. For opening external URLs: `window.open(url, "_blank")` (handled by `setWindowOpenHandler`)

### 14.2 Pattern: Adding a new channel integration

1. Add config fields to `src/shared/types.ts` (e.g. `nanobotXyzEnabled`, `nanobotXyzToken`)
2. Add defaults to `src/main/config.ts` (if needed)
3. In `nanobot-bridge-service.ts` `buildEnv()`: read config → set `LIV_XYZ_*` env vars
4. In `config_bridge.py` `get_channels_config()`: read `LIV_XYZ_*` from os.environ
5. In `nanobot-ref/nanobot/channels/`: implement channel adapter
6. In Settings UI Agent tab "Integracoes" section: add toggle + credential inputs

### 14.3 Verification checklist

```bash
# 1. TypeScript types
pnpm run typecheck              # must pass with 0 errors

# 2. Dev mode
pnpm dev                        # verify UI renders

# 3. Functional tests
# - Settings > Integracoes tab shows marketplace
# - Enter Composio API key → saves encrypted → gateway receives via env
# - Load apps → grid shows available apps
# - Connect Gmail → OAuth in browser → polling → tools registered
# - Agent can use composio tools (e.g. composio_gmail_GMAIL_SEND_EMAIL)
# - Disconnect app → tools removed from registry

# 4. Logs
# ~/Library/Logs/Liv/nanobot.log    (Python gateway)
# ~/Library/Logs/Liv/main.log       (Electron main process)
```
