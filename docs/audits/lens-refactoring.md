# Lens: Refactoring Opportunities — opencode_fife

**Date:** 2026-10-28 · **Scope:** full repo, prioritized per codemap risk hotspots
**Method:** structural reads of the giant files, grep for cross-file duplication and dead-code candidates, cross-referenced against `.audit/static-analysis.md` (1,579 non-blocking warnings) and package AGENTS.md conventions. This lens DETECTS only; nothing was modified.
**Headline:** the repo is in good structural health overall (clean layering, strong anti-slop lint culture, well-factored `tui/src/mini/` cluster). The debt is concentrated in (a) a handful of giant UI route/component files in `tui`/`session-ui`/`app`, (b) a small set of genuinely triplicated parsing helpers across packages, and (c) a mechanical lint-drift cluster in `app/src/new-session/`. Dead code is scarce — one confirmed unused module and one aspirationally-deprecated API.

---

## packages/tui/src/routes/session (session route — largest file in repo)

### Opportunity: Split the 3,820-line session route into session/tool/parse modules
- **Location:** `packages/tui/src/routes/session/index.tsx:147-3820`
- **What:** Classic god file. The `Session` route component alone spans lines 147–1670 (~1,520 lines, dozens of `createMemo`/`createEffect` bindings). Below it sit ~45 sibling components in one file: message renderers (`SessionMessageView`, `UserMessage`, `AssistantFooter`, `CompactionMessage`, `RevertMessage`, `ShellMessage`, …, lines 1671–2730), tool renderers (`Shell`, `Write`, `Glob`, `Read`, `Grep`, `WebFetch`, `WebSearch`, `Subagent`, `Execute`, `Edit`, `ApplyPatch`, `TodoWrite`, `Question`, `Skill`, `GenericTool`/`InlineTool`/`BlockTool`, lines 2731–3697), and unknown-payload parsing helpers (lines 3724–3820). Three distinct responsibilities share one file.
- **Suggested approach:** Split mirroring patterns the repo already uses elsewhere: `routes/session/message.tsx` (message-type views), `routes/session/tool.tsx` (tool views), `routes/session/parse.ts` (the exported `parse*` helpers). The parse helpers are already exported and tested (`packages/tui/test/cli/tui/inline-tool-wrap-snapshot.test.tsx:7-13` imports them from the route file) — moving them to `tui/src/util/` also removes a test-only-export smell (the repo's app rule explicitly forbids test-only exports; these are used by tests only outside the file).
- **Estimated complexity:** high (big surface, but the snapshot suite `inline-tool-wrap-snapshot.test.tsx` is a ready-made safety net)
- **Category:** refactoring

### Opportunity: Consolidate duplicated unknown-value parsing helpers across four packages
- **Location:** `packages/tui/src/routes/session/index.tsx:3724-3731` (`stringValue`, `recordValue`), `packages/tui/src/util/tool-display.ts:8` (`finiteNumber`), `packages/cli/src/acp/tool.ts:208` (`stringValue`), `packages/stats/core/src/domain/home.ts:341` (`stringValue`), `packages/stats/app/src/routes/model-catalog.ts:487` (`stringValue`)
- **What:** Five hand-rolled copies of the same 2–4 line boundary parsers (narrow `unknown` → string / record / finite number) in four packages. These also feed the 171 `no-runtime-typeof` lint warnings — the helpers exist precisely so call sites don't need raw `typeof` narrowing, but each package re-implements them locally.
- **Suggested approach:** One tiny module in `@opencode/util` (e.g. `util/src/boundary.ts`) exporting `stringValue`/`recordValue`/`finiteNumber`; all five packages already depend on util. This is reuse-driven, not speculative abstraction — the helpers already exist five times.
- **Estimated complexity:** low
- **Category:** refactoring (missing abstraction / consolidation)

---

## packages/tui/src/component (prompt, session-tabs)

### Opportunity: `Prompt` is a single ~1,860-line component
- **Location:** `packages/tui/src/component/prompt/index.tsx:186-2049`
- **What:** `export function Prompt` starts at line 186 and runs to end of file (~1,860 lines), binding 25+ hooks at the top (editor, keymap, history, stash, autocomplete, dialogs, toasts, clipboard, renderer metrics…) and mixing autocomplete/command-panel state, editor-selection context, keymap handling, and rendering. An in-file TODO at line 510 already notes "this should be its own command."
- **Suggested approach:** Incremental extraction following the precedent set by the recent "prompt history machine" commits (`2aaa8a…`, `89c5ef…` per codemap churn notes) and the `tui/src/mini/` precedent (`prompt.editor.ts`, `prompt.shared.ts`, `footer.*.tsx` are all focused modules). Candidates: editor-selection context block, slash-command/autocomplete controller, keymap dispatch table.
- **Estimated complexity:** high
- **Category:** refactoring (extraction)

### Opportunity: Vertical and horizontal session tabs duplicate interaction scaffolding
- **Location:** `packages/tui/src/component/session-tabs.tsx:542-1285` (`VerticalSessionTabs`, ~744 ln) vs `:1286-1801` (`HorizontalSessionTabs`, ~516 ln)
- **What:** Both variants independently re-create the same state machinery: drag-preview/`moveSessionTab` ordered memo (`:599-603` vs `:1333-1337`), `dragging`/`preview`/`contextMenu`/`addHovered` signals, `createTabMarquee` wiring, `newTab`/`activeID` memos, and identical color derivations (`unreadColor`/`activeNumber`/`idleNumber` at `:565-567` vs `:1328-1330`). Only the layout/drag-axis differs.
- **Suggested approach:** Extract a shared `createSessionTabInteractions(controller)` (drag-reorder preview, marquee, hover colors) consumed by both; keep the two render trees. Drag semantics differ (vertical Y-drag vs horizontal X-drag + close-hold), so extract conservatively — the shared hook should own state, not gestures.
- **Estimated complexity:** medium
- **Category:** refactoring (consolidation)

---

## packages/session-ui (tool renderer, v1/v2 duality)

### Opportunity: Split the 2,722-line tool renderer along its existing registry seams
- **Location:** `packages/session-ui/src/tools/tool-renderer.tsx:1152-1165` (registry infra), `:1471-2721` (14 inline `ToolRegistry.register` calls), `:402-1060` (three `Current*ToolGroup` timeline components, ~200-250 ln each)
- **What:** The file is a registry + every tool's renderer + three large timeline group components + display/error helpers in one module. The registry (`registerTool`/`getTool`/`ToolRegistry`) already supports modular registration — the file is large by choice, not necessity.
- **Suggested approach:** Move per-tool registrations into `tools/<name>.tsx` modules (read/list/grep/glob → one file-group; execute/console-output/execute-details at `:1851-2327` → `tools/execute.tsx`; the three `Current*ToolGroup` components → `tools/current-*.tsx`). Registry call order is the only coupling to preserve.
- **Estimated complexity:** medium
- **Category:** refactoring

### Opportunity: v1/v2 session-review component duality
- **Location:** `packages/session-ui/src/components/session-review.tsx` (v1, live: used by `gui-plugins/src/review/{panel,mobile,model}.ts` and e2e marker `[data-component="session-review"]`) vs `packages/session-ui/src/v2/components/session-review-v2.tsx` (+ 8 sibling `-v2` files; live: e2e `review.spec.ts` exercises both v1 (`:26`) and v2 sidebar/file markers (`:158,840`))
- **What:** Two parallel implementations of the session-review surface are both routed and tested. v2 already imports types from v1 (`session-review-v2.tsx:8`, `session-review-file-preview-v2.tsx:23`), so the boundary is leaking in one direction. Same pattern for progress indicator (`SessionProgressIndicatorV2` used by app titlebar while a v1 spinner presumably also exists).
- **Suggested approach:** First establish which tree is canonical (product decision, not code). Then either extract the shared types v2 consumes into a neutral module to cut the v2→v1 type dependency, or complete the migration and delete v1. Do not consolidate blindly — both are under active e2e coverage.
- **Estimated complexity:** medium (types extraction) / high (full migration)
- **Category:** refactoring (consolidation debt)

---

## Cross-package duplication (file-diff decoding)

### Opportunity: Three hand-rolled decoders for the same FileDiff record shape
- **Location:**
  - `packages/tui/src/routes/session/index.tsx:3764-3789` (`parseApplyPatchFiles`: manual `recordValue`/`stringValue`, maps `status`→`type` with the exact ternary `added→add / deleted→delete / modified→update`)
  - `packages/session-ui/src/components/apply-patch-file.ts:17-55` (`changedFileDiff`/`patchFile`/`patchFiles`: manual `in`-checks, same status→type mapping at `:41`)
  - `packages/util/src/patch.ts:101-119` (parses `*** Move to:` → `movePath` inside patch text — complementary level, but again owning `movePath` normalization)
- **What:** The same domain record (file, status, patch, additions, deletions, optional movePath/relativePath aliases) is validated and normalized three times by hand. Note the consumers get the payload as untyped tool metadata (`unknown`), which is why each UI re-rolls the decoder. The variants are NOT identical (tui tolerates `relativePath`/`filePath` aliases and status-derived types; session-ui requires `status` verbatim) — that drift is itself the smell.
- **Suggested approach:** One shared decoder for the `FileDiffInfo`-ish record. Dependency-safe home: `@opencode/util` (both tui and session-ui depend on it) or the non-generated `client` module where `FileDiffInfo` is already exported (`apply-patch-file.ts:1` imports the type from `@opencode/client/promise`). Reconcile the alias/tolerance differences deliberately before unifying — pick the superset.
- **Estimated complexity:** medium
- **Category:** refactoring (missing abstraction / consolidation)

### Opportunity: Parallel question/diagnostics decoding strategies (TUI manual vs session-ui Schema)
- **Location:** `packages/tui/src/routes/session/index.tsx:3791-3820` (`parseQuestions`/`parseQuestionAnswers`/`parseDiagnostics`, manual record walking) vs `packages/session-ui/src/tools/tool-renderer.tsx:111-187` (`optional(Schema…)`, `questions()`, `getDiagnostics()` — Effect Schema decoders with the same `severity === 1` filter and same `.slice(0, 3)` cap)
- **What:** The same tool metadata payload (question list, per-file diagnostics capped at 3 errors) is decoded two different ways in two packages — one by hand (feeding `no-runtime-typeof` warnings), one with Effect Schema. The Schema-based version is the repo-preferred idiom.
- **Suggested approach:** When consolidating the parse helpers (see session-route finding), adopt the Schema-decoder style for the shared module; tui can consume it via a util-level module since both packages depend on util/schema.
- **Estimated complexity:** medium
- **Category:** refactoring (consolidation)

---

## packages/core (shell/scan.ts, compaction.ts, misc)

### Opportunity: `shell/scan.ts` is two scanners in one 2,407-line file; one function is ~515 lines
- **Location:** `packages/core/src/shell/scan.ts` — bash scanner `:3-1728`, PowerShell scanner `:1729-end`; `scanPowerShellList` `:1740-2255` (~515 lines, longest single function found in the repo)
- **What:** Two independent state machines (bash/zsh/posix vs PowerShell) share only the exported `Result`/`Command`/`OpaqueReason` types (lines 3-27, 130-206). The PowerShell list scanner is a single function with an internal clause state machine despite per-construct helpers already existing below it (`powerShellEscape`, `powerShellBracedVariable`, `powerShellSubExpression`, `powerShellHereString`, `powerShellRedirect`, `:2265-2396`).
- **Suggested approach:** Mechanical first step: split into `shell/scan-bash.ts` + `shell/scan-powershell.ts` + a shared types module; `scan.ts` becomes a dispatcher. Second step (only with care): decompose `scanPowerShellList` along its existing `PowerShellClause` variants (`:1738`) into clause handlers. This is security-relevant code feeding permission prompts — verify against `core/test` shell scan coverage before and after; treat any parse-behavior-preserving constraint as hard.
- **Estimated complexity:** high (safety), mechanical in shape
- **Category:** refactoring (pre-existing structural weakness)

### Opportunity: Compaction estimation re-runs the runner's request-shaping passes (author-flagged)
- **Location:** `packages/core/src/session/compaction.ts:1155-1157` (TODO), duplicated pipeline at `:1158-1160` vs `:1140-1142`
- **What:** The repo author already flagged it: `estimatePrompt` re-runs `SessionModelRequest.boundImages(unsupportedParts(...))` — the same shaping `recentUserMessages` (`:1132-1144`) performs — and the TODO notes the image budget scope differs ("images since the anchor"), so image-heavy sessions can estimate high. Self-documented duplication with a behavioral caveat.
- **Suggested approach:** Extract a shared "shape messages for the model" helper owned by the session runner domain (`SessionModelRequest` area) parameterized by the image-budget scope, then have both call sites consume it. The scope difference must become an explicit parameter, not an accident.
- **Estimated complexity:** medium
- **Category:** refactoring (consolidation, self-flagged debt)

### Opportunity: Repeated "pending integration" TODO blocks in tool mutation plugins
- **Location:** `packages/core/src/tool/plugin/write.ts:43-45`, `packages/core/src/tool/plugin/edit.ts:204-206`, `packages/core/src/file-mutation.ts:129-134`
- **What:** The identical watcher-events / snapshots-undo / LSP-diagnostics TODO block is pasted in three files (file-mutation adds crash-recovery and multi-file-transaction notes). When the mutation side-effects design lands, it must be one shared service — the triplication is a preview of three divergent implementations.
- **Suggested approach:** No code change now; when implementing, land it as a single `FileMutation.SideEffects` service consumed by write/edit/file-mutation rather than per-file logic. Recorded so the future PR doesn't copy-paste a fourth time.
- **Estimated complexity:** n/a (future design constraint)
- **Category:** technical debt signal

### Opportunity: Deprecated `Bus.listen` still has ~20 live call sites — all in tests
- **Location:** `packages/core/src/bus.ts:166-167` (`@deprecated Use subscribe()`); consumers in `core/test/{vcs,session-skill,session-runner,session-owned,reference,plugin,plugin-failure,bus}.test.ts` (20+ occurrences)
- **What:** The deprecated callback-listener API is the de-facto test observation API. Either the deprecation is aspirational (tests never migrated) or the stream API is ergonomically worse for tests. A deprecated API kept alive solely by its own test suite is debt in both directions.
- **Suggested approach:** Migrate the test call sites to `bus.subscribe(...)` stream collectors (mechanical: `Stream.take(1)` patterns already appear in `core/test/bus.test.ts:138,212`), then delete `listen` from the Bus interface.
- **Estimated complexity:** low-medium (many call sites, mechanical)
- **Category:** dead code / deprecated-pattern cleanup

---

## packages/ai (provider protocols)

### Opportunity: `anthropic-messages.ts` mixes ~400 lines of wire schemas with protocol logic
- **Location:** `packages/ai/src/protocols/anthropic-messages.ts:37-~430` (Schema block) vs `:430+` (protocol implementation); author TODO at `:1032` ("Move per-model capability heuristics …")
- **What:** 1,713 lines where roughly a quarter is pure wire-schema declaration (`Anthropic*Block/Source/Union` structs) with no logic. The in-file TODO also flags capability heuristics (`supportsEffortUpdates`, `supportsNativeSystemUpdates`) as wanting a move.
- **Suggested approach:** Extract the schema block to `protocols/anthropic-messages-schema.ts` (mechanical, type-only impact) and address the `:1032` TODO by moving capability heuristics beside the other per-model capability code. Applies in principle to `openai-chat.ts` (1,410) / `open-responses.ts` (1,481) if their schema blocks are similarly large — verify per file before doing all three.
- **Estimated complexity:** medium (low risk, but touches provider tests)
- **Category:** refactoring

---

## packages/client (solid data layer)

### Opportunity: `createData` is a single ~1,820-line factory
- **Location:** `packages/client/src/solid/data.ts:260-~2080`
- **What:** One factory builds the entire client-side store (sessions, messages, files, projects, forms, permissions, pending) as one function body. Resource slices are interleaved; the exported `Data` type (`:2085`) is just `ReturnType<typeof createData>`.
- **Suggested approach:** Extract per-resource slice creators (`createSessionData`, `createFileData`, …) as internal functions returning their slice, composed by the factory. Behavior-preserving; the interdependencies (invalidation between slices) set the extraction order.
- **Estimated complexity:** high (hidden coupling between slices)
- **Category:** refactoring (extraction)

---

## packages/app (connect dialog, new-session lint cluster)

### Opportunity: `ProviderConnection` is a single ~1,320-line component
- **Location:** `packages/app/src/providers/connect/dialog.tsx:433-1751`
- **What:** After the small `DialogConnectProvider` (`:72-233`) and `ProviderPicker` (`:234-432`), one component owns the entire provider connect flow (auth, pagination of provider lists, per-provider forms, verification) for ~1,320 lines.
- **Suggested approach:** Split by flow phase (list → prepare → auth → verify) into child components or a state-machine hook, mirroring how `useProviderConnectController` (`:61`) already separates controller logic. App AGENTS.md requires a production benchmark baseline before touching timeline/session code — this is dialog code, but the Suspense-guard rules apply to any refactor here.
- **Estimated complexity:** high
- **Category:** refactoring

### Opportunity: Mechanical lint-drift paydown in the new-session decorative cluster
- **Location:** `packages/app/src/new-session/{pin-board.tsx (133 warnings, 927 ln), wordmark.tsx (103, 999 ln), brick-breaker.tsx (69), pin-quads.ts (36), pin-sound.ts (21)}` — 362 warnings; plus `app/src/runtime/persistence/drafts.ts` (50), `desktop/script/profile-by-source.ts` (39), `app/src/usage/{dialog,limits}.tsx` (54)
- **What:** The warnings are dominated by mechanical rules (`require-readable-spacing` 563, `require-safety-comment-for-type-assertion` 409 repo-wide). The new-session cluster is decorative canvas/physics code — the drift is process (written without lint in the loop), not architecture. Restructuring `pin-board.tsx`/`wordmark.tsx` is NOT recommended; the fix is style-level.
- **Suggested approach:** One batched cleanup: ast-grep auto-fix where safe, `SAFETY:` comments on the genuine pixel-math assertions, and deletion of the one stale directive (`packages/util/src/cross-spawn-spawner.ts:15` unused `ast-grep-ignore`). Consider whether these files justify the repo's documented-deliberate-exception path under the 800-line soft ceiling.
- **Estimated complexity:** low
- **Category:** refactoring (mechanical debt paydown)

---

## Deliberate exceptions — flagged but NOT recommended for change now

### Observation: codemode interpreter `Frame` class (~1,980 lines)
- **Location:** `packages/codemode/src/interpreter/interpreter.ts:379-~2357`
- **What:** The tree-walking evaluator is one class with dense private state (generator/async job machinery). Package AGENTS.md documents a deliberate architecture (`Value`/`Obj` subclasses, interpreter-support checklist). Splitting statement/expression evaluation is possible but would fight the design for modest gain.
- **Recommendation:** Accept as a justified exception to the 800-line soft ceiling; revisit only if the file keeps growing. 96-word version: leave it.
- **Category:** refactoring (monitored, no action)

### Observation: `plugin/src/gui/host-apis.ts` (2,050 lines) is declarative by role
- **Location:** `packages/plugin/src/gui/host-apis.ts` (60+ exported interfaces/types; verified mostly declarations)
- **What:** This is the plugin GUI API contract in one file. Size is inherent to the surface; splitting fragments the public import path for consumers.
- **Recommendation:** Accept; only regroup if a second implementation of the host API appears.
- **Category:** refactoring (accepted exception)

---

## Dead code candidates (verify before removal)

### Opportunity: `util/src/binary.ts` referenced only by its own test
- **Location:** `packages/util/src/binary.ts` (26-line `Binary` binary-search/insert namespace); sole reference found: `packages/util/src/binary.test.ts`
- **What:** Sweep of all 58 util modules found this one with zero imports from any package and zero intra-package imports (platform-conditional modules like `runtime/import.*` and `global-roots.*` were false positives — they resolve via package.json `imports` conditions; `observability/*` are imported internally).
- **Suggested approach:** Deleting is behavior-safe internally, BUT `@opencode/util` has `publishConfig.access: public` — removing an export is a public API change. Confirm no external consumer before removal, or deprecate first.
- **Estimated complexity:** low
- **Category:** dead code

### Opportunity: Minor suppression hygiene
- **Location:** `packages/core/src/filesystem/watcher.ts:3` (bare `@ts-ignore` on `@parcel/watcher/wrapper.js` import — should be `@ts-expect-error` or a local `.d.ts` so it fails loudly when types ship); `packages/util/src/cross-spawn-spawner.ts:15` (stale `ast-grep-ignore`, one-line delete). The `@ts-ignore`s in `core/src/database/sqlite.bun.ts:30,46` and `core/src/shell/parser-wasm.bun.ts:1-5` are documented with upstream links — leave.
- **Estimated complexity:** low
- **Category:** dead code / hygiene

---

## Lower-priority notes (outside the 10 focus packages)

### Opportunity: stats home route concentrates 40+ private helpers
- **Location:** `packages/stats/app/src/routes/index.tsx` (1,883 ln) — TopModels chart math cluster (`:782-870`: 10 pure helpers) is the natural first module extraction (`top-models-chart.ts`).
- **Estimated complexity:** low
- **Category:** refactoring

---

## Summary counts by area

| Area | Opportunities | Complexity mix |
|------|--------------|----------------|
| tui session route | 2 (split; scalar-helper consolidation) | high / low |
| tui components (prompt, tabs) | 2 (Prompt extraction; tabs interaction hook) | high / medium |
| session-ui | 2 (tool-renderer split; v1/v2 duality) | medium / medium-high |
| cross-package duplication | 2 (file-diff decoders; question/diagnostics decoders) | medium |
| core | 3 (scan.ts split; compaction shaping; Bus.listen migration) + 1 debt signal (TODO blocks) | high / medium / low-medium |
| ai | 1 (schema extraction) | medium |
| client | 1 (createData slices) | high |
| app | 2 (connect dialog split; lint-drift paydown) | high / low |
| dead code | 2 (util/binary.ts; suppression hygiene) | low |
| monitored exceptions | 2 (codemode Frame; plugin host-apis) | no action |
| lower priority | 1 (stats route) | low |

**Total: 18 actionable opportunities + 2 accepted exceptions + 1 debt signal.** Highest value-per-risk: the scalar-helper consolidation (low), lint-drift paydown (low), `Bus.listen` test migration (low-medium), and the file-diff decoder unification (medium). Largest structural wins: the tui session-route split, session-ui tool-renderer split, and scan.ts scanner separation — all high-complexity, all with existing test coverage to lean on.
