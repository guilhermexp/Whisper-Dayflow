# Quickstart para Agentes

Este guia orienta qualquer agente a entender a aplicação, executar localmente, modificar com segurança e evitar regressões.

## Visão Rápida
- App Electron (Main) + React/Vite (Renderer).
- Função principal: ditar → transcrever (OpenAI/Groq) → pós-processar (OpenAI/Groq/Gemini/OpenRouter) → salvar áudio e texto → copiar/"digitar".
- **Interface integrada**: Pile (journaling) + Whispo (transcrição) em uma única aplicação.
- **Contexto opcional**: Captura de clipboard, texto selecionado (placeholder) e OCR da janela ativa.
- **Vision Assistant** (ex-Auto Journal): resume gravações com UI de calendário fluido e sumários auto-gerados via LLM.
- **Kanban**: board para gerenciamento de tarefas integrado.
- **Logging centralizado**: electron-log com logs persistentes em arquivos.
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
  - Logger: `liv/src/main/logger.ts` (electron-log centralizado)
  - LLM: `liv/src/main/llm.ts:5`
  - Pile Index: `liv/src/main/pile-utils/pileIndex.js` (geração de sumários)
  - Toast de ESC/hint overlay: `liv/src/main/hint-window.ts:1`
  - Estado/cancelamentos: `liv/src/main/state.ts:1`
- Renderer (React): rotas, páginas, UI do painel, cliente IPC.
  - Router: `liv/src/renderer/src/router.tsx`
  - **Pile UI** (interface principal): `liv/src/renderer/src/pages/pile/`
    - Navigation: `liv/src/renderer/src/pages/pile/Navigation/index.jsx` (bottom nav bar)
    - Settings: `liv/src/renderer/src/pages/pile/Settings/index.jsx`
    - Analytics: `liv/src/renderer/src/pages/pile/Analytics/index.jsx`
    - Dashboard: `liv/src/renderer/src/pages/pile/Dashboard/index.jsx`
    - Vision Assistant: `liv/src/renderer/src/pages/pile/AutoJournal/index.jsx` (calendário fluido)
    - Timeline: `liv/src/renderer/src/pages/pile/Timeline/index.jsx` (com sumários)
    - Search: `liv/src/renderer/src/pages/pile/Search/index.jsx`
    - Kanban: `liv/src/renderer/src/pages/pile/Kanban/index.jsx`
    - Chat: `liv/src/renderer/src/pages/pile/Chat/index.jsx`
    - Profile: `liv/src/renderer/src/pages/pile/Profile/index.jsx` (em desenvolvimento)
  - Painel de gravação: `liv/src/renderer/src/pages/panel.tsx:14`
  - Gravador: `liv/src/renderer/src/lib/recorder.ts:35`
  - IPC client: `liv/src/renderer/src/lib/tipc-client.ts:5`
- Tipos: `liv/src/shared/types.ts`
- Design System: `liv/ai_docs/design-system-analysis.md`

## Rotas da Aplicação

**Rotas principais (flat, não mais nested):**
- `/` - Redireciona para pile padrão
- `/pile/:pileName` - Visualização de pile específico (editor de jornal)
- `/create-pile` - Criar novo pile
- `/timeline` - Timeline de atividades com sumários
- `/auto-journal` - Vision Assistant (ex-Auto Journal)
- `/dashboard` - Dashboard com charts e analytics
- `/settings` - Configurações unificadas
- `/chat` - Chat com AI
- `/search` - Busca semântica
- `/kanban` - Kanban board
- `/profile` - Perfil do usuário (em desenvolvimento)

**Janelas especiais:**
- `/setup` - Wizard de setup inicial
- `/panel` - Painel de gravação (overlay)

**Nota**: Rotas simplificadas de `/pile/:pileName/settings` para `/settings`. Navegação via bottom nav bar.

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

### Navigation (Bottom Nav Bar)
- Arquivo: `liv/src/renderer/src/pages/pile/Navigation/index.jsx`
- Design: pill-style com ícones
- Links: Home, Chat, Search, Vision Assistant (EyeIcon), Kanban (grid 4 squares), Dashboard, Profile, Settings

### Settings
- Rota: `/settings`
- Tabs: Diário, IA, Transcrição
- Arquivo: `liv/src/renderer/src/pages/pile/Settings/index.jsx`
- **Prompt Editor**: Modal para visualizar/editar prompts de enhancement

### Analytics
- Acesso: via Dashboard ou navegação
- Tabs: Analytics (stats, performance), History (transcrições com thumbnails)
- Arquivo: `liv/src/renderer/src/pages/pile/Analytics/index.jsx`

### Dashboard
- Rota: `/dashboard`
- Charts Recharts: LineChart, PieChart
- Arquivo: `liv/src/renderer/src/pages/pile/Dashboard/index.jsx`

### Vision Assistant (ex-Auto Journal)
- Rota: `/auto-journal`
- Layout: calendário fluido (não mais cards)
- **Features**: timestamps por hora, prompts colapsáveis com fade, sumários auto-gerados via LLM
- Ícone: EyeIcon (não mais notebook)
- Arquivo: `liv/src/renderer/src/pages/pile/AutoJournal/index.jsx`

### Timeline
- Rota: `/timeline`
- Entradas expansíveis com sumários
- Geração de sumários via múltiplos providers LLM
- Arquivo: `liv/src/renderer/src/pages/pile/Timeline/index.jsx`

### Search
- Rota: `/search`
- Busca semântica no jornal usando vector search
- Arquivo: `liv/src/renderer/src/pages/pile/Search/index.jsx`

### Kanban
- Rota: `/kanban`
- 3 colunas: Ideas, Research, Outline (customizável)
- Cards com drag-and-drop, tags, bullets
- Ícone: KanbanIcon (grid 4 squares)
- Arquivo: `liv/src/renderer/src/pages/pile/Kanban/index.jsx`

### Chat
- Rota: `/chat`
- **Funcionalidades**:
  - Painel de contexto (toggle lateral; usa entradas do jornal)
  - Seletor de tema (dropdown com 5 cores)
  - Exportar conversa (salva como .txt)
  - Animações suaves com AnimatePresence
- Arquivo: `liv/src/renderer/src/pages/pile/Chat/index.jsx`

### Profile (Em Desenvolvimento)
- Rota: `/profile`
- Placeholder "Em Desenvolvimento"
- Arquivo: `liv/src/renderer/src/pages/pile/Profile/index.jsx`

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
  - Adicione link na Navigation se necessário (`liv/src/renderer/src/pages/pile/Navigation/index.jsx`).
  - Siga design system em `liv/ai_docs/design-system-analysis.md`.
  - Use scrollbars invisíveis (`::-webkit-scrollbar { display: none; }`).
  - Registre rotas em `liv/src/renderer/src/router.tsx` (formato flat, não nested).
- APIs IPC:
  - Adicione `t.procedure` no `router` (`liv/src/main/tipc.ts:44`).
  - Consuma via `tipcClient` (`liv/src/renderer/src/lib/tipc-client.ts:5`).
- Persistência/Config:
  - Use `configStore.save/get` (`liv/src/main/config.ts:31,27`).
  - Gravações e histórico em `recordingsFolder` (`liv/src/main/config.ts:8`).
- Protocolo de arquivos:
  - Servir gravações via `assets://recording/<id>` (`liv/src/main/serve.ts:68`).

## Padrões de UI (v2.0)
- **Route-based pages**: Todas páginas principais são rotas flat (ex: `/settings` não `/pile/:name/settings`).
- **Navigation**: Bottom nav bar pill-style com ícones (HomeIcon, ChatIcon, SearchIcon, EyeIcon, KanbanIcon, CardIcon, PersonIcon, SettingsIcon).
- **Page container**: Usar `.pageContainer` com position fixed e border-radius 16px.
- **Cards minimalistas**: Background transparente + border 1px solid var(--border).
- **Scrollbars invisíveis**: display: none em ::-webkit-scrollbar.
- **Styling**: SCSS modules para cada página (`.module.scss`).
- **Data fetching**: React Query (`useQuery`, `useMutation`) via `tipcClient`.
- **Charts**: Recharts para gráficos (LineChart, PieChart).
- **Logging**: Use `logger` centralizado em main process (electron-log).

## Convenções & Boas Práticas
- TypeScript, React, Electron; siga padrões existentes de imports e módulos.
- Não logue segredos; configure chaves via UI de Settings ou `config.json`.
- Mantenha arquivos abaixo de ~500 linhas; prefira módulos auxiliares.
- **Main process**: Use `logger` de `src/main/logger.ts` (arquivos em `~/Library/Logs/Liv/`).
- **Renderer**: Use `console.log` apenas com `import.meta.env.DEV`.
- Para logging contextualizado: `const log = logWithContext('ModuleName')`.

## Problemas Conhecidos
- Sem bloqueios conhecidos no fork atual; valide sempre o fluxo de cancelamento duplo ESC.

## Checklist de Alterações
- Criar/editar API IPC → atualizar cliente no Renderer.
- Persistência → garantir criação de pastas (`fs.mkdirSync(recordingsFolder, { recursive: true })`).
- UI → validar eventos renderer handlers (`liv/src/main/renderer-handlers.ts`).
- Novas páginas → seguir design system, padrão route-based flat, e Navigation.
- Novos ícones → adicionar em `liv/src/renderer/src/icons/`.
- Logging → usar `logger` de `src/main/logger.ts` no main process.
- Testar: fluxo completo atalho → painel → gravação → transcrição → histórico.

## Troubleshooting
- **Logs**: Consulte arquivos em `~/Library/Logs/Liv/main.log` (macOS) para debug.
- Acessibilidade (macOS): conceder em Sistema; checado via `isAccessibilityGranted` (`liv/src/main/utils.ts:3`).
- Permissão de microfone: `requestMicrophoneAccess` (`liv/src/main/tipc.ts:135`).
- Cancelamento não reage: invoque `cancelTranscription` manualmente e confira `state.transcriptionAbortController` (`liv/src/main/state.ts:1`).
- Provedores:
  - STT: `openaiApiKey/baseUrl`, `groqApiKey/baseUrl` em `Config`.
  - LLM: `enhancementEnabled`, `enhancementProvider`, chaves de API em `Config`.

---
Use `liv/src/shared/data-model.ts` como referência central ao navegar e validar mudanças.
Use `liv/ai_docs/design-system-analysis.md` como referência para estilos visuais.
