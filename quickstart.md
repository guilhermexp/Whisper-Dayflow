# Quickstart para Agentes

Este guia orienta qualquer agente a entender a aplicação, executar localmente, modificar com segurança e evitar regressões.

## Visão Rápida
- App Electron (Main) + React/Vite (Renderer).
- Função principal: ditar → transcrever (OpenAI/Groq) → pós-processar (OpenAI/Groq/Gemini) → salvar áudio e texto → copiar/“digitar”.
- Dados locais: `config.json` e gravações em `recordings/` dentro `appData/<APP_ID>`.

## Setup
- Requisitos: Node 18+, pnpm 9 (ou npm), macOS/Windows/Linux.
- Instalação:
  - `cd whispo`
  - `pnpm install`
- Desenvolvimento:
  - `pnpm dev` inicia app com hot-reload.
- Build:
  - `pnpm build` e (opcional) `pnpm build:mac|win|linux`.

## Arquitetura
- Processo Main (Electron): janelas, atalhos globais, IPC, protocolo `assets://`, tray, updater.
  - Bootstrap: `whispo/src/main/index.ts:23`
  - Janelas: `whispo/src/main/window.ts:18`
  - Atalhos: `whispo/src/main/keyboard.ts:84`
  - IPC (router): `whispo/src/main/tipc.ts:44`
  - Protocolo: `whispo/src/main/serve.ts:53`
  - Tray: `whispo/src/main/tray.ts:65`
  - Config: `whispo/src/main/config.ts:20`
  - LLM: `whispo/src/main/llm.ts:5`
  - Toast de ESC/hint overlay: `whispo/src/main/hint-window.ts:1`
  - Estado/cancelamentos: `whispo/src/main/state.ts:1`
- Renderer (React): rotas, páginas, UI do painel, cliente IPC.
  - Router: `whispo/src/renderer/src/router.tsx`
  - Painel: `whispo/src/renderer/src/pages/panel.tsx:14`
  - Gravador: `whispo/src/renderer/src/lib/recorder.ts:35`
  - IPC client: `whispo/src/renderer/src/lib/tipc-client.ts:5`
- Tipos: `whispo/src/shared/types.ts`

## Data Model Compartilhado
- Tipos principais:
  - `RecordingHistoryItem`: `whispo/src/shared/types.ts:3`
  - `Config`: `whispo/src/shared/types.ts:10`
- Inventário para agentes: `whispo/src/shared/data-model.ts` consolida entidades, módulos, APIs IPC, rotas e protocolos.

## APIs (IPC) — Assinaturas
- App: `restartApp` (`whispo/src/main/tipc.ts:45`).
- Atualização: `getUpdateInfo` (50), `checkForUpdatesAndDownload` (61), `quitAndInstall` (55).
- Permissões: `getMicrophoneStatus` (121), `requestMicrophoneAccess` (135), `isAccessibilityGranted` (125), `requestAccesssbilityAccess` (129), `openMicrophoneInSystemPreferences` (67).
- Janela/UI: `showPanelWindow` (139), `hidePanelWindow` (73), `showContextMenu(input)` (79), `displayError(input)` (143).
- Gravações: `createRecording(input)` (149), `getRecordingHistory` (228), `deleteRecordingItem(input)` (230), `deleteRecordingHistory` (240).
- Cancelamento: `cancelTranscription` (`whispo/src/main/tipc.ts:311`) aborta STT/pós-processamento ativo.
- Config: `getConfig` (244), `saveConfig(input)` (248).
- Estado gravação: `recordEvent(input)` (254).

## Fluxo Operacional
- Atalho global → painel (`whispo/src/main/window.ts:189`).
- Gravação: `Recorder.startRecording()` (`whispo/src/renderer/src/lib/recorder.ts:93`).
- Visualização RMS: evento `visualizer-data` (76) → UI painel.
- Fim da gravação: `record-end` (132) → transcrição via `createRecording`.
- Cancelamento: duplo ESC chama `cancelTranscription` (`whispo/src/main/tipc.ts:311`), que aborta controladores (`whispo/src/main/state.ts:8`) e mostra toast externo (`whispo/src/main/hint-window.ts:1`); painel fica apenas com spinner durante STT.
- STT: POST `/audio/transcriptions` (172–183).
- Pós-processamento (opcional): `postProcessTranscript` (`whispo/src/main/llm.ts:5`) aceita `AbortSignal` para respeitar cancelamentos.
- Persistência: `.webm` (204–207) + `history.json` (37–42).
- Feedback: atualizar histórico (211–214), copiar/“digitar” (221–225).

## Atalhos de Gravação
- **Hold Ctrl** (`shortcut = "hold-ctrl"`, padrão): segura Ctrl por ~800 ms para iniciar; soltou, finaliza; pressionar outra tecla cancela.
- **Instant Ctrl** (`"instant-ctrl"`): inicia imediatamente no `KeyDown` de Ctrl (push-to-talk). Usa o duplo ESC para cancelar.
- **Fn Key** (`"fn-key"`): usa a tecla Fn em modo push-to-talk (requer permissão de Acessibilidade no macOS). Cancela com ESC duas vezes.
- **Ctrl+/** (`"ctrl-slash"`): tecla de alternância; um toque inicia, outro finaliza; ESC cancela.
- Seleção e textos explicativos ficam em `Settings → Shortcuts` (`src/renderer/src/pages/settings-general.tsx`).

## Como Modificar com Segurança
- UI/Rotas:
  - Crie páginas em `whispo/src/renderer/src/pages` e registre em `whispo/src/renderer/src/router.tsx`.
- APIs IPC:
  - Adicione `t.procedure` no `router` (`whispo/src/main/tipc.ts:44`).
  - Consuma via `tipcClient` (`whispo/src/renderer/src/lib/tipc-client.ts:5`).
- Persistência/Config:
  - Use `configStore.save/get` (`whispo/src/main/config.ts:31,27`).
  - Gravações e histórico em `recordingsFolder` (`whispo/src/main/config.ts:8`).
- Protocolo de arquivos:
  - Servir gravações via `assets://recording/<id>` (`whispo/src/main/serve.ts:68`).

## Convenções & Boas Práticas
- TypeScript, React, Electron; siga padrões existentes de imports e módulos.
- Não logue segredos; configure chaves via UI de Settings ou `config.json`.
- Mantenha arquivos abaixo de ~500 linhas; prefira módulos auxiliares.
- Evite `console.log` em produção; use condicional `import.meta.env.DEV` quando necessário.

## Problemas Conhecidos
- Sem bloqueios conhecidos no fork atual; valide sempre o fluxo de cancelamento duplo ESC descrito em `ai_changelog/CHANGELOG_FORK.md`.

## Checklist de Alterações
- Criar/editar API IPC → atualizar cliente no Renderer.
- Persistência → garantir criação de pastas (`fs.mkdirSync(recordingsFolder, { recursive: true })`).
- UI → validar eventos renderer handlers (`whispo/src/main/renderer-handlers.ts`).
- Testar: fluxo completo atalho → painel → gravação → transcrição → histórico.

## Troubleshooting
- Acessibilidade (macOS): conceder em Sistema; checado via `isAccessibilityGranted` (`whispo/src/main/utils.ts:3`).
- Permissão de microfone: `requestMicrophoneAccess` (`whispo/src/main/tipc.ts:135`).
- Cancelamento não reage: invoque `cancelTranscription` manualmente e confira `state.transcriptionAbortController` (`whispo/src/main/state.ts:1`).
- Provedores:
  - STT: `openaiApiKey/baseUrl`, `groqApiKey/baseUrl` em `Config`.
  - LLM: `transcriptPostProcessingEnabled`, `transcriptPostProcessingProviderId`, `gemini/openai/groq` chaves em `Config`.

---
Use `whispo/src/shared/data-model.ts` como referência central ao navegar e validar mudanças. 
