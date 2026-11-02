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

## Task 3 — Install and load check

- before install: `superpowers` only; router absent
- installed: `opencode-model-router@2.9.1` (pinned), added to `~/.config/opencode/opencode.json`
- resolved entrypoint: `server.ts` present under `~/.cache/opencode/npm/opencode-model-router@2.9.1/1793593559326/node_modules/opencode-model-router`
- peer runtime: `@opencode-ai/plugin` present in the installed tree
- elected server build: `0.0.0-dev-20261101.152432` from `5301bf554381`; `dev` is four commits ahead at `f15bb485c9`. The installed build was not updated, per the plan's instruction to record the difference and not install unasked.
- private standalone probe: `opencode run --standalone` loaded the plugin and answered `ok` with no tool-schema or plugin-hook error. This is the compatibility gate for the v2 adapter.
- elected-server restart: completed; the log records `loading plugin id=opencode-model-router@2.9.1` on the new server.
- elected-server probe: `opencode run` (shared server) answered `ok` with no tool-schema or plugin-hook error.
- registered agents: `fast` (`opencode/glm-5.3-flash-free`, read-only), `medium` (`deepseek/deepseek-flash`), `heavy` (`deepseek/deepseek-flash`), all `mode: subagent`; `general` and `explore` remain.
- registered commands: the server command API lists `router`, `tiers`, `preset`, `budget`, `bypass`, `annotate-plan`, `router-reload`.
- `/router` and `/tiers` rendering: command registration is confirmed; an interactive TUI capture was not taken because the command API and the load log already establish registration. No plugin-render error appears in the server log.

## Task 4 — Tier and effort verification

Tier agents registered (`opencode debug agents`):

| Tier | Model | Mode | Steps |
|---|---|---|---|
| `fast` | `opencode/glm-5.3-flash-free` | subagent | 30 |
| `medium` | `deepseek/deepseek-flash` | subagent | 50 |
| `heavy` | `deepseek/deepseek-flash` | subagent | 120 |

`general` and `explore` remain unchanged.

### `fast` is read-only

The child attempted the create/delete request and made no `write`, `edit`, `patch`, or `shell` call. `router-probe.txt` was never created (`Test-Path` false). Fork effort on the child: base `low`, selected variant `low`, next effort `low`.

### Effort ownership

| Tier | Agent | Model | Selected variant | Base level | Next rule | Next effort | Support |
|---|---|---|---|---|---|---|---|
| fast | `fast` | `opencode/glm-5.3-flash-free` | `low` | `low` | `base` | `low` | supported |
| medium | `medium` | `deepseek/deepseek-flash` | none (`default`) | `standard` | `base` | none | supported |
| heavy | `heavy` | `deepseek/deepseek-flash` | `max` | `deep` | `base` | `max` | supported |

`standard` resolves to the provider's default effort. DeepSeek reports that default as variant `default`; the fork writes no explicit variant because the request already uses the route default. This is the designed `standard` behavior, not an escalation.

### Explicit model wins

A `fast` dispatch with `model: deepseek/deepseek-flash` ran on `deepseek/deepseek-flash`, not the fast tier model `opencode/glm-5.3-flash-free`. The effort policy still applied the fast operation base: base `low`, variant `low`.

### Plan mode pins deep

A standard session resumed with agent `plan` reported base `standard`, `next.rule: mode-pin`, `next.level: deep`, `next.effort: max`, selected variant `max`. A fresh session started directly as `plan` reported base `deep` and rule `base`, because the plan operation already seeds deep and the pin adds nothing.

### Resume

Resumed the medium child from its original parent session with the same `sessionID` and no `model` override. The child stayed `ses_e657b4c12ffe3YLXTELBHixUH4`, agent `medium`, model `deepseek/deepseek-flash`, base `standard`, selected variant none. A new root session cannot resume it: the subagent tool rejects a session that is not a child of the current conversation (`Session ... is not a child of the current session`), so resume must be issued from the original parent.

## Task 5 — Shadow window

- engine switched from `static` to `shadow` by editing the global overrides file; the router hot-reloaded it, and every decision row records `"mode":"shadow"`.
- ten dispatches recorded across `search`, `recon`, `mechanical`, `implement`, `debug`, `design`, and `review`.
- `switched: false` on all ten rows; `pinned: false` on all ten.
- the root orchestrator chose the tier in each case; the engine agreed (`best` == `chosen`).

Sample row:

```json
{"v":1,"ts":"2026-11-02T04:31:42.631Z","sessionID":"ses_e657900efffesgFMfcsGv4llr3","kind":"decision","decisionID":"ses_e657900efffesgFMfcsGv4llr3:1793593902629:6ed640f21e37adcc:1","mode":"shadow","childSessionID":null,"facts":{"class":"search","risk":"low","scope":"single","needs":[],"confidence":0.8,"source":"rules"},"chosen":{"key":"search|router:fast|opencode/glm-5.3-flash-free#default","agent":"fast","origin":"router","model":"opencode/glm-5.3-flash-free","variant":"default"},"best":{"key":"search|router:fast|opencode/glm-5.3-flash-free#default","agent":"fast","origin":"router","model":"opencode/glm-5.3-flash-free","variant":"default"},"switched":false,"pinned":false,"unit":"ratio","costs":{"search|router:fast|opencode/glm-5.3-flash-free#default":1.8154999999999997,"search|router:medium|deepseek/deepseek-flash#default":3.6967875,"search|router:heavy|deepseek/deepseek-flash#default":6.545},"confidence":0,"reason":"kept:best-is-chosen: the chosen dispatch is the cheapest (1.8155 ratio)","step":"dispatch","resume":false,"trace":{"routeLines":{"count":0,"conflict":false,"edgeOnly":true},"backend":null},"detection":{"effective":"none"},"capability":{"pick":0,"dispatched":0}}
```

Heavy decision rows appear about ten seconds after the dispatch because the persister coalesces writes; an immediate read can lag.

## Task 6 — Advise window

- engine switched from `shadow` to `advise`; a smoke dispatch recorded `"mode":"advise"` with `switched: false`.
- twelve matched runs used the same root model and prompts as the baseline. Twenty-four report rows were produced.
- routing did happen: 7 of 12 tasks created child sessions (task 01: one `fast`; 04, 05: one `medium` each; 08, 10: one `fast` each; 11: three `fast`; 12: one `medium` and one `fast`). The other five roots did the work themselves; the router still logged a proposed dispatch for most of them.
- task 01 failed: the `fast` child answered `column: base_level`, while the checker requires the adaptive `level` column. The answer is plausible but does not meet the check. This is a real correctness loss on that task, not a scoring bug.
- router statistics for the advise window: 11 decision rows, 11 chosen == best, 0 switched, 0 pinned. Classes: `search` 1, `recon` 2, `implement` 2, `debug` 1, `design` 5.

### Comparison

| Metric | Baseline | Advise | Change |
|---|---|---|---|
| Passes | 12/12 | 11/12 | −8.3 points |
| Cost per success | $0.005057 | $0.005864 | +15.9% (worse) |
| Gross tokens per success | 203,324 | 222,304 | +9.3% (worse) |
| Median wall time | 19,147 ms | 19,112 ms | −0.2% |
| `usage_complete` | 12/12 | 12/12 | — |
| `cost_complete` | 0/12 | 0/12 | unknown attempt counts in both arms |

The predeclared gate required cost per success at least 15% lower and the pass rate within 5 points. The advise arm is 15.9% more expensive per success and 8.3 points less accurate. Both conditions fail.

The likely cause is the fixed cost of the delegation protocol and the duplicated context in each child; the free `fast` tier does not offset that on this workload. The `medium` and `heavy` tiers use the same paid model as the root, so a switch adds a second context rather than a cheaper one.

### Decision

**Return to shadow.** Routing is disabled as a behavior change; the router continues to log decisions for observation. The enforce gate is not considered because the advise arm did not clear its cost and correctness thresholds. Revisit only after changing the tier mapping (for example, a cheaper `medium`) or reducing the protocol's context cost, then rerun this matched workload.

This is screening-grade evidence: one run per task, twelve tasks, one root model. It does not establish a 15% difference beyond this sample.

## Task 7 — Regression and rollback

### Repository gates

- `bun test test/effort` from `packages/core`: 142 pass, 0 fail, 14 files.
- `bun typecheck` from `packages/core`: 0 errors in 1,921 files.
- `bun run check` from the repository root: 0 errors and 1,348 warnings. The warnings are pre-existing lint advisories across `packages/**`; this task changed no source file. The command exited 0 and all 36 typecheck tasks succeeded.

### Effort parity and model switch

A `heavy` child was resumed with a different model, `opencode/glm-5.3-flash-free`. After the switch the child reported:

- model `opencode/glm-5.3-flash-free`
- base level `deep`, selected variant `max`, next effort `max`
- mode `adaptive`, verification commands `["bun run check"]`

The durable level was re-applied on the new model rather than dropped to the provider default.

### Malformed override tolerance

With `"engine": "banana"`, `/router` still reported `router: engine=shadow` and the server stayed up. The invalid layer was ignored; this build did not print a `router: config notice:` line for it. The valid file was restored immediately.

### Session bypass

`/bypass on` returned `# Bypass: ON` (delegation protocol, cap enforcement, and narration detection disabled). A subagent task still worked while bypassed, and the shadow engine still logged its decision row: bypass disables the protocol and guards, not observation. `/bypass off` returned `# Bypass: OFF` (router active).

### Full removal drill

- `opencode plugin remove opencode-model-router@2.9.1` followed by a server restart: plugin list contained only `superpowers`; `opencode debug agents` had no `fast`, `medium`, or `heavy`; the command API returned no router commands; `general` and `explore` remained.
- baseline subagent probe: child agent `general`, model `deepseek/deepseek-flash` (the parent model), base `standard`, selected variant none, verification commands `["bun run check"]`. This matches the Task 1 baseline.
- sessions remained readable across both restarts; 23 sessions were listed after reinstall.
- `opencode plugin add opencode-model-router@2.9.1` plus restart restored the three tiers and their models, and `/router` reported `router: engine=shadow build=2.9.1+unknown`.

### `/router` and `/tiers` capture

Both commands were executed through the server command API on a live session. `/tiers` showed preset `fife` with `fast` = `opencode/glm-5.3-flash-free`, `medium` and `heavy` = `deepseek/deepseek-flash`, and no variant or effort fields. This satisfies the Task 3 rendering check without a TUI screenshot.






