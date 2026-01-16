# Technology Stack

**Analysis Date:** 2026-01-16

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code (`package.json`, `tsconfig.json`)
- JavaScript (JSX) - React components and utilities

**Secondary:**
- Rust 1.0+ - Native keyboard capture & text simulation (`liv-rs/Cargo.toml`)

## Runtime

**Environment:**
- Node.js 18+ (required by Electron 39.2+)
- Electron 39.2.4 - Desktop application framework (`package.json`)

**Package Manager:**
- pnpm 9.12.1 - Package manager (`package.json` packageManager field)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- React 19.2.0 - UI library (`package.json`)
- Electron 39.2.4 - Cross-platform desktop framework (`package.json`)
- React Router 7.9.6 - Client-side routing (`src/renderer/src/router.tsx`)

**Testing:**
- None configured - Type checking via TypeScript only

**Build/Dev:**
- Electron Vite 4.0.1 - Build orchestrator (`electron.vite.config.ts`)
- Vite 7.2.4 - Frontend bundler (`package.json`)
- Electron Builder 26.0.12 - App packaging (`electron-builder.config.cjs`)
- TypeScript 5.9.3 - Type checking (`tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`)
- Sass 1.94.2 - SCSS compilation (`package.json`)

## Key Dependencies

**Critical:**
- TIPC (@egoist/tipc 0.3.2) - Electron IPC framework (`src/main/tipc.ts`, `src/renderer/src/lib/tipc-client.ts`)
- TanStack Query 5.90.11 - Async state management (`package.json`)
- Sherpa-ONNX-Node 1.12.17 - Local speech-to-text (`src/main/sherpa-transcriber.ts`)
- OpenAI SDK 6.9.1 - Whisper API integration (`src/main/llm.ts`)
- Google Generative AI 0.24.1 - Gemini integration (`src/main/services/enhancement-service.ts`)

**UI Infrastructure:**
- TailwindCSS 4.1.17 - Utility-first CSS (`tailwind.config.js`)
- Radix UI (multiple packages) - Headless UI components (`package.json`)
- Framer Motion 12.23.24 - Animation library (`package.json`)
- Recharts 3.5.0 - Charting library (`package.json`)

**Rich Text & Search:**
- Tiptap 3.11.1 (core + 12+ extensions) - Rich text editor (`package.json`)
- Lunr 2.3.9 - Full-text search (`package.json`)
- Fuse.js 7.1.0 - Fuzzy search (`package.json`)
- Gray Matter 4.0.3 - YAML frontmatter parsing (`package.json`)

**Audio & Vision:**
- Tesseract.js 6.0.1 - OCR for screenshot text extraction (`src/main/services/screen-capture-service.ts`)
- @ffmpeg-installer/ffmpeg 1.1.0 - GIF generation (`src/main/services/auto-journal-service.ts`)

**Native Integration:**
- rdev 0.5.3 - Global keyboard capture (Rust, `liv-rs/Cargo.toml`)
- enigo 0.3.0 - Text simulation/clipboard (Rust, `liv-rs/Cargo.toml`)

## Configuration

**Environment:**
- JSON-based configuration in `~/.config/Liv/config.json` (platform-specific)
- API keys stored in config.json (plaintext, encrypted planned)
- No .env files used

**Build:**
- `electron.vite.config.ts` - Electron Vite build config
- `electron-builder.config.cjs` - Electron Builder packaging
- `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json` - TypeScript configs
- `tailwind.config.js` - TailwindCSS config
- `postcss.config.js` - PostCSS config

## Platform Requirements

**Development:**
- macOS, Windows, or Linux
- Rust toolchain (for building `liv-rs` native binary)
- FFmpeg (bundled via @ffmpeg-installer/ffmpeg)

**Production:**
- Distributed as native desktop app via Electron
- macOS: Apple Silicon + Intel (universal binary)
- Windows: x64
- Linux: x64 (planned)
- FFmpeg binary bundled in app resources

---

*Stack analysis: 2026-01-16*
*Update after major dependency changes*
