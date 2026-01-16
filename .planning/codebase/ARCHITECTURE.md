# Architecture

**Analysis Date:** 2026-01-16

## Pattern Overview

**Overall:** Hybrid Desktop Application - Electron Multi-Process Architecture

**Key Characteristics:**
- Multi-process: Main (Node.js backend) + Renderer (React frontend) + Preload (IPC security bridge)
- Native integration: Rust binary for keyboard capture and text simulation
- IPC-based communication: TIPC framework for type-safe RPC
- File-based persistence: JSON configuration + Markdown journals
- Local-first design: All data stored locally, cloud APIs optional

## Layers

**UI Layer (React):**
- Purpose: User interface and interaction
- Contains: Pages, components, hooks, context providers
- Location: `src/renderer/src/pages/*`, `src/renderer/src/components/*`
- Depends on: IPC layer (via tipcClient)
- Used by: End users

**Service Layer (Main Process):**
- Purpose: Business logic and background services
- Contains: Enhancement, Screen Capture, Auto-Journal, Periodic Screenshot, Media Controller
- Location: `src/main/services/*`
- Depends on: Logic layer, external APIs
- Used by: IPC layer

**Logic Layer (Main Process):**
- Purpose: Core application logic and data management
- Contains: Recording management, transcription, history analytics, configuration
- Location: `src/main/tipc.ts`, `src/main/llm.ts`, `src/main/history-store.ts`, `src/main/history-analytics.ts`
- Depends on: Data layer, service layer
- Used by: UI layer (via IPC)

**Data & Integration Layer:**
- Purpose: External communication and persistence
- Contains: API clients (OpenAI, Groq, Gemini), file I/O, keyboard capture (Rust FFI), window management
- Location: `src/main/keyboard.ts`, `src/main/window.ts`, `src/main/config.ts`
- Depends on: External services, file system
- Used by: Logic layer, service layer

## Data Flow

**Recording & Transcription Flow:**

1. User holds Ctrl key (800ms) → Rust binary (rdev) captures hotkey
2. Main process receives hotkey → window.ts shows panel
3. Renderer starts recording → recorder.ts (WebM audio stream)
4. User releases key → Recording blob sent via IPC
5. Main process chooses STT provider (local: sherpa-onnx OR remote: OpenAI/Groq)
6. Transcription completed → optional LLM enhancement via enhancement-service.ts
7. Result saved to history.json → historyStore
8. Text auto-inserted to active app via Rust binary (keyboard.ts)
9. Renderer receives notification via rendererHandlers.showNotification

**Journal Post Creation Flow:**

1. User navigates to `/pile/:pileName` → router.tsx
2. Pile data loaded from file system via ipcMain handlers
3. Posts component renders list from history
4. User clicks new post → Editor component
5. Post content edited → Posts/Post component
6. Save triggered → ipcMain.handle('save-post') → file I/O
7. Pile context updated → PilesContext refreshes
8. UI re-renders with new post

**Settings Configuration Flow:**

1. Settings component (Settings/index.jsx) renders form
2. User modifies setting (e.g., API key, model selection)
3. Form change handler calls tipcClient.setConfig()
4. Main process validates & persists to config.json via configStore
5. New config broadcast to all contexts via Electron events
6. UI components react to config changes

## Key Abstractions

**TIPC Router Pattern:**
- Purpose: Type-safe RPC-style IPC communication
- Location: `src/main/tipc.ts` (100+ procedures)
- Example: `createRecording`, `getConfig`, `enhanceTranscript`
- Pattern: Zod input validation, async procedures, typed responses

**Service Classes:**
- Purpose: Stateful domain services with lifecycle management
- Examples: `EnhancementService`, `ScreenCaptureService`, `AutoJournalService`
- Location: `src/main/services/`
- Pattern: Class-based with start/stop/restart methods, state machines, retry logic

**Context Providers:**
- Purpose: Global React state management
- Examples: `PilesContext`, `AIContext`, `IndexContext`, `TimelineContext`
- Location: `src/renderer/src/context/`
- Pattern: React Context API with custom hooks

**Custom Hooks:**
- Purpose: Reusable React logic
- Examples: `useIPCListener`, `usePost`, `useChat`, `useElectronStore`
- Location: `src/renderer/src/hooks/`
- Pattern: Composable hooks with IPC integration

**History Storage Pattern:**
- Purpose: In-memory index with lazy loading
- Location: `src/main/history-store.ts`
- Features: Filtering, sorting, pagination, format normalization

**Config Store Pattern:**
- Purpose: Atomic writes to prevent corruption
- Location: `src/main/config.ts`
- Features: Auto-migration, platform-specific paths, atomic file writes

## Entry Points

**Main Process:**
- Location: `src/main/index.ts`
- Responsibilities: App initialization, window creation, IPC router setup, global shortcuts, tray menu, background services

**Renderer Process:**
- Location: `src/renderer/src/main.tsx`
- Responsibilities: React DOM mount, router initialization, context providers, error boundary

**Preload Script:**
- Location: `src/preload/index.ts`
- Responsibilities: Expose safe IPC methods, prevent direct Node.js access, provide `window.electron` global

**Rust Binary:**
- Location: `liv-rs/` (built via `scripts/build-rs.sh`)
- Responsibilities: Global keyboard capture, text insertion simulation, platform-specific native APIs

## Error Handling

**Strategy:** Exception bubbling with classification and retry logic

**Patterns:**
- Services throw Error with descriptive messages
- Enhancement service classifies errors as retryable vs non-retryable
- Screen capture service uses state machine to prevent race conditions
- IPC procedures catch errors and return structured error notifications

## Cross-Cutting Concerns

**Logging:**
- Tool: Electron Log 5.4.3
- Location: `src/main/logger.ts`
- Features: File rotation, uncaught exception handling, context-based logging

**Validation:**
- Tool: TypeScript + implicit Zod-like validation
- Location: IPC procedures in `src/main/tipc.ts`
- Pattern: Input validation at boundaries

**Configuration:**
- Tool: Custom JSON-based config store
- Location: `src/main/config.ts`
- Pattern: Atomic writes, auto-migration, platform-specific paths

---

*Architecture analysis: 2026-01-16*
*Update when major patterns change*
