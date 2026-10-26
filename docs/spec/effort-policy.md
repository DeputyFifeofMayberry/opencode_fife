# Spec: Effort Policy

Status: Draft — awaiting approval
Intent: `docs/intent/effort-policy.md`
Scope check: single capability (one adapter around one vendored decision core). The three policy surfaces — escalation loop, delegation minimums, plan-mode pin — share one decision call site, one state store, and one config section; they are independently verifiable acceptance groups below, not separate modules.

## Objective

Sessions run one reasoning-effort level higher while a configured verification command is failing, and return to base once the same verifier passes. The decision rules are the vendored `effort-policy-core` (`levels.ts`, `policy.ts`, `types.ts`), covering the full policy surface:

1. **Escalation loop** — configured verifier fails → one level up; same verifier passes later at a not-older revision → back to base.
2. **Delegation minimums** — subagents start at a fixed level per operation (`plan`/`review` → deep, `general`/`explore`/`implement` → standard, `mechanical` → low); explicit or inherited picks are never floored.
3. **Plan-mode pin** — while the session agent is `plan`, the effective base is the higher of base and `deep`.

User stories:

- As a user in an auto session, when `pnpm typecheck` fails, my next requests run hotter so the model digs out of the failure without me touching anything; when it passes, cost drops back.
- As a user who picked `high` in the picker, nothing ever overrides my pick.
- As a user delegating to subagents, children start at sensible effort for their operation without config.

### Host facts the design rests on (verified against `dev`)

| Fact | Consequence |
| --- | --- |
| Effort is per-session: `Session.Info.model.variant` (`packages/schema/src/model.ts`); switches go through `Session.switchModel` → `SessionEvent.ModelSelected` → `model-switched` history row → `Message.effort` part derived at request build (`to-llm-message.ts:modelSwitched`) | The policy writes transitions through `switchModel` to inherit cache-preserving markers and TUI reconciliation for free |
| Shell non-zero exit is a tool **success** carrying `metadata.exit` (`tool/plugin/shell.ts`) | Evidence classification reads `metadata.exit`, never the success/error channel |
| `tool.execute.after` hook (`tool.ts:116–159`) sees every settled tool call; `step.ts:executeTool` has tool name, call input, and `result.metadata` in scope | One classification point, plugin-style |
| Per-session monotonic `seq` exists (`Bus.reserveSequence`, `EventSequenceTable`) | Policy `sequence` reuses it |
| No numeric workspace revision exists; `Snapshot.ID` is best-effort and unordered | Policy keeps its own durable per-session revision counter |
| Plan mode is the `plan` agent; no separate state | Pin conditions on `session.agent === "plan"` |
| Variant ids are effort values only by convention (`ReasoningEfforts`, but non-effort variants exist) | Capability lookup validates against `Model.Info.variants`, never assumes |

## Adapter contract

The vendored core is never modified. The host (`packages/core`) owns four mappings:

**State custody.** One durable row per session (`session_effort`): `{ base_level, open_failure {verifier, sequence, revision} | null, revision, last_applied_variant? }`. `exact` is derived, not stored: a session has an exact pick iff `session.model.variant` is set. State is written transactionally at transition points; the policy is its only writer. Durable events stay minimal: `session.effort.transitioned { decision }` is published edge-triggered (escalation opens or clears, never per request).

**Auto mode.** A session is *auto* iff `session.model.variant` is unset (the picker's "default") and the policy is configured. Any user pick sets a variant → `exact` → the policy never escalates it (core rule). Policy-induced `switchModel` writes are recognized by comparing against `last_applied_variant`; a `ModelSelected` carrying anything else is a user pick and becomes the new exact baseline.

**Evidence.** At tool settlement, a call is classified:

- `verification-failure` — tool name is a shell-class tool, the command matches a configured verifier exactly (trimmed), and `metadata.exit !== 0`.
- `verification-pass` — same match, `metadata.exit === 0`.
- `infrastructure` — everything else, including spawn failure, cancel, and timeout.

`verifier` = the core's `\0`-joined identity (tool, normalized command, working directory). `sequence` = the session bus `seq` at settlement. `revision` = the durable counter, incremented when a file-mutating tool settles successfully (default set: `write`, `edit`, `multiedit`, `patch`; config-extensible). Known v1 limitation: shell-mediated file mutations do not bump revision; documented, not hidden.

**Capability.** Per resolved model: `efforts` = advertised effort variant ids in `ReasoningEfforts` order; `defaultEffort` = the model's default variant if any. Level→variant resolution follows `resolveLevelEffort` and validates against the model's variants; an unresolvable level yields `untouched`.

**Decision point.** Per step, at request prepare: build `EffortState { base, exact, pin, openFailure }`, call `decide(capability, state)`. `Decision.effort` present and different from the current request effort → policy calls `Session.switchModel` to the resolved variant (same model, new variant — the cache-preserving path). `untouched` → nothing written.

**Delegation.** At subagent child creation (`tool/plugin/subagent.ts`), resolve the child's starting variant: explicit `model` override > agent-configured variant > inherited parent variant (all verbatim, never floored) > `operationStart(operation)` resolved against the child model → set as child variant at creation. Agent→operation defaults: `plan`→plan, `explore`→explore, `general`→general, `build`→implement, `review`→review (for custom agents by name); overridable per agent in config.

## Tech Stack

No new dependencies. Vendored core: plain TypeScript, ported with `.ts` extension imports per core policy. Host code: Effect, Effect Schema, Bun test — matching `packages/core` conventions.

## Commands

```
Test (policy + adapter):  cd packages/core && bun test test/effort
Type check:               bun run check          # repo root
Generate (only if HttpApi/protocol surface changes — expected: no):  bun run generate
```

## Project Structure

```
packages/core/src/effort/policy/     → vendored verbatim: levels.ts, policy.ts, types.ts, index.ts
packages/core/src/effort/adapter.ts  → capability lookup, decide call, switchModel transition
packages/core/src/effort/evidence.ts → verifier classification, sequence/revision
packages/core/src/effort/state.ts    → durable session_effort read/write
packages/core/src/effort/delegation.ts → agent→operation mapping, child variant resolution
packages/schema/src/config/effort.ts → ConfigEffort (verification_commands, base_level, mutating_tools, agent_operations)
packages/schema/src/session-event.ts → session.effort.transitioned durable event
packages/core/src/session/sql.ts + database/migration/ → session_effort table + migration
packages/core/test/effort/           → ported core suites + adapter/evidence/delegation integration tests
packages/tui/...dialog-variant.tsx   → "auto" affordance only if picker labeling needs it (picker "default" already = auto)
```

## Code Style

Vendored files keep upstream doc comments and are never re-formatted beyond repo lint. Host code follows repo style — Effect generators bind services to named variables, no `else` chains, helpers below exports:

```ts
export function classify(input: {
  readonly tool: string
  readonly command: string | undefined
  readonly exit: number | undefined
  readonly verifiers: readonly ConfigEffort.Verifier[]
}): EvidenceObservation["kind"] | undefined {
  if (input.exit === undefined) return undefined
  const verifier = matchVerifier(input.tool, input.command, input.verifiers)
  if (verifier === undefined) return undefined
  return input.exit === 0 ? "verification-pass" : "verification-failure"
}
```

## Testing Strategy

- **Vendored core suites** ported 1:1 into `packages/core/test/effort/` (level resolution, policy transitions, decision precedence) plus the portability guard adapted to assert no host imports leaked *into* the vendored directory.
- **Adapter integration tests** with the existing harness (`TestLLM`, real SQLite, real `Bus`): verifier fails → next request carries raised effort via a `model-switched` marker; pass clears; exact pick suppresses; plan pin; restart recovery from the `session_effort` row.
- **Evidence tests** with the real shell tool fixtures (`test/lib/tool.ts`): non-zero exit classifies as failure (tool still succeeds), spawn failure classifies as infrastructure.
- **Config tests** for the new schema section.
- No LLM/HTTP mocks; no `globalThis` stubs.

## Boundaries

- **Always:** port the core verbatim (upstream rule changes are protocol version bumps, guarded by `EFFORT_POLICY_PROTOCOL_VERSION` refusal); keep the vendored directory free of host imports; run `bun run check` before done; run tests from `packages/core`, never repo root.
- **Ask first:** changes to `packages/schema` public surfaces beyond the listed additions (config section, one event type), any new migration beyond `session_effort`, touching `Model.Ref` semantics, TUI changes beyond the picker label.
- **Never:** modify vendored policy logic to fit the host; classify unconfigured commands as verifications; escalate a session with an exact pick; publish per-request events; edit generated client files by hand.

## Success Criteria

1. Configured verifier exits non-zero → within the same session the next request runs at the resolved escalated effort, auditable via a `session.effort.transitioned` event with `rule: "escalated"`.
2. The same verifier exits 0 at a later sequence and not-older revision → next request is back at base; a stale pass (earlier sequence or older revision) does not clear.
3. A user-selected variant is written verbatim with `rule: "exact-base"` and never escalated, in every state.
4. Subagent children start at their operation's level only when nothing explicit or inherited exists; inherited lower levels are not floored.
5. With agent `plan` and no exact pick, effective base is `deep`.
6. Effort switches preserve the provider prompt cache on `supportsEffortUpdates` routes (marker present in request messages).
7. Routes advertising no reasoning stay untouched in all states.
8. Unconfigured commands never change policy state, and infrastructure failures never open escalations.
9. Escalation state survives a server restart (durable row honored, no duplicate transitions).
10. Ported core suites pass unchanged against the vendored sources.

## Open Questions

1. **Default base level for auto sessions** — proposal: `standard` (auto is then a no-op until a failure, pure upside); `low` available in config for cost savings. Confirm.
2. **Verifier matching** — proposal: exact trimmed match of the full command text; compound commands (`a && b`) match per segment. Enough, or do you want prefix/glob matching?
3. **Revision mutation set** — default file tools listed above; accept the bash-mutation limitation for v1?
4. **Config default state** — policy is inert unless `verification_commands` is non-empty (no global `enabled` flag). Confirm.
