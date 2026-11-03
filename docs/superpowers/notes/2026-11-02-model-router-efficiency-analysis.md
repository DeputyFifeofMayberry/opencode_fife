# Model router — efficiency analysis

Date: 2026-11-02
Status: Findings — no configuration changed
Scope: how `fast` / `medium` / `heavy` are chosen and what that actually costs

## 1. Question

The tiers are working as designed for *selection*. This analysis asks a different
question: is the money being spent where it produces value, and what can be made
cheaper or faster without losing quality?

Answer in one line: tier choice is sound, tier *price* is distorted, and
two-thirds of all spend is not the tiers at all — it is the orchestrator
re-reading its own context.

## 2. Sources and method

| Source | What it is | Coverage |
|---|---|---|
| `~/.local/share/opencode/model-router/decisions.jsonl` | one row per dispatch the router classified | 174 rows, 24 h (2026-11-02 → 11-03) |
| `~/.local/share/opencode/model-router/turns.jsonl` | per-step token accounting | 286 turns / 1,941 steps / 45 sessions |
| `opencode.db`, `opencode-dev.db`, `opencode-local.db` | assistant messages with provider, model, tokens, cost | 12,454 messages, $7.03, 9 days |
| `~/.config/opencode/opencode-model-router.overrides.jsonc` | live preset `fife` | current |
| `docs/superpowers/specs/2026-11-02-model-tier-selection-design.md` | how the tiers were chosen | current intent |

The per-tier figures join router dispatches to the child sessions they produced:
164 of 164 dispatches matched, so the attribution is complete, not sampled.

**Caveat on absolute dollars.** The stored cost for DeepSeek is about
$0.0014 per message at roughly 170k-token contexts, which is implausibly cheap.
Treat the money column as a floor and the *ratios* as the reliable signal.

## 3. What the numbers say

- **The router never routed.** 174 decisions, 0 switches, 2 disagreements. 162
  rows are `shadow`, 11 `advise`. 105 of them read "kept: best-is-chosen".
  The orchestrator already picks at or below the router's cheapest candidate.
- **Tier choice is sane.** fast 81, medium 59, heavy 32 dispatches by agent
  count. Nothing is piling onto heavy by accident.
- **Tier price is not.** Realised cost per dispatch is **1 : 6.6 : 19.7**
  against a configured `costRatio` of 1 : 3 : 8.
- **Medium's overshoot is volume, not price.** Per *message* the ratio is
  1 : 3.2 : 19.7 — medium sits at its configured 3. It runs 9.8 messages per
  dispatch against fast's 4.7.
- **Two-thirds of spend is the orchestrator.** `build` is $3.54 of $5.44
  (65%), against 20% for heavy, 12% for medium, 2% for fast.
- **The orchestrator re-reads 206k tokens per step.** Across 1,941 steps,
  cache reads are 98.19% of all prompt tokens. p50 is 110k, p95 385k, max 443k.
- **Heavy is the worst value.** 20% of dispatches take 59% of delegated spend.
  17 of its 32 dispatches are `design` work — the class where a cheaper tier
  plus a written plan usually wins.
- **Heavy never gets a warm cache.** Terra logs 297 uncached input tokens in
  total but 420,927 cache-*write* tokens. Every dispatch pays to build a cache
  it never reuses.
- **Free capacity is unused.** 67% of all messages across the three databases
  cost nothing (zai-coding-plan 6,058, opencode free 2,079).
- **DoD detection barely fires.** `effective = none` in 147 of 172 dispatches,
  so the signal that should reshuffle tiers is largely absent.

## 4. Per tier

Joined to child-session spend, `opencode.db`, normalised to fast.

| tier | dispatches | child msgs | cost | $/msg | $/dispatch | ratio | mean | p95 |
|---|---|---|---|---|---|---|---|---|
| heavy | 32 | 151 | $1.1346 | 0.00751 | 0.0355 | 19.7× | 1.1 min | 5.3 min |
| medium | 56 | 547 | $0.6590 | 0.00121 | 0.0118 | 6.6× | 0.9 min | 3.2 min |
| fast | 71 | 334 | $0.1271 | 0.00038 | 0.0018 | 1.0× | 0.5 min | 1.3 min |
| unknown | 5 | 17 | $0.0138 | — | — | — | — | — |

32 dispatches (20%) take 59% of the delegated money.

## 5. Per agent and per model

| agent | msgs | cost | share | $/msg |
|---|---|---|---|---|
| build (orchestrator) | 2,900 | $3.5363 | 65.0% | 0.0012 |
| heavy | 145 | $1.0886 | 20.0% | 0.0075 |
| medium | 529 | $0.6457 | 11.9% | 0.0012 |
| fast | 319 | $0.1163 | 2.1% | 0.0004 |
| general | 83 | $0.0479 | 0.9% | 0.0006 |
| plan | 2 | $0.0032 | 0.1% | 0.0016 |
| explore | 87 | $0 | 0% | 0 |

| model | msgs | input | output | cache read | cache write | cost | $/msg |
|---|---|---|---|---|---|---|---|
| deepseek/deepseek-flash | 3,027 | 7,956,132 | 1,070,754 | 504,506,751 | 0 | $4.2691 | 0.0014 |
| vercel/openai/gpt-6.1-terra | 99 | 297 | 11,524 | 2,145,642 | 420,927 | $0.8207 | 0.0083 |
| vercel/minimax/minimax-m3.1-flash | 97 | 356,508 | 63,533 | 1,322,252 | 0 | $0.1114 | 0.0011 |
| vercel/deepseek/deepseek-v4.1-flash | 109 | 234,730 | 34,534 | 2,640,384 | 0 | $0.1303 | 0.0012 |
| zai-coding-plan/glm-5.3-flash | 343 | 1,072,408 | 87,115 | 64,839,680 | 0 | $0 | 0 |

Terra bills 15% of spend on 2.4% of messages. Its 297 uncached input tokens
against 420,927 cache writes is the signature of cold-start dispatch: each
heavy task builds a prompt cache and then ends.

## 6. Three sources, three different configurations

The tier presets are not in agreement, and the live file is the only one that
decides anything.

| Tier | Runbook `docs/model-router.md` | Tier-selection design | Live overrides |
|---|---|---|---|
| fast | unpinned | minimax `medium` | minimax `medium` |
| medium | `high` | deepseek `max` | deepseek `max` |
| heavy | `max` | Terra `xhigh` | Terra `high` |
| heavy costRatio | 6 | 8 | 8 |

Deep-merge order makes the **live overrides authoritative**: bundled
`tiers.json`, then global overrides, then project file. The runbook is stale in
two places and its rollback advice ("delete the variant key") would silence the
wrong pin. The design's `xhigh` for heavy was never applied — live says `high`.

Consequence: anyone sizing cost from the runbook will assume medium is cheap and
heavy is dear. In practice medium carries both the highest effort it supports
and the highest volume, while heavy runs one step below its design intent.

## 7. Levers, ranked, with the correcting evidence

Every lever below is stated with what it changes and what it risks. A lever is
only listed if the evidence supports it; levers contradicted by the existing
design evidence are listed in §8.

**External config** (`~/.config/opencode/opencode-model-router.overrides.jsonc`
— not this repo):

1. **`fast` is missing `readOnly: true`.** Bundled presets set it; `fife.fast`
   does not. The guard then classifies a read-only errand as a *producer* and
   pushes it to write. Every push-back is an extra round trip. Very low risk.
2. **`@heavy` cap is 3 tool calls.** The tier that is supposed to synthesise
   pasted context hits its ceiling and returns `SCOPE GROWTH`, which costs an
   extra fast dispatch plus a re-run. Raising it to 6 removes a self-inflicted
   restart. Low risk; slightly more tokens per heavy call.
3. **Heavy is used for `design`.** 17 of 32 heavy dispatches. A written plan on
   medium plus a heavy *review* is the cheaper shape for that class. This is a
   routing-policy change, not a config key; it belongs in the orchestrator text.
4. **`variantSteps: "none"` with `maxAttemptsPerTier: 1`.** Every failed
   verification buys a bigger model rather than retrying on the same one. The
   router's own advisor flags this exact combination. Only a *variant* raise
   conflicts with the frozen-effort decision; a same-level retry does not, and
   is the recommended middle path.
5. **`background.mode: "off"` and `verify.background: false`.** Latency only.
   Turning them on overlaps long dispatches with the turn.

**This repo:**

6. **Orchestrator context is the largest cost centre.** 65% of spend, 206k
   tokens re-read per step. Levers are: fewer steps per task, less context
   re-sent, and fewer child sessions. The delegation protocol currently sends
   *all* read-only work to a child, and prices the argument on the orchestrator's
   own rate without the fixed overhead of a child session's system prompt.
   Raising the direct-read allowance is the cheapest experiment.
7. **Heavy's cold cache.** Caused by short-lived child sessions, not by the
   model. Fewer, longer heavy sessions would convert cache writes into cache
   reads. Structural, not a config key.
8. **Stale runbook.** Two rows and one ratio, §6. A reader can currently
   mis-size the whole cost model from it.

## 8. Rejected lever

**Medium `max` → `high` to cut tokens.** Rejected on existing evidence, though
it is the intuitive move and was my first recommendation.

`docs/superpowers/specs/2026-11-02-model-tier-selection-design.md` §10 measures
it: all variants run identical prompts, so input cost is equal; only output
differs, and `high` is *more* verbose than non-reasoning at the same per-token
price, so `high` and `max` cost about the same while `max` scores three points
higher. Dropping to `high` therefore buys almost nothing and costs capability.
This should be re-tested only if fresh per-message output tokens contradict it.

## 9. What is not a problem

- **Tier selection.** 105 of 174 decisions say the chosen tier was already the
  cheapest. The orchestrator is not over-assigning.
- **Shadow mode's cost.** The classifier is rule-based and makes no model call.
  Keeping `shadow` costs latency of microseconds and buys the decision log.
- **`margin: 0.2`.** Inert while the engine is `shadow`; not the reason nothing
  switches. The blocker is the five-outcome evidence gate per dispatch key.
- **Free-model capacity for `fast`.** Already tried and rejected: free quota ran
  out within minutes at the fast tier's volume.

## 10. Open decisions

1. Should heavy run `high` (live) or `xhigh` (design intent)?
2. Same-level retries (compatible with a freeze), or escalation straight to the
   next tier (current behaviour)?
3. Does `design` stay on heavy, or move to medium plus a written plan?
4. How much orchestrator context can be cut without losing task quality?
