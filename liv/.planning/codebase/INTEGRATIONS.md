# External Integrations

**Analysis Date:** 2026-01-16

## Speech-to-Text APIs

### OpenAI Whisper
**Purpose:** Primary transcription service
**Endpoint:** `https://api.openai.com/v1/audio/transcriptions`
**Authentication:** Bearer token (API key)
**Models:**
- `whisper-1` - General purpose transcription

**Request Format:**
- Method: POST multipart/form-data
- Fields: `file` (audio), `model`, `language` (optional)

**Rate Limits:**
- ~50 requests/minute (OpenAI default)
- Audio file size: max 25MB

**Cost:**
- ~$0.006 per minute of audio

**Configuration:**
- API key stored in `config.json`
- Base URL: configurable in Settings

**Error Handling:**
- Timeout: 120 seconds
- Retry: Not implemented
- Fallback: Manual retry or switch to Groq

---

### Groq Whisper
**Purpose:** Fast transcription alternative
**Endpoint:** `https://api.groq.com/openai/v1/audio/transcriptions`
**Authentication:** Bearer token (API key)
**Models:**
- `whisper-large-v3` - High accuracy model
- `distil-whisper-large-v3-en` - Faster English-only

**Request Format:**
- Compatible with OpenAI Whisper API
- Same multipart/form-data structure

**Rate Limits:**
- Generous free tier
- ~200 requests/minute

**Cost:**
- Free tier available
- Lower cost than OpenAI

**Configuration:**
- API key stored in `config.json`
- Base URL: `https://api.groq.com/openai/v1`

**Error Handling:**
- Timeout: 120 seconds
- Retry: Not implemented
- Fallback: Switch to OpenAI

---

### Sherpa-ONNX (Local)
**Purpose:** Offline speech-to-text
**Library:** `sherpa-onnx-node@1.12.17`
**Models:** ONNX format (downloaded separately)

**Configuration:**
- Model path configured in settings
- No API key required

**Advantages:**
- No internet required
- Zero cost
- Privacy-preserving

**Disadvantages:**
- Requires model download (100MB-1GB)
- Lower accuracy than cloud APIs
- Higher CPU usage

**Status:** ⚠️ Not fully implemented (infrastructure exists)

---

## LLM APIs (Post-Processing)

### OpenAI Chat
**Purpose:** Transcript enhancement and AI chat
**Endpoint:** `https://api.openai.com/v1/chat/completions`
**Authentication:** Bearer token
**Models:**
- `gpt-4-turbo` - High quality
- `gpt-3.5-turbo` - Fast and economical

**Request Format:**
```json
{
  "model": "gpt-4-turbo",
  "messages": [{"role": "user", "content": "..."}],
  "temperature": 0.7
}
```

**Rate Limits:**
- Depends on tier (10-500 requests/minute)
- Token limits per request (4K-128K)

**Cost:**
- GPT-4: ~$0.01/1K input tokens, ~$0.03/1K output tokens
- GPT-3.5: ~$0.0015/1K input tokens, ~$0.002/1K output tokens

**Configuration:**
- API key: `config.json`
- Custom base URL supported

**Error Handling:**
- Timeout: 30 seconds
- Retry: Not implemented
- Fallback: Disable enhancement or switch provider

---

### Groq Chat
**Purpose:** Fast LLM alternative
**Endpoint:** `https://api.groq.com/openai/v1/chat/completions`
**Models:**
- `mixtral-8x7b-32768` - 32K context
- `llama2-70b-4096` - High quality

**Request Format:**
- OpenAI-compatible API
- Same JSON structure

**Rate Limits:**
- Free tier: 30 requests/minute
- Paid: Higher limits

**Cost:**
- Lower than OpenAI
- Free tier available

**Configuration:**
- API key: `config.json`
- Base URL: `https://api.groq.com/openai/v1`

**Error Handling:**
- Timeout: 30 seconds
- Retry: Not implemented
- Fallback: Switch to OpenAI/Gemini

---

### Google Gemini
**Purpose:** Alternative LLM provider
**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
**Authentication:** API key as query parameter
**Models:**
- `gemini-pro` - Text generation
- `gemini-pro-vision` - Multimodal (text + images)

**Request Format:**
```json
{
  "contents": [{"parts": [{"text": "..."}]}],
  "generationConfig": {"temperature": 0.7}
}
```

**Rate Limits:**
- Free tier: 60 requests/minute
- Paid: Higher limits

**Cost:**
- Free tier available
- Lower cost than OpenAI

**Configuration:**
- API key: `config.json`
- Base URL: configurable

**Error Handling:**
- Timeout: 30 seconds
- Retry: Not implemented
- Fallback: Switch to OpenAI/Groq

---

### OpenRouter
**Purpose:** Multi-provider gateway
**Endpoint:** `https://openrouter.ai/api/v1/chat/completions`
**Authentication:** Bearer token
**Models:** 100+ models from multiple providers

**Request Format:**
- OpenAI-compatible
- Additional field: `model` (e.g., "anthropic/claude-2")

**Rate Limits:**
- Varies by underlying provider

**Cost:**
- Pay-per-use
- Credits-based system

**Configuration:**
- API key: `config.json`
- Base URL: `https://openrouter.ai/api/v1`

**Error Handling:**
- Timeout: 60 seconds
- Retry: Not implemented
- Fallback: Switch to direct provider

---

### Ollama (Local)
**Purpose:** Local LLM inference
**Endpoint:** `http://localhost:11434/api/generate` (hardcoded)
**Authentication:** None (local server)
**Models:** User-downloaded (Llama, Mistral, etc.)

**Request Format:**
```json
{
  "model": "llama2",
  "prompt": "...",
  "stream": false
}
```

**Rate Limits:**
- None (local processing)

**Cost:**
- Zero (hardware costs only)

**Configuration:**
- ⚠️ URL is hardcoded: `http://localhost:11434/api`
- Should be made configurable (planned)

**Advantages:**
- No API key required
- Privacy-preserving
- Zero cost

**Disadvantages:**
- Requires Ollama installation
- Higher memory usage
- Slower than cloud APIs

**Status:** ✅ Implemented but URL not configurable

---

## Media Processing

### FFmpeg
**Purpose:** GIF generation for auto-journal
**Integration:** `@ffmpeg-installer/ffmpeg@1.1.0`
**Type:** Bundled binary (no external service)

**Usage:**
- Screenshot sequences → Animated GIF
- Invoked via Node.js child_process

**Configuration:**
- Binary path resolved automatically
- Verified on app startup

**Platform Support:**
- macOS (Apple Silicon + Intel)
- Windows (x64)
- Linux (x64, arm64)

**Status:** ✅ Production-ready

---

### Tesseract.js
**Purpose:** OCR for screen captures
**Integration:** `tesseract.js@6.0.1`
**Type:** JavaScript library (WebAssembly)

**Usage:**
- Extract text from screenshots
- Inject context into auto-journal summaries

**Configuration:**
- Language: `eng` (English)
- No setup required

**Performance:**
- ~2-5 seconds per screenshot
- Best-effort (continues on failure)

**Status:** ✅ Production-ready

---

## System APIs

### Electron APIs
**Purpose:** OS integration
**APIs Used:**
- `desktopCapturer` - Screenshot capture
- `clipboard` - Clipboard access (planned)
- `globalShortcut` - ⚠️ Not used (Rust handles hotkeys)
- `Menu`, `Tray` - System tray
- `BrowserWindow` - Window management

**Platform-Specific:**
- macOS: Accessibility API, ScreenCaptureKit
- Windows: Windows API via Rust
- Linux: Planned support

---

## Network Configuration

**Timeout Strategy:**
- Transcription: 120 seconds
- LLM: 30-60 seconds
- No automatic retries (manual fallback)

**Base URL Customization:**
- All APIs support custom base URLs
- Configured in Settings UI
- Stored in `config.json`

**Error Reporting:**
- Logged to `main.log` (electron-log)
- Displayed in Settings panel on failure

---

## Missing Integrations

**Clipboard Preservation:**
- Status: ⚠️ In Development
- Tracking: `/Spec/clipboard-preservation/`

**Cloud Sync:**
- Status: ❌ Not planned
- Philosophy: 100% local storage

**Analytics/Telemetry:**
- Status: ❌ Not implemented
- Privacy-first approach

---

*Integration audit: 2026-01-16*
*Update when APIs change*
