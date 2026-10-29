# Plan: Adaptive effort mode (`effort_policy.mode: "adaptive"`)

Status: Approved direction (phase ladder + hysteresis; opt-in mode first; 2026-10-29)
Related: `docs/spec/effort-policy.md`, `docs/intent/effort-policy.md`, `perf/token-reasoning/README.md`

## Problem

Auto (unset variant) at base `standard` delegates to the provider default tier and
only moves on a verifier failure — the feature the operator intended as active,
automatic effort switching behaves as a dormant no-op until something breaks.
Real usage data (2026-10-29, opencode-dev.db): 224 sessions, zero policy
decisions, every reply at pinned or provider-default tiers.

## Behavior (opt-in `mode: "adaptive"`; `static` stays today's behavior)

- **Operation seed.** A session without an exact pick seeds its level from its
  agent's delegation operation (`operationFor` + `operationStart`):
  `plan`/`review` → `deep`, `mechanical`/`explore` → `low`,
  `general`/`implement` → `standard`. `base_level` config seeds static mode
  only.
- **Durable level, up fast.** A verification failure sets the open failure and
  raises the durable level one step (capped `deep`). The raise survives the
  clearing pass.
- **Step-down, slow.** Consecutive qualifying clean passes (same verifier,
  later sequence, revision not older than the failure — the clearing pass
  counts as the first) step the level down one at a time once
  `clean_passes` (default 2) are reached, floored at the seed. Stale passes
  and infrastructure observations neither count nor reset.
- **Decide.** Static: today's derived escalation. Adaptive: the working level
  is the durable level (seeded from base on first decision), raised by the
  plan pin; the open failure holds the raise instead of deriving it.
- **Attribution.** New `step-down` decision rule joins `base`/`mode-pin`/
  `escalated`; at-rest adaptive decisions keep `base`. Timeline notice:
  "Stepped down to {{variant}} · verification stable". Unknown rules already
  fall back to plain copy in both UIs.
- **Protocol.** `EFFORT_POLICY_PROTOCOL_VERSION` → 2 (new state fields); host
  supports 2 only.

## Changes

1. `packages/core/src/effort/policy/` (vendored pure core): `EffortState`
   gains `level?`, `cleanPasses?`, `cleanPassesNeeded?`; `DecisionRule` gains
   `step-down`; `levels.lowerLevel`; `applyEvidence` + `decide` adaptive
   branches.
2. `packages/schema/src/config/effort.ts`: `mode` (`static`/`adaptive`,
   optional), `clean_passes` (positive int, optional, default 2).
3. `packages/core/src/session/sql.ts` + migration: `session_effort` gains
   `level` (nullable text), `clean_passes` (int, default 0). Generate with
   `bun run migration --name=add_session_effort_adaptive`.
4. `packages/core/src/effort/store.ts`: carry the new columns.
5. `packages/core/src/effort/adapter.ts` + `transition.ts`: assemble adaptive
   state (seed/floor from the agent operation, config `clean_passes`), write
   level/clean passes through the durable row.
6. `packages/core/src/effort/evidence.ts`: apply observations against the
   adaptive state.
7. UI attribution: `session-timeline-row.tsx` + `tui/src/util/model.ts` + i18n.
8. Docs: spec gains an Adaptive mode section; config descriptions updated.

## Verification

- Policy unit tests (seed, bump, step-down, stale-pass neutrality, pin floor,
  cap at deep), adapter tests, evidence tests (durable writes), transition +
  recovery + session-runner scenarios, schema config test, TUI switch-label
  and session-ui notice tests.
- `bun run script/test.ts test/effort` + package typechecks; UI package tests.
- Benchmark: an adaptive arm joins `perf/token-reasoning` stages as a
  follow-up; promotion to the default mode stays behind the plan's M5/M6
  gates.
