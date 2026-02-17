# Documentação Técnica - Liv

**Última atualização:** Fevereiro 2026

Este diretório contém a documentação técnica do projeto Liv.

---

## Índice

### Guias de Build e Deploy

| Documento | Descrição |
|-----------|-----------|
| [BUILD-GUIDE.md](BUILD-GUIDE.md) | Guia completo de build para todas as plataformas |

### Troubleshooting

| Documento | Descrição |
|-----------|-----------|
| [macos-permissions-troubleshooting.md](macos-permissions-troubleshooting.md) | Resolução de problemas de permissões no macOS |

### Arquitetura e Design

| Documento | Descrição |
|-----------|-----------|
| [overlay-layout-map.md](overlay-layout-map.md) | Mapa de layout do overlay de gravação |
| [screen-capture-robustness.md](screen-capture-robustness.md) | Implementação robusta de captura de tela |

### Performance

| Documento | Descrição |
|-----------|-----------|
| [parakeet-performance-update.md](parakeet-performance-update.md) | Notas de performance do modelo Parakeet local |

### Documentação de AI/Agentes

| Documento | Descrição |
|-----------|-----------|
| [ai_docs/auto-journal-implementation.md](ai_docs/auto-journal-implementation.md) | Implementação do Auto Journal |
| [ai_docs/auto-journal-review.md](ai_docs/auto-journal-review.md) | Revisão do sistema Auto Journal |
| [ai_docs/auto-journal-debug-log.md](ai_docs/auto-journal-debug-log.md) | Logs de debug do Auto Journal |
| [ai_docs/dayflow-pipeline-notes.md](ai_docs/dayflow-pipeline-notes.md) | Notas sobre o pipeline Dayflow |
| [ai_docs/technical-report-autonomous-memory-kanban-2026-02-12.md](ai_docs/technical-report-autonomous-memory-kanban-2026-02-12.md) | Relatório técnico do sistema autônomo de memória + Kanban |
| [ai_docs/autonomous-profile-widgets-architecture-2026-02-12.md](ai_docs/autonomous-profile-widgets-architecture-2026-02-12.md) | Arquitetura de widgets do Profile |
| [ai_docs/autonomous-agents-kanban-profile-architecture-complete-2026-02-12.md](ai_docs/autonomous-agents-kanban-profile-architecture-complete-2026-02-12.md) | Documento mestre consolidado (agentes + Kanban + Profile) |
| [ai_docs/ollama-embedding-eval-2026-02-12.md](ai_docs/ollama-embedding-eval-2026-02-12.md) | Avaliação de embeddings locais Ollama |

---

## Documentação Relacionada

- **[CLAUDE.md](../CLAUDE.md)** - Guia principal de desenvolvimento
- **[quickstart.md](../quickstart.md)** - Onboarding rápido
- **[specs/README.md](../specs/README.md)** - Especificações de features

---

## Estrutura do Projeto

```
liv/
├── docs/                    # Esta pasta
│   ├── ai_docs/             # Docs gerados por AI
│   └── *.md                 # Docs técnicos
├── specs/                   # Especificações de features
├── src/
│   ├── main/                # Electron main process
│   ├── renderer/            # React frontend
│   └── shared/              # Tipos compartilhados
└── resources/               # Recursos nativos (Rust binary)
```
