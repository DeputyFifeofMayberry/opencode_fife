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
projections, and TUI reconciliation behave identically. Policy writes carry
`metadata.source: "effort-policy"` plus the deciding `rule` (`base`, `mode-pin`,
`escalated`), and the session and terminal timelines use that marker to say why
the variant moved — "Escalated to max · verification failed", "Plan mode · max
effort", "Effort policy set Auto" — while a manual switch keeps its plain
"Switched variant" notice. The unset state reads as Auto everywhere it is shown:
the composer's variant control, the per-reply model meta on models that advertise
variants, and the terminal status line.

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
settlement. Identity is the bare command, matched exactly, with the working
directory ignored: `pnpm typecheck` matches, while
`pnpm typecheck --pretty=false`, `build && pnpm typecheck`, redirections, quotes,
and shell substitution do not. A shell reports one status for a complete
expression, so a compound or decorated command has no exit that can be attributed
to the verifier itself.

A non-zero exit opens an escalation; a zero exit clears one. Clearing requires the
same verifier, a strictly newer observation order, and a revision that is not
older than the failure's. File-mutating tools — `write`, `edit`, `patch` by
default, extensible via `effort_policy.mutating_tools` — advance the revision when
they start, and so does any shell command that is not a verifier. Running a
verifier never advances it.

Because identity ignores the working directory, a session can clear its escalation
by running the configured command wherever that command succeeds. The pass has to
be real, but the directory is not part of the evidence. That is the accepted
trade-off for not silently disabling escalation when a directory moves.

Observation order is a durable per-session counter (`evidence_sequence`), claimed
once per qualifying settlement inside the transaction that records its effect. It
is independent of the session's event log.

## Adaptive mode

`effort_policy.mode: "adaptive"` replaces the derived escalation with a durable
controller; `static` (default) keeps the behavior above.

- **Seed.** A session without an exact pick seeds its level from its agent's
  operation (`sessionSeed`): `plan`/`review` → `deep`, `mechanical`/`explore` →
  `low`, `general`/`implement` → `standard`. `base_level` seeds static mode
  only. Delegation minimums are unchanged: children still seed through
  `operationStart`.
- **Up fast.** A verification failure opens the failure and raises the durable
  level one step, capped at `deep`. The raise survives the clearing pass.
- **Down slow.** Consecutive qualifying clean passes — the clearing pass is the
  first — step the level down one at a time once `effort_policy.clean_passes`
  (default 2) accumulate, floored at the seed. Stale passes and infrastructure
  observations neither count nor reset. A failure resets the counter, and so does
  any revision bump; because every non-verifier shell dispatch bumps, the counter
  only accumulates across quiet stretches.
- **Decide.** The working level is the durable level, raised by the plan pin;
  the open failure holds the raise instead of deriving it. A level above the
  base with no open failure reports `step-down`, and the timeline renders it as
  "Stepped down to {{variant}} · verification stable".
- **State.** The level and clean-pass counter live in `session_effort`
  (`level`, `clean_passes`); the transition materializes the seed row on a
  session's first adaptive decision so later evidence has durable state.
  Protocol version is 2; the host refuses other versions.

## Harness verification

Adaptive mode does not wait for the model to run a verifier. When a turn
completes (`DrainResult.Complete`) and the session's state is dirty — a mutation
since the last recorded verdict, an open failure, a level above the seed, or a
changed workspace digest — the runner executes one configured verifier itself in
the session's directory and feeds the settlement through the same evidence path
(`EffortEvidence.observe`, tool `harness-verifier`).

- **Selection.** The verifier named by the open failure, when it is still
  configured; otherwise the first configured entry whose exit can be attributed.
  One command per idle boundary. An unusable entry is skipped and warned about
  once per process. The harness runs nothing when the failure's verifier cannot
  clear it — because it is configured but unusable, or because it is no longer
  configured at all. The policy clears a failure only for the same verifier, so
  another command could never recover it and would spend one run per idle pass.
- **Currency.** A harness run records the revision and a workspace digest
  (`git status --porcelain` hash when the session directory is a repository;
  revision fallback otherwise) in `session_effort` (`verdict_revision`,
  `verdict_digest`), so the next idle pass can tell whether the work it verified
  is still the work on disk. The digest is taken before the run, so a verifier
  that touches the workspace leaves it stale and costs one more pass. A raised
  level also keeps the session dirty until the clean-pass threshold decays it, so
  several passes can follow one failure.
- **Overlap.** A verdict is discarded when the session revision changed while the
  verifier ran. The session stays dirty and the next idle pass tries again; any
  evidence the run already recorded stands.
- **Cancellation.** A new busy period for the same session cancels the pending
  run (`session.effort` fibers join by session in a `FiberMap`). Cancelled,
  timed-out (`verification_timeout`, default 120s), and spawn-failed runs are
  infrastructure: no state change.
- **Consent.** Configuring `verification_commands` is the consent surface; the
  commands run permission-free, mirroring the benchmark runner's contract.
- **Config reach.** The policy resolves from global config too, so sessions in
  directories without a project config are governed by user-scope
  `effort_policy`.

- The policy is inert while `verification_commands` is empty.
- Spawn failures, cancels, timeouts, and unconfigured commands change nothing.
- Verifier identity is the configured command alone; it ignores the working
  directory. A shell command that is not a verifier advances the revision, so a
  shell-mediated mutation no longer lets a stale pass clear an escalation.

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
