# Spec: Effort Policy

Status: Adopted (v1 behavior; shipped in `packages/core/src/effort`)
Intent: `docs/intent/effort-policy.md` (original design and acceptance history)
Related: `perf/token-reasoning/README.md` (benchmark contract), `script/benchmark-effort.ts`

This document describes the effort policy as it behaves today. It makes no
measured savings or quality claims; evidence requirements live in the benchmark
README and no claim in this document depends on one.

## Profiles

The three policy profiles map onto the existing base levels, least to most
expensive. The default stays `standard` (balanced); nothing here changes it.

| Profile | Base level | Objective | Guardrail |
| --- | --- | --- | --- |
| Efficiency | `low` | Lowest all-in cost per verified success | Verified success and serious-defect rate non-inferior; latency ceiling respected |
| Balanced | `standard` | Best joint cost, quality, latency tradeoff | Same non-inferiority within declared cost and latency ceilings |
| Quality | `deep` | Highest verified success on difficult tasks | Cost per verified success and P90 latency stay within declared ceilings |

These objectives decide future comparisons, not runtime behavior. At runtime a
base level is just a starting point; the escalation loop, plan pin, and
delegation minimums below apply on top of whichever base is configured.

## Decision surface

One decision per prepared step (`EffortTransition.apply`), resolved by the
vendored core (`effort/policy`) and written through the same durable
`ModelSelected` event as a manual switch, so cache-preserving markers,
projections, and TUI reconciliation behave identically.

Precedence, highest first:

1. **Exact pick.** A session variant the user selected — session picker, CLI
   `--model provider/model#variant`, or an agent's configured model — is written
   verbatim (`exact-base`) and never escalated. The policy recognizes its own
   writes (`last_applied_variant`); any other variant is the user's and becomes
   the new baseline. Non-effort variants (`thinking`) leave requests untouched.
2. **Plan pin.** While the session's agent is `plan`, the effective base is the
   higher of the configured base and `deep`.
3. **Escalation.** With an open verification failure, one level above the
   effective base, capped at `deep`. Clearing is evidence-based (below).
4. **Base.** The configured or seeded base level. `standard` means the model
   default: the variant is cleared, never written as a literal `standard`.
5. **Untouched.** Routes advertising fewer than two effort variants take no
   effort in any state; the request goes out as-is.

The variant picker labels the unset state **Auto**: selecting it clears an exact
pick, so the policy decides each step. A named variant remains an exact pick.

Automatic levels are `low`, `standard`, `deep` (`packages/core/src/effort/policy/levels.ts`);
level-to-variant resolution validates against the resolved model's advertised
variants (`EffortAdapter.capability`). `deep` prefers `max`, then the most
expensive advertised variant. A provider that aliases or lacks a tier simply
gets `untouched` for that transition; runtime never assumes a tier it was not
shown. What the provider actually applies on the wire is a benchmark concern
(Stage 0 effective-effort matrix), not a runtime guarantee.

## Escalation loop

Configured commands (`effort_policy.verification_commands`) classify at tool
settlement. Command matching is exact per segment, so compound commands
(`build && pnpm typecheck`) match on any segment; a non-zero exit opens an
escalation and a zero exit clears one. Clearing requires the pass to be no older
than the failure (sequence) and not from a pre-mutation workspace (revision):
file-mutating tools — `write`, `edit`, `patch` by default, extensible via
`effort_policy.mutating_tools` — advance the revision on successful settlement.

- The policy is inert while `verification_commands` is empty.
- Spawn failures, cancels, timeouts, and unconfigured commands change nothing.
- The v1 verifier identity is the configured command per session; it ignores
  the working directory. Known v1 limitation: shell-mediated file mutations do
  not advance the revision, so a stale pass through the shell can clear an
  escalation that a tool-path mutation would have kept open.

State is one durable row per session (`session_effort`), so escalation survives
restarts. `session.effort.transitioned` is published edge-triggered — when an
escalation opens or clears — never per request.

## Delegation minimums

A created subagent with no explicit or inherited variant is seeded with its
operation's start level as the child's base: `plan`/`review` seed `deep`,
`general`/`explore`/`implement` seed `standard`, `mechanical` seeds `low`.
Built-in agents map by name (`plan`, `review`, `explore`, `general`,
`build`→`implement`); `effort_policy.agent_operations` overrides per agent id.
Explicit picks — on the delegation, the agent's model, or inherited — win
verbatim and are never floored; the operation level is an escalatable base, not
an exact pick.

## Durable state and config

The per-session row is the durable source for base level and open failure;
configuration only seeds sessions that have no row yet. Editing
`effort_policy.base_level` later does not move existing sessions. `standard`
requires no configuration: an auto session is a no-op until a verification
failure opens an escalation.

```jsonc
{
  "effort_policy": {
    "verification_commands": ["pnpm typecheck"],
    "base_level": "standard",
    "mutating_tools": ["write", "edit", "patch"],
    "agent_operations": { "reviewer": "review" }
  }
}
```

The example decodes against `ConfigEffort.Info`
(`packages/schema/src/config/effort.ts`, covered by
`packages/schema/test/config.test.ts`).

## Known sharp edges

- **Top-level default model drops `#variant`.** Config normalization omits an
  unsupported legacy variant on the top-level configured default model
  (`packages/schema/src/config/normalize.ts`), so `provider/model#variant`
  there does not produce an exact pick. Pick exactly via `--model`, an agent's
  model, or the session picker.
- **Agent `request` settings are not applied by the primary request path.**
  Per-agent `request.body`/headers merge into the agent record but have no Core
  consumer for model request construction; never rely on them to set effort.
  Verify what the wire carries, not what the agent record says.
- **Provider tiers are conventions.** Variant ids that look like efforts are
  only efforts if the route advertises them (`ReasoningEfforts` ∩
  `Model.Info.variants`); providers may alias tiers. Unsupported levels remain
  `untouched`, and benchmark reports must distinguish "no transition required",
  "unsupported automatic policy", and "provider effective tier unknown".

## Benchmark

Cost, quality, and latency comparisons run through the Milestone 3 harness
(`script/benchmark-effort.ts`, `perf/token-reasoning/`). Preflight only starts a
comparison whose arms resolve to distinct provider-visible efforts, stage
ceilings are enforced admission limits behind an explicit approval, and live
stages are separate from this document's behavior claims. The benchmark
contract, counting rules, and limitations are in
`perf/token-reasoning/README.md`.
