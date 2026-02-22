# Integracao Nanobot — Documentacao Tecnica

**Data:** 2026-02-21
**Status:** Implementado (aguardando testes)
**Versao:** Liv 0.1.8+

---

## 1. O Que Foi Feito

O Chat do Liv foi transformado em um **agente inteligente completo** usando o framework [nanobot](https://github.com/HKUDS/nanobot). Antes, o Chat era um wrapper simples de LLM streaming sem capacidade de agente. Agora ele pode:

- **Executar acoes** nos servicos do Liv (journal, kanban, life OS, memory, profile)
- **Usar ferramentas** (7 tools especificas do Liv + 10 tools builtin do nanobot)
- **Agendar tarefas** via cron persistente (substitui os `setInterval` para tarefas inteligentes)
- **Manter memoria** de longo prazo com consolidacao automatica
- **Navegar** entre paginas do app
- **Enviar notificacoes** desktop

---

## 2. Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                    Electron Main Process                         │
│                                                                  │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────┐ │
│  │ nanobot-bridge   │──►│ gateway-client    │──►│ WS proxy     │ │
│  │ service.ts       │   │ .ts (HTTP+WS)    │   │ → renderer   │ │
│  │ (lifecycle mgr)  │   └────────┬─────────┘   └──────────────┘ │
│  └────────┬─────────┘            │                               │
│           │ spawn                │ HTTP/WS                       │
│  ┌────────▼─────────┐   ┌───────▼──────────┐                    │
│  │ Python Process    │   │ callback-server   │                   │
│  │ (gateway.py)      │◄──│ .ts (http server) │                   │
│  │ localhost:{port}  │   │ localhost:{port2} │                   │
│  └──────────────────┘   └───────────────────┘                    │
│           │                       ▲                              │
│           │ HTTP calls            │ Liv services                 │
│           └───────────────────────┘                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Existing Services (inalterados, expostos via callback) │     │
│  │  auto-journal · kanban · profile · life-os · memory     │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
         ↕ tipc IPC
┌──────────────────────────────────────────────────────────────────┐
│                    Renderer Process                               │
│  Chat ← IPC (HTTP por enquanto, WS streaming planejado)         │
│  AIContext.jsx: detecta nanobot ativo → rota mensagens pro agente│
│  Settings: aba "Agent" com toggle, status, memoria, cron jobs    │
└──────────────────────────────────────────────────────────────────┘
```

### Fluxo de uma mensagem

1. Usuario digita no Chat
2. `useChat.jsx` detecta `isNanobotActive === true` → usa `addMessageNanobot` em vez de `addMessage`
3. Pula o pipeline RAG manual (vectorSearch + autonomousPromptContext) — o agente tem suas proprias tools
4. Envia via `tipcClient.sendNanobotMessage()` → IPC → main process
5. Main process chama `gateway-client.sendMessage()` → HTTP POST `/api/message`
6. Python gateway recebe → `AgentLoop.process_direct()` → loop ReAct
7. Agente pode chamar tools (ex: `liv_kanban(action='get')`) → HTTP para callback server → servico do Liv
8. Resposta volta pelo mesmo caminho → Chat renderiza

### Fallback (graceful degradation)

Se o nanobot estiver desabilitado (`nanobotEnabled: false`) ou falhar:
- Chat funciona normalmente com LLM direto (OpenAI/OpenRouter/Ollama)
- Schedulers usam `setInterval` como antes
- Nenhuma funcionalidade perdida

---

## 3. Arquivos Criados

### Python (resources/nanobot/)

| Arquivo | Linhas | Descricao |
|---------|--------|-----------|
| `gateway.py` | ~510 | Servidor FastAPI wrapping AgentLoop. Endpoints: POST /api/message, WS /ws/chat, GET /health, GET /api/status, CRUD /api/cron/jobs, GET /api/memory, GET /api/sessions |
| `config_bridge.py` | ~38 | Le variaveis de ambiente LIV_* injetadas pelo Electron e retorna dict de config |
| `requirements.txt` | ~12 | Dependencias: fastapi, uvicorn, websockets, litellm, httpx |
| `jobs.json` | ~90 | 4 cron jobs padrao: auto-journal horario, revisao diaria (22h), analise semanal Life OS (dom 20h), refresh de perfil (4h) |
| `tools/__init__.py` | 0 | Marcador de pacote |
| `tools/liv_client.py` | ~80 | Cliente HTTP async (httpx) para o callback server |
| `tools/liv_tools.py` | ~560 | 7 classes Tool: LivJournalTool, LivKanbanTool, LivMemoryTool, LivLifeOSTool, LivProfileTool, LivRecordingsTool, LivAppTool |

### Skills (resources/nanobot/skills/)

| Skill | Conteudo |
|-------|----------|
| `liv-journaling/SKILL.md` | Como refletir sobre entradas. Tom acolhedor em PT-BR. Uso de tools journal/memory/recordings. |
| `liv-productivity/SKILL.md` | Analise de dados do auto-journal. Metricas: deep work ratio, context switches, peak hours. |
| `liv-life-os/SKILL.md` | Framework Telos. Templates de revisao semanal/mensal. Conceitos: dimensoes, metas, principios, sabedoria. |
| `liv-memory/SKILL.md` | Gestao de memoria dual (MEMORY.md + SQLite). Quando consolidar, o que manter vs descartar. `always: true` |
| `liv-navigator/SKILL.md` | Tabela de rotas do app. Quando navegar, como apresentar dados, uso de notificacoes. |

### TypeScript (src/main/services/)

| Arquivo | Linhas | Descricao |
|---------|--------|-----------|
| `nanobot-bridge-service.ts` | ~410 | Gerenciador de ciclo de vida do processo Python. Spawna com env vars corretas, faz health check, auto-restart com backoff exponencial (1s→2s→4s→max 30s), monitora memoria (restart se >512MB). Exporta singleton `nanobotBridge`. |
| `nanobot-gateway-client.ts` | ~265 | Cliente HTTP (`NanobotHttpClient`) e WebSocket (`NanobotWsClient`). Metodos: sendMessage, health, getStatus, getMemory, resetMemory, listSessions, listCronJobs, addCronJob, removeCronJob. Exporta `initClients()`, `getHttpClient()`, `getWsClient()`, `destroyClients()`. |
| `nanobot-callback-server.ts` | ~355 | Servidor HTTP nativo (Node http module) em localhost. Expoe servicos existentes como REST: `/journal/*`, `/kanban/*`, `/memory/*`, `/life/*`, `/profile/*`, `/recordings`, `/app/*`, `/config`. |

### Build Script

| Arquivo | Linhas | Descricao |
|---------|--------|-----------|
| `scripts/build-nanobot.js` | ~110 | Script PyInstaller para criar binario unico. Detecta plataforma, instala deps, empacota nanobot-ref + tools + skills. Output em `resources/nanobot-bin/{platform}/`. |

---

## 4. Arquivos Modificados

### src/shared/types.ts

Adicionados ao final do arquivo:

```typescript
// Config
nanobotEnabled?: boolean
nanobotModel?: string

// Tipos do agente
NanobotStatus        // state: stopped|starting|connected|error, port, uptime, error
NanobotMessage       // content, sessionKey, toolsUsed
NanobotToolCallEvent // name, args, result, status
NanobotWsInbound     // type: user_message, content, session_id
NanobotWsOutbound    // union: token|tool_call|tool_result|done|error
```

### src/main/index.ts

3 mudancas:

1. **Scheduling condicional** (linha ~236): Se `nanobotEnabled`, pula `startAutoJournalScheduler()` — o cron do nanobot cuida.
2. **Deferred init** (linha ~339): Funcao `performDeferredNanobotInit()` que inicia callback server → bridge → clients. Chamada 400ms apos a janela aparecer.
3. **Shutdown** (linha ~391): No `will-quit`, para o bridge e destroi clients.

### src/main/tipc.ts

6 novos IPC procedures adicionados ao final do router:

| Procedure | Funcao |
|-----------|--------|
| `getNanobotStatus` | Retorna estado atual do agente |
| `restartNanobot` | Reinicia o processo Python |
| `sendNanobotMessage` | Envia mensagem e retorna resposta completa |
| `getNanobotMemory` | Le conteudo do MEMORY.md do agente |
| `resetNanobotMemory` | Limpa memoria do agente |
| `getNanobotCronJobs` | Lista cron jobs configurados |

### src/renderer/src/context/AIContext.jsx

Adicionado bloco nanobot (~50 linhas):

- Estado: `nanobotEnabled`, `nanobotStatus`
- `useEffect` que verifica config e polls status a cada 10s
- `generateNanobotCompletion()` — envia mensagem via IPC, recebe resposta
- `isNanobotActive` — computed: enabled AND connected
- Tudo exportado no `AIContextValue`

### src/renderer/src/hooks/useChat.jsx

Adicionado roteamento condicional (~35 linhas):

- Extrai `isNanobotActive` e `generateNanobotCompletion` do context
- `addMessageNanobot()` — versao simplificada que pula RAG
- `getAIResponseNanobot()` — usa `generateNanobotCompletion` direto
- Estado `toolCalls` para tracking de tools usadas
- Return condicional: `isNanobotActive ? addMessageNanobot : addMessage`

### src/renderer/src/pages/pile/Chat/index.jsx

2 mudancas visuais:

1. **Badge "Agent"** no header quando nanobot ativo (gradient roxo)
2. **Tool calls bar** acima do input — badges pulsantes mostrando tools em uso

### src/renderer/src/pages/pile/Chat/Chat.module.scss

3 novos estilos:

- `.agentBadge` — badge gradient roxo inline
- `.toolCallsBar` — barra horizontal de badges
- `.toolCallBadge` — badge individual com dot pulsante (animacao `toolPulse`)

### src/renderer/src/pages/pile/Settings/index.jsx

Nova aba "Agent" + componente `AgentSettingsTab` (~110 linhas):

- Toggle enable/disable nanobot
- Indicador de status (cor verde/amarelo/vermelho + texto)
- Uptime em minutos
- Botao "Carregar" para ver MEMORY.md do agente
- Lista de cron jobs ativos
- Nota sobre requisito Python 3.10+

### src/main/services/autonomous-memory-service.ts

+10 linhas na funcao `syncAllMemoryFiles()`:

Agora tambem sincroniza `nanobot-workspace/memory/MEMORY.md` e `HISTORY.md` no SQLite + FTS5 + embeddings. Isso permite que servicos do Liv (kanban, profile, etc.) encontrem memorias do agente via busca vetorial.

### src/main/services/autonomous-kanban-service.ts

+15 linhas no `refreshAutonomousKanban()`:

Apos gerar o board, escreve `KANBAN_SUMMARY.md` no workspace do nanobot com resumo formatado por coluna. Isso permite que o agente leia o estado do kanban via seu MEMORY.md.

---

## 5. Workspace do Nanobot

Localizado em `{appData}/{APP_ID}/nanobot-workspace/`:

```
nanobot-workspace/
  memory/
    MEMORY.md          # Memoria de longo prazo (consolidada pelo LLM)
    HISTORY.md         # Log de eventos (grep-searchable)
    KANBAN_SUMMARY.md  # Escrito pelo Liv apos cada refresh
  sessions/
    *.jsonl            # Conversas persistidas (append-only)
  skills/
    liv-journaling/SKILL.md
    liv-productivity/SKILL.md
    liv-life-os/SKILL.md
    liv-memory/SKILL.md
    liv-navigator/SKILL.md
  jobs.json            # Cron jobs persistidos
```

Skills sao copiados de `resources/nanobot/skills/` no primeiro boot. O usuario pode customizar os do workspace sem afetar os defaults.

---

## 6. Tools do Agente

### Liv Tools (7 tools via callback HTTP)

| Tool | Acoes | Endpoint Callback |
|------|-------|-------------------|
| `liv_journal` | list, trigger, status | /journal/* |
| `liv_kanban` | get, create, update, delete, move | /kanban/* |
| `liv_memory` | search, write | /memory/* |
| `liv_life_os` | get_context, update_context, get_analysis, refresh_analysis | /life/* |
| `liv_profile` | get, refresh | /profile/* |
| `liv_recordings` | list | /recordings |
| `liv_app` | navigate, notify, status | /app/* |

### Nanobot Built-in Tools (10)

| Tool | Funcao |
|------|--------|
| `read_file` | Le arquivos do workspace |
| `write_file` | Escreve arquivos |
| `edit_file` | Edita arquivos |
| `list_dir` | Lista diretorios |
| `exec` | Executa comandos shell |
| `web_search` | Busca na web (Brave) |
| `web_fetch` | Fetch de URLs |
| `message` | Envia mensagem para canal |
| `spawn` | Cria subagente |
| `cron` | Agenda jobs |

---

## 7. Cron Jobs Padrao

| ID | Schedule | Funcao |
|----|----------|--------|
| `auto-journal-hourly` | A cada 1h | Dispara auto-journal, atualiza kanban, escreve resumo na memoria |
| `daily-review` | 22:00 diario | Revisao do dia: journal + kanban + insights → memoria consolidada |
| `weekly-life-analysis` | Domingo 20:00 | Analise semanal Life OS com janela de 7 dias |
| `profile-refresh` | A cada 4h | Atualiza insights de perfil (work time, topicos, riscos) |

---

## 8. Seguranca

- **Callback server**: bind em `127.0.0.1` only (nunca exposto externamente)
- **Gateway**: bind em `127.0.0.1` only
- **API keys**: passadas como env vars (`LIV_API_KEY`), nunca escritas em disco
- **Workspace**: restrito ao diretorio do app
- **Portas**: alocadas dinamicamente (porta livre)

---

## 9. Resiliencia

- **Auto-restart**: backoff exponencial (1s → 2s → 4s → max 30s)
- **Health check**: `/health` verificado a cada 2s durante startup, timeout de 30s
- **Memory monitor**: processo Python reiniciado se RSS > 512MB (verificado a cada 60s)
- **Graceful shutdown**: SIGTERM → aguarda 5s → SIGKILL
- **Fallback**: se nanobot falhar, Chat usa LLM direto + schedulers setInterval

---

## 10. Como Ativar

1. Instalar Python 3.10+ e dependencias:
   ```bash
   pip install -r resources/nanobot/requirements.txt
   ```

2. No app: Settings → Agent → Toggle ON

3. O bridge spawna o processo Python automaticamente

4. Chat muda para "Agent Mode" (badge roxo no header)

---

## 11. Como Testar

```bash
# 1. Verificar tipos
pnpm run typecheck

# 2. Dev mode
pnpm dev

# 3. Ativar em Settings → Agent → ON

# 4. Testar no Chat:
# "quais sao minhas tarefas no kanban?"
#   → agente chama liv_kanban(action='get') → retorna board

# "agenda um lembrete pra amanha as 9h"
#   → agente usa cron tool

# "como estou nas minhas metas de vida?"
#   → agente usa liv_life_os + skill liv-life-os

# 5. Verificar logs:
# ~/Library/Logs/Liv/nanobot.log    (Python gateway)
# ~/Library/Logs/Liv/main.log       (Electron main process)
```

---

## 12. Limitacoes Conhecidas

1. **Streaming**: Por enquanto, a resposta do agente chega completa via HTTP (nao streamed). O WebSocket esta implementado no gateway mas o proxy no main process ainda usa HTTP. Tokens aparecem de uma vez no Chat.

2. **Dependencia Python**: Requer Python 3.10+ instalado no sistema. O script `build-nanobot.js` cria binario para producao, mas ainda nao esta integrado ao pipeline de build do Electron.

3. **Primeira execucao**: Na primeira vez que o nanobot roda, ele precisa baixar dependencias e criar o workspace. Pode demorar alguns segundos.

4. **Nanobot-ref**: O codigo do nanobot esta em `nanobot-ref/` como referencia local. Em producao, deve ser instalado via pip ou empacotado com PyInstaller.

---

## 13. Proximos Passos

- [ ] Implementar streaming real via WebSocket proxy no main process
- [ ] Integrar `build-nanobot.js` no pipeline electron-builder
- [ ] Adicionar mais skills conforme uso
- [ ] Testes e2e com o agente
- [ ] Metricas de uso de tools e tempo de resposta
