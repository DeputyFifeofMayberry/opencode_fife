# Testing Report: Document Dialog Open and Size

- **Spec:** `.opencode/specs/2026-11-05-document-dialog-open-and-size.md`, revision 1, approved 2026-11-05.
- **Stage:** Independent testing, authorized 2026-11-05. No correction stage opened.
- **Base:** `dev` at `edab3236fb`, worktree `Y:\CodingProjects\opencode_fife`.
- **Implementation:** uncommitted working tree. Tracked edits: `packages/util/src/open.ts`, `packages/tui/src/ui/dialog.tsx`, `packages/tui/src/component/dialog-document.tsx`. New tests: `packages/util/src/open-path.test.ts`, `packages/tui/test/component/dialog-document.test.tsx`.
- **Environment:** Windows, Bun 1.4.4 (38afee6c8), tests run from package directories.
- **Overall result:** Automated AC-01 through AC-04 pass. AC-05 (manual live TUI) is **Not Run**. No blocking automated failure. Overall is **Blocked/Incomplete** only because AC-05 requires an interactive live check.

## Coverage map

| AC | Requirements | Verification | Result |
|---|---|---|---|
| AC-01 | R-01, R-02 | `packages/tui/test/component/dialog-document.test.tsx`; independent scratch mount with stricter open/stay-open assertions | **Passed** |
| AC-02 | R-03 | `packages/util/src/open-path.test.ts`; source inspection of `open.ts`; full util suite including `open.test.ts` | **Passed** |
| AC-03 | R-04 | `dialog-document.test.tsx` size test; independent scratch measurement of panel geometry and `FilePath` | **Passed** |
| AC-04 | R-05, R-06 | `dialog-error-details.test.tsx` at 40 and 100; independent `large`/`xlarge`/`medium` measurement; store-reset check; full util and TUI suites; `bun run check` | **Passed** for the primitive and existing dialog; full TUI suite has 5 pre-existing failures (see below) |
| AC-05 | R-01, R-02 | Manual live TUI | **Not Run** |

## AC-01 — shortcut, visible outcome, dialog stays open, copy

Command (from `packages/tui`):

```
bun test --timeout 30000 test/component/dialog-document.test.tsx test/component/dialog-error-details.test.tsx
```

Result: **5 pass, 0 fail, 31 expect calls, 739 ms** (3 tests in `dialog-document.test.tsx`, 2 in `dialog-error-details.test.tsx`).

The new test asserts:

- pressing `o` calls the stubbed `openPath` with the document path (`opened[0] === file`);
- the success toast has `variant: "success"` and a message containing `document.md`, and the frame contains `Opened document.md`;
- pressing `c` writes the path to the clipboard;
- with the stub rejecting, the error toast has `variant: "error"` and a message containing `launcher exploded`, and the frame contains it.

Independent scratch mount (temporary file, removed after the run) added stricter checks:

- exactly one opener call (`opened` equals `[file]`) after the success toast and content checks;
- the dialog panel is still present and the document body (`Hello`) is still visible after success and after the error;
- `c` still copies the exact path after the success toast.

Result: **Passed**.

## AC-02 — `openPath` failure surfacing

Command (from `packages/util`):

```
bun test src/open-path.test.ts
```

Result: **3 pass, 0 fail, 4 expect calls, 7 ms**.

The test asserts:

- `exitCode: 1` rejects with `Failed to open C:/missing/file.md (exit code 1)`;
- `exitCode: 0` resolves;
- `exitCode: null` resolves (the macOS/Linux path).

Source inspection of `packages/util/src/open.ts`:

- `openUrl` is unchanged.
- `openPath` awaits the launcher, throws only when `exitCode` is a number and non-zero, and returns the subprocess otherwise.
- Existing callers `packages/tui/src/app.tsx:1211` and `packages/tui/src/ui/working-directory-actions.tsx:42` still attach `.catch(toast.error)`; `dialog-document.tsx` attaches `.then(...).catch(...)`.
- The existing `openUrl` rejection tests in `packages/util/src/open.test.ts` pass in the full util suite.

Result: **Passed**.

## AC-03 — 75% size, fit, reflow, `FilePath`

Command (from `packages/tui`):

```
bun test --timeout 30000 test/component/dialog-document.test.tsx
```

Result: **3 pass, 0 fail** (part of the 5-pass run above).

Independent scratch measurement (temporary file, removed after the run) observed the actual panel:

| Terminal | Panel width | Panel height | Position | `FilePath` cells |
|---|---|---|---|---|
| 100×30 | **75** | **23** | x=13, y=4 (centred) | **69** |
| 60×20 | **58** | **16** | x=1, y=2 (centred) | 52 |
| 100×30 after resize | **75** | **23** | x=13, y=4 | 69 |
| 40×24 | 38 | 20 | — | — |

At 100×30 the required band is 75 ± 2 columns (observed 75) and 22 ± 3 rows (observed 23). At 60×20 the width is at least 58 (observed 58) and the panel fits within 20 rows (observed 16). Resizing reflows to the new dimensions and back. The `FilePath` line at 100×30 is 69 cells, not truncated to 60; the basename `document.md` is preserved.

Result: **Passed**.

## AC-04 — additive primitive and non-regression

- `packages/tui/test/component/dialog-error-details.test.tsx` is unmodified and its two tests at 40 and 100 columns pass unchanged.
- Independent measurement at 140×40: `large` = **88**, `xlarge` = **116**, `medium` = **60**; `dialogWidth` still returns 60/88/116.
- The store width override is **105** while `DialogDocument` is open, and becomes `undefined` after both `dialog.replace(...)` and `dialog.clear()`. A subsequent `medium` dialog renders at 60.
- `Dialog` uses `props.width ?? dialogWidth(props.size ?? "medium")`, so existing callers are unchanged; `id="dialog-panel"` is additive and visually inert.

Full suites:

- `packages/util`: `bun test` — **170 pass, 1 skip, 0 fail**, 410 expect calls, 171 tests across 24 files, 1.17 s.
- `packages/tui`: `bun run test` (the package script: `bun test --timeout 30000 --only-failures`) — **1715 pass, 16 skip, 5 fail**, 2 snapshots, 112,618 expect calls, 1736 tests across 206 files, 169.04 s. This run included a temporary scratch test of mine (3 passing tests); excluding it, the implementation's suite is **1712 pass, 16 skip, 5 fail across 205 files**. The scratch file was removed after the run.

The five failures are all in the implementer's pre-existing list:

1. `test/new-session-id.test.tsx` — "a failed first create keeps the launch session ID for the retry" (frame predicate timeout).
2. `test/session-panel.test.tsx` — "narrow terminals show the panel full screen, then compact, and dock again without remounting" (footer regex).
3. `test/component/go-upsell-art.test.tsx` — "the art stops every frame when hidden, closed, or still, and leaves nothing live after repeated opens" (art mismatch).
4. `test/cli/tui/diff-viewer.test.tsx` — "compact gutter help leaves the full patch viewport available when the sidebar is hidden" (footer regex).
5. `test/cli/tui/diff-viewer.test.tsx` — "full screen keeps its tree down to 88 columns and uses the compact layout below" (footer regex).

The implementer's list has seven; the two `dialog-shell-output.test.tsx` timeouts passed in this run, so the observed five are a subset of the known pre-existing failures. None involves `dialog-document.tsx`, `open.ts`, or the `Dialog` width override. The failure modes are footer regex mismatches, an art rendering mismatch, and a session-creation frame timeout in untouched areas.

`bun run check` from the repo root: **Passed**. oxlint reported 0 errors and 1,348 warnings; sdk-docs reported 0 problems; the ast-grep scan reported one `help[unused-suppression]` in the untouched `packages/util/src/cross-spawn-spawner.ts` (not an error); `bun turbo typecheck` completed 36/36 tasks successfully with no type errors, including `@opencode/util` (76 files) and `@opencode/tui` (1,917 files across 2 projects).

Result: **Passed** for the primitive and existing dialogs; the full TUI suite is not green, but the failures are pre-existing and unrelated (baseline reproduction recorded below).

## AC-05 — manual live TUI

**Not Run.** The check requires an interactive live TUI and opening real `.md` and `.tsx` files in the OS default application. Starting `dev:live` would target the currently elected background server and the shared `dev` TUI storage channel, and opening files would affect the user's desktop; no coordination for that was provided. The user needs to run the live check (open a `.md` and a `.tsx`, press `o`, confirm both open and the toast names the file, resize the terminal) or explicitly authorize an isolated live run.

## Baseline reproduction of the five failures

Procedure:

1. `git stash push -- packages/tui/src/component/dialog-document.tsx packages/tui/src/ui/dialog.tsx packages/util/src/open.ts` from the repo root (the three tracked source edits).
2. From `packages/tui`: `bun test --timeout 30000 test/new-session-id.test.tsx test/session-panel.test.tsx test/component/go-upsell-art.test.tsx test/cli/tui/diff-viewer.test.tsx`.
3. `git stash pop`; `git status` confirmed the three modified files restored and the stash dropped.

Result with the source edits stashed: **118 pass, 5 fail, 1059 expect calls, 123 tests across 4 files, 24.98 s**. The same five failures reproduced with the same messages:

- `new-session-id.test.tsx` — "Timed out waiting for frame predicate after 20 passes" (frameId 23, cellsUpdated 0).
- `session-panel.test.tsx` — expected `/^escape close\s+\? see all$/`, received `escape close ... 4 files +4 -4  ? see all`.
- `go-upsell-art.test.tsx` — expected the art to contain `█▀▀▀ █▀▀█`, received the blank/partial art frame.
- `diff-viewer.test.tsx` compact — expected `/^  escape close\s+\? see all $/`, received `... 1 file +3 -3  ? see all`.
- `diff-viewer.test.tsx` full screen — same regex, received `... 3 files +9 -9  ? see all`.

This independently confirms the five failures predate the change and are unrelated to the document-dialog work. The implementer's two additional `dialog-shell-output.test.tsx` timeouts passed in this run, consistent with flaky timing rather than a deterministic regression.

## Gaps and risks

1. **AC-05 is unverified.** The live behavior (OS default application launch and success toast) remains a manual check.
2. **TUI component test uses `mock.module` without restoring it.** `packages/tui/test/component/dialog-document.test.tsx` registers a module mock at file scope and never calls `mock.restore()`. The repository's `unit-tests` skill says module mocks leak across files in the shared Bun process. The mock's `failure` variable is left set to `"launcher exploded"` after the first test, so any later test that calls the leaked `openPath` would reject. No current test does, so no failure was observed, but this is a latent order-dependent risk. The util test does restore in `afterAll`.
3. **Very small terminal heights.** At 40×24 the panel is 38×20 and fits. The spec's "never exceed the terminal bounds" and "minimum of 3 content rows" can conflict below roughly 11 rows because the narrow footer stacks to two rows. This was not exercised by the acceptance tests and is not a failure at the specified 60×20 size.
4. **`dialog.setCentered(true)` runs in the component body**, not in an effect or `onMount`. It works in the tests, but it is a render-time store write; no functional failure was observed.

## Test assets changed

- Temporary `packages/tui/test/component/dialog-document-scratch.test.tsx` was created for independent measurement and removed after the run. It is not part of the final tree.
- No production code or implementation test was modified by the Tester.

## What was not verified

- AC-05 live TUI behavior and the real OS application launch.
- The real `open@11.0.4` Windows launcher exit-code behavior; AC-02 verifies `openPath` against a mocked launcher result.
- Terminal heights below the specified 60×20 case.
