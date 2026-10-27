# Agentic Coding CLI: Token Consumption and Reasoning-Effort Audit

**Final research-and-methodology edition — 26 October 2026**  
**Scope:** CLI-based coding agents, with OpenCode and a custom `opencode_fife` fork as primary examples; provider-neutral policy plus verified OpenAI, Anthropic, Google, and DeepSeek distinctions.  
**Evidence standard:** Primary vendor/project documentation for product facts; explicitly labeled expert hypotheses for workload ordering and recommended effort. No local repository telemetry was supplied or inspected.

## Executive assessment

**Recommendation:** Start with a **balanced, task-aware reasoning policy**, not a static high-effort setting for an entire Build or Plan agent. Keep routine retrieval, command execution, and tightly specified transformations at minimal/low effort; use medium for typical implementation; reserve high for nontrivial diagnosis, architecture, security-sensitive decisions, and complex review. Elevate to maximum only when justified by evidence and supported by the selected model. **Before implementing automatic switching, benchmark whether the benefit outweighs provider-specific cache disruption, latency, and retry costs.**

Four findings change the original assessment:

1. **No universal empirical ranking exists in the sources reviewed.** Both ordered rankings below are conditional engineering hypotheses, not measured rankings of the user's fork. Task size, model, prompt shape, output handling, repetitions, and cache state can reverse adjacent positions.
2. **High input-token consumption does not imply high reasoning demand.** A file read or shell command has no inherent model-reasoning requirement; model tokens are incurred when requests containing instructions, tool calls, and tool results are processed. A concise diagnostic problem can demand far more reasoning than a large mechanical data retrieval.
3. **Token accounting must be provider-normalized.** For OpenAI, reasoning tokens are a subset of output tokens; cached input tokens are a subset of input tokens, not additional input. Other providers expose differently named categories. A provider's billable cost, not raw token sum, determines dollar efficiency. [1][2][3][4][5]
4. **“None / Minimal / Low / Medium / High / Maximum” is a conceptual decision scale, not a universal API enum.** Actual supported values and mappings vary. Especially relevant: the DeepSeek API maps `medium` and `xhigh` to `high`, while local vLLM inference for DeepSeek can employ a numeric scale with different level mappings. [6][7][8]

**Confidence:** High for the documented provider and OpenCode behaviors below; medium for the recommended routing logic; **low for exact relative rankings and cost savings until task-level experiments are run**.

---

## 1. Audit scope, method, and limitations

### Audited claims

- What consumes total tokens in a multi-turn agentic CLI: repeated request context, tool-result payloads, code generation, retries, compaction, and subagents.
- What consumes *reasoning* tokens and when additional reasoning improves correctness.
- Relative token intensity of **individual CLI actions** versus **complete software engineering tasks**.
- Effort suggestions under three objectives: **Efficiency (E)**, **Balanced (B)**, and **Quality (Q)**.
- Feasibility and risks of dynamic reasoning, model switching, compaction, and prompt caching.
- The degree to which OpenCode's CLI and session instrumentation can support verification.

### Evidence and method

Product-specific factual assertions were checked against official OpenCode, OpenAI, Anthropic, Google, and DeepSeek documentation (references at end). Rankings are structured estimates based on plausible amounts of source ingested, output generated, request count, and problem complexity. **They are not validated measurements**, and no artificial token counts or savings percentages are presented as findings. The document keeps these distinct: **verified documentation**, **engineering judgment**, and **unverified measurements needed**.

**Not performed:** local inspection of `opencode_fife` source code, OpenCode session exports, usage logs, routing implementations, project tests, or billing. The fork's exact architecture and V1/V2 lineage are unknown. A true measured audit requires those artifacts; section 9 supplies the validation procedure.

### Key definitions

- **LLM request:** one provider model-generation call. A single agentic task may invoke many calls and tools.
- **Tool execution:** a local or remote operation (`bash`, read, grep, edit, etc.). Its execution is not itself a token-charging LLM call, but the model's decision to call it and the returned content can contribute to token use.
- **Prompt/input tokens:** content the provider processes in a request, including conversation history and, where applicable, tool schemas/results.
- **Cached input:** prompt tokens that the provider reports as cache reads; they may still count toward input/token limits while receiving preferential pricing/latency. Cache-write accounting varies by provider and model. [2][3]
- **Generated/output tokens:** model-produced tokens. For OpenAI, reported reasoning tokens are included in output tokens; **do not sum output plus reasoning**. [1]
- **Reasoning/thinking tokens:** provider-reported internal generation tokens where exposed. They are not interchangeable with visible answer text or a subjective difficulty score. [1][4][5]
- **Gross tokens:** total provider-reported request input plus generated output, each category counted once after normalizing its semantics.
- **Dollar cost:** actual request billing where available; otherwise a labeled estimate derived from exact model, rates, and cache categories.
- **Effort:** a requested control or mode. It is a *soft resource/behavior setting*, not a guarantee of a specific token count or result quality. [1][4]

**Attribution caution:** A 20,000-token file returned by a tool is not necessarily a new 20,000-token charge if it is truncated, filtered, represented indirectly, cached, or never sent to a model. Conversely, the same material can be billed repeatedly in subsequent model calls. Use real provider usage, not file length, for spend calculations.

---

## 2. The mechanics that actually dominate consumption

A practical model of task usage is:

```text
Task gross tokens = SUM over all model requests in the task of
                    (normalized input tokens + normalized generated tokens)

Task billed cost  = SUM over all requests of provider-reported charge,
                    or normalized token categories × actual per-category rates

Task reasoning    = SUM over requests of provider-reported reasoning tokens
                    (only where reported and semantically comparable)
```

For multi-step tasks, the largest **drivers** are commonly:

1. **Number of model requests and repeated context.** Long-lived conversations may transmit substantial history, instructions, and tool schemas again; cached prefixes can reduce *cost* without eliminating gross tokens. [2]
2. **Tool-result size and relevance.** Broad file reads, repository searches, unbounded logs, and external documents can expand following prompts. [9]
3. **Model-generated code and prose.** Large patches, planning text, reviews, and excessive summaries increase output use; reasoning models add hidden output when thinking. [1]
4. **Retry, exploration, and failure loops.** Failed repair cycles repeatedly incur context and generation, whether or not the eventual result improves.
5. **Subagents.** Child sessions may add prompts and tool loops; aggregate child spending **once**, and avoid double counting when displaying parent and child totals. OpenCode documents primary and subagents. [10]
6. **Compaction and context management.** Compaction spends tokens to make a smaller working history; it can reduce future input but may weaken precision and alter cache reuse. OpenCode V1 and V2 have distinct implementations and configuration shapes. [2][11][12]
7. **Provider-specific reasoning behavior.** Different reasoning configurations can change hidden generation, tool calls, latency, and cache-hit behavior. [1][4][5][6]

**Crucial correction to the earlier answer:** There is no independent “reasoning level” applied by the provider to a shell operation after the model has already emitted a tool call. Set effort for the **model request/decision phase**; treat tool invocation, output sizing, and post-tool analysis as separable concerns.

---

## 3. Individual CLI actions — indicative ranking by total token exposure

**Reading this table:** Rank 1 is generally the largest *potential* gross-token contribution **under the specified scenario**; entries are illustrative, not universal. “E / B / Q” are recommended *model effort for the decision or analysis associated with the action*, not for the mechanical tool execution. `—` means no LLM is necessary when the operation is deterministic. `Max` is reserved for exception handling, not a routine default.

| Rank | Action / bounded scenario | Gross-token potential | E | B | Q | Main driver / key caveat |
|---:|---|---|---|---|---|---|
| 1 | Many-turn continuation with large unpruned history | Very high | Min | Low | Low | Reprocessed prefix on each model request; cache may sharply reduce cost |
| 2 | Broad subagent research with repeated tools and reports | Very high | Low | Med | High | Multiple model loops, duplicated background, extensive results |
| 3 | Full repository audit yielding large findings and diff | Very high | Med | High | High | Many files plus analysis; task scope dominates |
| 4 | Ingesting full build/test logs across repeated calls | Very high | Min | Low | Low | Verbose results in later context; diagnosis is a separate action |
| 5 | Reading numerous entire large files | High–very high | Min | Low | Med | Large raw context; reading itself needs little thought |
| 6 | Generating extensive source code or multi-file patches | High | Low | Med | High | Output token volume and implementation uncertainty |
| 7 | Large multi-file diff review | High | Med | High | High | Large context **and** judgment-sensitive analysis |
| 8 | Broad grep/glob/search with many matched lines | High | Min | Low | Low | Output fanout; a narrow query may be very cheap |
| 9 | Fetching full external API docs/specifications | High | Min | Low | Med | Reference volume; cache/relevance strongly matter |
| 10 | Multi-file coordinated edit with intermediate checks | High | Med | Med | High | Several generation and validation calls |
| 11 | Deep diagnosis of a difficult localized failure | Med–high | Med | High | Max* | Hidden reasoning and exploratory calls can dominate |
| 12 | Detailed design decision over a bounded code excerpt | Med–high | Med | High | Max* | High reasoning per unit of context |
| 13 | Complex code review over one function/module | Medium | Med | High | High | Inference/edge cases rather than raw retrieval |
| 14 | Reading an ordinary single file or selected ranges | Medium | Min | Low | Low | Returned lines drive future input costs |
| 15 | Producing a focused patch or targeted unit test | Low–medium | Low | Med | High | Modest output; complexity varies |
| 16 | Executing one focused test and reading concise failures | Low | — | Min | Low | Running a test is mechanical; interpreting failures is not |
| 17 | Looking up a symbol, pathname, or short documentation passage | Low | — | Min | Low | Narrow tool output |
| 18 | Checking branch, status, or concise diff summary | Very low | — | — | Min | Mostly deterministic metadata |
| 19 | Listing directories or checking existence | Very low | — | — | — | Usually no substantive model reasoning |
| 20 | Executing a previously authorized exact Git/shell command | Very low | — | — | — | Tool itself incurs no LLM tokens; prior decision may |

`Max*` means *consider* maximum only if supported and if the case remains difficult after high-effort work. The table does **not** imply a provider should spend hidden reasoning on `git status` merely because a Quality policy is selected.

**Ranking validity:** Low-to-medium. Ranks 1–10 are strongly affected by prompt and result length; ranks 11–20 may rise dramatically when the model loops. A “single file” could be huge, a subagent could be tightly constrained, and a focused failure could become a multi-day debugging investigation. Report the actual observed medians and upper tails rather than claiming this table is an empirical order.

### Separate ordering: reasoning demand for individual decisions

Approximate highest-to-lowest *benefit from reasoning* (not raw token volume):

1. Root-cause diagnosis with conflicting evidence.
2. Concurrency, asynchronous invariants, race conditions, and deadlocks.
3. Security boundary/privilege analysis and data-integrity failure handling.
4. Architectural tradeoffs or migration safety.
5. Correctness review of complex interconnected changes.
6. Algorithms, performance diagnosis, and hard edge cases.
7. New feature decomposition and test strategy.
8. Medium feature logic and ordinary refactoring.
9. Targeted patches, tests following established patterns.
10. Straightforward code formatting, documentation, summaries.
11. File retrieval, listing, command execution, and status checks.

The *expected benefit* of extra reasoning is an evaluation hypothesis; it must be checked using the quality metrics in section 9.

---

## 4. Complete engineering tasks — indicative total-token ranking

Assumption: each row represents a **reasonably substantial, end-to-end task** of its named kind, including exploration, implementation, verification, and any expected repair. This does not rank arbitrary tiny migrations above arbitrary enormous bug fixes. E/B/Q are starting efforts for the *substantive decision steps* of that workflow; routine mechanics remain low.

| Rank | End-to-end task | Token potential | E | B | Q | Reasoning significance |
|---:|---|---|---|---|---|---|
| 1 | Architectural/framework migration spanning subsystems | Very high | High | High | Max* | Critical |
| 2 | Large feature crossing APIs, state, data, and tests | Very high | Med | High | High/Max* | Very high |
| 3 | Repository-wide audit **with** extensive remediation | Very high | Med | High | High/Max* | Very high |
| 4 | Multi-cause debugging with repeated failed hypotheses | Very high | Med | High | Max* | Critical |
| 5 | Broad refactor with behavioral-compatibility verification | Very high | Med | High | High | High |
| 6 | Performance investigation, profiling, and optimization | High | Med | High | High/Max* | Very high |
| 7 | Security review/remediation over multiple trust boundaries | High | High | High | Max* | Critical |
| 8 | Complex technical architecture and migration plan | High | Med | High | Max* | Critical |
| 9 | Complex integration with external systems/protocols | High | Med | High | High | Very high |
| 10 | Rich UI feature with significant state/interaction logic | High | Low | Med | High | High |
| 11 | Medium feature implementation with established architecture | Med–high | Low | Med | High | Moderate–high |
| 12 | Difficult but localized bug fix with regression proof | Medium | Med | High | Max* | Critical |
| 13 | Medium pull request review with verification | Medium | Low | Med | High | High |
| 14 | Designing a targeted integration/regression test suite | Medium | Low | Med | High | High |
| 15 | Single-module refactor with stable specification | Medium | Low | Med | Med | Moderate |
| 16 | Routine documentation and worked examples | Low–medium | Min | Low | Med | Low–moderate |
| 17 | Repetitive, tightly specified transformations | Low | Min | Low | Low | Low |
| 18 | Single-line fix, import change, or small config update | Very low | Min | Low | Low | Low **unless high impact** |
| 19 | Routine housekeeping, reporting, and authorized Git steps | Very low | — | — | Min | Negligible once authorized |

**Impact overrides apparent simplicity.** A “one-line change” to authentication, money movement, encryption, deletion, or a schema migration may deserve high-level analysis and explicit approval despite tiny code output. Conversely, a large generated fixture can be low-reasoning if the transformation is deterministic.

### Highest-to-lowest *reasoning importance* for complete tasks

1. Uncertain root-cause analysis and complex concurrency defects.
2. Security, authorization, privacy, and irrecoverable data-integrity decisions.
3. System architecture and migration design under competing constraints.
4. Nontrivial correctness algorithms and cross-system consistency.
5. Performance investigations where profiling evidence must distinguish hypotheses.
6. Regression diagnosis, subtle code review, and high-risk changes.
7. Complex implementation planning and acceptance-test design.
8. Feature implementation with established patterns but multiple dependencies.
9. Isolated module refactors and routine test authoring.
10. Standard UI implementation, documentation, and mechanical refactors.
11. Scripted retrieval, status checks, formatting, and Git mechanics.

**Note:** The reasoning-importance lists are deliberately not identical to the token-intensity lists. If an empirical test finds no quality gain from high effort on a class of tasks, reduce the assigned effort irrespective of its position here.

---

## 5. Three complete allocation policies

| Category | Efficiency-first (E) | Balanced (B) — recommended starting point | Quality-first (Q) |
|---|---|---|---|
| Command planning for known operations | Minimal/Low | Low | Low |
| Search/file location and context gathering | Minimal/Low | Low | Low |
| Routine code generation | Low | Medium | Medium/High |
| New feature planning | Medium | Medium/High | High |
| Complex code modification | Medium | High if dependencies warrant | High |
| Hard debugging/root-cause analysis | Medium → High after evidence | High | High → Max when supported |
| Architecture/security/data-integrity decisions | High | High | High/Max when supported |
| Test execution / compilation | No model reasoning for execution | No model reasoning for execution | No model reasoning for execution |
| Failure triage and regression attribution | Medium | High for ambiguous cases | High/Max for exceptional cases |
| Code review | Low/Medium | Medium/High by change risk | High |
| Routine commit/summary | Minimal | Low | Low |

**Policy interpretation:**

- **Efficiency** minimizes expected *cost per successful verified task*, not merely first-attempt tokens. It does not relax required testing, authorization, or protection against destructive operations.
- **Balanced** aims for a low failure/retry rate and reasonable cost, escalating when the task has multiple dependencies, uncertainty, or risk.
- **Quality** spends more reasoning where it may improve quality; it **does not** maximize thinking on mechanical work. In some cases greater effort yields negligible improvement or produces unnecessary exploration. Measure rather than presume superiority.
- **Maximum** is an escalation target, not the policy-wide default, and may not exist for the active model/provider.

### Recommended phase-aware workflow

| Phase | Initial effort (Balanced) | Output discipline | Escalate when |
|---|---|---|---|
| Scope and locate | Low | Filenames, paths, bounded snippets | Search fails to identify owning components |
| Analyze constraints/invariants | Medium → High | Assumptions, risks, interfaces | Multiple subsystems or unclear semantics |
| Draft plan | Medium/High | Decisions, acceptance checks, rollback | Significant design or migration impact |
| Implement bounded edits | Medium | Small diffs, no duplicated prose | Unanticipated dependencies appear |
| Execute tests/lint/build | None for tool itself | Exit code and concise failure summary | No direct escalation until interpreting results |
| Diagnose failures | High | Competing hypotheses and discriminating test | Repeated failures or evidence contradictions |
| Final risk review | Medium/High | Targeted changed-lines review | Security/data-loss/concurrency concerns |
| Commit and recap | Low | Validated status, concise results | Git conflict or unanticipated repository state |

**Do not switch effort reflexively on every `read`, `grep`, and `bash` event.** Those are tools, not independent provider reasoning contexts. Choose model/effort on meaningful decision boundaries, and include the cost of cache invalidation in the routing decision.

---

## 6. Verified provider-specific reasoning and caching constraints

| Provider / deployment | Verified facts | Practical implication |
|---|---|---|
| **OpenAI API** | Reasoning usage is reported under output-token details and included in output tokens. Output caps cover reasoning and visible generation. Cached input is reported within total input. Newer supported models can change effort via conversation configuration updates to preserve earlier cache prefixes, but top-level effort changes can alter the rendered prompt. [1][2] | Do not double-count reasoning or cached reads. Test whether the *CLI integration* actually supports cache-preserving configuration updates; API support alone does not prove this. |
| **Anthropic Claude API** | Adaptive thinking selects whether/how much to think; effort guides that behavior. Changing top-level thinking configuration or effort invalidates cached prefixes; supported per-message effort changes can preserve them. Legacy manual `budget_tokens` behaves differently and is deprecated/unsupported for newer model families. [4][13] | Prefer stable top-level effort within cached conversations unless the chosen model/integration supports per-message changes. Treat switching cost as first-class. |
| **Google Gemini API** | Thinking controls and usage reporting are model/API-specific. Thinking output can consume part of generation limits; the documentation distinguishes thought from visible output. [5] | Translate the conceptual policy into that model's supported thinking settings, with correct token normalization. |
| **DeepSeek hosted API** | Thinking mode/effort is configurable. The currently documented effort mapping is `minimal → low`, `medium/xhigh → high`, with `low`, `high`, `max` actual tiers; `none` disables thinking on supported API surfaces. Reasoning content handling during tool use has documented requirements. [6][7] | **Do not benchmark “medium” against “high” as if they were distinct tiers on this hosted API.** Preserve the required reasoning content across tool calls. |
| **DeepSeek local vLLM recipe** | The vLLM project's published DeepSeek-V4.1-Flash recipe describes numeric `reasoning_effort` values and a mapping different from the hosted API. [8] | Treat local and hosted routing as distinct configurations; test actual model template and endpoint behavior. |
| **OpenCode CLI** | Model variants and per-agent model settings are documented. Different built-in variants exist by provider; supported variant names depend on model/catalog. V1 and V2 documentation describe different configuration and CLI surfaces. [9][10][11][14][15] | Inspect the fork/version and validate the actual flags, schema, and provider options before adopting example commands or configuration. |

### The caching tradeoff

With a long, reusable prompt prefix, an effort change that breaks caching may increase **billed input cost** enough to offset saved reasoning tokens. OpenAI explicitly documents model-dependent caching and possible cache-preserving configuration updates on supported models. Anthropic documents cache invalidation when top-level effort changes, with a supported per-message exception. [2][4]

A sound routing policy therefore evaluates **net expected task cost**, not simply “lower effort means fewer output tokens.” Compare:

`expected cost = fresh input + cache reads + cache writes + generated output + additional retry/tool-loop cost`, valued at the actual provider rates.

Keep model, rendered system/tool prefix, and cache controls stable when possible. Compaction and dynamic context rewriting can reduce subsequent input yet also invalidate prefixes, so benchmark both cost and quality. [2][11][12]

### Actual effort levels are not portable

Use an internal policy such as `minimal / low / medium / high / exceptional` mapped to *verified* model capabilities. Do **not** assume all providers accept the same labels, nor that the same word corresponds to the same thinking budget or accuracy curve. Unknown or unsupported settings should fail closed to a documented default, log the fallback, and never silently claim an unsupported level was applied.

---

## 7. Corrections to the prior answer — claim-by-claim audit

| Prior statement or implication | Audit result | Corrected formulation |
|---|---|---|
| The listed task/action order is a ranking of actual token usage | **Not verified** | It is an illustrative order of *potential* usage; needs representative request telemetry before being labeled measured. |
| Reading a big file uses more *reasoning* than reading a small one | **Incorrect implication** | Tool execution itself does not imply model thinking; tool-result ingestion mainly affects input/context. |
| “Total tokens = input + output + reasoning” | **Incorrect for OpenAI** | Reasoning is a component of reported output, not an extra summand. Normalize other providers explicitly. [1] |
| Cached input can simply be treated as free/redundant | **Incorrect** | Cached reads may cost less, still count as input/token usage, and cache writes/reads have model-dependent rates. [2] |
| One global None→Maximum effort ladder can be directly sent to any provider | **Incorrect** | Conceptual ladder only; map to each endpoint's supported values and semantics. [6][7][8][14] |
| Changing reasoning effort repeatedly is always efficient | **Incorrect** | Dynamic settings can break caches; supported exception mechanisms differ across providers. [2][4] |
| Higher effort always improves task quality | **Not established** | Potentially beneficial on difficult tasks, but diminishing returns, model variation, tool-loop behavior, and regressions must be measured. [4][13] |
| `opencode stats --days 7 --tools 20 --models 10` is the current universal command | **Only V1-documented** | V1 docs show those flags; V2 docs document a different stats interface (e.g. `--models`, `--cost`, `--json`). Check the actual CLI help. [15][16] |
| `opencode export` alone establishes rigorous per-action usage attribution | **Overstated** | V1 offers session JSON export, but complete phase-level attribution, child-session joins, actual cache categories, and provider semantics may require additional instrumentation. [15][17] |
| “No reasoning” on executing a shell command means no total model tokens | **Incorrect** | The command itself needn't call an LLM, but the model request that planned it and the request interpreting its output can consume substantial tokens. |
| Compaction always lowers dollar spend | **Not established** | It may shorten history but itself costs tokens, changes cached prefixes, and can lose context. Benchmark net results. [2][11][12] |
| More subagents necessarily produce better or faster outcomes | **Not established** | Child sessions add model calls; delegate when decomposition or parallelism produces measurable value. [10] |
| A short model answer implies little billed work | **Incorrect** | Internal reasoning may be substantial even when visible output is short. [1][4][5] |
| A single deterministic one-line patch is always low risk | **Incorrect** | Risk depends on affected invariants/data/security, not patch size. |

**Document status:** All *product-behavior claims above* have primary-source support where cited. **No task-token ranking, savings claim, or effectiveness conclusion is presented as a measured fact without actual telemetry.**

---

## 8. Recommended design for an effort-aware CLI router

### Inputs evaluated before a meaningful model request

1. **Task phase:** discover, analyze, plan, implement, verify, diagnose, review, or summarize.
2. **Estimated complexity:** number of coupled subsystems, unclear requirements, novel logic, and multiple plausible approaches.
3. **Risk:** destructive actions, authorization, migrations, data loss, security, concurrency, external side effects.
4. **Evidence:** tests, logs, known failure signatures, ambiguous errors, prior failed attempts.
5. **Context profile:** uncached/cached input, total context, expected tool output, current cache prefix, remaining budget.
6. **Endpoint capability:** model ID, real supported effort values, output cap, caching behavior, and local/hosted configuration.
7. **Observed outcomes:** success rate, retry count, latency, cost, and previously seen failure modes for similar tasks.

### Suggested conceptual routing logic (pseudocode, not drop-in OpenCode code)

```text
function route(request):
    if request.is_pure_deterministic_tool_execution:
        return execute_authorized_tool_without_new_model_call()

    level = phase_default(request.phase)   // discover=low, implement=medium,
                                           // complex-diagnose=high, etc.

    if request.has_security_or_data_loss_risk:
        level = max(level, HIGH)
        require_appropriate_verification_and_approval()

    if request.crosses_multiple_subsystems or request.evidence_conflicts:
        level = max(level, HIGH)

    if request.is_routine and requirements_are_explicit and patterns_are_verified:
        level = min(level, LOW)

    if request.repeated_failed_attempts and cause_remains_unresolved:
        level = escalate_once(level)

    proposed = map_to_supported_endpoint_effort(level)
    if proposed.invalid:
        log_invalid_mapping_and_apply_verified_fallback()

    if changing_top_level_effort_would_break_cache:
        compare_saved_generation_cost_to_lost_cache_value()
        choose_keep_effort_or_boundary_switch_based_on_measured_net_cost()

    enforce_output_budget_without_truncating_required_reasoning_or_code()
    log_decision_and_actual_provider_usage()
    return proposed
```

**No automatic “escalate to max” solely because the same test failed twice.** First determine whether the failure is environmental, a bad test expectation, missing setup, incomplete evidence, or a true implementation defect. Escalation should follow uncertainty and changed evidence, not retry count alone.

### Guardrails

- A user or policy authorization gate is **independent of model effort**; High thinking does not confer permission to run destructive commands.
- Do not reduce reasoning solely because a command or diff is small when it touches security, money, deletion, migration, or concurrency invariants.
- Keep reasoning summaries and action provenance concise, but never omit evidence required to reproduce or verify a change.
- Record actual **requested** and **resolved** model/variant settings, including unsupported-setting fallbacks.
- For DeepSeek tool calls, preserve required provider-specific reasoning content in the API history; avoid assuming hidden or visible reasoning messages are portable across endpoints. [6]
- Cache optimization should never override correctness, privacy, or reproducibility.

---

## 9. Benchmark and instrumentation plan to turn hypotheses into findings

### A. Verify the actual CLI/version first

Run these *read-only* checks in the user's checkout/environment, and inspect their real output:

```powershell
opencode --version
opencode --help
opencode stats --help
opencode session --help
opencode export --help
```

**For OpenCode V1-style docs:** `opencode stats --days 7 --tools 20 --models 10` and `opencode export [sessionID]` are documented. [15]  
**For OpenCode V2-style docs:** `opencode stats --days 7`, `opencode stats --models`, `opencode stats --cost`, and `opencode stats --json` are documented. [16]  
**Do not assume both interfaces coexist in `opencode_fife`.** Confirm its version/schema and check for custom fork changes before running any script built for upstream OpenCode.

### B. Collect usage without leaking project secrets

Capture at least:

| Field | Purpose / normalization rule |
|---|---|
| `task_id`, `phase`, `session_id`, `parent_session_id` | Attribute requests and child agents once |
| `request_id`, timestamp, tool operation, result size | Identify loops and context fanout |
| `provider`, `model_id`, endpoint, requested and resolved effort | Disentangle model and effort behavior |
| `input_total`, `cached_read`, `cached_write`, `input_uncached` | Derive disjoint components under provider rules |
| `output_total`, `reasoning_subset_or_separate`, `visible_output` | Prevent double-counting; use nullable fields if unsupported |
| `cost_actual_usd`, `cost_estimated_usd`, `latency_ms` | Actual outcomes, separated from estimates |
| `tool_calls`, `retry_count`, `compaction_count`, `cache_hit_rate` | Explain token drivers |
| `correctness_pass`, `tests_pass`, `regressions`, `human_review_status` | Quality and safety outcomes |

**Important:** The exact field availability must be confirmed in the fork and provider adapter. A JSON export, source-code hook, or provider response does not automatically expose all fields. OpenCode's plugin system documents message/session and tool execution events, which are possible instrumentation points; assess actual event schemas before coding. [17]

Data hygiene: remove API keys, access tokens, secrets, customer names, and proprietary source code from any exported dataset. Prefer aggregated numeric events with hashed IDs. The V1 export documentation offers a `--sanitize` option; verify it exists and inspect what it actually removes before sharing exports. [15]

### C. Normalize token metrics correctly

For any provider reporting distinct token categories, build a single normalized record **with non-overlapping billable input categories**. For example:

```text
input_total = uncached_input + cache_read + cache_write   // if disjoint
output_total = provider's normalized generated tokens, reasoning included once
reasoning_share = reasoning_tokens / output_total          // only if valid
cache_read_share = cache_read / input_total
```

If an API's `input_total` *already includes* cache reads/writes, **do not add them again**. Likewise, if an API's `output_total` includes reasoning, do not add reasoning. Mark unknown values `null`, not zero; store provider raw usage fields alongside normalized output for reconciliation. Use reported **actual cost** when trustworthy; otherwise calculate using the correct provider-specific input, cache-read, cache-write, output prices and time-of-day pricing if applicable. [1][2][3][5][7]

### D. Controlled experiment design

1. Build a fixed set of **at least five representative tasks in each targeted task class**; include low-, medium-, and high-complexity cases, but evaluate strata separately. Use known expected results and stable repository snapshots.
2. Run candidate effort policies **E, B, Q** against the **same model, endpoint, tools, instructions, context, repository state, and acceptance tests**. Control randomness where exposed; effort remains a variable. Repeat each condition **at least three times** as a *pilot*, not a guarantee of statistical significance.
3. For DeepSeek hosted API, test actual distinct effective values (`none`, `low`, `high`, `max` when supported) rather than pseudo-distinct aliases. Compare local inference in a separate stratum. [6][8]
4. Measure fresh/cached input, reasoning, visible output, total cost, wall-clock latency, number of model calls, number of tool executions, and retry count. Record cache prefix retention and compaction events.
5. Blind or independently grade **correctness**, tests, hidden regressions, scope adherence, security issues, and maintainability. Avoid using the same LLM as both implementer and sole judge.
6. Run a **warm-cache comparison** and a **cold-cache comparison** because effort switching can change cache reuse. Preserve the same cache policy across variants unless cache behavior itself is the experimental variable.
7. Randomize run order or use matched blocks to reduce confounding from transient provider load and temporal price changes. Do not test different policies on a dirty worktree.
8. Compute medians, 90th percentiles, confidence intervals where the sample permits, failure rates, and **cost per verified success**. Keep failed and blocked runs in the denominator, including all retry costs.
9. Promote a routing adjustment only if the expected net improvement outweighs measurement uncertainty **and** there is no meaningful degradation in quality, safety, or reproducibility.

**Minimum pilot size example:** 5 tasks × 3 policies × 3 repeated runs = **45 end-to-end runs per task class and model**. That is a design count, **not evidence that 45 runs have been completed**. Hard or infrequent defects may require more than three repeats or alternative sampling strategies.

### E. Metrics and acceptance gates

| Measure | Objective | Acceptance principle |
|---|---|---|
| Verified-success rate | Maintain correctness | No material deterioration against baseline |
| Cost per verified success | Efficiency | Improvement after counting retries and failed runs |
| P50 and P90 time-to-verified-success | Workflow speed | Avoid tail-latency blowups |
| P50 and P90 gross/billed tokens | Consumption | Capture input/cache/reasoning separately |
| Cache-read share and write cost | Cache health | Identify savings lost to effort/context changes |
| Regression/security defect count | Safety | Do not trade away critical correctness |
| Model/tool calls per successful task | Loop efficiency | Avoid unnecessary delegation or retries |
| Quality-review findings | Maintainability | Confirm changes match repo standards |

**Success criterion for the overall audit:** produce an empirically ranked table with `n`, median, P90, confidence interval/uncertainty, failure rate, cost, and reasoning-token share for every materially populated task category. Until then, use the indicative rankings in sections 3–4 only as prioritization hypotheses.

---

## 10. Practical optimization sequence for `opencode_fife`

**P0 — Instrument before optimizing.** Identify actual fork version, logging support, provider request adapters, cache accounting, and effort mappings; gather a small baseline on real tasks.

**P1 — Reduce low-value context volume.** Restrict repository search fanout, read bounded file regions, summarize non-failing test output, avoid redundant file re-reads, and cap tool-output ingestion *without discarding evidence needed for debugging*.

**P2 — Reduce loop waste.** Require hypotheses and a discriminating test after repeated failures; distinguish environmental errors from code defects. Avoid repeated “try another patch” cycles without new evidence.

**P3 — Apply a conservative default effort map.** Low for searching/mechanical tasks, Medium for routine code changes, High for difficult analysis and risk-sensitive review. Use the effective provider mapping, not UI labels alone.

**P4 — Optimize caching and compaction with experiments.** Measure true cache reuse and the first post-compaction request; preserve stable system and tool prefixes where possible. Do not lower compaction thresholds solely to force smaller prompts without evaluating summary quality and cache-write penalties.

**P5 — Test dynamic effort or model routing.** First try **phase-boundary** changes in separate tasks/sessions; then attempt cache-preserving per-message or configuration-update mechanisms *only after verifying end-to-end support*. Compare their net value to a stable-effort baseline.

**P6 — Re-rank from actual data.** Replace qualitative positions with measured medians/P90 and a quality-adjusted ranking per model, provider, task type, and cache state. Re-test after model upgrades or material fork changes.

### Initial implementation recommendation

- **Default: Balanced.** Set a stable moderate reasoning configuration per work session, with planned high-effort sessions for architecture/debugging/security and low-effort paths for mechanical tasks, unless the chosen model supports verified cache-preserving fine-grained effort changes.
- **Do not tie effort permanently to agent names.** A Build agent may alternate between trivial edits and difficult diagnosis; a Plan agent may perform easy triage or major architecture analysis. Task, uncertainty, risk, and phase are better inputs.
- **Do not add reviewer/architect agents merely to control reasoning.** Agent boundaries are useful if they bring focused responsibilities, independence, or efficient isolation; they also introduce prompts and model calls. Effort routing should not require proliferating custom agents.
- **Keep verification fixed across policies.** Efficient reasoning may be cheaper; reduced testing or missing safety checks is not a valid optimization.

---

## 11. Evidence ledger and authoritative references

Primary sources checked 26 October 2026. URLs are included for independent verification. Vendor documentation evolves; re-check after model or CLI upgrades. Where V1/V2 differs, the branch is explicitly identified. References demonstrate product/API behavior, **not** empirical task-ranking percentages.

1. **OpenAI, Reasoning models:** reasoning tokens in output accounting, output caps, usage details, context behavior. https://developers.openai.com/api/docs/guides/reasoning
2. **OpenAI, Prompt caching:** cache mechanics, read/write treatment, prefix validity, compaction and effort-change caveats, cache-preserving configuration update on supported models. https://developers.openai.com/api/docs/guides/prompt-caching
3. **Anthropic, Extended thinking:** legacy manual budgets, thinking reporting, limits, migration to adaptive thinking. https://platform.claude.com/docs/en/build-with-claude/extended-thinking
4. **Anthropic, Steering thinking:** adaptive behavior, effort semantics, cache invalidation and per-message exception, measurement guidance. https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost
5. **Google, Gemini thinking:** thinking configuration, thought-token accounting, output budget constraints. https://ai.google.dev/gemini-api/docs/thinking
6. **DeepSeek, Thinking Mode:** `low/high/max` mapping, toggles, tool-use reasoning-content preservation. https://api-docs.deepseek.com/guides/thinking_mode/
7. **DeepSeek, Responses API and pricing:** supported reasoning controls, provider-specific request semantics and token billing. https://api-docs.deepseek.com/api/create-response/ and https://api-docs.deepseek.com/quick_start/pricing/
8. **vLLM Project, DeepSeek-V4.1-Flash model recipe:** local inference thinking controls and API-vs-local mapping distinctions. https://github.com/vllm-project/recipes/blob/main/models/deepseek-ai/DeepSeek-V4.1-Flash.yaml
9. **OpenCode, Tools:** CLI-oriented tools, permissions and tool semantics. https://opencode.ai/docs/tools/
10. **OpenCode, Agents:** primary/subagents, agent-specific model and permissions. https://opencode.ai/docs/agents/
11. **OpenCode V1, Config:** `compaction.auto`, `compaction.prune`, `compaction.reserved`. https://docs.opencode.ai/docs/config/
12. **OpenCode V2, Compaction:** newer summary model and `compaction.keep`/`buffer` layout, background/native tradeoffs. https://dev.opencode.ai/v2/docs/compaction/
13. **Anthropic, Thinking:** prompt caching and preservation of thinking blocks. https://platform.claude.com/docs/en/build-with-claude/thinking
14. **OpenCode, Models:** catalog-supported variants and provider-specific effort controls. V1: https://opencode.ai/docs/models/ ; V2: https://dev.opencode.ai/v2/docs/models/
15. **OpenCode V1, CLI:** `stats` flags, session JSON export, optional sanitization. https://docs.opencode.ai/docs/cli/
16. **OpenCode V2, CLI commands:** `stats --days`, `--models`, `--cost`, `--json` in V2 documentation. https://dev.opencode.ai/v2/docs/cli/commands/
17. **OpenCode, Plugins:** session/message events and `tool.execute.before/after` instrumentation entry points. https://opencode.ai/docs/plugins/

### Final disposition

**Verified and current to the stated date:** principal provider behaviors, OpenCode's documented surfaces, model-specific effort normalization warnings, and the need to avoid reasoning/cache double counts.  
**Provisional until fork telemetry is available:** absolute and relative per-action/task token rankings; any predicted cost or quality advantage of E vs B vs Q; actual support for fine-grained dynamic effort in `opencode_fife`.  
**Recommended next technical artifact:** an anonymized task-call dataset and test harness against the actual fork, enabling the first measured ranking instead of extending a speculative one.
