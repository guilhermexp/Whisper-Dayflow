# Whisper-Dayflow (Whispo)

**AI-powered dictation tool for macOS and Windows**

[![GitHub Release](https://img.shields.io/github/v/release/egoist/whispo?style=for-the-badge)](https://github.com/egoist/whispo/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-green.svg?style=for-the-badge)](LICENSE)
[![Build Status](https://img.shields.io/badge/Status-Active%20Development-brightgreen?style=for-the-badge)](CLAUDE.md)

---

## 🎯 What is Whispo?

Whispo is a desktop application that turns voice into text with a single key press. It integrates seamlessly with any application - email, messaging, code editors, documents - and automatically transcribes and inserts your voice as you dictate.

### Key Features

- 🎤 **Hold-to-Record** - Press and hold Ctrl key (or Ctrl+/) to start recording
- 🤖 **AI Transcription** - Powered by OpenAI Whisper or Groq (with custom API support)
- ✨ **Smart Post-Processing** - Optional grammar correction and rephrasing with LLMs
- 🖼️ **Context Capture (optional)** - Clipboard and active-window OCR to enrich prompts and auto-journal
- 🗂️ **Auto Journal** - Summarize recent recordings; can include screen OCR context
- 🚀 **Instant Insertion** - Automatically types transcript into your active application
- 📚 **Full History** - Every transcription saved with timestamps
- 🔒 **Local First** - All data stored on your machine, no cloud dependency
- 🌐 **Cross-Platform** - Works with any application that accepts text input
- ⚙️ **Customizable** - Configure hotkeys, providers, post-processing options

---

## 🚀 Getting Started

### Download

Get the latest version from [GitHub Releases](https://github.com/egoist/whispo/releases):

- **macOS (Apple Silicon & Intel)**
- **Windows x64**
- Linux (coming soon)

### Quick Setup

1. **Download and install** the app for your platform
2. **Grant permissions:**
   - Microphone access (System Preferences → Security & Privacy)
   - Accessibility (System Preferences → Security & Privacy → Accessibility)
3. **Configure STT provider:**
   - Get API key from [OpenAI](https://platform.openai.com) or [Groq](https://console.groq.com)
   - Add key in Whispo Settings
4. **Start using:**
   - Hold `Ctrl` key (800ms) to start recording
   - Release to transcribe and insert

### For Developers

See **[CLAUDE.md](CLAUDE.md)** for comprehensive development guide, or jump straight to [Quickstart](quickstart.md).

```bash
# Clone and setup
git clone https://github.com/egoist/whispo.git
cd whispo/whispo
pnpm install

# Start development
pnpm dev

# Build for production
pnpm build
```

---

## 📋 Features in Detail

### Speech-to-Text (STT)

Choose your preferred transcription provider:

| Provider | Model | Notes |
|----------|-------|-------|
| **OpenAI** | whisper-1 | Most accurate, $0.006/min |
| **Groq** | whisper-large-v3 | Fast & free, highly compatible |
| **Custom API** | Your choice | Support for compatible APIs |

Configure via Settings with custom base URLs supported.

### Post-Processing (LLM)

Optionally improve transcripts with:

| Provider | Models | Use Cases |
|----------|--------|-----------|
| **OpenAI** | GPT-4, GPT-3.5 | Grammar, tone, formatting |
| **Groq** | Mixtral, Llama 2 | Fast & free alternatives |
| **Gemini** | Gemini Pro | Google's multimodal capabilities |

### Global Keyboard Shortcuts

Two modes to choose from:

1. **Hold Ctrl (Default)**
   - Press and hold `Ctrl` for 800ms → start recording
   - Release `Ctrl` → stop and transcribe
   - Press any other key → cancel recording

2. **Toggle Mode (Ctrl+/)**
   - Press `Ctrl+/` → start recording
   - Press again → stop and transcribe
   - Press `Esc` → cancel

### Context Capture & Auto Journal

- **Context Capture (optional)**: enable clipboard and/or active-window OCR to enrich prompts. Screen OCR runs locally via Tesseract; only extracted text is used.
- **Auto Journal**: summarizes recent recordings (15/30/60/120 min) and can include the screen OCR text when the flag is enabled, giving YA better context without slowing Whisper (capture runs after transcription completes).

---

## 🏗️ Architecture

```
Electron Desktop App
├── Main Process (Node.js)
│   ├── Global keyboard shortcuts
│   ├── System tray integration
│   ├── API communication
│   ├── Local file storage
│   └── Post-processing logic
├── Renderer (React + React Router)
│   ├── Floating panel for recording
│   ├── Settings and configuration
│   ├── Recording history
│   └── Real-time audio visualization
├── Native Bindings (Rust)
│   ├── Keyboard event capture
│   └── Text insertion simulation
└── External APIs
    ├── OpenAI Whisper
    ├── Groq Whisper API
    └── LLM providers (OpenAI, Groq, Gemini)
```

**Technology Stack:**
- Electron 31+ | React 18 | TypeScript 5.6
- TailwindCSS | Radix UI | React Router
- TanStack Query | Electron Vite
- Rust (rdev, enigo)

---

## 📚 Documentation

### For Users

- [Features Overview](#-features-in-detail) - Detailed feature descriptions
- [Quick Setup](#-getting-started) - Installation and configuration
- [Troubleshooting](#-troubleshooting) - Solutions for common issues

### For Developers

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **[CLAUDE.md](CLAUDE.md)** | Development guide, architecture, best practices | 15 min |
| **[AGENTS.md](AGENTS.md)** | AI agent communication protocol | 10 min |
| **[quickstart.md](quickstart.md)** | Rapid onboarding with code references | 10 min |
| **[ai_docs/whispo-analysis.md](ai_docs/whispo-analysis.md)** | Technical deep dive, complete analysis | 30 min |
| **[ai_issues/README.md](ai_issues/README.md)** | Known bugs and issues | 5 min |
| **[ai_specs/README.md](ai_specs/README.md)** | Feature specifications and requirements | Varies |
| **[ai_research/README.md](ai_research/README.md)** | Research notes and experiments | Varies |
| **[ai_changelog/README.md](ai_changelog/README.md)** | Version history and changes | Varies |

---

## 🛠️ Configuration

All settings stored in `~/.config/whispo` (Linux/macOS) or `%APPDATA%\whispo` (Windows):

```json
{
  "hotkey": "ctrl",
  "hotkey_mode": "hold",
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.openai.com/v1",
  "groqApiKey": "gsk_...",
  "groqBaseUrl": "https://api.groq.com/openai/v1",
  "transcriptionProvider": "openai",
  "transcriptPostProcessingEnabled": false,
  "transcriptPostProcessingProviderId": "openai",
  "useClipboardContext": false,
  "useScreenCaptureContext": false,
  "autoJournalIncludeScreenCapture": false
}
```

Configure via Settings panel - no manual file editing needed.

---

## 🐛 Troubleshooting

### Hotkey Not Working

**macOS:**
- Grant Accessibility permission: System Preferences → Security & Privacy → Accessibility
- Ensure Whispo is in the list

**Windows:**
- Check for conflicting shortcuts in other applications
- Try switching hotkey mode in Settings

### Transcription Failing

- Verify API key is correct in Settings
- Check internet connection
- Ensure API provider isn't rate-limited
- Confirm base URL matches your provider

### Microphone Issues

- **macOS:** Grant microphone access in System Preferences
- **Windows:** Check Settings → Privacy & Security → Microphone

### Memory Usage High

- Large audio files may cause temporary memory spikes
- Restart app if memory doesn't normalize
- Report if issue persists (see [Known Issues](ai_issues/README.md))

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Understand the project** - Read [CLAUDE.md](CLAUDE.md)
2. **Check existing issues** - [GitHub Issues](https://github.com/egoist/whispo/issues)
3. **Create a fork** and work on your feature
4. **Test thoroughly** - See [Testing Guide](CLAUDE.md#-building--releasing)
5. **Submit a pull request** with clear description

### Development Requirements

- Node.js 18+
- pnpm 9
- macOS or Windows (for building native components)
- Rust (for Whisper-rs binary)

### Development Workflow

```bash
# Setup
pnpm install
pnpm dev

# Build
pnpm build
pnpm build:mac     # macOS
pnpm build:win     # Windows
pnpm build:linux   # Linux
```

See [CLAUDE.md Development Guide](CLAUDE.md) for detailed information.

---

## 📄 License

This project is licensed under the **AGPL-3.0 License** - see [LICENSE](LICENSE) file for details.

In brief:
- ✅ Use for any purpose (personal, commercial)
- ✅ Modify and distribute
- ⚠️ Must disclose source code
- ⚠️ Network use is distribution
- ⚠️ License must be same (AGPL-3.0)

---

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Transcription via [OpenAI Whisper](https://openai.com/research/whisper) and [Groq](https://groq.com/)
- UI powered by [Radix UI](https://www.radix-ui.com/) and [TailwindCSS](https://tailwindcss.com/)
- Keyboard capture via [rdev](https://github.com/enigo-rs/rdev)
- Text input via [enigo](https://github.com/enigo-rs/enigo)

---

## 📞 Support

- **Report Bugs:** [GitHub Issues](https://github.com/egoist/whispo/issues)
- **Feature Requests:** [GitHub Discussions](https://github.com/egoist/whispo/discussions)
- **Documentation:** [ai_docs/](ai_docs/README.md)

---

## 🚀 Roadmap

- [x] macOS support (Apple Silicon & Intel)
- [x] Windows x64 support
- [x] Multiple STT providers (OpenAI, Groq)
- [x] LLM post-processing
- [x] Recording history
- [ ] Linux support
- [ ] Multilingual support
- [ ] Voice profiles/speaker identification
- [ ] Custom model fine-tuning
- [ ] Mobile app (planned)

---

## 📊 Statistics

- **Language:** TypeScript + React + Rust
- **Version:** 0.1.7
- **Status:** Active Development
- **Last Updated:** November 2024

---

**Made with ❤️ for developers who talk to their code.**

[Download Latest Release](https://github.com/egoist/whispo/releases/latest) • [Report Issue](https://github.com/egoist/whispo/issues) • [Documentation](CLAUDE.md)
