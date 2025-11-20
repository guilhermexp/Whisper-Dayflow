# Integrating Pile + Whispo - Project Documentation

**Start Date:** November 19, 2025
**Status:** Completed
**Objective:** Integrate all Whispo functionalities into Pile's layout and design

---

## Index

1. [Overview](#overview)
2. [Final Architecture](#final-architecture)
3. [What Was Removed](#what-was-removed)
4. [What Was Added](#what-was-added)
5. [File Locations](#file-locations)
6. [Routes](#routes)
7. [UI Patterns](#ui-patterns)
8. [Technical Details](#technical-details)
9. [Challenges and Learnings](#challenges-and-learnings)

---

## Overview

### Context
The Whispo project is an Electron audio transcription application that has been **fully merged** into Pile, a journaling app. The two applications now operate as a single unified interface.

### Result
All Whispo transcription features are now integrated into Pile's interface using a Dialog-based UI pattern:

- **Pile** (`/`): Main journaling interface with integrated transcription features
- **Recording Panel** (`/panel`): Audio recording visualization
- **Setup** (`/setup`): Initial configuration

### Principle Achieved
- Single unified application with Pile's visual and UX design
- All Whispo functionalities fully integrated
- No duplicate routes or components
- Consistent design system throughout

---

## Final Architecture

### Structure

```
Pile Interface (Main)
├── Home / Journal Posts (main view)
├── Settings Dialog
│   ├── Journal Tab - Pile settings
│   ├── Whisper Tab - STT configuration
│   └── Enhancement Tab - LLM post-processing
├── Analytics Dialog
│   ├── Stats Tab - Usage statistics
│   └── History Tab - Full transcription history
├── Dashboard Dialog
│   └── Charts and metrics (Recharts)
└── Tray Menu
    └── Quick Enhancement provider switching
```

### Technology Stack

| Component | Technology |
|-----------|------------|
| **UI Dialogs** | Radix UI Dialog |
| **Styling** | SCSS Modules + CSS Variables (inline) |
| **Data Fetching** | React Query (TanStack) |
| **Charts** | Recharts |
| **Routing** | React Router 6 |

---

## What Was Removed

### Complete Removal of Old Whispo Frontend

**Routes Removed:**
- `/whisper` - Old Whispo root
- `/whisper/dashboard` - Old dashboard
- `/whisper/settings` - Old settings
- `/whisper/settings/models` - Old models management
- `/whisper/settings/enhancement` - Old enhancement config

**Components/Pages Removed:**
- `src/renderer/src/pages/index.tsx` - Old transcription list
- `src/renderer/src/pages/dashboard.tsx` - Old dashboard
- `src/renderer/src/pages/settings.tsx` - Old settings
- `src/renderer/src/pages/settings-models.tsx` - Old models page
- `src/renderer/src/pages/settings-enhancement.tsx` - Old enhancement page
- `src/renderer/src/components/app-layout.tsx` - Old layout wrapper
- `src/renderer/src/components/page-header.tsx` - Old page header
- `src/renderer/src/components/section-card.tsx` - Old card component

---

## What Was Added

### 1. Settings Dialog (Integrated Whispo Configuration)

**Location:** `src/renderer/src/pages/pile/Settings/`

**Tabs:**
- **Journal Tab** - Original Pile journal settings
- **Whisper Tab** - Speech-to-Text configuration
  - Recording shortcut selection
  - Audio cues toggle
  - Launch on startup
  - Hide dock icon (macOS)
  - STT provider selection
  - API key management
- **Enhancement Tab** - LLM post-processing
  - Enable/disable enhancement
  - Provider selection (OpenAI, Groq, Gemini)
  - API key configuration
  - Model selection
  - Custom prompt

### 2. Analytics Dialog (Stats + History)

**Location:** `src/renderer/src/pages/pile/Analytics/`

**Tabs:**
- **Stats Tab** - Usage statistics and metrics
- **History Tab** - Complete transcription history
  - List of all transcriptions
  - Playback controls
  - Delete actions
  - Search/filter capabilities

### 3. Dashboard Dialog (Charts and Metrics)

**Location:** `src/renderer/src/pages/pile/Dashboard/`

**Features:**
- Visual charts using Recharts
- Transcription metrics over time
- Usage patterns visualization
- Provider statistics

### 4. Tray Menu Enhancement

**Feature:** Quick access to Enhancement provider switching directly from system tray

---

## File Locations

### Main Directories

```
src/renderer/src/pages/pile/
├── Analytics/          # Stats + History dialogs
│   └── index.jsx
├── Dashboard/          # Charts and metrics
│   └── index.jsx
├── Settings/           # Integrated settings (Journal + Whisper + Enhancement)
│   └── index.jsx
├── Layout.jsx          # Main Pile layout
└── ...                 # Other Pile components
```

### Supporting Files

- **React Query hooks:** `src/renderer/src/lib/query-client.ts`
- **IPC Client:** `src/renderer/src/lib/tipc-client.ts`
- **Main IPC Router:** `src/main/tipc.ts`
- **Type Definitions:** `src/shared/types.ts`

---

## Routes

### Active Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Pile Layout | Main journaling interface with all integrated features |
| `/setup` | Setup | Initial application setup |
| `/panel` | Recording Panel | Audio recording visualization window |

### Removed Routes

All `/whisper/*` routes have been completely removed from `src/renderer/src/router.tsx`.

---

## UI Patterns

### Dialog-Based Navigation

All transcription features are accessed via modal dialogs from the main Pile interface:

```jsx
// Example: Opening Settings Dialog
<Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
  <Dialog.Portal>
    <Dialog.Overlay className={styles.dialogOverlay} />
    <Dialog.Content className={styles.dialogContent}>
      {/* Tabbed content */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Styling Pattern

**Structure:**
- **Dialog overlay/content:** SCSS Modules
- **Inner content:** Inline styles with CSS variables

```jsx
// Example styling pattern
<div style={{
  background: 'var(--background)',
  color: 'var(--text-primary)',
  padding: 'var(--spacing-md)',
  borderRadius: 'var(--radius-lg)'
}}>
  {/* Content */}
</div>
```

### Data Fetching Pattern

All Whispo data operations use React Query:

```jsx
// Example: Loading config
const { data: config, isLoading } = useConfigQuery();

// Example: Saving config
const saveConfig = useSaveConfigMutation();
await saveConfig.mutateAsync({ shortcut: 'hold-ctrl' });

// Example: Loading recordings history
const { data: recordings } = useRecordingsQuery();
```

---

## Technical Details

### React Query Hooks Available

**Configuration:**
- `useConfigQuery()` - Get current configuration
- `useSaveConfigMutation()` - Save configuration changes

**Recordings:**
- `useRecordingsQuery()` - Get all transcriptions
- `useDeleteRecordingMutation()` - Delete a transcription

**Models:**
- `useModelsQuery()` - List available models
- `useDownloadModelMutation()` - Download a model
- `useDeleteModelMutation()` - Delete a model
- `useSetDefaultLocalModelMutation()` - Set default model
- `useModelDownloadProgressQuery()` - Get download progress

### IPC Integration

All backend communication goes through the TIPC client:

```javascript
import { tipcClient } from 'renderer/lib/tipc-client';

// Example calls
await tipcClient.getConfig();
await tipcClient.saveConfig({ ... });
await tipcClient.getRecordings();
await tipcClient.createRecording({ ... });
```

### Contexts

**Pile Contexts (still used):**
- `PilesContext` - Manages piles and themes
- `IndexContext` - Manages post index
- `AIContext` - AI configurations
- `TimelineContext` - Manages post timeline

**Whispo:** Uses React Query only (no custom contexts)

---

## Challenges and Learnings

### Challenge 1: UI Pattern Decision
**Problem:** Deciding between sidebar integration vs dialog-based approach

**Solution:** Dialog-based UI was chosen for:
- Cleaner separation of concerns
- Less intrusive on main journaling experience
- Easier to access specific features
- Better mobile/responsive potential

### Challenge 2: Styling Consistency
**Problem:** Maintaining consistent styling between Pile's SCSS Modules and inline styles

**Solution:**
- SCSS Modules for Dialog structural elements (overlay, content wrapper)
- Inline styles with CSS variables for inner content
- Leverages Pile's existing design tokens

### Challenge 3: Import Path Aliases
**Problem:** Vite alias configured as `renderer` not `@renderer`

**Solution:** Use `renderer/lib/query-client` instead of `@renderer/lib/query-client`

**Learning:** Always check `electron.vite.config.ts` for correct aliases

### Challenge 4: Incremental Integration
**Problem:** Adding Whispo features without breaking existing Pile functionality

**Solution:**
- Conditional rendering based on data availability
- Add rather than replace existing structures
- Test each integration incrementally

---

## Summary

### What Changed

| Before | After |
|--------|-------|
| Two separate app interfaces | Single unified interface |
| `/whisper/*` routes | Dialogs from main Pile UI |
| Separate settings pages | Tabbed Settings Dialog |
| Separate history page | Analytics Dialog with History tab |
| Separate dashboard | Dashboard Dialog with Recharts |

### Benefits Achieved

1. **Unified Experience** - Single application feel
2. **Consistent Design** - Pile design system throughout
3. **Better UX** - Quick access via dialogs
4. **Maintainability** - Less code duplication
5. **Performance** - Single layout, lazy-loaded dialogs

### Key Takeaways

- Dialog-based UI works well for feature access in journaling apps
- React Query provides excellent state management for Whispo operations
- CSS variables enable consistent theming across different styling approaches
- Incremental integration is safer than wholesale replacement

---

## References

### Important Files

**New Integrated Components:**
- `src/renderer/src/pages/pile/Settings/index.jsx` - Settings with all tabs
- `src/renderer/src/pages/pile/Analytics/index.jsx` - Stats + History
- `src/renderer/src/pages/pile/Dashboard/index.jsx` - Charts

**Core Infrastructure:**
- `src/renderer/src/lib/query-client.ts` - All React Query hooks
- `src/renderer/src/lib/tipc-client.ts` - IPC client
- `src/main/tipc.ts` - Backend procedures
- `src/renderer/src/router.tsx` - Route definitions

**Configuration:**
- `electron.vite.config.ts` - Build configuration
- `src/shared/types.ts` - TypeScript types

### Related Documentation
- `CLAUDE.md` - Main project development guide
- `ai_changelog/CHANGELOG_FORK.md` - Change history

---

**Last Updated:** November 19, 2025
**Status:** Integration Complete
