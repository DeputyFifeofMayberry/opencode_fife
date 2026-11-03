# Plan Change Log — Tier Usage Simulation

Based on: `docs/superpowers/plans/2026-11-02-tier-usage-simulation.md` (draft v1)
Result: `docs/superpowers/plans/2026-11-02-tier-usage-simulation.final.md`

| Change ID | Original section | Change in final plan | Reason / finding ID | Requirement impact | Approval needed? |
| --- | --- | --- | --- | --- | --- |
| C1 | Task 9 Step 2, Task 6 Step 5 | Removed the per-model multiplier from the monthly projection. Replaced with a single `validationFactor` derived from the invoice: `(billedUSD − localNonHeavy) / localHeavy`, or 1 when the delta is within 15%. | F1, F10 — stored cost already contains the Terra gap; applying `k` again double-counts. | Corrects the headline monthly figure from ~$34.59 to ~$14.38 for the same data. Changes the decision output, not the measurement procedure. | No |
| C2 | All verification steps (Tasks 2, 4, 5, 8, 10) | Replaced every `bun -e` one-liner with a named `check.ts` mode. Added a hard constraint forbidding `bun -e`. | F2 — verified PowerShell quoting failure. | Five verification steps that would have failed now run. | No |
| C3 | Task 7 Step 2 | Added a concurrency cap of 3 with wave-completion gating. | F3 — unbounded fan-out changes cache and throttling behaviour. | Run takes longer; measurement becomes representative of a real day. | No |
| C4 | New Task 1 Steps 3–4 | Added a `check.ts config` mode that reads runtime evidence from `decisions.jsonl` and exits non-zero if the effective per-tier models differ from the preset. Added `00-preflight.json` and `matchesPlan`. | F4 — config drift would invalidate the run. | Adds one blocking gate before any spend. | No |
| C5 | Task 6 Step 5, Task 10 Section 8 | Added `fastMonthly` to the reconciliation output and required section 8 to report it alongside the spec's "fast is free" claim. | F5 — measured fast cost is ~$0.0072/dispatch, ~$9.7/month. | Report now surfaces a spec/measurement contradiction the decision rule ignores. Spec itself untouched. | User decision on whether to amend the spec |
| C6 | Task 5 Step 1 | `summarise` now filters non-finite values and reports `n` per metric. | F6 — nulls in `durationMs` and `tokens` would produce `NaN`. | Prevents an unreadable statistics table. | No |
| C7 | Task 9 Step 3 | Added `bandCertain` and the `inconclusive-band` outcome when the CI straddles both thresholds. | F7 — a point estimate cannot decide a threshold rule. | The plan can now return "cannot decide" instead of a false confident band. | No |
| C8 | Task 6 Step 2 | Multiplier verdict requires `n ≥ 5`; below that it reports `"insufficient"` and cannot influence any adjustment. | F8 — `cv` on two points is not evidence. | `impliedMultiplier` becomes diagnostic only. | No |
| C9 | Task 7 Steps 1, 4 | Replaced the ~9× headroom claim with a ~2× worst-case range; added a $0.50 per-dispatch ceiling, a $6 mid-block abort, and checks every 3 heavy dispatches. | F9 — heavy cost variance is the dominant budget risk. | Stronger spend protection; the $10 cap is now enforced per dispatch, not per block. | No |
| C10 | Established facts, Review Focus 1, Task 6 Step 2, Task 9 Step 2 | Corrected the multiplier from 2.5855 to 2.4053 and catalog costs from $0.021181/$0.019997 to $0.0232126/$0.0210848. | F10 — the draft's exploratory script priced reasoning tokens at the input rate. | Correct baseline figures throughout; the double-counting error in C1 was found by the same check. | No |
| C11 | Task 1 Step 6, Task 6 Step 3 | Added `periodGrain` to the billing baseline and a hard rule that the run must sit inside one reporting period. | F11 — a run crossing UTC midnight compared to a daily period is meaningless. | Prevents a false `deltaPct`. | No |
| C12 | Task 3 Interfaces | Specified one exported pure function `classifySessions` plus a `main`. | F12 — the draft described it as both a function and a script. | Task 8 can reuse the function rather than re-parsing. | No |
| C13 | Task 8 Step 3 | Run-log filter changed from "skip two header lines" to `^\d+\s*\|`; log format forbids `|` in fields. | F13 — the parser broke on preamble edits or pipes in content. | Parser survives formatting drift. | No |
| C14 | New `.gitignore` | Added `data/sandbox/` and an oversized raw dump to `.gitignore`; extracted JSONL and the report stay tracked. | F14 — generated churn would be committed. | Evidence stays reviewable without noise. | No |
| C15 | Header, Boundary section | Added explicit Status, review depth, evidence baseline, and a non-goals boundary stating the run measures cost, not capability. | Standard review deliverable; also prevents the report from drifting into a quality judgement. | Clarifies what the answer does and does not cover. | No |
| C16 | Task 8 Step 2 | Added `reconcile.ts` to the post-run regeneration, with an expectation that `verdict` is not `inconclusive`. | F15 — without it `validationFactor` stayed at 1 and the invoice adjustment could never fire. | The billing cross-check now actually reaches the decision instead of being decorative. | No |
| C17 | Task 6 Interfaces | Removed the undefined `projection` field from `reconcile.json`. | F16 — a second, undefined projection risked a duplicate adjustment. | Single derivation path for the monthly figure. | No |
| C18 | Task 2 Step 5, Task 8 Step 3 | Added `readJsonlAbs` and split helper usage by source directory. | F17 — the router-scoped helper would throw on absolute `data/` paths. | `cost-sums` and `coverage` now run. | No |
| C19 | Established facts, Task 6 Step 2, Task 2 Step 6 | Date-stamped the evidence snapshot, corrected counts to 107 timings rows / 181 sessions / 0 unmatched, recorded the third Terra row at k = 1.1442, and marked the unmatched branch untested unless observed. | F18 — counts had drifted within the same session, and the `-fast` specificity of the pricing gap is material. | The plan no longer asserts stale numbers, and the model-id question is now evidence-backed. | No |
| C20 | Task 4 Interfaces, Task 6 Step 3/5, Task 9 Step 2, Task 10 Step 7, `.gitignore`, verification table | Fixed interface drift: derived `deltaUSD` and `monthlyCI95`, added `sources.none`, unified `topLevelGatewayUSD`, defined `zeroCost`, removed a dead ignore entry, reworded a literal `bun -e` in prose, added the `classify-truth` verification row. | F19 — internal consistency. | The plan can be executed without inferring field meanings. | No |

## Preserved decisions and scope

These were carried forward unchanged from the draft and the spec:

- The decision rule's thresholds: under ~$100/month keep Terra `xhigh`; over ~$200/month drop to DeepSeek V4.1 Flash `max` with a stated ceiling of 32; between is the operator's call. Copied from spec lines 213–215.
- The $10 total budget and the read-only treatment of all telemetry.
- `session_v2` as the source of truth for cost, model and variant; `timings.jsonl` for tier and duration; the Vercel invoice as the independent check.
- Statistics must report count, total, mean, median, p90, min and max — never a mean alone.
- Subagent and orchestrator sessions reported separately.
- No edits to router configuration, model prices, or files outside the measurement directory; no `.changeset`.
- Location `docs/superpowers/measurements/2026-11-02-tier-usage-simulation/` is retained despite introducing a new sibling directory under `docs/superpowers/`. It keeps evidence self-contained and separate from `plans/` and `specs/`, and moving it would add churn without benefit.

## Changes not made

| Suggestion | Why declined |
| --- | --- |
| Alternative models as a control group | The decision rule is a price threshold on the heavy tier, but the only alternative offered by the spec, DeepSeek `max`, would need its own paid sample, and no A/B was authorized. Recorded as an explicit limitation instead. |
| Raising the heavy sample above 9 to tighten the p90 | A second heavy block would answer "what does a heavy dispatch cost when I choose the input", not "what does a real day cost". The plan keeps the real-day count and reports the CI, then states that the p90 is an order statistic. |
| Editing the spec to remove "fast is free" | Out of scope for a measurement plan and an approval matter for the user. Reported as a discrepancy with a measured figure. |
| Automating the dashboard read | No API access is configured, and adding one would expand scope and credentials handling. Manual read with a recorded period label remains. |
| Using a global billing ratio instead of the heavy-attributed factor | Both are now reported. The heavy-attributed ratio is primary because MiniMax and DeepSeek were verified at k = 1.0000, so attributing the delta to heavy is the better-supported inference; the global ratio is kept visible so a reader can see how much the choice matters. |
| Replacing the whole-task scripts with one orchestrating script | The task boundaries are the review gates; merging them would let a failed step disappear inside a single long run. |

## Revision v3 — after the second external audit

### Architectural changes

| Change ID | Section | Change | Reason |
| --- | --- | --- | --- |
| V1 | Task 2 (whole task) | Extraction moved from session grain to **step grain** using `session_message` type `assistant`, which records `model`, `variant`, `cost`, `costProvenance` and `tokens` per step. | 3444 costed steps exist. This removes cost division across calls, token duplication, and session-level model attribution in one change. |
| V2 | Task 6 Step 1 | Hard-coded catalog constants and the `k` multiplier deleted. Effective unit rates are now solved from the step data per identity. | Solving the data gives terra = 1.00/5.00/0.05/1.25 and terra-fast = exactly 2× that. The 2.4× "anomaly" was the author's wrong constants, not a pricing bug. |
| V3 | Task 4 | Variant and model read from the step. The `decisions.jsonl` fallback removed entirely. | `decisions.sessionID` matched a `parentSessionID` 115/115 and a child 0/115, so the fallback could never fire. |
| V4 | Task 3 | Cohort built from the run log's returned session IDs; statistics keyed to those IDs rather than a time window. | A window admits unrelated projects and preparation work. |
| V5 | Task 7 Step 1 | `runStartMs` captured immediately before the first dispatch instead of reusing the Task 1 baseline timestamp. | Tasks 2–6 create sessions and cost between baseline and run. |

### Correctness fixes

| Change ID | Section | Change | Reason |
| --- | --- | --- | --- |
| V6 | Task 6 Step 2 | Sign labels corrected; explicit sign table added. `deltaPct > 0` ⇒ `local-overstates`. | v2 had the two labels reversed. |
| V7 | Task 9 Step 3 | `bandCertain` replaced by `band(lo, hi)` evaluated on the interval. | The old `||` chain declared certainty whenever the interval missed *either* threshold. |
| V8 | Task 7 Step 1/4 | Per-dispatch ceiling raised from $0.50 to $0.90, with the reachability arithmetic recorded. | `$200/(9×30) = $0.7408`; a $0.50 ceiling made the upper band unreachable by construction. |
| V9 | Task 5 Step 5, Task 9 Step 5 | Nearest-rank p90 documented as the maximum at n=9; optional 18-dispatch supplement. | `ceil(0.9×9)=9` selects the largest value, not the second-largest as v2 claimed. |
| V10 | Task 2 Step 5, Task 8 Step 2 | `cost-sums` now compares against an independent SQL total; `coverage` checks one-to-one, duplicates and outside-cohort rows. | Both v2 checks derived their evidence from the same extracted file. |
| V11 | Task 6 Step 3 | Implausible `validationFactor` now forces factor 1 with `validationStatus: invalid`. | v2 substituted the global ratio, swapping estimators after seeing a bad result. |
| V12 | Task 6 Step 2 | Verdict renamed `aggregate-within-tolerance`. | A ±15% aggregate match cannot confirm per-model prices. |
| V13 | Task 8 Step 3, Task 9 | Explicit `completed` / `stopped-early` / `invalid` states; a stopped-early run cannot claim full acceptance. | v2 allowed an early stop and then demanded 93 rows. |
| V14 | Task 1 Step 6 | Budget split into `budgetLimitUSD`, `billedToDateUSD`, `availableHeadroomUSD`. | v2 subtracted billed cost from a field already net of it. |
| V15 | Task 6 Step 5/6 | `spend.ts` expectation changed to ≈$0 since `runStartMs`. | v2 compared a since-timestamp sum against the all-time baseline. |
| V16 | Task 1 Step 4 | Preflight is now a real probe dispatch whose executed step model is read back. | v2 inferred configuration from `shadow`-mode candidate lists, and its alias check compared `terra#` against `terra-fast#xhigh`. |
| V17 | Task 7 Step 3 | Medium fixtures must actually contain the defect named in the prompt and be verified first. | A fixture without a type error produces a one-token reply and a fictitious price. |
| V18 | Task 9 Step 1 | Heavy estimator restricted to `terra#xhigh`; fallbacks and mixed-identity sessions excluded and reported. | A tier mean over mixed models prices a routing policy, not the configured model. |

### Scope and honesty changes

| Change ID | Section | Change | Reason |
| --- | --- | --- | --- |
| V19 | Boundary and non-goals; Task 10 | Result relabelled a **synthetic benchmark**; monthly cost becomes a function of dispatch count. | A fixed task sample cannot represent real daily usage, and one 7-step medium dispatch cost 5× a 5-step one. |
| V20 | Task 9 Step 4 | Scenario table over 3/6/9/18 dispatches per day and mean/median/max. | Daily frequency was an assumption presented as a rate. |
| V21 | Task 5 Step 1, Task 10 | Bootstrap CI reworded as descriptive resampling variability. | It measures variability of these observations, not sampling uncertainty about real usage. |

### Not changed, and why

| Suggestion | Why declined |
| --- | --- |
| Removing `validationFactor` entirely | Still needed: every step is `estimated`, so the invoice is the only external check on the local price table. The fix was to make it a single guarded application, not to delete it. |
| Enforcing the $10 cap from a provider-side limit | No API access is configured. Disclosed as a target rather than a guarantee. |
| Separating cost-per-attempt from cost-per-completed-task | Requires a task-level ID scheme the harness does not expose. Recorded as a limitation. |
| Immutable copies of telemetry at window edges | Adds file-copy handling for a risk not yet observed. Snapshot counts at both ends are the proportionate measure; recorded as residual risk. |

## Revision v4 — self-hardening of v3

| Change ID | Section | Change | Reason |
| --- | --- | --- | --- |
| W1 | Task 1 Step 2, Task 6 Step 2 | `snapshot.ts` now writes per-session costs (`<prefix>-sessions.json`); `localUSD` is a snapshot delta over every session. | `billedUSD` is account-wide, so a cohort-scoped `localUSD` could never match it and the verdict was guaranteed to be `local-understates`. |
| W2 | Task 2 Step 5 | Cost-conservation check deduplicated on `sessionID`, not on cost value. | Two dispatches with equal six-decimal cost were collapsed into one. |
| W3 | Task 6 Step 6 | Pre-run check no longer references `runStartMs`; expectation corrected to a few cents. | `runStartMs` is created in Task 7, and the old expectation compared a since-timestamp sum with the all-time total. |
| W4 | Task 9 Interfaces | Added the `Consumes` block; defined `heavyCI95` and its null case. | The decision's inputs were undefined, and `heavyCI95` had no producer. |
| W5 | Task 6 Step 1 | Rank-aware least squares; four independent equations required. | The previous text accepted three equations for four unknowns. |
| W6 | Task 2 Step 3 | `stepIndex` is per session. | It was a global row counter and meant nothing. |
| W7 | Task 4 Interfaces, Task 6 Step 4 | `byTierKey` defined; `fastMonthly` marked `pending-run` until the run completes. | An undefined field and a value demanded before it could exist. |
| W8 | Task 2 Step 4 | `costDeltaSessions` expectation qualified for pre- and post-run. | The pre-run figure would have been read as a post-run pass condition. |


