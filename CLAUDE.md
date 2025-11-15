# CLAUDE.md - AI Agent Development Guide

**Last Updated:** November 14, 2024
**Project:** Whisper-Dayflow (Whispo) - AI-powered dictation tool
**Version:** 0.1.7

---

## 🎯 Project Overview

**Whispo** is a desktop dictation application built with Electron that:

1. **Captures voice** via global keyboard shortcut (Ctrl key hold or Ctrl+/)
2. **Transcribes audio** using OpenAI Whisper or Groq API
3. **Post-processes text** optionally with LLMs (OpenAI, Groq, Gemini)
4. **Inserts automatically** into the active application
5. **Stores locally** with full recording history and configuration

### Target Platforms
- macOS (Apple Silicon + Intel)
- Windows (x64)
- Linux (planned support)

### Core Value Proposition
- 100% locally stored data
- Zero cloud dependency for core recording
- Global shortcuts work in any application
- Real-time visualization during recording
- Post-processing intelligence for higher quality output

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────┐
│      Electron Main Process              │
│  (Node.js backend, system integration)  │
└─────────────────────────────────────────┘
         ↓↑ IPC (tipc)
┌─────────────────────────────────────────┐
│    Renderer Process (React + Vite)      │
│  (UI panels, user interactions)         │
└─────────────────────────────────────────┘
         ↓↑ Native Bindings
┌─────────────────────────────────────────┐
│      Rust Binary (whispo-rs)            │
│  (Keyboard capture, text simulation)    │
└─────────────────────────────────────────┘
         ↓↑ Network
┌─────────────────────────────────────────┐
│    External APIs                        │
│  (OpenAI, Groq, Gemini)                │
└─────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js | Latest (18+) |
| **Frontend** | React | 18.3.1 |
| **Type Safety** | TypeScript | 5.6.3 |
| **Build Tool** | Electron Vite | 2.3.0 |
| **Desktop** | Electron | 31.0.2 |
| **State** | TanStack Query | 5.59.14 |
| **UI Framework** | Radix UI | Latest |
| **Styling** | TailwindCSS | 3.4.13 |
| **Routing** | React Router | 6.27.0 |
| **Native** | Rust (rdev, enigo) | 1.0+ |

---

## 📁 File Structure Quick Reference

```
whispo/
├── src/
│   ├── main/             # Electron Main Process
│   │   ├── index.ts      # Bootstrap & window creation
│   │   ├── tipc.ts       # IPC router & procedures
│   │   ├── config.ts     # Settings persistence
│   │   ├── llm.ts        # LLM post-processing
│   │   ├── keyboard.ts   # Global hotkey handling
│   │   ├── window.ts     # Window management
│   │   ├── tray.ts       # System tray integration
│   │   ├── serve.ts      # assets:// protocol
│   │   └── utils.ts      # Utilities
│   ├── renderer/         # React Frontend
│   │   └── src/
│   │       ├── router.tsx            # Route definitions
│   │       ├── pages/                # UI pages
│   │       │   ├── panel.tsx         # Main recording UI
│   │       │   └── ...
│   │       └── lib/
│   │           ├── recorder.ts       # WebM audio recording
│   │           ├── tipc-client.ts    # IPC client
│   │           └── ...
│   └── shared/           # Shared Types
│       ├── types.ts      # Core TypeScript types
│       └── data-model.ts # Consolidated API reference
├── resources/            # Native binaries & assets
│   └── whispo-rs/        # Rust binary
├── package.json          # Dependencies
├── electron.vite.config.ts
└── ...
```

**Key Files for Development:**
- **IPC Router:** `src/main/tipc.ts` - All backend procedures
- **Data Model:** `src/shared/data-model.ts` - API inventory
- **Type Definitions:** `src/shared/types.ts` - Shared types
- **Recording Logic:** `src/renderer/src/lib/recorder.ts`
- **Post-Processing:** `src/main/llm.ts`

---

## 🔄 Core Workflows

### 1. Recording Flow
```
User holds Ctrl (800ms)
  → Panel window shows & visualizer starts
  → WebM audio streams to memory (Blob)
  → User releases Ctrl
  → Audio sent to STT API
  → Transcript displayed
  → Optional LLM post-processing
  → Text inserted into active app
  → Recording saved to history.json
```

### 2. Configuration Flow
```
User opens Settings panel
  → Load config.json (IPC: getConfig)
  → User modifies settings
  → Save to appData/<APP_ID>/config.json
  → Persist API keys encrypted
```

### 3. Post-Processing Flow
```
Transcript received
  → Check if post-processing enabled
  → Send to selected LLM (OpenAI/Groq/Gemini)
  → Await formatted response
  → Display & insert refined text
  → Cache result (optional)
```

---

## 🛠️ Development Best Practices

### Code Organization

1. **Main Process (Node.js)**
   - Keep side-effect heavy operations here (file I/O, APIs)
   - Use `src/main/tipc.ts` for all Renderer ↔ Main communication
   - Centralize configuration in `src/main/config.ts`

2. **Renderer (React)**
   - Create pages in `src/renderer/src/pages/`
   - Use TanStack Query for async state
   - Call IPC via `tipcClient` from `src/renderer/src/lib/tipc-client.ts`

3. **Shared Types**
   - Define all interfaces in `src/shared/types.ts`
   - Keep enums and constants in `src/shared/`
   - Avoid circular dependencies

### Error Handling

- **UI Errors:** Display via Settings panel error messages
- **API Errors:** Log and retry with exponential backoff
- **IPC Errors:** Validate input on Main, return typed errors
- **Silent Failures:** Never swallow errors; log at minimum

### Logging Strategy

```typescript
// Development only
if (import.meta.env.DEV) {
  console.log('Debug message');
}

// Never log secrets
// ❌ BAD: console.log(apiKey)
// ✅ GOOD: console.log('API configured:', provider)
```

### API Key Management

- Store encrypted in `config.json` (appData)
- Never embed in code or environment files
- Load from config on startup
- Validate key format before use

### Async/Await Patterns

```typescript
// IPC procedures use async functions
export const recordingRouter = t.router({
  createRecording: t.procedure
    .input(z.object({ /* ... */ }))
    .mutation(async (input) => {
      try {
        const result = await transcribeAudio(input);
        return result;
      } catch (error) {
        throw new Error(`Transcription failed: ${error.message}`);
      }
    }),
});
```

---

## 🐛 Known Issues & Workarounds

### Issue 1: Typo in IPC Method
- **Location:** `src/main/tipc.ts:37`
- **Problem:** `saveRecordingsHitory` (note: "Hitory" vs "History")
- **Impact:** Naming inconsistency
- **Workaround:** Use with current spelling; plan rename in next release
- **Status:** ⚠️ Low priority fix

### Issue 2: Silent Sound Feedback
- **Location:** `src/renderer/src/lib/recorder.ts:121`
- **Problem:** Recording start sound is commented out
- **Impact:** No audio feedback when recording begins
- **Workaround:** Uncomment line 121 to restore sound
- **Status:** ⚠️ UX improvement needed

### Issue 3: Clipboard Preservation
- **Status:** ⚠️ In Development
- **Tracking:** See `/Spec/clipboard-preservation/`

---

## 📋 Modification Checklist

Before submitting changes, verify:

### For UI Changes
- [ ] Route defined in `renderer/src/router.tsx`
- [ ] Page component created in `renderer/src/pages/`
- [ ] TailwindCSS classes used (no custom CSS)
- [ ] Accessibility tested (keyboard navigation, screen readers)

### For IPC Changes
- [ ] Procedure added to `main/tipc.ts`
- [ ] Input validated with Zod schema
- [ ] Error handling implemented
- [ ] Type exported to shared/types.ts
- [ ] Consumer component updated

### For Config Changes
- [ ] New field added to Config type in `shared/types.ts`
- [ ] Persistence added to `main/config.ts`
- [ ] UI control added to Settings page
- [ ] Validation logic implemented

### For API Changes
- [ ] Correct provider endpoint used (check base URLs)
- [ ] Auth headers set correctly
- [ ] Timeout configured (avoid hanging)
- [ ] Fallback provider available

### Before Testing
- [ ] TypeScript compilation: `pnpm build`
- [ ] Dev environment starts: `pnpm dev`
- [ ] Hotkey responds correctly
- [ ] No console errors in DevTools
- [ ] Permissions granted (mic, accessibility)

---

## 🚀 Building & Releasing

### Development Build
```bash
cd whispo
pnpm dev
```

### Production Build
```bash
# All platforms
pnpm build

# Specific platform
pnpm build:mac
pnpm build:win
pnpm build:linux
```

### Updating Version
- Edit `package.json` version field
- Document changes in `ai_changelog/CHANGELOG_FORK.md`
- Tag commit: `git tag v0.1.x`

---

## 🔗 Key External APIs

### Speech-to-Text (STT)

**OpenAI Whisper**
- Endpoint: `https://api.openai.com/v1/audio/transcriptions`
- Model: `whisper-1`
- Auth: Bearer token
- Cost: ~$0.006 per minute

**Groq Whisper**
- Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`
- Model: `whisper-large-v3`
- Auth: Bearer token
- Cost: Free tier available

### Text Post-Processing (LLM)

**OpenAI**
- Endpoint: `/v1/chat/completions`
- Models: `gpt-4-turbo`, `gpt-3.5-turbo`

**Groq**
- Endpoint: `/v1/chat/completions`
- Models: `mixtral-8x7b`, `llama2-70b`

**Gemini**
- Endpoint: `/v1beta/models/{model}:generateContent`
- Models: `gemini-pro`, `gemini-pro-vision`

All configured via Settings UI with custom base URLs supported.

---

## 📚 Documentation Structure

```
├── CLAUDE.md              # This file - agent development guide
├── AGENTS.md              # Agent-specific protocols
├── README.md              # User-facing project overview
├── ai_docs/               # Technical documentation
│   ├── README.md          # Index
│   ├── quickstart.md      # Onboarding guide
│   └── whispo-analysis.md # Deep technical analysis
├── ai_specs/              # Feature specifications
├── ai_issues/             # Bug tracking
├── ai_research/           # Research & experiments
└── ai_changelog/          # Version history
```

---

## ❓ Quick Troubleshooting

### Hotkey not working
- Check accessibility permissions (macOS)
- Verify Rust binary built correctly
- Ensure no conflicting global shortcuts

### Transcription failing
- Verify API key in Settings
- Check internet connection
- Confirm provider isn't rate-limited
- Check Base URL is correct

### Permission denied
- macOS: Grant Microphone & Accessibility in System Preferences
- Windows: Check microphone in Settings > Privacy

### High memory usage
- Check recorder cleanup on recording end
- Verify large audio files deleted properly
- Monitor WebM Blob garbage collection

---

## 🎓 Learning Resources

- **Electron Docs:** https://www.electronjs.org/docs
- **React Docs:** https://react.dev
- **TailwindCSS:** https://tailwindcss.com/docs
- **Radix UI:** https://www.radix-ui.com/docs
- **OpenAI API:** https://platform.openai.com/docs

---

## 🔍 Validation Checklist for New Agents

- [ ] Can understand project in 15 minutes from this file
- [ ] Can identify where to make changes for different feature types
- [ ] Knows known issues and workarounds
- [ ] Understands architecture and main/renderer separation
- [ ] Can locate relevant code quickly
- [ ] Knows testing and build commands
- [ ] Understands configuration and persistence strategy

**If any checked items are unclear, update this document.**

---

## 📞 Quick Links

- **Quick Start:** `ai_docs/quickstart.md`
- **Technical Analysis:** `ai_docs/whispo-analysis.md`
- **Known Issues:** `ai_issues/README.md`
- **Specifications:** `ai_specs/README.md`
- **Changelog:** `ai_changelog/README.md`
- **GitHub Repo:** https://github.com/egoist/whispo
