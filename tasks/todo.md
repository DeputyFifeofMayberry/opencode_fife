# Tasks: Effort Policy

Spec: `docs/spec/effort-policy.md` · Plan: `tasks/plan.md`

## Task 1: Vendor the decision core and port its suites

**Description:** Copy `levels.ts`, `policy.ts`, `types.ts`, `index.ts` verbatim from `DeputyFifeofMayberry/effort-policy-core` into `packages/core/src/effort/policy/`. Port the upstream level, policy, and import-boundary suites into `packages/core/test/effort/`, adapting the boundary guard to assert the vendored directory imports only from within itself.

**Acceptance criteria:**
- [x] Vendored sources are byte-identical to upstream (no re-formatting, no host imports)
- [x] Ported suites pass unchanged in behavior
- [x] Boundary test fails if a host import is added under `src/effort/policy/`

**Verification:**
- [x] `cd packages/core && bun test test/effort`
- [x] `bun run check` (repo root) — red only in `@opencode/app#typecheck`: pre-existing Windows checkout artifact (43 git symlinks materialized as text files under `core.symlinks=false`; `packages/app/src/custom-elements.d.ts` contains its target path and fails parsing before any package code). Unrelated to this branch; all other 26 turbo tasks pass.

**Dependencies:** None

**Files likely touched:**
- `packages/core/src/effort/policy/*.ts` (new)
- `packages/core/test/effort/*.test.ts` (new)

**Estimated scope:** Small (1 dir + test port)

## Task 2: Config section (`ConfigEffort`)

**Description:** Add `packages/schema/src/config/effort.ts` with `verification_commands: string[]`, `base_level` (optional `low | standard | deep`, default `standard`), `mutating_tools` (default `write/edit/multiedit/patch`), `agent_operations` (record of agent id → operation). Wire the self-export and field into `Config.Info`; consumer-side defaults read via the `Config.latest(...) ?? default` pattern.

**Acceptance criteria:**
- [x] Config decodes with the new section, defaults apply when absent
- [x] Unknown operation names rejected at the schema boundary

**Verification:**
- [x] Config decode test in `packages/core` config tests
- [x] `bun run check`

**Dependencies:** None

**Files likely touched:**
- `packages/schema/src/config/effort.ts` (new), `packages/schema/src/config.ts`
- `packages/core/test/config*.test.ts`

**Estimated scope:** Small (2-3 files)

## Task 3: Durable state store (`session_effort`)

**Description:** New `session_effort` table (session id key; `base_level`, `open_failure` JSON, `revision` counter, `last_applied_variant` JSON) with one additive `DatabaseMigration`, registered in `migration.gen.ts`. Helpers in `packages/core/src/effort/state.ts` for transactional read/update as the single writer.

**Acceptance criteria:**
- [x] Migration applies cleanly to a database with existing sessions
- [x] Roundtrip read/update test passes against real SQLite
- [x] Concurrent update serialized through the helper (no lost update in tests)

**Verification:**
- [x] `cd packages/core && bun test test/effort test/database`
- [x] `bun run check`

**Dependencies:** None (parallel with Tasks 1-2)

**Files likely touched:**
- `packages/core/src/effort/state.ts` (new), `packages/core/src/session/sql.ts`
- `packages/core/src/database/migration/<ts>_effort_policy.ts` (new), `migration.gen.ts`
- `packages/core/test/effort/state.test.ts` (new)

**Estimated scope:** Medium (3-5 files)

## Checkpoint: Foundation
- [x] Ported suites green; boundary guard green; migration applies; `bun run check` clean (pre-existing `packages/app` artifact per Task 1 note)
- [x] Review with human before proceeding

## Task 4: Capability lookup + `decide()` at request prepare

**Description:** Build `EffortCapability` from the resolved model's effort variants (validated against `Model.Info.variants`, ordered by `ReasoningEfforts`, `defaultEffort` from the model default). Assemble `EffortState { base, exact (variant set?), pin (agent === "plan" → deep), openFailure }` from session + state row, call `decide()`, and resolve `Decision.effort` to a concrete variant id. No writes yet — the decision is computed and observable. Assert `EFFORT_POLICY_PROTOCOL_VERSION` and refuse unknown versions.

**Acceptance criteria:**
- [x] Auto session at base `standard` with no open failure decides `untouched`
- [x] Open failure escalates one level, resolving to a real variant id or `untouched` when unresolvable
- [x] Exact pick returns `exact-base` verbatim; plan agent pins `deep`; no-reasoning route stays untouched

**Verification:**
- [x] `cd packages/core && bun test test/effort`
- [x] `bun run check`

**Dependencies:** Tasks 1, 2, 3

**Files likely touched:**
- `packages/core/src/effort/adapter.ts` (new)
- `packages/core/src/session/runner/` prepare-path hook (small)
- `packages/core/test/effort/adapter.test.ts` (new)

**Estimated scope:** Medium (3-4 files)

## Task 5: Transition write-through

**Description:** When `decide()` yields an effort different from the request's current one, the adapter calls `Session.switchModel` (same model, new variant). Maintain `last_applied_variant`: a `ModelSelected` matching it is a policy echo; anything else is a user pick and becomes the session's `exact` baseline (recorded via state update). Add the `session.effort.transitioned { decision }` durable event in `packages/schema/src/session-event.ts`, published edge-triggered.

**Acceptance criteria:**
- [x] Escalation writes the raised variant; clear restores the base variant (or unsets to auto)
- [x] A user pick mid-escalation suppresses further escalation (exact wins) in the same session
- [x] Event publishes on open and clear only — repeated identical decisions publish nothing

**Verification:**
- [x] `cd packages/core && bun test test/effort test/session-runner`
- [x] `bun run check`

**Dependencies:** Task 4

**Files likely touched:**
- `packages/core/src/effort/adapter.ts`, `packages/core/src/session/session.ts` (caller only)
- `packages/schema/src/session-event.ts`
- `packages/core/test/effort/transition.test.ts` (new)

**Estimated scope:** Medium (3-4 files)

## Task 6: Evidence classification at tool settlement

**Description:** Classify settled tool calls at the settlement point (tool name, call input, `result.metadata` in scope): configured verifier + `exit !== 0` → `verification-failure`; `exit === 0` → `verification-pass`; spawn/cancel/timeout and all non-verifier calls → no state change (infrastructure/undefined). Apply via `applyEvidence()` with sequence = session bus `seq`; bump `revision` when a configured mutating tool settles successfully. This closes the loop end to end.

**Acceptance criteria:**
- [x] Non-zero exit on a configured verifier opens escalation; exit 0 on the same verifier clears it at later sequence and not-older revision
- [x] Stale pass (earlier sequence or older revision) never clears; unconfigured commands never touch state
- [x] Mutating tool settlement bumps revision; shell timeout/cancel classifies as infrastructure

**Verification:**
- [x] `cd packages/core && bun test test/effort test/tool-shell`
- [x] End-to-end loop test (fail → escalate → pass → restore) green
- [x] `bun run check`

**Dependencies:** Tasks 3, 5

**Files likely touched:**
- `packages/core/src/effort/evidence.ts` (new)
- `packages/core/src/session/runner/step.ts` (settlement hook, small)
- `packages/core/test/effort/evidence.test.ts` (new)

**Estimated scope:** Medium (3-4 files)

## Checkpoint: Escalation loop
- [x] End-to-end loop green including stale-pass and exact-pick suppression
- [x] Review with human before proceeding

## Task 7: Delegation minimums at subagent child creation

**Description:** Map agents to `DelegationOperation` (defaults: `plan`→plan, `explore`→explore, `general`→general, `build`→implement, `review`→review; `agent_operations` config overrides). At subagent child creation, set the child's starting variant from `operationStart(operation)` only when no explicit model override, agent-configured variant, or inherited parent variant exists — explicit and inherited picks are verbatim and never floored.

**Acceptance criteria:**
- [x] Child with nothing inherited starts at its operation's start level (seeded as the policy base; the child's own policy writes the variant through the normal transition path)
- [x] Inherited parent variant lower than the operation minimum is kept as-is (not floored)
- [x] Explicit override and agent-configured variant always win verbatim

**Verification:**
- [x] `cd packages/core && bun test test/effort test/tool-subagent test/subagent-lifetime`
- [x] `bun run check`

**Dependencies:** Tasks 2, 4 (capability resolution)

**Files likely touched:**
- `packages/core/src/effort/delegation.ts` (new), `packages/core/src/tool/plugin/subagent.ts` (small hook)
- `packages/core/test/effort/delegation.test.ts` (new)

**Estimated scope:** Medium (3-4 files)

## Task 8: Restart recovery, cache markers, docs, live smoke

**Description:** Verify escalation state survives server restart (durable row honored, no duplicate transitions on first step after recovery). Assert `Message.effort` markers appear on policy-switched requests so `supportsEffortUpdates` routes keep their prompt cache. Touch up docs (`docs/spec` cross-links, config annotations) and run a live smoke with `bun run dev:live`: configure a failing verifier, watch effort rise and restore. Optionally label the picker's "default" option as the auto affordance.

**Acceptance criteria:**
- [x] Restart mid-escalation resumes the escalated level exactly once
- [x] Policy-switched requests carry the effort marker on supporting routes (spec criterion 6)
- [x] All ten spec success criteria checked off
- [ ] Manual: `bun run dev:live` against the local dev daemon with a configured verifier — config-path bug found and fixed (`effort_policy` was stripped by config normalization; commit `8fe74cf576`); the model leg is blocked on the opencode free-tier quota (429, resets ~daily). Re-run when quota returns or with a paid provider.

**Verification:**
- [x] `cd packages/core && bun test test/effort`
- [x] `bun run check` from repo root — red only in the pre-existing `packages/app` symlink artifact (Task 1 note); unrelated to this branch
- [ ] Manual: `bun run dev:live` with a configured verifier, observe transition and restore

**Dependencies:** Tasks 5, 6

**Files likely touched:**
- `packages/core/test/effort/recovery.test.ts` (new)
- `packages/tui/src/component/dialog-variant.tsx` (label only, optional)
- `docs/spec/effort-policy.md` (criteria checklist)

**Estimated scope:** Medium (3-4 files)

## Checkpoint: Complete
- [x] All spec success criteria verified
- [x] `bun run check` clean except the pre-existing `packages/app` artifact; full `packages/core` effort suites green
- [ ] Ready for review (pending manual live smoke)
