# Effective Effort Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `EffortAdapter.resolve` the single authority that assembles effort-policy inputs, consumed by both execution (`EffortTransition.apply`) and reporting (`EffortStatus.describe`), with no behavior change.

**Architecture:** One pure resolver added to `packages/core/src/effort/adapter.ts`; the two call sites shrink to orchestration and projection. Vendored `effort/policy/` untouched. See `EFFECTIVE_EFFORT_ARCHITECTURE_SPEC.md` in this directory.

**Tech Stack:** TypeScript, Effect (core), Bun test. No new dependencies.

**Spec:** `docs/plans/effective-effort/EFFECTIVE_EFFORT_ARCHITECTURE_SPEC.md` (behavior: `docs/spec/effort-policy.md`)

## Global Constraints

- No behavior change. `EffortTransition.apply` and `EffortStatus.describe` keep their exported signatures, inputs, and outputs byte-for-byte in meaning.
- No changes to `packages/core/src/effort/policy/**`, `EFFORT_POLICY_PROTOCOL_VERSION` (stays 2), `Session.EffortStatus` (`packages/protocol/src/groups/session.ts:42-61`), event payloads, `session_effort` columns, or anything in `packages/protocol`, `packages/schema`, `packages/sdk`.
- Type-only imports for host state in `adapter.ts` (`import type { EffortStore }`); no runtime cycles.
- Tests run from `packages/core` (never repo root): `bun test test/effort`, focused files as listed. Full check: `bun run check` from repo root.
- Conventional commits, one commit per task.
- If any Stage 1 test fails before the refactor, STOP: that is live drift between the two assemblies. Report it; do not paper over it with the refactor.

## Review Focus

The five inputs most likely to regress, and the task that pins each:

1. A selection whose variant is the literal `"default"` — must read as Auto (`control: "automatic"`, `selectedVariant: undefined`), not as a manual pick. Pinned in Task 1.
2. A missing model — `apply` must silently skip (`false`); `describe` must report `support: "unknown"`, `next: undefined`. Pinned in Tasks 1–2.
3. An adaptive session with no durable row — decision seeds from the agent ladder without inventing a `currentLevel`; the seed row materializes on first decision. Pinned in Task 2.
4. An exact pick the route does not advertise — `untouched`, never rewritten. Pinned in Task 2.
5. The policy's own echo (`lastAppliedVariant` match) — must never be treated as a new user pick. Pinned in Task 2 (already covered end-to-end by `session-runner.test.ts:2485`; Task 2 adds the same-shape cross-check).

---

### Task 1: Pin `EffortStatus.describe` edge behavior

**Files:**
- Modify (test only): `packages/core/test/effort/status.test.ts`

**Interfaces:**
- Consumes: `EffortStatus.describe` (`packages/core/src/effort/status.ts:10`) — unchanged signature.
- Produces: regression pins that Tasks 4–5 must not break.

- [ ] **Step 1: Write the failing-in-spirit tests (they should PASS against current code)**

Add three tests to the existing `describe("effort status")`:

1. `"treats a default-variant selection as Auto, not manual"` — `selection: { providerID, id, variant: Model.VariantID.make("default") }` with a supported model and no state; assert `control: "automatic"`, `selectedVariant: undefined`, and `next.rule` is a policy rule (`"base"` for a standard-seeded static session).
2. `"separates static escalation from the adaptive controller on a supported route"` — same model; case A: `policy { verification_commands: ["bun test"], base_level: "low" }`, state with `openFailure` → `next: { rule: "escalated", level: "standard" }` (standard = model default, so no `effort`); case B: `policy { mode: "adaptive", ... }`, same row shape with `level` present → `next` decides from `level`, never `rule: "escalated"`; assert `currentLevel` only in case B.
3. `"keeps the missing-model snapshot honest"` — no `model` → `support: "unknown"`, `next: undefined`, `initialized` reflects state presence.

- [ ] **Step 2: Run them**

Run: `cd packages/core && bun test test/effort/status.test.ts`
Expected: PASS (these pin current behavior; a failure here means the documented behavior in §5 of the spec is wrong — stop and reassess).

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/effort/status.test.ts
git commit -m "test(core): pin effort status sentinel and mode edge behavior"
```

### Task 2: Pin execution/reporting consistency

**Files:**
- Create (test only): `packages/core/test/effort/consistency.test.ts`

**Interfaces:**
- Consumes: `EffortStatus.describe`; `EffortTransition.apply` (deps shape per `packages/core/src/effort/transition.ts:33-39`); `EffortStore.set` for row setup. Build layers the way `packages/core/test/effort/recovery.test.ts` does (temp database, config entries, model service).
- Produces: the invariant "what `describe` reports as `next` is what `apply` acts on, for the same snapshot".

- [ ] **Step 1: Write the consistency table test**

Fixtures (small table, one `it.effect` per row or a loop): for each of
(a) static auto, standard base, supported route, no row — no variant write, but the seed row materializes; `next: { rule: "base", level: "standard" }` with no `effort`;
(b) static auto, low base — `apply` writes `low`; pre-apply `next: { rule: "base", level: "low", effort: "low" }`; post-apply `describe` shows `selectedVariant: "low"`, `control: "automatic"` (the policy's own write is filtered as an echo, so `exact` stays undefined and `next` still computes `{ rule: "base", level: "low", effort: "low" }`), and a second `apply` returns `false` because the target already equals the selected variant — asserting the echo rule end to end;
(c) user pick (variant `high`, no row) — `apply` returns `false` (no transition), `next: { rule: "exact-base", effort: "high" }`;
(d) plan agent — `next: { rule: "mode-pin", level: "deep", effort: "max" }` per `adapter.test.ts:81-87`;
(e) degenerate route (variants `["none","thinking"]`) — `next: { rule: "untouched" }`, `apply` returns `false`.

For each fixture: call `EffortStatus.describe` on the inputs, then `EffortTransition.apply` with the same policy/state/agent/selection/model, then assert (1) `switched` equals whether `next` carries a write (`next.effort !== undefined` and `next.rule` is a write rule), and (2) the durable post-state (`session.model.variant`, `lastAppliedVariant`) matches `next.effort ?? "default"`.

- [ ] **Step 2: Run it**

Run: `cd packages/core && bun test test/effort/consistency.test.ts`
Expected: PASS against the *current duplicated* code. A failure = live drift; stop per Global Constraints.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/effort/consistency.test.ts
git commit -m "test(core): pin effort transition and status decision consistency"
```

### Task 3: Add `EffortAdapter.resolve` (TDD)

**Files:**
- Modify: `packages/core/src/effort/adapter.ts` (add `Resolution` + `resolve` after `decideFor`, per spec §4)
- Modify (test): `packages/core/test/effort/adapter.test.ts`

**Interfaces:**
- Consumes: existing `capability`, `decideFor` (`adapter.ts:23,77`); `operationFor`, `sessionSeed` (`delegation.ts:19,36`); types `ConfigEffort.Info`, `EffortStore.Info` (type-only import), `Model.Info`, `Model.Ref`.
- Produces: `EffortAdapter.resolve(input): Resolution` — the exact contract in spec §4. Tasks 4–5 consume only this.

- [ ] **Step 1: Write the failing table test**

Add `describe("EffortAdapter.resolve")` mirroring the duplication table: for one fixture set, assert `resolve` returns `mode`, `baseLevel`, `selectedVariant`, `exact`, `support`, `decision` — including: default-variant selection → `selectedVariant: undefined`; `lastAppliedVariant` echo → `exact: undefined`; no row adaptive → base seeded from `sessionSeed(operationFor(...))`; no row static → `policy.base_level ?? "standard"`; no model → `support: "unknown"`, `decision: undefined`; degenerate route → `support: "unsupported"`, `decision.rule: "untouched"`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && bun test test/effort/adapter.test.ts`
Expected: FAIL — `resolve is not a function`.

- [ ] **Step 3: Implement `resolve` in `adapter.ts`**

Move the assembly expressions verbatim from `transition.ts:52-75` / `status.ts:17-35` into `resolve` (spec §4 lists each line). Add `import type { ConfigEffort }` and `import type { EffortStore }`; import `operationFor`/`sessionSeed` from `./delegation.js`. No other edits in this task.

- [ ] **Step 4: Run the adapter suite**

Run: `cd packages/core && bun test test/effort/adapter.test.ts`
Expected: PASS, including the pre-existing `capability`/`decideFor` tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/effort/adapter.ts packages/core/test/effort/adapter.test.ts
git commit -m "feat(core): add EffortAdapter.resolve as the single effort input assembly"
```

### Task 4: Execution path consumes `resolve`

**Files:**
- Modify: `packages/core/src/effort/transition.ts:50-103` (assembly block only; write/publish block unchanged)

**Interfaces:**
- Consumes: `EffortAdapter.resolve` (Task 3).
- Produces: unchanged `apply` contract — `Effect<boolean>`; callers (`llm.ts:334-338`, tests) untouched.

- [ ] **Step 1: Replace the inline assembly**

Read session, row, policy, model info (move the `models.get` above the derivation — same reads, no behavior change), then one `resolve` call. Use `resolution.decision!` (model is known here), `resolution.exact`, `resolution.selectedVariant`, `resolution.baseLevel` in the untouched/exact-base branch, the `target === variant` test, and the seed-row write. Delete the now-dead local `variant`/`exact`/`baseLevel`/`adaptive` computations.

- [ ] **Step 2: Run the transition and session suites — all must pass UNCHANGED**

Run: `cd packages/core && bun test test/effort/recovery.test.ts test/effort/consistency.test.ts`
Run: `cd packages/core && bun test test/session-runner.test.ts`
Expected: PASS with zero test edits. Any edit to an existing assertion in this task is a behavior change — stop and reassess.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/effort/transition.ts
git commit -m "refactor(core): decide effort transitions through EffortAdapter.resolve"
```

### Task 5: Reporting path consumes `resolve`

**Files:**
- Modify: `packages/core/src/effort/status.ts:17-35` (derivation only; the returned projection keeps every field)

**Interfaces:**
- Consumes: `EffortAdapter.resolve` (Task 3). Note `describe`'s input object is exactly `resolve`'s input shape.
- Produces: unchanged output object (protocol `Session.EffortStatus`).

- [ ] **Step 1: Delegate the derivation**

`const resolution = EffortAdapter.resolve(input)`; project `mode`, `support`, `next: resolution.decision`, `selectedVariant`, `baseLevel` from it; `control` from `resolution.exact !== undefined`; keep `currentLevel`, `initialized`, `verificationCommands`, `cleanPasses`, `cleanPassesNeeded`, `openFailure` reading `policy`/`state` directly as today.

- [ ] **Step 2: Run the status consumers**

Run: `cd packages/core && bun test test/effort/status.test.ts test/effort/consistency.test.ts`
Run: `cd packages/cli && bun test test/session-effort.test.ts`
Run: `cd packages/server && bun test test/session-effort.test.ts`
Expected: PASS with zero test edits.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/effort/status.ts
git commit -m "refactor(core): project effort status through EffortAdapter.resolve"
```

### Task 6: Remove superseded logic

**Files:**
- Modify: `packages/core/src/effort/evidence.ts:42` (delete the `lastAppliedVariant` spread — `EffortState` has no such field; inert since `960d5ca0ca`)

**Interfaces:**
- Consumes/Produces: none visible — `state` at `evidence.ts:39-50` is a local literal passed to `applyEvidence`.

- [ ] **Step 1: Delete the dead field** and confirm nothing else references it in that literal.

- [ ] **Step 2: Verify the evidence owner's guarantees still hold**

Run: `cd packages/core && bun test test/effort/evidence.test.ts test/effort/verify.test.ts`
Expected: PASS. Do NOT unify evidence's `EffortState` assembly with `resolve` — it intentionally omits exact/pin (evidence application ignores user picks and the plan pin by design, per `docs/spec/effort-evidence-owner.md`).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/effort/evidence.ts
git commit -m "refactor(core): drop dead lastAppliedVariant field from effort evidence state"
```

### Task 7: Documentation

**Files:**
- Modify: `docs/spec/effort-policy.md` ("Decision surface" section, lines ~26-38) — name `EffortAdapter.resolve` as the single input-assembly point consumed by both `apply` and `describe`; fix the encoding mojibake on lines 34 and 42-44 while editing those lines.
- Modify: this directory's evaluation/spec docs only if implementation revealed a deviation.

- [ ] **Step 1: Amend the spec paragraph** (behavior text stays accurate; add the ownership sentence).
- [ ] **Step 2: Commit**

```bash
git add docs/spec/effort-policy.md
git commit -m "docs: record EffortAdapter.resolve as the effort input authority"
```

### Task 8: Final verification

- [ ] Run: `cd packages/core && bun test test/effort` — expected: all pass (~140+ tests).
- [ ] Run: `cd packages/core && bun test test/session-runner.test.ts test/session-step.test.ts` — expected: pass.
- [ ] Run: `bun run check` from repo root — expected: clean.
- [ ] Inspect the final diff for: any remaining `"default" ? undefined` unwrap or `sessionSeed(operationFor(` seeding chain outside `adapter.ts`/`delegation.ts` in `packages/core/src` (allowed remaining sites: `model-resolver.ts:162`, `variant.ts:17` — model resolution, out of scope); any edit to `effort/policy/**` (must be none); any test assertion weakened (must be none).
- [ ] Confirm `git log --oneline` shows the seven tasks as separate commits on the task branch.

## Risks and mitigations

| Risk | Detection | Mitigation / rollback |
| --- | --- | --- |
| Assembly extraction changes behavior | Task 2 consistency test + existing suites must pass with zero assertion edits | Commits are independent; `git revert` the offending task commit |
| Import cycle `adapter → store` | `bun run check`; `bun test test/effort/import-boundary.test.ts` | Import is type-only (erased); if the boundary test objects, move `Resolution`'s state type to a structural inline shape |
| `models.get` reordered before derivation | Code review against Task 4 step 1 | Same reads, no writes between; covered by recovery/session-runner suites |
| Evidence dead-field removal hides a real consumer | grep for `lastAppliedVariant` after Task 6 — only `store.ts`, `transition.ts` (via resolve), `status.ts` (via resolve), `delegation.test` fixtures | Field is undeclared on `EffortState`; `applyEvidence` cannot read it (verified: `policy.ts:76-111`) |
| Upstream merge friction | Files touched are fork-local `effort/*` + two docs | No exported-signature or protocol changes |

## Rollback plan

Each task is one conventional commit reverting cleanly in reverse order. Stages 1–2 (test-only commits) can be kept even if later stages are rolled back — they remain valid behavior pins.

## Completion criteria

- All 8 tasks committed; Task 8 checklist fully green.
- `grep` confirms no decision-path duplication: `"default"` unwrap, echo filter, base seeding, and adaptive assembly each appear exactly once, in `adapter.ts`.
- `apply` and `describe` pass their full suites with no assertion edits made in Tasks 4–5.
- `docs/spec/effort-policy.md` names the single assembly point.
