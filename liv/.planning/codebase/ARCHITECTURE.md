# System Architecture

**Analysis Date:** 2026-01-16

## High-Level Design

```
┌─────────────────────────────────────────┐
│      Electron Main Process              │
│  (Node.js backend, system integration)  │
│  - IPC Router (tipc)                    │
│  - Service Layer                        │
│  - Configuration Management             │
│  - LLM Integration                      │
└─────────────────────────────────────────┘
         ↓↑ IPC (Type-safe, @egoist/tipc)
┌─────────────────────────────────────────┐
│    Preload Script (Security Bridge)     │
│  - Contextual Isolation Enabled         │
│  - Exposes Safe APIs to Renderer        │
└─────────────────────────────────────────┘
         ↓↑ Context Bridge
┌─────────────────────────────────────────┐
│    Renderer Process (React + Vite)      │
│  - UI Components (React 19.2.0)         │
│  - Context Providers                    │
│  - TanStack Query (Async State)         │
│  - React Router (Navigation)            │
└─────────────────────────────────────────┘
         ↓↑ Native Bindings (Child Process)
┌─────────────────────────────────────────┐
│      Rust Binary (liv-rs)               │
│  - Global Keyboard Capture (rdev)       │
│  - Text Simulation (enigo)              │
│  - JSON stdio communication             │
└─────────────────────────────────────────┘
         ↓↑ Network (HTTPS)
┌─────────────────────────────────────────┐
│    External APIs                        │
│  - OpenAI (Whisper, GPT)                │
│  - Groq (Whisper, Mixtral)              │
│  - Gemini, OpenRouter                   │
└─────────────────────────────────────────┘
```

---

## Layer Breakdown

### 1. Main Process (Node.js Backend)

**Responsibilities:**
- System integration (file I/O, keyboard hooks, tray)
- IPC request handling (tipc router)
- Business logic (transcription, LLM, analytics)
- Service orchestration (screen capture, auto-journal, enhancement)
- Configuration persistence (config.json, history.json)
- Logging (electron-log)

**Key Files:**
- `src/main/index.ts` - Bootstrap, window creation, lifecycle
- `src/main/tipc.ts` - IPC router with all procedures
- `src/main/config.ts` - Settings persistence
- `src/main/llm.ts` - LLM post-processing
- `src/main/keyboard.ts` - Global hotkey handling
- `src/main/window.ts` - Window management
- `src/main/tray.ts` - System tray
- `src/main/logger.ts` - Centralized logging

**Service Layer:**
- `src/main/services/screen-capture-service.ts` - Screenshot capture with OCR
- `src/main/services/auto-journal-service.ts` - Timeline summaries & GIF generation
- `src/main/services/enhancement-service.ts` - Transcript enhancement orchestration

**Patterns:**
- **Singleton Services:** Each service instantiated once per app lifecycle
- **Event-Driven:** Uses Node.js EventEmitter for keyboard events
- **Async/Await:** All I/O operations use promises
- **Error Classification:** Services use typed error codes (e.g., `ScreenCaptureErrorCode`)

---

### 2. Preload Script (Security Bridge)

**Responsibilities:**
- Expose safe APIs to renderer via `contextBridge`
- Isolate renderer from Node.js globals
- Provide file system access (read, write, mkdir, exists)
- Electron IPC bridging

**Key Files:**
- `src/preload/index.ts` - Main preload script
- `src/preload/index.d.ts` - TypeScript declarations for `window.electron`

**Exposed APIs:**
```typescript
window.electron = {
  // File system
  readFile, writeFile, mkdir, existsSync, joinPath,
  // Paths
  getConfigPath, getHistoryPath, getAppDataPath,
  // IPC
  ipcRenderer.send, ipcRenderer.on, ipcRenderer.invoke
}
```

**Security:**
- Context isolation: ✅ Enabled
- Node integration: ❌ Disabled in renderer
- Only whitelisted APIs exposed

---

### 3. Renderer Process (React Frontend)

**Responsibilities:**
- UI rendering and user interactions
- State management (TanStack Query, React Context)
- Client-side routing (React Router)
- IPC client communication (tipc)
- Audio recording (MediaRecorder API)

**Key Files:**
- `src/renderer/src/router.tsx` - Route definitions
- `src/renderer/src/pages/panel.tsx` - Recording overlay
- `src/renderer/src/pages/pile/` - Main application
  - `Layout.jsx` - Pile wrapper
  - `Navigation/index.jsx` - Bottom nav bar
  - `Settings/index.jsx` - Configuration UI
  - `Dashboard/index.jsx` - Analytics dashboard
  - `Chat/index.jsx` - AI chat
  - `AutoJournal/index.jsx` - Vision Assistant
  - `Kanban/index.jsx` - Task board
- `src/renderer/src/lib/recorder.ts` - Audio recording logic
- `src/renderer/src/lib/tipc-client.ts` - IPC client

**State Management:**
- **TanStack Query:** Async data fetching, caching, invalidation
- **React Context:** Global state (AIContext, PilesContext)
- **Local State:** Component-level with `useState`, `useReducer`

**Patterns:**
- **Custom Hooks:** `usePost`, `useChat`, `useIPCListener`
- **Context Providers:** Wrap routes in `AIContextProvider`, `PilesContextProvider`
- **Route-Based Code Splitting:** Lazy loading with `React.lazy()`
- **Radix UI Primitives:** Headless accessible components

---

### 4. Rust Binary (Native Layer)

**Responsibilities:**
- Global keyboard event capture (rdev)
- Text simulation into active applications (enigo)
- Cross-platform compatibility (macOS, Windows, Linux)

**Communication Protocol:**
- **Stdin/Stdout:** JSON messages
- **Format:** `{"event": "keydown", "key": "ControlLeft"}`

**Invocation:**
- Spawned as child process on app startup
- Supervised by main process (restarts on crash)

**Key Features:**
- **Non-blocking:** Events streamed in real-time
- **Platform Abstraction:** rdev handles OS differences
- **Error Handling:** Reports errors via stderr

**Status:**
- ✅ Production-ready on macOS/Windows
- ⚠️ Linux support planned

---

## Key Architectural Patterns

### 1. Type-Safe IPC (TIPC)

**Library:** `@egoist/tipc@0.3.2`

**Pattern:**
```typescript
// Define router (main process)
const recordingRouter = t.router({
  startRecording: t.procedure
    .input(z.object({ audioBlob: z.instanceof(Blob) }))
    .mutation(async ({ input }) => {
      // Business logic
    })
});

// Call from renderer
const result = await tipcClient.startRecording.mutate({ audioBlob });
```

**Benefits:**
- Full TypeScript type safety
- Auto-completion in renderer
- Runtime validation with Zod schemas
- Eliminates IPC string coupling

---

### 2. Service Layer Pattern

**Structure:**
```typescript
export class ScreenCaptureService {
  private state: ScreenCaptureState = { status: 'idle', ... };

  async captureScreen(): Promise<ScreenCaptureResult | null> {
    // State machine logic
    // Error classification
    // Retry with backoff
  }
}
```

**Services:**
- `EnhancementService` - Transcript enhancement orchestration
- `ScreenCaptureService` - Screenshot capture with OCR
- `AutoJournalService` - Timeline summaries & GIF generation

**Benefits:**
- Encapsulation of complex logic
- Testable (though no tests exist yet)
- State management via state machines
- Consistent error handling

---

### 3. Context Providers (React)

**Pattern:**
```typescript
export const AIContextProvider = ({ children }) => {
  const [providers, setProviders] = useState(/* ... */);
  const value = { providers, setProviders, ... };
  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
};

// Usage
const { providers } = useContext(AIContext);
```

**Contexts:**
- `AIContext` - LLM provider configuration
- `PilesContext` - Journal/pile management

---

### 4. Error Handling Strategy

**Main Process:**
```typescript
try {
  const result = await service.doSomething();
  return { success: true, data: result };
} catch (error) {
  logger.error('Operation failed', error);
  return { success: false, error: error.message };
}
```

**Renderer:**
```typescript
const { data, error, isLoading } = useQuery({
  queryKey: ['recordings'],
  queryFn: () => tipcClient.getRecordings.query()
});

if (error) return <ErrorMessage error={error} />;
```

**Logging:**
- All errors logged to `main.log` via electron-log
- Errors displayed in UI (Settings panel, toasts)

---

### 5. State Machine Pattern (Screen Capture)

**States:** `Idle → Starting → Capturing → Paused → Idle`

**Transitions:**
```typescript
private transitionTo(newStatus: ScreenCaptureStatus) {
  const validTransitions = {
    idle: ['starting'],
    starting: ['capturing', 'idle'],
    capturing: ['paused', 'idle'],
    paused: ['capturing', 'idle']
  };

  if (!validTransitions[this.state.status].includes(newStatus)) {
    throw new Error(`Invalid transition: ${this.state.status} -> ${newStatus}`);
  }

  this.state.status = newStatus;
}
```

**Benefits:**
- Prevents race conditions
- Clear error handling per state
- Testable transitions

---

## Data Flow Examples

### Recording Flow

```
User holds Ctrl (800ms)
  ↓
Rust binary → Main process (keyboard.ts)
  ↓
Open panel window, emit 'recording-started'
  ↓
Renderer starts MediaRecorder, streams WebM audio
  ↓
User releases Ctrl
  ↓
Renderer sends audio Blob via IPC
  ↓
Main process transcribes via OpenAI/Groq
  ↓
Optional: LLM post-processing (llm.ts)
  ↓
Main process simulates text insertion (Rust binary)
  ↓
Save to history.json, update analytics
  ↓
Renderer displays result, closes panel
```

---

### Auto-Journal Flow

```
User triggers auto-journal run (Settings UI)
  ↓
Renderer calls tipcClient.runAutoJournal.mutate()
  ↓
Main process (auto-journal-service.ts):
  1. Collects screenshots from time window
  2. Runs OCR on each screenshot (Tesseract.js)
  3. Generates animated GIF (FFmpeg)
  4. Injects OCR text + images into LLM prompt
  5. Generates summary via OpenAI/Groq/Gemini
  6. Saves to pile index
  ↓
Renderer displays result in Vision Assistant UI
```

---

### Settings Persistence Flow

```
User changes setting in UI
  ↓
Renderer calls tipcClient.updateConfig.mutate({ key, value })
  ↓
Main process (config.ts):
  1. Load config.json from appData
  2. Merge new value
  3. Atomic write to config.json
  4. Return updated config
  ↓
Renderer updates local state via TanStack Query invalidation
  ↓
UI reflects new setting immediately
```

---

## Security Architecture

**Principles:**
1. **Context Isolation:** Renderer cannot access Node.js APIs
2. **Whitelisted APIs:** Only necessary functions exposed via preload
3. **API Key Encryption:** Planned (currently plaintext in config.json)
4. **No Remote Code:** All code bundled with app
5. **CSP Headers:** Content Security Policy configured

**Current Vulnerabilities:**
- ⚠️ API keys stored in plaintext (planned: electron-store encryption)
- ⚠️ Custom HTML sanitizer (should use DOMPurify)

---

## Performance Considerations

**Main Process:**
- **Non-blocking I/O:** All file operations use async/await
- **Worker Offloading:** Planned for heavy operations (analytics)

**Renderer:**
- **Code Splitting:** Routes lazy-loaded
- **Virtualization:** Long lists use TanStack Virtual
- **Memoization:** React.memo, useMemo for expensive computations

**Storage:**
- **Single File:** All recordings in `history.json` (scaling limit: ~10K recordings)
- **Planned:** Chunked storage by month/year

---

## Scaling Limits

**Current Capacity:**
- Recordings: ~10,000 (single JSON file)
- Analytics: In-memory processing (high RAM with large history)

**Bottlenecks:**
- File-based storage (no database)
- Synchronous analytics computation
- Single-threaded main process

**Scaling Path:**
- Implement SQLite database
- Chunk history by time period
- Move analytics to web worker

---

*Architecture snapshot: 2026-01-16*
*Update as system evolves*
