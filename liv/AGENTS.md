# AGENTS.md - AI Agent Communication Protocol

**Last Updated:** December 2024
**Project:** Liv
**Version:** 0.1.8
**Status:** Active Development

---

## Agent-to-Codebase Communication

This document defines how AI agents should interface with the Liv project, including conventions, workflows, and best practices for collaborative development.

---

## 📋 Context Acquisition Protocol

### Phase 1: Rapid Project Understanding (5 minutes)

**Start here for ANY task:**

1. Read **CLAUDE.md** (this repo) - 5 min overview
   - Project purpose and value proposition
   - Architecture at a glance
   - Technology stack
   - Known issues

2. Identify the **specific domain** of your task:
   - UI/UX changes → focus on `renderer/` and React
   - API/IPC changes → focus on `main/tipc.ts`
   - Configuration → focus on `main/config.ts`
   - Post-processing → focus on `main/llm.ts`
   - Recording logic → focus on `renderer/lib/recorder.ts`

3. For deeper understanding, read the **relevant quickstart sections**:
   - See `ai_docs/quickstart.md` for code locations

### Phase 2: Deep Dive (10-15 minutes)

**If you need detailed understanding:**

1. Read `ai_docs/whispo-analysis.md`
   - Complete technical architecture
   - Feature explanations
   - Implementation details
   - Known problems

2. Read relevant API documentation:
   - OpenAI Whisper / Groq API endpoints
   - Electron IPC patterns
   - React Router navigation

3. Inspect the actual code files mentioned in CLAUDE.md

### Phase 3: Task-Specific Preparation (5-10 minutes)

**Before implementing:**

1. Check `ai_issues/README.md` for related bugs
2. Review `ai_specs/README.md` for feature specifications
3. Understand data flow in `src/shared/data-model.ts`
4. Verify no conflicting changes in progress

---

## 🎯 Task Communication Templates

### Task Type: Bug Fix

**When assigned:**

```
I'm fixing: [Issue Title]
Location: [file.ts:line]
Scope: [single file / multiple files / module refactor]
Testing: [manual / automated]
Risk: [low / medium / high]
```

**Progress updates:**

```
Status: In Progress
  - Root cause identified: [description]
  - Fix approach: [how fixing it]
  - Files modified: [list]
  - Testing: [what testing done]
```

**Before submitting:**

```
Ready for review:
  - [ ] TypeScript compiles without errors
  - [ ] Tested fix locally with `pnpm dev`
  - [ ] No console errors in DevTools
  - [ ] Updated related documentation
  - [ ] Verified no related issues created
```

### Task Type: Feature Implementation

**When assigned:**

```
Implementing: [Feature Name]
Specification: [ai_specs/path or GitHub issue]
Architecture: [Main process / Renderer / Shared types]
Estimated effort: [hours]
Dependencies: [other features needed first]
```

**Checklist before submission:**

```
Feature complete:
  - [ ] Specification requirements met
  - [ ] All acceptance criteria passed
  - [ ] Code follows project patterns
  - [ ] Documentation updated
  - [ ] Error handling implemented
  - [ ] Configuration persistence (if needed)
  - [ ] Tested end-to-end
  - [ ] No regressions in existing features
```

### Task Type: Documentation Update

**When assigned:**

```
Updating: [documentation file]
Reason: [why update is needed]
Changes: [what will be added/modified]
Scope: [single file / multiple files]
```

**Before submission:**

```
Documentation updated:
  - [ ] Information accurate per current code
  - [ ] All links verified
  - [ ] Examples tested and working
  - [ ] Cross-references updated
  - [ ] No orphaned references
  - [ ] Format consistent with project style
```

---

## 🔄 Agent Workflows by Domain

### Workflow: UI/UX Changes

1. **Understand current UI**
   - Find page in `src/renderer/src/pages/`
   - Check route in `src/renderer/src/router.tsx`
   - Review Radix UI component usage

2. **Plan modifications**
   - Create new page or modify existing
   - Identify IPC calls needed
   - Design new state management (if needed)

3. **Implement**
   - Create/modify `.tsx` file
   - Use TailwindCSS for styling (no custom CSS)
   - Integrate IPC client: `import { tipcClient } from '@/lib/tipc-client'`
   - Handle loading/error states with TanStack Query

4. **Test**
   - `pnpm dev` starts dev environment
   - Test in actual app (not browser!)
   - Verify functionality in Settings or panel

5. **Document**
   - Update `CLAUDE.md` if new patterns
   - Document UI in comments if complex logic

### Workflow: IPC/API Changes

1. **Define interface**
   - Update `src/shared/types.ts` with new types
   - Plan input/output structure

2. **Implement Main process**
   - Add procedure to `src/main/tipc.ts`
   - Use Zod for input validation
   - Implement error handling
   - Return typed result

3. **Implement Renderer**
   - Call via `tipcClient.NAMESPACE.PROCEDURE_NAME()`
   - Handle loading and error states
   - Display results or errors to user

4. **Test**
   - DevTools Network tab shows IPC messages
   - Console shows any errors
   - Try edge cases (missing data, network errors)

5. **Update Documentation**
   - Add to API signatures in CLAUDE.md
   - Document in code comments
   - Update `src/shared/data-model.ts` inventory

### Workflow: Configuration Changes

1. **Update type**
   - Modify `Config` type in `src/shared/types.ts`

2. **Implement persistence**
   - Add to config load in `src/main/config.ts`
   - Add to config save in `src/main/config.ts`
   - Handle migration for existing configs

3. **Add UI control**
   - Create input component in Settings page
   - Call `tipcClient.saveConfig(updatedConfig)`
   - Load current value with `tipcClient.getConfig()`

4. **Use the setting**
   - Load config on app start in Main process
   - Pass to relevant functions
   - Validate before use

5. **Document**
   - Add to config documentation in CLAUDE.md
   - Note in Settings UI with helper text

### Workflow: Performance Optimization

1. **Profile current behavior**
   - Use Chrome DevTools Profiler
   - Identify bottleneck: CPU / Memory / Network
   - Document baseline metrics

2. **Implement optimization**
   - Modify code with clear comments
   - Keep fallback to ensure functionality

3. **Verify improvement**
   - Re-run profile
   - Compare metrics
   - Document improvement % in commit message

4. **Document findings**
   - Add to `ai_research/performance-profiling/`
   - Link from relevant code
   - Share learnings in CLAUDE.md

---

## 🗂️ Repository Navigation Quick Reference

### Finding Things

| Need | File/Location |
|------|--------------|
| **Record hotkey logic** | `src/main/keyboard.ts` |
| **Recording UI** | `src/renderer/src/pages/panel.tsx` |
| **Audio codec settings** | `src/renderer/src/lib/recorder.ts` |
| **Transcription API call** | `src/main/tipc.ts` (createRecording) |
| **LLM post-processing** | `src/main/llm.ts` |
| **Settings storage** | `src/main/config.ts` |
| **IPC router** | `src/main/tipc.ts` |
| **Type definitions** | `src/shared/types.ts` |
| **Data model reference** | `src/shared/data-model.ts` |
| **Window management** | `src/main/window.ts` |
| **System tray** | `src/main/tray.ts` |
| **Routing** | `src/renderer/src/router.tsx` |

### File Modification Impact

| File | Impact of Changes |
|------|------------------|
| `types.ts` | All files using Config/RecordingHistoryItem |
| `tipc.ts` | Renderer must update IPC calls |
| `config.ts` | Persistence behavior changes |
| `recorder.ts` | Audio recording quality/format |
| `llm.ts` | Post-processing behavior |
| `router.tsx` | Routing in entire app |
| `keyboard.ts` | Hotkey responsiveness |

---

## 🚦 Git Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code refactor without functional change
- `perf:` Performance improvement
- `test:` Test additions/updates
- `chore:` Dependencies, build config

**Example:**

```
feat(recorder): add noise suppression option

- Add NoiseSuppressionLevel enum to Config type
- Implement Web Audio API noise gate filter
- Add UI control in Settings for threshold adjustment
- Document new audio filter chain in CLAUDE.md

Fixes #123
Related to ai_specs/audio-enhancement/
```

### PR Description Template

```markdown
## Description
[What changed and why]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
[How was this tested?]
- [ ] Local dev environment
- [ ] Windows/Mac specific testing
- [ ] API integration tested

## Related Issues
Closes #123

## Checklist
- [ ] Code follows project style
- [ ] Self-reviewed my changes
- [ ] Documentation updated
- [ ] No new warnings generated
```

---

## 💡 Agent Best Practices

### Code Review Checklist

When reviewing agent-submitted code:

- [ ] **TypeScript:** No `any` types, proper typing
- [ ] **Error Handling:** Errors caught and handled, user notified
- [ ] **IPC:** Input validated with Zod, output typed
- [ ] **Async:** Proper await, no floating promises
- [ ] **UI:** Accessible (keyboard, screen reader), TailwindCSS only
- [ ] **Performance:** No N+1 queries, efficient DOM updates
- [ ] **Security:** No hardcoded secrets, no XSS vectors
- [ ] **Testing:** Manual testing done, edge cases covered
- [ ] **Documentation:** Code commented, README updated
- [ ] **Conventions:** Follows existing patterns

### Documentation Accuracy

Keep documentation synchronized:

1. **After IPC changes:**
   - Update CLAUDE.md API section
   - Update data-model.ts inventory
   - Add example usage in comments

2. **After config changes:**
   - Update CLAUDE.md configuration section
   - Document in config.ts with JSDoc
   - Add to CHANGELOG

3. **After feature implementation:**
   - Document in CLAUDE.md workflows
   - Add to ai_specs/ if not already there
   - Update quickstart.md if major change

4. **After bug fixes:**
   - Update ai_issues/ status
   - Add to CHANGELOG
   - Document workaround if not fixed

---

## Onboarding Checklist for New Agents

Use this to verify you have sufficient context:

- [ ] Understand what Liv does and why
- [ ] Know the architecture (Main ↔ Renderer ↔ Rust)
- [ ] Can locate files for different change types
- [ ] Aware of known issues and workarounds
- [ ] Understand IPC communication pattern
- [ ] Know the build and dev commands
- [ ] Familiar with configuration strategy
- [ ] Can identify code patterns and conventions
- [ ] Know how to test changes locally
- [ ] Can navigate documentation structure

**All items checked?** → You're ready to start!

---

## 🔗 Key Resources for Agents

| Resource | Purpose | Location |
|----------|---------|----------|
| **CLAUDE.md** | Dev guide & patterns | This repo root |
| **Quick Start** | Onboarding guide | `quickstart.md` |
| **Docs** | Technical documentation | `liv/docs/README.md` |
| **Specs** | Feature requirements | `liv/specs/README.md` |

---

## 📞 Clarification & Questions

**When stuck:**

1. **Check CLAUDE.md** - Likely answered there
2. **Review quickstart.md** - Specific guidance
3. **Check liv/docs/** - Technical documentation
4. **Check liv/specs/** - Feature specifications
5. **Inspect the code** - Source of truth
6. **Document your findings** - Help future agents

---

## Final Readiness

Before starting work:

- [ ] Read CLAUDE.md (entire document)
- [ ] Read quickstart.md
- [ ] Understand your specific task domain
- [ ] Know where to find relevant code
- [ ] Have questions answered
- [ ] Ready to implement
