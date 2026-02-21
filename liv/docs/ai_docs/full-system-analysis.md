# Liv - Analise Completa do Sistema

**Data:** 2026-02-21
**Escopo:** Auto Journal, Kanban Autonomo, Perfil Autonomo, Interligacoes e Gaps

---

## 1. VISAO GERAL DA ARQUITETURA

```
                     ┌──────────────────────────────────────┐
                     │       AUTO-JOURNAL SCHEDULER         │
                     │  (Coração do sistema autonomo)       │
                     │  Roda a cada N minutos               │
                     └──────────┬───────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  KANBAN      │   │  PROFILE     │   │  TIMELINE    │
   │  Autonomo    │   │  Autonomo    │   │  (read-only) │
   │  ✅ Backend  │   │  ✅ Backend  │   │  ✅ Completo │
   │  ⚠️ Frontend │   │  ✅ Frontend │   │              │
   └──────────────┘   └──────────────┘   └──────────────┘
           │                    │                    │
           └────────────────────┼────────────────────┘
                                │
                     ┌──────────▼───────────────────────────┐
                     │       MEMORIA AUTONOMA               │
                     │  SQLite + Markdown + Vector Search   │
                     └──────────────────────────────────────┘
```

### Fluxo de Dados Principal

```
Gravacao de Audio → Transcricao → history.json
                                       │
Periodic Screenshots ─────────────────┐│
Screen Session Recording ────────────┐││
                                     │││
                                     ▼▼▼
                              AUTO-JOURNAL
                         (Coleta + LLM + GIF)
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
               KANBAN        PROFILE       PILE ENTRY
            (Pendentes,   (Widgets,      (Markdown post
            Sugestoes,    Insights,       no journal)
            Automacoes)   Metricas)
                    │             │
                    └──────┬──────┘
                           ▼
                    MEMORIA AUTONOMA
                   (MEMORY.md + SQLite)
```

---

## 2. AUTO JOURNAL (Vision Assistant)

### 2.1 Status: ✅ Backend Completo | ✅ Frontend Completo

### 2.2 Arquivos Principais

| Arquivo | Linhas | Funcao |
|---------|--------|--------|
| `src/main/services/auto-journal-service.ts` | ~925 | Servico core: scheduler, runs, GIF |
| `src/main/services/screen-capture-service.ts` | ~448 | Captura de tela com OCR |
| `src/main/services/periodic-screenshot-service.ts` | ~331 | Screenshots periodicos |
| `src/main/services/screen-session-recording-service.ts` | ~150 | Gravacao continua de tela |
| `src/main/services/auto-journal-entry.ts` | ~118 | Persistencia em Markdown |
| `src/main/llm.ts` | ~977 | Chamadas LLM multi-provider |
| `src/renderer/src/pages/pile/AutoJournal/index.jsx` | ~1679 | UI completa (Runs + Settings) |

### 2.3 Pipeline de Execucao

```
1. Coleta dados (recordings + screenshots + video samples)
2. Envia para LLM (Gemini/OpenAI/Groq/OpenRouter/Ollama)
3. Parseia JSON com activities, summaries, highlights
4. Gera GIF preview (FFmpeg, 2 FPS, 1024px)
5. Salva run em auto-journal/runs/{timestamp}.json
6. Auto-save como post no Pile (se habilitado)
7. Dispara refreshAutonomousKanban() + refreshAutonomousProfile()
```

### 2.4 Configuracoes (config.json)

| Campo | Default | Descricao |
|-------|---------|-----------|
| `autoJournalEnabled` | `false` | Liga/desliga scheduler |
| `autoJournalWindowMinutes` | `60` | Janela de analise (15/30/60/120) |
| `autoJournalSourceMode` | `"both"` | audio, video, both |
| `autoJournalVideoProvider` | `"gemini"` | Provider para analise de video |
| `autoJournalVideoModel` | `"gemini-3-flash-preview"` | Modelo de video |
| `autoJournalAutoSaveEnabled` | `false` | Auto-persistir no journal |
| `autoJournalIncludeScreenCapture` | `false` | OCR em screenshots |
| `autoJournalTitlePromptEnabled` | `false` | Prompt customizado para titulos |
| `autoJournalSummaryPromptEnabled` | `false` | Prompt customizado para resumos |

### 2.5 Problemas Encontrados

| # | Severidade | Problema | Local |
|---|-----------|---------|-------|
| AJ-1 | **ALTA** | Gemini API key lê de `config.geminiApiKey` em vez de `electron-settings` (inconsistente com Chat) | `llm.ts:576` |
| AJ-2 | **MEDIA** | Scheduler não persiste `lastRunAt`/`nextRunAt` entre restarts | `auto-journal-service.ts:855` |
| AJ-3 | **MEDIA** | Sem mecanismo de cancelamento para runs em andamento | `auto-journal-service.ts:347` |
| AJ-4 | **BAIXA** | `runAutoJournalForRange()` existe no backend mas sem UI | `tipc.ts:944` |
| AJ-5 | **BAIXA** | Tesseract inicializa lazy (primeira captura lenta) | `screen-capture-service.ts:332` |

---

## 3. KANBAN AUTONOMO

### 3.1 Status: ✅ Backend Completo | ⚠️ Frontend READ-ONLY

### 3.2 Arquivos Principais

| Arquivo | Linhas | Funcao |
|---------|--------|--------|
| `src/main/services/autonomous-kanban-service.ts` | ~407 | Geracao de cards |
| `src/main/services/autonomous-memory-service.ts` | ~605 | Memoria compartilhada |
| `src/renderer/src/pages/pile/Kanban/index.jsx` | ~406 | UI (display-only) |
| `src/renderer/src/pages/pile/Kanban/Kanban.module.scss` | ~447 | Estilos |

### 3.3 Tres Colunas (Geradas Automaticamente)

| Coluna | ID | Icone | Cor | Logica de Geracao |
|--------|-----|-------|-----|-------------------|
| **Pendentes** | `pending` | target | laranja | Detecta "preciso", "falta", "revisar", highlight "Do later" |
| **Sugestoes** | `suggestions` | lightbulb | amarelo | Analisa distracao >22%, context switching >2.3, idle >20% |
| **Automacoes** | `automations` | circle | verde | Identifica atividades repetitivas (>=3 ocorrencias) |

### 3.4 Score de Confianca

```
Pendentes:  0.45 + (mencoes × 0.12), max 0.98
Sugestoes:  Fixo entre 0.50-0.85 baseado em metricas
Automacoes: 0.55 + (contagem × 0.08), max 0.98
```

### 3.5 Problemas Encontrados

| # | Severidade | Problema | Local |
|---|-----------|---------|-------|
| K-1 | **CRITICA** | **Botao "Add Card" e placeholder** - diz "em breve", sem onClick | `Kanban/index.jsx:120` |
| K-2 | **CRITICA** | **Sem drag-and-drop** - nenhuma lib DnD no projeto | `package.json` |
| K-3 | **CRITICA** | **Sem CRUD manual** - cards sao somente leitura | Todo o componente |
| K-4 | **ALTA** | **Sem mark-as-done** - campo `status: "open"|"done"` nunca usado | `types.ts:225` |
| K-5 | **ALTA** | **Sem mover entre colunas** - lanes hard-coded | `autonomous-kanban-service.ts` |
| K-6 | **MEDIA** | **Search results nao interativos** - sem click handler | `Kanban/index.jsx:367-376` |
| K-7 | **MEDIA** | Input de search sem validacao Zod | `tipc.ts:1193` |
| K-8 | **BAIXA** | Cards sao efemeros - reconstruidos a cada refresh | `autonomous-kanban-service.ts` |

### 3.6 O Que Falta Para Ser Funcional

```
Implementado:           Faltando:
✅ Leitura de board      ❌ Criar card manual
✅ Refresh (regenerar)   ❌ Editar card
✅ Busca na memoria      ❌ Deletar card
✅ Filtro por semana/dia ❌ Mover entre colunas
✅ Score de confianca    ❌ Marcar como feito
✅ Auto-refresh          ❌ Drag-and-drop
                         ❌ Reordenar cards
                         ❌ Arquivar cards antigos
```

---

## 4. PERFIL AUTONOMO

### 4.1 Status: ✅ Backend Completo | ✅ Frontend Completo

### 4.2 Arquivos Principais

| Arquivo | Linhas | Funcao |
|---------|--------|--------|
| `src/main/services/autonomous-profile-service.ts` | ~644 | Geracao de insights |
| `src/renderer/src/pages/pile/Profile/index.jsx` | ~377 | UI completa |
| `src/renderer/src/pages/pile/Profile/Profile.module.scss` | ~352 | Estilos |

### 4.3 Sistema de 8 Widgets

| Widget ID | Nome | Tipo de Card | Descricao |
|-----------|------|-------------|-----------|
| `work_time_daily` | Carga de Trabalho | strength/risk | Horas produtivas por dia |
| `parallelism` | Multitarefa | strength/risk | Context switching (risk se >=2.2) |
| `engagement_topics` | Topicos | opportunity | Top 3 topicos recorrentes |
| `meeting_suggestions` | Reunioes | meeting | Alinhamentos sugeridos |
| `top_projects` | Projetos | opportunity | Top 5 projetos por esforco |
| `top_people` | Pessoas | opportunity | Top 6 contatos mencionados |
| `business_opportunities` | Negocios | business | Sinais comerciais detectados |
| `focus_risks` | Foco | risk/wellbeing | Padroes de distracao/energia |

### 4.4 Pipeline de Analise

```
1. Carrega 240 runs do Auto-Journal
2. Extrai atividades e calcula ratios (work/distraction/idle)
3. Tokeniza titulos para projetos (NLP + dedup)
4. Regex para nomes de pessoas (capitalizados, filtra stopwords PT)
5. Gera cards por widget habilitado com confidence e impact
6. Persiste em profile-board.json
7. Grava insight duravel na memoria autonoma
```

### 4.5 Score de Confianca

```
Base: 0.50-0.58
Bonus: +0.20 a +0.40 (baseado em metricas da atividade)
Clamp: [0.35, 0.99]
Impact: low (<0.50), medium (0.50-0.70), high (>0.70)
```

### 4.6 Problemas Encontrados

| # | Severidade | Problema | Local |
|---|-----------|---------|-------|
| P-1 | **MEDIA** | Sem graficos de tendencia temporal (cards mostram dados, mas sem charts) | `Profile/index.jsx` |
| P-2 | **MEDIA** | Sem drill-down em cards (mostram tudo inline, sem pagina de detalhe) | `Profile/index.jsx` |
| P-3 | **BAIXA** | Sem export/compartilhamento de insights | - |
| P-4 | **BAIXA** | Actions nos cards nao sao editaveis pelo usuario | `autonomous-profile-service.ts` |

---

## 5. INTERLIGACOES ENTRE FEATURES

### 5.1 Mapa de Conexoes Atual

```
                    GRAVA AUDIO
                        │
                        ▼
                   history.json ◄──── Dashboard/Analytics (lê)
                        │
                        ▼
                  AUTO-JOURNAL ──────► Pile Entry (auto-save)
                   │         │              │
                   │         │              ▼
                   │         │        Index/Search/Chat (lê)
                   │         │
              ┌────┘         └────┐
              ▼                   ▼
          KANBAN              PROFILE
              │                   │
              └────────┬──────────┘
                       ▼
                MEMORIA AUTONOMA
                       │
                       ▼
                  Chat (RAG context)
```

### 5.2 Conexoes EXISTENTES

| De | Para | Como | Status |
|-----|------|------|--------|
| Auto-Journal | Kanban | `refreshAutonomousKanban()` apos cada run | ✅ Funcional |
| Auto-Journal | Profile | `refreshAutonomousProfile()` apos cada run | ✅ Funcional |
| Auto-Journal | Pile Entry | `saveAutoJournalEntry()` se auto-save ligado | ✅ Funcional |
| Auto-Journal | Timeline | Timeline lê runs via `listAutoJournalRuns()` | ✅ Funcional |
| Kanban | Memoria | Escreve sumarios via `writeAutonomousMemory()` | ✅ Funcional |
| Profile | Memoria | Escreve insights via `writeAutonomousMemory()` | ✅ Funcional |
| Chat | Memoria | Lê contexto via `getAutonomousPromptContext()` | ✅ Funcional |
| Recordings | Dashboard | Analytics e historico via IPC | ✅ Funcional |

### 5.3 Conexoes FALTANDO (Gaps Criticos)

| De | Para | Gap | Impacto |
|-----|------|-----|---------|
| Kanban | Pile | Cards nao se convertem em entries do journal | Insights perdidos |
| Profile | Dashboard | Metricas do Profile nao aparecem no Dashboard | Duplicacao de visualizacao |
| Timeline | Kanban | Nao da pra criar card a partir de atividade | Workflow quebrado |
| Timeline | Auto-Journal | Nao da pra disparar analise de range customizado | Feature existente no backend sem UI |
| Recordings | Kanban | contextScreenAppName/Title nao usado para detectar projetos | Dados subutilizados |
| Recordings | Profile | audioProfile (silenceRatio, peakLevel) nao usado | Analise de fadiga impossivel |
| Pile Entry | Profile | Entries do journal nao alimentam perfil | Dados ricos ignorados |
| Search | Kanban | Busca semantica nao pesquisa kanban cards | Silos de dados |
| Kanban | Kanban | Cards nao podem ser editados, movidos ou marcados como feitos | **Experiencia quebrada** |

---

## 6. SISTEMA DUAL DE CONFIGURACAO (Bug Arquitetural)

### O Problema

O app tem **DOIS sistemas de config separados** que guardam dados de AI:

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│  electron-settings              │    │  configStore (config.json)      │
│  (macOS Keychain encrypted)     │    │  (arquivo JSON no disco)        │
│                                 │    │                                 │
│  Usado por:                     │    │  Usado por:                     │
│  - Chat                         │    │  - Transcricao                  │
│  - Auto-Journal (parcial)       │    │  - Enhancement                  │
│                                 │    │  - Auto-Journal (parcial)       │
│  Dados:                         │    │                                 │
│  - aiKey (OpenAI, encrypted)    │    │  Dados:                         │
│  - openrouterKey (encrypted)    │    │  - openaiApiKey (plaintext!)    │
│  - pileAIProvider               │    │  - groqApiKey (plaintext!)      │
│  - model                        │    │  - geminiApiKey (plaintext!)    │
│  - baseUrl                      │    │  - enhancementProvider          │
└─────────────────────────────────┘    │  - sttProviderId                │
                                       └─────────────────────────────────┘
```

### Impacto

- User configura Gemini no Chat → funciona no Chat, **falha no Auto-Journal** (lê de config.json)
- User configura OpenAI no Settings → funciona na Transcricao, **pode nao funcionar no Chat** (lê de electron-settings)
- Keys em config.json estão em **plaintext** (risco de seguranca)

---

## 7. STORAGE: ONDE CADA DADO VIVE

```
~/.appData/<APP_ID>/
├── config.json                          # Configuracoes (configStore)
├── piles.json                           # Lista de journals
├── recordings/
│   ├── history.json                     # Historico de gravacoes
│   ├── screenshots/                     # Screenshots de contexto
│   ├── auto-journal/
│   │   ├── runs/{timestamp}.json        # Runs do auto-journal
│   │   ├── gifs/preview-{id}.gif        # GIFs preview
│   │   └── tmp/                         # Temporarios
│   ├── auto-agent/
│   │   ├── kanban-board.json            # Board do Kanban
│   │   ├── profile-board.json           # Board do Profile
│   │   ├── MEMORY.md                    # Memoria de longo prazo
│   │   ├── memory/{YYYY-MM-DD}.md       # Memoria diaria
│   │   └── memory_index.db             # SQLite (embeddings + FTS5)
│   ├── periodic-screenshots/
│   │   ├── index.json
│   │   └── {YYYY-MM-DD}/{HHMMSS}.png
│   └── screen-sessions/
│       └── {sessionId}/
│           ├── frames/
│           ├── samples.jsonl
│           └── session.mp4
│
└── piles/
    └── {pileName}/
        ├── index.json                   # Indice de entries
        ├── {YYYY}/{MMM}/{YYMMDD-HHMMSS}.md  # Journal entries
        └── tags.json                    # Tags index
```

---

## 8. IPC PROCEDURES - INVENTARIO COMPLETO

### Auto-Journal (12 procedures)
| Procedure | Tipo | Descricao |
|-----------|------|-----------|
| `generateAutoJournalSummary` | action | Gera summary sob demanda |
| `runAutoJournalNow` | action | Dispara run manual |
| `runAutoJournalForRange` | action | Run para range customizado |
| `listAutoJournalRuns` | query | Lista runs recentes |
| `deleteAutoJournalRun` | mutation | Deleta run + GIF |
| `getAutoJournalSettings` | query | Le config do AJ |
| `saveAutoJournalSettings` | mutation | Salva config + restart scheduler |
| `getAutoJournalSchedulerStatus` | query | Status do scheduler |
| `createAutoJournalEntry` | mutation | Persiste summary no pile |
| `getPeriodicScreenshotStatus` | query | Status do periodic |
| `savePeriodicScreenshotSettings` | mutation | Config do periodic |
| `startScreenSessionRecording` | action | Inicia gravacao continua |

### Kanban Autonomo (4 procedures)
| Procedure | Tipo | Descricao |
|-----------|------|-----------|
| `getAutonomousKanbanBoard` | query | Le board (cache ou gera) |
| `refreshAutonomousKanban` | action | Regenera todo board |
| `searchAutonomousKanbanMemory` | query | Busca na memoria |
| `getAutonomousKanbanStatus` | query | Status do servico |

### Profile Autonomo (3 procedures)
| Procedure | Tipo | Descricao |
|-----------|------|-----------|
| `getAutonomousProfileBoard` | query | Le board (cache ou gera) |
| `refreshAutonomousProfile` | action | Regenera todo board |
| `getAutonomousProfileStatus` | query | Status do servico |

### Procedures FALTANDO para interligacao
| Procedure | Para que serve |
|-----------|---------------|
| `getAutoJournalRunById` | Buscar run especifico (para linking de cards) |
| `updateAutonomousKanbanCard` | Editar/mover/marcar card como feito |
| `createAutonomousKanbanCard` | Criar card manual |
| `deleteAutonomousKanbanCard` | Remover card individual |
| `getPileEntriesByDateRange` | Query temporal no journal |
| `getAutonomousCardsByRunId` | Reverse lookup: run → cards |
| `convertKanbanCardToPileEntry` | Kanban → Journal entry |
| `createKanbanCardFromActivity` | Timeline activity → Kanban card |

---

## 9. CONTEXTS DO REACT (Frontend State)

### 4 Contexts Principais

| Context | Escopo | Dados | Usado por |
|---------|--------|-------|-----------|
| **PilesContext** | Journal/Pile global | `currentPile`, `piles`, `currentTheme` | Todas as paginas |
| **IndexContext** | Entries do journal | `index` (Map), `latestThreads`, `search`, `vectorSearch` | Posts, Chat, Search |
| **AIContext** | Config de AI | `ai` (client), `prompt`, `pileAIProvider`, `model` | Chat, Settings |
| **TimelineContext** | Scroll/navegacao | `visibleIndex`, `closestDate`, `scrollToIndex` | Sidebar, Layout |

### Gap: Nenhum Context para dados autonomos

Kanban, Profile e Auto-Journal usam **TanStack Query direto** (sem context compartilhado). Isso significa:
- Cada pagina faz sua propria query independente
- Nao ha cache compartilhado entre Kanban e Profile
- Navegacao entre paginas refaz queries desnecessarias

---

## 10. LISTA PRIORIZADA DE MELHORIAS

### Prioridade CRITICA (Funcionalidade quebrada)

| # | Melhoria | Complexidade | Impacto |
|---|---------|-------------|---------|
| 1 | **CRUD no Kanban** - criar, editar, deletar, mover cards | Alta | Torna o Kanban utilizavel |
| 2 | **Drag-and-drop no Kanban** - mover cards entre colunas | Media | UX esperada pelo usuario |
| 3 | **Mark-as-done no Kanban** - marcar tasks como concluidas | Baixa | Ciclo de vida do card |
| 4 | **Unificar sistema de config** - migrar tudo para electron-settings | Alta | Elimina bugs de config |

### Prioridade ALTA (Interligacao)

| # | Melhoria | Complexidade | Impacto |
|---|---------|-------------|---------|
| 5 | **Timeline → Kanban** - criar card a partir de atividade | Media | Workflow completo |
| 6 | **Kanban → Pile** - converter card em entry do journal | Media | Dados nao se perdem |
| 7 | **Profile → Dashboard** - metricas do profile nos charts | Media | Visao unificada |
| 8 | **Custom range analysis** - UI para `runAutoJournalForRange()` | Baixa | Feature pronta no backend |

### Prioridade MEDIA (Dados subutilizados)

| # | Melhoria | Complexidade | Impacto |
|---|---------|-------------|---------|
| 9 | **Usar contextScreenAppName** no Kanban - detectar projetos automaticamente | Baixa | Projetos mais precisos |
| 10 | **Usar audioProfile** no Profile - analise de fadiga por voz | Media | Wellbeing insights |
| 11 | **Pile entries alimentam Profile** - nao depender so de auto-journal | Alta | Dados mais ricos |
| 12 | **Busca unificada** - pesquisar em kanban + pile + recordings | Alta | Fim dos silos |

### Prioridade BAIXA (Polish)

| # | Melhoria | Complexidade | Impacto |
|---|---------|-------------|---------|
| 13 | Graficos de tendencia no Profile | Media | Visualizacao melhor |
| 14 | Templates de prompts para Auto-Journal | Baixa | UX melhor |
| 15 | Cancelamento de run em andamento | Media | Controle do usuario |
| 16 | Pre-inicializar Tesseract no startup | Baixa | Primeira captura mais rapida |

---

## 11. MAPA DE ARQUIVOS POR FEATURE

### Auto-Journal
```
Backend:
  src/main/services/auto-journal-service.ts     (925 linhas - CORE)
  src/main/services/screen-capture-service.ts   (448 linhas)
  src/main/services/periodic-screenshot-service.ts (331 linhas)
  src/main/services/screen-session-recording-service.ts (~150 linhas)
  src/main/services/auto-journal-entry.ts       (118 linhas)
  src/main/llm.ts                               (977 linhas - LLM calls)
  src/main/tipc.ts                              (linhas 928-1185 - IPC)

Frontend:
  src/renderer/src/pages/pile/AutoJournal/index.jsx (1679 linhas)
  src/renderer/src/pages/pile/Timeline/index.jsx    (284 linhas)
```

### Kanban Autonomo
```
Backend:
  src/main/services/autonomous-kanban-service.ts  (407 linhas)
  src/main/services/autonomous-memory-service.ts  (605 linhas - compartilhado)
  src/main/tipc.ts                                (linhas 1187-1203 - IPC)

Frontend:
  src/renderer/src/pages/pile/Kanban/index.jsx        (406 linhas)
  src/renderer/src/pages/pile/Kanban/Kanban.module.scss (447 linhas)
```

### Profile Autonomo
```
Backend:
  src/main/services/autonomous-profile-service.ts (644 linhas)
  src/main/services/autonomous-memory-service.ts  (605 linhas - compartilhado)
  src/main/tipc.ts                                (linhas 1205-1215 - IPC)

Frontend:
  src/renderer/src/pages/pile/Profile/index.jsx        (377 linhas)
  src/renderer/src/pages/pile/Profile/Profile.module.scss (352 linhas)
```

### Compartilhado
```
  src/shared/types.ts          (467 linhas - todos os tipos)
  src/main/config.ts           (180 linhas - configStore)
  src/main/pile-utils/store.ts (120 linhas - electron-settings)
  src/main/pile-utils/pileIndex.js (395 linhas - indice do journal)
```

---

## 12. RESUMO EXECUTIVO

### O que funciona bem
- Auto-Journal e robusto (retry, fallback, multi-provider)
- Screen capture production-ready (crash guard, OCR, state machine)
- Profile tem 8 widgets inteligentes com analise comportamental
- Memoria autonoma integra Kanban + Profile + Chat via RAG
- GIF preview funcional com FFmpeg bundled

### O que precisa de atencao urgente
1. **Kanban e READ-ONLY** - precisa de CRUD completo + drag-drop
2. **Dois sistemas de config** - causa bugs intermitentes com API keys
3. **Features sao silos** - Timeline, Kanban, Profile, Dashboard nao se comunicam
4. **Dados subutilizados** - audioProfile, contextScreenAppName, pile entries ignorados

### Visao para o futuro
O sistema tem a base certa: Auto-Journal como "coracao" que alimenta agentes autonomos. O proximo passo e **fechar o ciclo**:
- Cards do Kanban devem ser actionable (CRUD + status)
- Insights do Profile devem alimentar sugestoes no Chat
- Timeline deve permitir criar cards/entries a partir de atividades
- Dashboard deve unificar metricas de todos os subsistemas
