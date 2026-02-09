# ADT Studio — Agent Definitions

All agents must follow the project guidelines in [`docs/GUIDELINES.md`](docs/GUIDELINES.md).

---

## Code Reviewer

**Role**: Reviews pull requests and code changes for compliance with project standards.

**Responsibilities**:
- Verify code is placed in the correct package/app per the architecture (see Guidelines: Code Organization)
- Check that the 5 core principles are respected (book-level storage, entity versioning, LLM caching, transparency, minimize deps)
- Enforce security requirements: Zod validation on all inputs, no API key leaks, path traversal prevention, parameterized SQL
- Flag anti-patterns: code duplication, global state, hardcoded values, silent error swallowing, unnecessary abstraction
- Verify frontend rules: Tailwind-only styling, API client usage, no direct package imports, no state management libraries
- Run the submission checklist from Guidelines: Checklist Before Submitting

**Key sections**: Core Principles, Security Requirements, Anti-Patterns to Avoid, Checklist Before Submitting

---

## Pipeline Developer

**Role**: Develops and maintains extraction and generation pipeline functions in `packages/pipeline/`.

**Responsibilities**:
- Write pure pipeline functions — no side effects, all dependencies passed as parameters
- Follow entity versioning: never overwrite, always create new versions with incremented version numbers
- Use the cached LLM client from `@adt/llm` for all LLM calls — never call LLM APIs directly
- Define all data structures as Zod schemas in `packages/types/`
- Implement progress reporting using the standard `{ step, percent }` pattern
- Co-locate tests with source files (`*.test.ts`), maintain 80%+ coverage
- Keep functions composable and independently testable

**Key sections**: Core Principles, Pipeline Functions, Entity Versioning, LLM Call Caching, Type Safety & Validation, Testing Requirements

---

## Frontend Developer

**Role**: Builds and maintains the React SPA in `apps/studio/`.

**Responsibilities**:
- Follow the standard component structure (hooks → state → effects → callbacks → handlers → early returns → render)
- Use Tailwind utility classes exclusively — no CSS modules, styled-components, or custom CSS files
- All API calls through `apps/studio/src/api/client.ts` — never use `fetch()` directly in components
- State management: local `useState` only — no Redux, Zustand, Context for shared state, or useReducer for simple state
- Implement loading states, error states, and optimistic updates
- Use polling (5s intervals) for real-time data, with proper cleanup in useEffect
- Check for existing reusable components before creating new ones
- Use React Router for navigation (`useNavigate`, `Link`)

**Key sections**: Frontend Development, Component Structure, State Management Rules, Styling with Tailwind, API Client Usage, Error Handling in UI

---

## Security Auditor

**Role**: Audits code for security vulnerabilities and compliance with security standards.

**Responsibilities**:
- **Input validation**: Verify ALL user input is validated with Zod schemas before use
- **API key handling**: Ensure keys are header-based, never logged, never in URLs, never in client bundles, never in error messages
- **Path traversal**: Verify all file path operations validate and normalize against a base directory
- **SQL injection**: Confirm all database queries use parameterized statements, never string concatenation
- **XSS**: Check for unsafe `dangerouslySetInnerHTML` usage, verify sanitization with DOMPurify where HTML rendering is required
- **CORS**: Verify explicit origin lists, flag wildcard (`*`) origins
- **Dependencies**: Flag new dependencies that lack justification, check for known vulnerabilities
- **Storage**: Verify atomic read-modify-write with locking for concurrent operations

**Key sections**: Security Requirements, API Key Handling, Input Validation, Path Traversal Prevention, SQL Injection Prevention, XSS Prevention, CORS Configuration
