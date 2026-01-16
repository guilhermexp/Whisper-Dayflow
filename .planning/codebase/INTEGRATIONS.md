# External Integrations

**Analysis Date:** 2026-01-16

## APIs & External Services

**Speech-to-Text (STT):**
- **OpenAI Whisper** - Cloud transcription
  - Endpoint: `https://api.openai.com/v1/audio/transcriptions` (customizable)
  - Model: `whisper-1` (configurable)
  - Auth: Bearer token via `openaiApiKey` config
  - Implementation: `src/main/llm.ts`, `src/main/tipc.ts`

- **Groq Whisper** - Cloud transcription
  - Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions` (customizable)
  - Model: `whisper-large-v3` (configurable)
  - Auth: Bearer token via `groqApiKey` config
  - Implementation: `src/main/tipc.ts`

- **OpenRouter STT** - Cloud transcription aggregator
  - Endpoint: Customizable base URL
  - Auth: `openrouterApiKey` config
  - Implementation: `src/main/tipc.ts`

**Large Language Models (LLM) for Post-Processing:**
- **OpenAI GPT** - Text enhancement
  - Endpoint: `https://api.openai.com/v1/chat/completions` (customizable)
  - Models: `gpt-4-turbo`, `gpt-3.5-turbo`, `gpt-4o` (configurable)
  - SDK: `openai` 6.9.1
  - Implementation: `src/main/services/enhancement-service.ts`, `src/main/llm.ts`

- **Groq LLMs** - Text enhancement
  - Endpoint: `https://api.groq.com/openai/v1/chat/completions` (customizable)
  - Models: `mixtral-8x7b-instant`, `llama2-70b-4096`, `llama-3.1-70b-versatile`
  - Implementation: `src/main/services/enhancement-service.ts`

- **Google Gemini** - Text enhancement
  - Endpoint: `https://generativeai.googleapis.com/v1beta/models/{model}:generateContent`
  - Models: `gemini-1.5-flash`, `gemini-pro`, `gemini-pro-vision`
  - SDK: `@google/generative-ai` 0.24.1
  - Implementation: `src/main/services/enhancement-service.ts`

- **OpenRouter LLM** - Text enhancement aggregator
  - Endpoint: `https://openrouter.ai/api/v1` (customizable)
  - Models: Any model on OpenRouter platform
  - Implementation: `src/main/services/enhancement-service.ts`

- **Custom LLM Provider** - Text enhancement
  - Endpoint: Fully customizable base URL and model
  - Auth: `customEnhancementApiKey` config
  - Implementation: `src/main/services/enhancement-service.ts`

## Data Storage

**Databases:**
- None (file-based persistence only)

**File Storage:**
- Local file system - All data stored locally
  - Configuration: `~/.config/Liv/config.json` (platform-specific)
  - Recording history: `~/.config/Liv/recordings/history.json`
  - Journals (Piles): `~/Piles/` or user-selected directories
  - Format: JSON + Markdown with YAML frontmatter

**Caching:**
- Tesseract.js OCR cache - `~/.config/Liv/tesseract-cache/` (`src/main/services/screen-capture-service.ts:340`)

## Authentication & Identity

**Auth Provider:**
- None (local desktop app, no user authentication)

**API Key Storage:**
- Location: `~/.config/Liv/config.json`
- Format: Plaintext JSON (encryption planned)
- Implementation: `src/main/config.ts`

## Monitoring & Observability

**Error Tracking:**
- None (local logging only)

**Analytics:**
- None (local analytics only)

**Logs:**
- Electron Log 5.4.3 - File-based logging
  - Location (macOS): `~/Library/Logs/Liv/main.log`
  - Location (Windows): `%USERPROFILE%\AppData\Roaming\Liv\logs\main.log`
  - Location (Linux): `~/.config/Liv/logs/main.log`
  - Features: File rotation (10MB max), uncaught exception handling
  - Implementation: `src/main/logger.ts`

## CI/CD & Deployment

**Hosting:**
- Electron Builder - Native app distribution
  - Platforms: macOS (universal), Windows (x64), Linux (x64)
  - Artifacts: DMG, EXE, AppImage
  - Configuration: `electron-builder.config.cjs`

**CI Pipeline:**
- None detected (manual builds)

## Environment Configuration

**Development:**
- Configuration: JSON file in appData directory
- API keys: Stored in config.json
- Local models: Sherpa-ONNX models downloaded to `localModelsDirectory`

**Production:**
- Configuration: Same as development (local JSON file)
- Updates: Electron Updater 6.6.2 for auto-updates

## Utility Services

**FFmpeg:**
- Purpose: Generate animated GIF previews for auto-journal
- Package: `@ffmpeg-installer/ffmpeg` 1.1.0 (bundled)
- Location: App resources, platform-specific binary
- Implementation: `src/main/services/auto-journal-service.ts`

**Tesseract.js:**
- Purpose: OCR text extraction from screenshots
- Package: `tesseract.js` 6.0.1
- Implementation: `src/main/services/screen-capture-service.ts`

## Local/Self-Hosted Models

**Sherpa-ONNX:**
- Purpose: Local speech-to-text without cloud API
- Package: `sherpa-onnx-node` 1.12.17
- Platform support: macOS (ARM64, x64), Windows (x64), Linux (x64, ARM64)
- Configuration: `defaultLocalModel`, `preferLocalModels`, `localModelsDirectory`
- Implementation: `src/main/sherpa-transcriber.ts`, `src/main/local-transcriber.ts`, `src/main/model-manager.ts`

**Ollama (Planned):**
- Status: Support present but partially integrated
- Configuration: Hardcoded URL `http://localhost:11434/api` in `src/renderer/src/context/AIContext.jsx:12-14`

---

*Integration audit: 2026-01-16*
*Update when adding/removing external services*
