# Life OS — Framework Telos

**Versao:** 1.0
**Data:** 2026-02-21
**Localizacao:** Profile page (`/profile`)

---

## Visao Geral

O Life OS transforma a pagina Profile do Liv em um sistema de auto-conhecimento com 3 abas que fecham um ciclo completo:

1. **Overview** — Insights autonomos gerados a partir do AutoJournal (ja existia)
2. **MyLife** — Definicao pessoal baseada no framework Telos (missao, dimensoes, metas, principios)
3. **Reality Check** — Confronto entre o que voce diz querer e o que voce realmente faz

A inovacao central: o app ja sabe o que voce faz (via AutoJournal). Agora voce diz o que quer. A magica esta no GAP entre os dois.

---

## Arquitetura

```
┌─────────────────────────────────────────────┐
│              Profile Page (3 Tabs)           │
│  ┌──────────┬──────────┬──────────────────┐  │
│  │ Overview │  MyLife  │  Reality Check   │  │
│  └──────────┴──────────┴──────────────────┘  │
│       ↓            ↓              ↓          │
│  Profile Board  Life Context   Life Analysis │
│  (existente)    (novo JSON)    (novo JSON)   │
└─────────────────────────────────────────────┘
         ↕ IPC (tipc)
┌─────────────────────────────────────────────┐
│         autonomous-life-service.ts           │
│  ┌────────────┐  ┌───────────────────────┐  │
│  │ CRUD       │  │ Analysis Engine       │  │
│  │ Context    │  │ - Classification      │  │
│  │ Wisdom     │  │ - Dimension Scores    │  │
│  │            │  │ - Goal Progress       │  │
│  │            │  │ - Principle Violations │  │
│  │            │  │ - LLM Synthesis       │  │
│  └────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────┘
         ↕ File System
┌─────────────────────────────────────────────┐
│  recordings/auto-agent/                      │
│    life-context.json   (definicao do user)   │
│    life-analysis.json  (ultima analise)      │
│    profile-board.json  (insights existentes) │
└─────────────────────────────────────────────┘
```

---

## Tipos de Dados

Todos definidos em `src/shared/types.ts`:

### LifeContext (entrada do usuario)

```typescript
type LifeContext = {
  mission: string              // Proposito em uma frase
  dimensions: LifeDimension[]  // Areas da vida (Carreira, Saude, etc.)
  goals: LifeGoal[]           // Metas com key results
  principles: LifePrinciple[] // Regras pessoais
  wisdom: WisdomEntry[]       // Frases de sabedoria
  updatedAt: number
}
```

### LifeDimension

Cada dimensao representa uma area da vida com alocacao ideal de tempo:

```typescript
type LifeDimension = {
  id: string
  name: string           // "Carreira", "Saude", etc.
  icon: string           // emoji
  color: string          // hex para visualizacao
  targetPercent: number  // 0-100, % ideal de tempo
  description: string    // como sucesso se parece
  keywords: string[]     // para matching automatico de atividades
  createdAt: number
}
```

**Dimensoes default:** Carreira (35%), Saude (20%), Relacionamentos (15%), Aprendizado (15%), Criativo (10%), Financeiro (5%).

### LifeGoal

```typescript
type LifeGoal = {
  id: string
  title: string
  description: string
  dimensionId: string     // vinculada a uma dimensao
  deadline: number | null
  priority: number        // 1-10
  keyResults: string[]    // lista de resultados-chave
  status: "active" | "completed" | "paused"
  createdAt: number
  updatedAt: number
}
```

### LifePrinciple

```typescript
type LifePrinciple = {
  id: string
  text: string
  category: "time" | "health" | "work" | "social" | "general"
  active: boolean
  createdAt: number
}
```

### LifeAnalysis (saida da analise)

```typescript
type LifeAnalysis = {
  generatedAt: number
  windowDays: number          // 7, 14 ou 30
  alignmentScore: number      // 0-100
  dimensionScores: DimensionScore[]
  goalProgress: GoalProgress[]
  principleViolations: PrincipleViolation[]
  synthesis: string           // carta semanal do LLM
  suggestions: string[]       // sugestoes actionable
}
```

---

## Backend Service

**Arquivo:** `src/main/services/autonomous-life-service.ts`

### Storage

- `recordings/auto-agent/life-context.json` — definicao do usuario (persiste entre sessoes)
- `recordings/auto-agent/life-analysis.json` — cache da ultima analise

### API Publica

| Funcao | Descricao |
|--------|-----------|
| `getLifeContext()` | Retorna contexto salvo ou default com 6 dimensoes |
| `updateLifeContext(context)` | Valida e salva o contexto |
| `getLifeAnalysis()` | Retorna ultima analise do cache (ou null) |
| `refreshLifeAnalysis(windowDays)` | Executa pipeline completo de analise |
| `addWisdomEntry({ text, source })` | Adiciona entrada de sabedoria |
| `deleteWisdomEntry(entryId)` | Remove entrada de sabedoria |

### Pipeline de Analise (`refreshLifeAnalysis`)

```
1. Carrega LifeContext do usuario
2. Carrega AutoJournal runs (ate 240)
3. Filtra pela janela temporal (7/14/30 dias)
4. Classifica atividades em dimensoes (keyword match + fallback por categoria)
5. Calcula DimensionScores (actual vs target %)
6. Calcula GoalProgress (keyword match + velocidade semanal)
7. Detecta PrincipleViolations (patterns temporais e de frequencia)
8. Calcula AlignmentScore (100 - media dos gaps absolutos)
9. Gera sintese via LLM (carta semanal em PT-BR)
10. Persiste resultado em life-analysis.json
11. Registra no sistema de memoria autonoma
```

### Classificacao de Atividades

Cada atividade do AutoJournal e classificada em uma dimensao usando:

1. **Keywords:** Compara `dimension.keywords[]` contra titulo + resumo da atividade (case-insensitive)
2. **Fallback por categoria:** Atividades "Work" vao para a dimensao que contem keywords como "work"/"trabalho"
3. **Exclusao:** Atividades "Idle" ou "Distraction" nao sao classificadas

### Deteccao de Violacoes de Principios

O sistema reconhece dois patterns automaticamente:

1. **Temporal:** `"Nao trabalhar apos 20h"` — checa atividades Work com horario >= 20h
2. **Frequencia:** `"3 vezes por semana academia"` — conta ocorrencias e compara com meta

Principios sem pattern reconhecido sao ignorados (sem falso positivo).

### Provedor LLM

Usa o mesmo pipeline de provider resolution do Chat/AutoJournal:
- Le `pileAIProvider` de `electron-settings`
- Resolve API key via `store.ts` (getKey, getGeminiKey, getGroqKey, getOpenrouterKey, getCustomKey)
- Suporta: OpenAI, Groq, Gemini, OpenRouter, Ollama, Custom
- **Fallback graceful:** Se LLM falhar, retorna dados quantitativos corretos com mensagem placeholder

---

## IPC Procedures

Adicionados em `src/main/tipc.ts`:

| Procedure | Input | Retorno |
|-----------|-------|---------|
| `getLifeContext` | — | `LifeContext` |
| `saveLifeContext` | `{ context: LifeContext }` | `LifeContext` |
| `getLifeAnalysis` | — | `LifeAnalysis \| null` |
| `refreshLifeAnalysis` | `{ windowDays?: number }` | `LifeAnalysis` |
| `addWisdomEntry` | `{ text, source, sourceRunId? }` | `WisdomEntry` |
| `deleteWisdomEntry` | `{ entryId }` | `void` |

---

## Interface do Usuario

### Tab: Overview

Conteudo existente do Profile autonomo (insights por widget) com uma adicao:

- **Alignment Ring** no topo quando existe uma `LifeAnalysis` — SVG circular animado mostrando o score de alinhamento (verde >= 70%, amarelo >= 40%, vermelho < 40%)

### Tab: MyLife

5 secoes collapsiveis com editor inline:

| Secao | Campos | Comportamento |
|-------|--------|---------------|
| **Missao** | Textarea | Save on blur |
| **Dimensoes** | Emoji, nome, cor (color picker), slider % meta, descricao, keywords | Cards editaveis, + Adicionar, Delete com confirmacao |
| **Metas** | Titulo, descricao, dimensao (dropdown), deadline (date), prioridade (1-10), key results (lista) | Status toggle (active/paused/completed) |
| **Principios** | Texto, categoria (select), ativo/inativo | Toggle de ativacao |
| **Sabedoria** | Texto (readonly), fonte (manual/auto), data | Badge de origem, delete |

Todas as alteracoes sao salvas automaticamente via `saveLifeContext` mutation.

### Tab: Reality Check

Layout vertical com:

1. **Barra superior:** Botao Refresh + seletor de janela temporal (7d / 14d / 30d)
2. **Alignment Ring:** SVG gauge grande (110px) com score % e cor dinamica
3. **Dimensoes:** Barras horizontais com:
   - Emoji + nome da dimensao
   - Barra de progresso colorida (cor da dimensao)
   - Marcador vertical da meta (target %)
   - Percentual actual/target
   - Badge de gap (verde = ok, amarelo = desalinhado, vermelho = critico)
4. **Metas:** Linhas com titulo, velocidade/semana, status badge (on-track/at-risk/stalled), contagem de atividades
5. **Principios Violados:** Lista com texto do principio e contagem de violacoes
6. **Carta Semanal:** Texto renderizado da sintese LLM com paragrafos
7. **Sugestoes:** Lista bulleted de acoes recomendadas

---

## Design System

Segue o design system existente do Liv:

- **Dark islands:** Background com gradientes sutis, borders rgba
- **Border-radius:** 14px para secoes, 999px para pills/badges
- **Cores:** CSS variables (--primary, --secondary, --border, --bg, --base)
- **Scrollbars:** Escondidas (`::-webkit-scrollbar { display: none }`)
- **Transicoes:** 120ms ease-in-out para interacoes, 600-800ms para animacoes de dados
- **Responsivo:** Layout adapta em telas < 900px

---

## Fluxo do Usuario

```
1. Abrir Profile (/profile)
2. Ir para aba "MyLife"
3. Definir missao pessoal
4. Ajustar dimensoes (adicionar/remover, definir % meta, keywords)
5. Criar metas vinculadas a dimensoes
6. Definir principios pessoais
7. Ir para aba "Reality Check"
8. Clicar "Refresh" com janela de 14 dias
9. Visualizar:
   - Score de alinhamento geral
   - Gap entre tempo ideal vs real por dimensao
   - Progresso das metas (baseado em atividades reais)
   - Violacoes de principios
   - Carta semanal do mentor IA
   - Sugestoes praticas
10. Ajustar MyLife baseado nos insights → repetir ciclo
```

---

## Dependencias

- **Radix UI Tabs** (`@radix-ui/react-tabs`) — ja instalado no projeto
- **TanStack Query** — para queries e mutations
- **electron-settings** — para resolucao de provider/API keys
- **@google/generative-ai** — para Gemini provider
- Nenhuma nova dependencia foi adicionada

---

## Arquivos

| Arquivo | Linhas | Descricao |
|---------|--------|-----------|
| `src/shared/types.ts` | +80 | 12 tipos Life OS |
| `src/main/services/autonomous-life-service.ts` | ~380 | Servico completo (CRUD + analise + LLM) |
| `src/main/tipc.ts` | +40 | 6 IPC procedures |
| `src/renderer/src/pages/pile/Profile/index.jsx` | ~500 | UI com 3 abas |
| `src/renderer/src/pages/pile/Profile/Profile.module.scss` | ~600 | Estilos completos |

---

## Limitacoes Conhecidas

1. **Classificacao por keywords** e heuristica — nao usa embeddings ou LLM para classificar atividades em dimensoes. Para maior precisao, o usuario deve definir keywords relevantes.
2. **Deteccao de violacoes** suporta apenas patterns temporais ("apos Xh") e de frequencia ("X vezes por semana"). Principios mais complexos nao sao verificados automaticamente.
3. **Trend** (improving/stable/declining) requer pelo menos 2 analises para comparar janelas temporais.
4. **A carta semanal** depende de um provedor LLM configurado. Sem LLM, mostra apenas dados quantitativos.
