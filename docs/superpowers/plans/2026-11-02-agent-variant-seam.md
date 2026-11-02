# Agent Variant Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a top-level `variant` on an agent definition reach `model.variant`, so a router tier's pinned effort takes effect.

**Architecture:** Accept `variant` on `ConfigAgent.Info` so decoding keeps it, then fold it into the model selection in the single runtime agent transform. Nested `model.variant` wins; a variant without a model is ignored with a warning. No new config key.

**Tech Stack:** TypeScript, Effect Schema, Bun test.

**Spec:** `docs/superpowers/specs/2026-11-02-agent-variant-seam-design.md`

## Global Constraints

- Touch only `packages/schema` and `packages/core`, plus tests and docs. No `opencode-model-router` changes.
- One fold point: `packages/core/src/config/plugin/agent.ts` around lines 104-109. Do not add folding to `normalize.ts`.
- Nested `model.variant` always wins over a top-level `variant`.
- Do not validate variant ids against the model catalog. An unknown id must still fail later at model resolution.
- Do not change markdown legacy behaviour: `model: x/y` plus `variant: high` already becomes `x/y#high`.
- No new config key and no migration.

## Review Focus

- A top-level variant beside a string model must fold, not be dropped.
- A top-level variant beside an already-nested variant must lose.
- A variant with no model must leave the model unset and warn, not crash.
- Markdown legacy agent behaviour must be unchanged.
- An unknown variant id (`medium`) must survive config load unchanged and fail loudly at resolution, never be silently corrected or rejected at load.

---

### Task 1: Fold a top-level agent variant into the model selection

**Files:**
- Modify: `packages/schema/src/config/agent.ts`
- Modify: `packages/core/src/config/plugin/agent.ts:104-109`
- Test: `packages/core/test/config/agent.test.ts`

**Interfaces:**
- Consumes: `ConfigModel.Selection` (`packages/schema/src/config/model.ts`), which already carries `variant` on its explicit form.
- Produces: nothing new. The runtime agent's `model` gains an optional `variant`; `ConfigAgent.Info` gains an optional `variant`.

- [ ] **Step 1: Write the failing test**

In `packages/core/test/config/agent.test.ts`, inside the same `describe` block as the test at line 355, add:

```ts
it.effect("folds a top-level agent variant into the model selection", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const entries = [
      new Document({
        type: "document",
        info: decode({
          agents: {
            folded: { model: "deepseek/deepseek-flash", variant: "high" },
            nested: { model: "deepseek/deepseek-flash#max", variant: "low" },
            orphan: { variant: "high" },
            unknown: { model: "deepseek/deepseek-flash", variant: "medium" },
          },
        }),
      }),
    ]

    yield* ConfigAgentPlugin.Plugin.effect(host({ agent: agentHost(agents) })).pipe(
      Effect.provide(Config.testLayer(entries)),
    )

    const folded = yield* agents.get(Agent.ID.make("folded"))
    expect(folded?.model).toEqual({ providerID: "deepseek", id: "deepseek-flash", variant: "high" })

    const nested = yield* agents.get(Agent.ID.make("nested"))
    expect(nested?.model?.variant).toBe("max")

    const orphan = yield* agents.get(Agent.ID.make("orphan"))
    expect(orphan?.model).toBeUndefined()

    const unknown = yield* agents.get(Agent.ID.make("unknown"))
    expect(unknown?.model?.variant).toBe("medium")
  }),
)
```

The `unknown` case is deliberate: config load must not validate variant ids.

- [ ] **Step 2: Run the test to verify it fails**

Run from `packages/core`: `bun test test/config/agent.test.ts`
Expected: FAIL — decoding rejects the unknown top-level `variant` key, or `model.variant` is `undefined`.

- [ ] **Step 3: Accept the field in the schema**

In `packages/schema/src/config/agent.ts`, add to `Info`:

```ts
variant: VariantID.pipe(optional),
```

Import `VariantID` the same way `packages/schema/src/config/model.ts` does. This only keeps the value through decoding; it does not validate it against any catalog.

- [ ] **Step 4: Fold at the transform**

In `packages/core/src/config/plugin/agent.ts`, replace the model block at lines 104-109 so a nested variant wins:

```ts
if (item.model !== undefined) {
  const variant = item.model.variant ?? item.variant
  agent.model = {
    id: item.model.model,
    providerID: item.model.providerID,
    ...(variant === undefined ? {} : { variant }),
  }
}
```

- [ ] **Step 5: Warn when a variant has no model**

Still in that transform, when `item.variant !== undefined && item.model === undefined`, emit the file's existing warning style:

```ts
yield* Effect.logWarning("ignored agent variant without a model", { agent: agentID, variant: item.variant })
```

Keep the model untouched in that case.

- [ ] **Step 6: Run the tests**

Run from `packages/core`: `bun test test/config/agent.test.ts`
Expected: PASS, including all pre-existing markdown legacy cases.

- [ ] **Step 7: Typecheck and regression-test**

Run from `packages/core`: `bun typecheck`
Expected: no errors.

Run from `packages/core`: `bun test test/effort`
Expected: no new failures (142 tests pass today).

- [ ] **Step 8: Commit**

```bash
git add packages/schema/src/config/agent.ts packages/core/src/config/plugin/agent.ts packages/core/test/config/agent.test.ts
git commit -m "fix(config): fold agent-level variant into the model selection"
```

---

### Task 2: Pin the tier variants in the router overrides

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`

**Interfaces:**
- Consumes: the fold from Task 1.
- Produces: `medium` and `heavy` registered with `model.variant`.

- [ ] **Step 1: Add the pins**

In the `fife` preset, leave `fast` untouched and set:

```jsonc
"medium": { "model": "deepseek/deepseek-flash", "variant": "high", "costRatio": 3 },
"heavy":  { "model": "deepseek/deepseek-flash", "variant": "max",  "costRatio": 6 }
```

Do not add `variantSteps`, `effortBump`, or a `subagentTiers` entry. `subagentTiers` skips names that are also tier names, so it cannot carry these pins.

- [ ] **Step 2: Restart the server and verify the registered agents**

Restart the elected server so the router config hook re-runs, then query the server's agent list (same method as the verification section of `docs/model-router.md`).

Expected:
- `medium.model` = `{ providerID: "deepseek", id: "deepseek-flash", variant: "high" }`
- `heavy.model` = `{ providerID: "deepseek", id: "deepseek-flash", variant: "max" }`
- `fast.model.variant` = `undefined`

- [ ] **Step 3: Verify one real delegation**

Delegate a trivial task to `medium` with no `model` argument, then read the child session's model ref.

Expected: `variant: "high"` on the child's model. This proves the agent registration carried the pin and the effort policy did not seed over it.

- [ ] **Step 4: Record the result**

Append the observed values to `docs/superpowers/notes/2026-11-01-model-router-rollout.md` under a new "Per-tier effort pins" heading. No commit for the user config file; it lives outside the repo.

---

### Task 3: Document the pin semantics

**Files:**
- Modify: `docs/model-router.md`
- Modify: `docs/superpowers/specs/2026-11-02-agent-variant-seam-design.md` (set `Status:` to `Implemented`)

**Interfaces:**
- Consumes: verified behaviour from Tasks 1 and 2.
- Produces: operator instructions.

- [ ] **Step 1: Add a runbook section**

In `docs/model-router.md`, after the tier-preset section, add "Per-tier effort pins":

- A tier `variant` pins that tier to an exact pick: the fork's effort policy neither seeds nor escalates it.
- Valid ids are whatever the tier's model advertises. `deepseek/deepseek-flash` and `opencode/glm-5.3-flash-free` both advertise `low`, `high`, `max`; neither has `medium`.
- A caller can still override one delegation with `model="provider/model#variant"`.
- An unknown id fails at model resolution; it is not silently corrected.
- Rollback: delete the `variant` key from the tier entry and restart.

- [ ] **Step 2: Mark the design implemented**

Change `Status: Awaiting approval` to `Status: Implemented` in the spec, and note the pin values that shipped.

- [ ] **Step 3: Commit**

```bash
git add docs/model-router.md docs/superpowers/specs/2026-11-02-agent-variant-seam-design.md docs/superpowers/notes/2026-11-01-model-router-rollout.md
git commit -m "docs: record per-tier effort pins"
```
