# Token and reasoning usage ledger

Reconciles token, cost, effort, and action evidence for a benchmark run. It reports what happened
without changing routing, prompting, or model selection. Use it before any optimization work that
claims token or reasoning savings.

The analyzer lives in `packages/core/src/session/usage-report.ts`. The CLI is a thin file reader.

## Run

```sh
opencode session export <root-session-id> > root.json
opencode session export <child-session-id> > child.json

bun script/session-usage-report.ts manifest.json \
  --export root.json --export child.json \
  --format json \
  --out report.json
```

`--export` is repeatable. `--format csv` emits one row per run. Without `--out`, the report goes to
stdout.

## Manifest

One entry per root task run. A single object or `{ "runs": [...] }` is accepted.

```json
{
  "task_id": "fix-imports-1",
  "policy": "efficiency",
  "root_session_id": "ses_...",
  "correctness": "pass",
  "stratum": "small-repo",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "requested_variant": "low",
  "cache_condition": "cold",
  "repetition": 1,
  "repository": "owner/repo@sha",
  "provider_requests": 6,
  "attribution_share": 0.25,
  "auxiliary_scope": { "title": false, "warming": false },
  "billing_verified": false
}
```

Required: `task_id`, `policy`, `root_session_id`. Everything else is optional, and absent values are
reported as `null` or `unknown` rather than guessed.

### `provider_requests`

Counts provider attempts the harness observed for the requests this export can settle: task steps
plus compactions, including failed attempts that left no settled message. Do not count title or
warming requests; declare those in `auxiliary_scope`.

Exports contain settled messages only, so retry history is not recoverable from them. When
`provider_requests` is present, the analyzer compares it with settled steps and compactions and
reports `attempts.without_settlement`. When absent, attempt completeness is reported as unknown
(`attempts.complete: false`, `source: "export"`), never as zero failures.

## Counting rules

- One run is one root session. Descendants are joined once through `parentID`. Forked sessions are
  excluded from the parent run. Repeated exports of the same session or message are deduplicated.
- A parent export lists no children, so child sessions must be exported and passed as separate
  `--export` files. An unexported child is indistinguishable from a session without children; export
  the whole run before analysis.
- Token categories stay separate and additive:
  `gross = input + cache.read + cache.write + output + reasoning`. Reasoning is never folded into
  output, and cache categories are never folded into input.
- Session aggregates are authoritative for spend and tokens. The difference between a session
  aggregate and its settled messages is reported as `tokens.delta` and `cost.unattributed`. Negative
  deltas make the run incomplete instead of being clamped to zero.

### Cost provenance

Each settled record has at most one priced origin:

- `provider`: the endpoint reported the amount, including an authoritative zero.
- `estimated`: the catalog priced a fallback.
- `unpriced`: no price was available.
- absent: `legacy_unknown`, a record written before provenance existed.

`provider`, `estimated`, and `legacy_unknown` are reported as separate amounts. `mixed` is derived
and is true only when both provider and estimated amounts are non-zero. `unpriced_records` counts
records without a price. `unattributed` is session spend not backed by any settled message, such as
title usage or activity removed by a revert.

`billing_verified` stays false unless external line-item reconciliation was performed. It is never
inferred from the presence of provider amounts.

## Completeness

| Field | True when |
| --- | --- |
| `usage_complete` | No missing sessions, every settled record has tokens, no negative token delta |
| `cost_complete` | Attempts reconcile, no unpriced records or provenance mismatches, non-negative unattributed spend, no revert, no missing sessions |
| `cost_reconciled` | `cost_complete` and zero unattributed spend |
| `billing_verified` | The manifest says external reconciliation passed |
| `reverted_activity` | A session still has staged revert state |
| `action_complete` | Every truncated tool result has full bytes, no reverts, no unsettled steps, no missing sessions or tokens |

A committed revert deletes messages and clears the revert marker. Its spend can only surface as
negative or positive unattributed cost, which is why `cost_complete` requires an exact explanation
and `cost_reconciled` requires zero unattributed spend.

## Action ledger

The analyzer records settled tool calls with a stable hash of the tool name and input. Transcript
text, tool results, paths, and queries never enter the report. Each action links to later requests
in the same pre-compaction window:

- `result_bytes_visible`: measured bytes of the visible result.
- `result_bytes_full`: full bytes when not truncated, otherwise `null`.
- `token_estimate` and `context_exposure_estimate`: labeled estimates at four bytes per token.
- `request_reasoning`: observed reasoning tokens on the request that produced the call.
- `associated_reasoning`: observed reasoning plus output on later requests in the window.
- `inferred_downstream_reasoning`: `attribution_share * associated_reasoning`, labeled inferred. It
  is `null` when no share is declared or later usage is missing.
- `later_failed_requests`: association only, not causation.

A completed compaction ends the exposure window. Truncated results without full bytes set
`unresolved_truncation` and `action_complete: false`.

## Comparisons

- Two-arm effort comparisons are valid when only two of the three effort levels are distinct.
  Report the third arm as converged or unavailable instead of forcing a third condition.
- Preserve every assigned run in the intended-policy comparison. Preflight removes configurations
  that are indistinguishable; observed convergence is reported separately, not by dropping runs.
- Spend ceilings are enforced admission limits, not exact guarantees. In-flight requests can
  overshoot a ceiling, so require provider-side limits where they exist and reserve headroom.

## Fixtures

`fixtures/` contains synthetic sessions generated from the real export schema:

```sh
bun script/session-usage-report.ts perf/token-reasoning/fixtures/usage-manifest.json \
  --export perf/token-reasoning/fixtures/session-efficiency.json \
  --export perf/token-reasoning/fixtures/session-legacy.json
```

Expected: two reconciled runs. The efficiency run mixes provider and estimated cost, records one
precomputed compaction, and keeps `action_complete: false` because its tool result was truncated.
The legacy run has no provenance and reports its spend as `legacy_unknown`. Both runs have zero
unattributed spend and two observed effort levels (`low`/`deep` and `default`), which is a valid
two-arm comparison.

## Benchmark preflight

`script/benchmark-effort.ts` is the Milestone 3 entry point. The offline `--check` mode validates a
suite manifest, classifies arm distinctness, and expands the stage's runs without spending anything:

```sh
bun script/benchmark-effort.ts perf/token-reasoning/fixtures/effort-suite.example.json \
  --stage smoke --check --model-info model.info.json
```

- Arms are the plan's fixed mapping: efficiency → `low`, balanced → `standard`, quality → `deep`.
- Preflight resolves each arm through the route's advertised variants (`EffortAdapter.capability` +
  `resolveLevelEffort`) and runs the largest valid comparison: three arms when all three are
  distinct, otherwise two. Converged and unavailable arms are reported, never dropped silently.
  Stage 0's wire measurements can supply observed effective tiers, which override the written
  effort when a provider aliases tiers.
- Stage ceilings are enforced admission limits, not spend guarantees: requests already in flight
  when a ceiling trips still complete, so actuals can overshoot. The runner refuses to start a live
  stage whose `approved` flag is false, and no live execution path exists until the Milestone 3
  runner lands behind an explicit approval flag.
- `perf/token-reasoning/tasks.json` is the declarative corpus. Its smoke tasks are placeholders for
  pipeline bring-up only; Stage 1 requires rubric-scored tasks with predeclared thresholds.

## Tests

```sh
cd packages/core
bun run script/test.ts test/session-usage-report.test.ts
```

The plan that defines these contracts is `docs/plans/token-reasoning-optimization-plan.md`. The
effort profiles under comparison are documented in `docs/spec/effort-policy.md`.
