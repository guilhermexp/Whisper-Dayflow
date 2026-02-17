# Liv

**AI-powered dictation & journaling for macOS and Windows**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-green.svg?style=for-the-badge)](LICENSE)
[![Build Status](https://img.shields.io/badge/Status-Active%20Development-brightgreen?style=for-the-badge)](CLAUDE.md)
[![Version](https://img.shields.io/badge/Version-0.1.8-blue?style=for-the-badge)](CLAUDE.md)

---

## O que é o Liv?

O **Liv** combina ditado por voz com journaling inteligente em uma aplicação desktop. Transcreva sua voz em qualquer aplicativo, mantenha um diário pessoal com busca semântica, e deixe a IA resumir automaticamente suas atividades.

### Funcionalidades Principais

**Ditado por Voz**
- Segure Ctrl para gravar, solte para transcrever
- Funciona em qualquer aplicativo (email, chat, código, documentos)
- Transcrição via OpenAI Whisper, Groq, Deepgram ou modelos locais (Parakeet)
- Enhancement com IA - corrige gramática e formata automaticamente

**Journaling Inteligente**
- Diário pessoal com editor visual
- Chat com IA que conhece seu histórico
- Busca semântica - encontre por significado, não só palavras
- Kanban integrado para tarefas

**Vision Assistant**
- Captura screenshots automaticamente
- OCR extrai texto da tela
- IA resume suas atividades por hora
- Timeline visual do seu dia

**Privacidade**
- 100% dados locais - nada vai pra nuvem
- Sem conta, sem login, sem telemetria
- Você escolhe quais APIs usar

---

## Instalação

### Plataformas Suportadas

- **macOS** (Apple Silicon + Intel)
- **Windows** (x64)
- Linux (em breve)

### Setup Rápido

1. **Baixe e instale** o app
2. **Conceda permissões:**
   - Microfone (Preferências do Sistema → Privacidade)
   - Acessibilidade (Preferências do Sistema → Privacidade → Acessibilidade)
3. **Configure o provedor de transcrição:**
   - Obtenha API key de [OpenAI](https://platform.openai.com), [Groq](https://console.groq.com), ou [Deepgram](https://deepgram.com)
   - Adicione em Settings → Transcrição
4. **Use:**
   - Segure `Ctrl` por 800ms para gravar
   - Solte para transcrever e inserir

### Para Desenvolvedores

```bash
cd liv
pnpm install
pnpm dev        # Desenvolvimento com hot-reload
pnpm build      # Build de produção
```

Veja **[CLAUDE.md](CLAUDE.md)** para guia completo de desenvolvimento.

---

## Provedores Suportados

### Transcrição (STT)

| Provedor | Modelo | Observação |
|----------|--------|------------|
| **OpenAI** | whisper-1 | Mais preciso |
| **Groq** | whisper-large-v3-turbo | Rápido e gratuito |
| **Deepgram** | nova-3 | Baixa latência |
| **Parakeet** | sherpa-onnx | 100% offline |

### Enhancement (LLM)

| Provedor | Modelos |
|----------|---------|
| **OpenAI** | GPT-4, GPT-3.5 |
| **Groq** | Mixtral, Llama |
| **Gemini** | Gemini Pro |
| **OpenRouter** | Múltiplos modelos |
| **Ollama** | Modelos locais |

### Atalhos de Teclado

| Modo | Como Usar |
|------|-----------|
| **Hold Ctrl** (padrão) | Segure 800ms → grave → solte |
| **Instant Ctrl** | Push-to-talk imediato |
| **Ctrl+/** | Toggle - um toque inicia, outro para |
| **Fn Key** | Push-to-talk com tecla Fn |

---

## Arquitetura

```
┌─────────────────────────────────────────┐
│      Electron Main Process              │  ← APIs, serviços, persistência
└─────────────────────────────────────────┘
              ↓↑ IPC (tipc)
┌─────────────────────────────────────────┐
│   Renderer Process (React + Vite)       │  ← UI, componentes
└─────────────────────────────────────────┘
              ↓↑
┌─────────────────────────────────────────┐
│   Rust Binary (liv-rs)                  │  ← Captura teclado, simula digitação
└─────────────────────────────────────────┘
```

**Stack:** Electron 39 | React 19 | TypeScript 5.9 | TailwindCSS | Radix UI | Rust

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| **[CLAUDE.md](CLAUDE.md)** | Guia completo de desenvolvimento |
| **[quickstart.md](quickstart.md)** | Onboarding rápido para desenvolvedores |
| **[docs/README.md](docs/README.md)** | Documentação técnica |
| **[specs/README.md](specs/README.md)** | Especificações de features |
| **[docs/ai_docs/autonomous-agents-kanban-profile-architecture-complete-2026-02-12.md](docs/ai_docs/autonomous-agents-kanban-profile-architecture-complete-2026-02-12.md)** | Arquitetura completa de agentes/Kanban/Profile |

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Atalho não funciona | macOS: conceda permissão de Acessibilidade |
| Transcrição falha | Verifique API key em Settings → Transcrição |
| Sem áudio | Conceda permissão de Microfone |
| Vision Assistant não captura | Conceda permissão de Gravação de Tela |

Veja [docs/macos-permissions-troubleshooting.md](docs/macos-permissions-troubleshooting.md) para detalhes.

---

## Licença

**AGPL-3.0** - Veja [LICENSE](LICENSE) para detalhes.

---

## Créditos

- [Electron](https://www.electronjs.org/) | [React](https://react.dev) | [Radix UI](https://www.radix-ui.com/)
- [OpenAI Whisper](https://openai.com/research/whisper) | [Groq](https://groq.com/) | [Deepgram](https://deepgram.com/)
- [rdev](https://github.com/enigo-rs/rdev) | [enigo](https://github.com/enigo-rs/enigo)

---

**Versão:** 0.1.8 | **Atualizado:** Fevereiro 2026
