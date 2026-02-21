# Liv

Desktop app for AI-powered voice dictation and local journaling, built with Electron + React + Rust.

## Features

- **Voice dictation** with global hotkeys (hold-to-record)
- **Transcription** via local models (Sherpa-ONNX) or cloud (Whisper, Groq)
- **LLM post-processing** for text enhancement, formatting, and correction
- **Auto-insert** transcribed text into the active application
- **Pile workspace** with journal, chat, search, timeline, kanban, and AI-powered auto-journal
- **Screen capture** and session recording for context-aware journaling

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 39 |
| Frontend | React 19, Vite 7, TailwindCSS 4 |
| Language | TypeScript 5.9 |
| Native | Rust (liv-rs) |
| Rich text | TipTap |
| AI/ML | OpenAI, Groq, Gemini, Ollama, Sherpa-ONNX |
| Data | SQLite, Lunr.js |

## Quick Start

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build:mac      # macOS
pnpm build:win      # Windows
pnpm build:linux    # Linux
```

## Project Structure

```
src/main/           Electron main process (IPC, services, config)
src/renderer/src/   React frontend (pages, components, hooks)
src/shared/         Shared types and constants
src/preload/        Electron preload script
liv-rs/             Rust native binary
docs/               Technical documentation
```

## Package Manager

**pnpm** only. No npm, yarn, or bun.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) - Development guide & technical map
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - Architecture overview
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) - Code conventions
- [`docs/BUILD-GUIDE.md`](docs/BUILD-GUIDE.md) - Build & distribution guide
