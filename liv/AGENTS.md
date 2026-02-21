# AGENTS.md - AI Agent Protocol

**Project:** Liv v0.1.8

## Quick Context

1. Read `CLAUDE.md` - project map and architecture
2. Identify your task domain (UI, IPC, config, services)
3. Check `docs/ARCHITECTURE.md` for deeper understanding
4. Check `docs/CONVENTIONS.md` for code standards

## File Navigation

| Need | File |
|------|------|
| Record hotkey logic | `src/main/keyboard.ts` |
| Recording UI | `src/renderer/src/pages/panel.tsx` |
| Audio recording | `src/renderer/src/lib/recorder.ts` |
| Transcription API | `src/main/tipc.ts` → `createRecording` |
| LLM post-processing | `src/main/llm.ts` |
| Config (general) | `src/main/config.ts` |
| Config (AI/chat) | `src/main/pile-utils/store.ts` |
| IPC router | `src/main/tipc.ts` |
| Type definitions | `src/shared/types.ts` |
| Data model inventory | `src/shared/data-model.ts` |
| Window management | `src/main/window.ts` |
| System tray | `src/main/tray.ts` |
| Routing | `src/renderer/src/router.tsx` |
| Auto-journal | `src/main/services/auto-journal-service.ts` |
| Screen capture | `src/main/services/screen-capture-service.ts` |

## Workflows

### UI/UX Changes
1. Find page in `src/renderer/src/pages/`
2. Check route in `router.tsx`
3. Use TailwindCSS + Radix UI components
4. IPC: `import { tipcClient } from '@/lib/tipc-client'`
5. Data fetching: use `@tanstack/react-query`

### IPC/API Changes
1. Define types in `src/shared/types.ts`
2. Add procedure in `src/main/tipc.ts`
3. Call via `tipcClient.<namespace>.<procedure>()`
4. Update `src/shared/data-model.ts`

### Configuration Changes
1. Update `Config` type in `src/shared/types.ts`
2. Handle persistence in `src/main/config.ts`
3. Add UI in Settings page
4. Call `tipcClient.saveConfig()`

## Commit Format

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, `test`

## Validation

```bash
pnpm run typecheck    # Must pass
pnpm run lint         # Must pass
pnpm dev              # Smoke test
```

## Key Patterns

- **Dual config**: `config.ts` (general) vs `pile-utils/store.ts` (AI/chat). See CLAUDE.md section 4.
- **IPC**: Modern = `tipc.ts` (typed). Legacy = `pile-handlers/*` (ipcMain). Use modern for new code.
- **Styling**: TailwindCSS for components. SCSS modules for complex scoped styles.
- **Services**: Autonomous services in `src/main/services/` are long-running background processes.
- **Logging**: Use `logger` from `src/main/logger.ts`, not `console.log`.
