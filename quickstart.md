# Quickstart para Agentes

Este guia orienta qualquer agente a entender a aplicação, executar localmente, modificar com segurança e evitar regressões.

## Visão Rápida
- App Electron (Main) + React/Vite (Renderer).
- Função principal: ditar → transcrever (OpenAI/Groq) → pós-processar (OpenAI/Groq/Gemini/OpenRouter) → salvar áudio e texto → copiar/"digitar".
- **Interface integrada**: Pile (journaling) + Whispo (transcrição) em uma única aplicação.
- **Contexto opcional**: Captura de clipboard, texto selecionado (placeholder) e OCR da janela ativa.
- **Auto-diário**: resume gravações recentes e pode anexar OCR da janela ativa (flag opcional).
- **Kanban**: board para gerenciamento de tarefas integrado.
- Dados locais: `config.json` e gravações em `recordings/` dentro `appData/<APP_ID>`.

## Setup
- Requisitos: Node 18+, pnpm 9 (ou npm), macOS/Windows/Linux.
- Instalação:
  - `cd liv`
  - `pnpm install`
- Desenvolvimento:
  - `pnpm dev` inicia app com hot-reload.
- Build:
  - `pnpm build` e (opcional) `pnpm build:mac|win|linux`.

## Arquitetura
- Processo Main (Electron): janelas, atalhos globais, IPC, protocolo `assets://`, tray, updater.
  - Bootstrap: `liv/src/main/index.ts:23`
  - Janelas: `liv/src/main/window.ts:18`
  - Atalhos: `liv/src/main/keyboard.ts:84`
  - IPC (router): `liv/src/main/tipc.ts:44`
  - Protocolo: `liv/src/main/serve.ts:53`
  - Tray: `liv/src/main/tray.ts` (com Enhancement submenu)
  - Config: `liv/src/main/config.ts:20`
  - LLM: `liv/src/main/llm.ts:5`
  - Toast de ESC/hint overlay: `liv/src/main/hint-window.ts:1`
  - Estado/cancelamentos: `liv/src/main/state.ts:1`
- Renderer (React): rotas, páginas, UI do painel, cliente IPC.
  - Router: `liv/src/renderer/src/router.tsx`
  - **Pile UI** (interface principal): `liv/src/renderer/src/pages/pile/`
    - Settings: `liv/src/renderer/src/pages/pile/Settings/index.jsx`
    - Analytics: `liv/src/renderer/src/pages/pile/Analytics/index.jsx`
    - Dashboard: `liv/src/renderer/src/pages/pile/Dashboard/index.jsx`
    - AutoJournal: `liv/src/renderer/src/pages/pile/AutoJournal/index.jsx`
    - Timeline: `liv/src/renderer/src/pages/pile/Timeline/index.jsx`
    - Search: `liv/src/renderer/src/pages/pile/Search/index.jsx`
    - Kanban: `liv/src/renderer/src/pages/pile/Kanban/index.jsx`
    - Chat: `liv/src/renderer/src/pages/pile/Chat/index.jsx`
  - Painel de gravação: `liv/src/renderer/src/pages/panel.tsx:14`
  - Gravador: `liv/src/renderer/src/lib/recorder.ts:35`
  - IPC client: `liv/src/renderer/src/lib/tipc-client.ts:5`
- Tipos: `liv/src/shared/types.ts`
- Design System: `liv/ai_docs/design-system-analysis.md`

## Rotas da Aplicação
- `/` - Pile (interface principal com journaling + transcrição integrada)
- `/pile/:pileName` - Visualização de pile específico
- `/pile/:pileName/settings` - Configurações (route-based)
- `/pile/:pileName/dashboard` - Dashboard com analytics (route-based)
- `/pile/:pileName/auto-journal` - Auto Journal (route-based)
- `/pile/:pileName/timeline` - Timeline de atividades (route-based)
- `/pile/:pileName/search` - Busca semântica (route-based)
- `/pile/:pileName/kanban` - Kanban board (route-based)
- `/pile/:pileName/chat` - Chat com AI (route-based)
- `/create-pile` - Criar novo pile
- `/liv-config` - Configuração do Liv
- `/setup` - Wizard de setup inicial
- `/panel` - Painel de gravação (overlay)

**Nota**: Páginas foram migradas de Dialog-based para route-based. Cada página agora é uma rota separada com seu próprio `.pageContainer`.

## Design System (v2.0)

### Estrutura de Página (Route-based)
Todas as páginas seguem o mesmo padrão:
```scss
.pageContainer {
  position: fixed;
  top: 30px;
  left: calc(56px + 8px);  // nav-rail-width + gap
  right: 12px;
  bottom: 12px;
  background-color: var(--bg);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1400;
}
```

### Header Padrão
```scss
.header {
  padding: 0 32px;
  flex-shrink: 0;
  background: transparent;
  -webkit-app-region: drag;
}

.wrapper {
  height: 52px;
  display: flex;
  align-items: center;
  position: relative;
}
```

### Cards (Estilo Minimalista)
```scss
// Usar background transparente com borda
.Card {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
```

### Scrollbars (Invisíveis)
```scss
&::-webkit-scrollbar {
  display: none;
}
-ms-overflow-style: none;
scrollbar-width: none;
```

### Variáveis de Layout
```scss
--sidebar-width: 320px;     // Aumentado de 250px
--nav-rail-width: 56px;
--nav-height: 52px;
```

### Largura de Conteúdo
```scss
.editor, .message {
  max-width: 800px;  // Aumentado de 600px
}
```

## UI Components (Pile)

### Settings (Route-based)
- Rota: `/pile/:pileName/settings`
- Tabs: Diário, IA, Transcrição
- Arquivo: `liv/src/renderer/src/pages/pile/Settings/index.jsx`
- **Prompt Editor**: Modal para visualizar/editar prompts de enhancement

### Analytics (Dialog)
- Acesso: ícone de gauge no nav bar
- Tabs: Analytics (stats, performance), History (todas transcrições)
- Arquivo: `liv/src/renderer/src/pages/pile/Analytics/index.jsx`

### Dashboard (Route-based)
- Rota: `/pile/:pileName/dashboard`
- Tabs: Overview (charts Recharts), Histórico (transcrições com thumbnails)
- Arquivo: `liv/src/renderer/src/pages/pile/Dashboard/index.jsx`

### Auto Journal (Route-based)
- Rota: `/pile/:pileName/auto-journal`
- Tabs: Execuções, Configurações
- GIF preview centralizado com screenshots do período
- Arquivo: `liv/src/renderer/src/pages/pile/AutoJournal/index.jsx`

### Timeline (Route-based)
- Rota: `/pile/:pileName/timeline`
- Split pane: Timeline visual à esquerda, detalhes à direita
- Arquivo: `liv/src/renderer/src/pages/pile/Timeline/index.jsx`

### Search (Route-based)
- Rota: `/pile/:pileName/search`
- Busca semântica no jornal usando vector search
- Arquivo: `liv/src/renderer/src/pages/pile/Search/index.jsx`

### Kanban (Route-based)
- Rota: `/pile/:pileName/kanban`
- 3 colunas: Backlog, Em Progresso, Concluído
- Cards com tags e drag-and-drop
- Arquivo: `liv/src/renderer/src/pages/pile/Kanban/index.jsx`

### Chat (Route-based)
- Rota: `/pile/:pileName/chat`
- **Funcionalidades**:
  - Painel de contexto (toggle lateral; usa entradas do jornal)
  - Seletor de tema (dropdown com 5 cores)
  - Exportar conversa (salva como .txt)
  - Animações suaves com AnimatePresence
- Arquivo: `liv/src/renderer/src/pages/pile/Chat/index.jsx`

### Tray Menu
- Start/Cancel Recording
- Open Pile
- Enhancement (submenu com toggle e seleção de provider)
- Settings
- Quit

## Data Model Compartilhado
- Tipos principais:
  - `RecordingHistoryItem`: `liv/src/shared/types.ts:3`
  - `Config`: `liv/src/shared/types.ts:10`
- Inventário para agentes: `liv/src/shared/data-model.ts` consolida entidades, módulos, APIs IPC, rotas e protocolos.

## APIs (IPC) — Assinaturas
- App: `restartApp` (`liv/src/main/tipc.ts:45`).
- Atualização: `getUpdateInfo` (50), `checkForUpdatesAndDownload` (61), `quitAndInstall` (55).
- Permissões: `getMicrophoneStatus` (121), `requestMicrophoneAccess` (135), `isAccessibilityGranted` (125), `requestAccesssbilityAccess` (129), `openMicrophoneInSystemPreferences` (67).
- Janela/UI: `showPanelWindow` (139), `hidePanelWindow` (73), `showContextMenu(input)` (79), `displayError(input)` (143).
- Gravações: `createRecording(input)` (149), `getRecordingHistory` (228), `deleteRecordingItem(input)` (230), `deleteRecordingHistory` (240).
- Analytics: `getRecordingAnalytics` - métricas agregadas de uso.
- Cancelamento: `cancelTranscription` (`liv/src/main/tipc.ts:311`) aborta STT/pós-processamento ativo.
- Config: `getConfig` (244), `saveConfig(input)` (248).
- Estado gravação: `recordEvent(input)` (254).
- Media: `playSound`, `stopSound`, `pauseRecording`, `resumeRecording` via media-controller.

## Fluxo Operacional
- Atalho global → painel (`liv/src/main/window.ts:189`).
- Gravação: `Recorder.startRecording()` (`liv/src/renderer/src/lib/recorder.ts:93`).
- Visualização RMS: evento `visualizer-data` (76) → UI painel.
- Fim da gravação: `record-end` (132) → transcrição via `createRecording`.
- Cancelamento: duplo ESC chama `cancelTranscription` (`liv/src/main/tipc.ts:311`), que aborta controladores (`liv/src/main/state.ts:8`) e mostra toast externo (`liv/src/main/hint-window.ts:1`); painel fica apenas com spinner durante STT.
- STT: POST `/audio/transcriptions` (172–183).
- Pós-processamento (opcional): `postProcessTranscript` (`liv/src/main/llm.ts:5`) aceita `AbortSignal` para respeitar cancelamentos.
- Persistência: `.webm` (204–207) + `history.json` (37–42).
- Feedback: atualizar histórico (211–214), copiar/"digitar" (221–225).

## Atalhos de Gravação
- **Hold Ctrl** (`shortcut = "hold-ctrl"`, padrão): segura Ctrl por ~800 ms para iniciar; soltou, finaliza; pressionar outra tecla cancela.
- **Instant Ctrl** (`"instant-ctrl"`): inicia imediatamente no `KeyDown` de Ctrl (push-to-talk). Usa o duplo ESC para cancelar.
- **Fn Key** (`"fn-key"`): usa a tecla Fn em modo push-to-talk (requer permissão de Acessibilidade no macOS). Cancela com ESC duas vezes.
- **Ctrl+/** (`"ctrl-slash"`): tecla de alternância; um toque inicia, outro finaliza; ESC cancela.
- Configuração de atalhos: Settings → aba Transcrição.

## Como Modificar com Segurança
- UI/Rotas:
  - Crie páginas em `liv/src/renderer/src/pages/pile/` seguindo padrão route-based.
  - Use `.pageContainer` pattern para layout consistente.
  - Siga design system em `liv/ai_docs/design-system-analysis.md`.
  - Registre rotas em `liv/src/renderer/src/router.tsx`.
- APIs IPC:
  - Adicione `t.procedure` no `router` (`liv/src/main/tipc.ts:44`).
  - Consuma via `tipcClient` (`liv/src/renderer/src/lib/tipc-client.ts:5`).
- Persistência/Config:
  - Use `configStore.save/get` (`liv/src/main/config.ts:31,27`).
  - Gravações e histórico em `recordingsFolder` (`liv/src/main/config.ts:8`).
- Protocolo de arquivos:
  - Servir gravações via `assets://recording/<id>` (`liv/src/main/serve.ts:68`).

## Padrões de UI (v2.0)
- **Route-based pages**: Todas páginas principais são rotas, não dialogs.
- **Page container**: Usar `.pageContainer` com position fixed e border-radius 16px.
- **Cards minimalistas**: Background transparente + border 1px solid var(--border).
- **Scrollbars invisíveis**: display: none em ::-webkit-scrollbar.
- **Styling**: SCSS modules para cada página (`.module.scss`).
- **Data fetching**: React Query (`useQuery`, `useMutation`) via `tipcClient`.
- **Charts**: Recharts para gráficos (LineChart, PieChart).

## Convenções & Boas Práticas
- TypeScript, React, Electron; siga padrões existentes de imports e módulos.
- Não logue segredos; configure chaves via UI de Settings ou `config.json`.
- Mantenha arquivos abaixo de ~500 linhas; prefira módulos auxiliares.
- Evite `console.log` em produção; use condicional `import.meta.env.DEV` quando necessário.

## Problemas Conhecidos
- Sem bloqueios conhecidos no fork atual; valide sempre o fluxo de cancelamento duplo ESC.

## Checklist de Alterações
- Criar/editar API IPC → atualizar cliente no Renderer.
- Persistência → garantir criação de pastas (`fs.mkdirSync(recordingsFolder, { recursive: true })`).
- UI → validar eventos renderer handlers (`liv/src/main/renderer-handlers.ts`).
- Novas páginas → seguir design system e padrão route-based.
- Testar: fluxo completo atalho → painel → gravação → transcrição → histórico.

## Troubleshooting
- Acessibilidade (macOS): conceder em Sistema; checado via `isAccessibilityGranted` (`liv/src/main/utils.ts:3`).
- Permissão de microfone: `requestMicrophoneAccess` (`liv/src/main/tipc.ts:135`).
- Cancelamento não reage: invoque `cancelTranscription` manualmente e confira `state.transcriptionAbortController` (`liv/src/main/state.ts:1`).
- Provedores:
  - STT: `openaiApiKey/baseUrl`, `groqApiKey/baseUrl` em `Config`.
  - LLM: `enhancementEnabled`, `enhancementProvider`, chaves de API em `Config`.

---
Use `liv/src/shared/data-model.ts` como referência central ao navegar e validar mudanças.
Use `liv/ai_docs/design-system-analysis.md` como referência para estilos visuais.
