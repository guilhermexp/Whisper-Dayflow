# Auto Journal - Implementação Estilo Dayflow

**Data:** 22 de Novembro de 2025
**Status:** Em desenvolvimento
**Versão:** 1.0

---

## Visão Geral

Implementação de um sistema de auto-journal inspirado no Dayflow, que gera automaticamente resumos estruturados das atividades do usuário baseados nas transcrições de voz.

## Objetivos

1. Replicar o pipeline de duas etapas do Dayflow (Observações → Timeline Cards)
2. Criar UI dedicada para visualização e configuração
3. Permitir customização de prompts igual ao Dayflow
4. Gerar conteúdo em Português (pt-BR)

---

## Arquitetura Implementada

### Fluxo de Dados

```
Gravações de Voz
    ↓
Transcrições (history.json)
    ↓
generateAutoJournalSummaryFromHistory() [llm.ts]
    ↓
LLM (OpenAI/Groq/Gemini)
    ↓
JSON Estruturado (Activities)
    ↓
UI (Timeline / Auto Journal Page)
```

### Componentes Principais

#### 1. Backend (Main Process)

**`src/main/llm.ts`**
- Função `generateAutoJournalSummaryFromHistory()`
- Prompt dinâmico com guidelines customizáveis
- Suporte a múltiplos providers (OpenAI, Groq, Gemini, OpenRouter)
- Parsing de JSON estruturado

**`src/main/tipc.ts`**
- `getAutoJournalSettings` - Retorna configurações
- `saveAutoJournalSettings` - Salva configurações
- `runAutoJournalNow` - Executa geração manual
- `listAutoJournalRuns` - Lista execuções anteriores

#### 2. Frontend (Renderer Process)

**`src/renderer/src/pages/pile/AutoJournal/`**
- Página completa (não mais dialog)
- Tabs: Execuções e Configurações
- Lista de runs com preview
- Detalhes do run selecionado (SUMMARY + DETAILED SUMMARY)
- Customização de prompts estilo Dayflow

**`src/renderer/src/pages/pile/Timeline/`**
- Visualização de timeline igual ao Dayflow
- Painel esquerdo: barras de atividade por hora
- Painel direito: detalhes da atividade selecionada
- Navegação por data

---

## Estrutura de Dados

### Types (`src/shared/types.ts`)

```typescript
// Entrada detalhada com timestamps granulares
export type AutoJournalDetailedEntry = {
  startTs: number      // Epoch ms
  endTs: number        // Epoch ms
  description: string  // 10-20 palavras
}

// Atividade completa
export type AutoJournalActivity = {
  startTs: number
  endTs: number
  title: string        // 5-10 palavras, conversacional
  summary: string      // 2-3 frases factuais
  category?: "Work" | "Personal" | "Distraction" | "Idle"
  detailedSummary?: AutoJournalDetailedEntry[]
}

// Resumo completo de uma execução
export type AutoJournalSummary = {
  windowStartTs: number
  windowEndTs: number
  summary: string
  activities: AutoJournalActivity[]
  debug?: {
    provider: string
    model: string
    itemsUsed: number
    logChars: number
    truncated: boolean
  }
}
```

### Configurações

```typescript
// Config type
{
  // Básicas
  autoJournalEnabled?: boolean
  autoJournalWindowMinutes?: number  // 30, 60, 120
  autoJournalTargetPilePath?: string

  // Customização de Prompts (Dayflow-style)
  autoJournalTitlePromptEnabled?: boolean
  autoJournalTitlePrompt?: string
  autoJournalSummaryPromptEnabled?: boolean
  autoJournalSummaryPrompt?: string
}
```

---

## Prompt Engineering

### Guidelines de Títulos

```
Write titles like you're texting a friend about what you did.
Natural, conversational, direct, specific.

Rules:
- Be specific and clear (not creative or vague)
- Keep it short - aim for 5-10 words
- Don't reference other cards or assume context
- Include specific app/tool names
- Use specific verbs: "Debugged Python" not "Worked on project"

Good: "Debugando fluxo de autenticação no React"
Bad: "Sessão produtiva da manhã"
```

### Guidelines de Resumos

```
Write brief factual summaries optimized for quick scanning.
First person perspective without "I".

Critical rules - NEVER:
- Use third person ("The session", "The work")
- Add filler phrases like "kicked off", "dove into"
- Write more than 2-3 short sentences

Good: "Refatorou módulo de auth no React, adicionou OAuth.
       Debugou CORS por uma hora."
Bad: "Começou a manhã entrando em trabalho de design..."
```

### Categorias

- **Work**: tarefas produtivas, projetos, reuniões
- **Personal**: assuntos pessoais, saúde, família
- **Distraction**: navegação não relacionada, redes sociais
- **Idle**: pausas, espera, sem atividade

---

## Rotas e Navegação

### Router (`src/renderer/src/router.tsx`)

```typescript
{
  path: "timeline",
  lazy: () => import("./pages/pile/Timeline"),
},
{
  path: "auto-journal",
  lazy: () => import("./pages/pile/AutoJournal"),
},
```

### Layout Navigation

- Timeline: `<Link to="/timeline">` com ClockIcon
- Auto Journal: `<Link to="/auto-journal">` com NotebookIcon

---

## UI Components

### Timeline Page

**Layout de duas colunas:**

1. **Painel Esquerdo (Timeline)**
   - Header com data e navegação (< >)
   - Legenda de cores (Work, Personal, Distraction, Idle)
   - Marcadores de hora (4 AM - 10 PM)
   - Barras de atividade clicáveis

2. **Painel Direito (Detalhes)**
   - Título da atividade
   - Range de tempo + badge de categoria
   - RESUMO
   - RESUMO DETALHADO (timestamps granulares)
   - Botões de avaliação (👍 👎)

### Auto Journal Page

**Tabs:**

1. **Execuções**
   - Botão "Gerar agora"
   - Lista de runs anteriores
   - Preview do resumo
   - Detalhes do run selecionado com cards estilo Dayflow

2. **Configurações**
   - Toggle execuções automáticas
   - Intervalo (30min, 60min, 2h)
   - Pile alvo
   - **Títulos dos Cards** - toggle + textarea editável
   - **Resumos dos Cards** - toggle + textarea editável

---

## Traduções

### Chaves Adicionadas

**pt-BR.json / en-US.json:**

```json
{
  "timeline": {
    "work": "Trabalho",
    "personal": "Pessoal",
    "distraction": "Distração",
    "idle": "Ocioso",
    "summary": "RESUMO",
    "detailedSummary": "RESUMO DETALHADO",
    "rateThis": "Avaliar este resumo",
    "noActivities": "Nenhuma atividade para este dia.",
    "generateToSee": "Gere um resumo para ver sua timeline."
  },
  "autoJournal": {
    "cardTitles": "Títulos dos Cards",
    "cardTitlesDesc": "Controle tom e estilo para os títulos.",
    "cardSummaries": "Resumos dos Cards",
    "cardSummariesDesc": "Controle tom e estilo para os resumos."
  }
}
```

---

## Arquivos Modificados

### Core
- `src/shared/types.ts` - Tipos de dados
- `src/main/llm.ts` - Geração de summaries com LLM
- `src/main/tipc.ts` - Procedures IPC
- `src/main/config.ts` - Configurações (se necessário)

### Frontend
- `src/renderer/src/router.tsx` - Rotas
- `src/renderer/src/pages/pile/Layout.jsx` - Navegação
- `src/renderer/src/pages/pile/AutoJournal/index.jsx` - Página principal
- `src/renderer/src/pages/pile/AutoJournal/AutoJournal.module.scss` - Estilos
- `src/renderer/src/pages/pile/Timeline/index.jsx` - Timeline visual
- `src/renderer/src/pages/pile/Timeline/Timeline.module.scss` - Estilos
- `src/renderer/src/pages/pile/PileLayout.module.scss` - Estilos do ícone

### Locales
- `src/renderer/src/locales/pt-BR.json`
- `src/renderer/src/locales/en-US.json`

---

## Problemas Resolvidos

### 1. Tela vazia na Timeline
**Causa:** React Router lazy loading requer `export const Component`
**Solução:** Adicionado `export const Component = Timeline`

### 2. Timestamps iguais no DETAILED SUMMARY
**Causa:** LLM não recebia timestamps epoch
**Solução:** Formato de input alterado para incluir `(startTs - endTs)`

### 3. Sem botão de voltar
**Causa:** Faltava navegação
**Solução:** Adicionado `navigate(-1)` com CrossIcon

### 4. Conteúdo em inglês
**Causa:** Prompt não especificava idioma
**Solução:** Adicionado "Generate ALL content in PORTUGUESE"

### 5. Toggles não funcionavam
**Causa:** tipc.ts não salvava/retornava novos campos
**Solução:** Atualizado getAutoJournalSettings e saveAutoJournalSettings

---

## Próximos Passos

### Fase 1 - Correções Imediatas
- [ ] Testar toggles de customização de prompt
- [ ] Verificar se prompts customizados são usados na geração
- [ ] Ajustar estilos para consistência visual

### Fase 2 - Melhorias de UX
- [ ] Adicionar loading states durante geração
- [ ] Feedback visual quando prompt é salvo
- [ ] Preview do prompt antes de salvar
- [ ] Botão para resetar ao default

### Fase 3 - Funcionalidades Avançadas
- [ ] Agendamento automático funcional
- [ ] Exportação de timeline como imagem/PDF
- [ ] Edição manual de atividades
- [ ] Tags/labels customizadas
- [ ] Integração com calendário

### Fase 4 - Performance
- [ ] Cache de runs anteriores
- [ ] Lazy loading de detalhes
- [ ] Otimização do prompt (tokens)
- [ ] Retry automático em falhas

### Fase 5 - Analytics
- [ ] Dashboard de produtividade
- [ ] Gráficos de distribuição por categoria
- [ ] Trends semanais/mensais
- [ ] Comparação entre períodos

---

## Referências

- **Dayflow App**: Inspiração principal para UI e prompt engineering
- **Dayflow Codebase**: `<home>/Public/dayflow`
- **Design Spec**: `ai_specs/auto-journal/design.md`
- **Tasks**: `ai_specs/auto-journal/tasks.md`

---

## Notas Técnicas

### Formato de Input para LLM

```
[HH:MM - HH:MM] (epochStart - epochEnd): transcript text
```

Exemplo:
```
[16:07 - 16:12] (1732302420000 - 1732302720000): Discutindo sobre a estrutura do banco de dados...
```

### Parsing de Resposta

O LLM retorna JSON puro (sem markdown). O parsing remove:
- Blocos ```json
- Texto antes/depois do JSON
- Caracteres inválidos

### Providers Suportados

1. **OpenAI** - gpt-4o-mini (default)
2. **Groq** - llama-3.1-70b-versatile
3. **Gemini** - gemini-1.5-flash-002
4. **OpenRouter** - Qualquer modelo compatível
5. **Custom** - Endpoint OpenAI-compatible

---

## Captura de Contexto (Screenshots + OCR)

**Data de Implementação:** 25 de Novembro de 2025
**Status:** ✅ Implementado

### Visão Geral

A funcionalidade de captura de contexto permite que o auto-journal tenha acesso ao conteúdo visual da tela durante cada gravação, enriquecendo o contexto fornecido ao LLM.

### Fluxo de Dados

```
Gravação de Voz
    ↓
Screenshot da janela ativa → OCR (Tesseract.js) → Texto extraído
    ↓                              ↓
Transcrição                    Contexto da tela
    ↓                              ↓
         history.json (+ contextScreenshotPath, contextScreenText)
                       ↓
            Auto-journal coleta screenshots do período
                       ↓
            ffmpeg gera GIF animado (opcional)
                       ↓
            Preview visual na UI do run
```

### Componentes

#### 1. Screen Capture Service

**`src/main/services/screen-capture-service.ts`**

- Captura a janela ativa usando Electron `desktopCapturer`
- Extrai texto usando Tesseract.js (OCR local, suporta `eng+por`)
- Salva screenshot como PNG
- Retorna:
  - `text`: Texto extraído via OCR
  - `windowTitle`: Título da janela
  - `appName`: Nome do aplicativo
  - `timestamp`: Momento da captura
  - `imagePath`: Caminho do arquivo PNG

**Características:**
- Roda em background, não bloqueia transcrição
- Cache de worker Tesseract para melhor performance
- Configurável via `autoJournalIncludeScreenCapture`

#### 2. GIF Generation

**`src/main/services/auto-journal-service.ts`**

Função: `generateGifFromScreenshots(frames[], outputPath)`

- Concatena screenshots em GIF animado usando FFmpeg
- Configuração: 2 FPS, escala 1024px largura
- Loop infinito
- Best-effort: se falhar, auto-journal continua normalmente

**Requisitos:**
- FFmpeg bundled via `@ffmpeg-installer/ffmpeg` (incluído no app)
- Validação no startup (`checkFfmpegAvailability()`)
- Erro no console se verificação do bundle falhar

#### 3. Integração no Recording Flow

**Quando habilitado:**
1. Após cada transcrição bem-sucedida
2. Captura screenshot + OCR da janela ativa
3. Salva PNG em `recordings/screenshots/{id}.png`
4. Adiciona campos ao `RecordingHistoryItem`:
   - `contextScreenshotPath`: Caminho do PNG
   - `contextCapturedAt`: Timestamp
   - `contextScreenText`: Texto extraído via OCR
   - `contextScreenAppName`: Nome do app
   - `contextScreenWindowTitle`: Título da janela

**No Auto-Journal Run:**
1. Coleta todos os screenshots do período (window)
2. Gera GIF com `ffmpeg` (se disponível)
3. Salva em `recordings/auto-journal/gifs/{runId}.gif`
4. Adiciona ao `AutoJournalRun`:
   - `previewGifPath`: Caminho do GIF
   - `screenshotCount`: Quantidade de frames
   - `gifError`: Erro se ffmpeg falhou (`"ffmpeg_not_found"` ou `"ffmpeg_failed"`)

#### 4. Tipos Atualizados

**`src/shared/types.ts`**

```typescript
export type RecordingHistoryItem = {
  // ... campos existentes
  // Context capture (experimental)
  contextScreenshotPath?: string
  contextCapturedAt?: number
  contextScreenText?: string
  contextScreenAppName?: string
  contextScreenWindowTitle?: string
}

export type AutoJournalRun = {
  // ... campos existentes
  previewGifPath?: string
  screenshotCount?: number
  gifError?: string  // "ffmpeg_not_found" | "ffmpeg_failed"
}

export type Config = {
  // ... campos existentes
  autoJournalIncludeScreenCapture?: boolean
}
```

### UI

#### Settings Tab (Auto Journal)

**Toggle:** "Incluir contexto da tela"
- Descrição: "Após cada gravação, captura a janela ativa (OCR) e adiciona ao contexto do auto diário."
- Helper condicional (ℹ️): Exibe instruções de instalação do FFmpeg quando toggle está ativo

**Strings i18n:**
- `autoJournal.screenCapture`
- `autoJournal.screenCaptureDesc`
- `autoJournal.gifPreview`
- `autoJournal.gifPreviewDesc`
- `autoJournal.gifMissing`

#### Run Details Panel

**Seção "Sequência da tela":**
- Exibe GIF animado se disponível (`previewGifPath`)
- Aviso se geração do GIF falhou (`gifError`)
- Renderizado via protocolo `assets://file`

### FFmpeg Bundled

**Implementação:**
- Pacote: `@ffmpeg-installer/ffmpeg` (npm)
- Fornece binários estáticos para macOS, Windows e Linux
- Incluído automaticamente no bundle do app

**Verificação no Startup:**
- `src/main/index.ts` verifica o binário bundled ao iniciar
- Logs de erro se verificação falhar
- Caminho do binário resolvido automaticamente

**Plataformas Suportadas:**
- ✅ macOS (Apple Silicon + Intel)
- ✅ Windows (x64)
- ✅ Linux (x64, arm64)

**Nenhuma instalação manual necessária!**

### Comportamento

**Normal (FFmpeg bundled OK):**
- ✅ OCR funciona
- ✅ Screenshots capturados e salvos
- ✅ Contexto de texto injetado no prompt
- ✅ GIF preview gerado automaticamente

**Se FFmpeg bundle falhar (raro):**
- ✅ OCR continua funcionando
- ✅ Screenshots são capturados e salvos
- ✅ Contexto de texto é injetado no prompt
- ❌ GIF preview não é gerado
- ⚠️ Erro logado no console

O sistema **nunca falha** por problemas com FFmpeg - é graceful.

### Performance

**Tesseract.js:**
- Worker pool reutilizado (não cria novo worker a cada captura)
- Cache de linguagens (eng+por) em `userData/tesseract-cache`
- OCR roda em thread separada, não bloqueia main

**FFmpeg:**
- Execução síncrona durante `runAutoJournalOnce`
- Timeout não aplicado (GIF pode levar alguns segundos)
- Limpeza automática de arquivos temporários (> 10 min)

### Configuração

**Caminho dos dados:**
- Screenshots: `recordings/screenshots/`
- GIFs: `recordings/auto-journal/gifs/`
- Temporários: `recordings/auto-journal/tmp/`

**Formato das imagens:**
- PNG para screenshots (alta qualidade)
- GIF para preview (2 FPS, 1024px largura)

### Troubleshooting

**OCR retorna texto vazio:**
- Normal para janelas gráficas (design tools, videos)
- Tesseract funciona melhor com texto nítido e contraste alto

**GIF não é gerado:**
1. Verificar logs do console para mensagens de erro do FFmpeg
2. Validar que screenshots existem no disco
3. Verificar se o bundle do FFmpeg não foi corrompido (reinstalar app se necessário)

**Screenshots muito grandes:**
- Tesseract.js captura em resolução nativa
- Considerar limpeza periódica de screenshots antigos

**FFmpeg bundle verification failed:**
- Erro raro que indica problema no bundle do app
- Reinstalar aplicação
- Reportar issue com logs do console

---

## Contato

Para dúvidas ou sugestões sobre esta implementação, consulte os specs em `ai_specs/auto-journal/`.
