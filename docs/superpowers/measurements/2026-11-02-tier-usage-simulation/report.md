# Tier Usage Simulation — 2026-11-02

## 1. Run summary

39 dispatches across three tiers, total spend **$0.465554**, in a 27-minute window
(`2026-11-02T23:44Z`–`2026-11-03T00:11Z`). Measured per-dispatch cost: fast
**$0.003494**, medium **$0.002500**, heavy **$0.041739** (means).

**Headline: heavy on Terra `xhigh` projects to $11.27/month at 9 dispatches/day**, with a
bootstrap interval of **$7.86–$15.45**. That sits well under the spec's $100 threshold, so
the band is `keep-terra-xhigh` and the interval does not cross either threshold.

That conclusion is measured but **unvalidated**: no invoice was available, so every cost
here is OpenCode's own catalog estimate. It is also a synthetic benchmark, not a real-day
estimate — see sections 10 and 11.

**Scope:** planned 45/39/9, executed 15/15/9 at the user's explicit instruction. Heavy kept
its n=9 because it is the only decision input.

## 2. Method, cohort and join integrity

- Cost, model, variant and tokens come from **per-assistant-step records**
  (`session_message`, 258 steps), summed per dispatch session. No cost is divided across calls.
- Tier and duration come from `timings.jsonl`, joined on `childSessionID = session_v2.id`.
- Statistics are keyed to the **39 logged child-session IDs**, not to a time window.

| Check | Result |
| --- | --- |
| Timing rows in window | 39 |
| Unique child sessions | 39 |
| Join status | 39 exact, 0 split, 0 untimed, 0 unmatched |
| Tier unknown | 0 |
| Sessions with >1 model | 0 |
| Child sessions where cost ≠ sum of steps | 0 |
| Cohort coverage | 39 logged, 39 extracted, 0 duplicates, 0 missing, 0 outside |
| Distinct projects in cohort | 1 |
| Cost conservation | dispatchSum 0.465554 = sessionSum 0.465554 (independent DB total 4.754518) |

Every cohort dispatch ran its intended identity; there were **0 fallbacks** and **0 mixed**
sessions.

## 3. Baseline vs final totals

| | Sessions | Cost (USD) |
| --- | --- | --- |
| Baseline (`00-baseline.json`) | 182 | 4.133709 |
| Final (`99-baseline.json`) | 221 | 4.742276 |
| **Period delta** | 39 | **0.608567** |

The delta is computed per session (`99-sessions.json` minus `00-sessions.json`), so it
includes spend that accrued inside sessions which already existed when the window opened.
The cohort's own share of that delta is $0.465554; the remaining $0.143013 is the
orchestrating session's own work during the run.

## 4. Per-tier cost distribution

`costed_n` counts dispatches with cost > 0; all rows here are costed. Nearest-rank
percentiles: at n=9 the p90 equals the maximum observation.

| group | metric | n | costed_n | total | mean | median | p90 | min | max | ci95_low | ci95_high |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fast | cost_usd | 15 | 15 | 0.052409 | 0.003494 | 0.001143 | 0.009110 | 0.000350 | 0.013219 | 0.001726 | 0.005587 |
| fast | steps_per_dispatch | 15 | 15 | 62 | 4 | 3 | 9 | 2 | 12 | 3 | 6 |
| fast | tokens_input | 15 | 15 | 156407 | 10427 | 3027 | 32074 | 198 | 47028 | 4475 | 18072 |
| fast | tokens_output | 15 | 15 | 27368 | 1825 | 382 | 6648 | 78 | 11556 | 505 | 3561 |
| fast | tokens_reasoning | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fast | tokens_cache_read | 15 | 15 | 835155 | 55677 | 30080 | 180622 | 17783 | 199253 | 31293 | 86293 |
| fast | tokens_cache_write | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| fast | duration_ms | 15 | 15 | 214250.0 | 14283.3 | 6441.0 | 49816.0 | 2111.0 | 69854.0 | 6005.5 | 24762.6 |
| medium | cost_usd | 15 | 15 | 0.037494 | 0.002500 | 0.002139 | 0.004279 | 0.000945 | 0.007488 | 0.001752 | 0.003469 |
| medium | steps_per_dispatch | 15 | 15 | 75 | 5 | 4 | 8 | 3 | 9 | 4 | 6 |
| medium | tokens_input | 15 | 15 | 50054 | 3337 | 1726 | 4813 | 880 | 19894 | 1689 | 6002 |
| medium | tokens_output | 15 | 15 | 9964 | 664 | 625 | 969 | 213 | 1773 | 490 | 868 |
| medium | tokens_reasoning | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| medium | tokens_cache_read | 15 | 15 | 1502976 | 100198 | 80128 | 164096 | 59392 | 190208 | 80555 | 122010 |
| medium | tokens_cache_write | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| medium | duration_ms | 15 | 15 | 102140.0 | 6809.3 | 6700.0 | 10684.0 | 2739.0 | 14608.0 | 5330.9 | 8509.6 |
| heavy | cost_usd | 9 | 9 | 0.375651 | 0.041739 | 0.037107 | 0.092067 | 0.020915 | 0.092067 | 0.029109 | 0.057234 |
| heavy | steps_per_dispatch | 9 | 9 | 42 | 5 | 5 | 5 | 4 | 5 | 4 | 5 |
| heavy | tokens_input | 9 | 9 | 126 | 14 | 15 | 15 | 12 | 15 | 13 | 15 |
| heavy | tokens_output | 9 | 9 | 4080 | 453 | 422 | 747 | 239 | 747 | 343 | 569 |
| heavy | tokens_reasoning | 9 | 9 | 12262 | 1362 | 970 | 2735 | 392 | 2735 | 831 | 1940 |
| heavy | tokens_cache_read | 9 | 9 | 934483 | 103831 | 102805 | 125916 | 78086 | 125916 | 93763 | 113762 |
| heavy | tokens_cache_write | 9 | 9 | 197673 | 21964 | 13901 | 56813 | 10073 | 56813 | 13993 | 32359 |
| heavy | duration_ms | 9 | 9 | 293105.0 | 32567.2 | 27943.0 | 56664.0 | 16734.0 | 56664.0 | 24337.0 | 41560.3 |

Cost is strongly right-skewed at every tier: fast mean is 3.1× its median, heavy mean is
1.1× its median but its p90 is 2.2× the mean. A mean alone would misdescribe all three.

## 5. Per-identity cost distribution

Every cohort dispatch ran exactly one identity, and each tier maps to exactly one identity,
so the per-identity tables are identical to the per-tier tables above. The mapping is:

| tier | identity | n | total USD |
| --- | --- | --- | --- |
| fast | `vercel/minimax/minimax-m3.1-flash#medium` | 15 | 0.052409 |
| medium | `vercel/deepseek/deepseek-v4.1-flash-1017#max` | 15 | 0.037494 |
| heavy | `vercel/openai/gpt-6.1-terra#xhigh` | 9 | 0.375651 |

Note the heavy tier ran **plain `openai/gpt-6.1-terra`**, not the `-fast` variant that
older sessions used. Those are different models: `terra-fast` prices at exactly 2× `terra`.

## 6. Token and step composition

Per-dispatch means, with the cost share each token class contributes at the derived rates:

| model | variant | input | output | reasoning | cache_read | cache_write | cost USD | dominant_term |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-6.1-terra | xhigh | 14 | 453 | 1362 | 103831 | 21964 | 0.041739 | `cache_write` (65.8%) |
| deepseek-v4.1-flash-1017 | max | 3337 | 664 | 0 | 100198 | 0 | 0.002500 | `input` (40.1%) |
| minimax-m3.1-flash | medium | 10427 | 1825 | 0 | 55677 | 0 | 0.003494 | `input` (44.7%) |

Heavy is qualitatively different from the other two. It carries **14 fresh input tokens** and
~22k cache-**write** tokens: the prompt is almost entirely cache traffic, and cache writes
are 66% of the bill. Heavy cost therefore tracks context size, not task difficulty or output
length. Medium and fast are dominated by fresh input (40.1% and 44.7%), with cache reads a
minority share.

All three tiers show 4–5 steps per dispatch on average, but the distributions differ: heavy
was uniformly 4–5 steps, so its measured spread understates what real work would produce.

## 7. Local vs billed reconciliation

| Quantity | Value |
| --- | --- |
| `localUSD` (period delta, all sessions) | 0.608567 |
| `billedUSD` | *unavailable* |
| `deltaUSD` | — |
| `deltaPct` | — |
| verdict | `inconclusive` |
| `validationStatus` | `not-needed` |
| `validationFactor` | 1 |

No dashboard access existed in the executing environment, so the invoice could not be read.
By the plan's own sign table there is nothing to compare, and the projection is the
**unadjusted local estimate**. This is the single largest weakness in the result.

Sign conventions, recorded so they cannot be misread later: `deltaPct > +15` ⇒ local exceeds
invoice ⇒ `local-overstates` (projection is an upper bound); `deltaPct < −15` ⇒ local is below
invoice ⇒ `local-understates` (projection is a lower bound); `|deltaPct| ≤ 15` ⇒
`aggregate-within-tolerance`, which confirms totals only, **not** per-model prices.

Rate derivation from the step data, independent of any invoice:

| identity | status | rank | equations | result |
| --- | --- | --- | --- | --- |
| `openai/gpt-6.1-terra` | solved | 4 | 4 | 1.00 / 5.00 / 0.05 / 1.25 per M, residual 2.8e-16 |
| `openai/gpt-6.1-terra-fast` | solved | 4 | 4 | 2.00 / 10.00 / 0.10 / 2.50 per M (exactly 2×) |
| `minimax-m3.1-flash` | underdetermined | 3 | 11 | no rate reported |
| `deepseek-v4.1-flash-1017` | underdetermined | 3 | 12 | no rate reported |

The Terra rates are recovered from the cost data itself to floating-point precision. That
confirms the local price table is internally consistent for Terra; it does **not** confirm
the table matches what Vercel charges.

## 8. Tier spend vs main-session spend

| Quantity | Value |
| --- | --- |
| Cohort (tier dispatches) | 0.465554 |
| Non-tier child sessions | 0.000000 |
| Top-level sessions | 0.000000 |
| `tierShare` | 1.0 |
| Fast-tier monthly at 45/day | $4.7168 |

**The top-level zero is an artifact, not a finding.** `sessions.jsonl` contains only sessions
*created* inside the window, and the orchestrating session predates it. Its in-window spend is
visible in the period delta — $0.143013 of the $0.608567 — but not in this table. On the
pre-run baseline, top-level sessions held 78% of all spend ($3.20 vs $0.94), so main-session
cost dominates total spend in normal use. Reporting `tierShare = 1.0` as if tiers were all of
the spend would be wrong; the correct reading is that this table covers the window's newly
created sessions only.

The spec says fast is free. It is not: at the measured mean and the plan's 45/day, fast costs
**$4.72/month**. The spec's decision rule is heavy-only, so this does not move either
threshold, but total router cost is that much higher than the spec assumes.

## 9. Monthly projection and decision

**Heavy on Terra `xhigh` projects to $11.27/month at 9 dispatches/day; the 95% interval is
$7.86–$15.45, which is entirely below $100, so the band is `keep-terra-xhigh` and it is
certain at the interval level.**

| Quantity | Value |
| --- | --- |
| Heavy n | 9 |
| Heavy mean | 0.041739 |
| Heavy median | 0.037107 |
| Heavy p90 (= max, n<10) | 0.092067 |
| Bootstrap 95% CI on the mean | 0.029109 – 0.057234 |
| `validationFactor` | 1 (`not-needed`) |
| `monthlyRaw` | 11.2695 |
| `monthlyMean` | 11.2695 |
| `monthlyP90` | 24.8581 |
| `monthlyCI95` | 7.8594 – 15.4533 |
| Band from interval | `keep-terra-xhigh` |
| `bandCertain` | true |

Scenario table (monthly USD at the measured distribution):

| dispatches/day | at mean | at median | at max |
| --- | --- | --- | --- |
| 3 | 3.7565 | 3.3396 | 8.2860 |
| 6 | 7.5130 | 6.6793 | 16.5721 |
| 9 | 11.2695 | 10.0189 | 24.8581 |
| 18 | 22.5390 | 20.0378 | 49.7162 |

Even at double the assumed daily rate and the sample maximum, heavy stays under $50/month.
The decision rule is a threshold comparison on the heavy tier only, and every scenario clears
it by an order of magnitude.

**Caveats that belong next to that number, not after it:** the mean comes from nine synthetic
tasks that were uniformly 4–5 steps, so the interval likely understates real variance; the
cost is an unvalidated local estimate; and the DeepSeek alternative was never measured on
comparable heavy work, so the `operator-call` comparison cannot be costed.

## 10. Assumptions still unverified

- Whether the installed build matches the reviewed `usage.ts` provenance logic. The code says
  provider-reported cost wins when present; every observed step is `estimated`, so Vercel
  appears never to report cost here.
- Whether the local price table matches Vercel's invoice. Unverified — no invoice was read.
- Whether the derived Terra rates (1.00/5.00/0.05/1.25) match Vercel's published rates rather
  than merely being self-consistent.
- Whether 9 dispatches/day is a real daily rate. It is inherited from the spec, not measured.
- Whether the synthetic task mix matches real heavy work. It does not, in step count at least.
- Whether `variant: xhigh` corresponds to the reasoning effort actually performed.

## 11. What this data cannot tell you

- **Actual monthly spend.** The number is per-dispatch cost × an assumed frequency, not an
  observed monthly total.
- **The correct band for a real workload.** If real heavy dispatches average 2× the measured
  step count, cost roughly doubles and the figure is $22 rather than $11 — still under $100,
  but the point is that the band comes from an assumption about workload, not from data.
- **Whether DeepSeek `max` is cheaper for the same work.** No matched-task comparison exists.
- **Per-request billed cost.** Even with dashboard access, only period totals are available.
- **The cost of unmatched or failed dispatches.** None occurred in this window, so the branch
  is untested (the earlier 9-of-106 observation was also superseded).
- **In-window cost of long-lived top-level sessions**, attributable to this window specifically.
  The period delta covers it in aggregate; the per-class split does not.
- **Whether reasoning effort beyond the `variant` string was actually applied.**
