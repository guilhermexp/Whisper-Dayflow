# Directory Structure

**Analysis Date:** 2026-01-16

## Project Root

```
liv/
├── src/                    # Source code
├── resources/              # Static assets & native binaries
├── out/                    # Build output (gitignored)
├── dist/                   # Distribution packages (gitignored)
├── node_modules/           # Dependencies (gitignored)
├── .planning/              # Codebase documentation
├── ai_docs/                # AI agent documentation
├── ai_specs/               # Feature specifications
├── ai_issues/              # Bug tracking
├── ai_research/            # Research notes
├── ai_changelog/           # Version history
├── Spec/                   # Technical specifications
├── package.json            # Dependencies & scripts
├── pnpm-lock.yaml          # Lockfile
├── electron.vite.config.ts # Build configuration
├── electron-builder.config.cjs # Packaging configuration
├── tsconfig.json           # TypeScript config (base)
├── tsconfig.node.json      # Main process config
├── tsconfig.web.json       # Renderer process config
├── tailwind.config.js      # Tailwind CSS config
├── postcss.config.js       # PostCSS config
├── CLAUDE.md               # AI agent development guide
├── quickstart.md           # Quick onboarding
├── README.md               # User-facing documentation
└── .gitignore              # Git ignore rules
```

---

## Source Directory (`src/`)

### Main Process (`src/main/`)

**Purpose:** Node.js backend, system integration, business logic

```
src/main/
├── index.ts                # App bootstrap, window creation, lifecycle
├── tipc.ts                 # IPC router (all procedures)
├── config.ts               # Settings persistence (config.json)
├── logger.ts               # Centralized logging (electron-log)
├── llm.ts                  # LLM post-processing logic
├── keyboard.ts             # Global hotkey handling (Rust bridge)
├── window.ts               # Window management utilities
├── tray.ts                 # System tray menu
├── serve.ts                # assets:// protocol handler
├── utils.ts                # General utilities
├── history-store.ts        # Recording history persistence
├── history-analytics.ts    # Analytics computation
├── services/               # Service layer
│   ├── screen-capture-service.ts  # Screenshot + OCR
│   ├── auto-journal-service.ts    # Timeline summaries & GIF
│   └── enhancement-service.ts     # Transcript enhancement
└── pile-utils/             # Journal/pile utilities
    ├── pileIndex.js        # Index management
    ├── pileSearch.js       # Search implementation
    └── ...
```

**Key Modules:**
- **index.ts** (212 lines) - Entry point, registers IPC, spawns Rust binary, creates windows
- **tipc.ts** (1,311 lines) - ⚠️ Large file: All IPC procedures in one router
- **config.ts** (208 lines) - Atomic writes, default config, migration logic
- **logger.ts** (78 lines) - electron-log wrapper with context support
- **llm.ts** (671 lines) - ⚠️ Large file: Post-processing for multiple providers
- **keyboard.ts** (168 lines) - Rust child process manager, event parsing
- **history-store.ts** (89 lines) - CRUD for history.json
- **history-analytics.ts** (626 lines) - ⚠️ Large file: Stats computation

---

### Renderer Process (`src/renderer/`)

**Purpose:** React UI, user interactions, IPC client

```
src/renderer/
├── index.html              # HTML entry point
└── src/
    ├── main.tsx            # React mount point
    ├── router.tsx          # Route definitions (React Router)
    ├── pages/              # Top-level pages
    │   ├── panel.tsx       # Recording overlay window
    │   ├── setup.tsx       # Initial setup wizard
    │   └── pile/           # Main application
    │       ├── index.tsx   # Pile entry point
    │       ├── Layout.jsx  # Pile layout wrapper
    │       ├── Navigation/ # Bottom nav bar
    │       │   └── index.jsx (163 lines)
    │       ├── Settings/   # Configuration UI
    │       │   ├── index.jsx (1,649 lines) ⚠️ Very large
    │       │   ├── AISettingsTabs/ (AI settings)
    │       │   ├── TranscriptionSettingsTabs/ (1,099 lines) ⚠️ Large
    │       │   └── ...
    │       ├── Dashboard/  # Analytics dashboard
    │       │   └── index.jsx (418 lines)
    │       ├── Analytics/  # History & stats
    │       │   └── index.jsx (456 lines)
    │       ├── AutoJournal/ # Vision Assistant
    │       │   └── index.jsx (1,383 lines) ⚠️ Very large
    │       ├── Chat/       # AI chat interface
    │       │   └── index.jsx (437 lines)
    │       ├── Kanban/     # Task board
    │       │   └── index.jsx (507 lines)
    │       ├── Search/     # Semantic search
    │       │   └── index.jsx
    │       ├── Timeline/   # Activity timeline
    │       │   └── index.jsx
    │       ├── Posts/      # Journal posts list
    │       │   └── index.jsx
    │       ├── Editor/     # Post editor
    │       │   └── index.jsx
    │       ├── Profile/    # User profile (in dev)
    │       │   └── index.jsx
    │       └── Sidebar/    # Sidebar with timeline
    │           └── index.jsx
    ├── components/         # Reusable UI components
    │   ├── ui/             # Generic UI primitives
    │   │   ├── button.jsx
    │   │   ├── card.jsx
    │   │   ├── dialog.jsx
    │   │   ├── select.jsx
    │   │   └── ...
    │   └── ...
    ├── context/            # React Context providers
    │   ├── AIContext.jsx   # LLM provider state
    │   └── PilesContext.jsx # Journal management
    ├── hooks/              # Custom React hooks
    │   ├── usePost.jsx     # Post operations
    │   ├── useChat.jsx     # Chat logic
    │   ├── useIPCListener.jsx # IPC event listener
    │   └── ...
    ├── lib/                # Utilities & clients
    │   ├── recorder.ts     # Audio recording (MediaRecorder)
    │   ├── tipc-client.ts  # IPC client setup
    │   ├── cn.ts           # Tailwind class merger
    │   └── ...
    ├── utils/              # Helper functions
    │   ├── timer-history.js # Timer session persistence
    │   └── ...
    ├── assets/             # Images, fonts, SVGs
    │   ├── logo.png
    │   └── ...
    └── styles/             # Global styles
        └── globals.scss
```

**Key Components:**
- **panel.tsx** (124 lines) - Minimal recording overlay with visualizer
- **pile/Settings/index.jsx** (1,649 lines) - ⚠️ Monolithic settings component
- **pile/AutoJournal/index.jsx** (1,383 lines) - ⚠️ Complex timeline UI
- **pile/Dashboard/index.jsx** (418 lines) - Charts and analytics cards
- **pile/Chat/index.jsx** (437 lines) - AI chat with context panel
- **pile/Kanban/index.jsx** (507 lines) - Drag-and-drop task board

---

### Preload Script (`src/preload/`)

**Purpose:** Security bridge between main and renderer

```
src/preload/
├── index.ts                # Main preload script
└── index.d.ts              # TypeScript declarations
```

**Exposed APIs:**
- File system: `readFile`, `writeFile`, `mkdir`, `existsSync`, `joinPath`
- Paths: `getConfigPath`, `getHistoryPath`, `getAppDataPath`
- IPC: `ipcRenderer.send`, `ipcRenderer.on`, `ipcRenderer.invoke`

---

### Shared Types (`src/shared/`)

**Purpose:** TypeScript types used by both main and renderer

```
src/shared/
├── types.ts                # Core type definitions
├── data-model.ts           # API inventory (IPC procedures)
└── constants.ts            # Shared constants
```

**Key Types:**
- `Config` - Application configuration
- `RecordingItem` - Transcription history entry
- `PileItem` - Journal pile metadata
- `ScreenCaptureResult` - Screenshot with OCR

---

## Resources (`resources/`)

**Purpose:** Static assets, native binaries, bundled dependencies

```
resources/
├── liv-rs/                 # Rust binary (keyboard capture)
│   ├── target/
│   │   ├── release/
│   │   │   ├── liv-rs (macOS)
│   │   │   ├── liv-rs.exe (Windows)
│   │   │   └── liv-rs (Linux)
├── icon.png                # App icon
└── ...
```

**Platform-Specific:**
- macOS: Universal binary (Apple Silicon + Intel)
- Windows: x64 executable
- Linux: x64 binary (planned)

---

## Build Output (`out/`)

**Purpose:** Compiled code (gitignored)

```
out/
├── main/                   # Compiled main process
│   └── index.js
├── renderer/               # Compiled renderer
│   ├── index.html
│   └── assets/
└── preload/                # Compiled preload
    └── index.js
```

---

## Distribution Packages (`dist/`)

**Purpose:** Final app bundles (gitignored)

```
dist/
├── mac/
│   ├── Liv.app             # macOS app bundle
│   └── Liv-0.1.8.dmg       # Installer
├── win/
│   ├── Liv Setup 0.1.8.exe # Windows installer
│   └── ...
└── linux/
    ├── liv-0.1.8.AppImage  # Linux AppImage
    └── ...
```

---

## Documentation (`ai_docs/`, `ai_specs/`, etc.)

**Purpose:** AI agent documentation and project tracking

```
ai_docs/
├── README.md               # Documentation index
├── design-system-analysis.md # UI patterns
└── liv-analysis.md         # Technical deep dive

ai_specs/
├── README.md               # Specification index
└── feature-*.md            # Feature specifications

ai_issues/
├── README.md               # Issue tracking
└── issue-*.md              # Bug reports

ai_research/
├── README.md               # Research index
└── research-*.md           # Experiments

ai_changelog/
├── README.md               # Changelog index
└── CHANGELOG_FORK.md       # Version history

Spec/
└── clipboard-preservation/ # Feature spec (in development)
```

---

## Configuration Files

**TypeScript:**
- `tsconfig.json` - Base config (extends @electron-toolkit)
- `tsconfig.node.json` - Main process config (target: ES2022)
- `tsconfig.web.json` - Renderer config (target: ES2020, JSX)

**Build:**
- `electron.vite.config.ts` - Vite config for Electron
- `electron-builder.config.cjs` - App packaging config

**Styling:**
- `tailwind.config.js` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS plugins

**Linting:**
- `eslint.config.js` - ESLint rules (not `.eslintrc`)
- `.prettierrc` - Prettier formatting

**Package Manager:**
- `pnpm-lock.yaml` - PNPM lockfile (v9.12.1)
- `.npmrc` - PNPM configuration

---

## Entry Points by Context

**Development:**
- Main: `src/main/index.ts`
- Renderer: `src/renderer/src/main.tsx`
- Preload: `src/preload/index.ts`

**Production:**
- Main: `out/main/index.js`
- Renderer: `out/renderer/index.html`
- Preload: `out/preload/index.js`

**Scripts:**
- Dev: `electron-vite dev --watch`
- Build: `electron-vite build`
- Package: `electron-builder`

---

## File Size Warnings

**Large Files (>1000 lines):**
1. `src/renderer/src/pages/pile/Settings/index.jsx` - 1,649 lines
2. `src/renderer/src/pages/pile/AutoJournal/index.jsx` - 1,383 lines
3. `src/main/tipc.ts` - 1,311 lines
4. `src/renderer/src/pages/pile/Settings/TranscriptionSettingsTabs/index.jsx` - 1,099 lines

**Recommendation:** Refactor into smaller components/modules

---

## Important Patterns

**Naming Conventions:**
- Services: `kebab-case-service.ts` (e.g., `screen-capture-service.ts`)
- Components: `PascalCase.jsx` (e.g., `Dashboard/index.jsx`)
- Utilities: `camelCase.ts` (e.g., `recorder.ts`)
- Hooks: `useCamelCase.jsx` (e.g., `usePost.jsx`)

**Import Paths:**
- Absolute imports use `renderer/` prefix (e.g., `import { foo } from 'renderer/lib/bar'`)
- Configured via `vite-tsconfig-paths`

**File Extensions:**
- TypeScript: `.ts` (logic), `.tsx` (React with TypeScript)
- JavaScript: `.js` (utilities), `.jsx` (React)
- Styles: `.scss`, `.module.scss`

---

*Directory structure snapshot: 2026-01-16*
*Update as project evolves*
