# Codebase Concerns

**Analysis Date:** 2026-01-16

## Tech Debt

**Duplicate atomic write pattern:**
- Issue: `atomicWriteFileSync` implemented identically in two files
- Files: `src/main/config.ts:16-28`, `src/main/history-store.ts:12-24`
- Why: Rapid development without refactoring
- Impact: Code maintenance burden, potential inconsistency if one is updated
- Fix approach: Extract to shared utility module in `src/main/utils/file.ts`

**Large mega-components:**
- Issue: Settings, AutoJournal, TranscriptionSettings are very large (1000+ lines)
- Files:
  - `src/renderer/src/pages/pile/Settings/index.jsx` (1,649 lines)
  - `src/renderer/src/pages/pile/AutoJournal/index.jsx` (1,383 lines)
  - `src/renderer/src/pages/pile/Settings/TranscriptionSettingsTabs/index.jsx` (1,099 lines)
- Why: Complex UI state management combined with multiple concerns
- Impact: Hard to maintain, test, and understand
- Fix approach: Break down into smaller focused components, extract sub-forms

**Large service files:**
- Issue: IPC router, enhancement service, LLM service are complex (600-1300 lines)
- Files:
  - `src/main/tipc.ts` (1,311 lines)
  - `src/main/llm.ts` (671 lines)
  - `src/main/services/enhancement-service.ts` (662 lines)
  - `src/main/history-analytics.ts` (626 lines)
- Why: All IPC procedures in single file, mixed legacy/new patterns
- Impact: Difficult to navigate and maintain
- Fix approach: Split IPC router by domain, refactor LLM service to remove legacy patterns

## Known Bugs

**Typo in IPC method name:**
- Symptoms: Method named `saveRecordingsHitory` (misspelled "History")
- File: `src/main/tipc.ts:37`
- Workaround: Use with current spelling
- Root cause: Simple typo
- Fix: Rename to `saveRecordingsHistory` (breaking change for renderer)

**TODO: Root cause investigation needed:**
- Symptoms: Phantom key events after text simulation
- File: `src/main/keyboard.ts:70`
- Workaround: `keysPressed.clear()` after simulation
- Root cause: Unknown - requires investigation in `liv-rs` Rust binary
- Fix: Debug Rust text simulation logic

**TODO: File cleanup missing:**
- Symptoms: Orphaned files may not be cleaned up on error
- File: `src/renderer/src/hooks/usePostHelpers.jsx:21`
- Workaround: None
- Root cause: Missing cleanup in error handler
- Fix: Add file deletion in catch block

## Security Considerations

**API keys in memory (renderer context):**
- Risk: API keys passed to React context, exposed in DevTools and memory dumps
- Files: `src/renderer/src/context/AIContext.jsx:40-76`
- Current mitigation: Uses `dangerouslyAllowBrowser` flag (OpenAI SDK)
- Recommendations: Move API key handling to main process only, pass tokens via secure IPC

**Plaintext API key storage:**
- Risk: API keys stored unencrypted in config.json
- File: `src/main/config.ts`
- Current mitigation: File permissions (user-only read)
- Recommendations: Implement encryption for sensitive config fields (planned per CLAUDE.md)

**Hardcoded Ollama URL:**
- Risk: Ollama URL hardcoded to `http://localhost:11434/api`
- File: `src/renderer/src/context/AIContext.jsx:12-14`
- Current mitigation: None
- Recommendations: Make configurable via settings

**Missing input validation in IPC:**
- Risk: Some IPC procedures don't validate input structure before use
- File: `src/main/tipc.ts` (various procedures)
- Current mitigation: TypeScript type checking
- Recommendations: Add Zod schema validation for all IPC inputs

## Performance Bottlenecks

**localStorage unbounded growth:**
- Problem: Timer history stored in localStorage with no size limit or cleanup
- File: `src/renderer/src/utils/timer-history.js`
- Measurement: Could grow indefinitely with many timer sessions
- Cause: No cleanup or size limit logic
- Improvement path: Add automatic cleanup (e.g., keep last 1000 entries), implement pagination

**History analytics synchronous processing:**
- Problem: Large history arrays processed synchronously in main process
- File: `src/main/history-analytics.ts`
- Measurement: Could block UI with thousands of entries
- Cause: No chunking or streaming
- Improvement path: Implement chunked processing or move to web worker

**KeysPressed map unbounded growth:**
- Problem: Map pruned every 5 seconds but could grow rapidly between prunes
- File: `src/main/keyboard.ts:101`
- Measurement: Edge case with rapid key events
- Cause: Cleanup interval vs event rate
- Improvement path: Add max size limit, more frequent cleanup

## Fragile Areas

**Keyboard event parsing:**
- Why fragile: Silent failures on JSON parse errors
- File: `src/main/keyboard.ts:88-96`
- Common failures: Lost keyboard events won't be visible to user
- Safe modification: Add logging for parse failures
- Test coverage: No tests (manual testing only)

**FFmpeg path initialization:**
- Why fragile: Async initialization without await
- File: `src/main/services/auto-journal-service.ts:50-53`
- Common failures: GIF generation called before FFMPEG_PATH is set
- Safe modification: Add await or blocking check before GIF generation
- Test coverage: No tests

**Auto-journal scheduler state:**
- Why fragile: Global `running` flag and `intervalId` state
- File: `src/main/services/auto-journal-service.ts:95-98`
- Common failures: Race conditions if operations overlap
- Safe modification: Use state machine like screen capture service
- Test coverage: No tests

## Scaling Limits

**File-based history storage:**
- Current capacity: Single `history.json` file with all recordings
- Limit: Performance degrades with 10,000+ recordings
- Symptoms at limit: Slow loads, high memory usage
- Scaling path: Implement chunked storage (e.g., by month/year)

**In-memory analytics:**
- Current capacity: All history loaded into memory for analytics
- Limit: Memory usage grows linearly with history size
- Symptoms at limit: High RAM usage, potential crashes
- Scaling path: Implement streaming analytics or database

## Dependencies at Risk

**Axios unused:**
- Risk: Unused dependency (~70KB in bundle)
- File: `package.json:52` (`axios@^1.13.2`)
- Impact: Increased bundle size
- Migration plan: Remove dependency

**Electron-settings unused:**
- Risk: Unused dependency (custom storage exists)
- File: `package.json:55` (`electron-settings@^4.0.4`)
- Impact: May be legacy dependency
- Migration plan: Verify usage and remove if unused

**OpenAI SDK outdated:**
- Risk: Missing bug fixes and features
- File: `package.json:63` (`openai@^6.9.1`)
- Impact: May miss improvements
- Migration plan: Upgrade to latest stable version

## Missing Critical Features

**Test coverage:**
- Problem: Zero unit/integration/e2e tests
- Current workaround: TypeScript type checking + manual testing
- Blocks: Refactoring confidence, regression detection
- Implementation complexity: Medium (setup Vitest, write tests for critical services)

**API key encryption:**
- Problem: API keys stored in plaintext
- Current workaround: File permissions
- Blocks: Secure credential management
- Implementation complexity: Low (use electron-store or similar)

## Test Coverage Gaps

**All critical services untested:**
- What's not tested: All business logic (enhancement, LLM, keyboard, screen capture, auto-journal)
- Risk: No safety net for refactoring, bugs in core features
- Priority: High
- Difficulty to test: Medium (need to mock Electron APIs, external APIs)

**All React components untested:**
- What's not tested: All UI components and hooks
- Risk: UI regressions undetected
- Priority: Medium
- Difficulty to test: Medium (need React Testing Library setup)

---

*Concerns audit: 2026-01-16*
*Update as issues are fixed or new ones discovered*
