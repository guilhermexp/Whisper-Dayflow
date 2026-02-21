# Architecture Overview

**Last updated:** 2026-02-21

## Runtime Layers

```
┌─────────────────────────────────────────────┐
│  Renderer (React 19 + Vite 7 + TailwindCSS) │
│  - UI pages, components, hooks, contexts     │
│  - tipcClient for typed IPC calls            │
│  - AudioContext recording (lib/recorder.ts)  │
└──────────────────┬──────────────────────────┘
                   │ tipc (typed) + ipcMain (legacy Pile)
┌──────────────────┴──────────────────────────┐
│  Main Process (Electron/Node)                │
│  - App lifecycle, windows, tray, menu        │
│  - tipc.ts: 60+ typed IPC procedures         │
│  - pile-ipc.ts: legacy Pile handlers          │
│  - Services: autonomous agents, capture, LLM │
│  - Config, history, analytics persistence    │
└──────────────────┬──────────────────────────┘
                   │ spawn / native FFI
┌──────────────────┴──────────────────────────┐
│  Rust Binary (liv-rs)                        │
│  - Native keyboard/input integration         │
│  - macOS Fn key handling                     │
└─────────────────────────────────────────────┘
```

## Main Process Modules

### Core (`src/main/`)

| Module | File | Responsibility |
|--------|------|----------------|
| Entry point | `index.ts` | App bootstrap, deferred initialization |
| IPC router | `tipc.ts` | 60+ typed procedures (recording, config, models, auto-journal, kanban, profile, life-os) |
| Windows | `window.ts` | Main, panel, setup, timer-float windows |
| Keyboard | `keyboard.ts` | Hold-to-record, text insertion |
| Global shortcuts | `global-shortcut.ts` | System-wide hotkey registration |
| LLM | `llm.ts` | Post-processing, enhancement, auto-journal generation |
| Config | `config.ts` | `config.json` persistence (transcription, enhancement settings) |
| History | `history-store.ts` | SQLite-backed recording history |
| Analytics | `history-analytics.ts` | Recording statistics & search |
| Local transcription | `local-transcriber.ts` | Sherpa-ONNX via liv-rs binary |
| Model management | `model-manager.ts` | Download, import, catalog local models |
| Tray | `tray.ts` | System tray icon & menu |
| Performance | `performance-monitor.ts` | Startup phase timing |
| Serve protocol | `serve.ts` | `assets://` custom protocol for file serving |

### Services (`src/main/services/`)

| Service | Responsibility |
|---------|----------------|
| `enhancement-service.ts` | Multi-level transcription enhancement |
| `auto-journal-service.ts` | AI-generated journal entries from screenshots + transcriptions |
| `auto-journal-entry.ts` | Entry builder for auto-journal |
| `autonomous-kanban-service.ts` | AI-driven task board automation |
| `autonomous-profile-service.ts` | AI profile generation |
| `autonomous-life-service.ts` | Life context analysis (Telos framework) |
| `autonomous-memory-service.ts` | Embeddings & memory management |
| `ollama-embedding-service.ts` | Ollama embedding integration |
| `screen-capture-service.ts` | Screenshot capture with OCR (Tesseract) |
| `screen-session-recording-service.ts` | Screen session recording |
| `periodic-screenshot-service.ts` | Periodic screenshot capture |
| `audio-processing-service.ts` | Audio codec handling |
| `media-controller.ts` | Media playback control |
| `focus-session-service.ts` | Focus session tracking |

### Legacy Pile System (`src/main/pile-*`)

The original Pile journal system uses `ipcMain.handle` directly:

- `pile-ipc.ts` - Imports all handlers
- `pile-handlers/` - file, tags, highlights, links, keys, store, index
- `pile-utils/` - Helper functions (JS), electron-settings wrapper (TS)

New features should use `tipc.ts`. Legacy system maintained for backward compatibility.

## Renderer Modules

### Structure (`src/renderer/src/`)

| Module | Path | Purpose |
|--------|------|---------|
| Router | `router.tsx` | 17 routes with lazy loading |
| Pages | `pages/pile/*` | Workspace pages (Chat, Settings, AutoJournal, Kanban, etc.) |
| Panel | `pages/panel.tsx` | Recording overlay window |
| Components | `components/` | UI components (Radix + Tailwind), enhancement, models |
| Contexts | `context/` | 10 React contexts (AI, Piles, Tags, Highlights, etc.) |
| Hooks | `hooks/` | Custom hooks (useChat, usePost, useElectronStore, etc.) |
| IPC client | `lib/tipc-client.ts` | Typed IPC client matching tipc.ts |
| Recorder | `lib/recorder.ts` | AudioContext-based recording |
| i18n | `lib/i18n.ts` + `locales/` | en-US, pt-BR translations |
| Icons | `icons/` | ~100 SVG icon components |

### Styling

- **TailwindCSS 4** for component styling (`css/tailwind.css`)
- **SCSS Modules** for component-scoped styles (`*.module.scss`)
- **pile-app.scss** for global theme variables and Pile-specific styles
- Theme system with multiple color themes (blue, purple, yellow, green, liquid)

## Shared Contracts (`src/shared/`)

| File | Content |
|------|---------|
| `types.ts` | Core domain types (Config, RecordingHistoryItem, AutoJournal*, Autonomous*, Life*) |
| `types/enhancement.ts` | Enhancement-specific types |
| `models/types.ts` | Model type definitions (Base, Local, Cloud, Custom) |
| `models/catalog.ts` | Pre-defined model catalog |
| `data-model.ts` | Technical inventory (modules, IPC procedures, routes) |
| `constants.ts` | App constants |
| `data/predefined-prompts.ts` | AI prompt templates |
| `data/system-instructions.ts` | System instructions |

## Dual Config System

| System | Store | Used by | Keys |
|--------|-------|---------|------|
| `configStore` | `config.json` via `config.ts` | Transcription, enhancement, general settings | `enhancementProvider`, `openaiModel`, `groqApiKey` |
| `electron-settings` | Via `pile-utils/store.ts` | Chat, Pile AI features | `pileAIProvider`, `model`, `openrouterModel`, `baseUrl` |

API keys are encrypted via Electron's `safeStorage` in electron-settings.
`llm.ts` bridges both systems: reads provider from electron-settings, falls back to configStore.

## Data Persistence

| Data | Storage | Location |
|------|---------|----------|
| Config | JSON file | `<appData>/config.json` |
| Recording history | SQLite | `<appData>/history.db` |
| Pile data | Markdown files | `<appData>/piles/<name>/` |
| Recordings | Audio files | `<appData>/recordings/` |
| Screenshots | PNG files | `<appData>/screenshots/` |
| AI keys | Encrypted electron-settings | OS keychain |
| Models | ONNX files | `<appData>/models/` |

## Build Pipeline

```
pnpm build
  → pnpm run typecheck (node + web)
  → electron-vite build
  → pnpm run build-rs (compile liv-rs)

pnpm build:mac
  → pnpm build
  → electron-builder --mac
  → ad-hoc code signing
  → DMG + ZIP output in dist/
```
