# Effective Effort Resolution — Architecture Spec

Status: Proposed (permanent infrastructure). No production code changed yet.
Implements the decision in: `EFFECTIVE_EFFORT_ARCHITECTURE_EVALUATION.md` (this directory).
Amends behavior docs on landing: `docs/spec/effort-policy.md` ("Decision surface").
Protocol version: unchanged (2). Public contracts: unchanged.

## 1. Architecture overview

One pure function — `EffortAdapter.resolve` — assembles the policy's inputs from host state and
returns the decision. The execution path (`EffortTransition.apply`) and the reporting path
(`EffortStatus.describe`) both call it on their own snapshots and keep their existing roles:
`apply` acts, `describe` reports. The vendored decision core (`effort/policy/`) is untouched and
remains the only authority on *rules*; `resolve` becomes the only authority on *which inputs the
rules see*.

```
policy (state, agent, selection, model) ──► EffortAdapter.resolve ──► Resolution
                                                                          │
                                              ┌───────────────────────────┤
                                              ▼                           ▼
                                   EffortTransition.apply      EffortStatus.describe
                                   (orchestration: reads,       (projection: protocol
                                    writes, publishes)           Session.EffortStatus)
```

## 2. Responsibilities and boundaries

| Module | Responsible for | Explicitly NOT responsible for |
| --- | --- | --- |
| `effort/policy/` (vendored) | decision rules, evidence transitions, level ladders | host types, IO, persistence, config reading |
| `EffortAdapter` | route capability, `Inputs → EffortState`, **and now: host state → `Resolution`** | applying decisions, publishing events, rendering |
| `EffortTransition.apply` | lifecycle: read session/row/policy/model, act on `Resolution.decision`, publish `ModelSelected` + `EffortTransitioned`, record the row | deciding rules (delegated), reporting |
| `EffortStatus.describe` | projecting a snapshot into the protocol struct, including `support`/`control`/verifier fields | writing anything, re-deriving inputs |
| `EffortStore` | durable state; the only writer of `session_effort` | deriving decisions |
| `EffortEvidence` / `EffortVerification` | escalation state via `classify`/`applyEvidence`; harness scheduling | request-time decisions (unchanged; keeps its own intentional `EffortState` assembly without exact/pin) |

## 3. Data flow

See the evaluation document §3.2. After the change, the duplicated assembly box collapses into
`EffortAdapter.resolve`; the arrows into it are unchanged, the arrows out of it gain one typed
`Resolution`.

## 4. TypeScript contracts

Added to `packages/core/src/effort/adapter.ts` (imports stay type-only for host state:

```ts
import type { ConfigEffort } from "@opencode/schema/config/effort"
import type { EffortStore } from "./store.js"

/** Everything one resolution produced, for callers that act or report. */
export interface Resolution {
  /** Policy mode; absent config means static. */
  readonly mode: "static" | "adaptive"
  /** The effective base level: durable row, else adaptive ladder seed, else configured base, else standard. */
  readonly baseLevel: EffortLevel
  /** The session's selected variant with the "default" sentinel removed; absent means Auto. */
  readonly selectedVariant?: string
  /** The user's exact pick after removing the policy's own echo; absent means the policy decides. */
  readonly exact?: string
  /** Route support, from the resolved model's advertised efforts. */
  readonly support: "unknown" | "unsupported" | "supported"
  /** The decision for this snapshot; absent only when the model is unknown. */
  readonly decision?: Decision
}

export function resolve(input: {
  readonly policy?: ConfigEffort.Info
  readonly state?: EffortStore.Info
  readonly agent: string
  readonly model?: Model.Info
  readonly selection?: Model.Ref
}): Resolution
```

Behavior (each line moved verbatim from the call sites it replaces):

- `mode = policy?.mode ?? "static"`
- `selectedVariant = selection?.variant === "default" ? undefined : selection?.variant`
- `exact = selectedVariant !== undefined && selectedVariant !== state?.lastAppliedVariant
  ? selectedVariant : undefined` — the policy's own write is an echo, never a user pick.
- `baseLevel = state?.baseLevel ?? (mode === "adaptive"
  ? sessionSeed(operationFor(agent, policy?.agent_operations))
  : (policy?.base_level ?? "standard"))`
- `support` from `capability(model)`; `"unknown"` when no model was supplied.
- `decision = model === undefined ? undefined : decideFor(model, { variant: exact, baseLevel,
  agent, openFailure: state?.openFailure, ...(mode === "adaptive" ? { level: state?.level ??
  baseLevel, cleanPasses: state?.cleanPasses ?? 0, cleanPassesNeeded: policy?.clean_passes ?? 2 }
  : {}) })`

`EffortAdapter.capability`, `stateFor`, `decideFor`, `EffortTransition.apply`,
`EffortStatus.describe` keep their existing exported signatures. `Resolution` is new;
`Decision`, `EffortState`, `Session.EffortStatus` are unchanged.

## 5. Decision and lifecycle semantics

Precedence, highest first (implemented in `policy/decide`, fed by `resolve`):

1. Exact pick (verbatim, never escalated; unadvertised picks leave the route untouched).
2. Plan-agent pin (`agent === "plan"` → base floored at `deep`, `adapter.ts:60`).
3. Escalation: static mode derives one level above the effective base while a failure is open;
   adaptive mode holds the durable raise the evidence loop applied.
4. Base level; `standard` resolves to the model default, which clears the variant.
5. Untouched: routes advertising fewer than two real efforts take no effort in any state.

Lifecycle distinctions that must never blur:

- **Configured** (`effort_policy`) seeds only sessions without a row; editing it later does not
  move existing sessions.
- **Decided** (`Resolution.decision`) is per snapshot; it is recomputed per step attempt
  (`llm.ts:329-338`) and per status request (`session.ts:205-213`). It is never cached.
- **Applied** is only ever the durable variant written through `ModelSelected`
  (`transition.ts:105-128`), marked `metadata.source: "effort-policy"`.
- **Reported** distinguishes `selectedVariant` (applied), `currentLevel` (durable adaptive
  level), and `next` (decision for the next step — `status.ts:9`). A future effort is never
  reported as applied; `next` is a separate field with an explicit name.

## 6. Execution integration

`apply` replaces its inline assembly (current `transition.ts:50-75`) with:

1. Read session; absent → `false`. Read row; read policy; read model info; absent model →
   `false` (unchanged silent-skip: there is nothing to apply to).
2. `const resolution = EffortAdapter.resolve({ policy, state: row, agent: input.agent, model:
   info, selection: session.model })`.
3. Act on `resolution.decision` exactly as today: untouched/exact-base handling, seed-row
   materialization using `resolution.baseLevel`, `decision.effort ===
   resolution.selectedVariant` as the no-change test, and the write/publish/record sequence.
4. Return `true` only when the session changed (unchanged contract consumed at `llm.ts:338`).

## 7. Reporting integration

`describe` keeps its exact input and output and delegates the derivation:

1. `const resolution = EffortAdapter.resolve(input)`.
2. Project: `mode`, `support`, `next: resolution.decision`, `selectedVariant`,
   `baseLevel` from `resolution`; `control` from `resolution.exact !== undefined`; the verifier
   and clean-pass fields continue to come from `policy`/`state` directly (state presentation,
   not decision rules).
3. The missing-model branch keeps reporting `support: "unknown"`, `next: undefined`.

## 8. State and persistence rules

- No new durable state. No new columns. `session_effort` remains the single durable row
  (`store.ts:19-34`); the policy stays its only writer through `recordSelection`,
  `recordEvidence`, `setVerdict`, `bumpWorkspaceRevision`.
- Derived values are never persisted. `lastAppliedVariant` stays a *filter marker* (the policy's
  echo), not a decision cache.
- `Resolution` and `Decision` are transient; two consumers evaluating different snapshots may
  legitimately disagree, and the disagreement is attributable to timing, not rules.

## 9. Extension mechanisms

- **New decision rule:** edit `effort/policy/` only; bump `EFFORT_POLICY_PROTOCOL_VERSION`;
  rule names flow to consumers via the protocol union (`session.ts:57`). Host files do not
  change.
- **New decision input:** add the field to `EffortStore.Info` (+ column), `EffortAdapter.Inputs`,
  `stateFor`, and `resolve` — one module. Consumers pass state through unchanged.
- **New sentinel:** unwrap it once, inside `resolve`; do not add unwrap sites at callers.
- **New consumer (CLI/TUI/dashboard):** read the protocol struct or the durable events; never
  re-derive a decision.

## 10. Architectural invariants

1. **Single authority:** all precedence/seeding/sentinel assembly lives in `EffortAdapter.resolve`.
2. **Purity:** `resolve`, like `decideFor`, performs no IO and reads no global state.
3. **Snapshot honesty:** consumers decide from their own snapshot; `next` never claims to be applied.
4. **One writer:** `EffortTransition.apply` remains the only writer of policy variants; `EffortStore`
   the only writer of `session_effort`; evidence classification stays in `EffortEvidence.classify`.
5. **Frozen contracts:** `apply`/`describe` signatures, `Decision`, `EffortState`,
   `Session.EffortStatus`, and the event payloads do not change.
6. **Vendored core untouched:** `effort/policy/` imports nothing but siblings
   (`import-boundary.test.ts`); protocol version stays 2.

## 11. Maintenance guidelines

- To understand *why* a session ran at an effort: read the `ModelSelected` metadata
  (`source`/`rule`) for what happened, `session_effort` for durable state, and
  `EffortAdapter.resolve` for what the next step will see.
- To change resolution behavior, you should need exactly one host edit (`adapter.ts`) plus, if
  the rules themselves change, `effort/policy/`. Edits to both `transition.ts` and `status.ts`
  for the same rule are a design smell — treat them as a regression of this architecture.
- `docs/spec/effort-policy.md` "Decision surface" is amended on landing to name `resolve` as the
  single input assembly point; the duplicated-assembly description then reads as history.
