# Quickstart (Liv)

## Requisitos
- Node.js 18+
- pnpm 9+

## Instalação e execução
```bash
pnpm install
pnpm dev
```

## Build
```bash
pnpm build
pnpm build:mac
pnpm build:win
pnpm build:linux
```

## Arquitetura (resumo)
- Main: `src/main/` (Electron + backend local)
- Renderer: `src/renderer/src/` (React)
- Shared: `src/shared/` (tipos/contratos)
- Native: `liv-rs/` (binário Rust)

## IPC
Backend único via `tipc`:
- servidor: `src/main/tipc.ts`
- cliente: `src/renderer/src/lib/tipc-client.ts`

## Arquivos-chave
- Rotas: `src/renderer/src/router.tsx`
- Gravação painel: `src/renderer/src/pages/panel.tsx`
- Recorder web: `src/renderer/src/lib/recorder.ts`
- Config: `src/main/config.ts`
- Data model: `src/shared/data-model.ts`
