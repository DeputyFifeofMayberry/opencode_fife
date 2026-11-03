# FiFeCode consolidated coding-harness research

**Date:** 2026-11-03  
**Status:** Research and adversarial reconciliation only; no implementation  
**Target:** `deputyfifeofmayberry/opencode_fife`, published `main` at `07bae7483b6a7983bae2008407683097235e06c5`  
**Upstream comparison:** `anomalyco/opencode`, pinned research baseline `dev` at `1bf08ae46a91f7793c756e4ee521e37b6b554064`  
**Companion documents:** [Master findings register](fifecode-master-findings-register.md) · [Reconciliation ledger](fifecode-research-reconciliation-ledger.md)

## 1. Executive findings

1. **FiFeCode is already a sophisticated harness.** The inspected revision contains durable session admission and execution claims, an explicit step loop, history reconstruction, retries and cancellation, scoped tools, subagents, plugins/MCP/skills, multi-mode compaction, transcript search, cache-conscious request construction, and detailed token/cost accounting. Broad claims that it lacks these systems are false. Protecting correct existing boundaries has stronger evidence than adding a replacement architecture.

2. **The clearest implementation defect is in verifier-driven effort persistence.** A default-standard root session can reach the no-change transition without creating a `session_effort` row. A later verifier observation computes new state but calls update-only persistence. With no row, the failure is not stored and later escalation cannot use it. The source mechanism is **Verified**; real-world frequency and accepted-task impact remain unknown. Existing evidence tests seed the row and therefore do not exercise this boundary. See [FIFE-001](fifecode-master-findings-register.md#fife-001--absent-row-verifier-evidence-is-not-persisted).

3. **Background verification is a separate, probable event-integration gap.** Foreground settled tool outcomes reach `EffortEvidence.observe`; background shell execution initially returns `running`, while final completion is delivered through a synthetic session notification. The inspected paths do not show the final result reaching the effort observer. Another consumer has not been exhaustively excluded, so this is **Supported**, not a universally proven runtime defect. It must not be merged with the absent-row root cause. See [FIFE-002](fifecode-master-findings-register.md#fife-002--background-verifier-completion-can-bypass-effort-evidence).

4. **The effort policy also has a contract ambiguity and three narrower correctness risks.** The schema says the policy is “inert” with no verification commands, yet base-level, plan-mode, and delegation behavior remains reachable. Separately, the logical revision normally advances only for `write`, `edit`, and `patch`; verifier identity omits working directory; and the pure policy has no cap or decay for a failure that never clears. These are distinct mechanisms with different evidence needs, not one generic “effort problem.” See FIFE-003 through FIFE-006 in the [register](fifecode-master-findings-register.md).

5. **Accepted-task evidence is the largest decision gap.** No supplied dataset joins a user objective to independent acceptance, all retries and subagents, rework, total cost, and wall time. Existing request/token/cache telemetry is useful but cannot establish completed-task quality. Consequently, this research does not support numerical benefit claims for routing, compaction, caching, delegation, or effort escalation. See [FIFE-018](fifecode-master-findings-register.md#fife-018--accepted-task-outcome-cost-and-latency-baseline-is-missing).

6. **Prior context and cache figures do not diagnose a defect.** The raw usage export was not supplied. Rising input size could reflect legitimate task state, changed work, provider accounting, retries, delegation, or waste; a high cache ratio can coexist with high total cost or poor acceptance. More aggressive compaction or a new memory system is not justified by those aggregates alone. See FIFE-020 and FIFE-021.

7. **DeepSeek support exists; DeepSeek superiority does not.** `packages/core/src/variant.ts` directly contradicts the claim that no DeepSeek-specific thinking/effort handling was found. Native and hosted mappings exist. No controlled comparison establishes whether FiFeCode, Codex, or the official DeepSeek Harness produces better accepted DeepSeek coding outcomes. The official Harness’s developer-preview status also rules out treating feature breadth or test-file counts as production assurance. See FIFE-026, FIFE-027, and FIFE-036.

8. **Permissions are not equivalent to OS containment.** The fork has meaningful approval, deny, external-directory, and hook controls. Those controls answer whether an action may proceed; they do not by themselves bound everything a spawned process can reach. No in-tree Seatbelt/Landlock/seccomp-style integration was established by the scoped inspection, but incomplete search results are not proof of absence. External VM/container isolation and the actual deployment remain unknown. This matters most for untrusted or unattended autonomy. See [FIFE-009](fifecode-master-findings-register.md#fife-009--permission-controls-are-not-os-containment).

9. **Upstream divergence is a semantic maintenance exposure, not proof that “merge first” is always correct.** The recorded comparison was 97 fork commits ahead and 528 behind, with overlapping changes in active runner, compaction, model-request, subagent, configuration, and session paths. Current upstream offers relevant context-window and provider-error mechanisms, but the fork also contains valuable divergent behavior. Raw commit or line counts are not defect counts, upgrade hours, or a universal priority rule. See FIFE-014 and FIFE-015.

10. **No major rewrite or feature adoption is evidence-justified.** Peer systems supply useful comparators: Codex for cross-client event ownership and containment, Claude Code for policy/hook boundaries, DeepSeek Harness for plugin seams, Aider for budgeted repository maps, Gemini CLI for independent checkpoints, OpenHands for replay, and mini-SWE-agent for a minimal control. None supplies a transferable estimate of accepted-task improvement for this personal Windows-centered fork.

## 2. Scope, source inventory, and counting method

Three research packages were inventoried: ChatGPT’s three documents dated 2026-11-02, DeepSeek’s combined three-part document dated 2026-11-02, and Kimi’s three documents dated 2026-11-03. All examined the same published fork SHA and the same pinned upstream baseline. The controlling assignment was also read. The local checkout `Y:\CodingProjects\opencode_fife` was unavailable, so conclusions apply to public `main`, not an unknown dirty tree or installed build.

The consolidation reviewed **118 original findings/claims**: 32 ChatGPT units, 41 DeepSeek units, and 45 Kimi units. The denominator includes explicitly registered gaps, opportunities, hypotheses, strengths, unknowns, deferred leads, and enumerated negative results, plus one material unnumbered DeepSeek-support assertion. Analyst-assigned IDs for unnumbered units are identified in the [ledger](fifecode-research-reconciliation-ledger.md#6-original-to-consolidated-crosswalk). Evidence entries (`E-*`) and repeated narrative restatements are not counted as independent findings.

These resolve to **40 distinct consolidated findings**, including 35 directly crosswalked finding groups and five peer/architecture syntheses drawn from narrative research. Exclusive original-unit dispositions are:

| Disposition | Count | Meaning |
|---|---:|---|
| Confirmed | 13 | Retained with the scoped source/document observation established; this does not imply a reproduced user-facing failure |
| Merged | 90 | Valid duplicate, related hypothesis, strength, or negative result absorbed into a consolidated finding |
| Unresolved | 13 | Retained principally as an open question, unvalidated opportunity, or access limitation |
| Contradicted | 2 | Better pinned-source evidence materially disproves the original claim |
| Superseded | 0 | No original unit required this exclusive disposition |

Detailed counting rules, every original ID, and disposition notes appear in the [reconciliation ledger](fifecode-research-reconciliation-ledger.md).

## 3. Method and evidence limits

The consolidation used document inventory, terminology normalization, finding-by-finding comparison, and targeted read-only inspection of the published fork and selected upstream files. Direct inspection covered effort transition, evidence, storage, pure policy, adapter, delegation, subagent integration, model resolution, step settlement, background shell behavior, DeepSeek variant mapping, file stamps, hooks, compaction, transcript bounds, cache affinity, request construction, usage accounting, permissions, tests, documentation, and workflow triggers.

Evidence labels follow the assignment:

- **Verified:** pinned source or reproducible documentary evidence establishes the specific mechanism.
- **Supported:** credible evidence supports the claim but a material path, deployment, or runtime limitation remains.
- **Plausible:** a reasonable hypothesis lacks sufficient direct verification.
- **Contradicted / Superseded / Unresolved:** used in the register where better evidence disproves a claim, conditions no longer apply, or evidence cannot decide it.

Static source inspection establishes implementation behavior only within the inspected path. It is not a successful live test. No repository tests, benchmarks, provider calls, Windows runs, dependency installation, destructive commands, or security probes were performed. Two attempts to refresh current upstream `dev` failed with a GitHub authentication-service 503; the second was the permitted retry. Upstream comparisons therefore remain pinned to `1bf08ae…`, not represented as the live tip on delivery.

## 4. What strong coding harnesses demonstrate

The strongest defensible lesson is not a feature checklist. It is that model capability operates through a causal system:

> model × harness × provider/adapter × tools/sandbox × task × hardware/network × cache/context state.

A model comparison must hold harness, provider, tools, tasks, and budgets steady. A harness comparison must hold the exact model/version and endpoint steady and make unavoidable tool/protocol differences explicit. Request counts, token totals, cache-hit ratios, test-file counts, and benchmark headlines cannot substitute for accepted task outcomes.

| System or evidence family | Mechanism worth retaining as a comparator | What it does not prove for FiFeCode |
|---|---|---|
| Claude Code | Deterministic permission/hook boundaries, scoped delegation, selective context practices, containment concepts | Proprietary internals, universal hook-parity need, or better multi-provider/Windows outcomes |
| Codex | Durable threads/items, explicit admission, cross-client JSON-RPC ownership, native sandbox and approval separation | That FiFeCode needs another app server or inherits Codex’s threat model |
| Official DeepSeek Harness | Append-only events, replay-aware projections, ordered plugin/profile boundaries, native adapter behavior | Production readiness, security audit status, or DeepSeek task superiority |
| Upstream OpenCode | The actual lineage and lowest-duplication source of shared fixes and provider/context evolution | That every newer upstream change is compatible or beneficial |
| Aider | Budgeted symbol/dependency maps and explicit edit formats | An existing FiFeCode search deficiency or accepted-task gain |
| Gemini CLI | Shadow-Git recovery independent of normal project history | That FiFeCode lacks snapshots/revert or needs a second recovery system |
| OpenHands SDK | Event-sourced replay and measured implementation-specific persistence behavior | Transferable latency or recovery effects in OpenCode |
| SWE-agent / mini-SWE-agent | Agent-computer-interface importance and minimal negative controls | That either minimal or elaborate orchestration wins on personal CLI work |
| Claw-SWE-Bench | Fixed outer orchestration and Git-state patch extraction to reduce output-format confounding | A FiFeCode defect or a mechanism-specific causal effect |

Extra agents, routing, indexes, memory, and hooks all have opportunity costs: additional model calls, queue delay, stale state, cache changes, security surface, and maintenance. A no-change or minimal control is therefore part of the engineering evidence, not an optional nicety.

## 5. Complete D1–D9 architectural assessment

### D1 — Agent loop, execution semantics, and tool-call lifecycle

**Current implementation and inheritance.** OpenCode V2 supplies the durable event/session foundation. The inspected fork has explicit one-stream-per-step semantics, reloaded history, scoped tool fibers, durable tool settlement, cancellation, retries, output-limit continuation, overflow handling, stale-state recovery, and execution claims for restart continuity. This is a strength to protect, not a missing loop.

**Substantiated findings.** FIFE-001 can lose verifier evidence before the next transition. FIFE-002 identifies a different initial-versus-final tool-result path for background commands. FIFE-004 concerns whether the logical revision accurately orders filesystem changes. None establishes a general failure of the runner core.

**Open evidence.** Crash/fault injection, late completion after cancellation, and accepted-task continuity were not exercised. Peer durable-loop mechanisms support the design direction but do not validate every fork path.

### D2 — Prompt construction, retrieval, context engineering, and compaction

**Current implementation.** The fork combines stable-to-variable instruction ordering, permission-aware context/tool selection, estimated and measured prompt sizing, bounded model-visible output with retained artifacts, FTS transcript indexing, and automatic/manual/overflow/native/background compaction. Compaction includes structured summary validation, cache-conscious construction, a 15% reserve with 16,000-token minimum, 15,000-token recent keep, optional precompute, and overflow shrink stages.

**Findings and opportunities.** FIFE-008 is a low-severity mismatch between “complete message” wording and bounded indexed content. FIFE-015 records upstream percentage-buffer, sizing, request-headroom, and provider-error leads. FIFE-016 concerns nested-fork cache lineage. FIFE-020 and FIFE-021 reject unsupported diagnoses from aggregate usage. FIFE-022 through FIFE-024 cover unproven skill overhead, selective re-injection/memory parity, and repository maps.

**Qualification.** The compaction summary prompt says repository instructions and environment are received separately, weakening any broad assertion that FiFeCode simply lacks all post-compaction instruction re-injection. Native/provider compaction also makes a “text-summary only” description incomplete.

### D3 — Memory, planning, persistence, and task continuity

**Current implementation.** Durable sessions, event projections, resume/fork identity, compaction summaries, plan behavior, skills/references, and retained earlier messages provide substantial continuity. Effort state is SQLite-backed when a row exists; delegation can seed child state.

**Findings.** FIFE-001 is precisely an initialization exception to broad durability claims. FIFE-007 limits stale-edit protection across process restarts and concurrent external writes. FIFE-023 preserves the unresolved question of Claude-style auto-memory or selective re-injection without treating their absence as a defect.

**Open evidence.** No long-session corpus establishes summary fidelity, decision preservation, cross-session task transfer, or resume quality. Adding a long-term memory layer could duplicate durable history and create stale or private state.

### D4 — Tools, workflows, plugins, skills, subagents, and orchestration

**Current implementation.** Read/edit/patch/search/shell tools, background execution, permissions, config hooks, plugins, MCP, skills, and depth-limited subagents are present. Subagents validate model, variant, agent, ownership, permissions, and depth, and support continuation/background notification.

**Findings.** FIFE-002 and FIFE-003 affect tool/delegation integration. FIFE-010 defines the trusted-config and sensitive-input boundary for shell hooks. FIFE-011 records narrower lifecycle coverage than Claude-style hooks as an optional extension, not a demonstrated task failure. FIFE-039 preserves selective-orchestration evidence: delegation is most defensible for separable, noisy, or independent work, not as a universal quality multiplier.

### D5 — Model/provider integration, routing, and adaptive reasoning effort

**Current implementation.** The inspected resolver honors explicit session model, configured agent model, or resolver default. No task-difficulty model-tier router appears in that path, although local, plugin, or unpublished routing is not excluded. The effort adapter requires at least two real effort variants, inserts a phantom `standard`, supports plan pinning and delegation bases, and preserves exact user selections. Native and hosted DeepSeek thinking/effort handling exists.

**Findings.** FIFE-001, FIFE-003, FIFE-005, and FIFE-006 are distinct effort-policy issues. FIFE-025 is an unvalidated routing opportunity. FIFE-026 preserves the unresolved DeepSeek/harness/provider comparison. FIFE-027 and FIFE-032 protect existing provider support and user control.

**Qualification.** Direct `SessionEvent.ModelSelected` publication is not inherently a malfunction. DeepSeek’s assertion that transitions route through `Session.switchModel` is wrong, but the design preference alone does not prove the actual publication path defective.

### D6 — Caching, token efficiency, cost, latency, and throughput

**Current implementation.** Session affinity supplies cache-related headers/keys; stable request construction and media bounding consider prefix reuse; cache TTL is model-dependent. Usage accounting separates uncached input, visible output, reasoning, cache read, and cache write, with endpoint-reported cost preferred over catalog fallback.

**Findings.** FIFE-016 is an explicit nested-fork lineage TODO, not measured waste. FIFE-017 records unmeasured effort-switch cache effects. FIFE-018 is the missing total-task economic baseline. FIFE-020 and FIFE-021 block naive inference from context growth or aggregate cache ratios.

**Implication.** A transition can preserve a prefix structurally yet still change provider cache behavior through model, variant, headers, serialization, TTL, or eviction. Only provider-scoped warm/cold traces tied to accepted tasks can settle benefit.

### D7 — Reliability, security, permissions, containment, and recovery

**Current implementation.** Permission rules default to ask, configured deny precedes saved allow, missing agent permissions deny, external-directory checks exist, and hooks can deny or halt. Recovery, stale settlement, retry, and file-stamp mechanisms add protection.

**Findings.** FIFE-007 is a concrete process-local/TOCTOU limitation. FIFE-009 separates approvals from OS containment and leaves deployment mitigation unresolved. FIFE-010 treats hooks as trusted arbitrary shell execution with inherited environment, not a sandbox. FIFE-012 limits release/boundary assurance claims.

**Qualification.** No exploit, breach, unauthorized action, or failed recovery was observed. Peer sandbox presence does not prove FiFeCode’s deployment is unsafe, and worktrees alone are not security containment.

### D8 — Testing, benchmarks, telemetry, evaluation, and observability

**Current implementation.** Focused effort, storage, recovery, adapter, delegation, and runner tests exist; workflow assets include Linux/Windows unit and build coverage on configured branches. Event logging, detailed usage, provider-quota UI, and OTLP support are present.

**Findings.** FIFE-012 confirms that shown `check.yml` push/PR triggers target `dev`, while `check-test.yml` push targets `dev`/`beta`; external release checks for `main` remain unknown. The absent-row test setup is pre-seeded. FIFE-018 is the central accepted-task measurement gap. FIFE-019 preserves Git-state outcome extraction as an evaluation-design opportunity.

**External evidence boundary.** Kimi reports Claw-SWE-Bench’s fixed GLM 5.1 adapter comparison at 19.3% bare versus 71.2% full resolved, with full-adapter apply failures below 1.5%. It also reports a DeepSeek Harness configuration at 76.5% Pass@1, $41 total, 1,577-second mean duration, and 96.3% cache. These are package-reported external benchmark figures, not independently reproduced here, not FiFeCode measurements, and not causal estimates for caching or compaction.

### D9 — Terminal UX, extensibility, maintainability, and upstream compatibility

**Current implementation.** The monorepo includes CLI/TUI/app surfaces, plugins/skills, provider-usage UI states, and Windows-specific work. Source presence establishes a rich platform footprint, not a tested Windows experience.

**Findings.** FIFE-013 records the `main` versus `dev` guidance and draft-versus-implemented spec mismatch. FIFE-014 is the semantic maintenance exposure. FIFE-034 preserves Windows/UX value while marking runtime behavior unexercised. FIFE-035 and FIFE-036 compare alternative client/plugin boundaries without recommending duplication.

**Implication.** The user’s low-maintenance priority favors narrow, well-owned fork differences and reuse of suitable upstream mechanisms. It does not establish a universal merge order or justify raw diff size as an effort estimate.

## 6. Verified capabilities and strengths to protect

The consolidated register protects nine strength groups:

- **FIFE-027:** native and hosted DeepSeek thinking/effort support.
- **FIFE-028:** durable, interruptible agent loop, explicit steps, claims, settlement, and recovery.
- **FIFE-029:** real multi-mode compaction and retained history.
- **FIFE-030:** cache-conscious requests and granular usage/cost accounting.
- **FIFE-031:** permissions, bounded tools/output, subagents, hooks, plugins, MCP, and skills.
- **FIFE-032:** exact user model/effort precedence and a portable pure policy core.
- **FIFE-033:** focused tests, event/OTLP substrate, and provider-usage observability.
- **FIFE-034:** rich terminal/session controls and Windows-specific engineering.
- **FIFE-038:** peer recovery/replay comparators reinforce the value of existing durable design rather than a replacement.

These are verified or supported mechanisms, not measured proof of superior accepted-task outcomes.

## 7. Reconciled priorities and disagreements

### Decision-priority groups, not an implementation sequence

| Priority | Findings | Reason |
|---|---|---|
| High | FIFE-001, FIFE-018 | Narrow static correctness defect; cross-cutting inability to establish accepted-task value |
| High when applicable | FIFE-002, FIFE-009 | Background verifier signal loss if used; containment if untrusted/unattended autonomy lacks external isolation |
| Medium | FIFE-003–FIFE-007, FIFE-012, FIFE-014–FIFE-015, FIFE-017, FIFE-020 | Concrete but conditional correctness/assurance/maintenance risks and key measurement questions |
| Medium opportunity | FIFE-019, FIFE-025–FIFE-026 | Evaluation design, routing, and DeepSeek comparisons require controlled evidence before value claims |
| Low or evidence-dependent | FIFE-008, FIFE-013, FIFE-016, FIFE-021–FIFE-024, FIFE-037, FIFE-039–FIFE-040 | Wording, documentation, specific cache/evaluation hypotheses, peer leads, or research-scope controls |
| Protect | FIFE-027–FIFE-036 and FIFE-038 where applicable | Existing strengths and architectural comparators; some entries combine a strength with a bounded risk or maturity qualification |

The register, rather than this compressed table, controls each finding’s exact classification and conditions.

### Major model disagreements and dispositions

| Disagreement | Resolution |
|---|---|
| DeepSeek said no DeepSeek-specific thinking/effort handling was found; Kimi said it exists | **Contradicted by direct source.** `variant.ts` contains native DeepSeek mapping and hosted handling. Retain FIFE-027; keep live compatibility unmeasured. |
| DeepSeek described effort transitions through `Session.switchModel`; Kimi/ChatGPT identified direct event publication | **Contradicted mechanism, not a proven defect.** `transition.ts` publishes `SessionEvent.ModelSelected` directly. The publication route alone does not establish malfunction. |
| DeepSeek ranked upstream divergence as the dominant prerequisite; ChatGPT/Kimi ranked narrow correctness and measurement findings at least as highly | **Contextual/priority disagreement.** Divergence is verified exposure; “merge first” is not universally evidence-backed. FIFE-001 and FIFE-018 can be decision-critical independently. |
| Some narratives framed compaction as missing, text-only, or lagging; all packages also acknowledged existing compaction | **Narrowed.** Multi-mode/native/background compaction exists. Upstream differences are reconciliation opportunities; no quality regression is established. |
| Kimi treated absent-row behavior as a static confirmed deficiency; ChatGPT called it probable pending runtime reproduction | **Terminological more than factual.** The static mechanism is Verified; prevalence and user impact remain unobserved. |
| Containment absence and severity | **Partially resolved.** Permissions are not OS containment. Scoped absence and actual external deployment are not exhaustively established, so residual risk remains conditional. |
| Direct event publication as an architectural violation | **Unsupported as a defect claim.** Design-document preference is not runtime evidence; preserve exact-pick and projection behavior while investigating only concrete failures. |
| External benchmark and cache figures as evidence of harness value | **Rejected as transferable effect estimates.** Keep source-scoped numbers only; accepted-task FiFeCode outcomes remain absent. |

## 8. Performance, cost, reliability, and maintainability implications

- **Coding effectiveness:** FIFE-001 and FIFE-002 can prevent the intended verifier signal from influencing later effort, but no accepted-task effect size is known. Model routing and more reasoning are hypotheses, not remedies by default.
- **Performance:** End-to-end time must include queueing, prefill/decode, tools, retries, compaction, subagents, review, and rework. No fork time decomposition was supplied.
- **Cost:** Cached-token discounts and effort levels matter only within total cost per accepted task. Failed and aborted attempts cannot be removed from the denominator. Subscription and endpoint-reported pricing need separate treatment.
- **Reliability:** Existing durable semantics are substantial. The most credible risks sit at integration boundaries: missing initial state, delayed final events, surrogate revision identity, restart-local file stamps, and assurance coverage.
- **Security:** Trusted hooks and permission prompts do not replace containment. Actual risk depends on repository trust, credentials, autonomy, and external deployment isolation.
- **Maintainability:** Upstream convergence can reduce duplication but introduce semantic regressions. Fork-specific behavior needs demonstrated value and explicit ownership; peer feature parity alone is a weak reason for new surface area.
- **Windows/PowerShell:** Source and workflow support exist, but no live Windows/Bun/PowerShell/SSH/TUI test was performed. This is a material limitation, not a passed compatibility check.

## 9. Confirmed conclusions versus unresolved hypotheses

**Confirmed or supported at mechanism level:** absent-row update behavior; pre-seeded evidence tests; background initial/final event difference; inert-contract reachability; default mutation list; cwd omission; no pure-policy cap/decay; process-local/non-atomic file stamps; transcript bounds; hook trust and lifecycle; workflow triggers; documentation mismatch; recorded divergence; nested-fork TODO; native DeepSeek mappings; existing compaction, usage, permissions, and durable-loop capabilities.

**Unresolved or plausible only:** real frequency and task impact of those paths; a final-background consumer not found in bounded inspection; external containment; current local/uncommitted state; accepted-task benefit of effort escalation; effort-switch cache impact; context-growth cause; skill/reference overhead; selective re-injection or auto-memory value; repository-map value; task-tier routing value; DeepSeek harness ranking; current-upstream functional equivalence; Windows runtime behavior; actual release-check provenance.

**Contradicted:** the claim that no DeepSeek-specific handling exists, and the assertion that the inspected transition uses `Session.switchModel`. No finding was classified superseded because the published target SHA remained unchanged.

## 10. Questions that must be resolved before implementation planning

These are evidence questions, not an implementation plan:

1. Does a representative fresh default-standard root session actually reach verifier settlement with no effort row, and what state/events follow failure and later pass?
2. Does any consumer forward final background shell completion to effort evidence, and how are cancellation, replay, and duplicate observations handled?
3. Is “inert while empty” intended to disable only verifier escalation or all base/plan/delegation behavior?
4. What exact staleness invariant should revision and verifier identity enforce across shell edits, working directories, and concurrent settlement?
5. What is the actual local checkout SHA, dirty state, installed version, configuration, and model/provider mix?
6. What containment does the real deployment supply, and what threat model applies to personal trusted versus untrusted repositories?
7. Which objective tests/review labels define accepted tasks, and can existing events reconstruct all-attempt cost, duration, and rework with explicit missingness?
8. What do raw request traces show about context composition, cache state, compaction, retries, and delegation per accepted task?
9. Which upstream changes materially affect fork-owned behavior, and what historical maintenance burden or compatibility evidence exists?
10. What Windows/PowerShell/Bun/SSH behaviors and release checks are actually observed on the pinned or local revision?
11. Under fixed model/provider/task conditions, do routing, cache-lineage, compaction, or delegation changes improve accepted outcomes beyond run variation and maintenance cost?
12. Are private evaluation data, external CI, or provider billing records available to close gaps without collecting sensitive code or secrets?

## 11. References and evidence trail

The authoritative per-finding code anchors, original IDs, contradictions, and limitations are in the [master findings register](fifecode-master-findings-register.md) and [reconciliation ledger](fifecode-research-reconciliation-ledger.md). Primary source families used by the research packages include:

- [Published FiFeCode target](https://github.com/deputyfifeofmayberry/opencode_fife/tree/07bae7483b6a7983bae2008407683097235e06c5)
- [Pinned upstream baseline](https://github.com/anomalyco/opencode/tree/1bf08ae46a91f7793c756e4ee521e37b6b554064)
- [Claude Code documentation](https://code.claude.com/docs/en/overview) and [Anthropic context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
- [OpenAI Codex source](https://github.com/openai/codex) and [harness engineering](https://openai.com/index/harness-engineering/)
- [DeepSeek Harness source](https://github.com/deepseek-ai/deepseek-harness) and [DeepSeek API documentation](https://api-docs.deepseek.com/)
- [Aider repository maps](https://aider.chat/docs/repomap.html), [Gemini CLI checkpointing](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/checkpointing.md), [OpenHands SDK paper](https://arxiv.org/html/2511.03690v2), [SWE-agent paper](https://arxiv.org/abs/2405.15793), and [Claw-SWE-Bench](https://arxiv.org/html/2606.12344v2)

The original uploaded filenames and their methods are preserved in the ledger. External empirical figures are attributed to the research packages and were not independently rerun for this consolidation.

## 12. Completion and no-modification statement

All seven research documents and the controlling assignment were inventoried. Every counted original finding/claim has a crosswalked disposition; material narrative peer findings are synthesized into the register. The three documents use the same target SHA, counts, labels, and limitations.

No target repository code, tests, documentation, configuration, dependency, Git state, issue, or pull request was changed. No dependencies were installed and no destructive commands were run. No implementation or step-by-step implementation plan was produced. Deliverables are stored outside the repository under `/mnt/agents/output/`.
