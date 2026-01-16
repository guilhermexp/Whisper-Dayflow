# Code Conventions

**Analysis Date:** 2026-01-16

## Code Style

### Formatting

**Indentation:**
- 2 spaces (no tabs)
- Configured via Prettier

**Semicolons:**
- Not used (ASI - Automatic Semicolon Insertion)
- Example: `const foo = 'bar'` (no semicolon)

**Quotes:**
- Single quotes for strings: `'hello'`
- Template literals for interpolation: `` `Hello ${name}` ``

**Line Length:**
- Max 100 characters (Prettier default)
- Enforced by `prettier-plugin-tailwindcss`

**Trailing Commas:**
- Always in multiline structures
- Example:
```javascript
const obj = {
  foo: 1,
  bar: 2, // trailing comma
}
```

---

### Naming Conventions

**Files:**
- Services: `kebab-case-service.ts` (e.g., `screen-capture-service.ts`)
- Components: `PascalCase.jsx` or `index.jsx` in PascalCase folder
- Utilities: `camelCase.ts` (e.g., `recorder.ts`)
- Hooks: `useCamelCase.jsx` (e.g., `usePost.jsx`)
- Styles: `kebab-case.module.scss` (e.g., `button.module.scss`)

**Variables & Functions:**
- camelCase: `const userName = 'John'`
- Descriptive names: `getUserById()` not `get()`

**Constants:**
- UPPER_SNAKE_CASE for true constants
- Example: `const MAX_RETRIES = 3`

**React Components:**
- PascalCase: `function Button() { ... }`
- Exported: `export const Button = () => { ... }`

**Classes:**
- PascalCase: `class ScreenCaptureService { ... }`

**Interfaces/Types:**
- PascalCase: `interface Config { ... }`
- Prefix with `I` not used (just `Config`, not `IConfig`)

---

### TypeScript Patterns

**Type Annotations:**
- Explicit for function parameters and return types
```typescript
function process(input: string): Promise<Result> {
  // ...
}
```

**Type Inference:**
- Preferred for simple variables
```typescript
const count = 5 // inferred as number
const name = 'John' // inferred as string
```

**Any Types:**
- Avoided except for truly dynamic data
- Use `unknown` or specific types when possible

**Optional Properties:**
```typescript
interface Config {
  apiKey?: string // optional
  timeout: number // required
}
```

**Union Types:**
```typescript
type Status = 'idle' | 'loading' | 'success' | 'error'
```

---

## Project Structure Patterns

### File Organization

**Co-location:**
- Styles next to components: `Button/index.jsx` + `Button.module.scss`
- Types in same file as implementation (unless shared)

**Index Files:**
- Used for clean imports: `components/Button/index.jsx`
- Import as: `import { Button } from 'renderer/components/Button'`

**Barrel Exports:**
- Not heavily used (prefer explicit imports)

---

### Import Patterns

**Absolute Imports:**
- Main: `import { foo } from 'main/utils'`
- Renderer: `import { bar } from 'renderer/lib/recorder'`
- Shared: `import { Config } from 'shared/types'`

**Relative Imports:**
- Avoided in favor of absolute imports
- Exception: Same-folder imports

**Import Order:**
```javascript
// 1. External dependencies
import React from 'react'
import { useQuery } from '@tanstack/react-query'

// 2. Internal modules
import { tipcClient } from 'renderer/lib/tipc-client'

// 3. Components
import { Button } from 'renderer/components/ui/button'

// 4. Styles
import styles from './Component.module.scss'
```

---

## React Patterns

### Component Structure

**Functional Components:**
- Prefer function declarations over arrow functions for named components
```javascript
export function Button({ children }) {
  return <button>{children}</button>
}
```

**Hooks Order:**
```javascript
function Component() {
  // 1. State
  const [state, setState] = useState(initial)

  // 2. Context
  const context = useContext(SomeContext)

  // 3. Refs
  const ref = useRef(null)

  // 4. Effects
  useEffect(() => { ... }, [])

  // 5. Callbacks
  const handleClick = useCallback(() => { ... }, [])

  // 6. Memoized values
  const value = useMemo(() => { ... }, [])

  return <div>...</div>
}
```

---

### State Management

**Local State:**
```javascript
const [count, setCount] = useState(0)
```

**Context API:**
```javascript
export const MyContext = createContext()

export const MyContextProvider = ({ children }) => {
  const [value, setValue] = useState(initial)
  return <MyContext.Provider value={{ value, setValue }}>{children}</MyContext.Provider>
}
```

**TanStack Query:**
```javascript
const { data, error, isLoading } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos
})
```

---

### Event Handlers

**Naming:**
- Prefix with `handle`: `handleClick`, `handleSubmit`
- Event handlers passed as props: `onClick={handleClick}`

**Inline Handlers:**
- Avoided for complex logic
- OK for simple cases: `onClick={() => setCount(c => c + 1)}`

---

## Async Patterns

### Promises

**Async/Await:**
```javascript
async function fetchData() {
  try {
    const response = await fetch(url)
    const data = await response.json()
    return data
  } catch (error) {
    logger.error('Fetch failed', error)
    throw error
  }
}
```

**Error Handling:**
- Always use try/catch with async/await
- Log errors with context
- Never swallow errors silently

---

### IPC Communication

**Client-Side (Renderer):**
```javascript
const result = await tipcClient.someMethod.mutate({ input })
```

**Server-Side (Main):**
```typescript
export const router = t.router({
  someMethod: t.procedure
    .input(z.object({ ... }))
    .mutation(async ({ input }) => {
      // Implementation
    })
})
```

---

## Error Handling

### Main Process

**Structured Errors:**
```typescript
class ServiceError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public retryable: boolean
  ) {
    super(message)
  }
}
```

**Logging:**
```typescript
import { logError } from './logger'

try {
  await operation()
} catch (error) {
  logError('Operation failed', error)
  throw error // or return error response
}
```

---

### Renderer

**Error Boundaries:**
- Not implemented (should be added)

**Query Error Handling:**
```javascript
const { data, error } = useQuery({ ... })

if (error) {
  return <ErrorMessage error={error} />
}
```

---

## Logging

### Development

**Console Logging:**
- ⚠️ 335+ `console.log` statements in production code
- Should be removed or replaced with proper logging

**Example (should be removed):**
```javascript
console.log('[PilesContext] Creating default journal at:', journalPath)
```

---

### Production

**electron-log:**
```typescript
import { logger, logInfo, logError } from 'main/logger'

logInfo('Application started')
logError('Operation failed', error)
```

**Context-Based:**
```typescript
const log = logWithContext('ScreenCapture')
log.info('Capturing screen...')
log.error('Capture failed', error)
```

---

## Comments

### When to Comment

**Complex Logic:**
```javascript
// Calculate exponential backoff: 1s, 2s, 4s, 8s
const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
```

**TODOs:**
```javascript
// TODO: Implement retry logic
// TODO: Add error classification
```

**Workarounds:**
```javascript
// HACK: Clear keysPressed to prevent phantom events
// Root cause unknown, requires investigation in liv-rs
keysPressed.clear()
```

---

### When NOT to Comment

**Self-Explanatory Code:**
```javascript
// ❌ BAD
// Set the user name
setUserName('John')

// ✅ GOOD (no comment needed)
setUserName('John')
```

---

## Testing Conventions

**Status:** ❌ No tests exist

**If Tests Were to Be Implemented:**

**File Naming:**
- `ComponentName.test.tsx` (co-located with component)
- Or: `__tests__/ComponentName.test.tsx`

**Test Structure:**
```javascript
describe('ComponentName', () => {
  it('should render correctly', () => {
    // Arrange
    const props = { ... }

    // Act
    render(<Component {...props} />)

    // Assert
    expect(screen.getByText('...')).toBeInTheDocument()
  })
})
```

---

## Git Commit Conventions

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, missing semicolons, etc.
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `perf` - Performance improvement
- `test` - Adding missing tests
- `chore` - Build process, dependencies, etc.

**Example:**
```
feat(settings): add custom base URL support

Allow users to configure custom API endpoints for all providers.
Includes UI changes in Settings panel.

Closes #42
```

---

## Documentation Conventions

**README Files:**
- Markdown format
- Include: Purpose, Usage, Examples

**Code Documentation:**
- JSDoc for public APIs
```javascript
/**
 * Captures a screenshot of the active window.
 * @returns {Promise<ScreenCaptureResult | null>} Screenshot with OCR text, or null on failure
 */
async captureScreen() {
  // ...
}
```

---

## Linting & Formatting

**Tools:**
- Prettier 3.7.1 - Automatic formatting
- ESLint - Code quality rules
- TypeScript - Type checking

**Pre-commit Hooks:**
- Not configured (should be added with Husky)

**Scripts:**
```bash
pnpm format   # Run Prettier
pnpm lint     # Run ESLint
pnpm typecheck # TypeScript type checking
```

---

## Accessibility

**Patterns:**
- Radix UI primitives (accessible by default)
- Keyboard navigation support
- ARIA labels where needed

**Current Status:**
- Basic accessibility implemented
- Screen reader testing needed

---

## Performance

**React Optimization:**
- `React.memo` for expensive components
- `useMemo` for computed values
- `useCallback` for stable callbacks

**Bundle Optimization:**
- Code splitting via `React.lazy()`
- Vite tree shaking

**Data Handling:**
- TanStack Virtual for long lists
- Debouncing for search inputs

---

## Security

**API Keys:**
- Never log API keys
- Store in config.json (plaintext - ⚠️ should be encrypted)

**Input Validation:**
- Zod schemas for IPC inputs
- Sanitize HTML in markdown rendering

**CSP:**
- Content Security Policy configured

---

*Conventions snapshot: 2026-01-16*
*Update as standards evolve*
