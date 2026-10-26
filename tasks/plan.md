# Implementation Plan: Effort Policy

Spec: `docs/spec/effort-policy.md` (approved) · Intent: `docs/intent/effort-policy.md`

## Overview

Integrate the vendored `effort-policy-core` decision rules into `packages/core` so sessions automatically raise reasoning effort while a configured verification command fails and return to base when it passes, plus delegation effort minimums for subagents and the plan-mode pin. All policy decisions flow through the existing per-session variant machinery (`Session.switchModel` → `ModelSelected` → `model-switched` markers), so cache preservation, TUI reconciliation, and audit come from infrastructure that already exists.

## Architecture Decisions

- **Write-through, not overlay.** Policy transitions call `Session.switchModel` (same model, new variant). A `last_applied_variant` field in the durable state row distinguishes policy writes from user picks; anything the policy didn't write becomes the user's `exact` baseline.
- **Vendored core is untouchable.** `packages/core/src/effort/policy/` holds upstream sources verbatim with a boundary test; the adapter asserts `EFFORT_POLICY_PROTOCOL_VERSION === 1` and refuses otherwise.
- **Evidence at tool settlement.** Classification reads `metadata.exit` (shell non-zero exits are tool successes), scoped to configured verifiers matched exactly; everything else is infrastructure. Sequence = session bus `seq`; revision = a new durable per-session counter over configured mutating tools.
- **State is one durable row per session** (`session_effort`), written transactionally by the policy as single writer; `exact` is derived from `session.model.variant`, never stored.
- **Events are edge-triggered.** `session.effort.transitioned { decision }` publishes only when escalation opens or clears — never per request.

## Task List

### Phase 1: Foundation

- [x] Task 1: Vendor the decision core and port its suites
- [ ] Task 2: Config section (`ConfigEffort`)
- [ ] Task 3: Durable state store (`session_effort` table + helpers)

### Checkpoint: Foundation
- [ ] Ported core suites pass unchanged against vendored sources
- [ ] Boundary test proves the vendored directory imports nothing from the host
- [ ] `bun run check` clean; `session_effort` migration applies on a real database

### Phase 2: Escalation loop

- [ ] Task 4: Capability lookup + `decide()` at request prepare (no writes yet; plan pin included)
- [ ] Task 5: Transition write-through (`switchModel`, user-pick classification, `session.effort.transitioned` event)
- [ ] Task 6: Evidence classification at tool settlement (sequence + revision), closing the loop

### Checkpoint: Escalation loop
- [ ] End-to-end test passes: configured verifier fails → next request escalated → same verifier passes → back to base; stale pass does not clear
- [ ] Exact-pick suppression and untouched-route criteria demonstrated in tests

### Phase 3: Full surface + polish

- [ ] Task 7: Delegation minimums at subagent child creation
- [ ] Task 8: Restart recovery, prompt-cache marker verification, docs, live smoke

### Checkpoint: Complete
- [ ] All ten spec success criteria verified
- [ ] `bun run check` clean from repo root; tests run from `packages/core`
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Policy-induced `ModelSelected` misread as a user pick (kills escalation) | High | `last_applied_variant` invariant; the adapter is the only policy writer; tests cover both write orders and restart timing (Task 5) |
| Prompt-cache invalidation on flapping verifiers | Med | Edge-triggered transitions only; `Message.effort` markers asserted present on switch requests (Task 8, spec criterion 6) |
| Migration breaks existing databases | Med | Additive table only, standard `DatabaseMigration` pattern, applied-then-verified in Task 3 tests |
| Vendored drift from upstream | Low | 1:1 ported suites + boundary guard + protocol version refusal |
| Evidence noise from hosted/remote tools | Low | v1 classifies local shell-class tools only; unclassifiable calls return `undefined` and change nothing |

## Decided (formerly Open Questions)

Base level defaults to `standard` (auto is a no-op until failure); verifier matching is exact-trimmed with per-segment matching for compound commands; revision bumps only for configured file tools (`write`, `edit`, `multiedit`, `patch` — shell mutations don't count in v1); policy is inert unless `verification_commands` is non-empty.

Tasks are recorded in `tasks/todo.md`.
