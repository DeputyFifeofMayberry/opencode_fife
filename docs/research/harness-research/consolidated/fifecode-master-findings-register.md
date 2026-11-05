# FiFeCode master findings register

**Date:** 2026-11-03  
**Target:** `deputyfifeofmayberry/opencode_fife@07bae7483b6a7983bae2008407683097235e06c5` (`main`)  
**Pinned upstream comparator:** `anomalyco/opencode@1bf08ae46a91f7793c756e4ee521e37b6b554064` (`dev` research baseline)  
**Companions:** [Consolidated research](fifecode-consolidated-research.md) · [Reconciliation ledger](fifecode-research-reconciliation-ledger.md)

## 1. Register rules and totals

This register consolidates **118 original findings/claims** into **40 stable findings**. Original-unit dispositions are **13 confirmed, 90 merged, 13 unresolved, 2 contradicted, and 0 superseded**. “Confirmed” is a disposition for a scoped source/document observation; it does not mean a live failure or measured task benefit. The evidence label independently says **Verified**, **Supported**, **Plausible**, or **Unresolved**. Contradicted original claims are retained only as corrected consolidated findings.

Source prefixes are **A** = ChatGPT, **B** = DeepSeek, and **C** = Kimi. Unnumbered source units receive analyst IDs in the ledger. Exact original-ID mappings and source excerpts are in the [crosswalk](fifecode-research-reconciliation-ledger.md#6-original-to-consolidated-crosswalk). All fork code references below refer to the target SHA unless explicitly marked upstream.

Priorities reflect accepted-task value, failure likelihood/severity, evidence, workflow relevance, maintenance, and compatibility. They are not weighted scores or an implementation sequence. “Candidate directions” are research options, including retention of current behavior, not authorized work.

## 2. Planning-facing shortlist and deferred groups

**High decision priority:** FIFE-001 (static correctness defect) and FIFE-018 (accepted-task evidence contract).  
**High only when the condition applies:** FIFE-002 (background verifier use) and FIFE-009 (untrusted/unattended autonomy without external containment).  
**Medium:** FIFE-003–FIFE-007, FIFE-012, FIFE-014–FIFE-015, FIFE-017, and FIFE-020.  
**Medium opportunities requiring controlled value evidence:** FIFE-019, FIFE-025, and FIFE-026.  
**Low or evidence-dependent:** FIFE-008, FIFE-013, FIFE-016, FIFE-021–FIFE-024, FIFE-037, and FIFE-039–FIFE-040.  
**Protect as strengths or comparators:** FIFE-027–FIFE-036 and FIFE-038, subject to each entry’s qualification.

**Deferred:** repository maps, selective memory/re-injection, skill overhead, routing, nested-fork lineage, broader hook events, and additional peer audits lack demonstrated accepted-task benefit.  
**Rejected as stated:** absence of DeepSeek handling; mandatory `Session.switchModel` use as proof of correctness; high cache ratio as task efficiency; rising context as proof of compaction failure; test-file count as production maturity; peer feature presence as a transferable effect estimate.

## 3. Detailed findings

### FIFE-001 — Absent-row verifier evidence is not persisted

- **Domain / class / priority / disposition:** D1/D5/D8; confirmed static deficiency; **High**; **Retain/investigate runtime prevalence**.
- **Original sources / comparison:** A `GAP-001`, `H-01`; C `F-01`, part of `U-02`. Agreement on mechanism; terminology differs on “probable” versus “static confirmed.”
- **Evidence / status / confidence:** **Verified** source path; high mechanism confidence, unknown frequency and accepted-task effect. No live reproduction.
- **Behavior and code:** `effort/transition.ts` can return at `target === variant` without `efforts.set` for an unseeded default-standard session. `effort/evidence.ts` computes `next` even when `get` returns no row, then calls `setOpenFailure`. `effort/store.ts` makes `set` an upsert but `setOpenFailure` and `bumpRevision` update-only. `test/effort/evidence.test.ts` seeds every verifier case.
- **Current/upstream status:** Fork-specific effort path at target SHA. No upstream fix is asserted; upstream does not own this fork policy.
- **Root cause / competing explanations:** Missing enforced initialization invariant or update-only persistence reused at an absent-row boundary. Another uninspected seeder, a database trigger, local changes, or non-default initial effort could prevent a particular deployment from reaching it.
- **Practical consequence:** A configured verifier failure may not open durable escalation, altering later reasoning effort and potentially quality/cost/latency on build-debug-verify work. No completed-task effect is measured.
- **Candidate directions / tradeoffs:** Retain if a runtime seeding invariant is proven; consistent state ownership or absent-row-tolerant persistence are candidates. Consider write amplification, migration/concurrency semantics, model switches, and exact manual selections. A broad router refactor is unrelated.
- **Benefit evidence required:** Fresh unseeded default-standard fixture with multiple real effort variants; failed then passed verifier; row, event, and selected-variant observations; representative task acceptance/cost/latency only after mechanism correctness is established.

### FIFE-002 — Background verifier completion can bypass effort evidence

- **Domain / class / priority / disposition:** D1/D4/D5; probable integration deficiency; **Medium–High when background verifiers are used**; **Retain/investigate**.
- **Original sources / comparison:** A `GAP-002`, `H-02`; C `U-02` runtime limitation. Unique ChatGPT discovery, preserved rather than discarded.
- **Evidence / status / confidence:** **Supported**; high confidence in the event-path difference, medium in unconditional signal loss because all subscribers were not enumerated.
- **Behavior and code:** `tool/plugin/shell.ts` explicit/automatic background execution returns `status: "running"` without final exit and later uses `sessions.synthetic(...)`. `session/runner/step.ts` publishes initial durable tool settlement before `EffortEvidence.observe`; `effort/evidence.ts` needs a numeric exit. No final observer call is visible in the inspected notification path.
- **Current/upstream status:** Inspected fork integration; no upstream ownership or fix established.
- **Root cause / competing explanations:** Split ownership between initial tool settlement and delayed job notification. Another synthetic-event consumer could forward completion; cancellation and session closure may intentionally change semantics.
- **Practical consequence:** A backgrounded build/test may fail to open or clear effort escalation. Frequency depends on actual automatic-background thresholds and user commands.
- **Candidate directions / tradeoffs:** Retain if background verifiers are out of scope; existing durable job status or an explicit terminal observation are candidates. Avoid duplicate/replayed observations, late-state corruption, and cross-session leakage.
- **Benefit evidence required:** Foreground/background matrix with pass/fail/cancel and same-verifier recovery; final job outcome, effort row, durable events, and next variant; accepted-task evaluation only after event correctness is measured.

### FIFE-003 — Empty-verifier “inert” contract is not enforced on all inspected paths

- **Domain / class / priority / disposition:** D4/D5; confirmed contract mismatch; **Medium**; **Retain pending contract decision**.
- **Original sources / comparison:** C `F-02`, part of `U-02`. Unique Kimi discovery.
- **Evidence / status / confidence:** **Verified** code/documentation mismatch; moderate confidence about intended product semantics, unknown runtime impact.
- **Behavior and code:** `packages/schema/src/config/effort.ts` says “The policy is inert while empty.” `effort/transition.ts` still computes base/plan/exact behavior without an obvious empty-verifier guard; `tool/plugin/subagent.ts` calls `effort/delegation.ts` seeding without such a guard.
- **Current/upstream status:** Fork-specific schema and integration at target SHA.
- **Root cause / competing explanations:** “Inert” may mean only evidence-driven escalation, or a guard was omitted during expansion to base/plan/delegation behavior. Documentation may be stale.
- **Practical consequence:** Users could observe effort/cost changes with no verifiers despite an unqualified contrary description; accepted-task quality effect unknown.
- **Candidate directions / tradeoffs:** Retain behavior and narrow the contract if non-verifier policy is intended, or evaluate an explicit guard/split contract. Changing either behavior or wording affects compatibility and user expectations.
- **Benefit evidence required:** Product-contract decision plus configuration matrix over empty/non-empty verifiers, plan/general/delegation, and exact variants; no transition count should be treated as task benefit.

### FIFE-004 — Logical revision excludes shell mutations by default

- **Domain / class / priority / disposition:** D1/D5/D7; architectural correctness risk; **Medium**; **Retain/investigate**.
- **Original sources / comparison:** A `GAP-005`, `H-03`. Unique ChatGPT finding.
- **Evidence / status / confidence:** **Verified** configuration-bound mechanism; **Plausible** stale-pass consequence; medium overall confidence.
- **Behavior and code:** `effort/evidence.ts` defaults `mutating_tools` to `write`, `edit`, `patch` and calls update-only `bumpRevision`; `effort/policy/policy.ts` clears only for same verifier, later sequence, and not-older revision. Shell and external edits need not advance this logical counter.
- **Current/upstream status:** Fork policy, configurable; not an authoritative Git/worktree revision. No upstream equivalent asserted.
- **Root cause / competing explanations:** Lightweight tool-settlement surrogate chosen over filesystem tracking. Sequence ordering or intended semantics may be sufficient; unchanged counter alone does not prove an unsafe clear.
- **Practical consequence:** A pass could be evaluated against a different filesystem state without the logical revision recording that difference in shell-heavy workflows. No incident observed.
- **Candidate directions / tradeoffs:** Retain simple counter, configure classifications, or evaluate narrower worktree evidence. Broad hashing/watchers add latency, complexity, and Windows/filesystem risk.
- **Benefit evidence required:** Controlled shell-edit/dedicated-edit interleavings with independent filesystem snapshots and stale-pass cases; first define the desired ordering invariant and actual shell-mutation frequency.

### FIFE-005 — Verifier identity omits working directory

- **Domain / class / priority / disposition:** D1/D5; known conditional limitation; **Medium–Low**; **Retain**.
- **Original sources / comparison:** B `GAP-008`; corroborated by source comments identified in all-package evidence. Unique numbered DeepSeek finding.
- **Evidence / status / confidence:** **Verified**; high mechanism confidence, unknown workload frequency.
- **Behavior and code:** `effort/evidence.ts` verifier identity uses tool/normalized command without cwd; the intent document proposed cwd, while the source comments acknowledge the v1 deviation.
- **Current/upstream status:** Fork-specific known limitation at target SHA; no upstream owner.
- **Root cause / competing explanations:** Deliberate v1 simplification. Commands may be workspace-unique in actual use, reducing practical effect.
- **Practical consequence:** Same command in different packages/directories may conflate failure and pass state, relevant to monorepos and SSH workflows.
- **Candidate directions / tradeoffs:** Retain scoped identity or evaluate cwd/workspace identity. Added identity changes persisted state, migration, and intended cross-directory clearing semantics.
- **Benefit evidence required:** Multi-directory pass/fail fixtures and real command distribution; measure incorrect clear/retain episodes before asserting task impact.

### FIFE-006 — Effort escalation has no policy-level cap/decay and its benefit is unproven

- **Domain / class / priority / disposition:** D5/D6/D8; architectural risk plus measurement gap; **Medium**; **Retain/investigate**.
- **Original sources / comparison:** B `X-03`, `GAP-002`, `H-02`; related A accepted-task concerns and C effort comparisons. Partial agreement; no model proves benefit.
- **Evidence / status / confidence:** **Verified** pure-policy mechanism; **Unresolved** quality/cost benefit.
- **Behavior and code:** `effort/policy/policy.ts` opens one-level escalation and clears only on same-verifier, later-sequence, not-older-revision pass. No cap, decay, or stopping rule appears in this pure policy for a verifier that never passes. `adapter.ts` maps levels to real variants.
- **Current/upstream status:** Fork-specific; external runner/session budgets may impose bounds not established here.
- **Root cause / competing explanations:** Assumption that more reasoning helps resolve failures; persistent escalation may instead be intentional for an unresolved task. External caps could exist outside the pure policy.
- **Practical consequence:** Potential higher cost/latency without accepted-task gain; conversely, escalation could help difficult debugging. Neither direction is measured.
- **Candidate directions / tradeoffs:** Retain, bound, decay, or make policy opt-in are research options. Caps could prematurely reduce quality; no numerical benefit or threshold is inferred.
- **Benefit evidence required:** Paired same-model tasks with policy/no-policy, complete failure/rework costs, time to acceptance, cache state, and unresolved-verifier cases; report inconclusive results.

### FIFE-007 — FileStamp protection is process-local and non-atomic

- **Domain / class / priority / disposition:** D3/D7; confirmed implementation limitation; **Medium**; **Retain with bounded scope**.
- **Original sources / comparison:** B `X-05`, `GAP-003`, `OPP-004`, `S-04`. Unique DeepSeek risk finding; also protected as a strength.
- **Evidence / status / confidence:** **Verified**; high mechanism confidence, actual restart/race frequency unknown.
- **Behavior and code:** `file-stamp.ts` uses a process-local `Map` keyed by session/absolute path, records mtime/size/SHA-256, returns true when no stamp exists, and performs a check separate from the later write.
- **Current/upstream status:** Inspected fork guard; ancestry and any newer upstream equivalent not fully reconstructed.
- **Root cause / competing explanations:** Lightweight stale-edit guard rather than durable compare-and-swap. Short sessions or exclusive editing may make the limitation acceptable.
- **Practical consequence:** External changes after restart or between check/write can evade the intended protection. No overwrite incident was observed.
- **Candidate directions / tradeoffs:** Retain, require fresh reads, durable stamps, or atomic semantics are candidates. Durability/hashing adds storage, migration, large-file cost, and cross-process complexity.
- **Benefit evidence required:** Authorized restart and concurrent-writer fixtures measuring prevented/incorrect overwrites, false positives, and task completion; actual session/restart frequency determines value.

### FIFE-008 — Transcript “complete” wording exceeds bounded read fidelity

- **Domain / class / priority / disposition:** D2/D4; confirmed low-severity tool-contract deficiency; **Low**; **Retain**.
- **Original sources / comparison:** C `F-03`, `R-02`, part of `U-02`. Unique Kimi finding.
- **Evidence / status / confidence:** **Verified** wording/bounds; unknown task impact.
- **Behavior and code:** `tool/plugin/session.ts` search says to read the “complete message”; `session/transcript.ts` stores bounded renderings (`MESSAGE_MAX_CHARS = 20_000`, `TOOL_OUTPUT_MAX_CHARS = 4_000`) and `read` truncates to 20,000. `session_read` separately discloses its bound.
- **Current/upstream status:** Confirmed at fork target; equivalent upstream wording not established.
- **Root cause / competing explanations:** Search description may predate bounded rendering, or “complete” means the complete bounded projection. Full retained artifacts may remain accessible through returned paths.
- **Practical consequence:** A model could omit needed evidence while believing retrieval complete, especially in oversized-output recovery; no quality regression demonstrated.
- **Candidate directions / tradeoffs:** Retain bounded projection and evaluate clearer fidelity disclosure/artifact references. Larger bounds or semantic retrieval could worsen context cost without improving relevance.
- **Benefit evidence required:** Oversized-message fixture comparing raw event, indexed text, search snippet, read result, and task answers requiring omitted spans.

### FIFE-009 — Permission controls are not OS containment

- **Domain / class / priority / disposition:** D7; deployment-dependent architectural risk; **High for untrusted/unattended autonomy without external isolation**; **Investigate**.
- **Original sources / comparison:** C `F-04`, `U-03`; B D7 narrative. Agreement that permissions exist; severity and negative-search strength differ.
- **Evidence / status / confidence:** **Supported** conceptual boundary and scoped source result; **Unresolved** exhaustive absence and deployment mitigation. No exploit or incident.
- **Behavior and code:** `permission.ts` evaluates rules/approvals; `shell.ts` and `config-hooks.ts` mediate execution. Scoped research found no native Seatbelt/Landlock/seccomp/network-containment integration. GitHub negative searches were incomplete and are not absence proof.
- **Current/upstream status:** Repository finding only. External VM/container/runner controls unknown; peer Codex/DeepSeek mechanisms do not describe this deployment.
- **Root cause / competing explanations:** Product may trust configured code and rely on external isolation; different terminology or uninspected paths could exist.
- **Practical consequence:** Spawned code may retain ambient filesystem/process/network/credential reach. Residual risk depends on trust, autonomy, secrets, and deployment.
- **Candidate directions / tradeoffs:** Verified external containment, existing approvals, or a suitable OS/plugin boundary are options. Native cross-platform containment has substantial security, UX, Windows, and maintenance cost; worktrees alone are insufficient.
- **Benefit evidence required:** Deployment/threat-model inspection and consented benign filesystem/process/link/network probes in disposable environments; measure unauthorized reach and legitimate-task completion.

### FIFE-010 — Config hooks are trusted code with sensitive-input exposure

- **Domain / class / priority / disposition:** D4/D7; confirmed trust-boundary risk; **Medium**; **Retain/investigate before broader adoption**.
- **Original sources / comparison:** B `GAP-009`, `H-05`, part of `OPP-002`; supported by A/C hook analysis. Unique numbered DeepSeek security finding.
- **Evidence / status / confidence:** **Verified** execution semantics; practical incident risk unresolved.
- **Behavior and code:** `config-hooks.ts` runs configured shell commands with inherited environment and tool input; exit 2 denies, 49 halts, other failures non-block; 60-second timeout and bounded stdout/stderr. It implements `PreToolUse`, not an OS sandbox or secret-redaction boundary.
- **Current/upstream status:** Inspected fork mechanism; user configuration ownership is central.
- **Root cause / competing explanations:** Power-user trusted-configuration design. A user-controlled hook can be intentional and safe in a trusted environment; “user-controlled” alone does not prove safe handling of secrets or prompt-influenced input.
- **Practical consequence:** Hooks can read sensitive tool input and act with ambient permissions; malicious or buggy configuration expands blast radius.
- **Candidate directions / tradeoffs:** Explicit trust documentation, existing permission controls, redaction/allowlist research. Redaction can leak or corrupt data and must not create a false sandbox claim.
- **Benefit evidence required:** Threat model and representative sensitive-input/failure fixtures; actual hook configuration and credential exposure determine severity.

### FIFE-011 — Hook lifecycle coverage is narrower than peer surfaces

- **Domain / class / priority / disposition:** D4/D7/D9; verified subset and optional opportunity; **Medium–Low**; **Defer absent a demonstrated workflow need**.
- **Original sources / comparison:** B `X-04`, `GAP-004`, part of `OPP-002`; A/C peer hook comparisons. Agreement on narrow config-hook surface, not on need to expand.
- **Evidence / status / confidence:** **Verified** for `PreToolUse` implementation; broader plugin hooks exist and must not be conflated with config-hook parity. Benefit **Unresolved**.
- **Behavior and code:** `config-hooks.ts` implements `PreToolUse`; other lifecycle events such as `PostToolUse`, `Stop`, `SessionStart`, or `PreCompact` were not verified in that config mechanism. Plugin hooks are a separate existing extension surface.
- **Current/upstream status:** Fork-specific config integration atop inherited plugin architecture; peer Claude/Codex lifecycle breadth is contextual, not a requirements specification.
- **Root cause / competing explanations:** Incremental implementation and deliberate scope control. Existing plugin events may already serve some needs.
- **Practical consequence:** Certain audit/policy workflows cannot use the same config-hook event surface; no accepted-task deficiency is shown.
- **Candidate directions / tradeoffs:** Retain current scope, reuse plugin hooks, or evaluate selected lifecycle events. Expansion increases arbitrary-code security surface, compatibility expectations, test burden, and maintenance.
- **Benefit evidence required:** A concrete user workflow that existing hooks cannot express, plus parity/failure-mode tests and accepted-task or operator-value measurement.

### FIFE-012 — Release assurance does not directly establish the inspected `main` boundary cases

- **Domain / class / priority / disposition:** D7/D8; verified assurance gap; **Medium**; **Retain/investigate external evidence**.
- **Original sources / comparison:** C `F-06`; A `STR-007` and test-boundary observations; B author-reported test counts. Agreement that tests exist; disagreement is about what they certify.
- **Evidence / status / confidence:** **Verified** workflow/test content; external checks and actual results **Unresolved**.
- **Behavior and code:** `.github/workflows/check.yml` push/PR targets `dev`; `check-test.yml` push targets `dev`/`beta`, with broader PR/manual paths. Unit matrices include Linux/Windows. Effort evidence tests pre-seed state; no run result for pinned `main` was supplied.
- **Current/upstream status:** Fork workflow configuration at target SHA. External CI, branch protection, release checks, and manual verification may exist.
- **Root cause / competing explanations:** Development/release branch split and seeded fixtures; alternatively, external release assurance may close the gap and hidden initialization invariants may make absent-row tests unnecessary.
- **Practical consequence:** Public workflow files alone cannot certify the exact release SHA or FIFE-001 boundary. This does not prove `main` broken or CI absent.
- **Candidate directions / tradeoffs:** Reuse current PR/manual workflows or establish release provenance and boundary coverage in future work. Broader CI increases cost/time; author-reported pass counts are not independent reproduction.
- **Benefit evidence required:** Check-run provenance for the released SHA, branch-protection/external CI evidence, and authorized isolated absent-row execution with failures visible.

### FIFE-013 — Branch guidance and effort-spec status are inconsistent

- **Domain / class / priority / disposition:** D3/D9; confirmed documentation mismatch; **Low–Medium**; **Retain**.
- **Original sources / comparison:** A `GAP-008`; B environment note; C `E-027` documentary evidence. Agreement on text; operational harm unknown.
- **Evidence / status / confidence:** **Verified**; high textual confidence, low operational-impact confidence.
- **Behavior and code:** `AGENTS.md` says default/target `dev` while fork metadata/default audited target is `main`. Research packages directly quote `docs/spec/effort-policy.md` as “Draft — awaiting approval” despite implementation; `docs/intent/effort-policy.md` is directly confirmed as `Status: Confirmed`.
- **Current/upstream status:** Published fork documents at target SHA. `dev` may intentionally describe upstream contribution workflow; spec may be historical.
- **Root cause / competing explanations:** Inherited upstream instructions or stale lifecycle status, not necessarily incorrect maintainer intent.
- **Practical consequence:** Fresh agents/readers can choose the wrong base or misread shipped functionality. No runtime effect is established.
- **Candidate directions / tradeoffs:** Clarify fork versus upstream scope and historical versus current spec status. Documentation changes are low complexity but require maintainer intent, not assumptions.
- **Benefit evidence required:** Maintainer confirmation and a fresh read-only agent identifying the correct target/status; no performance measurement is relevant.

### FIFE-014 — Fork/upstream divergence creates semantic maintenance exposure

- **Domain / class / priority / disposition:** D9 with cross-cutting effects; verified architectural risk; **Medium–High for maintenance**; **Retain without universal merge-first rule**.
- **Original sources / comparison:** A `GAP-003`, `H-07`; B `X-01`, `X-02`, `GAP-001`, `H-01`, `R-04`; C `F-07`, `U-06`, `R-11`. Agreement on divergence; disagreement on dominance/prerequisites.
- **Evidence / status / confidence:** **Verified** recorded Git topology and focused diffs; upgrade cost/regression effect **Unresolved**.
- **Behavior and code:** Recorded comparison: merge base `ed74ec82ce1fe3a36da6c0815a935473ef4bb0fb`, fork 97 ahead/528 behind pinned upstream. Kimi reports latest in-fork upstream merge `ed073f3202c6752d6f4d8e2bc5c17b199b3587f2` and 239-file baseline/fork diff. Overlap includes runner, step, compaction, model request, subagent, normalize, and session files.
- **Current/upstream status:** Counts apply only to recorded SHAs. Current upstream `dev` could not be refreshed after the permitted retry; full semantic equivalence is not established.
- **Root cause / competing explanations:** Independent feature/provider/Windows evolution in shared paths. Effect modularity and tests may contain burden; raw diff mass includes docs/vendored/tests.
- **Practical consequence:** Delayed fixes, semantic conflicts, and regression risk may rise; fork additions can also provide real differentiated value. No maintenance hours or defect rate measured.
- **Candidate directions / tradeoffs:** Retain pinned behavior, selectively reconcile, or broader convergence are options. Merge/rebase/freeze choices have different compatibility and ownership costs; raw counts do not choose among them.
- **Benefit evidence required:** Historical reconciliation hours/regressions, symbol-level ownership/compatibility matrix, and accepted-task outcomes on comparable fixtures. No merge trial was performed.

### FIFE-015 — Newer upstream context/provider behavior is a reconciliation opportunity

- **Domain / class / priority / disposition:** D2/D6/D7; supported upstream difference, unproven fork deficiency; **Medium**; **Investigate/defer adoption**.
- **Original sources / comparison:** B `X-06`, `GAP-006`, `OPP-005`; C `O-02`, part of `U-06`. Agreement on differences; “probable deficiency” narrowed to opportunity.
- **Evidence / status / confidence:** **Supported** by package-pinned upstream inspection and direct pinned `model-request.ts` comparison; complete compaction equivalence and local benefit unresolved.
- **Behavior and code:** Packages report upstream `compaction.ts` accepts numeric or percentage-string buffers and changes provider-reported sizing/error handling. Direct upstream `model-request.ts` at `1bf08ae…` includes `WINDOW_HEADROOM = 0.01` and measured/estimated output room; fork target has its own output-limit and control-token handling.
- **Current/upstream status:** Differences are pinned, not live-tip claims. Fork already has extensive compaction, telemetry, and cache behavior; upstream is not strictly better by default.
- **Root cause / competing explanations:** Divergent evolution. Fork behavior may be adequate or preferable for its providers; upstream changes could regress fork invariants.
- **Practical consequence:** Potential improvement in long-context or provider-error cases, but no overflow, compaction-quality, or throttling failure is established.
- **Candidate directions / tradeoffs:** Retain fork behavior or selectively reuse suitable upstream semantics. Wholesale replacement risks cache, session, telemetry, and configuration compatibility.
- **Benefit evidence required:** Side-by-side pinned fixtures for overflow/throttling/long context, provider token reporting, correct recovery, accepted tasks, total cost/latency, and regression behavior.

### FIFE-016 — Nested-fork cache lineage is an explicit TODO

- **Domain / class / priority / disposition:** D2/D6; verified architectural opportunity; **Low until provider/workload relevance is shown**; **Defer/investigate**.
- **Original sources / comparison:** A `GAP-009`; C `O-01`. Full agreement on TODO, neither measures impact.
- **Evidence / status / confidence:** **Verified** TODO and affinity mechanism; cache/cost benefit **Unresolved**.
- **Behavior and code:** `session/affinity.ts` uses parent, fork-source, or own session ID. `session/model-request.ts` sets cache headers/key from affinity and states: “TODO: Persist cache lineage so nested forks reuse the root session's cache key.”
- **Current/upstream status:** The same TODO appears in the directly inspected pinned upstream `model-request.ts`; it is not solely fork-authored and no upstream resolution at the baseline is shown.
- **Root cause / competing explanations:** Nested identity lacks durable root lineage; current affinity may suffice for common cases, and some providers may ignore this key.
- **Practical consequence:** Potential cold cache or extra cost/latency in nested-fork workloads; no measured excess cost or accepted-task effect.
- **Candidate directions / tradeoffs:** Retain provider defaults/current affinity or investigate bounded lineage. Persistent lineage affects privacy/tenant scope, session semantics, and provider-specific TTLs.
- **Benefit evidence required:** Same-provider nested-fork warm/cold traces with exact-prefix and key continuity, provider-reported hits, accepted-task cost/latency, and no inappropriate state sharing.

### FIFE-017 — Effort-switch cache impact is asserted but unmeasured

- **Domain / class / priority / disposition:** D5/D6/D8; measurement gap; **Medium**; **Investigate before optimization**.
- **Original sources / comparison:** B `X-08`, `GAP-007`; A/C cache and effort analyses. Agreement on missing measurement; DeepSeek’s `Session.switchModel` mechanism subclaim is contradicted.
- **Evidence / status / confidence:** **Verified** absence of supplied transition-linked cache results; actual effect **Unresolved**.
- **Behavior and code:** `effort/transition.ts` directly publishes model selection; intent docs claim cache-safe switching through existing transport. `model-request.ts` uses model-sensitive request shaping and affinity. No supplied trace joins variant transitions to provider cache outcome.
- **Current/upstream status:** Fork policy interacts with provider-specific behavior; no universal cache semantics or upstream fix inferred.
- **Root cause / competing explanations:** Variant/model serialization, stable prefixes, TTL/eviction, and provider routing can each change cache outcomes; structural cache-safe design may work as intended.
- **Practical consequence:** Escalation could reduce cache reuse and increase cost/latency, or have negligible effect. Neither is established.
- **Candidate directions / tradeoffs:** Retain design, measure before changing transition/cap/prefix behavior. Provider-specific optimizations can harm other routes and maintenance.
- **Benefit evidence required:** Fixed model/provider warm/cold sessions across effort changes, recording actual request/response model, cache read/write, TTL, cost, latency, and accepted-task result.

### FIFE-018 — Accepted-task outcome, cost, and latency baseline is missing

- **Domain / class / priority / disposition:** D6/D8; confirmed research measurement gap and high-value evaluation opportunity; **High**; **Implemented and validated with documented limitations**.
- **Original sources / comparison:** A `GAP-004`; B `GAP-005`, `OPP-001`; C `F-05`, `O-04`; related effort/routing hypotheses. Full agreement, but repetition is not independent empirical evidence.
- **Evidence / status / confidence:** **Implemented and validated with documented limitations.** The original **Verified** finding covered absence from the supplied evidence before implementation; private/external evaluation may still exist. The ledger has 56 passing tests, including zero-token, accounting, evidence, discovery, migration, and persistence coverage.
- **Behavior and code:** `session/usage.ts`, runner logs, event logger, and OTLP capture operational data. Task telemetry (`packages/core/src/telemetry/`) now derives a task ledger on demand from `session_v2`, `session_message`, and the durable event log: deterministic task identity, token/cost/request accounting with explicit completeness, and an append-only acceptance history. It adds no model request and no write on the execution path. Provider billing is still not joined.
- **Current/upstream status:** Implemented in this repository as query-time task telemetry over data the runtime already stores. The remaining gaps are the documented limitations below, not missing capability. Existing usage code prefers endpoint-reported cost and separates token categories.
- **Root cause / competing explanations:** Operational telemetry preceded product-level evaluation; private/downstream records may exist.
- **Practical consequence:** No defensible quality, speed, or cost ranking for compaction, effort, routing, caching, or delegation. Request/token/cache proxies cannot fill the gap.
- **Candidate directions / tradeoffs:** Consented external joins, existing logs, public fixtures, or an evaluation harness; avoid a larger telemetry platform without need. Privacy, labeling consistency, sensitive code, missing/aborted tasks, and instrumentation overhead are material costs.
- **Benefit evidence required:** Reproducible ledger with task IDs, model/provider/config, all-attempt cost/time, acceptance/rework, failures/censoring, and missingness. Establish join completeness before comparing mechanisms.
- **Documented limitations:** one task per root Session; provider-attempt and retry counts require a persisted durable event log (`events.persist`, off by default); retry-attempt tokens appear only in the `unattributed` residual; acceptance evidence is recorder-attested, not third-party; provider billing is not reconciled, so `billing_verified` stays false; forks need explicit registration.

### FIFE-019 — Git-state outcome extraction can reduce evaluation output-contract confounding

- **Domain / class / priority / disposition:** D8; externally supported evaluation-design opportunity; **Medium for future comparisons**; **Retain as evaluation option, not production defect**.
- **Original sources / comparison:** C `O-03`; A/B benchmark-method cautions. Unique numbered Kimi opportunity.
- **Evidence / status / confidence:** **Supported** by package-reported controlled external benchmark; no FiFeCode measurement or independent rerun here.
- **Behavior and code:** Claw-SWE-Bench collects candidate patches from repository Git state under shared orchestration. Kimi reports GLM 5.1 bare adapter 19.3% versus full adapter 71.2% resolved and full-adapter apply failures below 1.5% in that benchmark configuration.
- **Current/upstream status:** External evaluation mechanism only; no assertion that FiFeCode production patch handling is defective.
- **Root cause / competing explanations:** Final-message formatting can confound model/harness quality; Git extraction may miss non-Git artifacts and differ from user-facing interaction.
- **Practical consequence:** Better evaluation attribution, not necessarily better production coding. Benchmark convenience must not drive an unjustified runtime rewrite.
- **Candidate directions / tradeoffs:** Reuse an existing evaluation harness or external orchestration subject to license/task fit; retain production UX. Maintain test images, adapter versions, and contamination controls.
- **Benefit evidence required:** Fixed-model/task comparisons reporting all-started denominator, patch-apply failures, tested acceptance, censored runs, cost, duration, and repeated-run uncertainty.

### FIFE-020 — Context growth and prior usage figures are underdetermined

- **Domain / class / priority / disposition:** D2/D6/D8; unresolved diagnosis and data-access limitation; **Medium measurement priority**; **Investigate; reject premature defect label**.
- **Original sources / comparison:** A `GAP-011`, `H-04`; B `X-07`, `H-03`; C `U-01`, `R-10`; related raw-data limitations. Agreement that existing compaction defeats a simple absence claim.
- **Evidence / status / confidence:** **Verified** underdetermination; root cause **Unresolved**.
- **Behavior and code:** Automatic/manual/overflow/native/background compaction and bounded output exist. Raw ZIP underlying prior figures was unavailable; no per-request context composition or accepted outcome was supplied.
- **Current/upstream status:** Applies to supplied historical signal, not a reproduced current fork regression. Upstream differences in FIFE-015 do not establish causation.
- **Root cause / competing explanations:** Continuous session, legitimate complexity, retained files/tools/instructions, summaries, provider accounting, retries/delegation, or actual waste are competing explanations.
- **Practical consequence:** Aggressive compression, retrieval, or memory changes could destroy useful state and cache continuity without improving accepted work.
- **Candidate directions / tradeoffs:** Retain current compaction pending raw composition/outcome evidence; external read-only analysis avoids runtime changes. More context is not inherently good or bad.
- **Benefit evidence required:** Redacted raw export with task/session/request linkage, component token breakdown, compaction events, model/provider versions, cold/warm state, latency, cost, and accepted-task outcome; failed attempts included.

### FIFE-021 — Cache-hit ratio is not accepted-task efficiency

- **Domain / class / priority / disposition:** D6/D8; verified methodological guardrail; **High as an interpretation rule, not a defect**; **Retain/protect measurement validity**.
- **Original sources / comparison:** B `H-04`; C `R-09`; A literature and metric definitions. Agreement across packages; shared logic/sources are not independent measurements.
- **Evidence / status / confidence:** **Verified** conceptual distinction; external benchmark examples are source-scoped, not fork effects.
- **Behavior and code:** `session/usage.ts` records cache read/write separately. Provider cache ratios describe reused input, not relevance, task success, total attempts, latency, or total cost.
- **Current/upstream status:** Applies across fork/upstream/providers; no code deficiency assigned.
- **Root cause / competing explanations:** Stable prefixes can produce high hit rates while long prompts remain expensive or low-quality; provider definitions and missing counters can distort aggregates.
- **Practical consequence:** Optimizing the reported ratio can worsen total accepted-task economics or quality. Prior reported 96.89% aggregate is not independently reproduced and is not used as a finding of efficiency.
- **Candidate directions / tradeoffs:** Preserve granular accounting and interpret it alongside accepted outcomes; no cache rewrite follows from this guardrail.
- **Benefit evidence required:** Joint distributions of acceptance, total cost, duration, context, and cache by task/provider, with explicit missing-data handling and no-change controls.

### FIFE-022 — Skills/references prompt overhead is an unmeasured hypothesis

- **Domain / class / priority / disposition:** D2/D3/D6; plausible cost/relevance risk; **Low–Medium evidence-dependent**; **Defer pending attribution**.
- **Original sources / comparison:** B `GAP-010`, `H-06`; A/C skill/progressive-disclosure comparisons. Unique numbered DeepSeek overhead hypothesis.
- **Evidence / status / confidence:** **Verified** skill/reference files and routing guidance; overhead and quality effect **Plausible/Unresolved**.
- **Behavior and code:** `.opencode/skills/`, `.opencode/references/`, and `AGENTS.md` routing are present; `session/context.ts` discovers instructions/skills with stable ordering. No supplied token attribution or ablation exists.
- **Current/upstream status:** Fork contains substantial guidance content; exact inherited versus custom authorship and runtime loaded subset were not fully reconstructed.
- **Root cause / competing explanations:** Guidance may improve quality and reduce rework, add noise/conflict, or do both by task. Raw file size is not loaded prompt size.
- **Practical consequence:** Potential token/latency cost or instruction conflict; removal could lose useful standards and verification discipline.
- **Candidate directions / tradeoffs:** Retain, deduplicate, or progressive disclosure are candidates only after measuring actual loaded content and task effects.
- **Benefit evidence required:** Per-request instruction provenance/tokens and representative task ablations with acceptance, rework, cost, latency, and cache stability.

### FIFE-023 — Selective post-compaction re-injection and long-term memory remain parity questions

- **Domain / class / priority / disposition:** D2/D3; plausible architectural opportunities; **Low–Medium pending observed continuity failure**; **Defer/investigate**.
- **Original sources / comparison:** B D2/D3 narratives and Claude comparisons; A/C compaction and memory synthesis. Partial agreement; broad absence claims narrowed by source.
- **Evidence / status / confidence:** **Plausible** opportunity; current deficiency **Unresolved**.
- **Behavior and code:** `session/compaction.ts` has structured summaries and native/background paths; its prompt says current repository instructions/environment are received separately. Durable history, skills, and plan behavior exist. No supplied evidence demonstrates Claude-equivalent auto-memory or selective file/rule re-injection, nor a resulting failure.
- **Current/upstream status:** Peer documentation describes mechanisms, not FiFeCode requirements. Upstream parity is not fully established.
- **Root cause / competing explanations:** Existing compaction/instruction boundaries may already cover the need; a separate memory layer could duplicate or stale state.
- **Practical consequence:** Possible long-session constraint loss, but also potential privacy, relevance, cache, and maintenance costs from added memory.
- **Candidate directions / tradeoffs:** Retain existing history/compaction; evaluate selective retrieval only against concrete failures. Avoid building a second context system for feature parity.
- **Benefit evidence required:** Long-session tasks with known required instructions/files/decisions, raw-versus-summary replay, retrieval accuracy, acceptance, cost/latency, and stale-memory failures.

### FIFE-024 — Budgeted repository maps are an opportunity without a proven search deficiency

- **Domain / class / priority / disposition:** D2/D4; external mechanism and local applicability hypothesis; **Medium–Low**; **Defer**.
- **Original sources / comparison:** A `GAP-006`; B/C Aider and agentic-search comparisons. Unique numbered ChatGPT opportunity.
- **Evidence / status / confidence:** **Supported** Aider documented mechanism; FiFeCode benefit **Unresolved**.
- **Behavior and code:** Aider documents Tree-sitter symbol/dependency ranking under a token budget. FiFeCode already has glob/grep/read, dynamic context, CodeMode, tree-sitter dependencies, and plugin seams; no failing navigation corpus was supplied.
- **Current/upstream status:** Peer comparator only; upstream may offer lower-maintenance relevant functionality, not fully assessed.
- **Root cause / competing explanations:** Existing agentic search may be sufficient; an index could improve relevance or become stale and expensive.
- **Practical consequence:** Potential large-repository discovery benefit balanced against CPU/storage, Windows performance, cache stability, and index freshness.
- **Candidate directions / tradeoffs:** Retain search, configure existing tools, reuse LSP/upstream capabilities, or external prototype. Shorter prompts alone are not success.
- **Benefit evidence required:** Cross-file tasks with known relevant symbols; context precision/recall, accepted correctness, latency, tokens, cache, freshness, and maintenance cost against current search.

### FIFE-025 — Task-tier model routing is absent from the inspected resolver and unvalidated

- **Domain / class / priority / disposition:** D5/D6; supported selected-path observation and opportunity; **Medium pending data**; **Investigate/defer adoption**.
- **Original sources / comparison:** A `GAP-007`, `H-05`; B/C routing discussions. Agreement that effort adaptation is not model-tier routing; broader absence remains qualified.
- **Evidence / status / confidence:** **Verified** inspected resolver behavior; overall local/plugin absence and benefit **Unresolved**.
- **Behavior and code:** `session/runner/model.ts` selects explicit session model, configured agent model, or resolver default. No task-difficulty tier router appears there. Effort policy separately selects reasoning variants.
- **Current/upstream status:** Public `main` path only; external, plugin, non-main, or unpublished routing is not excluded.
- **Root cause / competing explanations:** Manual/agent choices may be intentional and reliable. Classification errors and provider/tool differences can outweigh model savings.
- **Practical consequence:** Possible cost/latency improvement for simple tasks or quality gain on hard tasks; misrouting, repeated premium fallback, and extra classification can negate both.
- **Candidate directions / tradeoffs:** Retain manual/agent selection, improve configuration, bounded failure escalation, or dynamic routing comparisons. Preserve exact user choice and provider compatibility.
- **Benefit evidence required:** Randomized/counterbalanced router/no-router tasks with acceptance, total cost, time, retries, overrides, false escalations, model identity, and cache effects.

### FIFE-026 — DeepSeek model/harness/provider ranking remains unresolved

- **Domain / class / priority / disposition:** D5/D6/D8; unresolved comparative question; **Medium research condition**; **Investigate before any adoption claim**.
- **Original sources / comparison:** A `GAP-010`, `H-06`; B `OPP-003` and DeepSeek landscape; C `U-04`; related external benchmark narratives. Agreement on missing parity, differing emphasis on native harness potential.
- **Evidence / status / confidence:** **Verified** lack of supplied controlled FiFeCode comparison; winner **Unresolved**.
- **Behavior and code:** FiFeCode has DeepSeek adapters (FIFE-027); official Harness has native adapter/plugin paths and developer-preview maturity (FIFE-036); Codex integration uses different protocol/tool/sandbox envelopes.
- **Current/upstream status:** Model aliases and provider docs can change; package-reported dated aliases are not live endpoint observations in this consolidation.
- **Root cause / competing explanations:** Model, adapter, tool schema, reasoning control, context/cache, permissions, and task differences can each explain results.
- **Practical consequence:** Switching harness or provider could change quality/cost/latency independent of model capability; no financial or quality gain is asserted.
- **Candidate directions / tradeoffs:** Retain working integration; use official minimal mode only as a comparator where compatible. Incompatible protocols narrow claims rather than being hidden as a “harness effect.”
- **Benefit evidence required:** Same resolved model/version/endpoint where possible, fixed tasks/tools/permissions/budgets/cache, repeated counterbalanced runs, Git-state acceptance, total cost/time, and adapter metadata.

### FIFE-027 — Native and hosted DeepSeek thinking/effort support exists

- **Domain / class / priority / disposition:** D5; verified existing strength correcting a contradiction; **Protect**; **Protect/retain**.
- **Original sources / comparison:** C `S-10`, `R-05`; B `N-01` (**Contradicted**). Direct source resolves the disagreement.
- **Evidence / status / confidence:** **Verified** source mechanism; live endpoint compatibility remains unmeasured.
- **Behavior and code:** `packages/core/src/variant.ts` `deepseekChat` maps `none` to thinking disabled and other efforts to `reasoningEffort` plus thinking enabled, with default values `low`, `high`, `max`; toggle and hosted-provider handling also exist. Provider/resolver/native SDK files provide related integration.
- **Current/upstream status:** Present in fork target; full ancestry not needed to establish presence. No claim that every hosted route behaves identically.
- **Root cause / competing explanations:** DeepSeek’s negative claim resulted from incomplete inspection. Runtime aliases, provider serialization, and endpoint behavior can still differ.
- **Practical consequence:** Existing flexibility should not be replaced or rewritten on the false premise of absence.
- **Candidate directions / tradeoffs:** Preserve provider-specific mappings and exact controls; measure live behavior separately. Generalizing across providers could break native semantics.
- **Benefit evidence required:** Only for stronger runtime claims: captured authorized requests/responses and fixed-model task comparisons; source presence itself is already established.

### FIFE-028 — Durable, interruptible agent loop and recovery are core strengths

- **Domain / class / priority / disposition:** D1/D3/D7; verified mechanism strength; **Protect**; **Protect**.
- **Original sources / comparison:** A `STR-001`, `R-06`; B `S-06`; C `S-01`–`S-03`, `R-04`; related peer event/replay research. Full agreement on presence, not proven recovery outcomes.
- **Evidence / status / confidence:** **Verified** source mechanisms; fault-injection reliability **Unresolved**.
- **Behavior and code:** `session/runner/llm.ts`, `runner/step.ts`, `session/execution.ts`, and session stores implement durable inbox/claims, one explicit stream per step, history reload, tool settlement, retries/backoff, cancellation, output continuation, overflow/stale recovery, and restart continuity.
- **Current/upstream status:** Primarily inherited OpenCode V2 foundation with fork integrations; exact authorship of every path not reconstructed.
- **Root cause / competing explanations:** Explicit durable state reduces reliance on process-local loop memory; process death, concurrency, and provider faults can still expose untested boundaries.
- **Practical consequence:** Supports dependable long-running personal workflows and safe recovery; no measured recovery rate or superiority claim.
- **Candidate directions / tradeoffs:** Preserve event ownership and terminal-state semantics. Added orchestration or duplicate loop protocols risk contradictory state and maintenance burden.
- **Benefit evidence required:** Only for outcome claims: injected crash/provider/tool/cancellation fixtures measuring correct resume, stale success, repeated errors, and time to accepted completion.

### FIFE-029 — Multi-mode compaction and retained history are existing strengths

- **Domain / class / priority / disposition:** D2/D3; verified mechanism strength; **Protect**; **Protect**.
- **Original sources / comparison:** A `STR-002`, `R-01`; B `S-06`, `R-01`; C `S-06`, `R-01`; B `GAP-006` supplies a bounded upstream-lag qualification.
- **Evidence / status / confidence:** **Verified** mechanisms; summary quality and task benefit **Unresolved**.
- **Behavior and code:** `session/compaction.ts` implements automatic/manual/overflow/native/background modes, structured-summary validation/retry, reserve/keep settings, precompute, overflow shrink ladder, and cache-conscious request construction. Earlier events remain stored.
- **Current/upstream status:** OpenCode-derived with fork changes; newer upstream differences belong to FIFE-015. “Text-summary only” and “no compaction” are inaccurate descriptions.
- **Root cause / competing explanations:** Multiple modes address distinct context-limit/latency conditions; summaries can still lose task-critical state.
- **Practical consequence:** Existing long-session support should not be replaced because aggregate context grows; quality must be tested directly.
- **Candidate directions / tradeoffs:** Preserve current decisions/constraints and provider cache behavior; selective upstream reconciliation remains conditional. More aggressive compression can increase rework.
- **Benefit evidence required:** Controlled long histories with required-decision retrieval, final tests/review, replay invariants, total tokens/cost/latency, and no-change control.

### FIFE-030 — Cache-conscious requests and granular usage/cost accounting are strengths

- **Domain / class / priority / disposition:** D2/D6; verified mechanism strength; **Protect**; **Protect**.
- **Original sources / comparison:** A `STR-003`, `R-02`; B `S-03` partially contradicted for route but valid cache aim; C `S-04`, `S-05`, `R-07`; B `H-04` measurement hypothesis.
- **Evidence / status / confidence:** **Verified** source mechanisms; actual provider savings and latency effects **Unresolved**.
- **Behavior and code:** `session/context.ts` stable/shared ordering; `model-request.ts` affinity, cache key/TTL, media bounding, provider options; `usage.ts` separates uncached/output/reasoning/cache read/write and prefers endpoint-reported cost over catalog fallback.
- **Current/upstream status:** Shared/fork-modified active paths; pinned upstream has the same nested-fork TODO and additional headroom differences described elsewhere.
- **Root cause / competing explanations:** Provider semantics differ; a structurally stable prefix does not guarantee a hit or accepted-task efficiency.
- **Practical consequence:** Supports sound measurement and potential cost/latency control without treating cache ratios as quality.
- **Candidate directions / tradeoffs:** Preserve provider-conscious behavior and actual billed-cost precedence; avoid provider-specific overfitting and unstable prefixes.
- **Benefit evidence required:** Provider-scoped traces and task-level cost/latency/acceptance for any claimed improvement; no numerical benefit is currently supported.

### FIFE-031 — Permissions, tools, hooks, extensions, and subagents form a substantial existing surface

- **Domain / class / priority / disposition:** D4/D7; verified mechanism strength; **Protect**; **Protect**.
- **Original sources / comparison:** A `STR-004`, `STR-006`, `R-03`, `R-04`; B `S-05`, `R-02`, `R-03`; C `S-07`–`S-09`, `R-03`. Agreement on presence; FIFE-010/FIFE-011 retain boundaries.
- **Evidence / status / confidence:** **Verified** registered source mechanisms; actual workflow value and security outcomes unmeasured.
- **Behavior and code:** `permission.ts` last-match/default-ask/deny behavior; tool registry and shell/read/edit/search; `config-hooks.ts`; plugin/MCP/skills; `tool/plugin/subagent.ts` model/permission/ownership/depth validation, default depth 1, background/continuation/notification; bounded output with retained artifacts.
- **Current/upstream status:** Mostly inherited OpenCode foundation with fork config-hook and policy integrations; no claim all features are fork-authored.
- **Root cause / competing explanations:** Shared registries and permission-filtered snapshots support consistent behavior; plugins/hooks remain trusted and can expand attack surface.
- **Practical consequence:** Existing capabilities already cover many personal coding/orchestration needs. Enabling every tool or imitating peer breadth could reduce safety and relevance.
- **Candidate directions / tradeoffs:** Preserve scoped exposure, extension compatibility, and truthful completion. Expansion must be justified independently of feature count.
- **Benefit evidence required:** Only for comparative value claims: task-stratified tool/delegation ablations, permission/denial correctness, child cost, coordination overhead, and accepted outcomes.

### FIFE-032 — Exact user precedence and a pure effort policy are strengths; direct event publication is not inherently defective

- **Domain / class / priority / disposition:** D5; verified policy/design strength and corrected interpretation; **Protect**; **Protect**.
- **Original sources / comparison:** A `STR-005`; B `S-01`, `S-02`, `S-03` (**Contradicted** for `Session.switchModel` route); C `R-08`; related policy evidence. Agreement on exact-pick precedence; mechanism dispute resolved.
- **Evidence / status / confidence:** **Verified**; high source confidence, runtime/task effect unmeasured.
- **Behavior and code:** `effort/policy/policy.ts` gives exact user selections precedence and contains portable pure decisions. `transition.ts` directly publishes `SessionEvent.ModelSelected` with its own no-change guard rather than calling `Session.switchModel`; delegation and adapter supply operation/plan/default behavior.
- **Current/upstream status:** Fork-specific effort integration. The design document’s preference for `Session.switchModel` is not proof that direct publication breaks projection or behavior.
- **Root cause / competing explanations:** DeepSeek’s route assertion was inaccurate. A concrete projection, ordering, or cache failure would need separate evidence; none is established merely by publication style.
- **Practical consequence:** Protects user control and testable policy logic while avoiding a false refactor rationale. FIFE-001 remains a separate persistence defect.
- **Candidate directions / tradeoffs:** Preserve exact semantics and pure boundaries; evaluate only demonstrated event-path failures. Routing through a preferred helper could be reasonable but is not itself measured improvement.
- **Benefit evidence required:** A concrete failing projection/order/cache fixture would be needed to elevate publication style to a defect; exact-pick and cache behavior must remain intact in any comparison.

### FIFE-033 — Focused tests and operational observability are useful but bounded strengths

- **Domain / class / priority / disposition:** D8/D9; verified mechanism strength with assurance boundary; **Protect**; **Protect**.
- **Original sources / comparison:** A `STR-007`, `R-07`; C `S-11`, `S-12`, `R-06`; B author-reported PR test claims. Agreement on assets; no independent pass result.
- **Evidence / status / confidence:** **Verified** test/telemetry source presence; current pass status and task outcome value **Unresolved**.
- **Behavior and code:** `test/effort/` covers policy, adapter, storage, evidence, delegation, and recovery; event logging, runner/usage telemetry, optional Z.ai/Zhipu usage UI, and `packages/util/src/observability/otlp.ts` exist. FIFE-012 records branch and absent-row coverage limits.
- **Current/upstream status:** Fork and inherited workflow/observability assets at target SHA; external CI unknown.
- **Root cause / competing explanations:** Focused tests express useful invariants but can omit integration boundaries; telemetry explains activity without acceptance labels.
- **Practical consequence:** Provides a foundation for reliable maintenance and future evaluation, not proof of current runtime quality or release certification.
- **Candidate directions / tradeoffs:** Preserve tests and existing telemetry; avoid replacing them or equating file/test counts with outcomes. Additional observability has privacy and maintenance costs.
- **Benefit evidence required:** Actual pinned-revision check results, boundary coverage, trace join completeness, and accepted-task linkage; author-reported 53/53, 241/241, and 17/17 figures remain unreproduced.

### FIFE-034 — Windows/terminal engineering is valuable but live behavior is unexercised

- **Domain / class / priority / disposition:** D9/D8; supported platform/UX strength and runtime unknown; **Protect/validate for stated workload**; **Protect with qualification**.
- **Original sources / comparison:** B `S-07`; C `U-05`; A D9/Windows analysis. Agreement on source footprint and missing live test.
- **Evidence / status / confidence:** **Supported** source/workflow presence; Windows/PowerShell/Bun/SSH/TUI behavior **Unresolved**.
- **Behavior and code:** CLI/TUI/app packages, Windows-specific scripts/fixes, usage UI states, and Windows unit/build workflow legs exist. The consolidation did not access the local Windows checkout or execute Bun/provider/TUI flows.
- **Current/upstream status:** Public source only; installed build, local uncommitted fixes, symlinks, paths, quota behavior, and terminal experience unknown.
- **Root cause / competing explanations:** Platform-specific engineering addresses real user needs, but source and CI matrix presence do not guarantee the user’s environment works.
- **Practical consequence:** Directly relevant to the user’s stated Windows/PowerShell priority; no compatibility failure or success is claimed.
- **Candidate directions / tradeoffs:** Preserve existing platform behavior and terminal controls; avoid peer designs with Unix-only assumptions. Further value claims require local evidence.
- **Benefit evidence required:** Authorized local version/configuration capture and representative PowerShell/SSH/TUI tests covering paths, permissions, interruption, resume, and provider behavior.

### FIFE-035 — Codex cross-client event ownership is a comparator, not a missing FiFeCode app server

- **Domain / class / priority / disposition:** D1/D9; narrative architectural synthesis; **Low adoption priority / high comparator value**; **Retain as comparator**.
- **Original sources / comparison:** A/C Codex deep dives and evidence ledgers; no separate registered gap ID. Agreement on durable thread/item and JSON-RPC boundaries.
- **Evidence / status / confidence:** **Supported** by package-cited public source/primary engineering documents; not independently re-audited in this consolidation.
- **Behavior and code:** Packages describe Codex core-owned threads, turn admission, approvals, sandbox/tool execution, and app-server streaming/reconnect. FiFeCode already has distinct core/session/runtime and multiple client surfaces.
- **Current/upstream status:** Peer architecture only; no current Codex tip refresh or FiFeCode client-parity test performed.
- **Root cause / competing explanations:** Central event ownership can reduce UI divergence; another protocol can duplicate state and increase upgrade cost.
- **Practical consequence:** The useful question is whether current FiFeCode surfaces share durable tool/permission semantics, not whether a new server should be adopted.
- **Candidate directions / tradeoffs:** Reuse existing session/event APIs and compare client behavior; no second app-server architecture is justified by peer presence.
- **Benefit evidence required:** Cross-surface fixtures for reconnect, approval, interruption, and terminal state; measure inconsistent states and maintenance burden before architectural change.

### FIFE-036 — DeepSeek Harness offers plugin seams but explicit maturity warnings

- **Domain / class / priority / disposition:** D4/D9; supported peer architecture/maturity finding; **Protect against wholesale adoption**; **Retain as comparator**.
- **Original sources / comparison:** A/B/C DeepSeek Harness deep dives; C `R-12`; B `OPP-003` comparator use. Agreement on breadth and preview status.
- **Evidence / status / confidence:** **Supported** by package-cited pinned source/docs; no live audit/tests here.
- **Behavior and code:** Packages describe append-only events, Cordis plugins, profiles, session/tool/model adapters, compaction, sandbox, telemetry, and subagents at `ce7073d51254c26cd63b22a60835b8f948deb447`; official materials label `0.2.2-alpha.2` developer preview and reject production-ready/security-audited interpretation.
- **Current/upstream status:** External pinned system, not FiFeCode code. Reported 2,395 test-like filenames are not test count, pass rate, or quality measure.
- **Root cause / competing explanations:** Replaceable plugin boundaries aid experimentation but increase lifecycle, compatibility, and assurance surface.
- **Practical consequence:** Useful for controlled DeepSeek comparison and seam design; wholesale migration could discard FiFeCode strengths and increase maintenance.
- **Candidate directions / tradeoffs:** Retain FiFeCode and use minimal harness as a comparator where valid. Sandbox backend limitations and breaking changes remain relevant.
- **Benefit evidence required:** FIFE-026 controlled accepted-task comparison plus security/deployment review; feature/test inventory alone cannot settle value.

### FIFE-037 — External benchmark figures are conditional evidence, not FiFeCode effect estimates

- **Domain / class / priority / disposition:** D5/D6/D8; narrative evidence-quality synthesis; **High interpretation guardrail / low direct actionability**; **Retain with source scope**.
- **Original sources / comparison:** Kimi main report §7.5 and evidence ledger; A/B benchmark cautions. Agreement that configurations differ; Kimi supplies the most specific external numbers.
- **Evidence / status / confidence:** **Supported as package-reported external results**; not independently reproduced and **Unresolved** for FiFeCode.
- **Behavior and code:** No FiFeCode code mechanism is measured. Claw-SWE-Bench adapter results relate to FIFE-019. Kimi reports DeepSeek-V4.1-Flash at 76.5% Pass@1, $41 total, 1,577-second mean, and 96.3% cache in a stated external benchmark configuration.
- **Current/upstream status:** Benchmark/model/provider/version specific; no isolation of compaction, caching, or effort as cause.
- **Root cause / competing explanations:** Adapter/output contract, task selection, tools, pricing, timeout, cache state, and model ability can jointly explain results.
- **Practical consequence:** Prevents false model/harness rankings and fabricated expected improvements. It does not show FiFeCode performs poorly or that DeepSeek Harness is preferable.
- **Candidate directions / tradeoffs:** Use Pareto quality/cost/latency comparisons with all attempts; retain inconclusive outcomes. Avoid composite scores and cherry-picked headlines.
- **Benefit evidence required:** Exact benchmark configuration and repeated FiFeCode runs under comparable conditions, with adapter/version metadata and independent acceptance.

### FIFE-038 — Peer recovery and replay mechanisms reinforce, rather than replace, durable design

- **Domain / class / priority / disposition:** D1/D3/D7; narrative peer synthesis; **Comparator value / defer new recovery system**; **Retain as comparator and protect existing recovery**.
- **Original sources / comparison:** A Gemini/OpenHands/Codex/DeepSeek sections; C OpenHands replay and recovery analysis. No registered standalone gap; FiFeCode snapshots/revert are acknowledged.
- **Evidence / status / confidence:** **Supported** external mechanisms; transfer to FiFeCode **Unresolved**.
- **Behavior and code:** Gemini documents shadow-Git checkpoints; OpenHands reports event replay/persistence in its own implementation; Codex/DeepSeek use durable history. FiFeCode already has durable events, session recovery, and snapshot/revert/diff components identified by the packages.
- **Current/upstream status:** Peer/source-package evidence; no current runtime parity or crash test.
- **Root cause / competing explanations:** Independent recovery can protect against agent mistakes, but another state store can diverge and add filesystem/permission costs.
- **Practical consequence:** A second checkpoint system is not justified merely because Gemini has one. Existing recovery boundaries should be measured first.
- **Candidate directions / tradeoffs:** Reuse existing snapshots/events and compare restore semantics; Windows filesystem and workspace permissions matter.
- **Benefit evidence required:** Injected crash/edit/restore fixtures with independent final-state checks, stale-success rate, recovery time, storage cost, and accepted-task continuity.

### FIFE-039 — Minimal controls and selective orchestration are necessary counterevidence to complexity

- **Domain / class / priority / disposition:** D1/D4/D8; narrative engineering-principle synthesis; **Protect evaluation simplicity**; **Retain as design constraint**.
- **Original sources / comparison:** A mini-SWE-agent/Pi/multi-agent cautions; B/C selective delegation and complexity discussions. Agreement that more orchestration is not inherently better.
- **Evidence / status / confidence:** **Supported** as methodological/architectural guidance; no universal quantitative effect.
- **Behavior and code:** mini-SWE-agent supplies a minimal model/shell control; FiFeCode already supports subagents/background work. External multi-agent results are task-specific and often increase token use.
- **Current/upstream status:** Applies to future evaluation, not a defect in existing subagents.
- **Root cause / competing explanations:** Delegation helps separable exploration, independent review, and noisy-output isolation; shared-state editing/serial debugging may suffer coordination and fresh-context costs.
- **Practical consequence:** Prevents agents, routers, memory, and indexes from being adopted solely for sophistication. A simpler no-change condition can win.
- **Candidate directions / tradeoffs:** Preserve selective use and minimal controls; measure all-child cost, delay, conflicts, review burden, and acceptance.
- **Benefit evidence required:** Separable versus serial tasks with delegation/no-delegation and minimal/full-harness controls, repeated runs, complete cost/time, and inconclusive results retained.

### FIFE-040 — Deferred external leads and excluded evidence bound the research scope

- **Domain / class / priority / disposition:** D8/D9; research-completeness control; **No implementation priority**; **Defer/reject specified evidence**.
- **Original sources / comparison:** C `D-01`–`D-04`; A/B screened-only lead lists. Agreement that named-system discovery is not exhaustive audit.
- **Evidence / status / confidence:** **Verified** stated scope decisions; underlying deferred systems not re-evaluated.
- **Behavior and code:** Goose deep audit and exhaustive harness inventory were deferred; internally inconsistent prompt-injection aggregate statistics were excluded; live provider pricing/performance optimization could not answer accepted-task efficiency without outcomes.
- **Current/upstream status:** Research limitation, not FiFeCode runtime behavior. No negative claim is made about deferred products.
- **Root cause / competing explanations:** Evidence saturation for named questions and lack of authoritative/comparable data; future authoritative sources could justify reopening.
- **Practical consequence:** The dossier must not be represented as an exhaustive market survey, security meta-analysis, or live pricing guide.
- **Candidate directions / tradeoffs:** Reopen only for a decision-relevant evidence gap; avoid padding comparisons with unverified product claims.
- **Benefit evidence required:** Authoritative versioned source and a specific decision the added evidence could change; pricing alone remains insufficient for task value.

## 4. Register completeness and use constraints

- Confirmed defects/contract issues: FIFE-001, FIFE-003, FIFE-008, FIFE-013; FIFE-007 is a confirmed implementation limitation.
- Probable/supported deficiencies or risks: FIFE-002, FIFE-004–FIFE-006, FIFE-009–FIFE-012, FIFE-014.
- Opportunities without demonstrated deficiency: FIFE-011, FIFE-015–FIFE-017, FIFE-019, FIFE-022–FIFE-026, FIFE-035–FIFE-039.
- Measurement/interpretation gaps: FIFE-006, FIFE-012, FIFE-017–FIFE-021, FIFE-033–FIFE-034, FIFE-037, FIFE-040.
- Existing strengths: FIFE-027–FIFE-034, with FIFE-031–FIFE-034 carrying explicit limits.

This register supplies evidence and candidate directions for a separate planning assignment. It does not authorize repository changes, choose implementations, or provide a step-by-step plan. Runtime and local/deployment gaps remain visible in each entry and in the [ledger’s limitations](fifecode-research-reconciliation-ledger.md#8-outstanding-evidence-gaps-and-limitations).
