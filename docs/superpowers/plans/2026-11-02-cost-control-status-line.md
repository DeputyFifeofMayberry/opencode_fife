# Frozen Effort and Truthful Status Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `frozen` effort mode that holds one reasoning level per session, and replace the terminal footer's `auto`/`effort default` labels with the agent, model, and level of the step that actually ran.

**Architecture:** `frozen` is a third mode on the existing effort policy, not a parallel setting. It threads through the schema literal, the pure decision core (`EffortState.frozen`), the adapter (`resolve`), and the `session.effort` status/protocol surface. The status line reuses `session.step.started`, which already carries `agent` and `model.variant`; the terminal transport currently drops both, so the work is to carry them through to the footer and delete the `auto` placeholder.

**Tech Stack:** TypeScript, Effect Schema, Bun test, Solid (TUI), OpenCode protocol codegen.

**Spec:** `docs/superpowers/specs/2026-11-02-cost-control-and-status-line-design.md`

## Global Constraints

- `frozen` must be a mode of the existing `effort_policy`, never a second config key.
- `static` and `adaptive` behave byte-identically after this change; their existing tests must pass unmodified except where a version constant is asserted.
- The `plan` agent keeps its `pin: "deep"` under every mode, including `frozen`.
- An explicit user variant pick is written verbatim and never escalated, in every mode.
- Never edit generated client files by hand. Run `bun run generate` from the repo root after changing `packages/protocol`.
- Tests run from the package directory, never from the repo root. No `any`. No aliased or star imports.
- Commit messages: conventional, `type(scope): summary`.
- Branch: `cost-control-status-line`, based on the current local `dev`.

## Review Focus

The spec implies these failure modes; each has a test in the task that owns the code.

1. **A model with no reasoning variants.** The line must omit the level entirely, not print `undefined` or fall back to a fake level.
2. **A session created before the mode change.** It must freeze at its stored durable base, not silently reset to the new `base_level`.
3. **An explicit user pick.** It must survive `frozen` verbatim, including a variant the policy would never choose.
4. **The `plan` agent.** Its deep pin must survive `frozen`; freezing must not turn plan mode into a standard-level session.
5. **A delegated step racing the parent's own step.** The line must not attribute the parent's model to the child.
6. **A narrow terminal.** The level segment must degrade before the model name, not push the line to two rows.

---

### Task 1: Schema accepts `frozen`

**Files:**
- Modify: `packages/schema/src/config/effort.ts:16-20`
- Test: `packages/schema/test/config.test.ts` (extend the existing `effort_policy` block around lines 194-240)

**Interfaces:**
- Produces: `ConfigEffort.Info` whose `mode` is `"static" | "adaptive" | "frozen" | undefined`.

- [ ] **Step 1: Write the failing test**

Add to the existing effort-policy describe block. Follow the file's existing pattern of constructing `ConfigEffort.Info` through the config decoder.

```ts
test("accepts frozen effort mode", () => {
  const info = new ConfigEffort.Info({ mode: "frozen" })
  expect(info.mode).toBe("frozen")
})
```

`ConfigEffort.Info` is constructed directly here, matching `packages/core/test/effort/status.test.ts`. Do not add a decode helper.

- [ ] **Step 2: Run it and confirm it fails**

Run from `packages/schema`: `bun test test/config.test.ts`
Expected: FAIL — `frozen` is not assignable to the mode literal.

- [ ] **Step 3: Implement the literal**

In `packages/schema/src/config/effort.ts`, change:

```ts
mode: Schema.Literals(["static", "adaptive"]).pipe(optional)
```

to include `"frozen"`, and extend the `.annotate()` description with one sentence: frozen holds the configured level, never seeds, raises, or steps down, and still honours an explicit pin.

- [ ] **Step 4: Run it and confirm it passes**

Run from `packages/schema`: `bun test test/config.test.ts`
Expected: PASS, including the existing rejections for `mode: "aggressive"`.

- [ ] **Step 5: Commit**

```bash
git add packages/schema/src/config/effort.ts packages/schema/test/config.test.ts
git commit -m "feat(schema): accept frozen effort mode"
```

---

### Task 2: The decision core honours `frozen`

**Files:**
- Modify: `packages/core/src/effort/policy/types.ts:5` (protocol version), `:43-68` (`EffortState`)
- Modify: `packages/core/src/effort/policy/policy.ts:130-155` (`decide`)
- Test: `packages/core/test/effort/policy.test.ts`

**Interfaces:**
- Consumes: `EffortState` from Task 1's mode, not directly.
- Produces: `EffortState.frozen?: boolean`; `decide()` never returns `rule: "escalated"` when `frozen === true`. `EFFORT_POLICY_PROTOCOL_VERSION` becomes `3`.

- [ ] **Step 1: Write the failing tests**

Add a `describe("frozen mode")` block to `packages/core/test/effort/policy.test.ts`, reusing `CAPABILITY` and `observation`.

```ts
describe("frozen mode", () => {
  it("does not raise the level when a failure is open", () => {
    const failed = applyEvidence({ base: "low", frozen: true }, observation("verification-failure"))
    expect(decide(CAPABILITY, failed)).toEqual({ rule: "base", level: "low", effort: "low" })
  })

  it("still applies a mode pin", () => {
    expect(decide(CAPABILITY, { base: "low", pin: "deep", frozen: true }))
      .toEqual({ rule: "mode-pin", level: "deep", effort: "max" })
  })

  it("still writes an exact pick verbatim", () => {
    expect(decide(CAPABILITY, { base: "low", exact: "off", frozen: true }))
      .toEqual({ rule: "exact-base", effort: "off" })
  })

  it("ignores a durable adaptive level", () => {
    expect(decide(CAPABILITY, { base: "standard", level: "deep", frozen: true }))
      .toEqual({ rule: "base", level: "standard" })
  })
})
```

- [ ] **Step 2: Run them and confirm they fail**

Run from `packages/core`: `bun test test/effort/policy.test.ts`
Expected: FAIL — `frozen` is not a known property; the first case returns `escalated`.

- [ ] **Step 3: Implement**

In `types.ts`, add to `EffortState`:

```ts
/** Frozen mode: hold the effective base; evidence never changes the level. */
readonly frozen?: boolean
```

Bump `EFFORT_POLICY_PROTOCOL_VERSION` to `3` with a comment: the frozen level rule is part of the protocol.

In `policy.ts`, inside `decide`, change the two state reads to:

```ts
const adaptive = state.frozen !== true && state.level !== undefined
const escalated = state.frozen !== true && state.openFailure !== undefined
```

Both guards are required. Without the `adaptive` guard, a frozen state that still carries a durable level from an earlier adaptive session would be reported as `step-down` instead of `base`.

Also update `decide`'s doc comment to state that frozen suppresses both the escalation branch and the durable adaptive level while `exact-base`, `mode-pin`, and `base` are unchanged.

Do not change `applyEvidence`. A frozen state carries no `level`, so the existing `state.level === undefined` guards already prevent a raise and any step-down; add one comment saying so.

- [ ] **Step 4: Run the tests and confirm they pass**

Run from `packages/core`: `bun test test/effort/policy.test.ts`
Expected: PASS, with every pre-existing test unchanged and green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/effort/policy/types.ts packages/core/src/effort/policy/policy.ts packages/core/test/effort/policy.test.ts
git commit -m "feat(core): frozen effort mode in the decision core"
```

---

### Task 3: The adapter resolves frozen sessions

**Files:**
- Modify: `packages/core/src/effort/adapter.ts:11` (version), `:43-72` (`Inputs`, `stateFor`), `:84-91` (`Resolution.mode`), `:113-151` (`resolve`)
- Test: `packages/core/test/effort/adapter.test.ts`

**Interfaces:**
- Consumes: `EffortState.frozen` and protocol version `3` from Task 2.
- Produces: `EffortAdapter.resolve(...).mode` is `"static" | "adaptive" | "frozen"`; `EffortAdapter.Inputs.frozen?: boolean`; `decisionFor` passes `frozen` into the core.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/effort/adapter.test.ts`, reusing `modelWith`:

```ts
describe("EffortAdapter frozen mode", () => {
  const full = modelWith("none", "low", "high", "max")

  it("reports frozen and does not seed from the agent operation", () => {
    const result = EffortAdapter.resolve({
      policy: new ConfigEffort.Info({ mode: "frozen", base_level: "standard", agent_operations: { build: "explore" } }),
      agent: "build",
      model: full,
    })
    expect(result.mode).toBe("frozen")
    expect(result.baseLevel).toBe("standard")
    expect(result.decision).toEqual({ rule: "base", level: "standard" })
  })

  it("keeps a stored base over the configured base", () => {
    const state = { sessionID: SessionID.make("ses_frozen"), baseLevel: "deep" as const, revision: 0 }
    const result = EffortAdapter.resolve({
      policy: new ConfigEffort.Info({ mode: "frozen", base_level: "low" }),
      state,
      agent: "build",
      model: full,
    })
    expect(result.baseLevel).toBe("deep")
  })

  it("keeps the plan pin under frozen", () => {
    const result = EffortAdapter.resolve({
      policy: new ConfigEffort.Info({ mode: "frozen", base_level: "low" }),
      agent: "plan",
      model: full,
    })
    expect(result.decision).toEqual({ rule: "mode-pin", level: "deep", effort: "max" })
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run from `packages/core`: `bun test test/effort/adapter.test.ts`
Expected: FAIL — `frozen` is not in the mode union; `result.mode` is `"static"`.

- [ ] **Step 3: Implement**

- Bump `SUPPORTED_PROTOCOL_VERSION` to `3`.
- Add `readonly frozen?: boolean` to `Inputs`; map it in `stateFor` as `...(input.frozen === true ? { frozen: true } : {})`.
- Widen `Resolution.mode` to `"static" | "adaptive" | "frozen"`.
- In `resolve`, the existing `mode` read already yields `"frozen"`. Change the base-level branch so only `adaptive` seeds:

```ts
const baseLevel = input.state?.baseLevel
  ?? (mode === "adaptive"
    ? sessionSeed(operationFor(input.agent, input.policy?.agent_operations))
    : (input.policy?.base_level ?? "standard"))
```

- In the `decideFor` call, pass `frozen: mode === "frozen"` and pass `level`/`cleanPasses*` only when `mode === "adaptive"` (already the case).

- [ ] **Step 4: Run and confirm pass**

Run from `packages/core`: `bun test test/effort/adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/effort/adapter.ts packages/core/test/effort/adapter.test.ts
git commit -m "feat(core): resolve frozen effort sessions"
```

---

### Task 4: Status and protocol carry `frozen`

**Files:**
- Modify: `packages/core/src/effort/status.ts:10-31`
- Modify: `packages/protocol/src/groups/session.ts:43` and `:46`
- Regenerate: `packages/client` generated types
- Test: `packages/core/test/effort/status.test.ts`

**Interfaces:**
- Consumes: `Resolution.mode` from Task 3.
- Produces: `session.effort` returns `mode: "frozen"` and `control: "fixed"`; `control` is `"manual" | "automatic" | "fixed"`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/effort/status.test.ts`, reusing `model` and `state`:

```ts
test("reports frozen mode and a fixed control", () => {
  const result = EffortStatus.describe({
    policy: new ConfigEffort.Info({ mode: "frozen", base_level: "standard" }),
    model,
    agent: "build",
  })
  expect(result).toMatchObject({
    mode: "frozen",
    control: "fixed",
    currentLevel: undefined,
    next: { rule: "base", level: "standard" },
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run from `packages/core`: `bun test test/effort/status.test.ts`
Expected: FAIL — `control` is `"automatic"` and `mode` is a narrow union.

- [ ] **Step 3: Implement**

In `status.ts`, the return type is inferred. Change the `control` expression to:

```ts
control: resolution.exact !== undefined
  ? "manual" as const
  : resolution.mode === "frozen"
    ? "fixed" as const
    : "automatic" as const,
```

In `packages/protocol/src/groups/session.ts`, widen both literals:

```ts
mode: Schema.Literals(["static", "adaptive", "frozen"]),
control: Schema.Literals(["manual", "automatic", "fixed"]),
```

- [ ] **Step 4: Regenerate and typecheck**

From the repo root: `bun run generate`
Then from `packages/core`: `bun typecheck`
Expected: no errors, generated client files updated only by the generator.

- [ ] **Step 5: Run tests**

From `packages/core`: `bun test test/effort`
Expected: PASS, including the new frozen status test.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/effort/status.ts packages/core/test/effort/status.test.ts packages/protocol/src/groups/session.ts packages/client
git commit -m "feat(core): report frozen effort in session status"
```

---

### Task 5: Apply the frozen configuration

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode.json` (outside the repo; no commit)

**Interfaces:**
- Consumes: the `frozen` mode from Tasks 1-4.
- Produces: a running configuration with `effort_policy.mode: "frozen"` and `base_level: "standard"`.

- [ ] **Step 1: Edit the policy**

Set `effort_policy.mode` to `"frozen"` and keep `base_level: "standard"`. Leave `verification_commands` and `agent_operations` in place; frozen ignores the operations map but the commands still record evidence for status.

- [ ] **Step 2: Verify against a real session**

Start the installed dev client, open a new session, and run `opencode session effort <sessionID> --format json`.
Expected: `"mode": "frozen"`, `"control": "fixed"`, `"next": { "rule": "base", "level": "standard" }`.

- [ ] **Step 3: Verify the non-regression**

Run one verification command that fails and confirm the level in `session effort` does not change. This is the behaviour the whole task exists for.

- [ ] **Step 4: Record the result**

Append the observed JSON to `docs/superpowers/notes/2026-11-02-model-router-efficiency-analysis.md` under a new `## 11. Verification` heading, or report it in the task completion. No commit for the config file.

---

### Task 6: Carry the step identity through the terminal transport

**Files:**
- Modify: `packages/tui/src/mini/stream-v2.transport.ts:1092-1095`
- Modify: `packages/tui/src/mini/types.ts` (`FooterState`, around `:176-185`)
- Test: `packages/tui/test/mini/step-identity.test.ts` (new)

**Interfaces:**
- Consumes: `SessionStepStarted.data` = `{ sessionID, assistantMessageID, agent, model: ModelRef, snapshot?, started }` (`packages/client/src/promise/generated/types.ts:1413-1428`); `ModelRef` carries `providerID`, `id`, and optional `variant`.
- Produces: `type StepIdentity = { sessionID: string; agent: string; providerID: string; modelID: string; variant?: string }`; `FooterState.step?: StepIdentity`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import { stepIdentity } from "../../src/mini/stream-v2.transport"

describe("step identity", () => {
  test("keeps agent, model and variant from a step-start event", () => {
    expect(stepIdentity({
      sessionID: "ses_1",
      agent: "fast",
      model: { providerID: "vercel", id: "minimax/m3", variant: "medium" },
    })).toEqual({ sessionID: "ses_1", agent: "fast", providerID: "vercel", modelID: "minimax/m3", variant: "medium" })
  })

  test("omits an absent variant rather than inventing one", () => {
    expect(stepIdentity({ sessionID: "ses_1", agent: "build", model: { providerID: "p", id: "m" } }))
      .toEqual({ sessionID: "ses_1", agent: "build", providerID: "p", modelID: "m" })
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run from `packages/tui`: `bun test test/mini/step-identity.test.ts`
Expected: FAIL — `stepIdentity` is not exported.

- [ ] **Step 3: Implement**

Export a pure `stepIdentity` from `stream-v2.transport.ts` that maps the event data shape to `StepIdentity`, spreading `variant` only when present. Replace the assignment at `:1093` with:

```ts
state.step = stepIdentity(event.data)
```

Add `step?: StepIdentity` to `FooterState` in `mini/types.ts` and export `StepIdentity` from there or from the transport, whichever the existing module graph already treats as the shared types home. Keep one definition.

- [ ] **Step 4: Run and confirm pass**

Run from `packages/tui`: `bun test test/mini/step-identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove whether child steps reach the transport**

Add a temporary log or a debug assertion that fires when `session.step.started` arrives with a `sessionID` other than the active session. Run one task that delegates to `@fast`. Record the answer in the task completion. Do not ship the log.

This answer decides Task 8. If child steps are delivered, Task 8 proceeds. If they are not, Task 8 is deferred and reported, not guessed at.

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/mini/stream-v2.transport.ts packages/tui/src/mini/types.ts packages/tui/test/mini/step-identity.test.ts
git commit -m "feat(tui): carry agent and variant on the running step"
```

---

### Task 7: The footer shows the step, never `auto`

**Files:**
- Modify: `packages/tui/src/mini/footer.view.tsx:82-127` (props), `:238-250` (`variantStatus`, `footerStatus`), `:424-506` (`agentStatus`, `modelStatus`, `statuslineLayout`)
- Modify: `packages/tui/src/mini/footer.ts` (pass the new props at the `RunFooterView` call site around `:331`)
- Add: `packages/tui/src/mini/step-label.ts`
- Test: `packages/tui/test/mini/step-label.test.ts` (new)

**Interfaces:**
- Consumes: `StepIdentity` and `FooterState.step` from Task 6.
- Produces: `stepLabel(step: StepIdentity | undefined, fallback: { agent: string; model: string; variant?: string }): { agent: string; model: string; variant?: string }`. The footer renders this value and never the literal `"auto"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import { stepLabel } from "../../src/mini/step-label"

const fallback = { agent: "build", model: "deepseek-flash", variant: undefined as string | undefined }

describe("step label", () => {
  test("prefers the running step", () => {
    expect(stepLabel(
      { sessionID: "s", agent: "fast", providerID: "vercel", modelID: "minimax/m3", variant: "medium" },
      fallback,
    )).toEqual({ agent: "fast", model: "minimax/m3", variant: "medium" })
  })

  test("falls back before the first step", () => {
    expect(stepLabel(undefined, fallback)).toEqual(fallback)
  })

  test("never invents a level when the model has no variants", () => {
    expect(stepLabel(
      { sessionID: "s", agent: "build", providerID: "p", modelID: "m" },
      fallback,
    )).toEqual({ agent: "build", model: "m", variant: undefined })
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run from `packages/tui`: `bun test test/mini/step-label.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `packages/tui/src/mini/step-label.ts` with `stepLabel` exactly as the test pins it. It is pure and takes no props.

- [ ] **Step 4: Wire it into the footer**

- Add `step?: () => StepIdentity | undefined` to `RunFooterViewProps`; pass `footer.state().step` from `footer.ts`.
- Set `variantStatus` to the label's `variant`; delete the `?? "auto"` fallback and its comment. If the level is absent, the model renders without a level.
- Set `agentStatus` to the label's `agent`, and `modelStatus.model` to the label's `model`.
- Keep `footerStatus` (the one-line `details.join`) consistent with the same label so the wide and narrow paths cannot disagree.

- [ ] **Step 5: Run the TUI footer tests**

Run from `packages/tui`: `bun test test/mini`
Expected: PASS, including the existing `footer.width.test.ts` (`GPT-5 [max]` still renders as `[max]`).

- [ ] **Step 6: Check the narrow terminal**

The existing width policy already degrades the level before the name. Add one case to `footer.width.test.ts` asserting that a narrow width keeps the model name and drops the `[variant]` bracket before wrapping. Run it. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/tui/src/mini/step-label.ts packages/tui/src/mini/footer.view.tsx packages/tui/src/mini/footer.ts packages/tui/test/mini/step-label.test.ts packages/tui/test/mini/footer.width.test.ts
git commit -m "feat(tui): show the running step's model and level"
```

---

### Task 8: Show a delegated step while it runs (conditional)

**Gate:** Do not start unless Task 6 Step 5 observed `session.step.started` for a child session. If it did not, report the finding and stop; the design records this as an open engineering point.

**Files:**
- Modify: `packages/tui/src/mini/stream-v2.transport.ts` (route child steps)
- Modify: `packages/tui/src/mini/types.ts` (`FooterSubagentTab`)
- Modify: `packages/tui/src/mini/footer.view.tsx` (prefer a running child's step)
- Test: `packages/tui/test/mini/step-label.test.ts`

**Interfaces:**
- Consumes: `StepIdentity` from Task 6, `stepLabel` from Task 7.
- Produces: `FooterSubagentTab.step?: StepIdentity`; the label prefers a running child tab's step over the parent's.

- [ ] **Step 1: Write the failing test**

Add a case to `step-label.test.ts` for a `stepLabel` overload that accepts `{ parent?: StepIdentity; running?: StepIdentity }` and returns the running child when one exists, the parent otherwise.

- [ ] **Step 2: Run and confirm failure.** From `packages/tui`: `bun test test/mini/step-label.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Route a child `session.step.started` to the matching `FooterSubagentTab.step`; clear it on the child's completion. Prefer the first running tab with a step.

- [ ] **Step 4: Run tests.** From `packages/tui`: `bun test test/mini`. Expected: PASS.

- [ ] **Step 5: Verify live.** Run a task that delegates to `@medium` and confirm the line names the medium tier's model and level while the child runs, then settles back.

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/mini/stream-v2.transport.ts packages/tui/src/mini/types.ts packages/tui/src/mini/footer.view.tsx packages/tui/test/mini/step-label.test.ts
git commit -m "feat(tui): show the running delegated step"
```

---

### Task 9: Turn off the router's duplicate footer row

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc` (outside the repo; no commit)

**Interfaces:**
- Consumes: the plugin's status options at `opencode-model-router/src/tui/status-model.ts:150-180`.
- Produces: the `effort <value>` row no longer renders.

- [ ] **Step 1: Confirm the option path**

Read `status-model.ts:150-180` in the installed plugin. Confirm the key is `footer` and the object it lives under.

- [ ] **Step 2: Set it**

Add the option with value `false` to the overrides file at the confirmed path. Do not edit the plugin.

- [ ] **Step 3: Verify**

Start the TUI. Expected: no `effort default` or `effort <value>` row. The fork's line shows `agent`, model, and level for the last step.

- [ ] **Step 4: Rollback check**

Remove the key, restart, confirm the row returns. Re-add it. This proves the change is the one that removed it.

---

### Task 10: Same-level retry instead of immediate escalation

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`

**Interfaces:**
- Consumes: `enforcement.escalate` from the live overrides.
- Produces: `maxAttemptsPerTier: 2` with `variantSteps: "none"` unchanged, so a failure retries the same model and level once.

- [ ] **Step 1: Edit the escalation block**

Set `maxAttemptsPerTier` to `2`. Leave `variantSteps: "none"` and `effortBump: false`; either would reintroduce automatic effort. Raise `maxTotalAttempts` to `4` only if the ceiling otherwise blocks the second attempt.

- [ ] **Step 2: Verify the reading**

Run `/router stats` (or the CLI equivalent) and confirm the new attempt budget. Confirm a failing delegated verification retries at the same variant before escalating.

- [ ] **Step 3: Record** the observed behaviour in the analysis note's verification section.

---

### Task 11: Bring the runbook in line

**Files:**
- Modify: `docs/model-router.md:39-45`, `:90-91`, `:122-130`, `:154`

**Interfaces:**
- Consumes: the resolved choices in the design's §11.
- Produces: a runbook that matches the live configuration.

- [ ] **Step 1: Fix the tier table**

The live preset is `fast: minimax/m3.1 medium`, `medium: deepseek-v4.1 max`, `heavy: gpt-6.1-terra high`, with `costRatio` 1/3/8. Replace the reversed `high`/`max` rows and the 3/6 ratio example.

- [ ] **Step 2: Document frozen mode**

Add a short section: what `mode: "frozen"` does, that it honours pins and exact picks, that existing sessions keep their durable base, and how to roll back to `static`.

- [ ] **Step 3: Note the measured reality**

Link the efficiency note and state the realised ratio (1 : 6.6 : 19.7 per dispatch) and that two-thirds of spend is orchestrator context, so a reader does not re-derive the wrong model from the stale table.

- [ ] **Step 4: Commit**

```bash
git add docs/model-router.md
git commit -m "docs: correct tier presets and document frozen effort"
```

---

## Self-Review

- **Spec coverage:** frozen mode (Tasks 1-5), truthful line (Tasks 6-8), duplicate row removal (Task 9), retry decision (Task 10), runbook (Task 11). The design's §7 tests map to Tasks 1-4 and 7. The note's §10 excluded items remain excluded.
- **Type consistency:** `StepIdentity` is defined once (Task 6) and consumed by `stepLabel` (Task 7) and the subagent tab (Task 8). `Resolution.mode`, `EffortStatus.mode`, and the protocol literal are widened in the same order, with codegen before typecheck.
- **Open risk:** Task 8 is gated on an observation, not an assumption. If child steps are not delivered, the plan stops there rather than inventing a data path.
- **Proportion:** no task transcribes a function body the tests already determine, except the two pure helpers whose shape is the decision.
