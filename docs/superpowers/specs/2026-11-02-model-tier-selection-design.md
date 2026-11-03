# Model Tier Selection — Design

**Date:** 2026-11-02
**Status:** Proposed — awaiting approval. No configuration has been changed.
**Scope:** Which model backs each `opencode-model-router` tier (`fast`, `medium`, `heavy`) in the `fife` preset, and which gateway bills them.

---

## 1. Purpose

Replace a default assignment with a deliberate one. The starting state had two problems:
`medium` and `heavy` on the same base model at different effort levels, so "escalate to heavy"
brought no second opinion; and `fast` on a model that was neither fast nor free at the margin —
45 dispatches a day at roughly 35 seconds each.

## 2. Priorities

Supplied by the operator. These decide every recommendation below, in this order.

1. **Value for money.** Spending is fine; spending without understanding what it buys is not.
2. **Speed over marginal intelligence.** A much faster model that is close in ability beats a
   smarter model that is much slower.
3. **Consolidation.** One billing surface, one account, one invoice. Stop cycling subscriptions.
4. **Model diversity across tiers**, so one family's blind spots are not shared by the tier
   reviewing its work.

Priority 3 was chosen over keeping the Z.AI Coding Plan at $80/month. Section 8 prices that.

## 3. What each tier is for

The tiers are job descriptions, not difficulty settings. Each tier's requirement on a model is
set by its job.

| | `fast` | `medium` | `heavy` |
|---|---|---|---|
| **Job** | Read-only exploration: search, grep, read, git info, lookups, counts | Implementation: rename, refactor, tests, bugfix (≤2 tries), edit logic, code review, build fixes, migrations, endpoints | Reasoning consultant: architecture, hard debugging (≥3 failures), security audit, performance, migration strategy, trade-off analysis, root-cause analysis |
| **Limits** | 8 read calls, never writes | 5 reads before editing; stops after 2 consecutive failures | 3 reads; receives pasted context; may return `SCOPE GROWTH` |
| **Volume** | Highest, often parallel | Bulk of produced work | Lowest, reserved |
| **Must be good at** | Accurate retrieval, strict "do not modify", low latency | Reliable tool calls, convention adherence, precise edits | Deep reasoning over pasted context, finding the unlisted failure mode |
| **Cost of a bad choice** | Invented paths, missed matches | Plausible wrong code that survives a shallow look | A confident shallow analysis; the expensive failure goes uncaught |

Two consequences worth stating plainly:

- **The fast tier is a permission boundary, not a capability boundary.** It is not "the dumb
  tier"; it is the tier that cannot write. Intelligence matters less there than latency and
  obedience. This is why its score can sit close to `medium` without being redundant.
- **Diversity buys least at `fast` and most between `medium` and `heavy`**, because that is where
  work is produced and then reviewed.

## 4. Evidence

Artificial Analysis Intelligence Index v5.0 is weighted toward agentic software work
(Terminal-Bench 4.0, FrontierCode 2.0, AutomationBench, AA-Briefcase), so it is a reasonable
proxy for the `medium` and `heavy` jobs. Cost/task is that benchmark's token mix, **not** this
operator's — Section 5 explains why that distinction changes the answer.

| Model (effort) | Intelligence | Speed | Cost/task | Realistic response |
|---|---|---|---|---|
| `opencode/beam-free` (Beam 1.0) | 18 | **361 t/s** | **$0** | 7.6s |
| `glm-5.3-flash-free` | 28 | 75 t/s | $0 | 34.8s |
| DeepSeek V4.1 Flash (non-reasoning) | 19 | 185 t/s | $0.43 | 4.1s |
| DeepSeek V4.1 Flash (high) | 29 | unknown | ~$0.52–0.75 (derived) | unknown |
| **DeepSeek V4.1 Flash (max)** | **32** | **173 t/s** | $0.60 | 15.7s |
| DeepSeek V4 Pro (max) | 23 | 90 t/s | $1.77 | 29.6s |
| MiniMax-M3.1-Flash | 29 | 136 t/s | $0.49 | 19.3s |
| **GPT-6.1 Terra (xhigh)** | **45** | **104 t/s** | $0.40 | 73.6s |
| GPT-6.1 Terra (max) | 51 | 110 t/s | $0.96 | 260.2s |
| GPT-6.1 Sol (high) | 50 | 68 t/s | $0.59 | 76.9s |
| Claude Haiku 5.5 (high) | 30 | 181 t/s | $0.16 | 36.0s |

Findings that drove the decision:

- **`deepseek-v4-pro` is worse than `deepseek-flash`** (23 vs 32) at ~3× the price. Do not use it
  as an upgrade.
- **"Flash" describes model size, not speed.** GLM-5.3-Flash runs at 75 t/s and ~35s end-to-end.
- **DeepSeek `max` is not a slow model.** 173 t/s with 1.28s to first token — top-ten speed
  overall. The cost of `max` is token volume, not latency, which is exactly the trade the speed
  priority permits.
- **Terra is the only affordable route above 32.** `xhigh` reaches 45 at 104 t/s in ~69s; `max`
  reaches 51 but waits 255s for the first token.

## 5. Workload economics — the cache finding

Router telemetry (`~/.local/share/opencode/model-router/outcomes.json`) gives measured means per
dispatch:

| Tier | Input | Output | Cache read |
|---|---|---|---|
| fast (recon) | 18,237 | 1,279 | 46,434 |
| medium (recon, high) | 39,162 | 7,000 | 554,382 |

The workload is **cache-read dominated** (~92% of tokens), and cache pricing diverges sharply:

| | input /M | output /M | cache read /M |
|---|---|---|---|
| DeepSeek V4.1 Flash (direct API) | $0.30 | $1.20 | ~$0.006 |
| DeepSeek V4.1 Flash (via Vercel AI Gateway) | $0.30 | $1.20 | $0.007 |
| GPT-6.1 Terra (via Vercel AI Gateway) | $1.00 | $5.00 | $0.05 |

Terra's cached input costs ~7× DeepSeek's. Recomputation check: a medium dispatch rebuilt from
its token counts at DeepSeek prices gives $0.012 against a measured $0.0156 at the older rate. The
model is sound; the rates are not.

**Consequence:** Terra is only affordable on the low-volume tier. It is the right model for
`heavy` and the wrong model for `fast` or `medium`, for reasons independent of benchmark score.
This is the most important conclusion here, and it is the opposite of what benchmark scores alone
suggested.

**Correction:** an earlier draft claimed the gateway halves DeepSeek's price ($0.15/$0.60). The
catalog OpenCode actually resolves reports **$0.30/$1.20, cache read $0.007** — DeepSeek's direct
rate plus a slightly higher cache rate. The gateway is not cheaper than buying direct. Vercel
advertises other provider routes at $0.15/$0.60 that OpenCode does not select by default; gateway
`sort: "cost"` may reach them, but that is unverified and out of scope here.

## 6. Decision

| Tier | Model | Variant | Why |
|---|---|---|---|
| `fast` | `vercel/minimax/minimax-m3.1-flash` | `medium` | Intelligence 29 at 136 t/s, and about a third cheaper per dispatch than the DeepSeek alternative despite a higher cache rate, because its base token price is half. Both original candidates failed: free `beam-free` on quota, DeepSeek `none` on thin capability (intelligence 19) for the tier that decides which paths exist. |
| `medium` | `deepseek/deepseek-v4.1-flash-1017` (Vercel AI Gateway) | `max` | 173 t/s with 1.28s to first token at intelligence 32. `max` is affordable precisely because DeepSeek's latency does not degrade with effort. `high` scores 3 less and is *not* cheaper (Section 10). |
| `heavy` | `vercel/openai/gpt-6.1-terra` (Vercel AI Gateway) | `xhigh` | Raises the ceiling from 32 to 45. 104 t/s with ~69s to first token. `max` scores 51 but waits 255s, which loses on the speed priority. Different vendor from the tier it reviews. At $1.00/$5.00 it is half the price of the `-fast` serving tier. |

`fast` and `medium` share a lineage; `medium` and `heavy` do not. Diversity sits at the
produce/review boundary, which is where it earns its cost.

### Configuration

```jsonc
{
  "activePreset": "fife",
  "activeMode": "normal",
  "presets": {
    "fife": {
      "fast":   { "model": "vercel/minimax/minimax-m3.1-flash",           "variant": "medium", "costRatio": 1 },
      "medium": { "model": "vercel/deepseek/deepseek-v4.1-flash-1017",     "variant": "max",   "costRatio": 3 },
      "heavy":  { "model": "vercel/openai/gpt-6.1-terra",                  "variant": "xhigh", "costRatio": 8 }
    }
  }
}
```

`<gateway>` is the provider prefix OpenCode assigns to Vercel AI Gateway — confirm it rather than
guessing. Escalation stays manual: `medium` failing twice is promoted to `heavy` by the
orchestrator, not by the router.

### Fallbacks

| Tier | Primary | Fallback | Trigger |
|---|---|---|---|
| `fast` | `vercel/minimax/minimax-m3.1-flash` `medium` | same model, variant `low` | Invented paths or missed matches; `low` trades capability for latency if `medium` proves slow |
| `medium` | DeepSeek V4.1 Flash `max` | DeepSeek V4.1 Flash `high` | Sustained rate limiting or a price change |
| `heavy` | Terra `xhigh` | DeepSeek V4.1 Flash `max` | Gateway unavailable. A lower ceiling beats no answer; record when this happens |

## 7. Gateway choice — Vercel AI Gateway

| | Vercel AI Gateway | OpenRouter |
|---|---|---|
| Markup on tokens | None | None |
| Platform fee | **$0** | **5.5%** on credits (8% Business), $0.80 min |
| DeepSeek V4.1 Flash rate | **$0.15 / $0.60** | list price |
| BYOK | No fee (paid tier) | Free to $25k/month, then 5% |
| Catalog | Curated | 400+ models |
| Account | Requires a Vercel team | Standalone |

Chosen for the zero platform fee (≈$11–22/month saved at this volume), for pricing DeepSeek
*below* its direct API rate, and because a curated catalog suits an explicit goal of ceasing
model-hopping. OpenRouter is retained as the better option only if a model Vercel lacks becomes
necessary, or EU in-region routing on self-serve is required. Note OpenRouter's pending
acquisition by Stripe when weighing long-term dependency.

Both gateways pass DeepSeek's implicit caching through and charge nothing for cache writes;
Vercel additionally documents session affinity so cache locality survives routing.

## 8. Rejected options

| Option | Rejected because |
|---|---|
| Keep Z.AI Coding Plan ($80/mo) | Consolidation was chosen over cost. Recorded honestly: at 5B tokens/month the plan is roughly break-even against DeepSeek and absorbs usage spikes. Dropping it costs money and buys flexibility. |
| MiniMax-M3.1-Flash for `fast` | **Originally rejected, then adopted.** Rejected early for scoring 29 against a free model at 28 on the highest-volume tier. Once the free tier proved unusable on quota, MiniMax became the best remaining option: cheaper per dispatch than DeepSeek `none`, ten intelligence points higher, and it restores vendor diversity at the fast/medium boundary. |
| `glm-5.3-flash-free` for `fast` | Free and intelligent (28), but 75 t/s and ~35s per dispatch. Operator judgement: too slow for the highest-volume tier. |
| Any free model for `fast` | **Rejected on evidence during implementation.** Two free dispatches succeeded, then the provider returned "Free usage limit reached" within roughly ten minutes of testing, before the request reached the router. At 45 fast dispatches a day this quota cannot carry the tier, and a tier that fails without warning is worse than one that costs cents. Paid `fast` is now specified. |
| DeepSeek `high` for `fast` | Not cheaper than `max` (Section 10) and no faster than anything measured. |
| `deepseek-v4-pro` | Intelligence 23 — below `deepseek-flash` at max — for ~3× the price. |
| Terra for `medium` | Cache reads cost 17× DeepSeek's; roughly 5–8× the cost for work that verification already gates. |
| Terra `max` for `heavy` | 51 intelligence but 255s to first token. Loses on speed for six points. Reversible if the wait proves tolerable. |
| OpenRouter | 5.5% credit fee for catalog breadth not required here. |

## 9. Cost model — deferred to measurement

Two earlier estimates in this document were wrong and are withdrawn below. The first assumed the
gateway halved DeepSeek's rate; it does not. The second converted an assumed 5B tokens/month
through a token mix into a total, producing figures with no anchor in observed use.

What *is* anchored is the per-dispatch measurement from router telemetry. A medium dispatch cost
$0.0156 at the older rate — roughly **$0.031 at the catalog's $0.30/$1.20**. At 39 medium
dispatches a day:

```
39 × $0.031 × 30 = ~$36/month
```

Heavy is the only genuinely unknown term, because no heavy dispatch has been measured. It scales
directly with dispatch size:

| Heavy dispatch size | Cost per dispatch (Terra) | Monthly at 9/day |
|---|---|---|
| ~3× a medium dispatch | ~$0.30 | ~$82 |
| ~10× a medium dispatch | ~$1.00 | ~$274 |

A 10× spread is not an estimate. **The cost question is deferred to measurement** (plan Task 4)
under a hard $10 gateway budget, with the decision rule agreed in advance:

- Under ~$100/month for heavy: keep Terra `xhigh`.
- Over ~$200/month: drop to DeepSeek V4.1 Flash `max` and accept a ceiling of 32.
- Between: operator's call, with real numbers in hand.

`fast` is free and contributes nothing either way.

### Superseded figures

Withdrawn. Retained so the correction is auditable.

Assumptions, stated so they can be challenged:

- **5B tokens/month total**, across devices and projects. Not derivable from router telemetry,
  which covers one machine for one day.
- Mix extrapolated from telemetry: 92% cache read, 6.5% fresh input, 1.5% output.
- `fast` is free and contributes nothing.
- Paid volume split roughly 80% medium / 20% heavy.

| Component | Estimated monthly |
|---|---|
| `fast` — beam-free | **$0** |
| `medium` — DeepSeek max via Vercel | ~$40–55 |
| `heavy` — Terra xhigh via Vercel | ~$85–110 |
| **Total** | **~$125–165** |

Uncertain to within roughly a factor of two, because the token mix is assumed rather than
measured. The **ordering** is not uncertain: this is far cheaper than the $235–250 estimated
before the free fast tier and the gateway's halved DeepSeek rate were accounted for, and it is
comparable to the $80 Z.AI plan while removing the subscription and raising the ceiling.

### Cost control

`heavy` on Terra is the only tier where cache pricing bites, so its share of tokens is the lever.
The router already caps heavy at 3 reads. Keep escalation manual and gated on two consecutive
failures; do not let `heavy` become the default for ambiguous work.

## 10. Correction recorded

An intermediate recommendation put `fast` on DeepSeek's non-reasoning variant and claimed the
`high` variant was *cheaper* (~$0.30/task) than non-reasoning ($0.43/task). That was wrong, and
the arithmetic disproves it:

All variants run identical prompts, so input cost is equal. Only output differs — 51M tokens for
non-reasoning versus 130M for `high`, at the same per-token price. Therefore:

```
cost(high) − cost(non-reasoning) = (130M − 51M) × $1.20/M ÷ task_count = $94.80 ÷ N
```

which is positive for every N. `high` costs between roughly **$0.52 and $0.75** — never below
non-reasoning. The original claim came from assuming reasoning models write less; Artificial
Analysis's own verbosity data labels non-reasoning "highly concise" and `high` "very verbose".

Practical result: **`high` and `max` cost about the same**, so `max` dominates `high` — same
money, +3 intelligence, and a measured 173 t/s.

## 11. Risks

1. **`fast` at intelligence 29 on a 136 t/s model.** MiniMax is the slowest of the three fast
   variants tested on paper, though it measured 2,393 ms in practice — the quickest of the three.
   Composite score does not measure tool-call reliability, which is the fast tier's actual job.
   Mitigation is the documented fallback to variant `low`; measure before trusting.
2. **Two vendors, two failure modes.** DeepSeek and the gateway are separate credentials and
   separate outages, and `heavy` now depends on the gateway being reachable when a hard problem
   appears.
3. **Gateway pricing is promotional.** Vercel's DeepSeek rate of $0.15/$0.60 is below direct API
   list price. If it converges upward, medium and heavy costs rise; re-check monthly.
4. **Provider spread within a model is large.** Vercel lists ~19 routes for DeepSeek V4.1 Flash
   spanning roughly $0.02–$0.60/M input. The cheap end may be slower or lower quality. Do not
   optimise blindly to the lowest number.

## 12. Verification before adopting

1. Confirm the OpenCode provider prefix for Vercel AI Gateway and that `openai/gpt-6.1-terra` and
   `deepseek/deepseek-v4.1-flash-1017` are reachable through it.
2. Confirm the router accepts `xhigh` as a Terra variant and `max` as a DeepSeek variant through
   the gateway.
3. Confirm DeepSeek cache reads bill at the cache-hit rate through the gateway, not fresh input.
4. Run one week with `fast` on DeepSeek `none`. Compare invented paths, missed matches, retry rate
   against the current GLM-5.3-Flash baseline.
5. After one week, compare `timings.jsonl` counts and `outcomes.json` `measuredUSD` per tier
   against Section 9, and correct the token-mix assumption.

## 13. Left to the implementer

- The gateway provider prefix and exact model IDs as OpenCode sees them.
- Whether `costRatio` should track real prices or retain 1/3/8 for continuity.
- Whether Terra `xhigh` or `max` is right for `heavy` once real latency is observed.
