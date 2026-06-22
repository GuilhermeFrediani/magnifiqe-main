# ai-rules/05-debugging-mastery.md

- kind: md
- lines: 50
- bytes: 2810

## Summary
05 - Debugging Mastery (Anti-Guesswork for JS/TS)

## Imports
- none

## Exports
- none

## Source
```md
# 05 - Debugging Mastery (Anti-Guesswork for JS/TS)

> **META:** No more "console.log('here')" luck. In JavaScript, TypeScript, Node or React, debugging must be systematic, scientific, and evidence-based.

## 1. Mindset "Reproduce, Reduce, Prove"
- **NEVER try to code a fix based on assumptions (guesswork).**
- Before proposing a change, you must prove where the invariant was violated.
- Reduce scope: test only the smallest affected part of the code. Isolate the error state.

## 2. Abandoning Blind `console.log`
Prohibited: blind logging like `console.log("got here")` or `console.log(err)`.

**Use Structured Logging:**

```javascript
// BAD — blind log, unparseable, no context
console.log('User', userId, 'failed with', err);
console.log('got here');
console.log(err);

// GOOD — structured log, parseable, with context
console.log({ msg: 'user_fetch_failed', userId, error: String(err) });
// OR use debugger; to stop and inspect real state
```

**Important:** The `validate_bad_code` tool distinguishes between blind and structured logging:
- `console.log("string")` or `console.log(variable)` → HALT (blind logging)
- `console.log({ msg: '...', ...data })` → PASS (structured logging)

**Absolute Preference:** When helping the user debug, suggest inserting the `debugger;` keyword or tools like Node Inspector (`--inspect`). Use Logpoints or Conditional Breakpoints if coding together in the IDE.

## 3. Common Failure Patterns (And How to Avoid Them)
When encountering the following errors, apply the solutions below instead of trying easy patches:

- **`Cannot read property 'x' of undefined`:**
  - Diagnosis: Data contract problem.
  - Action: Go to the variable's origin. Propose _Guards_ (e.g., `if (!user) return;`) or Type Guards. Never just wrap in a generic `try/catch` without addressing why the data is empty.
- **Missing `await` (Async Errors):**
  - If a test/UI is advancing before the request finishes or returning a pending Promise, the first guess shouldn't be "change all the logic". Look for a missing `await` or poorly chained async blocks.
- **Race Conditions (Desynchronized UI):**
  - If the problem is fast double-clicks or overlap, don't reinvent `useEffect` (in React). Use `AbortController` on `fetch` requests to cancel previous calls.
- **Stale Closures in React:**
  - If an event can't access updated state, use functional updates (e.g., `setCount(c => c + 1)`) or review the dependencies array.

## 4. Senior Debugger Checklist (Use This Flow)
1. What's the expected vs actual behavior?
2. At which exact boundary does correct state become incorrect?
3. Execute the script or test. Is the stacktrace clean (source maps)? If not, read the async stacktrace.
4. Apply the smallest, safest fix possible. Run tests to prove the fix didn't introduce regression.

```
