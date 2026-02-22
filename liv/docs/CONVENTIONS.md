# Engineering Conventions

Last updated: 2026-02-22

## Package manager
- Official: **pnpm only**.

## IPC conventions
- All renderer↔main procedures must be in `src/main/tipc.ts`.
- Renderer must call backend via `tipcClient`.
- Do not introduce new direct `ipcMain.handle` channels for product features.
- Update `src/shared/data-model.ts` when routes/modules/contracts change.

## Code conventions
- Prefer TypeScript for new backend/frontend modules.
- Avoid duplicate utility flows for same responsibility.
- Keep functions small and explicit.

## Repository hygiene
Do not version:
- `bun.lock`, `package-lock.json`
- `*.tsbuildinfo`
- temporary screenshots/files

## Validation before merge
```bash
pnpm run typecheck
pnpm run lint
```
