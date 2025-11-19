# Pile + Whispo Integration Analysis

**Created:** 2025-11-19
**Goal:** Integrate Pile (journaling app) as the main page of Whispo while maintaining all Whispo functionality

---

## 📊 Tech Stack Comparison

### Pile
- **Electron**: 33.2.0
- **React**: 19.0.0
- **Build**: Webpack 5 (electron-react-boilerplate)
- **UI**: Radix UI, Framer Motion
- **Editor**: TipTap (rich text editor)
- **Storage**: electron-settings
- **AI**: OpenAI SDK 4.44.0
- **Router**: react-router-dom 6.23.1
- **Search**: Lunr.js (full-text search)
- **Styling**: SCSS/Sass

### Whispo
- **Electron**: 31.0.2
- **React**: 18.3.1
- **Build**: Vite (electron-vite)
- **UI**: Radix UI, TailwindCSS
- **State**: TanStack Query
- **Storage**: Manual JSON files (config.json, history.json)
- **AI**: OpenAI, Groq, Gemini support
- **Router**: react-router-dom 6.27.0
- **IPC**: @egoist/tipc
- **Styling**: TailwindCSS

### ✅ Common Ground
- Both use Electron + React
- Both use Radix UI components
- Both use react-router-dom
- Both have AI integration
- Both store data locally

### ⚠️ Key Differences
1. **Build System**: Webpack vs Vite
2. **React Version**: 19.0 vs 18.3
3. **Styling**: SCSS vs TailwindCSS
4. **Storage**: electron-settings vs manual JSON
5. **Editor**: TipTap (Pile) vs textarea (Whispo)

---

## 🎯 Integration Strategies

### Option 1: Full Integration (RECOMMENDED)
**Migrate all Pile code into Whispo as a new page**

#### Pros:
✅ Single application, single build
✅ Shared dependencies (Radix UI, React Router)
✅ Better UX (no context switching)
✅ Can share AI providers (OpenAI, Groq, Gemini)
✅ Whispo's existing infrastructure (config, storage)
✅ Smaller bundle size (shared libs)

#### Cons:
⚠️ Migration work required
⚠️ Need to adapt TipTap to work with Vite
⚠️ May need to downgrade React 19 → 18.3 or upgrade Whispo

#### Implementation Plan:
1. **Phase 1**: Copy Pile components to Whispo
   - Move `/Pile/src/renderer/pages/Pile/*` → `/whispo/src/renderer/src/pages/journal/*`
   - Move TipTap editor components
   - Move Pile context providers

2. **Phase 2**: Adapt storage layer
   - Replace electron-settings with Whispo's config system
   - Create `journal-store.ts` similar to `history-store.ts`
   - Store journals as markdown files (Pile's format)

3. **Phase 3**: Migrate AI features
   - Reuse Whispo's AI provider system (OpenAI, Groq, Gemini)
   - Adapt Pile's "reflect" feature to use Whispo's LLM module

4. **Phase 4**: Update routing
   - Make `/` (home) route load the journal/Pile page
   - Move current history to `/history`
   - Update sidebar navigation

5. **Phase 5**: Style integration
   - Convert Pile's SCSS to TailwindCSS
   - Or add SCSS support to Vite config

---

### Option 2: Monorepo
**Keep both apps separate, share code via packages**

#### Pros:
✅ Less initial migration work
✅ Can keep Pile's Webpack config
✅ Independent versioning

#### Cons:
⚠️ Two separate builds
⚠️ More complex deployment
⚠️ Duplicated dependencies
⚠️ User has to switch between apps

**NOT RECOMMENDED** - Doesn't meet your requirement of "100% integrated"

---

### Option 3: IFrame/Webview Embed
**Run Pile in an iframe inside Whispo**

#### Pros:
✅ Zero migration work

#### Cons:
❌ Poor performance
❌ Complex IPC communication
❌ Fragmented UX
❌ Double memory usage

**NOT RECOMMENDED** - Bad UX and performance

---

## 🏆 Recommended Approach: Full Integration

### Migration Roadmap

#### Step 1: Preparation (1-2 hours)
- [ ] Audit Pile dependencies vs Whispo
- [ ] Identify conflicts (React version, build tools)
- [ ] Create migration branch in Whispo

#### Step 2: Core Migration (4-6 hours)
- [ ] Install Pile dependencies in Whispo
  - TipTap editor suite
  - Framer Motion
  - React Markdown
  - Lunr.js (search)

- [ ] Copy Pile components to Whispo
  - Journal editor (TipTap)
  - Journal list/sidebar
  - Search interface
  - AI reflection components

- [ ] Adapt file structure
  ```
  whispo/src/renderer/src/
    pages/
      journal/          # New - Pile's main view
        index.tsx
        Editor.tsx
        JournalList.tsx
        Search.tsx
      panel.tsx         # Existing - recording UI
      settings/         # Existing
      ...
  ```

#### Step 3: Storage Layer (2-3 hours)
- [ ] Create `journal-store.ts` in `src/main/`
- [ ] Implement journal CRUD operations
- [ ] Store journals as markdown files (Pile's format)
- [ ] Create IPC handlers for journal operations

#### Step 4: AI Integration (2-3 hours)
- [ ] Reuse Whispo's existing LLM providers
- [ ] Adapt Pile's "reflect" feature
- [ ] Add journal-specific prompts to enhancement system

#### Step 5: Routing & Navigation (1-2 hours)
- [ ] Update `router.tsx` to make `/` load journal
- [ ] Move history to `/transcriptions`
- [ ] Update sidebar links
- [ ] Add "Journal" and "Transcriptions" sections

#### Step 6: Styling (2-3 hours)
- [ ] Convert Pile SCSS → TailwindCSS
- [ ] Or add Sass support to Vite
- [ ] Ensure consistent design system

#### Step 7: Testing & Polish (2-3 hours)
- [ ] Test journal creation/editing
- [ ] Test search functionality
- [ ] Test AI reflections
- [ ] Test Whispo transcription → journal workflow

**Total Estimated Time:** 14-22 hours

---

## 📦 Dependencies to Add to Whispo

```json
{
  "dependencies": {
    "@tiptap/core": "^2.10.2",
    "@tiptap/extension-character-count": "^2.10.2",
    "@tiptap/extension-link": "^2.10.2",
    "@tiptap/extension-placeholder": "^2.10.2",
    "@tiptap/extension-typography": "^2.10.2",
    "@tiptap/react": "^2.10.2",
    "@tiptap/starter-kit": "^2.10.2",
    "framer-motion": "^11.2.4",
    "lunr": "^2.3.9",
    "gray-matter": "^4.0.3",
    "react-markdown": "^9.0.1"
  }
}
```

---

## 🔄 Potential Whispo → Pile Synergies

1. **Transcription → Journal Entry**
   - After recording, offer "Save to Journal" button
   - Auto-create journal entry with transcript

2. **Voice Notes in Journal**
   - Add voice recording button in journal editor
   - Inline audio transcription

3. **Unified AI**
   - Journal reflections use same AI providers
   - Shared API key configuration

4. **Unified Search**
   - Search across both journals AND transcriptions
   - Unified history view

---

## 🚀 Next Steps

**Option A: Start Full Integration Now**
1. Create integration branch
2. Begin Step 1: Preparation
3. Execute migration roadmap

**Option B: Create POC First**
1. Copy one Pile component to Whispo
2. Test TipTap in Vite environment
3. Verify approach before full migration

**Which approach do you prefer?**
