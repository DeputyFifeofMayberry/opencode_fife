# Plan Review Report — Tier Usage Simulation

## Verdict

**CONDITIONAL.** The plan is executable, and its two most dangerous remaining defects were found and fixed in the v4 self-hardening pass: the reconciliation compared a cohort-scoped local total against an account-wide invoice, and the cost-conservation check deduplicated by cost value instead of session ID. Both would have produced confident but wrong numbers. What keeps the verdict at CONDITIONAL rather than READY is unchanged: one post-run decision belongs to the user, the invoice is not readable by this review, and three audit findings are only partly mitigated.

## Review scope and evidence

- **Review tier:** Standard. The work is read-only analysis plus a capped $10 spend on a local database; no production state, no migration, no authentication surface, nothing irreversible beyond the money. Deep was not warranted.
- **Draft reviewed:** `docs/superpowers/plans/2026-11-02-tier-usage-simulation.md`.
- **Repository baseline:** working tree of `Y:\CodingProjects\opencode_fife`; no commit was made for the draft, so the plan itself is uncommitted.
- **Evidence inspected directly:**
  - `session_v2` DDL, row count (179), one full row, agent histogram, `parent_id` split, distinct `model` values, `time_created` range.
  - `timings.jsonl` (106 rows), `decisions.jsonl` (113), `turns.jsonl` (253), `outcomes.json` entry structure.
  - `session_part` row count (0) and `session_effort` DDL.
  - Catalog-price reconciliation against stored `cost` for all six gateway sessions.
  - Spec section 9 decision rule and section 5 superseded figures, read verbatim.
  - Shell behaviour: `bun -e` with string literals executes and fails on this host; the failure reproduced twice.
- **Independent checks:** the cost arithmetic and the double-counting question were put to a separate review session at a higher capability tier with no repository access, which independently reproduced the error and corrected the multiplier from 2.59 to 2.41. A second fresh session verified internal consistency of the revised plan.
- **Not available:** Vercel dashboard access. Catalog prices and the true billed total could not be verified by this review; the plan treats both as hypotheses with an explicit measurement step.

## Findings

| ID | Severity | Evidence status | Finding | Evidence/reference | Resolution | State |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Blocker | Verified | Monthly projection multiplied stored heavy cost by the per-model multiplier `k`, double-counting the Terra discrepancy. Draft Task 9 computed `heavyMean × 2.5855 × 9 × 30` where `heavyMean` was already derived from stored cost containing that gap. | Terra rows: stored $0.055455 / $0.051060; catalog $0.0232126 / $0.0210848; k = 2.389 / 2.422. Applying k again gives $34.59/month instead of $14.38. | Projection now uses a single billing-derived `validationFactor`: `(billedUSD − localNonHeavy) / localHeavy`, or 1 when billing agrees within 15%. `k` is demoted to a diagnostic. Task 9 Step 2 states the prohibition explicitly with a worked example. | Resolved |
| F2 | High | Verified | Every `bun -e` verification command containing a string literal fails under PowerShell, because inner quotes are stripped before Bun sees them. Five steps would have failed at execution. | `bun -e "...\"...\"..."` → `error: Unterminated string literal`; single-quoted form → `Expected ")" but found ":"`. | All verification moved into named `check.ts` modes (`config`, `schema`, `timings-keys`, `dedupe`, `cost-sums`, `classify-truth`, `coverage`, `numbers`). A hard constraint forbids `bun -e`. | Resolved |
| F3 | High | Likely | Draft dispatched 45 fast tasks with no concurrency bound. Unbounded fan-out changes the quantity being measured: shared cache lowers cache-write cost, throttling inflates duration, and overlapping `startedAt` conflates timings. | Draft Task 7 Step 2; harness backgrounds subagents by default. | Task 7 Step 2 caps concurrency at 3 with wave completion gating, and states why. | Resolved |
| F4 | High | Verified | No preflight confirmed the router still resolved fast/medium/heavy to the models the plan assumes. Config drift would invalidate the whole run silently. | `decisions.jsonl` candidate models are observable; preset is asserted only in prose. | New Task 1 Step 4 with a `check.ts config` mode reading runtime evidence, exiting non-zero on mismatch, plus `matchesPlan` recorded in `00-preflight.json`. | Resolved |
| F5 | High | Verified | The spec asserts "fast is free and contributes nothing either way". Measured fast dispatches run MiniMax at ~$0.0072, roughly $9.7/month at 45/day. The spec's decision rule therefore understates total router cost. | Spec line 217; `session_v2` row `minimax/minimax-m3.1-flash#medium`, cost 0.007211. | Task 6 Step 5 requires a `fastMonthly` figure; Task 10 section 8 must report it with the contradiction named. The spec is not edited — that is an approval matter, not a measurement one. | Resolved |
| F6 | Medium | Verified | Statistics would produce `NaN` because `durationMs` is null for `untimed` dispatches and `tokens` is null for `unmatched`. | Draft Task 5 reducer took `values` without filtering. | `summarise` filters non-finite values and returns `n` per metric; Task 5 Step 2 states why this is not defensive noise. | Resolved |
| F7 | Medium | Likely | Band assignment used a point estimate against $100/$200 thresholds with no certainty test. A mean of $97 with a $40–$260 interval does not support "keep Terra". | Draft Task 9 Step 3. | Added `bandCertain` and an `inconclusive-band` outcome whenever the CI straddles both thresholds. | Resolved |
| F8 | Medium | Verified | `cv` was to be computed on n=2 for Terra, then used to decide whether to trust the multiplier. A two-point standard deviation is arithmetic, not evidence. | Draft Task 6 Step 2. | Multiplier verdict now requires `n ≥ 5`; below that it reports `"insufficient"` and cannot influence anything. | Resolved |
| F9 | Medium | Likely | No per-dispatch cost ceiling, and the draft claimed ~9× budget headroom using a single-observation heavy cost. A heavy task with a large pasted artifact can plausibly cost 3–10× the observed $0.053. | Draft Task 7 Step 1 arithmetic; observed heavy rows carry 18k cache-write tokens each. | Rewrote headroom as a range (~2× worst case), added a $0.50 per-dispatch ceiling, a $6 mid-block abort, and checks every 3 heavy dispatches. | Resolved |
| F10 | Medium | Verified | The draft's own quoted multiplier was wrong (2.5855) because the exploratory script priced reasoning tokens at the input rate. Independent review recomputed 2.4053. | Recomputation from the same token counts with reasoning at output rate. | All figures corrected; `k ≈ 2.41` now stated as ~2.41× throughout, with a note that the reasoning-rate assumption moves it to ~2.59. This is itself evidence for why `k` must stay diagnostic. | Resolved |
| F11 | Medium | Likely | Dashboard period granularity was unaddressed. A run crossing UTC midnight compared against a daily period yields a meaningless delta. | Draft Task 6 Step 3 mentioned periods but set no hard rule. | Added `periodGrain` to the billing baseline and a hard rule: finish inside one period or split the comparison at the boundary. | Resolved |
| F12 | Low | Verified | `classify.ts` was described both as an exported function signature and as a file-reading script. | Draft Task 3 Interfaces. | Now specifies one exported pure function `classifySessions` plus a `main`, so Task 8 can reuse it. | Resolved |
| F13 | Low | Verified | The run-log parser skipped a fixed two header lines and split on `|`, breaking on any preamble edit or a `|` inside a field. | Draft Task 8 Step 3. | Filter is `^\d+\s*\|`; the log format forbids `|` in fields. | Resolved |
| F14 | Low | Verified | `data/sandbox/` and raw dumps would be committed, adding generated churn to the evidence directory. | `git check-ignore` returns exit 1 for the whole path. | Added a `.gitignore` covering `data/sandbox/` while keeping extracted JSONL and the report tracked as evidence. | Resolved |
| F15 | High | Verified | Task 8 regenerated six data files but never re-ran `reconcile.ts`. `validationFactor` would have stayed at 1, so the invoice adjustment in Task 9 could never fire and a `local-overstates` verdict would silently produce an unadjusted projection. | Second verification pass, cross-task ordering check. | `reconcile.ts` added to Task 8 Step 2, with an expectation that `verdict` is not `inconclusive`. | Resolved |
| F16 | Medium | Verified | `reconcile.json` promised a `projection` field that no step computed, while a neighbouring sentence said Task 9 recomputes it. Two undefined projections risk a second adjustment path. | Task 6 Interfaces vs Task 9 Step 2. | `projection` removed from `reconcile.json`; the projection is derived once, in Task 9, and the interface says so explicitly. | Resolved |
| F17 | Medium | Verified | `check.ts` used the router-scoped `readJsonl` helper (which joins a fixed directory) against absolute `data/` paths, so `cost-sums` and `coverage` would throw. | Task 2 Step 5; Task 8 Step 3. | Added `readJsonlAbs` and split usage by source. | Resolved |
| F18 | Medium | Verified | The "Established facts" counts were stale within the same session: `timings.jsonl` had grown to 107 rows, unmatched fell from 9 to 0, `session_v2` to 181 rows, and a third Terra row appeared for the plain `openai/gpt-6.1-terra` id at k = 1.1442. | Second verification pass queried the live database. | Facts date-stamped 2026-11-02T23:09 with an instruction not to hard-code counts; the unmatched branch is explicitly marked untested unless the post-run count is non-zero; the `-fast`-specific nature of the pricing gap recorded. | Resolved |
| F19 | Low | Verified | Interface and documentation drift: `deltaUSD` and `monthlyCI95` promised without a derivation, `variantSource: "none"` absent from the `sources` union, `topLevelGatewayUSD` vs `topLevel.gatewayCost`, undefined `zeroCost` shape, a `.gitignore` entry for a file nothing produces, and a literal `bun -e` in prose that trips a mechanical grep gate. | Second verification pass, item 4 and 5. | Each renamed, derived or removed; `classify-truth` added to the verification summary table. | Resolved |

## Traceability and verification

| Requirement (original brief) | Task | Acceptance check |
| --- | --- | --- |
| Baseline from all three local sources and the dashboard | 1 | `00-baseline.json` present with `takenAt`, `totals`, `sessionsByClass`; `00-billing-baseline.json` written |
| Reproducible, non-mutating extraction harness | 2 | `check.ts schema` and `timings-keys` exit 0; read-only DB handle; byte-identical reruns |
| Classify sessions by `parent_id` and `agent` | 3 | `nonTierChildren.n ≥ 1`; tier counts match `check.ts classify-truth` |
| Reconcile the variant gap, state precedence | 4 | `sources` sum equals session-backed dispatches; `unresolved` equals `unmatched` |
| Run a simulated day | 7 | 45/39/9 logged; `check.ts coverage` exits 0 |
| Per-tier and per-variant statistics, not means | 5, 8 | Seven metrics × seven statistics per group; no `NaN`; nearest-rank p90 |
| Billing cross-check with percentage delta | 6, 9 | `deltaPct` present with a four-way verdict |
| Tier spend versus session spend | 6, 10 | `tierShare`, `topLevel.createdInWindow`, cumulative-cost caveat |
| Apply the prior decision rule | 9 | Band plus `bandCertain`, `monthlyMean`, CI |
| Document results and limits | 10 | Eleven sections; `check.ts numbers` exits 0 |

**Independent verification:** two separate sessions were used. Session one (higher tier, no repository access) was given only the token counts, stored costs and the proposed formula, and independently identified the double-counting and corrected the multiplier. Session two (fresh context, repository access) audited the revised plan for arithmetic, cross-reference, interface and command consistency. Session two found four MUST-FIX defects in the first revision — most importantly that the invoice reconciliation step was never re-run after the paid run, which would have left `validationFactor` at 1 — all of which are fixed in the final plan. Neither session is human review.

**Revision cycles:** two, within the bound set by the skill. No material issue remains open.

**Not verified by this review:** the Vercel catalog prices, the true cache-write rate, and whether the dashboard period matches the run window. All three are measurement targets, not premises the plan relies on silently.

## Open decisions and residual risks

| Item | Decision-maker | Impact | Required next action |
| --- | --- | --- | --- |
| `operator-call` band, if the projection lands between $100 and $200/month | User | Chooses between Terra `xhigh` and DeepSeek `max` with a stated ceiling of 32 | Decide after Task 9; the plan supplies the numbers and a recommendation but must not decide autonomously |
| `validationFactor` attributes the whole billing delta to the heavy tier | User / report reader | If mispricing is proportional across models instead, the heavy projection is overstated | Read section 7 of the report, which must show both the heavy-attributed and global ratios |
| n=9 heavy sample | Accepted risk | p90 is an order statistic | Report states it; the CI carries the decision |
| Whether to correct the spec's "fast is free" premise | User | Spec and measured reality disagree by ~$10/month | Decide after the report; the plan only reports the discrepancy |

## Second audit round (v2 → v3)

An external adversarial audit raised 35 findings against v2. Each was investigated against the repository and the live database rather than accepted or dismissed on argument. **33 were valid.** Two findings that previously drove the plan's centre of gravity turned out to be artefacts of the author's own assumptions, and the code investigation that settled them changed the plan's architecture.

### The decisive investigation

| Question | Result | Consequence |
| --- | --- | --- |
| Is stored `cost` provider-reported or locally estimated? | `usage.ts:54-63` prefers `usage.cost`, else catalog. **Every observed step records `costProvenance: {"estimated": N}`** — no Vercel row is provider-reported. | Stored cost is an estimate everywhere; the invoice remains the only external check. |
| Do per-call records exist? | `session_message` type `assistant` carries `model`, `cost`, `costProvenance` and `tokens` per step (3444 of 3464 rows). | Per-dispatch attribution no longer needs cost division. Findings 11, 12 and 16 dissolve. |
| Can a session change model? | 84 `model-switched` events; 5 sessions hold more than one assistant model. | Session-level `model` is invalid as a per-dispatch label. |
| Is `decisions.sessionID` the child or the parent? | **115 of 115 match a `timings.parentSessionID`; 0 match a child.** | The variant fallback joined the wrong key and could never fire. Removed. |
| Does a pricing anomaly exist? | No. Solving three Terra sessions gives exactly `1.00 / 5.00 / 0.05 / 1.25`, and `terra-fast` is exactly **2.0×** that (ratio 2.0000 twice, 1.0000 once). | The 2.4× "discrepancy" was the author's wrong constants: terra rates applied to `terra-fast`, plus cache-write assumed equal to input. `k` is deleted. |

### Dispositions

| # | Audit finding | Verdict | Action in v3 |
| --- | --- | --- | --- |
| 1 | Billing verdict signs reversed | Valid, verified | Corrected label table with an explicit sign column |
| 2 | $0.50 ceiling makes the $200 band unreachable | Valid, verified | Ceiling raised to $0.90; arithmetic `200/(9×30)=$0.7408` recorded |
| 3 | `bandCertain` uses `||` across thresholds | Valid, verified | Replaced by `band(lo,hi)` over the interval |
| 4 | Cost provenance not established | Valid, verified | Provenance recorded per step; all rows `estimated` |
| 5 | Invoice multiplier unidentifiable | Valid | Kept, but rates are now derived from data; `invalid` status forces factor 1 |
| 6 | Window starts before the experiment | Valid, verified | Fresh `runStartMs` captured immediately before the first dispatch |
| 7 | Cumulative cost ≠ window cost | Valid | Cohort keyed by IDs; top-level reported as a bound |
| 8 | `project_id` and cohort not enforced | Valid | `cohort.ts` keyed to the run log; `projectIDs` check |
| 9 | Heavy sample not representative | Valid, unfixable in budget | Relabelled a synthetic benchmark; monthly cost becomes a function of dispatch count |
| 10 | Daily frequencies are assumptions | Valid | Scenario table over 3/6/9/18 per day |
| 11 | Split rows duplicate tokens | Valid, proven from v2 code | Splitting removed; tokens summed from steps |
| 12 | Equal split is approximate | Valid, then moot | No per-call division exists any more |
| 13 | Heavy estimator mixes models | Valid | Restricted to `terra#xhigh`; fallbacks excluded and reported |
| 14 | Preflight doesn't prove config; alias bug | Valid, verified | Replaced by a real probe dispatch reading the executed model |
| 15 | Decisions join lacks a child correlation | Valid, verified | Removed; variant now read from the step |
| 16 | Session model ≠ per-call model | Valid, verified | Step grain in Task 2 and Task 4 |
| 17 | Parent/child cost may overlap | Unverified | Parent token volume accounts for its own cost; check added, residual risk noted |
| 18 | Bootstrap CI overstates certainty | Valid | Reworded as descriptive resampling variability |
| 19 | p90 at n=9 is the maximum | Valid, verified | Stated explicitly; optional 18-sample supplement |
| 20 | Zero-cost provenance unexamined | Valid | Classified `verified_free` / `unresolved_zero` |
| 21 | terra and terra-fast priced identically | Valid, and worse than stated | They differ by exactly 2×; rates derived per identity |
| 22 | Medium fixtures may lack the described defects | Valid | Fixtures must contain the defect and be verified before use |
| 23 | Burst schedule changes cache behaviour | Valid, partly mitigated | Concurrency 3 with wave gating; labelled synthetic |
| 24 | Dashboard window not tied to charges | Valid | `periodGrain` + `inconclusive` on boundary crossing |
| 25 | ±15% cannot confirm catalog pricing | Valid | Verdict renamed `aggregate-within-tolerance` |
| 26 | $10 not enforceable from local costs | Valid, partly mitigated | Ceiling + headroom + explicit disclosure that $10 is a target |
| 27 | Integrity checks circular | Valid, verified | `cost-sums` now compares against an independent query; `coverage` checks one-to-one and duplicates |
| 28 | Retries and failures undefined | Valid, partly resolved | `outcome` per dispatch; cost-per-task vs cost-per-attempt remains a stated limitation |
| 29 | Telemetry rotation/truncation | Valid, partly resolved | Snapshot counts at both ends; immutable copy not implemented (residual risk) |
| 30 | Stopped-early contradicts acceptance | Valid | Explicit `completed` / `stopped-early` / `invalid` states |
| 31 | Pre-run spend comparison mismatched | Valid, verified | Expectation changed to ≈$0 since `runStartMs` |
| 32 | Budget headroom double-subtracted | Valid | Three separate fields; definition recorded |
| 33 | DeepSeek heavy cost unmeasured | Valid | Labelled unmeasured in the decision rationale |
| 34 | Implausible factor substituted | Valid | `validationStatus: invalid` forces factor 1, scenario only |
| 35 | "fast is free" is stale | Valid | `fastMonthly` reported against the spec's claim |

### Residual gaps carried forward

Three findings are only partly addressed and remain visible as risks rather than being claimed as fixed: the $10 cap cannot be enforced from local estimates alone (26), cost-per-completed-task versus cost-per-attempt is not separated (28), and telemetry is counted at the window edges but not copied immutably (29).

## Third pass (v3 → v4): self-hardening

v3 was written quickly after the architectural change, and re-reading it against its own acceptance criteria found nine defects, two of them capable of producing a wrong verdict without any error message.

| ID | Severity | Finding | Resolution | State |
| --- | --- | --- | --- | --- |
| G1 | Blocker | `localUSD` summed cohort cost but `billedUSD` is account-wide, so the verdict was guaranteed to read `local-understates` regardless of truth. | `localUSD` is now a per-session snapshot delta over every session (`00-sessions.json` → `99-sessions.json`); `reconcile.ts` refuses to run without the post-run snapshot. | Resolved |
| G2 | Blocker | `cost-sums` deduplicated the session map on `sessionCostTotal` rather than `sessionID`, silently collapsing two dispatches with equal cost. | Keyed on `sessionID`; added `distinctSessions` to the output. | Resolved |
| G3 | High | Task 6 Step 6 invoked `spend.ts <runStartMs>` before Task 7 creates `runStartMs`. | Step rewritten as a pre-run check against the baseline snapshot; the plan now states that nothing in Task 6 may reference `runStartMs`. | Resolved |
| G4 | High | Task 6 Step 5's expected value compared a since-timestamp sum with the all-time total — the same defect the audit found as #31. | Expectation corrected to "small, a few cents at most". | Resolved |
| G5 | Medium | Task 9 had no `Consumes` block and referenced `heavyCI95`, which no task defines. | Added the inputs and defined `heavyCI95` as the bootstrap interval on the heavy mean, with a null case. | Resolved |
| G6 | Medium | Least-squares required "≥ 3 independent steps" for four unknowns. | Requires four independent equations with a rank check; degrades to `scale-only` and reports `rank`. | Resolved |
| G7 | Low | `stepIndex` was a global row counter, not a per-session index. | Per-session counter. | Resolved |
| G8 | Low | `identity.json` promised `byTierKey`, never defined; `fastMonthly` expected before the run. | Both defined, with `fastMonthlyStatus: "pending-run"` pre-run. | Resolved |
| G9 | Low | `costDeltaSessions` expectation was stated for pre-run data only and would mislead after the run. | Qualified for both phases, with child-session deltas treated as a finding. | Resolved |

### Verification of this pass

This pass was a self-review, not an independent one. That is a real limitation and it is why the verdict stays CONDITIONAL rather than moving to READY. The first two rounds had independent reviewers; both of them found defects the author had missed, so a third self-only pass should be read as "no further defects found by the author", not as "no further defects exist". A fresh reviewer on the v4 plan is the recommended next step if the run is to be trusted unconditionally.

The loop is bounded at this point: three revision cycles have been spent, and the remaining issues are either accepted risks or decisions outside the plan's authority.


## Review limitations

- The Vercel dashboard was not accessible, so no billed figure, catalog price or cache-write rate could be confirmed. The plan's reconciliation step exists precisely because of this gap.
- No repository test suite applies: the deliverables are new analysis scripts, not product code. `bun test` was not run against them because they do not exist yet; the plan's `check.ts` modes are the equivalent gate.
- Independent verification was performed by separate model sessions, not by a human engineer. The project's own approval boundary still applies.
- One correction (F10) came from a reviewer contradicting the plan author's arithmetic. It was accepted because the recomputation is reproducible from the token counts; the working was checked by hand before the figure was changed.
