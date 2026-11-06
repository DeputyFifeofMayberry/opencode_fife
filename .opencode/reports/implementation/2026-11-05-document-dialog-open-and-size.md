# Implementation Report: Document Dialog Open and Size

- **Spec:** `.opencode/specs/2026-11-05-document-dialog-open-and-size.md`, revision 1, Approved 2026-11-05.
- **Stage:** Implementation (authorized 2026-11-05); correction cycle 1 (authorized 2026-11-05).
- **State:** Implemented; correction 1 applied; automated verification passed. AC-05 (manual live TUI) not run.
- **Base:** `dev` at `edab3236fb`, worktree `Y:/CodingProjects/opencode_fife`.
- **Next owner:** Spec Writer for independent re-test dispatch.

## Requirements

| ID | State | Evidence |
|---|---|---|
| R-01 | Implemented | `o` binding and footer label unchanged; opener receives `props.path`; `c` copies the path. Component test asserts the opener path and clipboard write. |
| R-02 | Implemented | Success toast `Opened <basename>` on resolve; `toast.error` on reject; dialog stays open. Component test asserts both toast variants, messages, and rendered text. |
| R-03 | Implemented | `openPath` rejects on numeric non-zero `exitCode`, resolves on `0` and `null`. Unit tests pass. |
| R-04 | Implemented | Width `min(width - 2, max(60, floor(width * 0.75)))`; fixed scroll height `max(3, floor(height * 0.75) - 6)`; `setCentered(true)`; `FilePath` uses panel width; reactive memos. Component test at 100x30 and 60x20 plus resize. |
| R-05 | Implemented | Additive `width` override on `Dialog` and the dialog store; `dialogWidth` unchanged for existing callers; `clear()`/`replace()` reset the override. |
| R-06 | Implemented | `dialog-error-details` test passes unchanged; new test asserts a `large` dialog still renders at 88 columns. |

## Changed paths

- `packages/util/src/open.ts` — `openPath` awaits the launcher and throws on a numeric non-zero exit code.
- `packages/util/src/open-path.test.ts` — new unit tests with `open` mocked.
- `packages/tui/src/ui/dialog.tsx` — additive `width` override, store reset, `id="dialog-panel"` for measurement.
- `packages/tui/src/component/dialog-document.tsx` — success/error toasts, 75% width/height, centred, reactive resize, `FilePath` width.
- `packages/tui/test/component/dialog-document.test.tsx` — new component tests (3 tests).

## Decisions

- Used a provider-level width override rather than a new `DialogSize` tier so `dialogWidth` keeps its existing meaning and every other dialog is untouched by default.
- Height uses the spec's 6-row chrome constant; the measured panel is within the 22 ± 3 acceptance band at 100x30.
- Added `id="dialog-panel"` to the shared panel for stable measurement; additive and visually inert.
- The AC-04 large-dialog test uses `large` (88 columns) rather than `xlarge` because `xlarge` (116) is clamped to 98 at 100 columns.

## Verification

| Check | Command | Status | Evidence |
|---|---|---|---|
| Util unit tests | `bun test src/open-path.test.ts src/open.test.ts` in `packages/util` | Passed | 5 pass, 0 fail, 10 expect calls |
| Util full suite | `bun test` in `packages/util` | Passed | 170 pass, 1 skip, 0 fail, 410 expect calls |
| Util typecheck | `bun typecheck` in `packages/util` | Passed | No type errors in 76 files |
| TUI new + regression tests | `bun test test/component/dialog-document.test.tsx test/component/dialog-error-details.test.tsx` in `packages/tui` | Passed | 5 pass, 0 fail, 31 expect calls |
| TUI typecheck | `bun typecheck` in `packages/tui` | Passed | No type errors in 1,917 files across 2 projects |
| TUI full suite | `bun test` in `packages/tui` | Failed (7 pre-existing, unrelated) | 1707 pass, 16 skip, 10 fail. 3 failures were the new test harness (eager JSX); fixed, targeted re-run passes. The other 7 reproduce on baseline. |
| Root check | `bun run check` from repo root | Passed | Lint 0 errors, 1348 warnings; typecheck 36/36 tasks successful; sdk-docs 0 problems |
| AC-05 live TUI | Manual | Not run | Requires an interactive live TUI; no reinstall authorized |

### Pre-existing TUI failures (confirmed on baseline)

With my three tracked source edits stashed and the same command run, the same 7 failures remained
(122 pass, 7 fail across the 5 files), confirming they predate this change:

- `test/new-session-id.test.tsx` — "a failed first create keeps the launch session ID for the retry" (frame predicate timeout).
- `test/session-panel.test.tsx` — "narrow terminals show the panel full screen, then compact, and dock again without remounting" (footer regex).
- `test/component/dialog-shell-output.test.tsx` — "shell output opens, follows, scrolls, and survives exit at %s columns" (2 timeouts).
- `test/component/go-upsell-art.test.tsx` — "the art stops every frame when hidden, closed, or still, and leaves nothing live after repeated opens" (art mismatch).
- `test/cli/tui/diff-viewer.test.tsx` — "compact gutter help leaves the full patch viewport available when the sidebar is hidden" and "full screen keeps its tree down to 88 columns and uses the compact layout below" (footer regex).

## Correction cycle 1

**Finding (Tester).** `packages/tui/test/component/dialog-document.test.tsx` registered
`mock.module("@opencode/util/open", ...)` at file scope and never restored it, so the mock could
leak into later test files in the shared Bun process. The file-scope `failure` variable was also
left set to `"launcher exploded"` after the first test.

**Change.** Added `afterAll(() => mock.restore())` and `beforeEach(() => { failure = undefined })`
to the test file, and removed the now-redundant in-test reset. No production code and no assertion
changed; the Tester's AC-01 through AC-04 verdicts stand.

**Verification.**

| Check | Command | Status | Evidence |
|---|---|---|---|
| Targeted TUI tests | `bun test --timeout 30000 test/component/dialog-document.test.tsx test/component/dialog-error-details.test.tsx` in `packages/tui` | Passed | 5 pass, 0 fail, 31 expect calls, 5 tests across 2 files, 12.45 s |
| TUI typecheck | `bun typecheck` in `packages/tui` | Passed | No type errors in 1,917 files across 2 projects, 7.40 s |

### AC-04 assertion

`packages/tui/test/component/dialog-document.test.tsx:183-194` contains
`test("other dialogs keep their size tier width", ...)`, mounts `OpenSized size="large"`, and asserts
`expect(panel()!.width).toBe(88)`. It is present and passed in the final targeted run.

## Gaps and risks

- AC-05 (live TUI, `.md` and `.tsx`) is manual and was not executed.
- On macOS/Linux the launcher resolves before the child exits, so `openPath` still resolves without confirmation; the success toast is the in-app confirmation, as specified.
