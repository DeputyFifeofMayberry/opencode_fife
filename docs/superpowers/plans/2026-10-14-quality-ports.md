# Quality ports (upstream #53370, #53233, #55398, #54677, #54612, #54503 + diff footer aggregate) Implementation Plan

**Goal:** Land five upstream improvements and one fork feature into this fork via one PR into `dev`, then flow `dev` into `main`. Also verify the zai usage sidebar (merged to `main` earlier today) actually works live.

**Architecture:** All port work happens in the `dev` worktree (`Y:\opencode_fife_dev`) on a new branch `quality-ports` cut from `dev`. Cherry-picks come from `upstream refs/pull/<N>/head`. #54503 cannot cherry-pick: upstream deleted `packages/opencode` (verified: `git ls-tree upstream/dev packages/opencode` is empty), so its tool-timeout feature is re-implemented on the current `packages/core` layout, carrying `tool/timeout.ts` near-verbatim. The diff footer aggregate is original fork work in `packages/tui/src/feature-plugins/system/diff-viewer.tsx`. The PR merges with a merge commit (no squash, preserves upstream authorship), then `main` gets `git merge dev` with the usual stash dance.

**Tech Stack:** Bun, Effect (v4-style generators), turbo, GitHub MCP tools for PR create/merge.

**Upstream references:**
- #53370 `fix(core): disable tool calls in compaction summaries` (+7/-2, compaction.ts)
- #53233 `fix(core): honor compaction retained-text budget` (+6/-7 compaction.ts + tests)
- #55398 `fix(core): sanitize echoed control tokens before model requests` (+142, model-request.ts + test)
- #54677 `feat(tui): show git working tree status in session sidebar` (+314, 9 files, protocol change)
- #54612 `fix(ai): split inline chain-of-thought into a reasoning part` (+251/-7, 9 files)
- #54503 `feat(opencode): end every tool call that runs past a time limit` (23 files, upstream paths deleted here)

**Path verification done at planning time (all exist in this fork):**
`packages/core/src/session/compaction.ts`, `model-request.ts`, `packages/core/test/session-compaction.test.ts`, `test/session-runner.test.ts`, `test/config/compaction.test.ts`, `test/session-model-request.test.ts` (fork also has `test/session-model-request-hooks.test.ts`), `packages/ai/src/protocols/openai-chat.ts`, `packages/ai/src/schema/options.ts`, `packages/core/src/model.ts`, `models-dev.ts`, `modal/models.ts`, `v1/config/provider.ts`, `v1/config/mcp.ts`, `schema/model.ts`, `schema/src/vcs.ts`, `core/src/plugin/vcs/git.ts`, `protocol/openapi.json`, `tui/src/feature-plugins/sidebar/`, `tui/src/plugin/builtins.ts`.
`packages/opencode/**` does NOT exist here; upstream's tool registry and session tools now live under `packages/core/src/tool/plugin/*` and `packages/core/src/session*`.

## Global Constraints

- Bun is not on PATH: prefix every shell with `$env:PATH = "C:\Users\barne\.bun\bin;$env:PATH"`.
- Never run git in both worktrees concurrently (shared `.git`); this plan runs git in `Y:\opencode_fife_dev` until Task 9, then `Y:\opencode_fife`, sequentially.
- Merge-only: no rebase, no `reset --hard`, no force-push, no squash merges.
- Never kill `opencode.exe`, write into `packages/cli/dist/`, or touch port 4096. No binary build in this plan.
- Tests run from package directories (`packages/core`, `packages/ai`, `packages/tui`), never repo root. `bun run check` from root is allowed (lint+typecheck, not tests).
- After changing `packages/protocol/openapi.json` or Server `HttpApi`, run `bun run generate` from the repo root. Never hand-edit generated files.
- Conventional commit titles; branch name `quality-ports`.
- Cherry-picks must keep upstream authorship (merge commit PR, `cherry picked from` notes survive in commit bodies).
- TDD for all original code (Task 6 re-implementation, Task 7 footer feature): failing test first, watch it fail, minimal code to green. Cherry-picks carry their own upstream tests; run them as the gate.

## Review Focus

1. **model-request.ts decline-recovery collision (Task 3):** the sanitize step from #55398 must coexist with the fork's decline-recovery shape (ConfigHooks.HaltError in the type predicate/instanceof chain). The conflict resolution must not drop either.
2. **Compaction semantics stacking (Task 2):** #53370 (no tool calls in summaries) and #53233 (retained-text budget) both edit `compaction.ts`; the second pick resolves against the first. Both behaviors must survive: summaries tool-free AND budget honored.
3. **Generated files (Task 4):** after #54677, `bun run generate` output must match the picked generated files; a diff there means hand-edited generated code.
4. **models-dev churn (Task 5):** #54612 touches `models-dev.ts` where upstream moves fast; resolution keeps the fork's current snapshot + the PR's logic change.
5. **Timeout re-implementation scope (Task 6):** behavior parity with #54503's user-visible contract (config key, per-tool time limit, tool call ended past limit) on the new layout; no global fetch/stream changes beyond the timeout module.

---

### Task 1: Preflight, publish dev, cut branch

**Files:** none (git only)

- [ ] **Step 1: Verify dev worktree is clean and current**

Run in `Y:\opencode_fife_dev`:
```pwsh
git status --short --branch
git rev-list --left-right --count dev...upstream/dev
```
Expected: no dirty files; `0` behind upstream on the right side. If behind, stop and run the sync skill first.

- [ ] **Step 2: Push any unpushed local dev commits**

Run `git push origin dev`. If rejected, `git fetch origin && git merge origin/dev` and re-push. Report anything pushed that is user work.

- [ ] **Step 3: Cut the branch and fetch PR heads**

```pwsh
git checkout -b quality-ports
git fetch upstream refs/pull/53370/head refs/pull/53233/head refs/pull/55398/head refs/pull/54677/head refs/pull/54612/head refs/pull/54503/head
```
Expected: branch created; six FETCH_HEAD results (record each PR's head SHA via `git rev-parse FETCH_HEAD` after each fetch or use `git ls-remote upstream "refs/pull/N/head"`).

### Task 2: Compaction hygiene (#53370 then #53233)

- [ ] **Step 1: Cherry-pick #53370** (`git cherry-pick <sha53370>`). Expect clean.
- [ ] **Step 2: Cherry-pick #53233.** Expect a conflict in `packages/core/src/session/compaction.ts`; resolve keeping both behaviors (no tool calls in summaries; budget honored). Verify `git grep '<<<<<<<'` is empty.
- [ ] **Step 3: Run tests** from `packages/core`:
```pwsh
bun test test/session-compaction.test.ts test/session-runner.test.ts test/config/compaction.test.ts
```
Expected: all pass.
- [ ] **Step 4: Commit** any conflict resolution (`git cherry-pick --continue`). Commit titles come from the picks.

### Task 3: Control-token sanitize (#55398)

- [ ] **Step 1: Cherry-pick #55398.** Expect conflict in `packages/core/src/session/model-request.ts` against fork decline-recovery code; resolve preserving BOTH. Same for the test file if it conflicts.
- [ ] **Step 2: Verify** `git grep '<<<<<<<'` empty; read the resolved `model-request.ts` decline-recovery hunk to confirm ConfigHooks.HaltError handling survived.
- [ ] **Step 3: Run tests** from `packages/core`:
```pwsh
bun test test/session-model-request.test.ts test/session-model-request-hooks.test.ts
```
Expected: all pass.

### Task 4: Sidebar git status (#54677)

- [ ] **Step 1: Cherry-pick #54677.** Resolve conflicts if any (schema/vcs, protocol openapi, client generated types likely conflict with local state).
- [ ] **Step 2: Regenerate:** `bun run generate` from repo root (dev worktree). Expected: no diff beyond the pick (if diff appears, generated files were hand-edited upstream; keep the regenerated output).
- [ ] **Step 3: Run tests:** from `packages/core` `bun test test/vcs.test.ts`; from `packages/schema` `bun test test/vcs.test.ts`; from `packages/tui` `bun test test/feature-plugins/sidebar-git.test.tsx`.
Expected: all pass.

### Task 5: CoT reasoning split (#54612)

- [ ] **Step 1: Cherry-pick #54612.** Watch `models-dev.ts` and snapshot conflicts; keep current snapshot data + PR logic.
- [ ] **Step 2: Run tests:** from `packages/ai` `bun test test/provider/openai-chat.test.ts`; from `packages/core` `bun test test/models.test.ts`.
Expected: all pass.

### Task 6: Tool time limits (#54503, re-implementation)

**Files:** new `packages/core/src/tool/timeout.ts` (carried from the PR, adapted); integration in the current tool/session layout; config keys in `packages/core/src/v1/config/` + `config/normalize.ts` + `schema/config.ts`; adapted `packages/core/test/tool/timeout.test.ts`.

- [ ] **Step 1: Read the PR diff** (`git show <sha54503>` saved to the workspace) and map each upstream file to its current location.
- [ ] **Step 2: TDD:** write `test/tool/timeout.test.ts` from the PR's tests adapted to the new module location; watch it fail; carry `tool/timeout.ts` in; watch tests pass.
- [ ] **Step 3: Wire integration points** (registry/session tools/config) using the PR as the spec; add config schema key(s) mirroring the PR's user-visible config surface; update `packages/web/src/content/docs/tools.mdx` timeout docs only if the fork carries web docs (skip if the path doesn't apply).
- [ ] **Step 4: Run tests:** from `packages/core`, the timeout tests plus `bun test test/tool-*.test.ts` glob against actual files.
Expected: all pass; `bun run check` clean for touched packages.

### Task 7: Diff footer aggregate (original feature)

**Files:** `packages/tui/src/feature-plugins/system/diff-viewer.tsx` (docked footer, `id="diff-footer"` row ~line 1112).

- [ ] **Step 1: TDD:** if a diff-viewer component test exists, extend it (aggregate renders N files +A −D with `theme.diff.text.added`/`theme.diff.text.removed`, dimmed when unfocused, hidden when no files). Watch fail. If no component test harness exists for this file, ledger a ruling and verify via `bun run dev:live` manual pass instead.
- [ ] **Step 2: Implement:** aggregate line in the footer row: `<N> files` muted, `+A` added-token, `−D` removed-token; DIM attributes when panel unfocused, matching HelpShortcut treatment.
- [ ] **Step 3: Verify:** tui typecheck (`bun typecheck` in packages/tui) + any new tests green; manual dev:live check of docked diff footer.

### Task 8: Full verification

- [ ] `bun run check` from `Y:\opencode_fife_dev` root. Expected: clean.
- [ ] Targeted suites re-run for core/ai/tui touched areas (the per-task commands).

### Task 9: Land it

- [ ] Push branch `git push origin quality-ports`.
- [ ] Create PR `quality-ports` → `dev` (body lists the six upstream sources + the footer feature; conventional title e.g. `feat: port upstream quality picks and diff footer aggregate`).
- [ ] Merge PR (merge commit, no squash) via GitHub MCP.
- [ ] In `Y:\opencode_fife_dev`: checkout dev, merge origin/dev, push.
- [ ] In `Y:\opencode_fife` (main, has deliberate dirty files): `git stash push -u -m "windows-dev-wip pre-quality-ports"` → `git merge dev` (resolve: keep fork features + dirty-file intent) → `git stash pop` → push origin main. Leave stash changes uncommitted.

### Task 10: Zai usage live verification (independent)

- [ ] `OPENCODE_STORY=sidebar-usage bun run dev:live` from the dev worktree; walk story states (ok / no_plan / not_signed_in / key_rejected / rate_limited / unavailable) via keybindings.
- [ ] Real session on `zai-coding-plan` with `experimental.zai_usage: true`: sidebar shows plan label, 5h/Week percentages, resets countdown; >90% renders warning color.
- [ ] Optional: probe elected server `provider.usage` endpoint read-only with `opencode service get password`.
