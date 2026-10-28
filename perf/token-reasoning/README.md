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

## Execute mode (Stage 0 discovery)

```sh
bun script/benchmark-effort.ts perf/token-reasoning/smoke.json --stage smoke \
  --execute --approve-spend --model <provider/model> --out-dir <dir>
```

- Runs each admitted spec in an isolated snapshot (`git archive` of `HEAD` plus the corpus seeds),
  one `opencode run` per arm — efficiency → `#low`, balanced → the model default, quality →
  `#max` — then exports the session, runs the task's `verify` command from the snapshot root, and
  feeds `EffortBenchmarkRunner`. Explicit-file `bun test` from the root bypasses the repo's
  test-root guard, which is why `verify` names the file path.
- Corpus seeds live in `fixtures/seed/`: `*.verify.ts` files are failing tests that materialize
  into the snapshot as `fixtures/run/<name>.test.ts`; everything else copies verbatim. Tasks
  reference the materialized `run/` paths.
- Discovery skips the preflight distinctness gate on purpose: Stage 0 measures which arms actually
  resolve to distinct provider-visible tiers. The approved-ceiling gate applies regardless.
- `--approve-spend` is required for any execution; ceilings stay admission limits.

Stage 0 result (2026-10-27, `zai-coding-plan/glm-5.3-flash`, n=1 per arm, smoke task): all three
arms applied distinct wire variants (`low`, `default`, `max`) — the static E/B/Q comparison has a
valid three-arm form on this route. First smoke token counts (gross): efficiency 71,972 (28.0s),
balanced 88,847 (46.0s), quality 74,545 (52.7s) — n=1, screening-grade at best, not evidence.
Cost evidence is unavailable for this provider: no catalog rates, so runs report as unpriced
(`cost_complete: false`) and only token evidence is usable until pricing exists or external
reconciliation is performed.

## Stage 1 screening corpus

`screening.json` defines the screening stage: three seeded implementation tasks (digit-boundary
slug bug, `toRoman` implementation, debounce `leading` option) × three arms × two repetitions =
18 runs. Each task's `verify` is a seeded failing test under `fixtures/seed/`, so correctness is
deterministic and external to the model. Screening ceilings are unset (`approved: false`) until
authorized; execution also needs a priced model so cost evidence stops reporting unpriced. The
plan's review/planning task classes need independent human raters and are out of scope for this
automated screening pass.

## Stage 1 screening result (2026-10-27, live)

`openrouter/z-ai/glm-5.3-flash` (priced route), 3 seeded implementation tasks × 3 arms × 2
repetitions = 18 runs, $5 stage / $0.25 run admission ceilings; total spend $0.4278.

| Arm | Wire tier | Pass | Timeout | Fail | Gross tokens | Cost | Mean wall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| efficiency | `low` | 0/6 | 0 | 6 | 990,733 | $0.0515 | ~25s |
| balanced | default | 3/6 | 0 | 3 | 4,004,088 | $0.1805 | ~150s |
| quality | `max`/`deep` | 2/6 | 2 | 2 | 4,320,313 | $0.1958 | ~240s+ |

- **Verified success does not rise with effort**: 0/6 (efficiency) → 3/6 (balanced) → 2/6 plus two
  timeouts (quality). Cost per verified success: efficiency undefined (no passes), balanced $0.060,
  quality $0.098 — balanced is the cheaper verified success at screening grade (n=6 per arm; not
  confirmatory). The first write-up of this section transposed the balanced and quality rows;
  corrected 2026-10-27 against `manifest.json` and `report.json`.
- **The efficiency arm is rejected for this task class**: `low` passed nothing.
- **Route-dependent tier aliasing confirmed**: the quality arm's `#max` request ran as `max` in
  four runs and `deep` in two on the openrouter route (Stage 0's zai route applied `max`
  directly) — exactly the "provider effective tier unknown" class the plan requires reports to
  separate. The two `deep` runs are the two timeouts (28–48 min).
- **All runs usage-complete and priced**; `cost_complete` is false across the board because the
  harness cannot observe hidden provider retries (`provider_requests` unset) — the plan's export
  limitation, not unpriced spend. Unpriced records: 0.
- The two pre-timeout hangs exposed a Windows process-tree gap: `proc.kill()` only terminated the
  `cmd` shim while `opencode` kept the pipes open. The backend now runs `opencode run --auto`
  (permission-free, non-interactive) and tree-kills via `taskkill /t /f` on timeout.

## Stage 2 confirmatory design (predeclared)

`confirmatory.json` defines the confirmatory stage approved on 2026-10-27: the screened pair
(balanced vs quality; efficiency rejected at screening) across five seeded implementation tasks ×
four repetitions = 40 runs on `zai-coding-plan/glm-5.3-flash`, the route whose tiers resolved
distinctly in Stage 0. Stage ceiling $3, per-run ceiling $0.07.

The per-run ceiling is an admission quantum, not a billing estimate: the runner charges each run
at the run ceiling, so 40 × $0.25 would need a $10 stage ceiling. $0.07 keeps the whole matrix
inside the approved $3 while leaving the stage ceiling as the authorized cap. This route is a
subscription plan that reports an authoritative zero cost, so Stage 2 cost evidence confirms zero
marginal spend but cannot discriminate arms; the priced Stage 1 openrouter route remains the cost
reference.

Provider attempts are captured per run: the harness counts streamed `step_start` events (one per
provider attempt, because a retry re-publishes the step) plus attempted compactions in the export,
and feeds the total into the ledger's `provider_requests`.

Predeclared analysis: the primary metric is verified success rate per arm over all assigned runs;
secondary metrics are gross tokens, wall time, and cost per verified success where priced. Report
n, median, and spread per task. The pair is separated only if the quality arm's verified success
rate exceeds balanced by at least 10 points with non-overlapping Wilson 95% intervals; otherwise
it is reported as not separated. This is the confirmatory comparison for the screened pair, not a
policy promotion: the plan's M5/M6 gates still govern any default change.

## Stage 2 confirmatory result (2026-10-27, live)

40/40 runs entered, zero errored, zero skipped; all usage-complete, cost-complete, and
action-complete. Tiers resolved stably on the zai route: balanced ran as `default` in all 20
runs, quality as `max` in all 20. Provider-attempt capture is complete for every run
(`provider_requests` set, zero attempts without settlement, zero retries observed).

| Arm | Verified | Success (95% Wilson) | Gross tokens | Median tokens/run | Median wall | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| balanced | 2/20 | 10.0% [2.8%, 30.1%] | 6,020,033 | 272,067 | 168s | $0.0000 |
| quality | 4/20 | 20.0% [8.1%, 41.6%] | 6,944,461 | 302,435 | 151s | $0.0000 |

Per task (passes of 4 per arm):

| Task | balanced | quality |
| --- | --- | --- |
| screen-slug-digit-boundaries | 1/4 | 0/4 |
| screen-implement-to-roman | 1/4 | 1/4 |
| screen-debounce-leading | 0/4 | 3/4 |
| confirm-wrap-text | 0/4 | 0/4 |
| confirm-parse-bytes | 0/4 | 0/4 |

- **Not separated.** The quality arm's verified success rate is 10.0 points above balanced, but
  its Wilson 95% interval ([8.1%, 41.6%]) overlaps balanced's ([2.8%, 30.1%]), so the
  predeclared rule does not separate the pair. The direction favors quality on this corpus, but
  almost entirely through `debounce` (3/4 vs 0/4); the other four tasks are even or favor
  balanced.
- **Two tasks never passed in either arm** (`wrap-text`, `parse-bytes`, 16 runs total). Before
  any further confirmatory use, these need review for prompt/contract ambiguity or difficulty
  outside the intended band; their runs still contribute tokens and failure-rate evidence.
- **Cost is an authoritative zero on this route** (subscription plan): every run reports
  provider-attributed $0 with `cost_complete` 40/40, so cost per verified success is $0 and cost
  does not discriminate arms here. The priced Stage 1 openrouter route remains the cost reference.
- **No timeouts, and quality's median wall is slightly lower** (151s vs 168s) while using ~11%
  more median tokens per run; this stage did not reproduce Stage 1's quality-arm slowdown.
- Operational note: an earlier attempt of this stage was interrupted by a host restart after
  29/40 runs. Its exports carry no terminal verdicts and are archived outside the comparison; this
  section reports only the clean rerun.

## Tests

```sh
cd packages/core
bun run script/test.ts test/session-usage-report.test.ts
```

The plan that defines these contracts is `docs/plans/token-reasoning-optimization-plan.md`. The
effort profiles under comparison are documented in `docs/spec/effort-policy.md`.
