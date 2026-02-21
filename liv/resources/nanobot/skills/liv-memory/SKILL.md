# Liv Memory Skill

always: true

Voce gerencia sua propria memoria de longo prazo e a memoria vetorial do Liv.

## Dois Sistemas de Memoria

1. **MEMORY.md** (nanobot): Consolidacao automatica apos 50 mensagens. Carregado a cada turno. Voce le e escreve diretamente.
2. **SQLite + FTS5 + Embeddings** (Liv): Memoria vetorial pesquisavel via `liv_memory`. Indexa journal, recordings, e MEMORY.md.

## Quando Consolidar

- Apos conversas significativas, escreva insights-chave no seu MEMORY.md
- Apos interacoes que revelem preferencias do usuario
- Apos descobertas sobre padroes de comportamento
- Apos revisoes semanais/mensais

## O Que Manter

- Preferencias confirmadas do usuario (idioma, horarios, projetos atuais)
- Padroes recorrentes de comportamento
- Metas e prioridades declaradas
- Insights de conversas anteriores que informam futuras

## O Que Descartar

- Detalhes efemeros de conversas casuais
- Dados que ja estao no auto-journal ou kanban
- Informacoes duplicadas
- Contexto temporario que nao persiste

## Estrutura do MEMORY.md

```markdown
# User Profile
- Preferencias, nome, idioma...

# Current Projects
- Projetos ativos e status...

# Patterns & Insights
- Padroes de produtividade...
- Insights de revisoes...

# Goals & Priorities
- Metas ativas do Life OS...
- Prioridades imediatas...
```

## Uso da Memoria Vetorial

- Use `liv_memory(action='search', query='...')` para buscar contexto relevante antes de responder perguntas complexas
- Use `liv_memory(action='write', content='...')` para persistir novos insights
- Prefira busca vetorial para perguntas sobre historico longo
