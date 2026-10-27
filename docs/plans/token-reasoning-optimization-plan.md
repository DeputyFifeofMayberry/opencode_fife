# Token and Reasoning Optimization Plan

**Date:** 2026-10-26  
**Input audit:** `docs/ideas/agentic_cli_token_reasoning_audit_2026-10-26.md`  
**Code baseline:** `dev` at `07bae7483b`, plus the inspected working tree  
**Scope:** CLI-first planning only. No runtime change is authorized by this document.

## 1. Executive Recommendation

Keep the fork's existing **session-stable, evidence-adaptive effort policy**. Do not add a task classifier, a second router, per-tool reasoning controls, or new agents. The highest-value next work is a trustworthy, reconciled task-level measurement loop, followed by one optimization at a time against the declared objective for the affected policy, not a single cost-per-success threshold.

The audit did not inspect this fork. Source inspection changes its implementation priorities substantially:

- `effort_policy` already provides `low` / `standard` / `deep` bases, a plan-mode pin, delegation defaults, durable one-level verification-failure escalation, and de-escalation after a qualifying pass (`packages/schema/src/config/effort.ts:6-29`; `packages/core/src/effort/policy/policy.ts:23-55,69-120`).
- Manual model/variant choices already take precedence over automatic policy (`packages/core/src/effort/transition.ts:45-80`). Effort is applied at step preparation, not to mechanical tool execution (`packages/core/src/session/runner/llm.ts:286-346`).
- Same-model effort changes already use cache-preserving message markers on capable OpenAI Responses and Anthropic-family routes, and markers are stripped elsewhere (`packages/ai/src/effort-updates.ts:1-25`). Cache placement is already policy-driven (`packages/ai/src/cache-policy.ts:1-35,190-222`).
- Token usage is already normalized into disjoint fresh input, cache read, cache write, visible output, and reasoning categories (`packages/ai/src/schema/events.ts:20-62`; `packages/schema/src/token-usage.ts:5-18`). Endpoint-reported cost already wins over catalog estimation (`packages/core/src/session/usage.ts:21-51`).
- Generic tool-result bounding, shell output persistence, compaction, subagent sessions, retry handling, stats, and sanitized session export already exist. They should be measured before replacement or tightening.

**Recommended policy:** Balanced remains the default and maps to the existing `standard` base. Efficiency and Quality are configuration profiles over the existing `low` and `deep` bases, selected before a fresh session. Do not add a parallel `profile` enum or CLI flag. An explicit `#variant` from `--model`, an agent, or a session pick remains an exact override.

**Primary gaps:** cost provenance is not persisted and retries without settled usage cannot be priced; export/stats do not by themselves provide a controlled task benchmark with correctness, verified effective-effort separation, and matched parent/child aggregation; no local task-level or action-level measurements support the audit's rankings; and the current policy has no evidence that finer phase routing would improve net outcomes.

**Verification during planning:** the actual local CLI exposes `stats` with date/window/project filters plus `--models`, `--tools`, `--cost`, `--full`, `--limit`, and `--json`, and `session export --sanitize`; top-level `export` is not a stats command. Focused planning checks passed: 53 effort-policy tests, 91 effort/cache transport tests, 44 usage/stats/output/compaction tests, 4 session-runner effort integration tests, and 3 effort-history mapping tests. These tests establish implementation behavior, not token savings; three repetitions in a pilot are a screening instrument, not confirmatory evidence.

## 2. Existing Architecture

### 2.1 Request-to-completion flow

1. **Admission and selection.** Durable prompt admission is separate from execution. A drain reloads the selected session, agent, model, instructions, messages, and tools. `SessionRunner` remains Location-scoped and process-local as required by `AGENTS.md:203-214`.
2. **Step preparation.** Each logical step reloads context, applies `EffortTransition`, reloads again if the variant changed, estimates/compacts context, builds the transcript, and prepares one provider request (`packages/core/src/session/runner/llm.ts:277-346`).
3. **Policy decision.** `EffortTransition.apply` reads durable effort state and the selected `Model.Info`, calls `EffortAdapter.decideFor`, publishes `session.model.selected` for a same-model variant change, records `lastAppliedVariant`, and emits edge-triggered `session.effort.transitioned` (`packages/core/src/effort/transition.ts:40-108`; `packages/schema/src/session-event.ts:71-95`). It does not emit a durable event for every request.
4. **Context and provider call.** The runner builds one explicit `llm.stream` request for the step (`packages/core/src/session/runner/llm.ts:312-374`; `packages/core/src/session/runner/step.ts:110-158`). Provider retries can repeat an attempt without creating an in-memory tool loop; tool continuations become later steps.
5. **Tools.** Provider tool calls execute through the captured tool registry. The runner applies generic output truncation before durable settlement, then observes configured verifier evidence (`packages/core/src/session/runner/step.ts:130-153`). Tool execution itself makes no additional LLM call.
6. **Continuation and completion.** Provider/tool outcomes settle durably; retry, overflow compaction, continuation, step limits, and idle behavior remain in the existing runner (`packages/core/src/session/runner/llm.ts:346-389`). Compaction usage is represented separately from ordinary assistant-step usage (`packages/schema/src/session-message.ts:248-274`).

### 2.2 Model, effort, and provider controls

- The canonical reasoning vocabulary accepts known values plus forward-compatible provider strings (`packages/ai/src/schema/options.ts:191-199`). Model variants carry the actual provider settings; the policy does not send the conceptual levels directly.
- `EffortAdapter.capability` filters advertised variant IDs through `ReasoningEfforts`, ignores non-effort variants, and leaves routes with fewer than two real effort variants untouched by automatic policy (`packages/core/src/effort/adapter.ts:11-35`). Exact user variants still pass through unchanged.
- The pure policy has only `low`, `standard`, and `deep`. `deep` prefers `max`, otherwise the highest advertised effort; `standard` means the adapter default/unset variant (`packages/core/src/effort/policy/levels.ts:9-74`; `packages/core/src/effort/adapter.ts:14-21`). This is a host mapping, not proof that two provider labels have distinct endpoint semantics. Two advertised labels can describe the same provider-visible setting, so benchmarks must verify the wire parameter and treat unresolved aliases as indistinguishable rather than as distinct tiers.
- `EffortTransition` gives any non-policy-echo session variant exact-pick precedence (`packages/core/src/effort/transition.ts:45-80`). The actual CLI also accepts `opencode run --model provider/model#variant`.
- The top-level `model` config accepts `provider/model#variant`, but the configured default is reduced to provider/model before resolution (`packages/core/src/config/plugin/provider.ts:93-102`; `packages/core/src/model.ts:84-87,155-159`), so its variant is not applied when `ModelResolver.resolve` receives no explicit request (`packages/core/src/model-resolver.ts:419-434`). Exact variants from `--model`, an agent's `model`, or a session pick are preserved. Documentation and benchmarks must not claim top-level default variant preservation.
- Cache-preserving `Message.effort` markers are retained only when `route.supportsEffortUpdates` accepts them. Otherwise they are removed and the resolved top-level request settings apply (`packages/ai/src/effort-updates.ts:5-25`). Consequently, unsupported mid-session changes can still invalidate a provider prefix; the transport does not claim otherwise.

### 2.3 Current effort policy

| Mechanism | Current behavior | Evidence |
|---|---|---|
| Base | Durable per-session base; config seeds a session without a row, default `standard` | `packages/core/src/effort/transition.ts:45-64`; `packages/core/src/effort/store.ts:18-35,39-105` |
| Plan pin | `plan` raises the effective base to `deep` | `packages/core/src/effort/adapter.ts:38-56`; `packages/core/src/effort/policy/policy.ts:23-25,102-120` |
| Delegation | Built-in agent names map to operation start levels; plan and review start at `deep`; explicit, configured, or inherited variants win | `packages/core/src/effort/delegation.ts:9-52`; `packages/core/src/effort/policy/policy.ts:32-43`; `packages/core/src/tool/plugin/subagent.ts:172-217` |
| Escalation | Only exact configured verifier commands count. Non-zero exit opens one-level escalation; unrelated commands and missing exit metadata do nothing | `packages/core/src/effort/evidence.ts:11-72` |
| De-escalation | Same verifier must pass later and at a not-older mutation revision | `packages/core/src/effort/policy/policy.ts:57-88` |
| Loop bound | Escalation is one level above effective base and capped at `deep`; it does not grow on every failed request | `packages/core/src/effort/policy/levels.ts:20-44` |
| Step ceiling | Applied only when the selected agent configures `steps`; no default cap exists | `packages/core/src/session/runner/llm.ts:312`; `packages/schema/src/agent.ts:33` |
| Revision tracking | Default mutation tools are `write`, `edit`, `patch`; shell-side mutations are not inferred | `packages/core/src/effort/evidence.ts:33-41` |
| Observability | Durable transitions include rule, conceptual level, and optional variant; model selection is a separate durable event | `packages/schema/src/session-event.ts:71-95`; `packages/core/src/effort/transition.ts:79-106` |

Changing `effort_policy.base_level` is not a reliable in-place switch for an existing session: once a row exists, its durable base wins over config (`packages/core/src/effort/transition.ts:57-58`). Benchmarks and profile selection must therefore use fresh sessions or an explicit session-control operation; this plan chooses fresh sessions and adds no new control.

### 2.4 Context, caching, tools, and delegation

- Auto caching is enabled by default and places bounded breakpoints on tools, system parts, and conversation tails, subject to route compatibility and a four-marker budget (`packages/ai/src/cache-policy.ts:5-35,82-99,190-222`). OpenAI-style implicit caching routes do not receive useless inline markers (`packages/ai/src/cache-policy.ts:49-80`).
- Compaction runs before a request when required, on overflow, and through precompute/background paths (`packages/core/src/session/runner/llm.ts:304-311,367-381`). It is already part of the execution flow, not a new optimization to layer on top. Legacy `compaction.prune` and `tail_turns` settings are explicitly unsupported (`packages/core/src/config/normalize.ts:345-356`), so no pruning layer is assumed.
- Generic tool output is bounded after execution (`packages/core/src/session/runner/step.ts:130-147`). Tests verify persisted full output, bounded model previews, line/byte limits, mixed-content ordering, and producer-reported truncation (`packages/core/test/tool-output.test.ts:33-137`). Tool-specific bounds also exist; `packages/core/src/tool/AGENTS.md:56-60` explicitly assigns generic bounding to the Session runner and bounded tails/full-output paths to shell. The generic bound is skipped whenever a producer supplies any `metadata.truncated` value (`packages/core/src/tool-output.ts:69-70`); grep/glob always supply it and accept an unbounded positive `limit` (`packages/core/src/tool/plugin/grep.ts:35-37,110-119,145`; `packages/core/src/tool/plugin/glob.ts:25-27,92-98,119`; `packages/core/src/filesystem.ts:66-83`). Code Mode namespace discovery also carries an explicit unbounded TODO (`packages/core/src/codemode/catalog.ts:94-95`). These are measurement candidates, not reasons to lower all limits.
- Subagents are real child sessions with explicit model precedence and independent prompts (`packages/core/src/tool/plugin/subagent.ts:172-246`). Their spend must be joined to the root task exactly once, not treated as free and not added twice.

### 2.5 Usage, cost, retry, and telemetry

- `AI.Usage` retains inclusive provider totals and a non-overlapping breakdown, with raw provider usage in `providerMetadata` at the AI event boundary (`packages/ai/src/schema/events.ts:20-81`). Session storage maps this to fresh input, visible output, reasoning, cache read, and cache write (`packages/core/src/session/usage.ts:8-19`).
- `TokenUsage.total` correctly computes `input + cache.read + cache.write + output + reasoning`; reasoning is not added to an already inclusive output total (`packages/schema/src/token-usage.ts:5-18`). Cost likewise prices `output + reasoning` once (`packages/core/src/session/usage.ts:23-36`).
- Missing normalized fields become zero in session token storage (`packages/core/src/session/usage.ts:8-19`). Therefore an exported zero is not universal proof that a provider reported zero. Benchmark records must retain a coverage/unknown marker and must not infer unsupported cache or reasoning values from zeros.
- `SessionUsage.record` prefers endpoint-reported `Usage.cost`, including authoritative zero, and otherwise estimates from catalog rates (`packages/core/src/session/usage.ts:39-51`). `SessionUsage.add` then retains only total cost and tokens (`packages/core/src/session/usage.ts:54-65`), so downstream exports cannot distinguish provider-reported, catalog-estimated, or legacy-unknown amounts, nor identify unpriced records. When no catalog rate matches, `calculateCost` returns zero (`packages/core/src/session/usage.ts:23-37`), which is indistinguishable from a real zero.
- Endpoint-reported cost is a provider-reported per-request amount, not independently verified billed spend. Catalog estimates and reported amounts can both differ from an invoice because of subscriptions, routing, discounts, or missing route pricing. Keep `billing_verified` as a run-level fact that only external invoice or usage-export reconciliation can set.
- Assistant messages carry model, optional cost/tokens, retry information, and timestamps; compaction messages carry separate usage (`packages/schema/src/session-message.ts:213-274`). These are the existing attribution anchors. No new per-request durable event stream is needed.
- Provider-error retry and verification-driven effort escalation are different mechanisms. Retry policy lives in the runner retry path (`packages/core/src/session/runner/llm.ts:346-389`), while verifier evidence is observed only after tool settlement (`packages/core/src/session/runner/step.ts:130-153`). Retry scheduling is durable (`packages/schema/src/session-event.ts:589-600`; `packages/core/src/session/runner/retry.ts:57-76`), but usage settles only when an attempt reaches a `step-finish` or a failure carrying usage (`packages/core/src/session/runner/step.ts:256-280`). An attempt that dies before that point can be billed without a settled usage record. Do not conflate transport retries with failed software-verification attempts, and do not treat an unsettled retry as zero-cost.
- Verified CLI surfaces include `opencode stats [--days|--year|--all] [--project] [--models] [--tools] [--cost] [--full] [--limit] [--json]` and `opencode session export [session] --sanitize`. Export is a session subcommand, not top-level `opencode export`.

### 2.6 Responsibility boundaries and overlap

- **Schema** owns serializable config/message/token contracts; **AI** owns one provider call and provider normalization; **Core** owns session policy, tools, compaction, retry, and cost recording. Preserve this direction.
- Model selection and effort policy overlap deliberately at `session.model.selected`: reusing that transition supplies history markers and client reconciliation. A second effort-write path would be harmful.
- Compaction and caching both affect subsequent input economics, but neither is a reasoning router. Measure their interactions rather than adding cache guesses to `effort/policy`.
- Permissions and verification are independent of effort. No profile may weaken either.

## 3. Audit-to-Codebase Gap Matrix

Statuses apply to this fork, not upstream OpenCode. “Implemented” does not mean empirically optimal.

| ID | Material audit recommendation | Status | Code evidence | Disposition |
|---|---|---|---|---|
| A01 | Start Balanced; use moderate default effort | **Implemented** | Default base is `standard` (`effort/transition.ts:57-64`) | Keep. No new default router. |
| A02 | Efficiency / Balanced / Quality selectable policies | **Partially implemented** | Existing `base_level` accepts `low` / `standard` / `deep` (`schema/config/effort.ts:6-21`) | Use these as the three profiles in fresh sessions after effective-effort preflight. Document semantics and convergence limits; no duplicate profile setting. |
| A03 | Task-aware routine/medium/high allocation | **Partially implemented** | Base, plan pin, and delegation operations exist; no prompt/task classifier (`effort/policy/policy.ts:23-55`; `effort/delegation.ts:9-52`) | Reuse current explicit signals. Do not add an LLM or heuristic task classifier without measured evidence. |
| A04 | Phase-aware effort at meaningful boundaries | **Partially implemented** | Policy runs per prepared step but changes only on base/pin/delegation/verifier transitions (`runner/llm.ts:286-346`; `effort/transition.ts:45-108`) | Current step boundary is sufficient transport. Fine-grained discover/implement/review classification is deferred. |
| A05 | Do not change effort on every read/grep/bash | **Implemented** | Tools run inside a step; policy decisions precede provider requests (`runner/step.ts:116-153`; `runner/llm.ts:294-346`) | Preserve. Per-tool effort would be architecturally wrong. |
| A06 | Deterministic operations need no model call | **Implemented** | Tool settlement and output truncation are local effects (`runner/step.ts:130-153`) | Do not create model calls to summarize every successful mechanical result. |
| A07 | Provider-specific conceptual-to-real effort mapping | **Implemented** | Variant filtering/mapping and untouched fallback (`effort/adapter.ts:11-35,68-74`; `ai/schema/options.ts:191-199`) | Keep forward-compatible variants. Benchmark effective endpoint tiers, especially aliases. |
| A08 | Preserve user model and effort overrides | **Partially implemented** | Exact non-echo variant wins; delegation precedence is explicit > agent > parent (`effort/transition.ts:45-80`; `tool/plugin/subagent.ts:172-217`). Top-level configured default drops `#variant` (`packages/core/src/config/plugin/provider.ts:93-102`; `packages/core/src/model.ts:84-87,155-159`) | Regression-gate explicit CLI, agent, and session picks. Document or fix default-config variant loss as a separate change; do not claim it is preserved. |
| A09 | Escalate on unresolved failures; de-escalate on recovery | **Implemented** | Durable verifier state, one-level raise, qualifying pass clears (`effort/evidence.ts:24-62`; `effort/policy/policy.ts:57-120`) | Reuse. Do not add a retry-count escalator. |
| A10 | Do not escalate merely because a test failed twice; classify infrastructure | **Partially implemented** | Only configured non-zero verifier exits count; missing exit/spawn/cancel paths do not (`effort/evidence.ts:14-22,39-61`) | Existing rule is narrower and safer. General failed-hypothesis/loop detection remains unmeasured. |
| A11 | Cap escalation and prevent loops | **Partially implemented** | One-level capped escalation exists; provider retry is separate (`effort/policy/levels.ts:20-44`). The runner's step ceiling applies only when an agent sets `steps`; no default cap exists (`runner/llm.ts:312`; `schema/agent.ts:33`) | Add no generic loop detector until baseline identifies repeated-step signatures and cost. The benchmark harness must enforce an outer wall-clock/turn budget. |
| A12 | Risk should override patch size | **Partially implemented** | Plan and review can be deep, but there is no general security/data-loss risk classifier (`effort/delegation.ts:9-25`) | Keep permissions fixed. Use explicit plan/review or exact effort for high-risk work; automatic risk inference is deferred. |
| A13 | Cache-preserving effort changes where supported | **Implemented** | Per-message update support and stripping fallback (`ai/effort-updates.ts:1-25`); cache marking skips update markers (`ai/cache-policy.ts:154-175`) | Reuse existing transport; add no second marker format. |
| A14 | Compare switch savings with cache loss | **Missing** | Transport knows capability, not expected dollar tradeoff (`effort/transition.ts:45-108`) | Measure cold/warm cache first. Do not add a speculative cost estimator to the hot path. |
| A15 | Stable system/tool prefixes and caching optimization | **Implemented** | Automatic bounded cache placement and route-specific policies (`ai/cache-policy.ts:17-35,49-80,190-222`) | Benchmark existing behavior before changing it. |
| A16 | Bounded reads/search/log output; preserve full evidence | **Partially implemented** | Generic persisted-output preview plus producer bounds (`runner/step.ts:130-147`; `core/test/tool-output.test.ts:33-137`; `core/src/tool/AGENTS.md:56-60`). Any producer `metadata.truncated` value skips the generic bound (`packages/core/src/tool-output.ts:69-70`); grep/glob always set it and accept an unbounded `limit`; Code Mode catalog discovery is unbounded (`packages/core/src/codemode/catalog.ts:94-95`) | Do not blindly lower limits. Measure unbounded grep/glob and Code Mode output, then fix one owning tool at a time. |
| A17 | Avoid redundant file re-reads | **Missing** | No verified cross-step content deduplication mechanism was found | Defer. Naive dedup risks stale code and cache-prefix changes; requires trace evidence and revision-safe semantics. |
| A18 | Compaction can reduce future input but has cost/quality tradeoffs | **Implemented / Unverified benefit** | Auto, overflow, and precompute paths (`runner/llm.ts:304-311,367-381`); `compaction.prune` and `tail_turns` are explicitly unsupported (`packages/core/src/config/normalize.ts:345-356`) | Keep. Measure summary request plus post-compaction input/cache/correctness; no threshold change by default. |
| A19 | Subagent effort defaults without proliferating agents | **Implemented** | Operation seeds existing child sessions; inherited/explicit picks win (`effort/delegation.ts:27-52`; `tool/plugin/subagent.ts:188-217`) | Reuse current agents. No reviewer/architect additions for routing. |
| A20 | Aggregate child spend once | **Partially implemented** | Parent/child IDs and per-message usage exist (`packages/schema/src/session.ts:34`; `schema/session-message.ts:220-246`); stats tests include child sessions (`core/test/session-stats.test.ts:27-75`) | Add an explicit benchmark root-task aggregator and uniqueness checks; do not sum parent and already-nested totals blindly. |
| A21 | Normalize input/cache/output/reasoning without double counting | **Implemented** | Disjoint canonical contract and total/cost equations (`ai/schema/events.ts:20-62`; `schema/token-usage.ts:16-18`; `core/session/usage.ts:23-36`) | Reuse these equations. Preserve inclusive raw values only for reconciliation. |
| A22 | Unknown values must remain unknown, not zero | **Partially implemented / Conflicting storage boundary** | AI fields are optional, but session normalization uses zero defaults (`ai/schema/events.ts:65-81`; `core/session/usage.ts:8-19`) | Do not rewrite public token schema now. Benchmark manifests must record coverage and exclude unsupported category comparisons. |
| A23 | Separate actual and estimated dollar cost | **Partially implemented** | Endpoint cost wins, but `Recorded`/`add` and stored messages retain only one number (`core/session/usage.ts:39-65`; `schema/session-message.ts:220-274`). Copilot's billed amount is still not normalized (`packages/core/src/session/usage.ts:21-22`) | Add optional provenance amounts (provider, estimated, unpriced) and keep legacy costs unknown; distinguish reported from invoice-verified spend. Flag routes whose billed cost is not promoted. |
| A24 | Record requested/resolved model and effort decisions | **Partially implemented** | Assistant/compaction model refs and transition events exist; no per-request `untouched` record (`schema/session-message.ts:220-274`; `schema/session-event.ts:82-95`) | Reconstruct steps from existing history. Capture effective wire effort in a preflight matrix and per-request variant; do not add durable per-request events. |
| A25 | CLI stats/export support measurement | **Implemented / Insufficient alone** | Verified actual help: `stats --json --cost`, `session export --sanitize` | Use current commands. Correct the audit's top-level export assumption. |
| A26 | Export sanitization and safe telemetry | **Partially implemented** | `session export --sanitize` exists; AI raw usage can contain provider metadata (`ai/schema/events.ts:60-62`) | Analyzer output must be numeric allowlists only. Inspect sanitized fixtures before sharing; never export prompts, source, keys, or raw request bodies. |
| A27 | Preserve provider-specific reasoning content in tool history | **Implemented for existing route mechanisms** | AI compatibility includes reasoning/signature requirements and route-specific normalization (`ai/schema/options.ts:213-246`) | Add provider cassette tests for any newly benchmarked route; do not generalize one provider's history format. |
| A28 | Enforce output budgets without cutting required output | **Partially implemented** | Canonical generation options include `maxTokens` (`ai/schema/options.ts:115-163`). Agent `request` settings are stored (`schema/agent.ts:27`; `core/src/config/plugin/agent.ts:112-115`) but have no Core consumer in the primary request path | Keep existing model settings fixed across comparisons and verify the wire request. Do not rely on agent `request` settings for output caps. No new policy-specific output cap without an observed truncation problem. |
| A29 | Verification and authorization stay fixed across policies | **Implemented architecturally / Benchmark gap** | Effort code does not alter permission or test requirements; benchmark correctness is not yet standardized | Make identical external verification and task-class rubrics a hard experiment gate. |
| A30 | Controlled E/B/Q benchmark and measured rankings | **Missing** | Existing tests/cassettes validate behavior, not live task economics | Build the staged harness in milestones 2-3; report n, effective-effort separation, missingness, spread, failures, and the policy-specific objective. |
| A31 | Re-rank actions/tasks from actual data | **Missing** | No local benchmark corpus or report exists | Produce measured action-exposure and task strata only after enough data; separate observed from inferred reasoning; never convert audit ranks into claimed savings. |

## 4. Optimization Opportunities

The ranking below is by expected practical value and dependency order, not predicted savings. No percentage improvement is claimed.

| Rank | Opportunity | Category | Expected benefit and evidence | Complexity / main risk | Measurement and decision |
|---:|---|---|---|---|---|
| 1 | Persist cost provenance amounts and build root-task aggregation | Telemetry | Enables the audit's primary metric. Current code verifies cost preference but loses origin and cannot distinguish unpriced routes (`session/usage.ts:23-65`) | Low-medium; additive message fields and legacy unknowns | Fixture reconciliation; provider, estimated, and legacy amounts sum to total; unpriced attempts counted, not zeroed |
| 2 | Build staged static-profile benchmarks with effective-effort separation | Routing + measurement | Directly tests the simplest E/B/Q design using existing controls, but only where levels map to distinct wire settings | Medium harness cost; live spend, convergence, and noisy provider behavior | Per-model wire matrix; matched runs; converged runs excluded; policy-specific objectives; neutral results reject added routing |
| 3 | Attribute action-level exposure and repeated input/retry waste | Completion + input | Measured tool-result exposure and durable steps make this analyzable without new routing | Low analysis complexity; action-level reasoning is not separable | Rank observed exposure separately from associated/inferred reasoning; count retries, compactions, tool calls, repeats; retain failed runs |
| 4 | Tune one demonstrated tool/context hotspot | Input/context | Existing caps already bound output, so value must come from a measured shape rather than generic truncation | Unknown until trace; stale/lost evidence and cache invalidation | Change one owning tool or config default; compare identical verification and first-request/cache effects |
| 5 | Use configured verifier escalation on hard repair tasks | Completion + reasoning | Mechanism is implemented and tested; real quality/cost effect unknown | Low configuration, no new runtime; exact command matching can miss wrappers | Compare with/without escalation only after static baselines, in a separate adaptive condition; count transitions, new evidence, repeats, and recovery |
| 6 | Measure cache and compaction interactions | Provider cost + input | Native update/cache/compaction support already exists, so experiments can be focused | Medium; cold/warm confounding and summary information loss | Include compaction request cost, next-request cache write/read, subsequent retries, and correctness |
| 7 | Improve unsupported/fallback explainability only where exports are insufficient | Telemetry + routing | Transition events explain changes, but untouched routes require history reconstruction | Low if offline; high-cardinality/per-request durable logging would be harmful | Offline decision reconstruction first; add runtime logs only for an observed support incident |
| 8 | Automatic task/phase/model routing | Routing | Potential benefit is hypothetical; current explicit signals already cover important cases | High; misclassification, config duplication, cache loss, quality regressions | Deferred behind proof that stable/current-adaptive profiles leave measured value unrealized |

**Quick wins:** cost-provenance amounts, a numeric-only export analyzer, an effective-effort preflight, corrected CLI/profile documentation, and a benchmark manifest.  
**Architectural changes:** none are justified now. Dynamic task classification, automatic model selection, and cache-cost prediction remain experiments, not planned production layers.

## 5. Proposed Design

### 5.1 Three policies over existing controls

Select `effort_policy.base_level` before creating a session. Keep the external verification procedure identical within a comparison, but leave `effort_policy.verification_commands` unset in the static E/B/Q comparison and configure it only in the separate adaptive condition. Do not assume the three settings produce three distinct provider behaviors; section 7.2 defines the effective-effort gate.

| Policy | Existing setting | Intended use | Important semantics |
|---|---|---|---|
| Efficiency | `base_level: "low"` | Well-specified implementation and cost-sensitive work | A configured failure raises to `standard`; plan mode still pins to `deep`; an exact user variant wins |
| Balanced | `base_level: "standard"` or omitted | Default general software work | Model default remains stable; a configured failure raises to `deep`; existing delegation defaults apply |
| Quality | `base_level: "deep"` | User-identified difficult diagnosis, architecture, security, concurrency, migration, or complex review | Resolves to `max` when advertised, otherwise highest available; use on fresh, difficult-task sessions, not as a universal default |

Plan mode pins to `deep`, and delegated plan/review operations start at `deep` (`packages/core/src/effort/adapter.ts:38-56`; `packages/core/src/effort/policy/policy.ts:32-43`). Those paths cannot distinguish E/B/Q; run them only as convergence or precedence controls. The settings in the table are intended conditions, not proof of distinct effective effort. Rows describe production semantics; the static comparison deliberately removes verifier escalation and delegation so the base mapping itself can be tested, while separate adaptive and precedence conditions cover them.

An exact variant is preserved only when it arrives through `--model`, an agent's `model`, or a session pick. The top-level configured default drops `#variant` before resolution (section 2.2); do not use it as the exact-override control in a benchmark or document it as preserved.

Illustrative JSONC: the base level selects the profile; the verifier commands apply only to the adaptive condition.

```jsonc
{
  "effort_policy": {
    "base_level": "low", // Efficiency; use "standard" or "deep" for the other profiles
    // Omit verification_commands in the static E/B/Q comparison;
    // configure the exact command only in the separate adaptive condition.
    "verification_commands": ["<exact project verification command>"]
  }
}
```

No named `Efficiency` runtime enum is needed. Adding one would duplicate `base_level`, create migration/precedence questions, and obscure manual variant behavior. Profile names belong in documentation and benchmark manifests.

Quality is deliberately session-stable. Deterministic tool execution remains local and receives no reasoning setting. The design does **not** pretend to infer that an individual read or shell call deserves a different provider effort. If stable Quality wastes money on mixed mechanical/difficult sessions, the remedy supported by evidence may be narrower task selection or delegation, not per-tool switching.

### 5.2 Routing and escalation logic

The production decision path remains:

```text
selected model + selected agent + durable effort state
  -> exact non-policy variant? preserve it verbatim
  -> otherwise effective base = max(configured/durable base, plan pin)
  -> unresolved configured verifier failure? raise exactly one level, capped at deep
  -> map through advertised model variants
  -> unchanged/default/unsupported? make no transition
  -> changed variant? reuse session.model.selected and existing effort-update history
  -> construct one LLM request; execute resulting tools locally
```

There is no automatic model change. There is no reasoning selection inside tool executors. Provider retry count alone never changes effort. A passing verifier must be newer and not older than the failing revision. Existing exact-command and shell-mutation limitations remain explicit.

`Effective effort` for measurement is the provider-visible setting on each request after exact pick, pin, delegation seed, and escalation. A requested variant ID is not sufficient proof of a distinct endpoint tier.

### 5.3 Static versus adaptive allocation

| Approach | Strengths | Weaknesses | Decision |
|---|---|---|---|
| Stable effort per fresh session | Simple, explainable, cache-friendly, already supported | Cannot react to changing difficulty; static E/B/Q collapses if levels alias | Baseline for the profiles that survive effective-effort preflight |
| Current evidence-adaptive effort | Handles explicit plan/delegation boundaries and durable verification failure; bounded transitions | Exact verifier setup; no general uncertainty/risk detection | Recommended production hybrid |
| Automatic per-phase classification | Could match effort to discovery/implementation/diagnosis | Classifier errors, new state, cache churn, difficult attribution | Experiment only if baseline shows a residual problem |
| Per-tool-call effort | No provider reasoning context belongs to the mechanical tool itself | Cache churn and false conceptual model | Reject |
| Automatic model routing | Might optimize price/capability across tasks | Largest correctness, compatibility, privacy, and cache surface | Reject for now |

### 5.4 Cache and fallback behavior

- Prefer no transition when the resolved effort is unchanged. Current edge-triggered behavior already does this.
- On routes with verified per-message support, reuse `Message.effort` markers. On other routes, markers are stripped; do not label the switch cache-preserving.
- Do not switch merely to save reasoning when a long uncached prefix makes the net tradeoff unknown. Stable profiles are the control against which any finer switching must prove value.
- Unsupported automatic levels remain `untouched`; exact user settings retain existing pass-through behavior. Benchmark reports must distinguish “no transition required,” “unsupported automatic policy,” and “provider alias/effective tier unknown.”
- Compaction remains orthogonal to effort. Include its usage and subsequent cache behavior in the same task ledger.

### 5.5 Measurement contract and reconciled ledger

The ledger unit is one root task run. Token equations remain:

```text
gross_input     = input + cache.read + cache.write
gross_generated = output + reasoning
gross_tokens    = gross_input + gross_generated
```

`output` is visible output in session storage; `reasoning` is separate. Never add reasoning to an already inclusive raw `AI.Usage.outputTokens`. Never add cache categories to inclusive raw `inputTokens`.

The benchmark suite manifest supplies the stage ceilings. Each task-run manifest supplies `task_id`, stratum, repository snapshot, prompt, verification rubric, policy, provider/model/requested variant, cache condition, repetition, root `session_id`, and auxiliary-spend scope. The analyzer derives child sessions, steps, actions, compaction, usage, effective effort, and timing.

**Cost provenance amounts.** Preserve monetary amounts by origin, not one `mixed` label:

- `provider`: endpoint-reported `Usage.cost`, including an authoritative zero.
- `estimated`: catalog-priced fallback.
- `unpriced`: no provider cost and no applicable catalog rate; retain a count, not a zero claim.
- `legacy_unknown`: a stored cost from before provenance existed; report the amount but do not attribute it to either origin.
- `mixed` is derived when provider and estimated amounts are both non-zero.

Total cost remains the sum of populated amounts. Do not relabel a legacy amount as estimated. `provider` is provider-reported, not invoice-verified; a run-level `billing_verified` flag may be set only after reconciliation against a provider usage export or invoice that exposes per-request or per-session line items. A monthly aggregate that cannot be allocated to the run is not run-level billing verification.

**Completeness and unreconciled spend.** The ledger must report:

- `attempts_without_settlement`: provider attempts that produced no settled usage record, derived from retry/step history and, when available, the harness request count;
- `unpriced_records`: settled usage records with no price;
- `reverted_activity`: whether messages were deleted by revert before export;
- `auxiliary_scope`: whether title, warming, and other non-mutating `Session.generate` calls are included;
- `usage_complete`, `cost_complete`, `cost_reconciled`, and `billing_verified` booleans with counts.

`cost_complete` requires every paid attempt to have a priced amount; `cost_reconciled` requires the component amounts to sum to the stored total with no attempt unaccounted for. If a paid attempt cannot be priced, or reverted/post-revert activity prevents attribution, mark the run incomplete for cost comparisons. Do not impute zero. Report the known amount and the unreconciled remainder as unknown/incomplete, not as a smaller total.

The analyzer must:

- join descendants exactly once using session/message IDs;
- include provider retries, failed runs, and compaction cost;
- compare token categories within a provider's documented normalization; Gemini continued requests, for example, sum billed cost across iterations while normalized input describes final context (`packages/ai/src/protocols/gemini.ts:548-572`), so cross-provider token totals are not equivalent;
- capture message exports before any revert: revert deletes later messages while session cost retains their spend (`packages/core/src/session/projector.ts:818-851`; `packages/core/test/session-projector.test.ts:214-228`), or use durable step/usage events as the ledger;
- bill each precomputed compaction call at completion and never add its display aggregate again when reused (`packages/core/src/session/compaction.ts:416-439`);
- state whether title, warming, and other non-mutating `Session.generate` calls are in scope; title usage is projected separately and warming is absent from durable session totals (`packages/core/src/session/title.ts:53-96`; `packages/core/src/session/generate.ts:25-66`; `packages/core/src/plugin/warming.ts:31-54`);
- verify the wire request rather than assuming agent `request` settings were applied; they have no Core consumer in the primary request path (`packages/schema/src/agent.ts:27`; `packages/core/src/config/plugin/agent.ts:112-115`);
- record per-request effective effort and the provider-visible setting, not only the requested policy or variant label;
- emit numeric aggregates and hashed/local IDs only, never transcript or source content.

**Promotion rule:** no cost comparison is eligible while `cost_complete` is false. Claims about actual billed spend require `billing_verified`; provider-reported cost may support a provider-reported comparison only. A reconciling legacy-unknown amount may support a total-cost comparison, but not a provider-versus-estimated claim.

### 5.6 Policy objectives, correctness baseline, and promotion rule

Each policy is judged against its own objective. A single cost-per-verified-success threshold is not sufficient: Quality may legitimately cost more per success if it completes difficult tasks more reliably and produces fewer serious defects.

| Policy | Primary objective | Non-negotiable guardrail | Promotion evidence |
|---|---|---|---|
| Efficiency | Lowest all-in cost per verified success | Verified success and serious-defect rate non-inferior within the predeclared margin; latency ceiling respected | Cost per verified success improves beyond uncertainty, with complete cost accounting |
| Balanced | Best joint cost, quality, and latency tradeoff | Verified success and serious-defect rate non-inferior within the margin; cost and latency ceilings respected | Improves all-in cost or median latency by at least the minimum practical effect without worsening the other beyond its guardrail, or improves verified success or defects within the cost and latency ceilings |
| Quality | Highest verified success and lowest serious-defect rate on difficult tasks | Cost per verified success and P90 latency stay within predeclared ceilings | Verified success or serious-defect rate improves beyond uncertainty; higher cost per success is acceptable inside the ceiling |

`serious defect` means a security or data-loss issue, a broken build or required test suite, an incorrect user-visible result in the task's target behavior, or an out-of-scope regression. A policy that worsens any serious-defect measure cannot be promoted on cost or latency.

Within a static comparison, every policy runs the same task, snapshot, tools, permissions, and external verification, and no configured verifier drives escalation. Within an adaptive comparison, the configured verifier is identical across arms. A verified success requires the task-class rubric below, not just a non-zero exit. Failed, blocked, and timed-out runs stay in the denominator and retain all spend.

| Task class | Verified success | Serious defect / failure examples |
|---|---|---|
| Implementation | All task tests and hidden regression checks pass; scoped diff; no new critical finding | Security/data loss, broken build, out-of-scope regression, incomplete migration |
| Planning / architecture | Predeclared required decisions, constraints, dependencies, risks, rollback, and acceptance criteria are present; every cited file/API resolves in the snapshot; independent rubric score at or above the predeclared threshold | Fabricated file/API, unsafe migration, missing rollback, unresolved contradiction |
| Review | Predeclared seeded defects found at the required severity; clean control fixtures do not produce critical false positives; findings are actionable and source-referenced | Missed critical defect, fabricated finding, wrong severity, no reproduction |
| Discovery / analysis | Expected facts or artifacts are found with bounded output; no unsupported claim about unseen code | Wrong file/API, unbounded dump, stale conclusion |

Planning and review rubrics are the verification instrument. The scoring scale and pass threshold are declared in the task manifest before a run. Two raters blind to policy should score them independently; report agreement and adjudicate disagreements. A deterministic source-reference check is mandatory even when a rubric score is used. Single-rater or unseeded review results are screening evidence only and cannot promote a policy.

A candidate is:

- **Retained** only when the policy-specific objective and its guardrails are met, cost accounting is complete, samples are adequate for the affected task/model stratum, and no critical regression appears.
- **Revised** when correctness holds but the measured tradeoff identifies a specific reversible defect or a subset that benefits.
- **Rejected/reverted** when quality or safety worsens, the policy-specific objective worsens, missing measurements prevent attribution, or the result is neutral within noise.

The screening pilot can only decide whether a confirmatory comparison is worth running. It never justifies changing the default. Promotion requires a predeclared minimum practical effect, non-inferiority margin, cost/latency ceiling, and adequate confirmatory samples.

### 5.7 Action-level exposure ranking

The audit's question about individual CLI actions cannot be answered by assigning each tool call its own reasoning budget. A `grep`, `glob`, or `read` does not reason; its output changes the context of later model requests. Produce separate analyses and label them honestly:

| Analysis | Unit | What is measured | Label |
|---|---|---|---|
| Observed action exposure | One tool call/result | Full result bytes, model-visible result bytes, declared token estimate, number of later requests containing it, fresh/cache-read input of those requests, repeat count | Measured or estimated, as stated |
| Request-level reasoning | Assistant request | Reasoning tokens reported for the request, including the request that emitted the action | Observed, request-level |
| Associated downstream reasoning | One action plus its later requests | Reasoning/output tokens of requests that follow the action, reported as association | Associated, not causal |
| Inferred action attribution | One action | A declared share of downstream reasoning/cost | Inferred, never "measured" |

Method for each root task run:

1. Reconstruct actions from tool call/result records, including child sessions and actions whose results were truncated for the model but persisted in full.
2. Record `result_bytes_full`, `result_bytes_visible`, a declared token estimate, the mutation or retrieval target, and whether the same target/query recurs.
3. Count later model requests whose transcript contains the result until compaction, revert, or task end. Multiply the visible token estimate by that count to produce `context_exposure_estimate`; split fresh versus cache-read input using the per-request usage fields where available. If cache attribution is not directly supported, report whole-request usage and label the split inferred.
4. Report reasoning emitted in the same assistant message as `request_reasoning`. If a message contains several tool calls, do not divide its reasoning among them as fact; a split requires a declared rule and an `inferred` label.
5. Rank actions separately by exposure (measured/estimated), repetition, and association with failures/repairs. Do not combine them into one score without stating the weights in advance.
6. Use controlled ablation only as an experiment: change one action's output bound or tool path and compare the same matched task. An observational ranking does not prove that removing an action saves tokens.

Report per task class/model with n, missingness, and uncertainty. Exclude runs without a complete action ledger (post-revert, missing usage, unresolved truncation) or mark them incomplete. Never present an inferred per-action reasoning share as measured.

## 6. Detailed Implementation Plan

### Milestone 1 — Preserve cost provenance amounts through existing usage recording

1. **Objective / justification:** Make provider-reported, estimated, unpriced, and legacy-unknown cost categories auditable without changing token accounting.
2. **Current behavior / references:** `SessionUsage.record` chooses provider or catalog cost, but `Recorded`, `add`, assistant messages, and compaction messages retain no origin (`packages/core/src/session/usage.ts:39-65`; `packages/schema/src/session-message.ts:220-274`). `calculateCost` returns zero when no catalog rate matches, which is currently indistinguishable from a real zero (`packages/core/src/session/usage.ts:23-37`).
3. **Proposed behavior:** Extend `Recorded` with an additive provenance breakdown: provider-reported amount, catalog-estimated amount, and an unpriced count. `record` sets exactly one priced origin per new record or marks it unpriced (provider zero is authoritative); `add` sums each component and the unpriced count. The catalog fallback must expose whether a rate matched: a matched zero rate is an estimated zero, while a missing rate is unpriced. Persist an optional breakdown beside assistant and compaction cost; keep the existing total. Readers classify a stored record without provenance as legacy unknown, never estimated, and do not synthesize provenance during migration. Derive `mixed` for display from non-zero components; do not store a single mixed label that loses amounts. A run-level `billing_verified` flag is separate and can only be set by external invoice or usage-export reconciliation.
4. **Expected locations:** `packages/core/src/session/usage.ts`; `packages/schema/src/session-message.ts`; the step settlement path in `packages/core/src/session/runner/step.ts` and the compaction/title settlement paths that call `SessionUsage.record`; focused tests in `packages/core/test/session-usage.test.ts` and session export/projection tests identified during implementation.
5. **Dependencies:** None. Read `packages/schema/AGENTS.md`; use the package `optional(...)` convention and same-name interface style. Do not alter `TokenUsage.total`.
6. **Configuration / compatibility:** No config change. Additive optional wire/storage fields; old records remain valid. Regenerate client artifacts only if the public generated surface changes, using `bun run generate` from root rather than editing generated files.
7. **Regressions / failure modes:** Misclassifying endpoint zero, treating an unpriced route as a zero estimate, confusing a matched zero catalog rate with a missing rate, calling legacy cost estimated, generated-client drift, or changing existing cost totals.
8. **Tests:** Unit cases for provider cost, provider zero, estimated fallback, matched zero catalog rate versus no rate, unpriced route, same-origin and mixed `add`, and legacy absent provenance; schema round-trip with absent fields; integration proving assistant and compaction settlement preserve components; export test for legacy unknown.
9. **Acceptance:** Existing `cost` values are numerically unchanged in fixtures; provider and estimated amounts reconcile to the stored total; records without provenance are reported as legacy unknown; the unpriced count is reported separately and unpriced records are not reported as zero cost; a matched zero catalog rate remains an estimated zero while a missing rate is unpriced; every new settled usage record has exactly one priced origin or is unpriced; mixed aggregates expose both component amounts; old encoded messages without provenance round-trip.
10. **Rollback:** Remove the additive fields and settlement writes while retaining the original cost calculation. No migration or data rewrite is required.

### Milestone 2 — Add an offline, numeric-only root-task and action ledger

1. **Objective / justification:** Turn existing session exports or durable step/usage records into a reproducible root-task ledger with cost coverage and action-level exposure before optimizing runtime behavior.
2. **Current behavior / references:** Per-message usage, parent/child identity, compaction usage, durable retry scheduling, and CLI export exist (`packages/schema/src/session-message.ts:220-274`; `packages/schema/src/session-event.ts:589-600`; `packages/core/test/session-stats.test.ts:27-75`; `packages/cli/src/commands/handlers/session/export.ts`). Export is one session and settled messages only; revert deletes messages while session cost keeps their spend (`packages/core/src/session/projector.ts:818-851`). There is no controlled root-task report with correctness, effective-effort, cost-coverage, or action metadata.
3. **Proposed behavior:** Add a local script that accepts a run manifest plus either a pre-revert session export or a local durable event/usage snapshot, recursively joins descendants once, and emits JSON/CSV aggregates. Reuse CLI export where it carries the needed fields and read the local database/event store only for missing coverage; do not add a server endpoint. Report:
   - provider, estimated, and legacy-unknown cost amounts plus the unpriced count; total; `usage_complete`, `cost_complete`, `cost_reconciled`, `billing_verified`;
   - retry/step attempts, including attempts without settled usage;
   - per-request effective effort reconstructed from durable model/transition history;
   - action records and the exposure ranking from section 5.7, with observed, associated, and inferred labels;
   - task correctness and policy metadata from the external manifest.

   Mark missing, unpriced, post-revert, or otherwise unresolved coverage explicitly; never reconcile such a run as complete task spend. Keep task correctness in the external manifest. Do not add production phase labels or per-request durable events.
4. **Expected locations:** New `script/session-usage-report.ts`; new `perf/token-reasoning/README.md`; new `perf/token-reasoning/fixtures/` for synthetic sanitized exports and expected reports. Reuse CLI export rather than adding a server endpoint.
5. **Dependencies:** Can start before Milestone 1. Without provenance fields, classify stored cost as legacy unknown and report component amounts as unavailable; do not block ledger validation on production schema changes. Milestone 1 then enriches the same report with provider/estimated/unpriced components. Live benchmark authorization is not needed.
6. **Configuration / compatibility:** No runtime configuration or API change. Local exports remain local; shared reports contain only allowlisted numeric fields and opaque IDs.
7. **Regressions / failure modes:** Double-counting child sessions, counting both a nested aggregate and its members, dropping compaction/retry spend, treating an unsettled attempt as zero, double-counting a reused precomputed compaction display, undercounting post-revert history, treating zero as unknown, leaking transcript fields, or silently accepting a fork as a child.
8. **Tests:** Synthetic unit fixtures for branching children, repeated IDs, forks, missing usage, unsettled retries, provider/estimated/unpriced/legacy costs, compaction, precomputed reuse, post-revert mismatches, malformed manifests, and action-ledger edges; integration against a real temporary session export; inspect actual report JSON for forbidden content.
9. **Acceptance:** A graph with a root, two children, and a fork counts only the intended root/descendant messages once; token equations reconcile for every populated record; cost components reconcile to total where priced; unsettled attempts and unpriced records are counts, not zeros; failed/missing runs remain visible; reverted work is captured before revert or marked incomplete; precomputed compaction is counted once; effective effort is reconstructed per request; action rankings label observed versus inferred; title/warming scope is explicit; report contains no prompt, tool content, file body, authorization header, or raw provider payload.
10. **Rollback:** Delete the standalone script/fixtures. Production session behavior is untouched.

### Milestone 3 — Build and run the staged static-profile benchmark

1. **Objective / justification:** Compare the simplest viable Efficiency/Balanced/Quality design before adding routing complexity, using only conditions whose effective effort is demonstrably distinct.
2. **Current behavior / references:** Fresh sessions can select existing base levels; CLI supports fresh `run --model provider/model#variant` and JSON output. Plan mode pins to `deep` (`packages/core/src/effort/adapter.ts:38-56`), delegation seeds plan/review at `deep` (`packages/core/src/effort/delegation.ts:9-52`; `packages/core/src/effort/policy/policy.ts:32-43`), exact picks win (`packages/core/src/effort/transition.ts:45-80`), and configured verifier failures escalate (`packages/core/src/effort/evidence.ts:11-72`). Current effort tests verify transitions but not task outcomes (`packages/core/test/session-runner.test.ts:2137-2274`).
3. **Proposed behavior:** Add a benchmark runner and declarative corpus. For each run, create a fresh session and isolated filesystem copy of a fixed repository snapshot, set only the condition under test, execute the CLI, run external verification/rubric, export usage before any revert, and write a manifest. Separate:
   - **Static E/B/Q:** main agent only; no plan agent, no subagents, no exact `#variant`, no configured `verification_commands`; external verification runs after the task. Verify which policies resolve to distinct provider-visible effort settings at preflight; run the largest valid comparison (three arms when all three are distinct, otherwise two) and report any unavailable arm as converged. Do not drop an assigned run from the intended-policy comparison for observed convergence.
   - **Adaptive verifier:** Balanced/standard with configured verifier commands, recording every transition and effective tier.
   - **Precedence controls:** plan pin, delegated review, and exact CLI/agent/session variants; these are convergence and override tests, not E/B/Q comparisons.

   Run Stage 0 smoke, Stage 1 screening, and only then Stage 2 confirmatory per section 7.3. Enforce spend ceilings and stop conditions in the harness; it must refuse to start without an approved ceiling. Verify the model/variant and generation options on the wire; agent `request` settings are not applied by Core's primary request path. Keep manual model, provider, instructions, tools, and verification fixed within a matched block.
4. **Expected locations:** New `script/benchmark-effort.ts`; `perf/token-reasoning/tasks.json`; `perf/token-reasoning/README.md`; synthetic runner tests near the script or a new focused package-local test location chosen without running tests from root. Reuse `script/session-usage-report.ts` from Milestone 2.
5. **Dependencies:** Milestone 2 for the ledger and action report; Milestone 1 for component cost amounts, though screening can classify legacy cost as unknown. Explicit provider/model and live-spend authorization; task-specific verification/rubrics; a predeclared minimum practical effect and policy-specific ceilings. Use `git archive` or filesystem copies into the approved temp area, never the dirty development checkout and never an implicit git mutation.
6. **Configuration / compatibility:** Benchmark-only config files/environment; no production default change. Static conditions must not use the top-level configured default variant; exact-user-variant scenarios must use `--model`, an agent model, or a session pick because the top-level configured default drops `#variant`; verify that policy does not override those picks.
7. **Regressions / failure modes:** Assuming three arms when only two are distinct; profiles converging through plan pin, delegation, exact variants, provider aliases, or verifier escalation; provider load confounding; cache-state leakage; dirty-tree contamination; accidental live spend; credential leakage; incomparable verification; post-revert undercounting; configured-default variant loss; agent request settings that never reach the wire; treating cassette replay as live latency/economics evidence.
8. **Tests:** Unit validation for run matrix/manifest, convergence classification, budget guard, and randomization seeds; integration with a simulated provider for lifecycle, effective-effort capture, and aggregation only; live CLI smoke for one task/policy; Stage 1 screening per section 7.3; Stage 2 only for gated comparisons. Recorded AI cassettes validate request/usage/effective-effort semantics, not live latency.
9. **Acceptance:** Every run records all manifest fields, root session, verification/rubric result, effective effort per request, retry/compaction/tool counts, token coverage, cost components and completeness, billing verification, and wall time; the static comparison contains only arms distinct at preflight and the largest valid two- or three-arm comparison is run; all valid assigned runs remain in the intended-policy analysis, with convergence reported separately for effective-tier analysis; reports include n, median, spread/uncertainty, failure rate, and the policy-specific objective; the manual-override control uses an explicit CLI/agent/session variant and remains unchanged; each run exports before revert; no run uses the user's dirty worktree; no screening result is labeled confirmatory.
10. **Rollback:** Stop the runner and remove benchmark-only files/configuration. No production rollback is needed. Record failed and neutral experiments in `perf/token-reasoning/README.md`.

### Milestone 4 — Document and retain the simplest justified policy configuration

1. **Objective / justification:** Make the three existing profiles and their separate objectives understandable without adding a parallel configuration surface.
2. **Current behavior / references:** The implementation exists, while `docs/spec/effort-policy.md:1-5` still says draft and describes its original acceptance plan. Durable base semantics and plan-pin behavior are not obvious to users.
3. **Proposed behavior:** Update effort-policy documentation with the E/B/Q mapping, separate policy objectives, fresh-session requirement, exact override precedence, provider fallback, plan-pin and delegation convergence, verifier setup, effective-effort verification, and benchmark limitations. Balanced/`standard` remains the default unless measured evidence supports another default.
4. **Expected locations:** `docs/spec/effort-policy.md`; `perf/token-reasoning/README.md`; user-facing CLI/config documentation only if the repository already has a corresponding current effort-policy page.
5. **Dependencies:** Milestone 3 screening or confirmatory results for measured claims; documentation of existing behavior can proceed independently but must not claim measured savings.
6. **Configuration / compatibility:** No new option. Explicitly document that an explicit `#variant` from `--model`, an agent's model, or a session pick is exact; the top-level configured default currently loses it. Existing durable rows do not follow later config-base edits.
7. **Regressions / failure modes:** Advertising `medium`/`high` as universally distinct, hiding that `deep` prefers `max`, suggesting in-place config changes affect old sessions, claiming top-level default variant preservation, or claiming benchmark pilot significance.
8. **Tests:** Validate JSONC examples through existing config decoding tests; run relevant docs/link checks; manually smoke one fresh session per base using a simulated model and inspect durable variant/transition history.
9. **Acceptance:** All three profile examples produce the documented initial decision; manual override, plan pin, delegation convergence, unsupported route, and existing-session behavior match the document; each policy's objective and guardrail are stated; no savings or quality claim lacks a linked report with effective-effort separation and cost completeness.
10. **Rollback:** Revert documentation only; runtime behavior remains unchanged.

### Milestone 5 — Test one measured hotspot at a time (conditional)

1. **Objective / justification:** Optimize a demonstrated dominant cost, retry, or quality source rather than implementing the audit's whole wish list.
2. **Current behavior / references:** Existing bounds, cache, compaction, and capped escalation are described in sections 2-3. Milestones 2-3 supply per-step/tool/cache/cost and action-exposure evidence.
3. **Proposed behavior:** Select at most one candidate whose measured exposure, cost, and failure signature justify it: a specific tool-output shape in its owning plugin or generic `packages/core/src/tool-output.ts`; a verifier configuration improvement in `effort/evidence.ts`; or a compaction/cache adjustment in its existing owner. Use the action ranking to choose the target, but require a controlled before/after test before claiming savings. Do not open a generic routing project. Write a short hypothesis ledger entry before the change.
4. **Expected locations:** Determined by the winning measured hotspot from the existing owners above; matching focused tests (`packages/core/test/tool-output.test.ts`, `packages/core/test/effort/`, `packages/core/test/session-compaction*.test.ts`, or `packages/ai/test/`).
5. **Dependencies:** Milestones 2-3; a reproduced hotspot; an action-exposure ranking or trace showing its contribution; one candidate per experiment. A generic re-read cache or dynamic phase router is not preauthorized.
6. **Configuration / compatibility:** Prefer existing controls and defaults. Any new config requires separate justification and backward-compatible decoding; public Protocol/Server changes require generation.
7. **Regressions / failure modes:** Lost debugging evidence, stale file content, broken provider prefix reuse, compaction information loss, escalation on infrastructure failure, or weaker verification.
8. **Tests:** Failing focused regression test first; existing owning-package suite; provider cassette tests when wire behavior changes; identical Milestone 3 matched benchmark, including cold/warm cache and failure cases.
9. **Acceptance:** The candidate satisfies the applicable policy objective in section 5.6 and improves the measured target beyond noise without shifting equivalent cost into retries, compactions, or later steps. Neutral or negative results are reverted and recorded.
10. **Rollback:** Revert the isolated candidate and restore its prior config/default. Do not bundle multiple candidates, so rollback remains unambiguous.

### Milestone 6 — Evaluate finer adaptive routing only behind a measured gate

1. **Objective / justification:** Determine whether phase/task adaptation recovers value left by stable/current-adaptive profiles.
2. **Current behavior / references:** Step-boundary transitions and native effort-update transport already exist (`packages/core/src/session/runner/llm.ts:294-346`; `packages/ai/src/effort-updates.ts:11-25`); there is no phase classifier or cache-cost predictor.
3. **Proposed behavior:** First compare existing session/delegation boundaries in fresh sessions. Only if that leaves a measured residual should an experiment annotate explicit phase boundaries at the existing transition point. No new model router and no per-tool changes. Compare against stable effort at identical cache state. Entry is justified by baseline evidence of a reproducible reasoning-allocation problem, not by completion of a prior tool/context optimization.
4. **Expected locations:** Initially benchmark manifests/scripts only. If justified, `packages/core/src/effort/transition.ts` and its focused tests; the vendored `packages/core/src/effort/policy/` remains unchanged unless a separately approved protocol-versioned spec says otherwise.
5. **Dependencies:** Baseline evidence from Milestones 2-3 that misallocated effort, not input volume or task failure, is a reproducible residual bottleneck. A completed Milestone 5 optimization is not required. Re-baseline if Milestone 5 materially changes the cost or quality landscape.
6. **Configuration / compatibility:** Experimental and opt-in; existing config and exact overrides remain canonical. No default rollout as part of this milestone.
7. **Regressions / failure modes:** Incorrect phase classification, cache invalidation, oscillation, incompatible provider settings, durable-event noise, and hidden quality loss.
8. **Tests:** Pure decision tests if logic changes; session-runner integration for transition frequency/override preservation; provider cache tests; matched live comparison with switching frequency and cache-write cost included.
9. **Acceptance:** Fine routing beats the best stable/current-adaptive control on the applicable policy objective beyond uncertainty, with complete cost accounting, no correctness/safety regression, and no pathological transition count. Otherwise reject it and retain the current design.
10. **Rollback:** Disable the experiment and remove its opt-in path; existing base/verifier behavior remains the recovery default.

## 7. Testing and Benchmark Plan

### 7.1 Baseline strata

Use comparable tasks with known expected results. Screening uses one or two representative tasks per class; confirmatory claims require more distinct tasks and enough repetitions to estimate within-task variance.

- mechanical, tightly specified transformation;
- ordinary localized implementation with regression tests;
- repository discovery with bounded output;
- difficult debugging with a reproducible failure;
- multi-subsystem architecture/migration planning or review;
- security/data-integrity-sensitive change with explicit safe fixtures.

Evaluate classes separately. Do not pool easy and difficult tasks into one headline average. Choose at least one provider/model with cache-preserving effort updates and one without; include hosted DeepSeek only with its actual distinct effective tiers, and test local serving separately.

Every task class needs a rubric before it can enter screening: executable checks for implementation, security, and discovery, and the planning/review rubric in section 5.6. A class without a rubric is instrumentation-only.

### 7.2 Controls and effective-effort separation

For each matched block, hold constant: repository snapshot, prompt, agent, model/endpoint, provider options other than effort, tool definitions, permissions, instructions, verification, output cap, and auxiliary-spend scope. Use fresh sessions and isolated copies. Control randomness where exposed. Randomize run order or use matched blocks. Run cold- and warm-cache conditions separately.

| Experiment | Required condition | Must verify | Analysis |
|---|---|---|---|
| Static E/B/Q | Main agent only; no plan agent, no subagents, no exact `#variant`, no configured verifier commands | Fresh session base row; provider-visible effort per request; no hidden override | Intent-to-treat by policy; dose-response by effective tier; do not drop assigned runs for observed convergence |
| Adaptive verifier | Balanced/standard plus exact configured verifier commands; delegation only when child sessions are recorded and analyzed separately | Transition sequence, tier before and after, revision match | Separate from static; no pooling |
| Plan pin / delegated review | Plan agent or review delegation, expected to resolve `deep` | Expected convergence; no policy difference claimed | Precedence and convergence control only |
| Exact override | Explicit CLI, agent, or session `#variant` | Variant survives every request | Override control only |

Before live runs, build a per-model wire matrix: for each base level, record the provider-visible effort parameter and compare it with the requested variant. Two advertised labels that produce the same wire setting are aliases. A model may expose three, two, or fewer distinct static conditions. If two of the three levels are distinct, run the valid two-arm comparison and report the third as converged or unavailable; if fewer than two are distinct, the static comparison is not run. Record unknown aliases as unknown, not as distinct.

For every run, reconstruct the effective effort of each model request from durable model/transition history and, where available, the transport request. Live capture means durable variant reconstruction plus the preflight wire mapping; a transport-observed request is preferred when the harness can record it. If neither establishes the provider-visible setting, classify the request as `unknown` and exclude it from tier-specific claims while retaining the run in the intended-policy analysis. Classify the run as `distinct`, `partial`, `converged`, or `unknown`. Assignment happens after preflight, when the tested configurations are already known to be distinguishable; do not remove an assigned and started run from the intended-policy comparison because its observed behavior converged. Report convergence descriptively and use effective-tier dose-response as a separate analysis. Stop the design if the chosen model cannot distinguish at least two of the three levels.

Plan mode pins to `deep`, and plan/review delegation starts at `deep`, so those paths cannot support an E/B/Q comparison. They remain useful precedence and convergence tests.

Verify the wire request for every matched block: requested variant, effective effort, generation options, and provider options. Agent `request.settings/body/headers` are stored but have no Core consumer in the primary request path (`packages/schema/src/agent.ts:27`; `packages/core/src/config/plugin/agent.ts:112-115`), so they are not a control surface. Enforce an outer wall-clock/turn budget because generic tool timeout enforcement is not wired (`packages/core/src/tool/timeout.ts:3-5`) and no default agent step ceiling exists.

### 7.3 Staged execution, budget, and stopping rules

Do not start with the full cross-product. The full matrix (6 classes × 5 tasks × 3 repetitions × 3 policies × 2 cache conditions = 540 runs) is an upper bound if every cell were run, not the initial plan.

| Stage | Initial size | Purpose | Evidence allowed | Gate to next stage |
|---|---|---|---|---|
| 0 Instrumentation smoke | 3-9 runs: one representative implementation task, all three policies, cold cache; plus one planning or review artifact to validate the rubric itself, with no static policy comparison | Validate harness, manifest, export, effective-effort capture, cost ledger, rubric mechanics, privacy | None; instrumentation only | Every required field populated; the static implementation task has at least two distinct profiles for the chosen model (plan/review convergence is expected; a third arm may be unavailable); no unresolved cost for a cost claim; no secret or transcript leak |
| 1 Screening pilot | One or two tasks per class, three policies, cold cache; warm only where cache interaction is a declared hypothesis | Detect gross effects, failures, and variance; test rubrics | Ranking and variance estimate only; never promotion | Effect exceeds the predeclared minimum practical effect in the expected direction, or a deterministic correctness failure is reproduced; variance supports a funded confirmatory design |
| 2 Confirmatory | Power-derived; only the comparisons that passed screening, usually E vs B and B vs Q, not all pairs | Policy-specific promotion | Promotion or rejection within the declared decision rule | Complete; no extension without new approval |

**Spend ceilings.** The maintainer must approve a non-zero ceiling for each stage and a per-run ceiling before Stage 0; the harness refuses to start without them. These are enforced admission limits, not hard provider-side caps: the harness can refuse new runs, impose timeouts, and stop before a run whose conservative projected cost would exceed the remaining budget, but a single in-flight provider request can overshoot an estimate before its usage settles. Add headroom for the largest single-request estimate, and configure provider-side spending limits or prepaid quotas where the provider supports them. The Stage 0 ceiling is at least `per-run cap × maximum smoke runs` plus that headroom; later stage ceilings are derived as `planned runs × P90 task cost from the prior stage × 1.5`, with a 20% reserve. Use provider-reported plus estimated cost as the live meter; if either is unresolved, use the conservative upper bound and mark the run incomplete. No stage may borrow from another without written approval.

**Stopping conditions.** Stop the stage and report when any of these occurs:

- required usage, cost, effective-effort, or export fields are missing beyond the predeclared coverage threshold;
- a paid attempt cannot be priced or attributed, so cost comparisons are invalid;
- preflight or whole-stratum convergence leaves fewer than two distinct arms, so no valid intended contrast exists; post-assignment convergence is retained in the ITT analysis and is not a stopping condition by itself;
- a critical correctness, safety, or privacy failure appears;
- screening shows a negative or below-minimum-practical effect, or the variance implies the required sample exceeds the remaining budget;
- provider outage, rate limiting, alias or pricing change, or credential/authorization failure;
- 80% of the stage ceiling is spent without a decision, or 100% is reached.

**Sampling.** Three repetitions are a screening instrument; they cannot establish reliable performance differences. Confirmatory sample size must be derived from screening variance for the policy's primary metric, with the task as the unit and matched pairs or blocks. Increase task diversity before adding repetitions to the same few tasks. Predeclare the primary metric, minimum practical effect, non-inferiority margin, alpha, and decision rule. Use exact or paired methods for verified success and paired ratios or bootstrap intervals for cost; report uncertainty and missingness. No optional stopping except the futility rules above.

### 7.4 Metrics

| Group | Required measurements |
|---|---|
| Input | Fresh input, cache read, cache write, gross input, context estimate, post-compaction next-request input |
| Output | Visible output, reasoning where reported, gross generated, finish/truncation state |
| Cost | Provider-reported, estimated, unpriced count, legacy-unknown, total; completeness and billing verification; total task cost and the policy-specific cost metric |
| Latency | Queue-to-complete externally; provider stream time from existing timestamps where valid; P50/P90 time to verified success |
| Work | Model steps, provider retries, attempts without settlement, tool calls, compaction count, subagent count, transitions |
| Cache | Cache-read share, write cost where priced, transition count, cold/warm condition |
| Effort | Requested policy and variant; wire-level effective effort per request; separation class; transition count and rules; alias/unknown count |
| Quality | Task verification, hidden/regression checks, scope adherence, rubric score and rater agreement, serious defects |
| Actions | Per action: full and visible result bytes, token estimate, later-request count, context exposure, repeat count, request-level and associated reasoning; observed/inferred label |
| Coverage | Missing usage/cost/effort fields, unsupported provider categories, provider normalization differences (final-context versus billed input), unsettled attempts, unpriced records, post-revert/non-exported spend, and title/warming exclusion as explicit counts |

### 7.5 Test layers

- **Unit:** usage equations and provenance amounts, unpriced handling, report graph uniqueness, retry/attempt accounting, action-exposure math, manifest validation, effective-effort classification, budget guard, policy decisions, any candidate-specific regression.
- **Integration:** real SQLite/session projection and export; simulated-provider runner lifecycle; provider cassette request/usage/cache/effective-effort semantics; existing permission and compaction suites.
- **End-to-end:** actual CLI fresh-session runs with external verification and export. Live provider runs measure economics; simulation validates harness behavior only.
- **Rubric adjudication:** two blind raters for planning and review artifacts, predeclared scoring, reported agreement, and source-reference validation.
- **Regression:** focused package tests followed by `bun run check` from root for any implementation milestone. Run tests only from package directories. Read the matching testing skill before writing tests.

### 7.6 Analysis and decision

Report n, median, spread, P90 when sample size supports it, failure rate, missingness, uncertainty, effective-effort separation, and cost completeness. For Efficiency, cost per verified success includes all failed attempts and all descendants/compactions; report the same all-in cost for Balanced and Quality even though it is not their primary objective. Do not discard timeouts or infrastructure failures; annotate and analyze them separately.

Analyze by the policy's objective, not one universal rank:

- **Efficiency:** cost per verified success with correctness non-inferiority.
- **Balanced:** joint cost, quality, and latency with guardrails.
- **Quality:** verified success and serious-defect rate within cost and latency ceilings.

For static E/B/Q, report ITT by intended policy over all valid assigned runs and dose-response by effective tier as a separate analysis; do not drop assigned runs for observed convergence and do not attribute a converged contrast to the policy label. For adaptive conditions, report the observed transition sequence. Action-level results are separate from policy promotion and must carry observed, associated, or inferred labels.

Retain/revise/reject strictly by section 5.6. Log all attempts, including neutral and reverted ones, in `perf/token-reasoning/README.md`. Re-baseline after model upgrades, provider pricing changes, material prompt/tool changes, effective-effort mapping changes, or routing changes.

## 8. Acceptance Criteria

The program is complete only when all applicable conditions hold:

- [ ] Existing `low` / `standard` / `deep` profiles are documented as Efficiency/Balanced/Quality, including fresh-session, plan-pin, delegation, and exact-override semantics.
- [ ] Each policy has a declared objective and promotion rule; Quality may be promoted for higher verified success despite a higher cost per success when its ceilings are met.
- [ ] Manual model and variant choices remain unchanged for explicit CLI, agent, and session selections; the known top-level configured-default variant loss is documented or fixed separately.
- [ ] No policy changes permissions, required verification, or provider model identity.
- [ ] Static benchmark conditions contain only arms distinct at preflight, run as a valid two- or three-arm comparison; all valid assigned runs remain in the intended-policy analysis, while convergence is reported separately for effective-tier analysis.
- [ ] Plan-pin, delegated review, exact-variant, and verifier-adaptive conditions are classified separately and never pooled into static E/B/Q.
- [ ] Every populated usage report satisfies the disjoint token equations; no inclusive raw total is double counted.
- [ ] Provider-reported, catalog-estimated, unpriced, legacy-unknown, and derived mixed cost categories are distinguishable; zero-cost provider responses remain authoritative.
- [ ] Unsettled retry attempts, missing usage, reverted activity, and reused precomputed compaction are counted explicitly; runs that cannot be fully reconciled are marked incomplete for cost comparisons.
- [ ] Provider-reported cost is never described as invoice-verified billed spend; `billing_verified` is set only by external reconciliation.
- [ ] Root-task reports include eligible child sessions and compaction/retry spend exactly once, with explicit coverage/missingness.
- [ ] Action-level rankings report measured tool-result exposure, request-level reasoning, associated downstream reasoning, and inferred attribution under separate labels.
- [ ] Planning and review tasks use predeclared rubrics, source-reference checks, and blind adjudication; unseeded or single-rater review results are not promoted.
- [ ] Benchmark corpus, snapshots, verification, cache state, model/endpoint, policy, effective effort, repetition, and spend ceilings are reproducible from manifests without using a dirty worktree; ceilings are documented as admission limits with possible in-flight overshoot and provider-side limits where available.
- [ ] The staged design defines smoke, screening, and confirmatory gates with spend ceilings and stopping conditions; three repetitions are never presented as confirmatory evidence.
- [ ] Every promoted optimization meets the applicable policy objective, has matched before/after evidence beyond noise, fixed correctness gates, complete cost accounting, and no critical regression.
- [ ] Neutral or negative optimizations are reverted and logged; no dynamic router ships merely because it was planned as an experiment.
- [ ] Unsupported automatic effort stays untouched, and no report claims a requested provider label was an effective distinct tier without wire evidence.
- [ ] Focused tests and `bun run check` pass for each runtime change; generated artifacts are regenerated through the supported workflow when applicable.
- [ ] Reports contain no secrets, source content, prompts, raw request bodies, or unredacted personal/customer data.

## 9. Risks and Tradeoffs

| Risk | Consequence | Mitigation / tradeoff |
|---|---|---|
| Existing `deep` prefers `max` | Quality and escalation may be more expensive than intended | Make this explicit; benchmark against standard/high exact controls; do not silently alter vendored policy |
| Config base does not update an existing durable row | User thinks a profile switch applied when it did not | Require fresh sessions in docs and harness; surface actual session variant in reports |
| Top-level configured default drops `#variant` | A documented exact model choice silently resolves to the base model | Use explicit CLI/agent/session variants; document the limitation or fix in a separately approved change |
| Plan pin, delegation, exact variants, or verifier escalation collapse E/B/Q | The benchmark measures the same effective tier three times | Classify these as convergence/override controls; static preflight excludes them; keep assigned ITT runs and reconstruct effective effort per request |
| Provider aliases map labels to one wire setting | A claimed distinct condition is not distinct | Build a per-model wire matrix; run a valid two-arm comparison when two levels remain; report the third as converged/unavailable; never infer tiers from labels |
| Unsettled provider retry or missing usage | Cost per task is understated | Count attempts without settlement, retain unpriced records, mark cost incomplete; reconcile against provider billing only when available |
| Provider-reported cost treated as billed spend | Dollar claims overstate certainty | Keep `billing_verified` separate; no invoice claim without external reconciliation |
| Cost aggregation mixes estimates and actual charges | Dollar-efficiency claims become misleading | Milestone 1 provenance amounts; legacy unknown; no single mixed label |
| Post-revert exports omit deleted messages | Task spend or attribution is understated while session cost retains it | Export before revert or use durable step/usage events; mark incomplete captures |
| Producer `metadata.truncated` and unbounded search limits bypass generic bounds | Large grep/glob or Code Mode results can enter context despite generic caps | Measure and cap in the owning tool as a Milestone 5 candidate; do not assume the generic bound covers search |
| Exact override disables escalation | User override and automatic recovery cannot both win | Preserve user choice as required; document and test rather than adding precedence magic |
| Cache invalidation on unsupported updates | Reasoning savings can be offset by fresh input/cache writes | Stable control, cold/warm strata, no per-tool switching |
| Zero-filled session fields | Unsupported values look like real zero | Coverage flags/null in benchmark report; no unsupported cache/reasoning comparisons |
| Parent/child or retry double counting | Cost per task is wrong | Unique message/session ledger, attempt counts, and synthetic graph tests |
| Tighter output/compaction limits | Lost evidence, more retries, lower correctness | Existing bounds remain until a measured hotspot justifies one focused change |
| Failure-driven escalation reinforces loops | More expensive repeated patches without new evidence | One-level cap, exact verifiers, pass/revision clearing; measure repeated signatures before more logic |
| Three-repetition pilot overinterpreted | False promotion from noisy data | Screening only; power-derived confirmatory sample with predeclared decision rule |
| Planning/review rubric subjectivity | Quality policy promoted on opinion | Predeclared criteria, two blind raters, source-reference checks, reported agreement |
| Quality cost or latency blowout | Higher success at unbounded spend | Quality guardrail ceilings; stop conditions; Balanced remains default |
| Live benchmark noise and cost | False conclusions or unapproved spend | Stage ceilings, per-run cap, provider-side limits, headroom for in-flight overshoot, matched/randomized blocks, stopping rules, full attempt ledger |
| Telemetry privacy | Source, secrets, or customer data leak | Numeric allowlists, local raw exports, sanitized sharing fixtures, no raw request-body logs |
| Added configuration/routing complexity | Maintenance burden without measured value | Reuse `base_level` and current policy; neutral experiments revert |

## 10. Rejected or Deferred Recommendations

- **Reject per-tool-call reasoning changes.** Tools do not own provider reasoning contexts; the existing step boundary is correct.
- **Reject a second effort-write/router path.** It would bypass durable model history, cache markers, exact-override handling, and client reconciliation.
- **Reject new reviewer/architect/mechanical agents solely for effort.** Existing child sessions and operation seeds are sufficient; inherited/explicit choices must remain authoritative.
- **Reject a new `Efficiency|Balanced|Quality` config enum or CLI flag.** It duplicates `base_level` and creates avoidable precedence/migration behavior.
- **Reject universal provider effort semantics.** Keep conceptual levels in Core and real variant settings in model/provider resolution.
- **Reject a requested variant label as proof of a distinct endpoint tier.** Require a provider-visible wire check; unresolved aliases are not separate conditions.
- **Reject a single `mixed` cost label as sufficient provenance.** Preserve provider, estimated, and legacy amounts plus the unpriced count separately; provider-reported cost is not invoice-verified spend.
- **Reject inferred per-action reasoning as measured fact.** A tool call has no independent reasoning budget; use request-level evidence and labeled association or ablation.
- **Reject promotion from a three-repetition screening pilot.** Screening selects comparisons; confirmatory sampling and a predeclared decision rule decide promotion.
- **Reject blocking offline ledger work on production schema changes.** The report can classify legacy cost as unknown while Milestone 1 proceeds independently.
- **Reject automatic escalation to maximum from retry count.** Current configured-verifier, one-level policy is safer; transport retries are not diagnostic evidence.
- **Defer automatic task/phase/risk classification.** No local evidence shows that its benefit exceeds misclassification and cache costs.
- **Defer automatic model routing.** It adds the largest compatibility and correctness surface and is unnecessary for the initial objective.
- **Defer a hot-path cache-value estimator.** Obtain cold/warm measurements first; current transport already handles supported updates.
- **Defer blanket file-read deduplication.** Staleness, mutation revisions, and cache-prefix effects require concrete traces and a separate design.
- **Defer lower tool-output limits or compaction thresholds.** Existing bounds are substantial and tested; arbitrary tightening can move cost into retries and quality loss.
- **Defer nullable/rewritten public token schemas.** Preserve compatibility; handle unknown coverage in the benchmark report rather than breaking stored contracts.
- **Defer per-request durable effort events.** Existing model refs and edge-triggered transitions are enough for step reconstruction; avoid duplicating derivable durable history.
- **Reject raw prompt/request telemetry as a default.** It creates unnecessary privacy and secret-handling risk; provider cassettes remain focused, redacted test artifacts.

## 11. Open Questions and Decisions

Only these require further evidence or authorization; they do not block the architecture decision to reuse the current policy:

1. **Live benchmark authorization:** Which provider/model/endpoints, stage ceilings, per-run cap, and provider-side spending limits are approved? Owner: maintainer. Needed before Stage 0, not before Milestones 1-2.
2. **Effective-effort mapping:** For each benchmarked route, which provider-visible parameter represents `low`, `standard`, and `deep`, and which advertised labels are aliases? Owner: maintainer plus benchmark implementer; establish in the preflight wire matrix before Stage 0, since the Stage 0 gate depends on it.
3. **Correctness corpus and policy thresholds:** Which task snapshots and hidden checks define verified success for implementation and discovery; which rubric and independent raters cover planning and review; what minimum practical effect, non-inferiority margin, and cost/latency ceilings apply to each policy? Owner: maintainer plus benchmark implementer; rubrics before any scored run, promotion thresholds before confirmatory runs.
4. **Billing reconciliation:** Which provider usage export or invoice is authoritative, and how often is it reconciled? Owner: maintainer; required before any claim about billed spend.
5. **Quality economics:** Does `deep -> max/highest` improve verified success or serious-defect rate enough to justify Quality under its own objective and ceilings? Owner: benchmark evidence. Until answered, Balanced remains default.
6. **Residual hotspot:** Which actions, tools, retries, compactions, or subagents dominate measured exposure and cost for each targeted model/task class? Owner: Milestones 2-3. This selects whether Milestone 5 exists and what its single candidate is.
7. **Fine-routing gate:** After stable/current-adaptive controls, is there still a reproducible residual benefit from phase changes that exceeds cache and quality costs? Owner: benchmark evidence. Entry does not require a completed Milestone 5; default decision if unresolved is no finer routing.
8. **Top-level default variant:** Is dropping `#variant` from the configured default intentional compatibility, or a defect to fix? Owner: maintainer. Until resolved, benchmarks use explicit CLI/agent/session variants and documentation records the limitation.
9. **Auxiliary spend scope:** Should title, warming, and other non-mutating `Session.generate` calls count toward task cost, or be analyzed separately? Owner: maintainer plus benchmark implementer; decide before Stage 0. Session totals exclude warming, so inclusion requires another source.
10. **Confirmatory analysis plan:** Who approves the power calculation, primary metric, alpha, and stopping rule before Stage 2? Owner: maintainer plus benchmark implementer. No confirmatory run starts without them.

## 12. Final Implementation Checklist

### Foundation

- [ ] Review this plan and the existing `effort_policy` implementation; do not create a worktree, commit, push, or PR without separate approval.
- [ ] Milestone 2 may begin before or in parallel with Milestone 1; classify stored cost as legacy unknown and do not block ledger validation on schema changes.
- [ ] Milestone 1: add failing cost-provenance unit/schema/integration tests, then the minimal additive implementation; run focused package tests.
- [ ] Milestone 1: verify old messages, provider zero, estimated fallback, unpriced routes, mixed retry/compaction amounts, and unchanged cost totals; regenerate public artifacts if applicable.
- [ ] Milestone 2: implement manifest validation and numeric-only root/descendant aggregation with synthetic graph/privacy fixtures.
- [ ] Milestone 2: reconcile one real temporary CLI export against stored assistant/compaction records and inspect the generated report for forbidden fields.
- [ ] Milestone 2: verify unsettled retry attempts, pre-revert capture, reused precomputed compaction, and title/warming scope handling.
- [ ] Milestone 2: produce the action-exposure ledger and verify observed, associated, and inferred labels; do not merge them into one score.

### Baseline

- [ ] Milestone 3: define task snapshots, task-class rubrics, coverage fields, randomization, spend ceilings, and failure handling in `perf/token-reasoning`.
- [ ] Build the per-model effective-effort wire matrix; record aliases, choose only distinct levels, and plan the largest valid two- or three-arm comparison.
- [ ] Milestone 3: test the runner with a simulated provider; verify fresh-session base selection, no plan/delegation/exact/verifier overrides in static conditions, effective-effort capture, wire generation options, and no dirty-tree use.
- [ ] Obtain live provider/model/stage-ceiling authorization, confirm provider-side spending limits where available, and predeclare each policy's objective, minimum practical effect, and guardrails.
- [ ] Run Stage 0 instrumentation smoke; inspect actual usage, cost components, effective effort, and cache coverage; stop if attribution cannot be reconciled.
- [ ] Run Stage 1 screening by task/model/cache stratum; retain failed and blocked runs and all retry/child/compaction spend; do not promote from screening.
- [ ] Run Stage 2 confirmatory only for comparisons that pass the screening gate, with a power-derived sample and a predeclared decision rule.
- [ ] Run the verifier-adaptive comparison separately; do not mix it into static-policy labels.
- [ ] Run plan-pin, delegated review, and exact-variant conditions as convergence/override controls, not as E/B/Q evidence.
- [ ] Record auxiliary-call scope (title/warming/generate) and the export-before-revert rule in the benchmark README and every manifest.

### Decisions and optimization

- [ ] Publish n, medians, spread/P90 where meaningful, uncertainty, missingness, verified-success rate, serious-defect rate, retries, cache categories, cost components, cost completeness, and effective-effort separation.
- [ ] Evaluate each policy against its own objective; do not rank Quality by cost per success alone.
- [ ] Publish action-level exposure with measured, associated, and inferred labels clearly separated.
- [ ] Milestone 4: document existing profile semantics and actual findings; keep Balanced unless evidence supports a different default.
- [ ] Milestone 4: document that the top-level configured default drops `#variant`; decide separately whether to fix it.
- [ ] Choose at most one Milestone 5 hotspot with a reproduced signature and action-exposure evidence; record hypothesis, baseline, candidate, and rollback before editing.
- [ ] Implement that candidate with focused failing tests, owning-package regression tests, and the same matched benchmark.
- [ ] Retain only a beyond-noise quality-safe improvement that meets the applicable policy objective; revert and log neutral, worse, or unattributable results.
- [ ] Permit Milestone 6 only if baseline evidence shows a reproducible effort-routing residual; a completed Milestone 5 is not required. Otherwise mark fine routing rejected by evidence.
- [ ] Re-run `bun run check` after each runtime milestone, inspect the final diff, update affected docs, and stop without commits/PRs unless separately authorized.
