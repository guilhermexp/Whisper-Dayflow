# Technology Stack

**Analysis Date:** 2026-01-16

## Languages

**TypeScript:**
- Version: 5.9.3
- Usage: Primary language for both main and renderer processes
- Config: `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Strict mode enabled for type safety

**JavaScript:**
- Usage: Legacy components (`.jsx` files in renderer, `.js` utilities)
- Gradual migration to TypeScript in progress

**Rust:**
- Version: 1.0+ (rdev 0.5.3, enigo 0.3.0)
- Usage: Native bindings for keyboard capture and text simulation
- Binary: `resources/liv-rs/` (platform-specific)

**SCSS/CSS:**
- Tailwind CSS 4.1.17 with custom configuration
- SCSS modules for component-specific styles

## Runtime

**Node.js:**
- Version: 18+ required
- Main process runtime
- Package manager: pnpm 9.12.1

**Electron:**
- Version: 39.2.4
- Desktop application framework
- Multi-process architecture (Main, Renderer, Preload)

**Chromium:**
- Bundled with Electron
- Renderer process runtime

## Frameworks & Libraries

**Frontend:**
- React 19.2.0 - UI library
- React DOM 19.2.0 - DOM rendering
- React Router DOM 7.9.6 - Client-side routing
- Framer Motion 12.23.24 - Animations
- TanStack Query 5.90.11 - Async state management
- TanStack Virtual 3.13.12 - Virtualized lists

**UI Components:**
- Radix UI - Headless component primitives
  - react-dialog 1.1.15
  - react-dropdown-menu 2.1.16
  - react-icons 1.3.2
  - react-select 2.2.6
  - react-slot 1.2.4
  - react-switch 1.2.6
  - react-tabs 1.1.13
  - react-tooltip 1.2.8
- Lucide React 0.555.0 - Icon library

**Text Editor:**
- TipTap 3.11.1 - Rich text editor framework
  - Core + React wrapper
  - Extensions: character-count, code-block-lowlight, color, highlight, image, link, placeholder, table, task-list, text-align, text-style, typography, underline
  - Lowlight 3.3.0 - Syntax highlighting

**Data Visualization:**
- Recharts 3.5.0 - Charts and graphs

**Styling:**
- TailwindCSS 4.1.17 - Utility-first CSS framework
- @tailwindcss/postcss 4.1.17
- @tailwindcss/vite 4.1.17
- tailwind-merge 3.4.0 - Class merging utility
- tailwind-variants 3.2.2 - Variant API
- tailwindcss-animate 1.0.7 - Animation utilities
- class-variance-authority 0.7.1 - CVA for variants
- clsx 2.1.1 - Conditional classes
- Sass 1.94.2 - SCSS preprocessing

**Build Tools:**
- Vite 7.2.4 - Build tool and dev server
- Electron Vite 4.0.1 - Electron-specific Vite integration
- @vitejs/plugin-react 5.1.1 - React plugin
- vite-tsconfig-paths 5.1.4 - Path resolution

**Markdown Processing:**
- react-markdown 10.1.0 - Markdown rendering
- remark-gfm 4.0.1 - GitHub Flavored Markdown
- rehype-sanitize 6.0.0 - HTML sanitization
- gray-matter 4.0.3 - Front matter parsing

**Utilities:**
- dayjs 1.11.19 - Date manipulation
- luxon 3.7.1 - Date/time library (alternative)
- fuse.js 7.1.0 - Fuzzy search
- lunr 2.3.9 - Full-text search
- cheerio 1.1.2 - HTML parsing
- entities 4.5.0 - HTML entity encoding/decoding

**IPC Communication:**
- @egoist/tipc 0.3.2 - Type-safe IPC

**Native Integration:**
- @egoist/electron-panel-window 9.0.0 - Panel window management
- electron-settings 4.0.4 - Settings persistence (legacy, custom solution in use)
- electron-log 5.4.3 - Logging

## AI & Machine Learning

**LLM SDKs:**
- openai 6.9.1 - OpenAI API client
- @google/generative-ai 0.24.1 - Gemini API client

**Local STT:**
- sherpa-onnx-node 1.12.17 - Offline speech-to-text (ONNX runtime)

**OCR:**
- tesseract.js 6.0.1 - Optical character recognition

## Media Processing

**Audio:**
- MediaRecorder API (browser native) - WebM audio recording

**Video/GIF:**
- @ffmpeg-installer/ffmpeg 1.1.0 - FFmpeg binaries for GIF generation

## Development Tools

**Type Checking:**
- typescript 5.9.3
- @electron-toolkit/tsconfig 2.0.0
- @types/node 24.10.1
- @types/react 19.2.7
- @types/react-dom 19.2.3
- @types/lunr 2.3.7
- @types/luxon 3.7.1

**Code Quality:**
- prettier 3.7.1 - Code formatting
- prettier-plugin-tailwindcss 0.7.1 - Tailwind class sorting
- ESLint - Linting (config in `eslint.config.js`)

**Build & Release:**
- electron-builder 26.0.12 - App packaging
- electron-updater 6.6.2 - Auto-updates
- bumpp 10.3.2 - Version bumping

**Electron Utilities:**
- @electron-toolkit/preload 3.0.2
- @electron-toolkit/utils 4.0.0

## External Services

**Speech-to-Text:**
- OpenAI Whisper API
- Groq Whisper API (faster alternative)

**LLM Providers:**
- OpenAI (GPT-4, GPT-3.5)
- Groq (Mixtral, Llama2)
- Google Gemini (Gemini Pro)
- OpenRouter (multi-provider gateway)
- Ollama (local models)

## Platform-Specific

**macOS:**
- Accessibility API (global hotkeys)
- ScreenCaptureKit (screenshots)

**Windows:**
- Windows API (keyboard hooks via Rust)

**Linux:**
- X11/Wayland support (planned)

---

*Stack inventory: 2026-01-16*
*Update when dependencies change*
