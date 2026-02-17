# Relatório Técnico
## Sistema Autônomo de Memória, Contexto e Kanban

- Projeto: Whisper-Dayflow (`liv`)
- Data: 2026-02-12
- Escopo: Implementação de memória persistente, recuperação híbrida de contexto, geração autônoma de Kanban e integração com Ollama embeddings locais para redução de custo.

---

## 1. Resumo Executivo

Foi implementado um pipeline autônomo funcional com os seguintes pilares:

1. Memória persistente entre sessões (longo prazo + diário).
2. Indexação híbrida (keyword + semântica) com SQLite/FTS e embeddings.
3. Geração automática de cards para 3 lanes do Kanban:
   - Pendentes
   - Sugestões
   - Automações
4. Sincronização em background acoplada ao ciclo do auto-journal.
5. Suporte a embeddings locais via Ollama (incluindo download de modelos no app), com fallback para OpenAI.

Resultado: o Kanban saiu de dados mockados e passou a refletir análise real contínua dos runs.

---

## 2. Objetivos e Problema Atacado

### 2.1 Objetivos funcionais

- Transformar a tela de Kanban em painel operacional autônomo.
- Manter memória de contexto durável para decisões futuras.
- Permitir busca por contexto relevante sem depender apenas da janela curta de conversa.
- Reduzir custo recorrente de embeddings com alternativa local.

### 2.2 Objetivos não-funcionais

- Manter compatibilidade com arquitetura atual (Electron main + renderer + IPC).
- Evitar regressão no fluxo existente de auto-journal.
- Garantir fallback seguro quando embeddings locais estiverem indisponíveis.

---

## 3. Arquitetura Implementada

### 3.1 Memória persistente

Estrutura de armazenamento:

- `recordings/auto-agent/MEMORY.md` (longo prazo curado)
- `recordings/auto-agent/memory/YYYY-MM-DD.md` (log diário)
- `recordings/auto-agent/memory_index.db` (índice SQLite)

Princípio adotado:

- Markdown como fonte de verdade legível/editável.
- SQLite para recuperação rápida e ranqueamento híbrido.

### 3.2 Recuperação híbrida

A busca combina dois sinais:

1. BM25 via SQLite FTS5 (boa para termos exatos, IDs e tokens técnicos).
2. Similaridade semântica por embeddings (boa para intenção/contexto).

Merge de score:

- Semântico: 0.7
- Lexical: 0.3

### 3.3 Chunking de memória

- Tamanho alvo de chunk: ~400 tokens
- Overlap: ~80 tokens
- Estratégia line-aware para reduzir perda de contexto entre fronteiras.

### 3.4 Orquestração do Kanban autônomo

Fonte de sinais:

- Runs do auto-journal (`recordings/auto-journal/runs/*.json`)

Processamento:

1. Detecta pendências por padrões linguísticos + `highlight = Do later`.
2. Gera sugestões por padrões de distração/idle/switch de contexto.
3. Detecta padrões repetidos para propor automações.
4. Dedup simplificado por normalização semântica de títulos.

Persistência do board:

- `recordings/auto-agent/kanban-board.json`

### 3.5 Execução em background

- Após run bem-sucedido do auto-journal, o serviço chama refresh do Kanban autônomo.
- Mantém o quadro sempre sincronizado com os dados recentes sem ação manual.

---

## 4. Integração Ollama (Embeddings Locais)

### 4.1 Motivação

- Reduzir custo variável de embeddings em API externa.
- Preservar operação local/offline parcial.
- Oferecer controle explícito de trade-off qualidade x consumo de recursos.

### 4.2 Implementação técnica

Foram adicionadas capabilities:

- Health check do Ollama (`/api/tags`)
- Listagem de modelos recomendados de embedding
- Pull/download de modelo (`/api/pull`) com progresso
- Seleção de modelo de embedding na UI
- Configuração de base URL (`ollamaBaseUrl`)

Modelos suportados no fluxo UI:

- `qwen3-embedding:0.6b` (1024d, fast)
- `qwen3-embedding:4b` (2560d, balanced)

### 4.3 Fallback

No serviço de memória autônoma:

- Tenta Ollama quando `pileAIProvider = ollama`.
- Se falhar, cai para OpenAI embeddings (se chave disponível).

Isso evita indisponibilidade da busca semântica por falha local transitória.

---

## 5. Alterações de Código (Arquivos)

### 5.1 Novos serviços

- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/services/autonomous-memory-service.ts`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/services/autonomous-kanban-service.ts`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/services/ollama-embedding-service.ts`

### 5.2 Integrações no backend/main

- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/services/auto-journal-service.ts`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/tipc.ts`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/llm.ts`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/pile-utils/pileEmbeddings.js`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/main/config.ts`

### 5.3 Frontend/UI

- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/renderer/src/pages/pile/Kanban/index.jsx`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/renderer/src/pages/pile/Kanban/Kanban.module.scss`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/renderer/src/context/AIContext.jsx`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/renderer/src/pages/pile/Settings/AISettingsTabs/index.jsx`
- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/renderer/src/pages/pile/Settings/AISettingsTabs/AISettingTabs.module.scss`

### 5.4 Tipos compartilhados

- `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/src/shared/types.ts`

### 5.5 Dependências

- `sqlite3` adicionada em `/Users/guilhermevarela/Documents/Projetos/Whisper-Dayflow/liv/package.json`

---

## 6. Validações Executadas

### 6.1 Build/type safety

- `npm run typecheck` executado com sucesso após as alterações.

### 6.2 Runtime local Ollama

- Ollama detectado: `0.15.5`
- Modelo instalado: `qwen3-embedding:0.6b` (~639 MB)
- Endpoint `/api/embed` respondeu corretamente.
- Latência observada em teste rápido local: ~1.2s a ~2.3s para payload curto.

Observação: esse teste é de sanidade de integração e não benchmark estatístico.

---

## 7. Impacto no Produto

### 7.1 Ganhos

- Kanban operacional com dados reais e atualização contínua.
- Memória persistente acionável para contexto multi-sessão.
- Busca híbrida robusta para consulta contextual.
- Redução potencial relevante de custo usando embeddings locais.

### 7.2 Trade-offs

- Embedding local desloca custo para CPU/RAM da máquina do usuário.
- Qualidade semântica pode variar por modelo local e hardware.
- Semântica fica dependente da saúde do servidor Ollama (mitigado por fallback).

---

## 8. Riscos Técnicos e Mitigações

1. Alto uso de CPU em indexações grandes com modelo local.
- Mitigação: default em `qwen3-embedding:0.6b`, sync em background e possibilidade de ajuste de cadência.

2. Falha/intermitência do serviço Ollama.
- Mitigação: fallback para OpenAI embeddings no serviço de memória autônoma.

3. Crescimento do banco de memória ao longo do tempo.
- Mitigação recomendada: política de retenção/arquivamento e compactação periódica de chunks antigos.

4. Heurísticas de geração de cards podem introduzir ruído.
- Mitigação recomendada: feedback loop (dismiss/confirm) e ajuste de scoring por telemetria local.

---

## 9. Recomendações de Próxima Iteração

1. Adicionar ações de card (`done`, `snooze`, `convert-to-task`) com reconciliação.
2. Implementar subagentes especializados por lane (pendências, sugestões, automações).
3. Introduzir thresholds configuráveis por usuário (sensibilidade de detecção).
4. Criar modo dual-profile de embeddings:
- Background: `qwen3-embedding:0.6b`
- Reindex manual profundo: `qwen3-embedding:4b`
5. Criar teste de carga leve para indexação (N chunks por minuto) e relatório de latência.

---

## 10. Referências Técnicas

- OpenAI Embeddings Guide: https://platform.openai.com/docs/guides/embeddings
- OpenAI `text-embedding-3-small`: https://platform.openai.com/docs/models/text-embedding-3-small
- SQLite FTS5/BM25: https://www.sqlite.org/fts5.html
- Ollama API Embed: https://docs.ollama.com/api/embed
- Ollama API Pull: https://docs.ollama.com/api/pull
- Qwen3 Embedding 0.6B GGUF: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF
- Qwen3 Embedding 4B GGUF: https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF

---

## 11. Conclusão

A implementação entregue já atende o objetivo de autonomia funcional com memória persistente e Kanban orientado por análise contínua. A integração com Ollama para embeddings reduz custo e mantém controle local de recursos, com fallback para preservar resiliência. O próximo ciclo recomendado é focar em governança dos cards (ações + feedback loop) e refinamento de qualidade do planejamento autônomo.
