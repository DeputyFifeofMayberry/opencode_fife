# Intent: Effort Policy Integration

Date: 2026-10-26
Status: Confirmed

## Outcome

Sessions in this fork automatically run one reasoning-effort level higher while a
configured verification command is failing, and return to base once the same
verifier passes. The decision rules come from
[`effort-policy-core`](https://github.com/DeputyFifeofMayberry/effort-policy-core)
(`levels.ts`, `policy.ts`, `types.ts`), vendored verbatim into `packages/core/src`,
covering the full policy surface:

- **Escalation loop** — a configured verifier's failure opens an escalation; the
  same verifier passing at a later sequence and not-older revision clears it.
- **Delegation operation minimums** — subagents start at a fixed level per
  operation (`plan`/`review` → deep, `general`/`explore`/`implement` → standard,
  `mechanical` → low).
- **Plan-mode pin** — while plan mode is active, the effective base is the higher
  of base and the pin.

## User

The fork maintainer, running opencode sessions. The policy works silently
underneath the existing effort plumbing; the TUI already surfaces effort.

## Why now

The portable decision core was extracted for exactly this purpose. `dev` already
has cache-safe effort-switch transport (`packages/ai/src/effort-updates.ts`,
per-message `Message.effort` markers), but nothing decides *when* to switch.

## Success

- A configured verifier fails → subsequent requests run one level higher,
  auditable via `Decision.rule` (`escalated`).
- The same verifier passes later at a not-older revision → back to base.
- Manual effort picks are `exact`: written verbatim, never escalated, unless the
  session opts into auto mode.
- Effort switches preserve the provider prompt cache (existing transport).
- Routes advertising no reasoning stay `untouched`, by design.

## Constraints

- Effort policy only. No npm dependency, none of the rest of the Mayberry SDD
  tooling. The core's rules are vendored and ported with their tests — never
  re-implemented or altered (a rule change upstream is a protocol version bump,
  checked via `EFFORT_POLICY_PROTOCOL_VERSION`).

## Out of scope

- Anything else in the Mayberry SDD.
- Publishing `@mayberry/effort-policy-core` to npm or consuming it as a registry
  dependency.
- Other hosts.
- Models/routes without reasoning support.

## Interview decisions

| Question | Decision |
| --- | --- |
| What counts as a verification failure? | Configured verifiers only; all other command failures change nothing. |
| Manual effort pick vs policy? | Exact by default; an auto opt-in (picker option + config default) makes picks escalatable base. |
| V1 scope? | Full policy surface: escalation + delegation minimums + plan-mode pin. |
| How the core lands? | Vendored as a module inside `packages/core/src`, tests ported to the repo's bun-test style. |

## Deferred to spec (proposed defaults)

- Verifier configuration shape: shell commands in opencode config, matched
  against tool calls; verifier identity = tool + normalized command + cwd
  (the core's `\0`-joined form).
- Classification: configured verifier exit ≠ 0 → `verification-failure`; exit 0 →
  `verification-pass`; spawn/crash errors → `infrastructure`.
- Escalation state is durable per session.
- Agent → `DelegationOperation` mapping defined against the repo's actual agents.
- Sequence and revision counters mapped onto existing session/workspace monotonic
  values.
