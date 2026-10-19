# Stability picks (upstream #55385, #55149, #54251) Implementation Plan

> Status 2026-10-14: EXECUTED AND MERGED. All tasks complete; PR #4 merged into `dev` (merge commit `3f389196c6`), `main` merged and pushed (`a9d3b695bf`), branch deleted. Final whole-branch review skipped by user decision. Rulings recorded in the session; workspace deleted.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land three upstream stability fixes into this fork (snapshot cross-process locking, TUI fetch deadline, retained execute results on interruption) via one PR into `dev`, then flow `dev` → `main`. No binary build.

**Architecture:** All work happens in the `dev` worktree (`Y:\opencode_fife_dev`) on a new branch `stability-picks` cut from `dev`. #55149 and #54251 cherry-pick cleanly from `upstream refs/pull/<N>/head`. #55385 cannot cherry-pick: upstream deleted `packages/opencode` (commit `44b6938b2a`) and relocated the snapshot module, so that fix is re-implemented on `packages/core/src/snapshot.ts` using the `EffectFlock` pattern already used by `packages/core/src/repository-cache.ts`. The PR merges with a merge commit (no squash, preserves upstream authorship), then `main` gets `git merge dev` with the usual stash dance.

**Tech Stack:** Bun, Effect (v4-style generators), turbo, GitHub MCP tools for PR create/merge.

**Spec:** Investigation summary in session (2026-10-14); no separate design doc. Upstream references:
- #55385 `fix(opencode): serialize snapshot git operations across processes` (head `099c5237`)
- #55149 `fix(tui): keep long-pending requests past Bun's fetch deadline` (head `7822a904`)
- #54251 `fix(core): retain completed execute results on interruption` (head `fe7984b8`)

## Global Constraints

- Bun is not on PATH: prefix every shell with `$env:PATH = "C:\Users\barne\.bun\bin;$env:PATH"`.
- Never run git in both worktrees concurrently (shared `.git`); this plan runs git in `Y:\opencode_fife_dev` until Task 7, then `Y:\opencode_fife`, sequentially.
- Merge-only: no rebase, no `reset --hard`, no force-push, no squash merges.
- Never kill `opencode.exe`, write into `packages/cli/dist/`, or touch port 4096. No binary build in this plan.
- Tests run from package directories (`packages/core`, `packages/codemode`, `packages/tui`), never repo root. `bun run check` from root is allowed (lint+typecheck, not tests).
- Conventional commit titles: `fix(core): ...` style. Branch name: `stability-picks`.
- Fork state at planning time: `dev` = `upstream/dev` + 7 fork commits, 0 behind; `dev` is 1 ahead of `origin/dev` (unpushed `3190a0db8c feat(core): auto-background blocking work`). That commit touches `session.ts`, `session/auto-background.ts`, `tool/plugin/shell.ts`, `tool/plugin/subagent.ts`, `config/normalize.ts`, `schema/config.ts` — no overlap with any file in the three picks.

## Review Focus

1. **Flock key collision:** the lock key must be exactly `snapshot:${gitDirectory}` so it cannot collide with `repository-cache`/`update` flock keys. Pinned in Task 2 Step 3 and re-read in Step 4.
2. **Windows flock behavior:** this fork runs on Windows; `EffectFlock` must be the same implementation `repository-cache.ts` already uses (proven on this fork), not a re-implementation. Pinned in Task 2 Step 2.
3. **Scope creep on no-timeout-fetch:** the unlimited deadline must apply only to the one long-pending call site `app.tsx` changes, not globally. Pinned by cherry-pick fidelity in Task 3 (no manual edits) plus typecheck.
4. **Session Core vocabulary:** #54251 must not introduce "provider turn"/in-memory tool loop wording or semantics; its own tests plus `session-*` suite pin this (Task 4 Step 3, Task 5 Step 2).
5. **Attribution loss:** cherry-picks must keep upstream authors; the adapted #55385 commit must carry a `(cherry picked from ...)` style note. Pinned in Task 2 Step 6 and Task 6 Step 2 (PR body lists sources).

---

### Task 1: Preflight, publish dev, cut branch

**Files:** none (git only)

**Interfaces:**
- Produces: branch `stability-picks` at `dev` HEAD; fetched PR head commits available as `FETCH_HEAD` targets for Tasks 2–4.

- [ ] **Step 1: Verify dev worktree is clean and current**

Run in `Y:\opencode_fife_dev`:
```pwsh
git status --short --branch
git rev-list --left-right --count dev...upstream/dev
```
Expected: no dirty files; `0` on the right side (not behind upstream). If behind, stop and run the sync skill first.

- [ ] **Step 2: Push the unpushed local commit**

Run: `git push origin dev`
Expected: push succeeds. This publishes `feat(core): auto-background blocking work` (`3190a0db8c`) — it is complete, conventional-commit shaped, and the sync routine pushes `dev` anyway, but it is user work: do not skip reporting it. If the push is rejected because `origin/dev` gained commits, `git fetch origin && git merge origin/dev` and re-push.

- [ ] **Step 3: Create the branch and pre-fetch PR heads**

Run:
```pwsh
git switch -c stability-picks
git fetch upstream refs/pull/55149/head
git fetch upstream refs/pull/54251/head
git fetch upstream refs/pull/55385/head
```
Expected: branch created; three fetches succeed (each leaves its tip in `FETCH_HEAD`; Task 2 re-fetches #55385 since only its diff is read, Tasks 3–4 re-fetch right before picking so `FETCH_HEAD` is fresh).

### Task 2: Adapt #55385 — cross-process snapshot flock

**Files:**
- Modify: `packages/core/src/snapshot.ts` (217 lines; the successor of the deleted `packages/opencode/src/snapshot/index.ts`)
- Test: `packages/core/test/snapshot.test.ts`

**Interfaces:**
- Consumes: `EffectFlock` service exactly as `packages/core/src/repository-cache.ts` imports and uses it.
- Produces: snapshot git mutations serialized across processes via `flock.withLock(effect, key)`; no exported-surface changes.

- [ ] **Step 1: Read the upstream diff and the target file**

Run:
```pwsh
git fetch upstream refs/pull/55385/head
git show FETCH_HEAD -- packages/opencode/src/snapshot/index.ts
```
Then read `packages/core/src/snapshot.ts` fully. The upstream fix wraps every snapshot git critical section in `EffectFlock.withLock` keyed `snapshot:${gitdir}`, adds `EffectFlock.Service` to the layer requirements and `EffectFlock.node` to `LayerNode` deps. The full upstream patch (15+/3−, for reference):

```ts
// imports
import { EffectFlock } from "@opencode-ai/core/util/effect-flock"   // use THIS fork's actual import path from repository-cache.ts
// layer requirements: add EffectFlock.Service
const flock = yield* EffectFlock.Service
// the guarded helper (upstream form):
const locked = <A, E, R>(fx: Effect.Effect<A, E, R>) =>
  lock(state.gitdir).withPermits(1)(flock.withLock(fx, `snapshot:${state.gitdir}`).pipe(Effect.orDie))
```

- [ ] **Step 2: Mirror the existing fork pattern**

Read `git grep -n "EffectFlock" -- packages/core/src/repository-cache.ts` and copy its exact import specifier and `withLock` call shape. Do not invent a util path; use the one this fork already ships and proven on Windows.

- [ ] **Step 3: Apply the change**

In `packages/core/src/snapshot.ts`: resolve `flock` from `EffectFlock.Service` alongside the existing `Git.Service`; wrap the git-mutation effects — the `git.objects.pack` call (~line 122), the `git.index` write (~line 161), and the `git.tree.capture` / diff-write paths (~lines 132, 210) — in `flock.withLock(fx, `snapshot:${gitDirectory}`)`. This file has no in-process semaphore helper, so the flock becomes the single guard; key must be exactly `snapshot:${gitDirectory}`. Update the layer requirement type and (if the file ends in a `LayerNode.make`) its `deps` array the way `repository-cache.ts` does. If any wrap point is semantically unclear after reading upstream's intent (serialize writers, allow the pack comment's existing behavior to stand), stop and show the hunk to the user before committing.

- [ ] **Step 4: Re-read the diff**

Run: `git diff packages/core/src/snapshot.ts`
Expected: import + layer deps + flock wraps only; key literal `snapshot:` present; no logic rewrites. Check no flock key in this file can collide with keys in `plugin/update.ts` or `repository-cache.ts`.

- [ ] **Step 5: Run the package tests and typecheck**

Run in `packages/core`:
```pwsh
bun test test/snapshot.test.ts
bun typecheck
```
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```pwsh
git add packages/core/src/snapshot.ts
git commit -m "fix(core): serialize snapshot git operations across processes"
```
Extend the message body with: adapted from upstream PR anomalyco/opencode#55385 (head 099c5237) onto the relocated snapshot module; upstream commit message explains the shared-gitdir/index.lock race.

### Task 3: Cherry-pick #55149 — no-timeout fetch

**Files:**
- Modify: `packages/tui/src/app.tsx`
- Create: `packages/tui/src/util/no-timeout-fetch.ts`

**Interfaces:**
- Produces: `no-timeout-fetch.ts` helper consumed only by the `app.tsx` call site the cherry-pick itself wires up.

- [ ] **Step 1: Cherry-pick**

Run in `Y:\opencode_fife_dev`:
```pwsh
git fetch upstream refs/pull/55149/head
git cherry-pick FETCH_HEAD
```
Expected: clean apply (both paths exist in this fork; no fork commit touches them). On conflict: resolve keeping both sides' intent, but expect none.

- [ ] **Step 2: Verify**

Run in `packages/tui`:
```pwsh
bun typecheck
bun test test/app.test.ts 2>$null; if ($LASTEXITCODE -ne 0) { echo "no app test file; typecheck is the gate" }
```
Expected: typecheck clean. The change is 8 lines across 2 files; no manual edits.

### Task 4: Cherry-pick #54251 — retained execute results

**Files:**
- Modify: `packages/core/src/session/runner/step.ts`, `packages/core/src/session/runner/publish-llm-event.ts`, `packages/core/src/codemode/tool.ts`, `packages/core/src/tool.ts`, `packages/schema/src/tool.ts`, `packages/codemode/src/*` (4 files), docs `packages/codemode/*.md`
- Test: `packages/core/test/session-runner.test.ts` (+182), `packages/core/test/session-runner-tool-events.test.ts` (+18), `packages/codemode/test/codemode.test.ts` (+44) — all travel with the pick.

**Interfaces:**
- Produces: whatever schema shape the pick adds to `@opencode/schema` tool types; after this task run `bun run generate` from repo root per AGENTS.md if the pick touched `packages/schema/src/tool.ts` (it does).

- [ ] **Step 1: Cherry-pick**

Run:
```pwsh
git fetch upstream refs/pull/54251/head
git cherry-pick FETCH_HEAD
```
Expected: clean or trivially conflicting (no file overlap with fork commits; `session/runner/*` is upstream-shape). On conflict: keep upstream's structure and the fix's intent; if a hunk's meaning is unclear, stop and show the user.

- [ ] **Step 2: Regenerate clients if schema changed**

Run from repo root: `bun run generate`
Expected: generated files update or no-op. Inspect `git status` — commit any regenerated files as part of this fix:
```pwsh
git add -A
git commit --amend --no-edit
```

- [ ] **Step 3: Run the pick's own tests**

Run in `packages/core`:
```pwsh
bun test test/session-runner.test.ts test/session-runner-tool-events.test.ts test/session-*.test.ts
```
Run in `packages/codemode`:
```pwsh
bun test test/codemode.test.ts
```
Expected: PASS, including the +182/+18/+44 lines the pick added.

### Task 5: Full verification gate

**Files:** none

**Interfaces:** none

- [ ] **Step 1: Install and typecheck the affected graph**

Run from repo root:
```pwsh
$env:PATH = "C:\Users\barne\.bun\bin;$env:PATH"
bun install
bun turbo typecheck --filter=@opencode/core --filter=@opencode/cli --filter=@opencode/schema --filter=@opencode/tui --filter=@opencode/codemode
```
Expected: all typechecks pass.

- [ ] **Step 2: Regression suites (sync-skill list)**

Run in `packages/core`: `bun test test/config-hooks*.test.ts test/tool-*.test.ts test/session-*.test.ts`
Run in `packages/cli`: `bun test test/mini-config.test.ts test/windows-opentui.test.ts test/config.test.ts`
Expected: pass, with two known non-regressions to name and ignore if they appear: `mini-config` failing with `mktemp not found` (Windows, fix only exists uncommitted on `main`), and `windows-opentui` transient dlopen error 126 (re-run once before treating as real).

- [ ] **Step 3: Canonical check**

Run from repo root: `bun run check`
Expected: clean. Fix anything this branch introduced before pushing.

- [ ] **Step 4: Conflict-marker sweep**

Run in `Y:\opencode_fife_dev`: `git grep '<<<<<<<'`
Expected: no output.

### Task 6: PR and merge

**Files:** none (git + GitHub MCP)

**Interfaces:** none

- [ ] **Step 1: Push the branch**

Run: `git push -u origin stability-picks`
Expected: succeeds. If the pre-push hook fails environmentally only (not on real errors), one retry with `--no-verify` and flag it in the report.

- [ ] **Step 2: Open the PR**

Use GitHub MCP `create_pull_request`: owner `DeputyFifeofMayberry`, repo `opencode_fife`, base `dev`, head `stability-picks`, title `fix(core): adopt upstream stability fixes`.
Body covers, in plain prose: the three upstream PRs with links and one line each on what they fix; that #55385 was re-implemented on the relocated `packages/core/src/snapshot.ts` because upstream deleted `packages/opencode`; the verification run (tests + `bun run check` results); that authorship is preserved via cherry-pick.
Expected: PR created and visible.

- [ ] **Step 3: Merge the PR**

Use GitHub MCP `merge_pull_request` with `merge_method: "merge"` (no squash).
Expected: merged state; `origin/dev` now contains the three fixes plus merge commit.

### Task 7: Land on local dev and main

**Files:** none (git only)

**Interfaces:** none

- [ ] **Step 1: Update local dev**

Run in `Y:\opencode_fife_dev`:
```pwsh
git switch dev
git fetch origin
git merge origin/dev
git status --short
```
Expected: clean merge (local `dev` has no unique commits left after Task 1 Step 2), tree clean.

- [ ] **Step 2: Merge into main with the stash dance**

Run in `Y:\opencode_fife` (only after all `Y:\opencode_fife_dev` git commands are finished — sequential worktrees):
```pwsh
git status --short
git stash push -u -m "windows-dev-wip pre-stability-picks"
git merge dev
git stash pop
git status --short
```
Expected: merge clean (none of the three fixes touch `package.json`, `.husky/`, or `script/` files that carry the deliberate dirt); stash pops back to the usual uncommitted set. On any pop conflict, combine both sides and leave the result uncommitted, as the sync skill prescribes.

- [ ] **Step 3: Push both branches and verify containment**

Run in `Y:\opencode_fife`:
```pwsh
git push origin main dev
git grep '<<<<<<<'
git log --oneline -5 dev
```
Expected: push succeeds; no conflict markers; `dev` and `main` logs show the three fix commits and the PR merge commit. No binary was built and no running process touched; the installed binary stays as-is until the next rebuild.
