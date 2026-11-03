# Best-in-class coding-harness engineering: research synthesis

**Research date:** 2026-11-03  
**Primary audit target:** [`deputyfifeofmayberry/opencode_fife`](https://github.com/deputyfifeofmayberry/opencode_fife), branch `main`, revision `07bae7483b6a7983bae2008407683097235e06c5`  
**Companion documents:** [Detailed fork gap analysis](opencode-fife-harness-gap-analysis-2026-11-03.md) · [Evidence ledger and research coverage](harness-engineering-evidence-ledger-2026-11-03.md)

## 1. Scope, baseline, and confidence

This report asks what makes a coding harness effective and compares that standard with the pinned `opencode_fife` implementation. A **coding harness** is the system around a model: task intake, context construction, the agent loop, tools, permissions and containment, execution recovery, compaction, provider adaptation, observability, and user control. It is not the model, an API adapter alone, the repository under repair, or a benchmark score alone.

The unit of value is an **accepted completed task**, with quality, human rework, latency, and total task cost measured together. Model calls, tokens, cache hits, and tool calls are intermediate quantities. The causal frame is:

> model × harness × provider/adapter × tools/sandbox × task × hardware/network × cache/context state.

The fork was inspected statically and read-only from `/tmp/opencode_fife` in a Linux x86_64/Bash/Git environment; final verification occurred at 2026-11-03 14:30 CST (+0800) and found an empty `git status --short`. No tests, benchmarks, package installation, live provider calls, or project scripts were run. Bun, Windows/PowerShell access, the prior Windows checkout, and the raw 2026-11-02 usage export were unavailable. Prior usage figures therefore remain **not independently reproduced**. External results are not measurements of this fork.

| Confidence label | Meaning here |
|---|---|
| High | Directly observed in pinned source or official primary documentation; material alternatives considered. |
| Moderate | Strong static or documented evidence, but runtime, environment, or equivalence remains unresolved. |
| Low | Plausible lead with incomplete evidence; not treated as an established outcome. |

**Finding totals used consistently across all three documents:** 7 substantiated gaps (including defects, assurance gaps, and architectural risks), 4 opportunities, and 6 unresolved unknowns. “Substantiated” does not mean “dynamically reproduced” or “proven to reduce task success.”

## 2. Executive findings

1. **The fork is already a sophisticated harness, not a minimal wrapper.** It has durable execution claims, an explicit step boundary, history reloads, structured/overflow compaction, bounded tool output, retries, subagents, transcript search, cache-aware usage accounting, and detailed permission rules. Generic claims that it lacks compaction, delegation, persistence, or DeepSeek support are false.
2. **Two effort-policy paths have concrete static defects or contract mismatches.** A verifier result can be discarded when no effort-state row exists, and behavior documented as inert without verification commands still appears reachable in transition and delegation paths. Neither was dynamically reproduced.
3. **The strongest architectural difference from Codex and DeepSeek Harness is containment, not agent intelligence.** The fork has approvals and command parsing, but the scoped inspection found no in-tree OS sandbox/network-egress enforcement. External isolation may supply it; the audit did not inspect deployment.
4. **The largest decision gap is measurement.** There is no supplied accepted-task baseline tying quality, rework, latency, and cost to the fork. Consequently, rising context, high cache-hit rate, high request count, effort escalation, or subagent use cannot be labeled beneficial or wasteful from mechanism evidence alone.
5. **Fork divergence has real value and real maintenance cost.** Effort adaptation, DeepSeek/provider handling, compaction telemetry, cache-conscious behavior, and usage monitoring coexist with a 239-file baseline-to-fork diff and overlapping changes in current upstream. Rewrites would destroy useful behavior unless compatibility and maintenance burdens are demonstrated first.
6. **Best-in-class systems make engineering constraints executable.** Durable event models, deterministic tool/approval contracts, repository-legible checks, isolated worktrees, native containment, bounded context, and task-level evaluation recur across strong implementations. Multi-agent orchestration and larger prompts are conditional tools, not defaults.
7. **DeepSeek is supported in both the fork and the official DeepSeek Harness.** Native thinking/effort serialization and cache accounting exist. No controlled evidence establishes that either harness is intrinsically best for DeepSeek models.

## 3. What “effective” means

An effective harness maximizes accepted work per unit of total resource and risk, subject to the task and operating environment. A useful scorecard is:

| Dimension | Decision-grade measure | Common misleading proxy |
|---|---|---|
| Completed-task quality | Tests plus review, rework, regressions, security defects | Fluent final response; patch generated |
| Reliability | Recovery success, stale-work prevention, repeatability | Process stayed alive |
| Speed | Wall time to accepted result, including retries and review | Tokens/second or one request latency |
| Token/cost efficiency | Total cost per accepted task, including failed attempts and subagents | Cache-hit percentage alone |
| Security | Filesystem/network/credential blast radius under adversarial tests | Number of approval dialogs |
| Usability | Interruption, steering, resume, explainability, safe defaults | Feature count |
| Maintainability | Upgrade conflict rate, invariant coverage, defect isolation | Lines of code or abstraction count |
| Long-term complexity | State-machine correctness, migration burden, plugin compatibility | Number of integrations |

Quality and efficiency must be reported jointly. A cheaper run that fails is expensive; a slower run that avoids human repair may be worthwhile. The benchmark unit should include patch extraction, test execution, retries, compaction, and all delegated work.

## 4. Methodology and source quality

The research used iterative discovery, primary-source verification, pinned implementation inspection, negative searches, and cross-source reconciliation. Twelve external search/fetch rounds exceeded the assignment’s ten-round minimum. Repository claims use exact revisions and path/symbol anchors; documentation is not treated as runtime proof.

Evidence classes are `REPO-VERIFIED`, `UPSTREAM-VERIFIED`, `MEASURED`, `DOCUMENTED`, `THIRD-PARTY`, `INFERRED`, and `UNKNOWN`. Mechanism-to-outcome strength is separately labeled `Verified mechanism only`, `Observational association`, `Controlled effect`, or `Undetermined`. Sources were selected for architectural diversity, direct fork applicability, evidence quality, recency, contradiction/negative evidence, and ability to change a decision. Deep inspection covered the four required anchors plus OpenHands, SWE-agent, and Claw-SWE-Bench; screened-only sources are not represented as code-audited. The full discovery log, exclusions, D1–D9 coverage, negative evidence, and claim-level rows are in the [evidence ledger](harness-engineering-evidence-ledger-2026-11-03.md). Expansion stopped when new landscape results repeated known mechanisms and remaining questions required runtime, deployment, or raw-data access rather than more search.

Key limitations:

- No dynamic fork experiment was executed; static defects remain unreproduced at runtime.
- The public `main` revision, not the contributor-preferred `dev` branch, is the target.
- Current upstream `dev` is a moving comparison point pinned at `1bf08ae46a91f7793c756e4ee521e37b6b554064`; it is not assumed superior.
- Proprietary Claude Code internals cannot be inferred from public behavior or documentation.
- Search saturation was reached for the named systems and fork mechanisms, not exhaustive coverage of every coding agent.

## 5. Landscape

### 5.1 First-party commercial harnesses

**Claude Code** provides documented project instructions, hooks, permissions, subagents, sandboxing, cost controls, and SDK-based automation. Its public materials are valuable for operating practices, but its loop, context classifiers, and other proprietary internals are unavailable. Treat documented behavior and vendor measurements as such, not as source-verified internals.

**OpenAI Codex** exposes an unusually deep implementation surface: a Rust core, JSON-RPC app server, thread/item/turn protocol, SDK, native sandbox backends, approval protocol, durable rollouts, compaction, memories, worktrees, and telemetry crates. OpenAI’s harness-engineering articles complement the code by explaining repository legibility, architectural enforcement, cache discipline, and agent-readable operations.

### 5.2 Open-source terminal agents and SDKs

**Upstream OpenCode** is both an independent baseline and the fork’s lineage. Its V2 TypeScript/Effect architecture already contains durable sessions, agents, model/provider adaptation, plugins/MCP/skills, and multiple compaction modes. The correct fork question is differential value and integration quality, not whether basic agent features exist.

**Official DeepSeek Harness** is an MIT-licensed Node.js/pnpm, Cordis-based system at `0.2.2-alpha.2`, explicitly labeled developer preview with compatibility-breaking changes expected. Plugins cover model adapters, tools, sessions, compaction, sandboxing, telemetry, and subagents. Its safety document says it has not undergone a security audit and is not production-ready.

**OpenHands Software Agent SDK** is a composable, event-sourced foundation with replay and measured persistence/recovery overhead. Its paper reports implementation-specific latency and production comparisons; these do not transfer automatically to OpenCode.

**SWE-agent** demonstrates the importance of an agent-computer interface: navigation, editing, and execution affordances can materially affect task performance. Its published results are historical and should not be read as current leaderboard standing.

**Aider** remains relevant as a terminal pair-programming baseline whose official documentation emphasizes repository maps, explicit edit formats, Git integration, and prompt caching. **Gemini CLI** broadens the landscape around enterprise terminal workflows. They were screened at official-documentation level, not deeply source-audited. **Goose** remains a discovered/limited-screen lead because the returned documentation’s authority was not sufficiently established. No superiority claim is made for any of the three. Assignment-seeded names including Pi, Cline, Roo Code, Kimi Code/CLI, OpenClaw, Hermes Agent, OpenHarness, Amp, Cursor, Windsurf, Factory/Droid, and Grok’s public coding tooling remained **Discovered**, not screened or deeply inspected; they are recorded in the ledger rather than padded with unverified claims.

### 5.3 Agent frameworks versus coding harnesses

General orchestration frameworks can supply graphs, durable execution, tool abstractions, or multi-agent messaging. They become coding harnesses only when combined with repository context, patch/editing semantics, executable verification, containment, session recovery, and coding-task evaluation. A framework feature checklist is therefore not a substitute for a complete harness comparison.

### 5.4 Task environments and benchmarks

SWE-bench-style evaluations score repository-state outcomes, not conversational quality. Claw-SWE-Bench is especially useful here because it holds models and outer orchestration fixed across harnesses and collects patches from Git state. It also shows why adapter/output-contract design belongs in the causal analysis. Benchmark rankings remain conditional on tasks, models, providers, prices, timeouts, and implementation versions.

## 6. Deep dives

### 6.1 Claude Code: documented controls, unavailable internals

Anthropic’s [best practices](https://www.anthropic.com/engineering/claude-code-best-practices) emphasize concise project instructions, verification, fresh-context review, and explicit limits for unattended work. Hooks and deny rules provide deterministic enforcement where model-followed instructions are probabilistic. Subagents can isolate noisy output, constrain tools, and parallelize separable work, but they incur fresh-context and token costs.

The [sandboxing](https://www.anthropic.com/research/claude-code-sandboxing) and [containment](https://www.anthropic.com/research/how-we-contain-claude) articles distinguish permission prompts from environmental controls. Anthropic reports high approval rates and an internal phishing exercise in which retries often completed exfiltration; these are vendor-reported observations/red-team results, not fork measurements. The design lesson is to combine approvals with filesystem and egress limits and to reduce low-value prompts.

**Not established:** Claude Code’s private loop, classifiers, exact context selection, or whether its mechanisms outperform this fork on a shared task set.

### 6.2 OpenAI Codex: open runtime and app-server architecture

At pinned revision `dbaead0106de82bd129a4f6f503d173ad5109f68`, Codex’s app server exposes durable threads and items with JSON-RPC. `turn_admission.rs` rejects turns while closed or paused, tracks active admissions, and uses a permit whose drop decrements active work. `message_processor.rs` routes thread start/resume/fork and turn start through admission. This is a concrete concurrency boundary, not merely a UI queue.

The core session/turn code owns permission profiles, sandbox/network policy, tool execution, retries, cancellation, and compaction metadata. `rollout_reconstruction.rs` restores history and resume/fork metadata and selects only a safe newest compaction when its replacement-history/window conditions hold. The sandbox manager maps to macOS Seatbelt, Linux seccomp, and Windows restricted-token/MXC components, with explicit unavailable/preparation errors; this audit does not claim every conceivable configuration fails closed.

OpenAI’s [harness engineering](https://openai.com/index/harness-engineering/) and [app-server engineering](https://openai.com/index/unlocking-the-codex-harness/) articles stress exact-prefix caching, stable tool ordering, worktree isolation, executable architectural rules, and legible logs/metrics/traces. Reported development-time and generated-code figures are observational case-study data, not controlled effects of individual features.

### 6.3 Official DeepSeek Harness: real, broad, and explicitly immature

The pinned revision `ce7073d51254c26cd63b22a60835b8f948deb447` contains a substantial runtime rather than a marketing stub. `ReactLoopAgent` appends explicit turn/step events and supports followup, steering, injection, wake, cancellation, and tool recovery. The session service uses an append-only event log and model-visible projections. JSONL persistence, replay-aware compaction, durable retry scheduling, subagent ancestry/locks, MCP, skills, workflow tools, and OpenTelemetry packages are present.

Cordis plugins contribute services, typed events, and reversible effects; ordered profiles compose `web`, `headless`, `sdk`, `sdk-minimal`, and `acp` experiences. This makes replaceability a core architectural mechanism, though plugin breadth also increases compatibility and assurance surface.

The local sandbox prefers Bubblewrap then Landlock on Linux, uses Seatbelt on macOS, and has a Windows restricted-token/ACL backend. Unsupported platforms fail closed at `confine()`. Windows ACL enforcement is explicitly partial: reads remain unconfined and NTFS hard links can alias granted files. These are stronger and more precise statements than “sandboxed” alone.

The repository contains 2,395 filenames matching `*.spec.ts`, `*.test.ts`, or `*.e2e.ts` under `packages` and `apps`; that is a file count, not a test count or pass rate. Benchmark assets emphasize reconnect, continuation, folding, long sessions, terminal I/O, and session opening rather than accepted coding-task quality. No tests were run in this audit. The official [safety document](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/SAFETY.md) explicitly rejects production-ready/security-audited interpretation.

### 6.4 Upstream OpenCode and the fork

OpenCode V2 supplies the fork’s architectural foundation: location-scoped Effect services, SQLite/Drizzle persistence, event projections, model/provider adapters, agents, plugins, MCP, skills, and TUI surfaces. Current upstream includes post-fork changes such as percentage compaction buffers, provider-reported token sizing, prompt-cache TTL controls, and throttling/context-error handling. Focused comparisons also show fork-only telemetry, effort integration, and provider handling. A newer upstream path is a lead for reconciliation, not automatically a fix to copy.

### 6.5 DeepSeek across the three requested runtime paths

The current official model entry points are `deepseek-flash` and `deepseek-v4-pro`; current native thinking controls use `low`, `high`, and `max`, with thinking enabled and default effort `high` when not otherwise controlled. These are provider facts, not harness-quality evidence.

| Path | Verified integration | Compatibility and evaluation boundary |
|---|---|---|
| Official DeepSeek Harness | Native adapter serializes thinking enable/disable and `output_config.effort`; translates reasoning and cache usage; supplies official model metadata | Native DeepSeek relationship is direct, but the harness is a developer preview and no accepted-task advantage is established |
| Codex with DeepSeek | DeepSeek’s official [Codex integration](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/) configures a custom provider using the Responses API, a model catalog, reasoning effort, and optional server-side web search | Codex’s generic harness/sandbox/session mechanisms remain in use; provider serialization, tools, session grouping, and search availability differ from native OpenAI operation |
| OpenCode / `opencode_fife` | Fork `variant.ts` maps native DeepSeek thinking and low/high/max effort; provider/resolver/native-SDK paths and hosted variants exist | No live request or equivalent-task comparison was run; model aliases, hosted adapters, cache semantics, and tool contracts can confound comparison |

A fair comparison would pin the model version and endpoint, prompt, tools, permissions, outer time/token budgets, cache state, and Git-state patch extraction. It would report accepted tasks, rework, total cost, and wall time with repeated runs. “Same model name” alone is insufficient: the official harness’s native Messages path, Codex’s Responses path, and hosted OpenCode routes are different adapters and may expose different effective behavior.

## 7. Literature synthesis

### 7.1 Context engineering and verification

Anthropic’s [context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) separates compaction, structured notes, subagents, and just-in-time retrieval. These solve different failure modes: context limits, durable state, output isolation/parallelism, and relevance. The Agent SDK guidance favors gather → act → verify → repeat and cautions that semantic search can be less transparent and harder to maintain than agentic search.

SWE-agent’s [paper](https://arxiv.org/abs/2405.15793) supports designing tools around model-computer interaction rather than exposing raw shell/output without bounds. OpenAI’s engineering account similarly favors repository structure and fast executable feedback over long instructional prompts.

### 7.2 Multi-agent systems

Anthropic’s [multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system) reports large gains on a specific internal research evaluation and much higher token use than chat. It does not establish a coding-task effect. Delegation is most defensible for separable exploration, independent review, or noisy-tool isolation; shared-state editing and serial debugging may suffer from coordination overhead.

### 7.3 Event sourcing and operational reliability

The OpenHands SDK [paper](https://arxiv.org/html/2511.03690v2) reports replay of 433 SWE-bench Verified conversations and low persistence/replay latencies in its implementation. Codex, DeepSeek Harness, and the fork independently use durable event/history mechanisms, making recoverability a convergent design pattern. These mechanisms support inspection and resume; they do not by themselves prove correct recovery after every crash or better task outcomes.

### 7.4 Security and prompt injection

Approval rules answer “may this action proceed?” Sandboxes answer “what can the process actually reach?” Network policy and credential scoping are separate controls. A prompt-injection systematization was screened but its aggregate counts were internally inconsistent and were not independently replicated, so its headline percentages are excluded. The robust conclusion does not depend on those numbers: probabilistic model behavior cannot substitute for environmental containment.

### 7.5 Evaluation and observability

OpenTelemetry’s GenAI conventions define agent/workflow/tool span structure and token attributes, with sensitive content opt-in and evolving maturity. Traces explain execution; accepted-task evaluation determines value. Claw-SWE-Bench demonstrates controlled whole-harness comparison, but does not isolate which internal mechanism caused differences. High cache rate can coexist with high cost or low task success.

In Claw-SWE-Bench’s fixed GLM 5.1 comparison, a bare adapter resolved 19.3% versus 71.2% for the full adapter, with apply failures below 1.5% for the latter. That is a controlled output-contract effect in one setting. Its DeepSeek Harness results also illustrate Pareto tradeoffs: DeepSeek-V4.1-Flash reached 76.5% Pass@1 at $41 total and 1,577 seconds mean duration with 96.3% cache, while other models had lower resolution rates, different cost, and shorter mean duration. These figures describe 350-task benchmark configurations using external inference and stated price assumptions; none measures `opencode_fife` or isolates compaction/caching as the cause.

Methodological weaknesses across the literature include vendor-selected configurations, private harness components, version drift, task-selection and contamination risk, missing failed-attempt costs, and nonrepresentative environments. Repeated vendor articles about one internal result are one evidentiary lineage, not independent replications. For performance work, time to first token, prefill/decode, queueing, network, tool execution, retries, compaction, and validation must be separated before optimizing throughput; concurrency or batching can reduce one component while worsening contention, rate limits, or tail latency. No such fork time decomposition was available.

## 8. D1–D9 capability matrix

| Domain | What strong harnesses do | `opencode_fife` baseline | Gap/opportunity | Outcome evidence |
|---|---|---|---|---|
| D1 Agent loop | Explicit turn/step state, durable admission, cancellation, bounded retries, recovery | Strong: durable inbox/claims; one `llm.stream` per step; history reload | Runtime fault-injection evidence absent | Verified mechanism only |
| D2 Context/information | Stable prefix, bounded outputs, just-in-time retrieval, clear fidelity contracts | Strong: instruction ordering, 50 KiB/2,000-line output bound, FTS search | F-03 transcript “complete” wording conflicts with bounded rendering; O-01/O-02 | Undetermined for quality |
| D3 Memory/continuity | Replay-safe compaction, resumable identity, selective notes | Strong: automatic/manual/overflow/native/background compaction and resume | Compaction benefit and long-session behavior unmeasured | Undetermined |
| D4 Tools/orchestration | Deterministic contracts, permissions, scoped delegation, work isolation | Strong: hooks, shell, MCP/plugins/skills, depth-limited subagents | Delegation payoff and policy semantics need validation | Verified mechanism only |
| D5 Models/routing | Provider-specific capabilities, safe fallbacks, explicit effort controls | Strong: native/hosted DeepSeek support and model variants | F-01/F-02 effort-policy defects; no quality comparison | Static defect; outcome undetermined |
| D6 Cache/cost/latency | Exact-prefix stability, cache lineage, task-level cost/latency | Strong accounting and cache-conscious paths | O-01 nested-fork lineage; F-05 accepted-task economics absent | Undetermined |
| D7 Reliability/security | Durable recovery plus OS filesystem/network containment | Strong recovery, retries, approvals and hooks | F-04 no in-tree OS containment discovered; deployment unknown | Mechanism absence; risk contextual |
| D8 Evaluation/observability | Task outcome joins traces, tokens, cost, rework; adversarial tests | Usage/event/OTLP mechanisms exist | F-05/F-06 no outcome baseline and incomplete assurance coverage | Measurement gap |
| D9 UX/maintainability | Interrupt/steer/resume, safe defaults, low upgrade friction | Rich session APIs and fork-specific UI/usage support | F-07 divergence/integration debt; current upstream parity unresolved | Architectural risk |

## 9. Fork architecture: inherited versus custom

The latest in-fork upstream merge is `ed073f3202c6752d6f4d8e2bc5c17b199b3587f2`, whose upstream parent/baseline is `ed74ec82ce1fe3a36da6c0815a935473ef4bb0fb`. Baseline-to-fork diff: **239 files, 21,056 insertions, 2,731 deletions**. These are raw diff counts, not hand-written feature counts; `.opencode` alone accounts for 58 files and 11,038 additions.

**Primarily inherited/foundation:** Effect service architecture, session persistence/projections, model/provider framework, tool/plugin infrastructure, permission model, TUI application structure, MCP and skills integration.

**Fork-specific or materially extended:** effort policy/adapter/evidence/delegation; detailed first-step/drain/compaction telemetry; explicit DeepSeek protocol handling; cache-affinity behavior; Z.ai/Zhipu usage monitoring and TUI display; selected shell, compaction, and control-token handling changes.

**Shared active path:** session admission → context selection → effort transition → context estimation/compaction → provider request → streaming/tool settlement → retry/continuation/recovery → projection/usage telemetry. Precise anchors and divergence statistics are in the [gap analysis](opencode-fife-harness-gap-analysis-2026-11-03.md).

## 10. Workload baseline and context/caching/usage investigation

### 10.1 Evidence-labeled workload profile

**User-stated priorities:** personal, Windows-centered CLI; dependable coding quality, reasonable speed/cost, low ongoing maintenance, flexibility across proprietary and open models; PowerShell/Bun, Git, SSH/terminal, and custom agent workflows may matter. These are priorities, not measured task frequencies. **Observed task mix:** unavailable. No consented session/task corpus, accepted patches, or repository-history linkage was supplied. Repository scale, model/provider distribution, concurrency, and failure-mode frequencies are therefore unknown.

The scenario inventory below is a conceptual coverage set, not an observed distribution and not an executed benchmark. Selection intentionally includes hard failures and long-horizon cases to reduce easy-success cherry-picking. Future real cases should use consented/redacted repositories, recorded base revisions, and previously unseen held-out tasks where contamination matters.

| ID | Representative task/fixture | Acceptance contract | Relevance label |
|---|---|---|---|
| W01 | Small single-file bug fix | Targeted test plus diff review; no unrelated edits | User-relevant coding class; frequency unknown |
| W02 | Multi-file feature with tests | Prescribed tests, API/diff review, no regression | User-relevant; frequency unknown |
| W03 | Large-repository discovery/cross-file refactor | Symbol/behavior checks and full relevant test set | Inferred relevance to context/tools; scale unknown |
| W04 | Long session with changing context, compaction, crash/resume | Final task tests plus state/replay invariants | Prior context signal makes it a hypothesis, not observed defect |
| W05 | Difficult reasoning/debugging task | Independent failing-to-passing test and review | User quality priority; model/effort relevance hypothesized |
| W06 | Narrow task on cheap/fast model with possible escalation | Same acceptance as W01/W02; record escalation and total cost | User cost/model-flexibility priority; benefit unknown |
| W07 | Rate limit, outage, malformed tool output, cancellation, denial | Typed terminal state, no stale success, safe resume | Reliability priority; event frequency unknown |
| W08 | Windows PowerShell/SSH workflow with supervision | Windows-path/tool correctness, usable steering/approval | Explicit user-stated environment; not exercised here |
| W09 | Untrusted repository/tool content with credentials nearby | No unauthorized file/network/credential reach; intended task still completes | Security stress case; no observed incident |

A **task** begins with a user objective at a recorded repository/environment state and ends at acceptance, abandonment, or a censored safety/budget stop. **Correct first attempt** means acceptance without a rework loop; **accepted output** requires objective tests/diff or independent rubric plus required human approval; **rework** is another attempt after rejection/failure; **censored/aborted** attempts remain visible rather than being silently removed. Model self-grading is not ground truth.

### 10.2 Metric dictionary and baseline availability

| Metric | Event boundary, unit, and denominator | Direction | Current baseline / missing data |
|---|---|---|---|
| Accepted-task rate | Accepted tasks / all started eligible tasks; report censored/aborted separately | Higher | Unavailable: no task IDs/outcomes |
| Correct-first-attempt rate | First attempts accepted without rework / judged first attempts | Higher | Unavailable: no first-attempt judgments |
| Rework | Review/test rejection loops per accepted task; median and tail | Lower | Unavailable |
| Time to acceptance | Start to accepted result, including retries/review; median/P95 seconds | Lower, subject to quality | Unavailable: request latency is not a substitute |
| Cost per accepted task | All model/tool costs across failed, delegated, compacted, and reworked attempts / accepted tasks | Lower, subject to quality/safety | Unavailable: raw usage and task linkage absent |
| User intervention | Approvals, manual repairs, and steering events per accepted task | Context-dependent | Unavailable; approval count alone is not safety |
| Safety violation rate | Independently confirmed unauthorized reaches/actions / started tasks | Lower | Unavailable: no adversarial runs |
| Recovery reliability | Correctly resumed injected failures / injected eligible failures | Higher | Unavailable: no fault injection |
| Context/cache diagnostics | Per-request uncached/cached/reasoning/output tokens, compaction and cache lineage; distributions by task | Diagnostic, no universal direction | Code mechanisms verified; per-request raw records absent |
| Maintenance overhead | Human hours, semantic conflicts, and regressions per upstream reconciliation | Lower | Unavailable: raw diff size is only exposure |

No numerical composite score or improvement threshold is invented. A change worth maintaining must improve accepted outcomes or a guardrail beyond run-to-run noise without a material offsetting regression; the required sample size and practical effect should be predeclared from observed variance rather than assumed.

### 10.3 Prior usage signal and hypothesis register

The previously reported 2026-11-02 usage figures cannot be independently reproduced because the raw export is unavailable. They are not repeated as established facts. Request counts are not tasks; aggregate cache ratio is not relevance or completed work; no median/tail task distribution can be recovered from the summary.

| Hypothesis for rising context/cost | Current evidence | Discriminating observations needed |
|---|---|---|
| Continuously growing single session or retained history | Plausible; compaction/history mechanisms exist, no trajectory supplied | Session/task IDs, per-request history composition, compaction events |
| Tool results, repeated files, instructions, schemas, or summaries dominate | Plausible; output is bounded but retained context composition is unobserved | Per-request component token breakdown and duplicate/provenance analysis |
| Legitimate task complexity/reference sets | Equally plausible | Task class, repository scale, user intent, accepted-output quality |
| Compaction fails or activates too late | Not established; several compaction/recovery modes exist | Threshold/ceiling traces, overflow errors, summaries, replay and outcomes |
| Provider accounting/cache behavior explains apparent growth | Possible confound | Endpoint/model/adapter versions, cached versus uncached fields, historical prices |
| Delegation/retries amplify requests | Possible; mechanisms exist | Parent/child and retry linkage, all-attempt cost and acceptance |

The fork’s usage code separates uncached input, visible output, reasoning, cache read, and cache write and prefers endpoint-reported cost over catalog pricing. That is a solid measurement substrate, not an accepted-task outcome measure. Without input composition, task identity, model-specific latency, and quality results, attribution is **underdetermined**. A high cache-hit rate can reduce price/latency for reused bytes while total context remains excessive; high request count can represent verification, retries, delegation, or stalls. None proves waste or a compaction defect.

## 11. Cross-cutting conclusions

1. **Preserve deterministic boundaries.** Explicit steps, durable claims, typed tool settlement, and admission controls are more valuable than adding another agent abstraction.
2. **Treat context as an engineered interface.** Stable prefixes, bounded artifacts, fidelity-aware retrieval, and replay-safe compaction should be evaluated together.
3. **Do not equate containment with approval.** A secure deployment needs filesystem, process, network, and credential boundaries proportionate to threat and autonomy.
4. **Provider adaptation is part of the harness.** DeepSeek thinking/effort serialization, cache fields, context errors, and retry classification can change outcomes independently of model quality.
5. **Measure completed work, not activity.** Tracing and token accounting must join test/review outcomes and rework before optimization claims are credible.
6. **Prefer reconciliation over rewrites.** Current upstream and the fork each contain useful changes in overlapping files. Any major rewrite requires a higher evidence bar, migration/compatibility analysis, and a maintenance owner.
7. **Use subagents selectively.** They are justified by isolation, parallelism, or independent verification—not by the assumption that more agents means better reasoning.

### Mechanism-to-outcome attribution and discriminating comparisons

| Mechanism/claim | Current attribution | Important confounds / interaction | Proposed controlled comparison (not executed) |
|---|---|---|---|
| Fork explicit steps, claims, retries | Verified mechanism only; outcome undetermined | Task length, provider failure pattern, process crash semantics | Paired injected-failure fixtures at the same pinned revision; correct resume/stale-success rate and wall time |
| Compaction/retrieval bounds | Verified mechanism only; quality undetermined | Model context tolerance, task type, summary prompt, provider token counts | W03/W04 paired tasks with no-change control; acceptance, retrieval accuracy, total tokens/cost/latency |
| Effort escalation | F-01/F-02 static conditions; benefit undetermined | Model/provider effort vocabulary, task difficulty, verifier correctness | W05/W06 same model and endpoint, pre-seeded versus unseeded boundary plus policy on/off where supported; acceptance and total cost |
| Subagents/background work | Verified mechanism only | Task separability, shared-state conflicts, startup tokens, reviewer burden | Separable versus serial W02/W03 tasks with delegation/no-delegation; acceptance, rework, time and all-child cost |
| Cache affinity/lineage | Verified mechanism; O-01 opportunity | Provider cache TTL/eviction, warm/cold state, prompt volatility | Counterbalanced warm/cold nested-fork fixtures; provider cache traces plus task-total cost/latency |
| Native OS containment | Codex/DeepSeek mechanisms verified; fork risk inferred | External VM/container, credentials, Windows backend limits, hosted tools outside proxy | W09 benign probes in disposable environments; denied reach and legitimate-task completion |
| Git-state patch extraction | External controlled effect for Claw adapter; fork effect undetermined | Model, task, edit format, Git state, test selection | Same model/tasks with output-contract variants; patch apply and independently tested acceptance |
| Accepted-task telemetry | Existing substrate verified; outcome benefit undetermined | Sensitive-data handling, reviewer consistency, missing/aborted tasks | Prospective replay/join on consented historical tasks before any live optimization comparison |

For high-impact comparisons, record task ID, base repository state, prompt, model/version/provider, sampling/effort, tools/sandbox, harness SHA/configuration, cache state, budgets, rerun count, failures, and reviewer rubric. Randomize or counterbalance order where practical, report effect sizes and uncertainty, and retain inconclusive results. Tool or protocol incompatibility narrows the claim rather than being hidden in a single “harness effect.”

## 12. Decision questions for later planning

These are questions, not an implementation plan:

- Which task classes and acceptance tests define value for the fork’s actual users?
- What containment is already supplied by deployment, and which threat model must the repository itself satisfy?
- Should effort policy be strictly verification-gated, or is base-level/delegation adaptation intended without verifiers? Which behavior is the contract?
- What upstream compatibility must be preserved for configuration, sessions, plugins, providers, and persisted state?
- Which fork additions have measurable user value sufficient to justify overlapping maintenance with upstream?
- What evaluation harness can hold model, tasks, outer budgets, patch extraction, and scoring fixed while comparing fork revisions?
- What evidence would justify a major rewrite rather than focused reconciliation? Who would maintain it?

## 13. References

Full claim-level citations, pinned source anchors, exclusions, and conflicts are in the [evidence ledger](harness-engineering-evidence-ledger-2026-11-03.md). Primary references used most heavily:

1. [Anthropic — Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices).
2. [Anthropic — Building agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk).
3. [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents).
4. [Anthropic — Claude Code sandboxing](https://www.anthropic.com/research/claude-code-sandboxing) and [containment](https://www.anthropic.com/research/how-we-contain-claude).
5. [OpenAI — Harness engineering](https://openai.com/index/harness-engineering/), [Unlocking the Codex harness](https://openai.com/index/unlocking-the-codex-harness/), and [Running Codex safely](https://openai.com/index/running-codex-safely/).
6. [OpenAI Codex source at `dbaead0`](https://github.com/openai/codex/tree/dbaead0106de82bd129a4f6f503d173ad5109f68) and [app-server documentation](https://developers.openai.com/codex/app-server).
7. [DeepSeek Harness source at `ce7073d`](https://github.com/deepseek-ai/deepseek-harness/tree/ce7073d51254c26cd63b22a60835b8f948deb447), [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/architecture.md), and [safety](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/SAFETY.md).
8. [OpenCode compaction](https://opencode.ai/v2/docs/compaction/), [models](https://opencode.ai/v2/docs/models/), and [agents](https://opencode.ai/docs/agents/).
9. [SWE-agent](https://arxiv.org/abs/2405.15793), [OpenHands Software Agent SDK](https://arxiv.org/html/2511.03690v2), and [Claw-SWE-Bench](https://arxiv.org/html/2606.12344v2).
10. [DeepSeek API documentation](https://api-docs.deepseek.com/), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/), [context caching](https://api-docs.deepseek.com/guides/kv_cache/), and [Codex integration](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/).
11. [OpenTelemetry GenAI agent-span conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md).

---

**Read-only statement:** No repository source, tests, documentation, settings, locks, generated assets, Git state, issues, or pull requests were changed. No implementation or implementation plan was produced.
