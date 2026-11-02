# Cold Type-Check Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a cold `bun run check` pass by removing two ambient-type dependencies that only fail under `packages/simulation`'s tsconfig graph.

**Architecture:** Two boundary fixes in source, no config or dependency changes: a self-typed runtime lookup for `process.getBuiltinModule` (ambient `Process` declarations disagree per graph), and an explicit Effect-`Encoding` → Node-`BufferEncoding` normalization at the stdin sink boundary. Both are runtime no-ops.

**Tech Stack:** TypeScript (bun check / tsgo), Effect (`effect/process`, `@effect/platform-node`).

**Spec:** none — behavior is fixed by the current code; this plan removes type-level graph dependencies only.

## Global Constraints

- Zero runtime behavior change. `getBuiltinModule` stays an optional, runtime-detected lookup; missing runtimes keep sending plain JSON (`shared.ts:445-453`).
- No dependency additions, no tsconfig changes (the `types`/`module` experiment on `packages/simulation` was reverted — config alignment does not fix the errors and changes the package's ambient surface).
- Fixes must type-check in BOTH graphs: each package's own `bun run typecheck` and `packages/simulation`'s cold check.
- Tests run from package directories, never the repo root.

## Review Focus

1. `compressBody` must still return `undefined` (plain JSON) when the runtime lacks `getBuiltinModule`/`node:zlib` — pinned by Task 1's ai-package suite run.
2. A configured `"utf-16le"` stdin encoding must still reach the child process (as Node's `"utf16le"` — same encoding) — pinned by Task 2's util suite run.
3. No `any`: the builtin lookup carries a minimal structural type (`zstdCompressSync?`/`gzipSync`), not a blanket escape.

---

### Task 1: Self-typed builtin-module lookup in `packages/ai`

**Files:**
- Modify: `packages/ai/src/protocols/shared.ts:443-453` (`compressBody`)

**Interfaces:**
- Consumes: nothing new; `globalThis.process` only.
- Produces: unchanged `compressBody(text: string, encoding: RequestEncoding | undefined)` signature and returns.

- [ ] **Step 1: Confirm the failing state (already observed, re-verify)**

Run: `cd packages/simulation && bun run typecheck`
Expected: FAIL — `../ai/src/protocols/shared.ts(447,36): error TS2339: Property 'getBuiltinModule' does not exist on type 'Process'.`

- [ ] **Step 2: Replace the ambient-typed lookup with a structural one**

In `compressBody`, keep the comment and optional chaining; cast `globalThis.process` once through `as unknown as` to `{ getBuiltinModule?: (id: string) => { zstdCompressSync?: (text: string) => Buffer; gzipSync: (text: string) => Buffer } | undefined } | undefined`, with a comment naming the reason: ambient `Process` declarations disagree (`bun-types@1.4.4` has no `getBuiltinModule`; some graphs resolve `@types/node`'s), so the runtime-detected lookup carries its own minimal type. Line 449 (`zlib?.zstdCompressSync?.(text)` / `zlib?.gzipSync(text)`) stays byte-identical.

- [ ] **Step 3: Verify green in both graphs**

Run: `cd packages/ai && bun run typecheck` — Expected: PASS.
Run: `cd packages/simulation && bun run typecheck` — Expected: the shared.ts error is gone; one error remains (`cross-spawn-spawner.ts:330`).

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/protocols/shared.ts
git commit -m "fix(ai): type the builtin-module lookup without ambient Process"
```

### Task 2: Normalize the stdin encoding at the Node boundary in `packages/util`

**Files:**
- Modify: `packages/util/src/cross-spawn-spawner.ts:326-331` (`setupStdin`)

**Interfaces:**
- Consumes: `ChildProcess.StdinConfig["encoding"]` (Effect's `Encoding`, includes `"utf-16le"`); `NodeSink.fromWritable` options `encoding?: BufferEncoding`.
- Produces: local `toNodeEncoding(encoding: ChildProcess.StdinConfig["encoding"]): BufferEncoding | undefined` used at line 330.

- [ ] **Step 1: Confirm the failing state (already observed, re-verify)**

Run: `cd packages/simulation && bun run typecheck`
Expected: FAIL — `../util/src/cross-spawn-spawner.ts(330,11): error TS2322` with `'"utf-16le"' is not assignable ... Did you mean '"utf16le"'?`

- [ ] **Step 2: Add the normalization helper and use it at line 330**

```ts
// Effect's Encoding spells utf-16 with a hyphen; Node's BufferEncoding does not.
// The two labels denote the same encoding, so normalize at the Node boundary.
const toNodeEncoding = (encoding: ChildProcess.StdinConfig["encoding"]): BufferEncoding | undefined =>
  encoding === "utf-16le" ? "utf16le" : encoding
```
and change line 330 to `encoding: toNodeEncoding(cfg.encoding),`. Every other `Encoding` member is already a valid `BufferEncoding`, so the ternary's false branch assigns directly — no cast.

- [ ] **Step 3: Verify green in both graphs, and behavior unchanged**

Run: `cd packages/util && bun run typecheck` — Expected: PASS.
Run: `cd packages/simulation && bun run typecheck` — Expected: PASS (`No type errors`).
Run: `cd packages/util && bun test` — Expected: PASS (behavior unchanged; `"utf-8"` — the only encoding this repo configures — maps to itself).

- [ ] **Step 4: Commit**

```bash
git add packages/util/src/cross-spawn-spawner.ts
git commit -m "fix(util): normalize Effect encoding labels at the Node sink boundary"
```

### Task 3: Full cold verification

- [ ] Run: `bun run check` from the repository root — Expected: PASS with **zero** cache (fresh worktree).
- [ ] Run: `cd packages/core && bun test ./test/effort && bun test ./test/session-runner.test.ts` — Expected: PASS (guard against ai/util ripple into core).
- [ ] Inspect the final diff: only `shared.ts` and `cross-spawn-spawner.ts` changed, plus this plan file.

## Risks and rollback

| Risk | Detection | Rollback |
| --- | --- | --- |
| The `Buffer` type is unavailable in one of the graphs | Task 1 Step 3 / Task 3 check | Swap `Buffer` for `unknown` and thread the type through line 449 with a local alias |
| Encoding normalization changes a live config | util suite + `grep -r "utf-16le" packages --include=*.ts` (expect: type definitions and the mapping only) | Revert the single commit |
| Downstream packages re-expose the cast shape | Root check | None needed — the cast is internal to `compressBody` |

## Completion criteria

- `packages/simulation` typecheck passes cold; `bun run check` passes cold from the worktree root.
- All Task 3 runs green; diff limited to the two source files and this plan.
