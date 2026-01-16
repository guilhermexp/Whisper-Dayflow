# Coding Conventions

**Analysis Date:** 2026-01-16

## Naming Patterns

**Files:**
- kebab-case for services/utilities: `screen-capture-service.ts`, `enhancement-service.ts`
- PascalCase for React components: `Button.tsx`, `Dashboard.jsx`, `AIContext.jsx`
- camelCase for hooks: `usePost.jsx`, `useChat.jsx`, `useIPCListener.jsx`
- SCSS modules: `Settings.module.scss`, `Chat.module.scss`

**Functions:**
- camelCase for all functions: `createRecording()`, `enhanceTranscript()`, `getCurrentPilePath()`
- No special prefix for async functions
- Event handlers: `handleClick`, `onSubmit`, `onChange` (varies)

**Variables:**
- camelCase for variables: `configStore`, `analyticsQuery`, `tipcClient`
- UPPER_SNAKE_CASE for constants: `MIN_RECORDING_MS`, `TARGET_SAMPLE_RATE`, `DEFAULT_PROMPT`
- Private members with underscore prefix: `_state`, `_workerReady`, `_maxRetries`

**Types:**
- PascalCase for interfaces: `Config`, `RecordingHistoryItem`, `EnhancementResult`
- PascalCase for type aliases: `UserConfig`, `ResponseData`
- PascalCase for enum names, UPPER_CASE for values: `CaptureState.Idle`, `ScreenCaptureErrorCode.NoDisplayFound`

## Code Style

**Formatting:**
- Tool: Prettier 3.7.1 (`.prettierrc`)
- No semicolons: `"semi": false`
- Single quotes in JSX attributes, template literals in code
- 2-space indentation
- Line width: 80 characters (Prettier default)

**Linting:**
- Tool: ESLint (`eslint.config.js` flat config format)
- Minimal rules (primarily relies on Prettier)
- Ignores: `node_modules/`, `out/`, `dist/`, `resources/`, `liv-rs/`

## Import Organization

**Order:**
1. External packages (React, Electron, etc.)
2. Type imports (`import type { ... }`)
3. Internal modules (`src/main/...`, `src/renderer/...`)
4. Relative imports (`./...`, `../...`)

**Path Aliases:**
- `~/*` → `src/renderer/src/*` (primary renderer alias)
- `@renderer/*` → `src/renderer/src/*`
- `@shared/*` → `src/shared/*`
- `renderer/*` → `src/renderer/src/*`

**Example:**
```typescript
// External packages
import { app, desktopCapturer } from "electron"
import { createWorker } from "tesseract.js"

// Type imports
import type { RecordingHistoryItem } from "../../shared/types"

// Internal modules
import { configStore } from "../config"
import { screenCaptureService } from "./screen-capture-service"

// Relative imports
import { utils } from "./utils"
```

## Error Handling

**Patterns:**
- Throw errors, catch at boundaries (IPC procedures, main functions)
- Extend Error class for custom errors: `ValidationError`, `NotFoundError`
- Async functions use try/catch, no .catch() chains

**Error Types:**
- Throw on invalid input, missing dependencies, invariant violations
- Log error with context before throwing: `logger.error({ err, context }, 'Failed to X')`

**Example from Screen Capture Service:**
```typescript
private classifyError(error: any): ErrorMetadata {
  const errorStr = error?.message?.toLowerCase() || String(error).toLowerCase()

  if (errorStr.includes("permission")) {
    return {
      code: ScreenCaptureErrorCode.PermissionDenied,
      retryable: false,
      message: "Screen recording permission denied by user"
    }
  }
  // ... more classification
}
```

## Logging

**Framework:**
- Electron Log 5.4.3 (`src/main/logger.ts`)
- File output with rotation (10MB max per file)
- Levels: info, warn, error

**Patterns:**
- Log at service boundaries, not in utility functions
- Log state transitions, external API calls, errors
- No console.log in committed code (use logger instead)

**Example:**
```typescript
import { logger, logInfo, logError } from './logger'

logInfo('Recording started')
logError('Failed to capture screen', error)
```

## Comments

**When to Comment:**
- Explain why, not what
- Document business logic, algorithms, edge cases
- Avoid obvious comments like `// increment counter`

**JSDoc/TSDoc:**
- Optional for internal functions if signature is self-explanatory
- Use @param, @returns, @throws tags when present

**TODO Comments:**
- Format: `// TODO: description` (no username)
- Link to issue if exists: `// TODO: Fix race condition (issue #123)`

**Section Comments:**
- Use divider-style comments for logical sections:
  ```typescript
  // ==========================================================================
  // ERROR CLASSIFICATION
  // ==========================================================================
  ```

## Function Design

**Size:**
- Keep under 50 lines where possible
- Extract helpers for complex logic
- One level of abstraction per function

**Parameters:**
- Max 3 parameters preferred
- Use options object for 4+ parameters: `function create(options: CreateOptions)`
- Destructure in parameter list: `function process({ id, name }: ProcessParams)`

**Return Values:**
- Explicit return statements
- Return early for guard clauses

## Module Design

**Exports:**
- Named exports preferred
- Default exports only for React components (varies)

**Barrel Files:**
- Use `index.ts` to re-export public API
- Avoid circular dependencies

---

*Convention analysis: 2026-01-16*
*Update when patterns change*
