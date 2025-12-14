# Especificações de Features - Liv

**Última atualização:** Dezembro 2024

Este diretório contém as especificações detalhadas de features do projeto Liv.

---

## Índice por Categoria

### Core - Gravação e Transcrição

| Spec | Descrição | Status |
|------|-----------|--------|
| [fn-key-hotkey-requirements.md](fn-key-hotkey-requirements.md) | Suporte à tecla Fn como atalho | Implementado |
| [dual-recording-interfaces-requirements.md](dual-recording-interfaces-requirements.md) | Interfaces duais de gravação | Em análise |
| [external-audio-management-requirements.md](external-audio-management-requirements.md) | Gerenciamento de áudio externo | Em análise |
| [media-playback-control-requirements.md](media-playback-control-requirements.md) | Controle de reprodução de mídia | Em análise |

### Enhancement e IA

| Spec | Descrição | Status |
|------|-----------|--------|
| [beautification-enhancement-requirements.md](beautification-enhancement-requirements.md) | Sistema de enhancement de transcrições | Implementado |
| [custom-dictionary-system-requirements.md](custom-dictionary-system-requirements.md) | Dicionário personalizado | Planejado |
| [local-models-management-requirements.md](local-models-management-requirements.md) | Gerenciamento de modelos locais (Parakeet) | Implementado |

### UI e Dashboard

| Spec | Descrição | Status |
|------|-----------|--------|
| [ui-design-system-requirements.md](ui-design-system-requirements.md) | Sistema de design da UI | Implementado |
| [dashboard-history-analytics-requirements.md](dashboard-history-analytics-requirements.md) | Dashboard e analytics | Implementado |
| [performance-analytics-requirements.md](performance-analytics-requirements.md) | Analytics de performance | Em desenvolvimento |
| [response-time-monitoring-requirements.md](response-time-monitoring-requirements.md) | Monitoramento de tempo de resposta | Planejado |

### Integração e Automação

| Spec | Descrição | Status |
|------|-----------|--------|
| [browser-integration-requirements.md](browser-integration-requirements.md) | Integração com browser | Planejado |
| [power-mode-automation-requirements.md](power-mode-automation-requirements.md) | Automação de modo de energia | Planejado |

### Pile (Journaling)

| Spec | Descrição | Status |
|------|-----------|--------|
| [pile-integration-analysis.md](pile-integration-analysis.md) | Análise de integração do Pile | Referência |
| [pile-integration-progress.md](pile-integration-progress.md) | Progresso da integração | Referência |

---

## Status Legend

| Status | Descrição |
|--------|-----------|
| **Implementado** | Feature completa e funcionando |
| **Em desenvolvimento** | Sendo implementada ativamente |
| **Em análise** | Spec aprovada, aguardando implementação |
| **Planejado** | Spec em draft, não priorizada |
| **Referência** | Documento de análise/referência |

---

## Como Criar Nova Spec

1. Copie o template de uma spec existente
2. Nomeie como `feature-name-requirements.md`
3. Preencha todas as seções obrigatórias:
   - Visão Geral
   - Requisitos Funcionais
   - Requisitos Não-Funcionais
   - Casos de Uso
   - Critérios de Aceitação
4. Adicione neste índice com status "Planejado"

---

## Documentação Relacionada

- **[CLAUDE.md](../../CLAUDE.md)** - Guia principal de desenvolvimento
- **[docs/](../docs/README.md)** - Documentação técnica
- **[quickstart.md](../../quickstart.md)** - Onboarding rápido
