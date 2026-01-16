# Testing Patterns

**Analysis Date:** 2026-01-16

## Test Framework

**Runner:**
- None configured - No test framework installed

**Assertion Library:**
- None

**Run Commands:**
```bash
# No test scripts available
npm run typecheck          # Type checking only
npm run typecheck:node     # Main process type checking
npm run typecheck:web      # Renderer type checking
```

## Test File Organization

**Location:**
- No test files found (*.test.*, *.spec.*, __tests__/)

**Current Quality Gates:**
- TypeScript type checking (`typescript@5.9.3`)
- Prettier formatting (`prettier@3.7.1`)
- ESLint linting (`eslint.config.js`)

## Test Structure

**Current Approach:**
- Type-driven development - TypeScript types enforce correctness at compile time
- Manual testing via `pnpm dev` local development
- Build validation via `npm run typecheck && electron-vite build`

## Mocking

**Framework:**
- None configured

## Fixtures and Factories

**Test Data:**
- None configured

## Coverage

**Requirements:**
- No coverage tracking

**Current Coverage:**
- 0% - No tests implemented

## Test Types

**Unit Tests:**
- Status: ❌ Not implemented

**Integration Tests:**
- Status: ❌ Not implemented

**E2E Tests:**
- Status: ❌ Not implemented

## Common Patterns

**Validation Approach:**
- Type checking via TypeScript
- Error handling with try-catch blocks
- Logging for observability

**Example Pattern from Code:**
```typescript
// Error classification instead of unit tests
private classifyError(error: any): ErrorMetadata {
  const errorStr = error?.message?.toLowerCase() || String(error).toLowerCase()

  if (errorStr.includes("permission")) {
    return {
      code: ScreenCaptureErrorCode.PermissionDenied,
      retryable: false,
      message: "Screen recording permission denied by user"
    }
  }
}
```

## If Tests Were to Be Implemented

**Recommended Stack:**
- Framework: Vitest (aligned with Vite)
- React Testing: React Testing Library + Vitest
- API Mocking: MSW or native fetch mocking
- Type Safety: TypeScript with strict mode

**Testable Areas:**
1. Main Process Services: `ScreenCaptureService`, `EnhancementService`, `AutoJournalService`
2. React Hooks: `usePost`, `useChat`, `useIPCListener`
3. Components: UI components with React Testing Library
4. Utilities: Pure functions in `pile-utils/`, `lib/`
5. IPC Communication: Mock tipc client tests

**Test File Placement (recommended):**
- `src/main/services/__tests__/screen-capture-service.test.ts`
- `src/renderer/src/components/__tests__/button.test.tsx`
- `src/renderer/src/hooks/__tests__/usePost.test.ts`

**Critical Functions Without Tests:**
- `src/main/llm.ts` - postProcessTranscript
- `src/main/services/enhancement-service.ts` - enhanceTranscript
- `src/main/history-analytics.ts` - analytics calculations
- `src/main/keyboard.ts` - keyboard event handling
- `src/main/services/screen-capture-service.ts` - capture logic

---

*Testing analysis: 2026-01-16*
*Update when test patterns change*
