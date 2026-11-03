# `opencode_fife` coding-harness gap analysis

**Audit date:** 2026-11-03  
**Repository:** [`deputyfifeofmayberry/opencode_fife`](https://github.com/deputyfifeofmayberry/opencode_fife)  
**Branch / revision:** `main` / `07bae7483b6a7983bae2008407683097235e06c5`  
**Mode:** Read-only static inspection and external evidence synthesis; no implementation  
**Companions:** [Harness-engineering research](harness-engineering-research-2026-11-03.md) · [Evidence ledger](harness-engineering-evidence-ledger-2026-11-03.md)

## 1. Repository identity and environment

The pinned checkout reports package version `2.1.4`, Bun `1.4.4`, MIT license, and upstream repository `https://github.com/anomalyco/opencode` in `package.json`. The core package is `packages/core` (`@opencode/core` 2.1.4), with Effect, Drizzle, SQLite, provider, MCP, tree-sitter, and PTY dependencies. The root test script intentionally refuses root-level test execution.

The execution environment was Linux x86_64 with Bash and Git, at 2026-11-03 14:30 CST (+0800) during final verification. The read-only source checkout was `/tmp/opencode_fife`; authorized deliverables were outside it under `/mnt/agents/output/`. Network/TLS interruptions required narrower read-only fetches and pinned archives. The audit environment did not provide Bun or installed project dependencies, Windows/PowerShell access, or the prior `Y:\CodingProjects\opencode_fife` checkout. No tests, typechecks, application E2E, provider calls, smoke tests, or benchmarks were run. No credentials were accessed. The raw 2026-11-02 usage export was unavailable. Runtime and performance claims are therefore not independently reproduced. Final `git status --short` for the pinned checkout was empty.

Development documentation says contributions normally base on `origin/dev`; this assignment explicitly targets public `main`. Workflow definitions and task documents are evidence about intended assurance/design, not proof that the inspected revision passed or implements every claimed item.

## 2. Upstream divergence

| Identity | Revision / meaning |
|---|---|
| Fork HEAD | `07bae7483b6a7983bae2008407683097235e06c5` |
| Latest in-fork upstream merge | `ed073f3202c6752d6f4d8e2bc5c17b199b3587f2` |
| Upstream parent/baseline of that merge | `ed74ec82ce1fe3a36da6c0815a935473ef4bb0fb` |
| Current upstream comparison | `anomalyco/opencode` `dev` at `1bf08ae46a91f7793c756e4ee521e37b6b554064` |

The baseline-to-fork diff contains **239 files, 21,056 insertions, and 2,731 deletions**. This includes vendored, documentation, and test material; `.opencode` alone contributes 58 files and 11,038 additions. It must not be presented as 21,056 lines of handwritten runtime code.

Focused path statistics:

| Path | Baseline → fork | Fork → current upstream |
|---|---:|---:|
| `packages/core/src/session/runner/llm.ts` | +100/-10 | +48/-107 |
| `packages/core/src/session/runner/step.ts` | +29/-5 | +35/-48 |
| `packages/core/src/session/compaction.ts` | +60/-8 | +97/-105 |
| `packages/core/src/session/model-request.ts` | +64/-5 | +39/-83 |
| `packages/core/src/tool/plugin/subagent.ts` | +33/-7 | +19/-45 |
| `packages/core/src/config/normalize.ts` | +10/-54 | +83/-11 |
| `packages/core/src/session.ts` | +8/-3 | +19/-28 |

The fork release line ends at v2.1.4 dated 2026-10-23; the upstream snapshot contains v2.2.5 dated 2026-10-30 and newer code. Current upstream adds or changes percentage compaction buffers, provider-reported token sizing, request headroom, tracing/idle hooks, and other behavior. The fork adds effort integration and detailed telemetry absent at the same compared upstream locations. These are overlapping integration tradeoffs, not evidence that one side is universally better.

## 3. Active runtime paths and precise source anchors

### 3.1 Admission, execution, and recovery

- `packages/core/src/session/session.ts` — `prompt`: reconciles/admits durable inbox work, prepares input, commits staged revert state, and wakes execution. `switchModel`: same-model/variant no-op guard, otherwise publishes `SessionEvent.ModelSelected`.
- `packages/core/src/session/execution.ts` — process-local runner with durable execution claims; start records a claim, terminal outcomes release it, and shutdown interruption preserves it for restart continuity.
- `packages/core/src/session/runner/llm.ts` — active loop: reload context, effort transition, reload after switch, estimate/compact, prepare request, execute step, retry/continue/recover; settles stale compactions/tools and records usage/drain telemetry.
- `packages/core/src/session/runner/step.ts` — provider streaming, tool fibers, durable settlement, truncation/output-limit continuation, cancellation, snapshots, usage, overflow, retries, and `EffortEvidence.observe`.
- `AGENTS.md` — architectural invariant: “Each step: one explicit `llm.stream` call continuing from reloaded history. No in-memory tool loop.” This is design guidance corroborated by the runner structure, not a test result.

### 3.2 Permissions, hooks, shell, and tools

- `packages/core/src/permission.ts` — last matching rule wins; default `ask`; missing agent permissions deny all; configured deny precedes saved allow; plugin evaluation hooks exist.
- `packages/core/src/config-hooks.ts` — Claude-compatible pre-tool hooks: exit 2 deny, exit 49 halt, other failures non-blocking; JSON allow/deny/input-patch/context; 60-second default timeout; bounded stdout/stderr; matching hooks run concurrently. Commands use the shell and inherited environment, so trusted configuration is not a sandbox boundary.
- `packages/core/src/config/plugin/hooks.ts` — maps deny to tool error, halt to typed defect, and prepends added context to completed tool output.
- `packages/core/src/tool/plugin/shell.ts` — permission/resource parsing and external-directory authorization around lines 116–148; working-directory revalidation immediately before spawn around line 148; 120-second default foreground timeout and background behavior around lines 203–274.
- `packages/core/src/session/auto-background.ts` — default 2,000 ms threshold; zero disables the watchdog.
- `packages/core/src/tool-output.ts` — 2,000 lines / 50 KiB model-visible cap; full overflow retained for seven days with a returned path.

### 3.3 Context, cache, compaction, and retrieval

- `packages/core/src/session/context.ts` — resolves session, agent, instructions, tools, MCP, references, and skills; intentionally orders stable/shared content before variable date/environment content.
- `packages/core/src/session/model-request.ts` — provider request construction, tools, headers, provider options, cache key/TTL, output limits, media handling, plugin hooks, and control-token sanitization. Contains the nested-fork cache-lineage TODO.
- `packages/core/src/session/affinity.ts` — `get`: children share parent affinity; forks share fork-source affinity.
- `packages/core/src/session/compaction.ts` — automatic/manual/overflow/native/background modes; 15% reserve with 16,000-token minimum; 15,000-token recent keep; precompute off by default, 85% trigger and 64,000 measured-token minimum; overflow shrink factors 0.85/0.70/0.50/0.35.
- `packages/core/src/session/transcript.ts` — FTS search/read; 4,000-character per-tool rendering cap; 20,000-character message cap; 400-character snippets; bounded neighbors and search results.
- `packages/core/src/database/fts.ts` — SQLite FTS5 external-content index, unicode61 tokenizer, triggers, and rebuild for existing rows.
- `packages/core/src/tool/plugin/session.ts` — current-session-scoped `session_search` / `session_read`; search says to read the “complete message,” while read explicitly discloses a 20,000-character bound.

### 3.4 Models, effort, and providers

- `packages/core/src/effort/policy/policy.ts` — pure decisions: operation base levels, failure escalation, same-verifier/later-sequence/not-older-revision pass clearing, exact-user-selection precedence.
- `packages/core/src/effort/adapter.ts` — `capability` and `stateFor`: filters real model variants; fewer than two real efforts disables adaptation; inserts phantom `standard`; pins plan to deep.
- `packages/core/src/effort/evidence.ts` — settled-tool observation and absent-row state construction followed by update-only persistence.
- `packages/core/src/effort/store.ts` — `set` upserts; `setOpenFailure` and `bumpRevision` update existing rows only.
- `packages/core/src/effort/transition.ts` — computes default base/exact variant/open failure and publishes `SessionEvent.ModelSelected` directly.
- `packages/core/src/effort/delegation.ts` — seeds child state by operation when appropriate.
- `packages/schema/src/config/effort.ts` — `verification_commands`: “The policy is inert while empty.”
- `packages/core/src/variant.ts` — native DeepSeek thinking/effort mapping, Vertex thinking flag, NVIDIA `chat_template_kwargs.thinking`/`reasoning_effort`, plus hosted-provider handling.
- `packages/core/src/provider.ts`, `model-resolver.ts`, `aisdk-native.ts` — DeepSeek loading, provider resolution/native SDK mapping, and chunk-timeout handling.
- `packages/core/src/session/usage.ts` — separates uncached input, visible output, reasoning, cache read/write; endpoint-reported cost takes precedence.

### 3.5 Delegation and operations

- `packages/core/src/tool/plugin/subagent.ts` — validates model/variant, agent, permissions, depth, and ownership; default depth 1; supports background execution, continuation, and completion notification; calls `EffortDelegation.seed` for new children without an obvious verifier-configured guard.
- `packages/core/src/provider-usage.ts` — Z.ai/Zhipu monitor with fixed known origins, credential-scoped cache, request coalescing, 240-second normal/15-second forced TTL, 10-second timeout, and stale/error states.
- `packages/tui/src/feature-plugins/sidebar/usage.tsx` — optional display gated by `experimental.zai_usage`; five-minute polling and degraded/stale display.
- `packages/core/src/event-logger.ts` — selected configuration/provider/agent/model update events only.
- `packages/util/src/observability/otlp.ts` — Effect OpenTelemetry/OTLP support exists.

## 4. D1–D9 assessment

| Domain | Existing strength | Substantiated finding | Opportunity / unresolved evidence |
|---|---|---|---|
| D1 | Explicit step semantics, durable inbox/claims, cancellation, retries, recovery | None established in loop core | No crash/fault-injection run; repeated truncation behavior unmeasured |
| D2 | Cache-conscious instruction ordering, bounded output, FTS retrieval | F-03 retrieval fidelity wording | O-01 lineage; O-02 upstream context guards |
| D3 | Multi-mode compaction, resume/fork identity, stored earlier messages | None proving compaction failure | Long-session summary quality/replay behavior unmeasured |
| D4 | Rich tools, hooks, permissions, depth-limited background subagents | F-02 can affect delegation | Delegation benefit and coordination cost unknown |
| D5 | Broad provider adaptation and explicit DeepSeek support | F-01/F-02 effort policy | No fixed-model/provider task comparison |
| D6 | Cache affinity, detailed token categories, endpoint-cost precedence | F-05 accepted-task economics absent | O-01 nested-fork cache lineage; prior usage not reproduced |
| D7 | Permission rules, approval hooks, durable retries/recovery | F-04 no in-tree OS containment found; F-06 assurance coverage | External containment and platform behavior unknown |
| D8 | Usage, event logging, OTLP support, unit/E2E workflow assets | F-05/F-06 measurement and assurance gaps | O-04 task-outcome join; no benchmark result |
| D9 | Rich session control, TUI usage states, extensibility | F-07 upgrade/integration exposure | Full current-upstream equivalence not established |

## 5. Finding register and counts

**Counts:** 7 substantiated gaps (`F-01`–`F-07`), 4 opportunities (`O-01`–`O-04`), 6 unknowns (`U-01`–`U-06`). Confirmed-defect labels mean the code/contract condition is statically established, not that production impact was observed. Architectural and measurement gaps are counted separately by classification below but included in the seven substantiated findings.

| ID | Classification | Priority | Mechanism / outcome evidence | Status |
|---|---|---|---|---|
| F-01 | Confirmed deficiency (static) | High | `REPO-VERIFIED`; outcome `Undetermined` | Open, not dynamically reproduced |
| F-02 | Confirmed deficiency (contract) | Medium | `REPO-VERIFIED` + `DOCUMENTED`; outcome `Undetermined` | Open, intended semantics unresolved |
| F-03 | Confirmed deficiency (tool contract) | Low | `REPO-VERIFIED`; outcome `Undetermined` | Open, minor fidelity wording issue |
| F-04 | Architectural risk | High when untrusted autonomy is in scope | `REPO-VERIFIED` negative search; outcome `Undetermined` | Deployment alternative unresolved |
| F-05 | Measurement/observability gap | High | `REPO-VERIFIED` + `UNKNOWN`; outcome `Undetermined` | No accepted-task baseline supplied |
| F-06 | Measurement/observability gap | Medium | `REPO-VERIFIED`; outcome `Undetermined` | Workflow/coverage condition established |
| F-07 | Architectural risk | Medium | `REPO-VERIFIED` + `UPSTREAM-VERIFIED`; outcome `Undetermined` | Maintenance exposure, not a runtime defect |
| O-01 | Opportunity without demonstrated deficiency | Medium | `REPO-VERIFIED`; outcome `Undetermined` | Explicit TODO; benefit unmeasured |
| O-02 | Opportunity without demonstrated deficiency | Medium | `UPSTREAM-VERIFIED`; outcome `Undetermined` | Reconciliation candidate, not proven defect |
| O-03 | Opportunity without demonstrated deficiency | Medium | `MEASURED` externally; local effect `Undetermined` | Evaluation/output-contract candidate |
| O-04 | Opportunity without demonstrated deficiency | High | `REPO-VERIFIED` substrate + external `DOCUMENTED`; local effect `Undetermined` | Decision-grade outcome attribution candidate |

### F-01 — Verifier evidence can be lost when effort state has no row

- **Classification / priority:** Confirmed deficiency (static control/data flow); High.
- **Conditions:** A session reaches settled verifier evidence without an existing `SessionEffortTable` row. A normal default-standard session with no explicit variant can return from transition without calling `efforts.set`, making this path plausible.
- **Mechanism:** `effort/evidence.ts` constructs `next` with a computed `openFailure` and calls `deps.efforts.setOpenFailure`; `effort/store.ts#setOpenFailure` performs only `UPDATE ... WHERE session_id = ...`, unlike `set` which inserts/upserts. With no row, there is no row to receive the failure.
- **Source anchors:** `packages/core/src/effort/evidence.ts` (`EffortEvidence.observe`, absent-row `row?.` path); `packages/core/src/effort/store.ts` (`setOpenFailure`); `packages/core/src/effort/transition.ts` (default no-change return); `packages/core/test/effort/evidence.test.ts` (every case seeds state); `packages/core/test/session-runner.test.ts` (pre-seeded escalation scenarios).
- **Frequency / impact / affected workloads:** Unknown frequency. When triggered, failure escalation can be forgotten, changing later reasoning effort and potentially quality/cost/latency on verifier-guided tasks. No completed-task effect is measured.
- **Attribution:** Fork-specific effort path; no equivalent claim made about upstream.
- **Expected versus observed:** Expected by policy: failure opens escalation and persists for later transitions. Observed statically: update-only persistence after absent-row computation. Runtime observation absent.
- **Competing explanations:** Another path might always create a row in some deployments; a database trigger not found in inspected paths could alter semantics; intended policy might exclude such sessions. The ordinary default path and tests do not establish that invariant.
- **Evidence gaps:** No runtime reproduction, database row trace, or production failure report.
- **Evidence class / outcome strength:** `REPO-VERIFIED`; mechanism condition established, outcome `Undetermined`.

- **Domain / status:** D5; open static confirmed deficiency, high mechanism confidence, no observed production occurrence.
- **Workload / baseline / measurement contract:** Hypothesized relevance to W02/W05/W06 verifier-guided tasks. Baseline unavailable. Denominator for mechanism validation: eligible settled verifier results in sessions with no pre-existing effort row; observe persisted open failure and next selected variant. Outcome denominator: all started tasks, with acceptance, rework, cost, and latency measured under the main report §10.1 contract.
- **Relevant comparison:** Fork policy `policy.ts` defines expected escalation; Codex and DeepSeek expose explicit effort controls (E052/E069) but not an equivalent verifier-feedback implementation. No upstream fix is asserted.
- **Candidate directions / retain option:** Retain the seeded-session behavior (preserves working paths, leaves the boundary); configure/reuse an enforced state-initialization invariant if one is intended (small conceptual change, but currently unverified); targeted persistence/contract correction is a candidate; no known upstream/plugin drop-in; larger refactor is unjustified.
- **Boundary / dependencies / maintenance:** Crosses tool settlement, effort evidence, SQLite state, model transition, and cache-safe variant selection. Must preserve exact user selection and existing persisted-state compatibility. Test coverage relationship: F-06.
- **Success / validation / relationship:** Durable failure state for every eligible absent-row case, no unintended transitions, and no regression in W02/W05/W06 acceptance/cost/latency. Future method: §10 F-01 fixture. Independent correctness finding; outcome claims depend on F-05.

### F-02 — “Inert while empty” effort-policy contract is not enforced on all inspected paths

- **Classification / priority:** Confirmed documentation/code contract mismatch; Medium.
- **Conditions:** `effort_policy.verification_commands` is empty, with plan/base-level or delegation-relevant configuration.
- **Mechanism:** Schema documentation says the policy is inert while empty. `transition.ts` still computes base level, exact variant, open failure, and plan pinning without an obvious empty-verifier guard; `subagent.ts` calls `EffortDelegation.seed` for a new child without checking verifier configuration.
- **Source anchors:** `packages/schema/src/config/effort.ts` (`verification_commands` description); `packages/core/src/effort/transition.ts`; `packages/core/src/effort/adapter.ts#stateFor`; `packages/core/src/tool/plugin/subagent.ts`; `packages/core/src/effort/delegation.ts`; `docs/spec/effort-policy.md` and `docs/intent/effort-policy.md` (design context).
- **Frequency / impact / affected workloads:** Configuration-dependent and unmeasured. Can alter model effort/cost/latency even when a user expects no policy behavior; quality effect unknown.
- **Attribution:** Fork-specific policy and documentation.
- **Expected versus observed:** Documented expectation: no verifiers means inert. Observed statically: transition/delegation mechanisms remain reachable.
- **Competing explanations:** “Inert” may have been intended to describe only evidence-driven escalation, not base-level or plan/delegation policy; docs may be stale. That interpretation conflicts with the unqualified schema sentence and needs an explicit contract decision.
- **Evidence gaps:** No configuration-matrix execution; no product-owner clarification.
- **Evidence class / outcome strength:** `REPO-VERIFIED` + `DOCUMENTED`; contract mechanism established, outcome `Undetermined`.

- **Domain / status:** D4/D5; open confirmed contract mismatch, moderate product-semantics confidence pending intent clarification.
- **Workload / baseline / measurement contract:** Hypothesized relevance to W05/W06 and delegated W02/W03. Baseline unavailable. Denominator: runs with empty `verification_commands` across plan/general/delegation configurations; observe model variant transitions and user-visible effort. Task outcomes use accepted-task denominator, not transition count.
- **Relevant comparison:** Internal schema/spec is the controlling comparison; Codex/DeepSeek effort mechanisms demonstrate provider variability but do not settle this fork’s contract.
- **Candidate directions / retain option:** Retain behavior and narrow documentation if base/plan/delegation policy is intended (low runtime disruption, but changes user-facing meaning); configure/reuse existing adapter controls; targeted guard or clarified split contract are candidates; no upstream/plugin solution verified; larger refactor unjustified.
- **Boundary / dependencies / maintenance:** Schema documentation, config normalization, transition, delegation, model variants, and user expectations. Compatibility risk includes silently changing established effort/cost behavior if the contract is reinterpreted. Related to F-01 but semantically independent.
- **Success / validation / relationship:** Every empty/non-empty configuration matches an explicit approved contract with no surprise transitions; W05/W06 outcomes remain balanced. Future method: §10 configuration matrix. Contract decision is a prerequisite to judging some effort behavior, not a build plan.

### F-03 — Transcript tool overstates completeness relative to bounded indexing/read

- **Classification / priority:** Confirmed low-severity tool-contract deficiency; Low.
- **Conditions:** A model uses `session_search` on large messages/tool outputs and follows “read the complete message.”
- **Mechanism:** Search indexes bounded renderings and read returns at most 20,000 characters; per-tool rendering is capped at 4,000. Search wording calls the result complete, while read’s own description correctly says bounded.
- **Source anchors:** `packages/core/src/tool/plugin/session.ts` (`session_search`, `session_read` descriptions); `packages/core/src/session/transcript.ts` (render/read caps); `packages/core/src/database/fts.ts` (external-content FTS).
- **Frequency / impact / affected workloads:** Unknown; relevant to long-session recovery and retrieval from large outputs. Could cause omitted evidence or false confidence, but no quality regression is demonstrated.
- **Attribution:** Inspected fork path; equivalent current-upstream wording not established.
- **Expected versus observed:** Expected: tool fidelity description matches actual bounds. Observed: contradictory “complete” versus bounded contract.
- **Competing explanations:** “Complete” may mean complete bounded projection rather than raw event; retained full tool output remains available through its path. The tool wording does not communicate that distinction.
- **Evidence gaps:** No task-level retrieval evaluation or user complaints.
- **Evidence class / outcome strength:** `REPO-VERIFIED`; mechanism only, outcome `Undetermined`.

- **Domain / status:** D2; open low-severity confirmed tool-contract deficiency.
- **Workload / baseline / measurement contract:** Hypothesized relevance to W03/W04 oversized-output retrieval. Baseline unavailable. Denominator: oversized completed messages selected from search; measure raw-versus-indexed coverage, omitted spans, and task answers requiring omitted evidence.
- **Relevant comparison:** Internal `session_read` description is accurate; DeepSeek/Codex replay sources show the value of explicit projections but do not establish a better retrieval contract for this fork.
- **Candidate directions / retain option:** Retain bounded rendering (protects context and performance) and treat wording/fidelity disclosure as the candidate direction; configure/reuse retained artifact paths where available; enlarged bounds or semantic retrieval are not justified without measurements; larger refactor unjustified.
- **Boundary / dependencies / maintenance:** FTS projection, model-facing tool descriptions, retained files, and context budgets. Increasing bounds could worsen cost/relevance; changing wording is compatibility-low-risk but runtime impact remains unmeasured.
- **Success / validation / relationship:** Model-visible fidelity matches raw/projected content and W03/W04 retrieval tasks do not silently omit required evidence. Future method: §10 oversized-message fixture. Independent; outcome interpretation depends on F-05.

### F-04 — No in-tree OS sandbox/network-containment integration discovered

- **Classification / priority:** Architectural risk; High for untrusted or unattended autonomy, otherwise deployment-dependent.
- **Conditions:** Agent-executed commands/plugins operate with ambient user filesystem/process/network/credential access and no external containment.
- **Mechanism:** Permissions, command parsing, and hooks mediate requests, but they are not an OS-enforced boundary for arbitrary spawned code. Scoped source/document searches found no `seatbelt`, `bubblewrap`, `landlock`, `seccomp`, `SandboxType`, `network_access`, or `sandbox-exec` integration and no sandbox-related core source filenames.
- **Source anchors:** `packages/core/src/permission.ts`; `packages/core/src/tool/plugin/shell.ts`; `packages/core/src/config-hooks.ts`; scoped negative-search log in the evidence ledger. Comparison: Codex `codex-rs/sandboxing/src/manager.rs`; DeepSeek `packages/sandbox/sandbox-local/src/index.ts`.
- **Frequency / impact / affected workloads:** Exposure depends on autonomy, repository trust, credentials, and external runner. Potential impact includes unintended file/network/credential access; no incident or exploit was measured.
- **Attribution:** Repository capability finding, not proof about deployment. External VM/container/worktree controls can compensate for different risks; worktrees alone are not a security sandbox.
- **Expected versus observed:** Best-in-class untrusted execution combines approvals with OS containment and egress policy. Observed in tree: approval/permission controls without discovered native containment.
- **Competing explanations:** Deployment intentionally supplies a container/VM; product threat model trusts configured commands and project code; upstream-equivalent functionality could use different terminology outside the scoped search.
- **Evidence gaps:** Deployment manifests, runtime syscall/egress tests, threat model, and exhaustive whole-history search were not available/performed.
- **Evidence class / outcome strength:** `REPO-VERIFIED` scoped mechanism absence + `INFERRED` risk; outcome `Undetermined`.

- **Domain / status:** D7; open architectural risk with high scoped-negative-search confidence and unresolved deployment mitigation.
- **Workload / baseline / measurement contract:** Hypothesized relevance to all tool tasks, especially W08/W09; no observed incident. Baseline unavailable. Safety denominator: all started untrusted-task probes; count independently confirmed unauthorized filesystem/network/credential reaches and legitimate-task completion.
- **Relevant comparison:** Codex `sandboxing/src/manager.rs` (E055), DeepSeek `sandbox-local` (E068), and Claude containment docs (E046–E047). Windows DeepSeek ACL is explicitly partial, so peer presence is not absolute safety.
- **Candidate directions / retain option:** Retain repository behavior with verified external VM/container containment (strong isolation option, operational burden); configure existing permissions/hooks (useful but not equivalent containment); adopt a suitable plugin/OS facility or targeted containment addition only after threat-model evaluation; larger runtime replacement is unjustified and could harm Windows/provider compatibility.
- **Boundary / dependencies / maintenance:** Shell/PTY/plugins/MCP, filesystem aliases, network proxy scope, credentials, hosted tools, OS backends, approval UX, and external deployment. Ongoing platform security maintenance is substantial; worktrees alone do not mitigate hostile process reach.
- **Success / validation / relationship:** Zero unauthorized reaches in W09 probes with legitimate W08 work retained and explicit degraded/failure states. Future method: §10 consented disposable-environment probes. Cross-cutting security decision; external deployment evidence U-03 is a prerequisite to residual-risk judgment.

### F-05 — No accepted-task quality/cost/latency baseline for the fork

- **Classification / priority:** Measurement/observability gap; High.
- **Conditions:** Any claim that effort escalation, compaction, caching, subagents, or fork divergence improves completed work.
- **Mechanism:** Token categories, costs, logs, and OTLP exist, but no supplied dataset joins attempted tasks to tests/review acceptance, rework, total cost, and latency. Raw prior usage export is absent; no benchmark was run.
- **Source anchors:** `packages/core/src/session/usage.ts`; `packages/core/src/session/runner/llm.ts`; `packages/core/src/event-logger.ts`; `packages/util/src/observability/otlp.ts`; absence of supplied task/output corpus recorded in ledger.
- **Frequency / impact / affected workloads:** Affects all optimization and prioritization decisions. Activity metrics cannot identify waste, relevance, completed work, or compaction quality.
- **Attribution:** Evaluation/evidence gap, not proof of poor runtime outcomes.
- **Expected versus observed:** Expected for best-in-class engineering: accepted-task outcome with total attempts and rework. Observed: strong operational telemetry but no task outcome baseline supplied.
- **Competing explanations:** Private evaluation data may exist outside the audit; maintainers may intentionally rely on downstream evaluations. Neither was supplied.
- **Evidence gaps:** Representative tasks, raw usage, accepted patches, test results, review/rework, latency/cost distributions.
- **Evidence class / outcome strength:** `REPO-VERIFIED` substrate + `UNKNOWN` outcomes; measurement gap substantiated, performance effect `Undetermined`.

- **Domain / status:** D6/D8; open cross-cutting measurement/observability gap; high confidence in supplied-evidence absence.
- **Workload / baseline / measurement contract:** Affects W01–W09. Baseline itself unavailable. Required denominators and event boundaries are defined in the main report §10.2: accepted tasks, all started tasks, first attempts, injected failures, and total all-attempt cost; failed/aborted work cannot disappear.
- **Relevant comparison:** Claw-SWE-Bench controlled design (E082–E084), OpenHands replay/production evidence (E080–E081), and OTel conventions (E085). None supplies fork outcomes.
- **Candidate directions / retain option:** Retain existing operational telemetry (useful substrate, insufficient outcome evidence); reuse consented external evaluation or existing logs; adopt a benchmark/evaluation harness rather than inventing scores; targeted task-outcome attribution is O-04; a larger observability platform is not justified without user need.
- **Boundary / dependencies / maintenance:** Task identity across resume/retry/subagents/compaction, tests/review, provider costs, privacy/redaction, and human labeling. Maintaining task fixtures and judgment reliability is an ongoing cost.
- **Success / validation / relationship:** Complete denominator/missingness reporting and reproducible accepted-task quality/cost/latency distributions; no claim based solely on cache/request activity. Future approaches: §10 baseline and controlled comparisons. Cross-cutting prerequisite for causal prioritization, not proof of poor performance.

### F-06 — Release-assurance evidence does not directly cover the inspected `main` path, and key tests omit absent-row setup

- **Classification / priority:** Measurement/observability/assurance gap; Medium.
- **Conditions:** Relying on shown workflows/tests to certify `main` or the absent-row effort path.
- **Mechanism:** `check.yml` push/PR targets `dev`; `check-test.yml` push targets `dev` and `beta` (PR trigger shown without the same branch restriction). Unit tests run on Linux/Windows and affected-package selection exists, but no run result for pinned `main` was supplied. Effort evidence/recovery and relevant runner tests pre-seed effort rows.
- **Source anchors:** `.github/workflows/check.yml`; `.github/workflows/check-test.yml`; `packages/core/test/effort/evidence.test.ts`; `packages/core/test/effort/recovery.test.ts`; `packages/core/test/effort/store.test.ts`; `packages/core/test/session-runner.test.ts`.
- **Frequency / impact / affected workloads:** Assurance exposure on release/main and unseeded sessions. Does not prove `main` is broken or CI never runs through another route.
- **Attribution:** Fork workflow/test configuration at pinned revision.
- **Expected versus observed:** Expected: direct evidence for the released branch and boundary-state tests. Observed: branch triggers and seeded tests leave those specific assurance gaps.
- **Competing explanations:** External release CI, branch protection, or manual checks may exist; PRs into `main` may trigger tests; affected-package selection may be sufficient for ordinary changes.
- **Evidence gaps:** GitHub check runs, branch protection, release pipeline, and coverage reports were not inspected.
- **Evidence class / outcome strength:** `REPO-VERIFIED`; coverage condition only, defect/outcome `Undetermined`.

- **Domain / status:** D7/D8; open assurance/measurement gap; high confidence for shown workflow/test content, unknown external checks.
- **Workload / baseline / measurement contract:** Hypothesized relevance to all released workloads, particularly W07/W08 and unseeded W05/W06. Baseline unavailable. Denominators: pinned release revisions with verifiable check results; boundary tests covering absent state; report pass/fail and untested cells rather than test-file counts.
- **Relevant comparison:** DeepSeek’s broad test inventory is explicitly not pass-rate evidence (E070); fork unit/E2E workflow assets remain strengths.
- **Candidate directions / retain option:** Retain existing dev/beta workflows if external release assurance is demonstrated; configure/reuse current PR/manual workflows; targeted release provenance and boundary-case coverage are candidates; adopting a peer CI stack or larger rewrite has no demonstrated benefit.
- **Boundary / dependencies / maintenance:** GitHub checks, branch protection, affected-package selection, Windows runners, release process, and database/session setup. External CI could fully change the assessment.
- **Success / validation / relationship:** Traceable passing checks for the released SHA and explicit absent-row coverage, with failures visible. Future method: §10 assurance inspection/authorized isolated run. Independent assurance gap supporting F-01 detection.

### F-07 — Large overlapping fork/upstream changes create maintenance and compatibility exposure

- **Classification / priority:** Architectural risk; Medium.
- **Conditions:** Continued independent evolution in runner, compaction, model request, subagent, configuration, and session paths.
- **Mechanism:** Raw baseline/fork divergence and focused bidirectional diffs show substantial changes in the same active files. Current upstream and fork each add distinct behavior, increasing semantic merge burden beyond textual conflict counts.
- **Source anchors:** Revisions and diff statistics in §2; `runner/llm.ts`, `step.ts`, `compaction.ts`, `model-request.ts`, `subagent.ts`, `config/normalize.ts`, `session.ts`; upstream `CHANGELOG.md`.
- **Frequency / impact / affected workloads:** Recurs at upgrades; may increase regression, migration, and delayed-fix risk. Actual maintenance hours/defect rate not measured.
- **Attribution:** Fork lineage and current upstream comparison.
- **Expected versus observed:** Maintainable fork: clear differential ownership and compatibility evidence. Observed: valuable custom mechanisms interleaved with heavily shared active paths; no compatibility/equivalence matrix supplied.
- **Competing explanations:** Modular Effect boundaries and tests may make upgrades manageable; some diff mass is vendored/docs; upstream may later adopt equivalent behavior elsewhere.
- **Evidence gaps:** Upgrade history, conflict/rework measurements, plugin/session compatibility tests, and complete symbol-level parity analysis.
- **Evidence class / outcome strength:** `REPO-VERIFIED` + `UPSTREAM-VERIFIED`; architectural exposure, outcome `Undetermined`.

- **Domain / status:** D9 with cross-cutting D1–D8 effects; open architectural maintenance risk, not a runtime defect.
- **Workload / baseline / measurement contract:** Hypothesized relevance to all tasks and the user’s low-maintenance priority; no observed upgrade failure. Baseline unavailable. Denominator: upstream reconciliations/releases; measure human hours, semantic conflicts, compatibility regressions, and delayed fixes, not raw lines alone.
- **Relevant comparison:** Current upstream `1bf08ae…` focused source and changelog (E036–E039); fork-specific mechanisms (E020–E032) are counterevidence to wholesale replacement.
- **Candidate directions / retain option:** Retain valuable custom behavior (preserves differentiation, accepts merge burden); configure/reuse existing upstream features where equivalent; adopt selected upstream changes after compatibility analysis (O-02); targeted boundary/documentation reconciliation is a candidate; larger refactor/rewrite is unjustified without controlled accepted-task benefit and maintenance ownership.
- **Boundary / dependencies / maintenance:** Public session/config/plugin/provider contracts, SQLite migrations, cache/compaction semantics, Windows/TUI behavior, and tests. Raw diff mass includes non-runtime content and must not drive effort estimates.
- **Success / validation / relationship:** Lower measured reconciliation burden without losing fork behavior or accepted-task outcomes. Future method: historical upgrade study plus symbol-level compatibility matrix. Cross-cutting future decision; U-06 limits completeness.

### O-01 — Persist nested-fork cache lineage

- **Classification / priority / conditions:** Opportunity; Medium; nested forks with provider prompt caching.
- **Mechanism and anchors:** `session/model-request.ts` contains `TODO: Persist cache lineage so nested forks reuse the root session's cache key`; `session/affinity.ts` defines parent/fork affinity.
- **Frequency / impact / workloads:** Unknown; could affect cache reuse/cost/latency in nested forks, not task quality directly.
- **Attribution / expected versus observed:** Fork source explicitly identifies the limitation; current affinity exists but durable nested-root lineage is incomplete by the TODO.
- **Competing explanations / evidence gaps:** Provider cache behavior may make benefit negligible; existing affinity may suffice in common cases. No cache trace or controlled comparison.
- **Evidence / outcome:** `REPO-VERIFIED`; `Undetermined`. This is not counted as a defect.

- **Domain / status:** D6; open opportunity without demonstrated deficiency.
- **Workload / baseline / measurement contract:** Hypothesized W04 nested-fork/cache-heavy relevance. Baseline unavailable. Denominator: paired nested-fork tasks with equivalent warm/cold state; measure cache-key continuity, provider-reported hits, total accepted-task cost/latency, and quality.
- **Relevant comparison:** Codex ephemeral-fork cache routing (E054) is related but not proof of the same OpenCode semantics.
- **Candidate directions / retain option:** Retain current affinity (may be sufficient); configure/avoid nested forks when beneficial; upstream/plugin equivalence not verified; targeted durable lineage is the research candidate; larger cache rewrite unjustified.
- **Boundary / dependencies / maintenance:** Session identity/fork persistence, provider cache keys/TTLs, privacy/tenant scope, and exact-prefix stability. Cache reuse must not share inappropriate state.
- **Success / validation / relationship:** Improved or neutral task-total cost/latency with no acceptance/security regression; §10 cache-lineage fixture. Independent opportunity dependent on F-05 for outcome evaluation.

### O-02 — Reconcile newer upstream context-window and provider-error mechanisms

- **Classification / priority / conditions:** Opportunity; Medium; large contexts and provider-specific overflow/throttling.
- **Mechanism and anchors:** Current upstream `compaction.ts`, `model-request.ts`, and `runner/llm.ts` contain percentage buffers, measured/provider-reported sizing differences, 1% primary-request headroom, tracing/idle-hook changes; upstream changelog mentions LiteLLM context errors and throttling classification.
- **Frequency / impact / workloads:** Unknown; potentially long sessions and affected providers.
- **Attribution / expected versus observed:** `UPSTREAM-VERIFIED`; fork has its own cache-conscious compaction and telemetry. Missing at one path does not establish missing everywhere or better outcomes.
- **Competing explanations / evidence gaps:** Fork behavior may already be adequate or superior for its providers; upstream changes may regress fork invariants. No shared-workload comparison.
- **Evidence / outcome:** `UPSTREAM-VERIFIED` mechanism lead; local effect `Undetermined`.

- **Domain / status:** D2/D3/D6/D7; open reconciliation opportunity, not a proven fork defect.
- **Workload / baseline / measurement contract:** Hypothesized W04/W07 relevance for long contexts and provider errors. Baseline unavailable. Denominator: paired overflow/throttling/long-context fixtures; measure correct classification, recovery, accepted tasks, total cost, and latency.
- **Relevant comparison:** Current upstream pinned source/changelog E036–E039; fork telemetry and cache behavior are strengths to preserve.
- **Candidate directions / retain option:** Retain fork behavior where equivalent or better; configure existing buffers; adopt selected upstream mechanisms only after semantic comparison; targeted reconciliation is a candidate; wholesale upstream replacement or larger refactor is unjustified.
- **Boundary / dependencies / maintenance:** Provider token reporting/error formats, model context/output limits, compaction replay, cache prefixes, tracing, and future merges. Upstream changes may conflict with fork invariants.
- **Success / validation / relationship:** Correct provider-error handling and equal/better W04/W07 accepted outcomes without fork regressions; §10 side-by-side fixtures. Candidate future decision dependent on U-06 and F-05.

### O-03 — Use repository-state outcome extraction in future controlled comparisons

- **Classification / priority / conditions:** Opportunity; Medium; any fork benchmark or adapter comparison.
- **Mechanism and anchors:** Claw-SWE-Bench collects candidate patches from repository Git state and reports a large bare-versus-full adapter difference under fixed conditions; see external paper sections on orchestration and patch collection.
- **Frequency / impact / workloads:** Evaluation only; prevents final-message diff formatting from confounding harness quality.
- **Attribution / expected versus observed:** External measured design, not a claim that fork production patch handling is defective.
- **Competing explanations / evidence gaps:** Some tasks require non-Git artifacts; benchmark extraction can differ from production UX. No local benchmark exists.
- **Evidence / outcome:** External `MEASURED` / `Controlled effect` for that evaluation design; fork effect `Undetermined`.

- **Domain / status:** D8; open evaluation-design opportunity without a production deficiency claim.
- **Workload / baseline / measurement contract:** Applies to W01–W09 comparisons. No fork benchmark baseline. Denominator: all started benchmark tasks; separately report patch-apply failures, tested acceptance, censored runs, cost, and duration.
- **Relevant comparison:** Claw-SWE-Bench shared orchestration/Git-state extraction and controlled adapter result (E082–E083).
- **Candidate directions / retain option:** Retain production interaction unchanged; reuse an existing evaluation harness; adopt external orchestration only subject to license/task fit; targeted evaluation adapter is a candidate; larger production refactor based on benchmark convenience is unjustified.
- **Boundary / dependencies / maintenance:** Git repository state, non-Git artifacts, test images, model/provider adapters, task contamination, and benchmark/version maintenance. Benchmark extraction may not match user-facing behavior.
- **Success / validation / relationship:** Apply-format failures no longer confound tested task quality and repeated-run uncertainty is visible; future controlled comparison in main §11. Independent evaluation opportunity supporting F-05.

### O-04 — Join operational traces to accepted-task outcomes

- **Classification / priority / conditions:** Opportunity; High; all optimization decisions.
- **Mechanism and anchors:** Existing `session/usage.ts`, runner telemetry, event logger, and OTLP substrate could be evaluated alongside task identity, tests/review, rework, and total cost. OpenTelemetry GenAI conventions cover agent/workflow/tool spans but not business acceptance by themselves.
- **Frequency / impact / workloads:** Cross-cutting; would make F-05 measurable without assuming more telemetry alone improves outcomes.
- **Attribution / expected versus observed:** Measurement opportunity built on existing fork strength; not an assertion that tracing is absent.
- **Competing explanations / evidence gaps:** External evaluation may already join these data privately; sensitive content must remain opt-in/redacted. No supplied schema or results.
- **Evidence / outcome:** `REPO-VERIFIED` substrate + `DOCUMENTED` conventions; local outcome `Undetermined`.

- **Domain / status:** D6/D8; open high-priority measurement opportunity without demonstrated runtime deficiency.
- **Workload / baseline / measurement contract:** Applies to W01–W09. Baseline unavailable. Denominator and event boundaries follow main §10.2; measure join completeness/missingness first, then accepted quality, rework, cost, latency, interventions, and safety.
- **Relevant comparison:** OTel GenAI conventions E085 and tool-evaluation guidance E078; fork usage/OTLP substrate E030–E032 already exists.
- **Candidate directions / retain option:** Retain traces and join them in an external consented analysis; configure existing OTLP; adopt relevant open semantic conventions; targeted task-outcome linkage is a candidate; a larger telemetry platform is not justified by this audit.
- **Boundary / dependencies / maintenance:** Task/session/request/tool/model/provider identity, resumed/child attempts, review labels, sensitive-content opt-in/redaction, retention, and schema evolution. More spans alone do not establish value.
- **Success / validation / relationship:** Complete reproducible task ledger including failures/rework and explicit missing data, enabling the main §11 comparisons. Cross-cutting candidate addressing F-05; no implementation sequence implied.

## 6. Root-cause hypotheses and competing explanations

| Finding | Leading hypothesis | Competing explanation | What would discriminate |
|---|---|---|---|
| F-01 | Upsert was used for initial state but update-only methods were reused for evidence without enforcing row existence | Hidden invariant always seeds rows | Trace a default-standard session with no row through verifier settlement and inspect row count/state |
| F-02 | “Inert” originally meant escalation-only, then schema wording broadened; or guard omitted during integration | Product intentionally wants base/plan/delegation policy without verifiers | Configuration contract decision plus config-matrix behavior |
| F-03 | Search description predated bounded rendering/read limits | “Complete” intentionally means complete projected message | Compare raw event, indexed rendering, and read result for an oversized message |
| F-04 | Fork prioritizes provider/UX features and relies on user environment for containment | External isolation is the intended security boundary | Inspect deployment and execute consented syscall/filesystem/egress probes outside target checkout |
| F-05 | Operational telemetry preceded product-level evaluation | Private/downstream evaluation exists | Obtain anonymized task outcomes and join keys; otherwise absence remains for supplied evidence |
| F-06 | Development moved to `dev`, leaving release assurance indirect; tests seed for convenience | External CI/branch protection covers release; unseeded state impossible by contract | Inspect checks and execute the absent-row boundary in an isolated copy |
| F-07 | Feature velocity and upstream growth outpaced differential boundary documentation | Effect modularity and focused tests adequately contain merge burden | Measure historical upgrade conflicts/regressions and build a symbol-level compatibility matrix |

## 7. Protected invariants and strengths to preserve

- One logical step per explicit `llm.stream` call, continuing from reloaded history rather than an in-memory tool loop.
- Durable inbox admission, execution claims, terminal settlement, and shutdown/restart continuity.
- Stale-tool/compaction settlement, bounded output-limit continuation, retry caps/backoff/jitter, and provider `retryAfter` handling.
- Stable-to-variable instruction ordering and cache-conscious model/effort switching.
- Separate uncached input, output, reasoning, cache-read, and cache-write accounting; endpoint-cost precedence.
- Automatic/manual/overflow/native/background compaction, retained earlier events, and structured-summary validation.
- Permission default `ask`, configured deny precedence, external-directory authorization, pre-spawn directory revalidation, and typed denial/correction behavior.
- Bounded model-visible tool output with retained full artifacts.
- Subagent model/permission/ownership/depth validation and completion notification.
- Native and hosted DeepSeek thinking/effort support and provider-specific serialization.
- Optional provider-quota display with credential-scoped caching, coalescing, timeouts, and stale/error states.
- Existing Effect service boundaries, public session controls, plugin/MCP/skills compatibility, and OTLP support.

These are mechanism strengths verified statically. Preserving them does not imply each has a measured positive task-level effect.

## 8. Apparent gaps ruled out or narrowed by inspection

| Apparent gap | Inspection result |
|---|---|
| “No compaction” | False: automatic, manual, overflow, native, and background/precomputed paths exist. |
| “No transcript search” | False: SQLite FTS5, triggers, search, and bounded read exist; only fidelity wording/scope is at issue. |
| “No subagents/background execution” | False: permission, depth, ownership, continuation, background, and notification mechanisms exist. |
| “No retries/recovery” | False: durable claims, stale settlement, backoff/jitter, retry caps, output continuation, and recovery paths exist. |
| “No DeepSeek support” | False: native and multiple hosted DeepSeek protocol mappings and tests exist. |
| “No OpenTelemetry” | False: OTLP support exists; the actual gap is accepted-task attribution. |
| “No cost/token telemetry” | False: detailed usage categories and endpoint-cost precedence exist; task-level economics remain absent. |
| “Direct model event publication is inherently a defect” | Not supported: projection path exists and transition has its own no-change guard; design-document preference for `Session.switchModel` alone does not prove malfunction. |
| “High cache rate proves efficiency” | Ruled out logically and by external controlled results showing quality/cost/latency tradeoffs. |
| “Growing context proves a compaction bug” | Unsupported without request histories, task difficulty, compaction traces, and outcomes. |
| “Current upstream is strictly better” | False as a general inference: fork-only telemetry/effort/provider behavior and upstream changes overlap with tradeoffs. |
| “DeepSeek Harness is production-ready because it has many tests” | False: official developer-preview and unaudited-security warnings are explicit; test-file count is not pass rate. |

## 9. Prioritized research findings (not an implementation plan)

1. **F-01 / High:** static absent-row persistence defect directly threatens the intended verifier-to-effort feedback path.
2. **F-05 and O-04 / High:** absence of accepted-task evidence blocks defensible claims about every quality/cost optimization.
3. **F-04 / High in untrusted autonomy:** containment must be evaluated at repository-plus-deployment level, not inferred from approvals.
4. **F-02 / Medium:** documented inertness and reachable policy behavior require a contract clarification before interpreting effort behavior.
5. **F-07 and O-02 / Medium:** upstream divergence is a semantic compatibility question; neither copying nor rewriting is evidence-justified yet.
6. **F-06 / Medium:** release and boundary-state assurance evidence is incomplete for the pinned target.
7. **O-01/O-03 / Medium/Low depending on evaluation goals:** cache lineage and benchmark output contracts are testable opportunities, not proven defects.
8. **F-03 / Low:** transcript wording is concrete but has no demonstrated task-level impact.

No major rewrite is justified by this audit. A rewrite would require controlled evidence of substantial accepted-task benefit, explicit configuration/session/plugin/provider compatibility analysis, migration and rollback evidence, and an ongoing maintenance owner. None of that evidence was supplied.

## 10. Future validation approaches

These are experimental designs for later authorization, not steps performed here:

| Question | Isolated validation design | Evidence that would resolve it |
|---|---|---|
| F-01 persistence | Disposable fixture/copy; create an unseeded default-standard session; settle synthetic verifier failure; inspect state and next transition | Durable open failure and escalation, or a proven seeding invariant |
| F-02 semantics | Configuration matrix crossing empty/non-empty verifiers, plan/general agents, delegation, exact variants | Observed transitions compared with an explicit approved contract |
| F-03 fidelity | Oversized synthetic message/tool output; compare raw event, FTS row, search snippet, and read result | Exact bounds and loss locations; corrected expectation |
| F-04 containment | Consented disposable VM/container; benign file, process, symlink/hardlink, and network probes under each deployment mode | Actual allowed/denied reach and failure behavior; no secrets or external targets |
| Compaction quality | Fixed tasks/models; controlled long histories; compare accepted tests, retrieval accuracy, tokens, cost, latency, and replay | Task-level distributions, not summary impressions |
| DeepSeek/harness value | Fixed DeepSeek model/provider settings and tasks across harnesses; common outer budget and Git-state patch extraction | Accepted-task quality/cost/latency with adapter/version metadata |
| Cache lineage | Nested-child/fork fixtures with stable prefixes; provider-reported cache traces | Cache-key continuity and task-total cost/latency differences |
| Upstream opportunities | Side-by-side isolated pinned builds on identical overflow/throttling/long-context fixtures | Mechanism behavior plus accepted-task outcomes; compatibility regressions |
| F-06 assurance | Inspect external checks/branch protection and run authorized isolated tests on the pinned revision | Actual check provenance and boundary coverage |
| Prior usage hypotheses | Obtain redacted raw export with task IDs and outcomes; recompute from raw records | Reproducible distributions with failed attempts/rework included |

## 11. Open questions and blocked areas

| ID | Unknown / blocker | Why it matters |
|---|---|---|
| U-01 | Raw 2026-11-02 usage export unavailable | Prior request/context/cache figures remain not independently reproduced |
| U-02 | No dynamic reproduction of F-01/F-02/F-03 | Static reachability and impact remain distinct from observed production behavior |
| U-03 | External deployment containment unknown | Determines whether F-04 is mitigated outside the repository |
| U-04 | No fixed-model DeepSeek/fork/upstream task comparison | Cannot rank quality, cost, latency, or effort policy benefit |
| U-05 | Windows/Bun/runtime behavior not exercised | Historical symlink and quota-blocked smoke notes remain unresolved |
| U-06 | Full current-upstream functional equivalence not established | Focused path differences cannot support a complete parity or rewrite decision |

Additional questions: What is the intended meaning of “inert”? Which session/config/plugin formats are compatibility contracts? Which tasks represent real use? Are private evaluation or release checks available? What maintenance budget is acceptable for fork-specific mechanisms?

## 12. Read-only verification statement

The target repository was inspected without modification. No source, tests, docs, settings, dependency locks, generated assets, Git state, remotes, branches, commits, issues, or pull requests were changed. No formatter, fixer, package installer, or untrusted project script was run. No credentials or private operational traces were accessed. No implementation or implementation plan was made. All three deliverables were written outside the repository under `/mnt/agents/output/`.
