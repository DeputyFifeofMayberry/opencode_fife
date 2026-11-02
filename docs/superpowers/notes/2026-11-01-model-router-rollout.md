# Model Router Rollout Evidence

Baseline revision: 385df1511406d00c7e7bdc5164bcf6da01bd1732
Branch: dev
Date: 2026-11-01
Operator: Barney (executed through the OpenCode agent)
Spend approval / ceiling: $10 screening ceiling approved in session

## Task 1 — Baseline

- root model used for both passes: `deepseek/deepseek-flash` (no variant)
- effort suite: `bun test test/effort` from `packages/core` — 142 pass, 0 fail, 14 files
- core typecheck: `bun typecheck` from `packages/core` — 0 errors, 1,921 files
- baseline child model / variant / base level: `deepseek/deepseek-flash` / none / `standard`; agent `general`, mode `adaptive`, support `supported`, next rule `base`
- verification commands: `["bun run check"]` in this repository, because `.opencode/opencode.jsonc` overrides the global list. The global list has four entries, including `bun test test/effort`, which does not exist from the repository root; that sharp edge applies outside this repository, not inside it.
- workload substitutions: none. The task 10 answer was manually re-graded from fail to pass: it contains two bold option headings and one cost and benefit each, which meets the written check.
- ledger completeness (usage/cost): `usage_complete` 12/12; `cost_complete` 0/12 because exports do not carry provider attempt counts, so attempt reconciliation is unknown. Costs are estimated from the priced DeepSeek catalog.
- baseline cost per successful task: $0.005057 (total $0.060684 across 12 passes)
- baseline gross tokens per successful task: 203,324 (total 2,439,891)
- baseline median wall time: 19,147 ms
- baseline pass count: 12/12

### Revision and tree state

- `dev` at `385df1511406d00c7e7bdc5164bcf6da01bd1732`
- `origin/dev...HEAD` divergence `0 0`
- Only untracked files are the spec and plan; tracked tree is otherwise clean.

### Pre-integration delegation observation

A probe prompt asked the root to delegate once to agent `general`. Observed child:

- agent `general`, model `deepseek/deepseek-flash`, selected variant null
- mode `adaptive`, base level `standard`, current level `standard`
- next decision rule `base`, level `standard`
- support `supported`, clean passes needed 2

None of the twelve baseline workload runs delegated. The baseline therefore measures the current single-agent behavior.

### Measurement harness

Both arms use identical snapshots from `git archive HEAD` with the seed tests materialized under `run/`. Two harness-only settings are applied to every snapshot:

- `auto_background_ms: 0`, so `background: false` blocks instead of the 2-second watchdog releasing the root early.
- The repository `bunfig.toml` test-root guard is disabled, because Bun 1.4.4 rejects explicit-file `bun test` from the snapshot root.

Neither setting changes routing, model choice, or effort policy.

### Frozen twelve-task workload

| # | Category | Prompt | Pass check |
|---|---|---|---|
| 01 | exploration | Where does the fork store durable per-session effort state? Write labeled lines `table:`, `file:`, `column:` to `exploration-answer.md`. | `bun run/check-exploration.ts durable-state` exits 0 |
| 02 | search/count | Count the `.ts` files under `packages/core/src/effort` recursively. Write only the number to `answer.txt`. | equals `(Get-ChildItem packages/core/src/effort -Recurse -Filter *.ts).Count` |
| 03 | extract | From `packages/core/src/effort/policy/types.ts`, write the exact `DecisionRule` members to `answer.txt`, sorted, one per line. | contains all six rules exactly |
| 04 | mechanical | In `run/`, make `slug-case.test.ts` pass by changing `slug-case.ts` minimally. Finish when `bun test run/slug-case.test.ts` passes. | test exits 0 |
| 05 | implement | Implement `toRoman` in `run/to-roman.ts` so `run/to-roman.test.ts` passes. Minimal implementation. | test exits 0 |
| 06 | debug/fix | `run/debounce.test.ts` fails on the leading option. Fix `run/debounce.ts` minimally so the file passes. | test exits 0 |
| 07 | debug/fix | `run/wrap-text.test.ts` fails. Fix `run/wrap-text.ts` minimally so the file passes. | test exits 0 |
| 08 | diagnosis | `run/parse-bytes.test.ts` fails. Write `answer.md` naming the failing input, expected value and actual value. Do not edit `run/parse-bytes.ts`. | `answer.md` names both the expected and actual values from the test |
| 09 | multi-step | Explain why `run/legacy-name.test.ts` fails in one line, then fix `run/legacy-name.ts` so it passes. | test exits 0 and the final text names the cause |
| 10 | architecture | Compare two ways to make per-agent effort defaults configurable here. Write `answer.md` with exactly two options, one cost and one benefit each, ≤150 words. | `answer.md` has two option headings plus `cost` and `benefit` |
| 11 | security | Audit `packages/core/src/effort/verify.ts`: list every process execution and state whether the command comes from user configuration or model input. Write `answer.md`. | mentions `runProcess` and `verification_commands` |
| 12 | composite | `run/parse-bytes.test.ts` fails. Explain the cause in `answer.md`, then fix `run/parse-bytes.ts`. Finish when the test passes. | test exits 0 and `answer.md` explains the cause |

Every prompt carried: "If you delegate, call the subagent tool with `background: false` and wait for the result, then include the child sessionID in your final answer."

### Baseline by task

| # | Pass | Wall ms | Children |
|---|---|---|---|
| 01 | pass | 22,219 | 0 |
| 02 | pass | 6,713 | 0 |
| 03 | pass | 7,025 | 0 |
| 04 | pass | 19,708 | 0 |
| 05 | pass | 7,833 | 0 |
| 06 | pass | 18,585 | 0 |
| 07 | pass | 16,108 | 0 |
| 08 | pass | 27,230 | 0 |
| 09 | pass | 15,369 | 0 |
| 10 | pass | 26,484 | 0 |
| 11 | pass | 40,867 | 0 |
| 12 | pass | 55,110 | 0 |

## Task 2 — Tier selection

- fast: `opencode/glm-5.3-flash-free` — free, coding-oriented flash model; the tier is read-only by default and is used for search, reading, and summarization. Risk: the free tier may rate-limit.
- medium: `deepseek/deepseek-flash` — $0.15 input / $0.60 output per million tokens; tool-capable in the baseline probe; everyday implementation.
- heavy: `deepseek/deepseek-flash` — the operator chose maximum effort on the same model over the stronger paid `deepseek/deepseek-v4-pro`. The fork's `review` operation seeds `deep`, which resolves to `max` on this model.
- billing: mixed (free fast tier plus metered DeepSeek medium and heavy)
- costRatio: 1 / 3 / 6, estimated token-spend multipliers. Upstream uses 3 and 6 for the same model at high and max effort; the plan's 1 / 5 / 20 example assumes different models, so it would overstate the multiplier here.

### Decision ownership

The router selects the model only. The fork effort policy owns the reasoning variant:

- `agent_operations.fast = explore` seeds `low`
- `agent_operations.medium = implement` seeds `standard`, which resolves to `high`
- `agent_operations.heavy = review` seeds `deep`, which resolves to `max`

`mechanical` would also seed `low`, but it misdescribes read-only search. Router variant escalation is disabled with `escalate.variantSteps: "none"` and `escalate.effortBump: false`, so the router never competes with the fork for the variant.

