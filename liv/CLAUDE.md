# CLAUDE.md - Liv Development Guide

Last updated: 2026-02-22
Version: 0.1.8

## Product
Liv is a desktop app for dictation + journaling:
- global hotkey recording
- local/cloud transcription
- optional LLM enhancement
- text insertion into active app
- Pile workspace (chat, search, timeline, auto-journal, kanban, profile)

## Architecture
- Main process: `src/main/`
- Renderer: `src/renderer/src/`
- Shared contracts: `src/shared/`
- Native binary: `liv-rs/`

## IPC (single backend)
- Router: `src/main/tipc.ts`
- Client: `src/renderer/src/lib/tipc-client.ts`
- Renderer handlers/events: `src/main/renderer-handlers.ts`

Legacy `pile-ipc` and `pile-handlers` were removed.

## Routes
Defined in `src/renderer/src/router.tsx`:
- `/`, `/pile/:pileName`, `/create-pile`, `/onboarding`
- `/timeline`, `/auto-journal`, `/vision`
- `/dashboard`, `/video-recordings`
- `/settings`, `/chat`, `/search`, `/kanban`, `/profile`
- `/setup`, `/panel`, `/timer-float`

## Main domains
- transcription/enhancement: `src/main/tipc.ts`, `src/main/llm.ts`, `src/main/services/enhancement-service.ts`
- auto-journal/vision: `src/main/services/auto-journal-service.ts`, `src/renderer/src/pages/pile/AutoJournal/`
- autonomous modules: `src/main/services/autonomous-*.ts`
- pile indexing/search/tag/highlight/link logic: `src/main/pile-utils/*` via `tipc`

## Commands
```bash
pnpm install
pnpm dev
pnpm run typecheck
pnpm run lint
pnpm build
```

## Documentation map
- `README.md`
- `quickstart.md`
- `docs/ARCHITECTURE.md`
- `docs/CONVENTIONS.md`
- `docs/CLEANUP-2026-02-21.md`
