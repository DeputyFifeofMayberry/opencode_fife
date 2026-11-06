# Document Dialog: Working Open Shortcut and 75% Terminal Size

**Status:** Approved
**Revision:** 1
**Approval:** Revision 1 approved by user on 2026-11-05. Implementation authorized.

## 1. Objective

Clicking a `file://` link in the TUI opens `DialogDocument`, a markdown box that previews the referenced file. Two things are wrong with it:

1. The footer advertises `o` ("open in editor"), but pressing `o` appears to do nothing. The user confirmed that the neighbouring `c` (copy path) shortcut works, and that `o` opens a `.tsx` file in VSCodium but does not visibly open a `.md` file.
2. The box is too small to read comfortably. The user wants it expanded to roughly 75% of the terminal, as a starting point.

The outcome: `o` reliably opens the document and always tells the user what happened, and the box occupies about 75% of the terminal width and height, staying readable and within the terminal on small or resized windows.

## 2. Existing behavior and evidence

### 2.1 The dialog and its shortcuts

- The dialog is `packages/tui/src/component/dialog-document.tsx`. It is opened from a mouse click on a `file://` link at `packages/tui/src/app.tsx:1456-1464` (`dialog.replace(() => <DialogDocument path={fileURLToPath(url)} />)`), and from the `docs.open.last` command at `app.tsx:1195-1204`.
- The `o` bind is registered at `dialog-document.tsx:53` and calls `open` at line 41: `const open = () => void openPath(props.path).catch(toast.error)`.
- The footer hint at `dialog-document.tsx:68` is `{ title: "open in editor", key: "o", onTrigger: open }`.
- `openPath` is `packages/util/src/open.ts:10-12`: `return open(path)` from the `open` npm package, pinned at `11.0.4` in `packages/util/package.json:63`.

### 2.2 Why the shortcut looks dead

The keybinding works. The user confirmed `c` works in the same box. The same single-character modal-bind pattern is exercised by an existing passing test at `packages/tui/test/component/dialog-error-details.test.tsx:96-99`. A diagnostic mount of `DialogDocument` in the same harness (programmatic open and click-to-open) dispatched `o` and called the opener with the correct path.

The launch result is invisible:

- `openPath` calls `open(path)` without `wait`. On Windows, `open@11.0.4` resolves the promise **even when the launcher exits non-zero**. Observed: `open('C:/definitely-not-a-real-path-xyz/file.md')` resolved with `exitCode === 1` instead of rejecting. The `.catch(toast.error)` therefore never fires, so a failed launch produces no toast and no visible effect.
- A valid `.md` file does launch VSCodium from this machine (observed: `open('C:/Windows/Temp/opencode/open-test.md')` resolved `exitCode 0` and started VSCodium; the same call on `docs/research/cli-tui-update-review-2026-11-05.md` changed the VSCodium window title to that file). The user's `.md` case is therefore a launch that happens without visible confirmation, not a dead key.
- The dialog gives no success feedback at all. When the target application is already running, behind the terminal, or opens the file in an existing window, the user sees nothing change in the TUI.

### 2.3 Current size

- The shared `Dialog` panel takes a fixed width from `dialogWidth(size)` (`packages/tui/src/ui/dialog.tsx:24-34`): `medium` = 60, `large` = 88, `xlarge` = 116, clamped by `maxWidth={dimensions().width - 2}` (`dialog.tsx:80-81`).
- `DialogDocument` never calls `dialog.setSize(...)`, so it uses the default `medium` width of 60 columns.
- The panel has no height prop; its height is content-driven (`dialog.tsx:72-86`). `DialogDocument` caps its scroll area at `maxHeight={20}` (`dialog-document.tsx:104-110`), so the box is at most about 26 rows including chrome.
- The dialog is not centred: `Dialog` adds `paddingTop={dimensions().height / 4}` unless `centered` is set (`dialog.tsx:67`).
- The established idiom for a terminal-relative height already exists at `packages/tui/src/routes/session/dialog-execute.tsx:37,40-41`: compute a memo from `useTerminalDimensions()`, subtract about 6 rows of chrome, and call `dialog.setCentered(true)`.

## 3. Scope

### In scope

1. Make `o` produce a visible, reliable result: open the document and show a success toast, or show an error toast when the launch fails.
2. Fix `openPath` so a non-zero launcher exit is reported instead of silently resolved.
3. Expand `DialogDocument` to roughly 75% of the terminal width and height, centred, clamped to the terminal, and reactive to resize.
4. Extend the shared dialog primitive additively so other dialogs keep their current sizes.
5. Tests covering the shortcut, the failure path, and the size at two terminal sizes.

### Out of scope

1. Changing the `o` binding or adding a configurable keybind.
2. Changing the "open in editor" semantics to use `$VISUAL`/`$EDITOR`. `$VISUAL` and `$EDITOR` are unset on this machine, and the current intent is the OS default application.
3. Repairing Windows file associations. The `.md` association resolves to VSCodium through `UserChoiceLatest`; changing the user's registry is not part of this task.
4. Other dialogs' sizes, layouts, or keybinds.
5. The desktop/web app, the SDK, or any non-TUI surface.
6. Markdown rendering, syntax highlighting, or scrolling behaviour inside the dialog.

## 4. Requirements

**R-01. Shortcut preserved.** `o` must remain the binding shown in the footer and must invoke the opener with the dialog's document path. The binding text and the footer label must stay consistent. `c` must continue to copy the path.

**R-02. Visible outcome.** Pressing `o` must always produce a visible result in the TUI:

- When the opener resolves, show a success toast that names the document (for example, its basename) and confirms the launch.
- When the opener rejects, show an error toast that includes the failure reason.
- The dialog must not close on success; the user keeps reading the preview.

The toast must use the existing `useToast()` API (`packages/tui/src/ui/toast.tsx:166-178`). The exact wording is the Implementer's choice; it must contain the document's basename on success and the underlying error message on failure.

**R-03. Failure surfacing in `openPath`.** `packages/util/src/open.ts` must reject when the platform launcher reports a non-zero exit code, instead of resolving silently. The check must tolerate platforms where the exit code is unavailable (the `open` package resolves before the child exits on macOS and Linux, leaving `exitCode` null); in that case the current resolve behavior must be preserved. `openUrl` must not change. Existing callers at `packages/tui/src/app.tsx:1211` and `packages/tui/src/ui/working-directory-actions.tsx:42` already attach `.catch(toast.error)` and must keep working.

**R-04. Dialog size.** `DialogDocument` must occupy approximately 75% of the terminal:

- Width: `min(terminalWidth - 2, max(dialogWidth("medium"), floor(terminalWidth * 0.75)))`. The `dialogWidth("medium")` floor prevents a regression on narrow terminals, where 75% would be smaller than today's box.
- Height: a fixed scroll-area height derived from `floor(terminalHeight * 0.75)` minus the dialog's chrome (header, footer, gaps, padding; about 6 rows, following `dialog-execute.tsx:37`). The box must be consistently tall even for short documents, so use a fixed height rather than a maximum.
- The dialog must be centred (`dialog.setCentered(true)`) so a 75%-tall panel fits in the terminal.
- The `FilePath` line at `dialog-document.tsx:94-98` must use the actual panel width, not `dialogWidth(dialog.size)`, so the path is not truncated to the old 60-column box.
- The size must recompute reactively when the terminal is resized while the dialog is open.
- The panel must never exceed the terminal bounds; on very small terminals, clamp to `terminalWidth - 2` and a minimum of 3 content rows.

**R-05. Additive primitive change.** The panel width is owned by the shared `Dialog` component (`packages/tui/src/ui/dialog.tsx:80`), and the provider stores one `size` for the whole stack (`dialog.tsx:306-315`). The change must extend that primitive additively, with defaults that preserve the current behaviour for every other dialog. Adding a new `DialogSize` tier is acceptable only if `dialogWidth` remains meaningful for all existing callers, which include `dialog-select.tsx`, `dialog-open.tsx`, `dialog-execute.tsx`, `dialog-workspaces.tsx`, `dialog-error-details.tsx`, and `dialog-workspace-file-changes.tsx`.

**R-06. Non-regression.** Other dialogs must keep their current widths, heights, and centring. The existing `dialog-error-details` layout test at 40 and 100 columns must still pass. `bun test` in `packages/tui` and `packages/util` must pass. `bun run check` must pass, or any failure must be demonstrated pre-existing and unrelated.

## 5. Acceptance criteria

**AC-01 (R-01, R-02).** In a component test that mounts `DialogDocument` with a stubbed `@opencode/util/open`:

- Pressing `o` calls the stubbed opener exactly once with the document path and shows a success toast containing the document's basename.
- With the stub rejecting, pressing `o` shows an error toast containing the rejection message.
- Pressing `c` still copies the path.

**AC-02 (R-03).** A unit test for `openPath` asserts that it rejects when the subprocess reports `exitCode: 1`, resolves when `exitCode` is `0`, and resolves when `exitCode` is `null` (the non-Windows path). `openUrl` keeps its existing accept/reject behaviour.

**AC-03 (R-04).** In a component test at 100×30, the rendered dialog is 75 ± 2 columns wide and 22 ± 3 rows tall (75% of 30). At 60×20, the width is at least 58 columns (the current medium width clamped to the terminal) and the panel fits within 20 rows. Resizing the test renderer reflows the dialog to the new dimensions. The `FilePath` line is not truncated to 60 columns at 100×30.

**AC-04 (R-05, R-06).** The existing `dialog-error-details` test at 40 and 100 columns passes unchanged. A representative second dialog that uses `large` or `xlarge` renders at its current width. `bun test` in `packages/tui` and `packages/util` passes, and `bun run check` passes or its failure is shown to predate the change.

**AC-05 (manual, R-01, R-02).** In the live TUI, open a `.md` document and a `.tsx` document, press `o`, and confirm both open in the OS default application and show the success toast. Confirm the toast names the correct file. Confirm the box is visibly larger than before and remains readable after resizing the terminal.

## 6. Constraints and decisions

- **Base and worktree.** Work continues in `Y:/CodingProjects/opencode_fife` on `dev` at `edab3236fb`, which matches `origin/dev`. The tree is clean apart from the untracked `docs/research/cli-tui-update-review-2026-11-05.md`, which must be preserved. The other worktree (`harness-optimization`) belongs to another session and must not be touched.
- **Installed build.** The installed `dev` CLI is 6 commits behind `dev` (`03388ed5e21a`), but `dialog-document.tsx` and `open.ts` are unchanged between the installed commit and `HEAD`, so the reported behaviour is not a stale-build artifact. Do not reinstall unless the user asks.
- **Toast on success is a proposed remedy.** The user asked for the shortcut to work; the evidence shows the launch can succeed without visible confirmation. A success toast is the smallest change that makes the outcome observable. If the user prefers no success toast, R-02 can be reduced to the error path at approval time.
- **Windows launcher behaviour.** `open@11.0.4` uses PowerShell `Start` on Windows and resolves on child close. The exit-code check in R-03 is the only reliable signal available without changing the opener.
- **Residual risk.** If the target application opens the file in an already-running window and does not raise it, the toast is the only in-app confirmation. Bringing another application's window to the foreground is out of scope.

## 7. Execution record

| Stage | Authorization | State | Evidence | Next owner |
|---|---|---|---|---|
| Specification | — | Approved, revision 1 | This document | — |
| Implementation | Authorized 2026-11-05 | Complete (automated checks passed; AC-05 not run) | `.opencode/reports/implementation/2026-11-05-document-dialog-open-and-size.md` | Tester |
| Testing | Authorized 2026-11-05 | Complete: AC-01–AC-04 passed; AC-05 not run; full TUI suite has 5 pre-existing failures confirmed on baseline; root check passed | `.opencode/reports/testing/2026-11-05-document-dialog-open-and-size.md` | — |
| Correction 1 | Authorized 2026-11-05 | In progress | Tester finding: `dialog-document.test.tsx` leaves `mock.module` unrestored | Implementer |
| QA | Not authorized | Not started | — | QA |

Correction cycles used: 0 of 2.
