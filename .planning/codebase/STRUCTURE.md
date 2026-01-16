# Codebase Structure

**Analysis Date:** 2026-01-16

## Directory Layout

```
liv/
├── src/
│   ├── main/              # Electron Main Process (Node.js Backend)
│   │   ├── services/      # Stateful service classes
│   │   ├── pile-handlers/ # Pile/journal file operations
│   │   └── pile-utils/    # Utility functions for journal indexing
│   ├── renderer/          # React Frontend
│   │   └── src/
│   │       ├── pages/     # Route-based page components
│   │       ├── components/# Reusable UI components
│   │       ├── context/   # React context providers
│   │       ├── hooks/     # Custom React hooks
│   │       └── lib/       # Utility libraries
│   ├── preload/           # Preload Script (IPC Security Bridge)
│   └── shared/            # Shared Code (Type Definitions, Constants)
├── liv-rs/                # Rust Source Code (Native Bindings)
├── resources/             # Bundled Assets & Binaries
├── build/                 # Build Artifacts
├── docs/                  # User Documentation
├── specs/                 # Feature Specifications
├── scripts/               # Build & Utility Scripts
├── ai_docs/               # AI Documentation
├── ai_specs/              # AI Specifications
└── ai_issues/             # Issue Tracking
```

## Directory Purposes

**src/main/**
- Purpose: Electron main process (backend)
- Contains: TypeScript source files, service classes, IPC procedures
- Key files: `index.ts` (entry), `tipc.ts` (IPC router), `config.ts` (settings), `logger.ts` (logging)
- Subdirectories: `services/`, `pile-handlers/`, `pile-utils/`

**src/main/services/**
- Purpose: Stateful service classes
- Contains: Enhancement, ScreenCapture, AutoJournal, PeriodicScreenshot, AudioProcessing, MediaController
- Key files: `enhancement-service.ts`, `screen-capture-service.ts`, `auto-journal-service.ts`

**src/main/pile-handlers/**
- Purpose: Pile/journal file operations
- Contains: File I/O handlers, tag management, highlight extraction, link extraction
- Key files: `file.ts`, `tags.ts`, `highlights.ts`, `links.ts`

**src/main/pile-utils/**
- Purpose: Utility functions for journal indexing, embeddings, search
- Contains: JavaScript utility files
- Key files: `pileIndex.js`, `pileEmbeddings.js`, `pileSearchIndex.js`

**src/renderer/src/**
- Purpose: React frontend
- Contains: Pages, components, hooks, context providers, utilities
- Key files: `main.tsx` (entry), `router.tsx` (routes), `App.tsx` (root component)
- Subdirectories: `pages/`, `components/`, `context/`, `hooks/`, `lib/`

**src/renderer/src/pages/**
- Purpose: Route-based page components
- Contains: Panel, Setup, Onboarding, Timer, Pile pages
- Key subdirectory: `pile/` (main journaling app with Navigation, Posts, Editor, Chat, etc.)

**src/renderer/src/components/**
- Purpose: Reusable UI components
- Contains: `ui/` (Radix UI base components), `enhancement/`, `models/`, TimerChip
- Key files: `ui/button.tsx`, `ui/dialog.tsx`, `enhancement/EnhancementToggle.tsx`

**src/renderer/src/context/**
- Purpose: React Context providers
- Contains: PilesContext, AIContext, IndexContext, TimelineContext, ToastsContext, etc.
- Key files: `PilesContext.jsx`, `AIContext.jsx`

**src/renderer/src/hooks/**
- Purpose: Custom React hooks
- Contains: useIPCListener, usePost, useChat, useElectronStore, etc.
- Key files: `usePost.jsx`, `useChat.jsx`

**src/renderer/src/lib/**
- Purpose: Utility libraries
- Contains: tipc-client, recorder, query-client, i18n, sound, utils
- Key files: `tipc-client.ts`, `recorder.ts`, `i18n.ts`

**src/preload/**
- Purpose: Preload script (IPC security bridge)
- Contains: index.ts (exposes safe IPC methods), index.d.ts (type definitions)

**src/shared/**
- Purpose: Shared code (type definitions, constants)
- Contains: `types.ts`, `constants.ts`, `data-model.ts`, `data/`, `models/`
- Key files: `types.ts` (core types), `data/predefined-prompts.ts`, `models/catalog.ts`

**liv-rs/**
- Purpose: Rust source code (native bindings)
- Contains: `src/lib.rs` (Rust library), `Cargo.toml` (dependencies)
- Key files: `src/lib.rs`, `build.sh`

**resources/**
- Purpose: Bundled assets & binaries
- Contains: Platform-specific compiled Rust binaries, FFmpeg binaries

## Key File Locations

**Entry Points:**
- `src/main/index.ts` - Main process entry
- `src/renderer/src/main.tsx` - Renderer entry
- `src/preload/index.ts` - Preload script

**Configuration:**
- `electron.vite.config.ts` - Electron Vite build config
- `electron-builder.config.cjs` - Electron Builder packaging
- `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json` - TypeScript configs
- `tailwind.config.js` - TailwindCSS config
- `package.json` - Dependencies & scripts

**Core Logic:**
- `src/main/tipc.ts` - IPC router (100+ procedures)
- `src/main/llm.ts` - LLM post-processing
- `src/main/keyboard.ts` - Global hotkey handling
- `src/main/config.ts` - Configuration persistence
- `src/main/logger.ts` - Centralized logging

**Testing:**
- None (no test files found)

**Documentation:**
- `CLAUDE.md` - AI Agent Development Guide
- `README.md` - User-facing overview
- `docs/` - User documentation
- `ai_docs/` - AI documentation
- `specs/` - Feature specifications

## Naming Conventions

**Files:**
- kebab-case for services/utilities: `screen-capture-service.ts`, `auto-journal-service.ts`
- PascalCase for React components: `Button.tsx`, `Dashboard.jsx`
- camelCase for hooks: `usePost.jsx`, `useChat.jsx`
- PascalCase for contexts: `AIContext.jsx`, `PilesContext.jsx`
- SCSS modules: `Settings.module.scss`, `Chat.module.scss`

**Directories:**
- kebab-case for feature directories: `pile-handlers/`, `pile-utils/`
- Plural names for collections: `services/`, `components/`, `hooks/`

**Special Patterns:**
- `index.ts`/`index.jsx` for directory exports
- `.module.scss` for SCSS modules

## Where to Add New Code

**New Feature:**
- Primary code: `src/main/services/` (if stateful service) or `src/main/tipc.ts` (if IPC procedure)
- UI: `src/renderer/src/pages/pile/` or `src/renderer/src/components/`
- Types: `src/shared/types.ts`

**New Component/Module:**
- Implementation: `src/renderer/src/components/` or `src/renderer/src/pages/`
- Hooks: `src/renderer/src/hooks/`
- Context: `src/renderer/src/context/`

**New Route:**
- Definition: `src/renderer/src/router.tsx`
- Handler: `src/renderer/src/pages/pile/`

**Utilities:**
- Main process: `src/main/utils.ts` or create new utility file
- Renderer: `src/renderer/src/lib/utils.ts`
- Shared: `src/shared/`

## Special Directories

**build/**
- Purpose: Build artifacts
- Source: Generated by Electron Builder
- Committed: No (in .gitignore)

**dist/**
- Purpose: Build output
- Source: Generated by Electron Vite
- Committed: No (in .gitignore)

**resources/**
- Purpose: Bundled assets and binaries
- Source: Manual + build scripts
- Committed: Yes (Rust binaries, FFmpeg binaries)

---

*Structure analysis: 2026-01-16*
*Update when directory structure changes*
