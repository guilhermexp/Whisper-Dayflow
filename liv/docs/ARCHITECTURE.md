# Architecture Overview

Last updated: 2026-02-22

## Runtime layers
1. Renderer (`src/renderer/src`) - React UI
2. Main (`src/main`) - Electron backend
3. Native (`liv-rs`) - OS-level keyboard/input support

## IPC model
Single backend IPC via `tipc`.
- Router: `src/main/tipc.ts`
- Client: `src/renderer/src/lib/tipc-client.ts`
- Event handlers: `src/main/renderer-handlers.ts` + `rendererHandlers` client

Legacy `pile-ipc`/`pile-handlers` foi removido.

## Main modules
- App bootstrap: `src/main/index.ts`
- Windows/tray/menu: `src/main/window.ts`, `src/main/tray.ts`, `src/main/menu.ts`
- Transcription pipeline: `src/main/keyboard.ts`, `src/main/llm.ts`, `src/main/local-transcriber.ts`
- Config/history/analytics: `src/main/config.ts`, `src/main/history-store.ts`, `src/main/history-analytics.ts`
- Services: `src/main/services/*`
- Pile utils (domain logic): `src/main/pile-utils/*`

## Renderer modules
- Router: `src/renderer/src/router.tsx`
- Pile pages: `src/renderer/src/pages/pile/*`
- Panel overlay: `src/renderer/src/pages/panel.tsx`
- Contexts/hooks: `src/renderer/src/context/*`, `src/renderer/src/hooks/*`

## Shared contracts
- Domain types: `src/shared/types.ts`
- Technical inventory: `src/shared/data-model.ts`
