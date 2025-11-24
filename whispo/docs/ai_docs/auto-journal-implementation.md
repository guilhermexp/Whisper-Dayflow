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
- **Dayflow Codebase**: `/Users/guilhermevarela/Public/dayflow`
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

## Contato

Para dúvidas ou sugestões sobre esta implementação, consulte os specs em `ai_specs/auto-journal/`.
