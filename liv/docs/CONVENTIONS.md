# Engineering Conventions

**Last updated:** 2026-02-21

## 1. Package Manager

**pnpm** is the only package manager. No npm, yarn, or bun.

```bash
pnpm install          # Install dependencies
pnpm dev              # Development (hot reload)
pnpm run lint         # ESLint
pnpm run typecheck    # TypeScript check (node + web)
pnpm build            # Full build
pnpm build:mac        # macOS distribution
```

The `packageManager` field in `package.json` enforces the pnpm version.

## 2. Source Layout

| Directory | Purpose |
|-----------|---------|
| `src/main/` | Electron main process (backend) |
| `src/main/services/` | Autonomous services (auto-journal, kanban, profile, capture) |
| `src/main/pile-handlers/` | Legacy Pile IPC handlers |
| `src/main/pile-utils/` | Legacy Pile utilities |
| `src/renderer/src/` | React frontend |
| `src/renderer/src/pages/` | Route pages |
| `src/renderer/src/components/` | Reusable UI components |
| `src/renderer/src/context/` | React contexts |
| `src/renderer/src/hooks/` | Custom hooks |
| `src/renderer/src/lib/` | Utilities (IPC client, recorder, i18n) |
| `src/shared/` | Shared types, constants, data model |
| `src/preload/` | Electron preload script |
| `liv-rs/` | Rust native binary |
| `docs/` | Documentation |
| `scripts/` | Build & dev scripts |

## 3. IPC & Contracts

- **New IPC procedures** must be added to `src/main/tipc.ts` with typed inputs/outputs.
- **Legacy Pile handlers** in `pile-handlers/*` use `ipcMain.handle` directly. Do not add new handlers there.
- Update `src/shared/data-model.ts` when adding/removing IPC procedures.
- Types go in `src/shared/types.ts` or domain-specific files under `src/shared/types/`.

## 4. Code Style

- **TypeScript** strict mode where possible. Avoid new `any` types.
- **No duplicate utilities** - reuse existing modules.
- **Small, predictable functions** - avoid large monolithic functions.
- **Avoid parallel implementations** - don't create new flows for the same responsibility.
- **Logging** - use `logger` from `src/main/logger.ts` instead of `console.log` in main process.
- **Styling** - TailwindCSS for new components. SCSS modules for complex component-scoped styles.
- **Components** - Radix UI primitives + Tailwind. Use existing `components/ui/*` wrappers.

## 5. File Naming

| Type | Convention | Example |
|------|-----------|---------|
| React components | PascalCase directory or file | `pages/pile/Chat/index.jsx` |
| Services | kebab-case | `auto-journal-service.ts` |
| Hooks | camelCase with `use` prefix | `useChat.jsx` |
| Contexts | PascalCase with `Context` suffix | `AIContext.jsx` |
| Types | PascalCase | `RecordingHistoryItem` |
| Utils | camelCase or kebab-case | `tipc-client.ts` |

## 6. Documentation Policy

Update on structural changes:

| File | When to update |
|------|----------------|
| `CLAUDE.md` | Routes, IPC, architecture, config changes |
| `README.md` | Product features, tech stack, getting started |
| `docs/ARCHITECTURE.md` | Module additions, architectural decisions |
| `docs/CONVENTIONS.md` | New patterns, tooling changes |
| `src/shared/data-model.ts` | IPC procedures, routes, modules |

## 7. Repo Hygiene

**Do not version:**
- Lock files other than `pnpm-lock.yaml`
- Build artifacts (`*.tsbuildinfo`, `out/`, `dist/`)
- Temporary screenshots and images
- `.DS_Store`, IDE files
- Environment files (`.env`, `.env.*`)

**`.gitignore` covers these** - verify before committing new file types.

## 8. Validation Before Merge

Minimum checks:

```bash
pnpm run typecheck    # Must pass
pnpm run lint         # Must pass
pnpm dev              # Smoke test: /settings, /chat, /auto-journal, /panel
```

## 9. Commit Message Format

```
<type>(<scope>): <subject>

<body>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, `test`

Example:
```
feat(auto-journal): add video context pipeline

Add screen recording analysis to auto-journal entries
with configurable video provider override.
```

## 10. Architecture Decisions

- **Prefer `tipc`** over `ipcMain.handle` for new IPC.
- **Prefer TypeScript** over JavaScript for new files.
- **Config changes** go in `config.ts` for general settings, `pile-utils/store.ts` for AI/chat settings.
- **React Query** (`@tanstack/react-query`) for data fetching in renderer.
- **Lazy loading** for all route pages (via `React.lazy` in `router.tsx`).
