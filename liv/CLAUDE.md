# CLAUDE.md - Liv Development Guide

**Last updated:** 2026-02-21
**Project:** Liv
**Version:** 0.1.8

## 1. Product Summary

Liv is a desktop app that combines:
- Voice dictation with global hotkeys
- Local/cloud transcription (Whisper, Sherpa-ONNX, Groq)
- LLM post-processing (enhancement, correction, formatting)
- Automatic text insertion into the active app
- Pile workspace (journal, chat, search, kanban, profile, timeline, auto-journal)

All data is persisted locally (config, history, media, analysis artifacts).

## 2. Runtime Architecture

```
Electron Main (Node 20+)
  ↕ tipc (typed IPC) + ipcMain/ipcRenderer (legacy Pile)
Renderer (React 19 + Vite 7)
  ↕ native integration
Rust binary (liv-rs)
```

### Main process (`src/main/`)
- App lifecycle & windows: `index.ts`, `window.ts`
- Typed IPC router: `tipc.ts` (60+ procedures)
- Hotkeys & text input: `keyboard.ts`, `global-shortcut.ts`
- Configuration: `config.ts` (config.json store)
- History & analytics: `history-store.ts`, `history-analytics.ts`
- LLM processing: `llm.ts`
- Local transcription: `local-transcriber.ts`
- Autonomous services: `services/*` (auto-journal, kanban, profile, memory, screen capture)
- Legacy Pile IPC: `pile-ipc.ts` → `pile-handlers/*` → `pile-utils/*`

### Renderer (`src/renderer/src/`)
- Routes: `router.tsx`
- Pages: `pages/pile/*` (main workspace), `pages/panel.tsx` (recording overlay)
- Contexts: `context/*` (AI, Piles, Tags, Highlights, Links, Nav, Timeline, etc.)
- IPC client: `lib/tipc-client.ts`
- Components: `components/*` (UI, enhancement, models)

### Shared (`src/shared/`)
- Domain types: `types.ts`, `types/enhancement.ts`
- Model catalog: `models/catalog.ts`, `models/types.ts`
- Technical inventory: `data-model.ts`
- Constants: `constants.ts`

### Rust (`liv-rs/`)
- Native keyboard/input integration
- macOS Fn key handling

## 3. Active Routes

Defined in `src/renderer/src/router.tsx`:

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing / pile redirect |
| `/pile/:pileName` | Pile | Journal workspace |
| `/create-pile` | CreatePile | New pile creation |
| `/onboarding` | Onboarding | First-run setup |
| `/timeline` | Timeline | Activity timeline |
| `/auto-journal` | AutoJournal | AI-generated journal |
| `/vision` | AutoJournal | Alias for auto-journal |
| `/dashboard` | Dashboard | Overview & stats |
| `/video-recordings` | VideoRecordings | Screen sessions |
| `/settings` | Settings | All settings |
| `/chat` | Chat | AI chat interface |
| `/search` | Search | Full-text search |
| `/kanban` | Kanban | Task board |
| `/profile` | Profile | AI profile |
| `/setup` | Setup | Accessibility setup |
| `/panel` | Panel | Recording panel overlay |
| `/timer-float` | TimerFloat | Floating timer widget |

## 4. Key Domains

| Domain | Key files |
|--------|-----------|
| Transcription + enhancement | `tipc.ts`, `llm.ts`, `services/enhancement-service.ts` |
| Auto-journal / Vision | `services/auto-journal-service.ts`, `pages/pile/AutoJournal/` |
| Screen capture | `services/screen-capture-service.ts`, `services/screen-session-recording-service.ts` |
| Autonomous agents | `services/autonomous-kanban-service.ts`, `autonomous-profile-service.ts`, `autonomous-life-service.ts`, `autonomous-memory-service.ts` |
| Chat AI | `context/AIContext.jsx`, `hooks/useChat.jsx`, `pages/pile/Chat/` |
| Pile legacy | `pile-ipc.ts`, `pile-handlers/*`, `pile-utils/*` |
| Config (json) | `config.ts` - transcription, enhancement, general settings |
| Config (electron-settings) | `pile-utils/store.ts` - AI provider, API keys, chat settings |

### Dual Config Systems (Important)

Liv has TWO config systems:
1. **`configStore`** (`config.ts` → `config.json`): transcription, enhancement, auto-journal settings
2. **`electron-settings`** (`pile-utils/store.ts`): AI provider, model, API keys (encrypted via `safeStorage`)

`llm.ts` bridges both: reads `pileAIProvider` from electron-settings, falls back to configStore. API keys always from encrypted storage.

## 5. Package Manager & Commands

**Only pnpm** (enforced in `package.json` via `packageManager` field).

```bash
pnpm install          # Install dependencies
pnpm dev              # Development with hot reload
pnpm run lint         # ESLint
pnpm run typecheck    # TypeScript check (node + web)
pnpm build            # Full build (typecheck + vite + rust)
pnpm build:mac        # macOS distribution
pnpm build:win        # Windows distribution
```

## 6. Project Structure

```
liv/
├── src/
│   ├── main/                  # Electron main process
│   │   ├── services/          # 13 autonomous services
│   │   ├── pile-handlers/     # Legacy IPC handlers (7 files)
│   │   ├── pile-utils/        # Legacy utilities (JS + TS)
│   │   └── pile-workers/      # Web workers
│   ├── renderer/src/          # React frontend
│   │   ├── components/        # UI components
│   │   ├── pages/             # Route pages
│   │   ├── context/           # React contexts
│   │   ├── hooks/             # Custom hooks
│   │   ├── icons/             # SVG icon components
│   │   ├── lib/               # Utilities (tipc-client, recorder, i18n)
│   │   ├── css/               # Global styles
│   │   ├── locales/           # i18n (en-US, pt-BR)
│   │   └── utils/             # Helper functions
│   ├── preload/               # Electron preload script
│   └── shared/                # Shared types & constants
├── liv-rs/                    # Rust native binary
├── nanobot-ref/               # Reference implementation (separate git)
├── docs/                      # Documentation
│   ├── ai_docs/               # AI/autonomous system docs
│   └── specs/                 # Feature requirement specs
├── scripts/                   # Build & dev scripts
├── assets/                    # Fonts (Inter, Porpora)
├── build/                     # App icons & entitlements
└── resources/                 # Tray icons & compiled binary
```

## 7. Documentation Map

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Development guide & technical map (this file) |
| `README.md` | Project overview & quick start |
| `AGENTS.md` | AI agent communication protocol |
| `docs/ARCHITECTURE.md` | Runtime architecture details |
| `docs/CONVENTIONS.md` | Code conventions & standards |
| `docs/BUILD-GUIDE.md` | Build & distribution guide |
| `docs/ai_docs/` | AI system analysis & reports |
| `docs/specs/` | Feature requirement specifications |
