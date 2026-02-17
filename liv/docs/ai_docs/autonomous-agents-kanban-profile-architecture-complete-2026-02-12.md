# Autonomous Agents + Kanban + Profile: Complete Architecture (2026-02-12)

## 1. Scope
This document consolidates the full architecture implemented for:
- autonomous background analysis agents,
- persistent memory and context retrieval,
- weekly Kanban intelligence page,
- widget-driven Profile intelligence page,
- local-first embeddings with Ollama as default.

It is intended as a handoff/continuity doc so any developer can continue work from any environment.

## 2. Product goals delivered
- Keep a continuous autonomous observer of user activity (auto-journal runs).
- Transform run signals into actionable outputs on two pages:
  - `Kanban`: pending/suggestions/automation opportunities.
  - `Profile`: personal intelligence widgets and behavioral insights.
- Persist durable memory beyond LLM context window.
- Use local embeddings by default to reduce API costs.

## 3. High-level architecture
1. Auto-journal runs are generated periodically.
2. After each successful run:
   - Kanban board is refreshed.
   - Profile board is refreshed.
3. Both services write summary memory to persistent autonomous memory.
4. Renderer pages poll/read these boards through TIPC IPC procedures.
5. User can configure Profile widgets (enabled/disabled), which directly affects background generation.

## 4. Core backend services

### 4.1 Autonomous memory service
File:
- `src/main/services/autonomous-memory-service.ts`

Responsibilities:
- Memory initialization and folder bootstrap.
- Markdown memory files:
  - `recordings/auto-agent/MEMORY.md` (durable)
  - `recordings/auto-agent/memory/YYYY-MM-DD.md` (daily)
- Indexing into SQLite:
  - `recordings/auto-agent/memory_index.db`
- Hybrid retrieval:
  - semantic similarity
  - FTS keyword matching
- Prompt context packaging for agent consumption.

### 4.2 Autonomous Kanban service
File:
- `src/main/services/autonomous-kanban-service.ts`

Responsibilities:
- Parse recent auto-journal runs.
- Generate cards for lanes:
  - `pending`
  - `suggestions`
  - `automations`
- Persist board:
  - `recordings/auto-agent/kanban-board.json`
- Log memory snapshots after generation.

### 4.3 Autonomous Profile service
File:
- `src/main/services/autonomous-profile-service.ts`

Responsibilities:
- Parse recent auto-journal runs.
- Read active widgets from config (`profileWidgetsEnabled`).
- Generate cards only for active widgets.
- Persist board:
  - `recordings/auto-agent/profile-board.json`
- Expose available widgets metadata and enabled widgets in board payload.
- Log memory snapshots after generation.

## 5. Pipeline orchestration
File:
- `src/main/services/auto-journal-service.ts`

At end of successful run:
- `refreshAutonomousKanban()`
- `refreshAutonomousProfile()`

This guarantees both pages evolve with the same source events.

## 6. Local embedding strategy (cost control)
Files:
- `src/main/services/ollama-embedding-service.ts`
- `src/main/index.ts`
- `src/main/config.ts`

Defaults:
- `ragEmbeddingProvider = "ollama"`
- `forceLocalRagEmbeddings = true`
- `embeddingModel = "qwen3-embedding:0.6b"`
- `ollamaBaseUrl = "http://localhost:11434"`

Startup behavior:
- app checks/pulls default local embedding model automatically.
- this is designed as required baseline behavior, reducing user setup friction.

Important separation:
- Chat provider remains OpenAI/GPT-5.2 (for chat quality).
- Embeddings/RAG default to local Ollama (for cost efficiency).

## 7. TIPC/IPC interface surface
File:
- `src/main/tipc.ts`

Kanban procedures:
- `getAutonomousKanbanBoard`
- `refreshAutonomousKanban`
- `searchAutonomousKanbanMemory`
- `getAutonomousKanbanStatus`
- `getAutonomousPromptContext`

Profile procedures:
- `getAutonomousProfileBoard`
- `refreshAutonomousProfile`
- `getAutonomousProfileStatus`

Config procedures used for widget settings:
- `getConfig`
- `saveConfig`

## 8. Shared type contracts
File:
- `src/shared/types.ts`

Main contracts:
- `AutonomousKanbanBoard`, `AutonomousKanbanCard`, `AutonomousKanbanColumn`
- `AutonomousProfileBoard`, `AutonomousProfileCard`
- `AutonomousProfileWidget`, `AutonomousProfileWidgetId`
- `Config.profileWidgetsEnabled`

Profile card includes:
- `widgetId` (traceability to widget origin)
- `kind`, `summary`, `actions`, `confidence`, `impact`, timestamps, `sourceRunIds`

## 9. Renderer implementation

### 9.1 Kanban page
Files:
- `src/renderer/src/pages/pile/Kanban/index.jsx`
- `src/renderer/src/pages/pile/Kanban/Kanban.module.scss`

Key behaviors:
- polling board updates,
- week/day filtering,
- scrollable board with reusable column/card components,
- memory search input and result list.

### 9.2 Profile page
Files:
- `src/renderer/src/pages/pile/Profile/index.jsx`
- `src/renderer/src/pages/pile/Profile/Profile.module.scss`

Key behaviors:
- widget chip bar (activate/deactivate widgets),
- week/day filtering,
- sectioned card layout (widgets rendered as intelligence cards),
- refresh button,
- stats footer.

Widget toggling flow:
1. read config via `getConfig`.
2. update `profileWidgetsEnabled` via `saveConfig`.
3. trigger `refreshAutonomousProfile`.
4. re-fetch board.

## 10. Active profile widgets
- `work_time_daily`
- `parallelism`
- `engagement_topics`
- `meeting_suggestions`
- `top_projects`
- `top_people`
- `business_opportunities`
- `focus_risks`

## 11. Data storage map
- Config:
  - app config JSON (`configStore`) including `profileWidgetsEnabled`.
- Memory:
  - `recordings/auto-agent/MEMORY.md`
  - `recordings/auto-agent/memory/YYYY-MM-DD.md`
  - `recordings/auto-agent/memory_index.db`
- Boards:
  - `recordings/auto-agent/kanban-board.json`
  - `recordings/auto-agent/profile-board.json`
- Source timeline:
  - `recordings/auto-journal/runs/*.json`

## 12. Reliability notes
- Profile board loader validates schema presence and regenerates if stale/incompatible.
- Both Kanban/Profile generation are deterministic heuristic pipelines (no mandatory external LLM call).
- Memory notes are appended after each board refresh, enabling auditable evolution.

## 13. Development continuation checklist
1. Add action handlers from cards to executable flows:
   - create task
   - schedule meeting
   - create automation template
2. Add widget presets in settings:
   - Productivity
   - Executive
   - Personal
3. Add card feedback loop:
   - useful/not useful
   - confidence recalibration.
4. Add optional sub-agent execution mode:
   - each lane/widget handled by specialized worker.
5. Add tests:
   - board generation fixtures for Kanban/Profile
   - config migration tests for widget defaults.

## 14. Related docs
- `docs/ai_docs/technical-report-autonomous-memory-kanban-2026-02-12.md`
- `docs/ai_docs/autonomous-profile-widgets-architecture-2026-02-12.md`
- `docs/ai_docs/autonomous-agent-memory-design.md`
- `docs/ai_docs/ollama-embedding-eval-2026-02-12.md`
