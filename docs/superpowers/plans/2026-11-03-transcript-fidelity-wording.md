# Transcript Fidelity Wording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the session transcript tools disclose the real rendering bounds instead of promising the "complete message".

**Architecture:** Both descriptions are built from the exported `MESSAGE_MAX_CHARS` and `TOOL_OUTPUT_MAX_CHARS` constants in `session/transcript.ts`, so the prose cannot drift from the truncation logic. One sentence in the search output changes and one regression assertion is added; no query or read behavior changes.

**Tech Stack:** TypeScript, Bun test, Effect.

**Spec:** `C:\Windows\Temp\opencode\fifecode-audit-2026-11-03\fifecode-local-validation-report-2026-11-03.md` §5 (FIFE-008) and `Y:\CodingProjects\opencode_fife\docs\harness-research\consolidated\fifecode-master-findings-register.md:114-124`.

## Global Constraints

- Copy-only change. Do not alter search matching, truncation, storage, or the `session_read` output shape.
- The rendered numbers come from `MESSAGE_MAX_CHARS` (20,000) and `TOOL_OUTPUT_MAX_CHARS` (4,000), formatted with `toLocaleString("en-US")` so the thousands separator is deterministic.
- Keep the instruction to use `session_read` with a message ID; only the fidelity claim changes.
- Run tests and typechecks from `packages/core`, never from the repository root.
- This worktree (`harness-optimization`) is one commit behind `dev`; run `git merge --ff-only dev` before starting.
- The working tree already contains pre-existing `T` (typechange) entries for symlinked assets. Stage only the three files named below.
- Commit message: `fix(core): disclose transcript rendering bounds in session tool copy`.

## Review Focus

- **Constant drift:** if `TOOL_OUTPUT_MAX_CHARS` changes later, the prose must change with it. The test asserts the rendered `4,000`, and the description interpolates the constant, so either both move or the test fails.
- **Empty-search branch:** `"No completed transcript messages matched ..."` is a different message and must stay unchanged.
- **Read tool copy:** it already says 20,000; it now interpolates the same constant so search and read cannot disagree.
- **Locale grouping:** format explicitly with `"en-US"`; the default locale could render `4.000` or `4,000` differently.
- **Machine consumers:** models read this text. Keep the `session_read` and message-ID guidance intact while removing the false "complete" promise.

---

### Task 1: Disclose rendering bounds in the session transcript tools

**Files:**
- Modify: `packages/core/src/session/transcript.ts:15-19`
- Modify: `packages/core/src/tool/plugin/session.ts:63,76-79,109,117-118`
- Test: `packages/core/test/tool-session.test.ts:110`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const TOOL_OUTPUT_MAX_CHARS: number` and `export const MESSAGE_MAX_CHARS: number` from `packages/core/src/session/transcript.ts`.

- [ ] **Step 1: Write the failing assertions**

In `packages/core/test/tool-session.test.ts`, inside `"searches the current session and reads a match with neighbors"`, replace the single line `expect(text(searched)).toContain("session_read")` with:

```ts
expect(text(searched)).toContain("session_read")
expect(text(searched)).toContain("Stored tool outputs are rendered up to 4,000 characters.")
expect(text(searched)).not.toContain("complete message")
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

Run from `packages/core`:

```bash
bun test test/tool-session.test.ts
```

Expected: FAIL on `Expected to contain "Stored tool outputs are rendered up to 4,000 characters."` and on the forbidden `"complete message"`.

- [ ] **Step 3: Export the bounds and build the copy from them**

In `packages/core/src/session/transcript.ts`, add `export` to the two constants:

```ts
export const TOOL_OUTPUT_MAX_CHARS = 4_000
export const MESSAGE_MAX_CHARS = 20_000
```

In `packages/core/src/tool/plugin/session.ts`, extend the existing import on line 8:

```ts
import { MESSAGE_MAX_CHARS, SessionTranscript, TOOL_OUTPUT_MAX_CHARS } from "../../session/transcript.js"
```

Next to the `timestamp` helper, add:

```ts
const messageLimit = MESSAGE_MAX_CHARS.toLocaleString("en-US")
const toolOutputLimit = TOOL_OUTPUT_MAX_CHARS.toLocaleString("en-US")
```

Replace the search hint (line 109) with:

```ts
`Use session_read with a message ID to read the stored message, bounded to ${messageLimit} characters. Stored tool outputs are rendered up to ${toolOutputLimit} characters.`,
```

Replace the read description (line 118) with:

```ts
`Read one completed message from this session's transcript, bounded to ${messageLimit} characters. Optionally include a few neighboring messages for context.`,
```

- [ ] **Step 4: Run the test and confirm it passes**

Run from `packages/core`:

```bash
bun test test/tool-session.test.ts
```

Expected: PASS, including the new assertions.

- [ ] **Step 5: Typecheck the package**

Run from `packages/core`:

```bash
bun typecheck
```

Expected: exit 0.

- [ ] **Step 6: Commit only the three files**

```bash
git add packages/core/src/session/transcript.ts packages/core/src/tool/plugin/session.ts packages/core/test/tool-session.test.ts
git commit -m "fix(core): disclose transcript rendering bounds in session tool copy"
```

Expected: one commit; `git status` shows no new staged changes from this task.
