# Evidence-Based Design of AI Coding Agents and Software Development Workflows

**Research report | Evidence assessed through 4 November 2026**  
**Intended use:** design reference and subsequent file-level QA/QC of a personal, supervised, specification-driven OpenCode FIFE workflow.  
**Scope:** literature and publicly documented systems, **not** inspection or evaluation of the user's agent definitions, fork, or software.  
**Status:** research synthesis complete for design-review purposes; comparative validation on the actual FIFE harness remains outstanding.

> **How to read this report.** Citations such as **[S09]** refer to directly linked original publications or documentation in §16. An observed result on a benchmark is not a prediction about FIFE. **Measured** means the specific study measured that outcome; **engineering-supported** means a defensible implementation practice rather than a demonstrated gain for FIFE; **unverified** means an open hypothesis. Dollar values are historical experimental costs, not current model prices.

## 1. Executive summary

### Most defensible decision

**Preserve the four functions—requirements/specification, implementation, testing, and independent QA—but do not force four LLM agents to execute on every task.** For personal use, the best initial design is a **small, deterministic workflow controller plus three regularly active LLM roles** (Spec Writer, Implementer, independent QA/reviewer), with **automated test tools always available and the dedicated Tester invoked when test design, coverage discovery, failure diagnosis, or risk justifies its cost**. Keep the fourth agent definition available; do not eliminate it based on currently inadequate evidence. Human approval of the specification precedes write-capable implementation. This is an **engineering recommendation**, not the measured winner of a four-vs-three-agent coding trial.

This conditional structure preserves the proposed investment and makes its value falsifiable. If the Tester routinely finds defects or missing behaviors the Implementer and QA miss, use it more frequently. If it mostly duplicates deterministic tests, do not require it for every trivial edit. QA is a **separate acceptance judgment**, not another request to report that tests passed.

### Highest-confidence findings

1. **Agent count is not a reliable performance lever.** A controlled study of 260 configurations across six agentic benchmarks—including software engineering—found benefits on parallelizable tasks but 39–70% relative deterioration on one sequential-planning benchmark; on 20-issue SWE-bench Verified subsets, multi-agent averages were modestly worse; a 133-problem coding comparison found 98.50% single-agent versus 97.74% multi-agent acceptance, with approximately fourfold elapsed time for the latter. These are task-specific, not direct FIFE results. [S01, S05]
2. **Well-grounded independent verification is promising.** A 2026 comparison of 17 verification designs across seven coding models reported independent-review improvements of 5.9–9.5 percentage points on Terminal-Bench and 3.9–6.6 points on SWE-bench Verified, at measured cost multiples of 1.13–1.25 and 1.00–1.04, respectively. Those benchmarks have limitations; independent review need not mean a fourth persistent agent. [S16, S27]
3. **More instructions are not automatically better.** A study across SWE-bench and a newly built 138-task CTXbench found repository context files did not significantly improve success and generally raised costs; another paired study of 124 PR tasks found lower median runtime with AGENTS.md but did not verify patch correctness. These results apply to **repository context files**, not a controlled head-to-head comparison of longer and shorter role prompts. [S09, S10]
4. **Deterministic evidence should anchor acceptance.** Strengthened tests invalidated 19.78% of previously passing SWE-bench Verified patches in one study. Independent critics can also over-reject valid changes when generated evidence is unreliable. Test success, coverage, reviewer approval and completion are **distinct claims**. [S20, S19]
5. **Writing specs is not itself a demonstrated defect-reduction intervention.** A 2026 analysis of 88,052 PRs found no significant reduction attributable to ordinary specification-related artifacts after adjustment. It explicitly did **not** test modern agent-produced SDD artifacts. A separate controlled repository-planning study produced 5/7 valid migrations versus 0/7 in its baselines, indicating planning can help particular interdependent tasks. [S24, S08]
6. **Harness controls and context handling matter independently of the model.** Carefully designed agent-computer interfaces, repository retrieval and long-session compaction exhibit measured effects; permissions, validation gates and safe execution must be enforced by software, not promises written in a Markdown prompt. [S07, S13, S14, S29, S31]
7. **Measure outcomes, not just benchmark rankings or the feeling of speed.** One randomized field study observed a 19% slowdown for experienced maintainers given early-2025 AI, while three other workplace field experiments found a 26.08% increase in completed tasks among users with access to a coding assistant. Context, cohort, outcome and tools differed substantially. [S25, S26]

**Confidence:** High that simple baselines, independently checkable results, minimal privileges and task-specific context are appropriate design constraints. Moderate that conditional independent review improves the likely quality/cost balance. Low that exactly three routinely active LLM roles outperform exactly four for a personal OpenCode fork; no credible matched experiment establishes that comparison.

## 2. Research methodology

### Search and selection

The investigation surveyed primary conference and journal proceedings, arXiv research reports, original benchmark audits and releases, official OpenCode documentation, OWASP guidance, and original study/reproducibility pages. Searches covered single-/multi-agent software engineering, agent scaling, AGENTS.md experiments, role instruction files, code planning, test generation, review agents, runtime verification, prompt injection, memory/context compaction, repository retrieval, benchmark reliability and field productivity. Backward connections to SWE-agent, AgentCoder, agent failure taxonomies and self-correction research were followed where material; newer 2026 studies were deliberately included. The source list includes supportive, negative, null, and contradictory evidence.

Sources were weighted by: task resemblance; controlled and matched baselines; measured correctness rather than proxy metrics; reproducible code/data; stated model and harness; leakage and grader risk; statistical uncertainty; and relevance to contemporary models. Peer review is recorded where identifiable, but does not excuse weak causal inference. Vendors' original measurements are included with their conflicts of interest identified. The main empirical table preserves key experimental conditions and limitations instead of averaging incompatible scores.

### Limits of this evidence review

This is a **structured narrative review**, not a registered systematic review or meta-analysis: no exhaustive bibliographic database export, PRISMA flow, formal risk-of-bias scoring, or independent replication was conducted. Full text was inspected for several pivotal HTML-accessible papers, while for some sources only the publisher's detailed abstract and public results were accessible. Original paper links are supplied for inspection; statistical or model settings not in available sources are reported as **not established**, not filled by inference. Newly published Oct–Nov 2026 preprints have had limited time for independent confirmation. Some studies reuse the same public benchmarks and may share contamination or scorer defects.

**Critical distinction:** studies of *repository-level context files* are not direct experimental tests of *agent role-definition Markdown*; prompt-only interventions are not equivalent to workflow engines; isolated coding exercises are not equivalent to multi-file repository maintenance; and increased review detection does not prove production-ready autonomous acceptance.

### Evidence classification and strength

- **Empirically supported:** a measured effect under the reported study conditions. **High** confidence requires strong design and applicable tasks; **moderate** indicates material external-validity or evaluation limitations; **low** indicates small samples, weak baselines, proxy outcomes or unreplicated preprints.
- **Engineering-supported:** good design or security reasoning documented in practices or system behavior, without a direct outcome experiment answering FIFE's question.
- **Plausible / unverified:** useful hypothesis without adequate comparative demonstration.
- **Contradicted / inconclusive:** conflicting evidence or no consistent benefit.

The classifications apply to **the claim as worded**, not to the blanket superiority of a technique.

## 3. Definitions of agent effectiveness

A sound evaluation needs several measures because no single number captures task correctness, operating cost and safety.

| Metric / construct | What to measure and why | Feasible measurement | Key limitation / proxy risk |
|---|---|---|---|
| Functional success / acceptance | Work satisfies user-visible requirements | Held-out behavioral tests plus independent acceptance review | Hidden tests can be weak, narrow or wrong [S20, S27] |
| Correctness beyond tests | Semantic behavior, edge cases and invariants | Adversarial tests, property-based tests, differential checking, manual sample audit | No finite test suite proves general correctness |
| Defects introduced and escaped | Regressions and latent faults | Confirmed regression reports, fault seeding, post-merge follow-up | Delayed detection and attribution bias; low sample size |
| Defects detected | True positives in testing or QA | Seeded defects, labeled faults, precision/recall/F1 | A benchmark with known bugs may not quantify false alarms on clean changes [S18] |
| Repeatability | Similar result over independent attempts | Repeated runs of identical task/model/harness with rate + dispersion | Sampling variability, provider changes, state drift |
| Specification clarity | Unambiguous observable behavior and constraints | Independent raters, clarification count, missing-criteria audit | Longer specs may score better on coverage while accomplishing nothing [S11, S24] |
| Requirement traceability | Each accepted requirement linked to implementation and checks | Coverage of requirement IDs by changed components and test evidence | Links can be fabricated or meaningless |
| Test adequacy | Tests can reveal faults and guard regressions | Risk-weighted scenarios; targeted mutation tests; historical regression replay | Line/branch coverage and mutation scores are imperfect proxies [S21, S22, S20] |
| Scope discipline | Unapproved file changes, dependency upgrades, commands | Compare actual diff / command log with approved scope | Some justified indirect changes need human interpretation |
| Human intervention | Clarification, approval, rescue, rollback | Count and categorize interventions per completed task | Low intervention may hide unrecovered mistakes |
| Handoff fidelity | Whether recipient retains requirements, constraints, status and evidence | Blind reconstruction or controlled missing-information checks | A nice report can still be factually stale |
| Recovery success | Resumption after interruption without repeat/contradiction | Interrupt at defined checkpoints, restart from artifact, measure completion | Extra persistence can create maintenance overhead |
| Efficiency | Total tokens, wall time, tool calls and monetary cost **per accepted task** | End-to-end telemetry including rejected/retried work | Cost per attempt rewards cheap failure; cached-token billing varies |
| Risk / security | Unsafe commands, privilege violations, injection success, exfiltration | Permission logs, policy-denial tests, red-team scenarios [S30, S31] | Safety may not track task benchmark performance |
| Complexity / maintenance | Agents, routing conditions, contracts, config divergence | Number of active roles, branches, updates and failures | Counting files is not a direct complexity metric |

**Primary decision metrics:** independently accepted task success rate; confirmed severe defect escape rate; unauthorized-action rate; and **total cost/time per accepted and verified task**. Use testing quality, context size, steps and token counts as supporting diagnostics. A zero-observed-defect rate with 10 tasks is not a reliable guarantee of safety.

For a fixed task distribution: `cost per accepted task = all run, retry, review and correction costs / number independently accepted`. Similarly, `time per accepted task = total end-to-end elapsed time / independently accepted tasks`. Compare architecture A and B on the **same tasks** (ideally randomized order and multiple runs), report confidence intervals and cost–quality tradeoffs. Do not collapse incomparable dimensions into an unvalidated universal score. A verification stage that raises success from 60% to 70% while increasing cost from $1.00 to $1.10 per attempt reduces expected cost per success from $1.67 to $1.57, **if** attempts are comparable, independent, and retry behavior is otherwise unchanged. This is only an illustrative arithmetic example, **not** a research result.

### Which outcomes conflict?

More exploration may increase defect detection yet increase spend and latency. A stronger QA critic may reject more bad patches *and* more good patches [S19]. Strict scope controls protect intent yet can obstruct necessary changes. Formal approval reduces autonomy and may improve predictability without improving raw task throughput. Larger context can improve evidence availability but distract attention, reduce cache efficiency, or expose untrusted material. Select policies according to task risk rather than maximizing one proxy.

## 4. Fundamental agent design findings

### 4.1 Instructions: explicit interfaces, minimal unnecessary process

**Measured:** In Gloaguen et al., repository guidance often induced more navigation and test execution without a statistically meaningful increase in solved tasks and raised average cost [S09]. Lulla et al. found a 28.64% lower **median runtime** and 16.58% lower **median output-token use** when AGENTS.md was present for their paired PR runs, but they did not establish correctness equivalence through a full functional evaluation [S10]. Another survey of 3,387 agent instruction files found 16.1% of 386 paired sections in multi-format files gave divergent guidance; its template intervention improved structural coverage, not demonstrated coding success [S11].

**Counterexample and length caveat:** In the same AGENTS.md paper, the researchers found no clear relationship between context-file length and task success within the studied ranges. When they **removed other repository documentation**, generated context files became more useful, improving average resolution by roughly 2.7 percentage points in that special ablation. This supports context that supplies genuinely missing information; it does not demonstrate a longer or shorter role-prompt optimum [S09].

**Interpretation:** A Markdown file needs to state *what the agent is for, what it may do, when to stop, and how to hand off*. It does not follow that every edge case belongs in a permanent prompt. Repetition, speculative rules, mandatory lengthy reports and universal multi-step rituals can impose measurable work. Useful specificity is task-relevant and observable: “report command, exit status and failing tests” is verifiable; “be extremely rigorous” is not.

**Evidence gap:** No retrieved controlled study cleanly varies only **role-prompt length** with identical semantic content, fixed model, toolset, tasks and total budget. Therefore there is **no defensible universal optimum in tokens, headings, YAML fields, few-shot examples, or the ratio of rules to prose**. Use examples for unusual output contracts only when they resolve real ambiguity. A structured Markdown body improves human inspectability, while machine-enforced schemas are superior for fields that cannot be missing. Avoid including model-specific behavior theories unless verified for the selected model.

A compact, inspectable agent-file structure is: **purpose and phase → authorized actions and escalation → required inputs → decision process with conditional branches → verification and success criteria → handoff artifact → exceptional recovery behavior**. This is an **engineering template**, not a proven ranking of headings. Security-critical permission limits belong in the OpenCode configuration, regardless of what the body says.

### 4.2 Context engineering: retrieve relevant evidence rather than dumping the repository

Repository relevance is measurable before coding: Agent Retrieval Bench contains 427 samples from 25 repositories; logged agent retrieval trajectories missed all gold files on 27–35% of evaluated samples, and different retrievers won under different token budgets [S13]. A classic long-context study found important evidence placed in the middle of context was often used less reliably than evidence near the beginning/end; modern models may differ, so treat this as a risk mechanism rather than a fixed current failure rate [S12]. Agentless and CodePlan show that localized evidence and dependency-aware changes can work with limited autonomy [S03, S08].

**Practical implications:** start with the request, related files, entry points, and dependency links; expand through targeted search after encountering uncertainty. Distinguish verbatim requirements from a short working summary. Carry exact file paths, line references, failing commands and known constraints across handoffs. For large sessions, store durable state **outside** the context window, with a version/commit anchor and pointers to primary evidence. Do not pretend a compressed narrative is equivalent to the code or fresh test output.

Microsoft's CompactionBench production analysis covered 13.5 million Copilot coding sessions: the 7.8% of sessions using compaction accounted for 44.2% of token consumption. Its proposed asynchronous progressive method reduced costs **by up to** 25.4% and execution time 9.6% in its evaluated settings [S14]. **This supports investment in harness-level context lifecycle controls for long sessions**, not an instruction for every agent to write a long checkpoint after every tool call.

### 4.3 Tools, permissions and autonomy

SWE-agent's original results and interface study establish that tool and environment design can materially influence coding outcomes [S07]. An agent needs *usable* read/search/edit/test tools more than elaborate process language. The tool environment should offer bounded outputs, deterministic exit statuses, sandboxed command execution, and a reliable way to inspect diffs and restore states.

**Measured rule-compliance limitation:** A 2026 evaluation of 106 issues from 49 repositories across four coding-agent/model pairs found that agents proactively opened non-automatically-loaded contribution-policy files in only 3.5% of runs. Their unaided refusal and human-handoff compliance was 0% in that test; quoting rules or providing verifier feedback helped disclosure and test-verification rules much more than refusal/handoff rules. This is direct evidence that instructions in an unseen repository file are not a dependable supervision boundary, and that merely repeating a rule may not enforce a stop. It does **not** show that all agents will ignore every explicit role instruction [S35].

**Security practice:** OWASP recommends least privilege, authority separation, input-trust boundaries, bounded delegation and human review for consequential operations [S31]. AgentDojo established realistic prompt-injection risk across 97 legitimate tasks and 629 security test cases, although not specifically the OpenCode fork [S30]. An instruction such as “do not delete files” is not a security boundary if the agent has unrestricted shell permissions. Enforce write scope, external access, secrets handling, destructive command approval and allowed subagents through **actual tool permissions and host policy**. Treat repository files, retrieved web pages, tool outputs, issue descriptions and subordinate-agent messages as **data** unless explicitly elevated by a trusted actor.

Autonomy should be tiered: the Implementer may make routine design choices consistent with the approved spec; material requirement or architecture conflicts return to the Spec Writer/user; unfamiliar or disruptive commands require approval; Reviewer should be read-only by default; Tester may execute preapproved safe tests in isolated environments but should not silently modify source to make failures pass. This is an engineering application of risk control, not a randomized proof that this exact tier system optimizes speed.

**OpenCode implementation caveat:** official **V1 and V2 documentation show different configuration shapes and agent/permission conventions** [S32, S33]. The actual FIFE fork and revision must be inspected in the later file QA/QC session before treating any proposed frontmatter field or tool permission as operational. This research does not certify the fork's parser or policy inheritance.

### 4.4 Feedback, correction, recovery and termination

Independent review and explicit correction have measured value in some controlled environments [S16, S17]; endlessly requesting self-reflection does not. Research on multi-agent failures identified 14 failure modes involving system specification, agent misalignment, verification and task termination [S02]. The EET intervention reduced expense by 19–55% (32% average) across three SWE-bench Verified agent systems with at most a 0.2% loss in resolution rate in their settings [S15]. The lesson is to **end unproductive loops on evidence**, not allow an arbitrary agent to declare success because it is out of budget.

Adopt explicit states: `planned → approved → implementing → testing → QA → accepted`, plus `blocked`, `requires approval`, `failed`, and `inconclusive`. No step may change state solely on polished prose. Completion requires an accepted spec reference, known changed files, verification evidence, unresolved-risk statement and independent decision. Set a bounded correction loop and escalate repeating/same-class defects instead of recirculating indefinitely. Resume from a file-backed checkpoint only if the saved repository revision and current tool state still match.

### 4.5 What instructions should not try to enforce

Do **not** rely on agent text to enforce access controls, budget accounting, test exit codes, full-file diff bounds, command allowlists, schema completeness, state transitions, secrets filtering, or exact recovery anchors. Put those in deterministic programs when the fork supports them. Agent prompts should explain how to interpret tool feedback and what decisions require escalation. This split reduces opportunities for agents to hallucinate compliance or silently bypass checks.

## 5. Role-specific findings

### 5.1 Spec Writer — requirement and feasibility owner

**Core:** establish user intent; inspect repository interfaces and constraints; distinguish confirmed facts, assumptions and unanswered choices; specify observable behavior and nonfunctional constraints; define scope/exclusions, acceptance criteria, regression concerns and affected interfaces; obtain explicit human approval; issue a versioned handoff. **Autonomy:** research and resolve routine low-impact details, but do not silently select a materially different product behavior, security policy or migration. **Inputs:** user request, relevant repository evidence and allowed constraints. **Outputs:** approved spec ID/revision with requirements, acceptance criteria, risks, verification targets and known open decisions.

**Failure modes:** enormous upfront specs for simple edits; treating implementation guesses as approved requirements; unverifiable criteria (“user-friendly”); missing negative/error behaviors; inventing interfaces before repo inspection; unauthorized coding; invisible post-approval changes. **Good instruction pattern:** conditional depth by complexity, evidence references for repo facts, explicit status and an approval gate. **Avoidable overhead:** separate researcher or architecture agent on every routine issue; exhaustive template blanks; duplicate spec artifacts.

**Evidence and confidence:** CodePlan's 5/7 vs 0/7 repository-valid results support planning for interdependent edits in its 2024 study [S08]; the 2026 specification-artifact null study prevents claiming that adding spec documents generally reduces defects [S24]. No direct randomized test establishes that a dedicated Spec Writer outperforms a general agent on comparable real tasks. **Classification:** engineering-supported role boundaries; moderate empirical support for *planning when change dependencies matter*; low/inconclusive evidence for universal formal SDD. **Markdown implication:** specify a clear approval-blocking output, not a compulsory long design document for trivial changes.

### 5.2 Implementer — approved change owner

**Core:** load approved spec and repo state; localize affected code; select small coherent edits; follow existing architecture; update tests as needed; inspect diffs; perform safe self-checks; preserve a verifiable handoff. **Autonomy:** edit within explicit allowed scope; choose routine implementation details; escalate material conflicts, broad migrations, external integration changes or security authority changes. **Inputs:** approved spec revision, branch/commit, repository constraints. **Outputs:** diff/commit, acceptance criterion mapping, executed checks/results, deviations, remaining risks and handoff status.

**Failure modes:** solving a neighboring problem; overbroad refactor; adding dependencies unnecessarily; ignoring failing test commands; claiming completion on unexecuted assertions; altering tests to hide defects; continuing after spec conflicts. **Effective pattern:** inspect → change a small unit → run targeted checks → inspect diff → summarize evidence; expand scope or delegate only when justified. **Avoidable overhead:** mandatory full-repository reads, repeated planning for localized edits, unconditional specialist spawning, long progress memos after every small action.

**Evidence and confidence:** tool/interface design [S07], simple localized repair [S03], dependency-aware planning [S08], and early termination [S15] directly support mechanisms, not a specific Implementer prose template. MASAI's modular design reached 28.33% on SWE-bench Lite but cannot prove that more agents were the cause because the baseline/tool/strategy comparisons differ [S04]. **Classification:** moderate empirical support for tool/retrieval/feedback mechanisms; engineering-supported authority boundaries. **Markdown implication:** use an explicit change-scope contract and evidence-oriented completion definition.

### 5.3 Tester — test-design and execution owner, potentially conditional

**Core:** translate acceptance conditions into executable behavioral cases; prioritize changes by risk; cover failure modes, boundaries and regressions; run approved deterministic commands; reproduce failures; separate assertion failures, environment errors, flaky tests and unexecuted work; report command, exit code, environment, code revision and relevant output. **Autonomy:** execute vetted commands in a safe environment; seek approval for unfamiliar/destructive operations; do not silently rewrite product requirements or greenwash failures. **Inputs:** spec, source diff, existing test inventory, build environment. **Outputs:** planned/added/ran/skipped tests, reproduction steps, results, limitations, confidence gaps.

**Failure modes:** executable but shallow tests; asserting current implementation instead of requested behavior; treating coverage as correctness; contamination from developer-written tests; flaky environment; removing or weakening failing assertions; marking a skipped test as passed. **Effective pattern:** prove test can fail against known wrong behavior where feasible, test edge cases, run existing tests, and record outcome provenance. Prioritize negative and boundary conditions in proportion to risk. **Avoidable overhead:** independent LLM test-generation pass for every one-line change where existing deterministic tests already cover the risk; redundant full-suite runs when a clear conditional test policy applies.

**Evidence and confidence:** an exploratory 12-method study found improved mutation/coverage from richer documentation and sequential prompting but at 187% greater computational cost; the sample is too small for universal rules [S21]. A large test-generation under program changes study observed degradation on edited programs [S22]. SWE-ABS shows that passing tests can miss semantic bugs [S20]. AgentCoder's multi-role test feedback improved isolated benchmark results, but does not isolate the value of a separate Tester in repository workflows [S06]. **Classification:** moderate empirical support for test quality, execution and risk adaptation; **low** direct support for always-on tester role. **Markdown implication:** expose clear execution permission, provenance and “not run/inconclusive” fields; make independent Tester invocation risk-driven.

**Additional testing caution:** A September 2026 study assessed 6,066 selected **challenging LLM-generated faulty programs** from five models and four benchmarks. In that restricted setting, maximizing statement/branch/mutation criteria triggered about 32.9%/38.9%/32.2% of faults, but generated tests with their associated assertions detected only about 1–2%. Those numbers do **not** apply to all defects—researchers deliberately selected the hardest nontrivial faults—but they sharply illustrate why coverage and mutation proxies cannot substitute for checking **whether test assertions actually reject incorrect behavior** [S34].

### 5.4 QA — independent acceptance assessor, not a second tester

**Core:** compare the *approved spec* with the *actual patch and demonstrated behavior*; evaluate test sufficiency and uncovered risks; inspect architecture, maintenance and security; identify defects with repro/evidence; assign severity; recommend accept/rework/block; verify correction without changing the target under review. **Autonomy:** read-only inspection, safe independently executed checks where authorized, reject/escalate with evidence; no approval to bypass the user or waive mandatory policies. **Inputs:** approved spec, source diff, build/test logs, relevant repository context. **Outputs:** requirement-by-requirement disposition, grounded findings, rejected/accepted status, verification gaps, next owner.

**Failure modes:** rubber-stamping the Implementer's summary; pure style comments unrelated to behavior; false-positive floods; accepting on a green CI badge; lacking context for cross-file effects; spending all compute on speculative defects; conflating code-review findings with deployment approval. **Effective pattern:** first understand the requested behavior, then inspect the patch; verify claims against code/tools; separate observed defects from suspected risks; show file/line and reproduction; avoid citing unverifiable command claims. **Avoidable overhead:** multiple critics on every routine diff; reviewer rewriting code and losing independence; circular discussion without new test evidence.

**Evidence and confidence:** independent critic experiment [S16] gives **moderate** support for review as a distinct checking function; CRBugBench's 1,000 open-source and 800 internal tasks show strong but incomplete bug detection (71.9% of known bugs in top five comments for one configuration) [S18]; SWE-Review demonstrates useful review→revision patterns [S17]. Groundability research found some weak reviewers over-rejected **66–67%** of accepted patches they saw in a frozen cascade, warning against ungrounded rejection [S19]. No direct study proves that a permanently separate **QA agent** outperforms a combined tester/reviewer controlled for model, budget and checker information. **Classification:** empirical support for independent *review*, engineering-supported separation of review from test execution, unresolved exact staffing. **Markdown implication:** make QA read-only, evidence-grounded, severity-calibrated, with an explicit accept/rework/block decision that includes unknowns.

### 5.5 Why testing and QA are different

**Testing asks:** *Does behavior satisfy the specified checks, and how did we verify it?* It produces executable observations and failure traces. **QA asks:** *Are the requirements sufficiently addressed, is the evidence adequate, and what defects or risks remain?* It evaluates both the code and the evidence, including missing tests. QA may request or run extra tests, and a Tester may report quality concerns, but the core **decisions** are distinct even if one small team or model performs both. Separation helps independent judgment only if their information and responsibilities differ; using two agents to independently repeat the same “tests pass” statement adds little assurance.

## 6. Comparative architecture analysis

**No study identified here compares exactly the four FIFE roles, on the same repository work, with a fixed model, identical tools, equal compute budgets and objectively adjudicated outcomes.** The following is a tradeoff analysis informed by multi-agent evidence, not a ranked benchmark.

| Architecture | Responsibility flow | Potential advantage | Limitation and cost | Evidence and fit |
|---|---|---|---|---|
| 1 agent + deterministic tools | One model specs, edits, tests, self-reviews | Minimum handoff/context overhead; simple recovery | Same interpretation error may affect code and tests; weak independent review | Strong **baseline** to test; simpler systems can compete [S03, S05] |
| 2 agents (builder + critic) | Builder plans/implements/tests; critic independently checks | Adds scrutiny without multiple handoffs | No distinct human spec signoff unless controller enforces it | Direct critic benefit in some benchmarks [S16]; good light-task alternative |
| 3 active roles (Spec, Implementer, QA) + test tools | Approved spec → change + deterministic tests → independent assessment | Preserves approval, distinct implementation/acceptance judgment; low active-agent count | Test-design expertise may be underprovided on hard defects | **Preferred initial daily path**, engineering judgment [S16, S01] |
| 4 specialized roles (Spec, Implementer, Tester, QA) | Fully separated serial pipeline | Clear test design ownership; potentially better adversarial cases | Extra context and handoff; Tester/QA duplication risk | Sensible **high-risk mode**, not proven universally superior [S06, S19] |
| 5+ roles / dedicated Researcher / Architect | Research → spec → plan → build → test → review; often manager | Depth, parallel domain expertise, isolation | Coordination failures, token inflation, divergent decisions | Only for naturally decomposable exceptional tasks [S01, S02] |
| Manager–worker | Orchestrator delegates bounded subtasks | Coordinates parallel research and heterogeneous tools | Orchestrator bottleneck and routing errors | Positive effects in parallelizable noncoding benchmarks, not proof for sequential coding [S01] |
| Evaluator–optimizer loop | Agent proposes, critic provides evidence, agent revises | Focused correction may raise success | Can chase false positives or consume budget in circles | Positive empirical support with caps [S16, S17, S19] |
| Hybrid tools/skills | Fewer LLM roles; code search, tests, policy, diff analysis handled by software | More deterministic outcomes; less repeated reasoning | Requires reliable harness integration and maintenance | Strong engineering rationale and tool evidence [S07, S31] |

**Architecture conclusions:**

- **Single-agent can win** when work is small, sequential, well specified or tools do the checking [S03, S05].
- **Specialization can win** when subtasks are independent or require meaningfully distinct knowledge, environment access or evidence—not merely distinct job titles [S01, S06].
- **A separate research/architecture agent is optional**: appropriate for uncertain integrations, repo-wide decisions or external evidence collection, but not default for every feature. The Spec Writer can retrieve targeted material; an authorized specialist can investigate without editing.
- **Dedicated orchestrator agent is not currently justified.** A deterministic workflow controller should manage phase transitions and approvals. Add an LLM manager only if measured routing or concurrency demands exceed what the controller can handle.
- **Combining Tester and QA is an available cost-saving alternative**, but combining their *decisions* risks replacing evidence checks with self-attestation. The better first experiment is to **keep two functions but call one specialized Tester conditionally**.

In the broader **260-configuration, six-benchmark** study, multi-agent designs benefited decomposable financial work, suffered on sequential PlanCraft, and on **20-instance SWE-bench Verified subsets** averaged **2–15% lower performance** across the multi-agent architectures. Individual model/configuration results varied widely, and the study did **not** compare the FIFE four-role SDD design [S01]. In a direct LeetCode comparison (133 problems, three repetitions), single-agent acceptance was 98.50% vs 97.74% for four-role multi-agent, at about four times the elapsed generation time [S05]. This is powerful evidence against **default proliferation on small programming tasks**, not proof that multi-agent software maintenance is inferior. Conversely AgentCoder and MASAI provide positive existence proofs for specialized collaboration but do not establish that their role count causes the improvement under fully controlled resource matching [S06, S04].

## 7. Workflow, handoffs, correction loops and closeout

### Proposed reliable phase contract

```text
USER REQUEST
   ↓
SPEC WRITER — context/requirements/acceptance criteria
   ↓
HUMAN APPROVAL  ←────────────────── material ambiguity / scope change
   ↓
IMPLEMENTER — scoped change + targeted self-checks
   ↓
TEST GATE — deterministic runner; optional Tester for risk/coverage/failure analysis
   ↓
INDEPENDENT QA — spec compliance + code quality + evidence sufficiency
   ├── ACCEPT → final closeout (with unresolved limitations disclosed)
   ├── REWORK → scoped Implementer correction → re-test → re-review
   └── BLOCK / CHANGE REQUEST → user or Spec Writer; no silent spec change
```

**Contract fields** (enforced by a schema/controller where feasible): `task_id`, `spec_revision`, `repo_revision`, `approved_scope`, `acceptance_criteria_ids`, `changes`, `checks` (command/exit_code/timestamp/environment/result), `skipped_checks`, `open_risks`, `decisions`, `next_owner`, and `status`. The user approves a concrete immutable spec revision; later revisions invalidate approval or trigger reapproval as appropriate. Exact timestamps are useful only where telemetry is trustworthy.

### Handoff rules

1. **Authority and change ownership:** only the designated write-capable role edits source during a handoff stage; Tester can author tests if explicitly authorized and independently verified; QA normally only observes and reports.
2. **Evidence not narrative:** include the actual file diff references and command outcomes. A statement such as “verified” without logs, reproductions or traceable artifacts is **unverified**.
3. **Revision anchoring:** report commit/working-tree identity and spec revision; a fresh check is required when changed source invalidates prior evidence.
4. **Exactly one next owner:** explicitly identify whether correction belongs to Implementer, Spec Writer/user, or environment/tool maintainer. Do not bounce issues endlessly between Tester and QA.
5. **Bounded iteration:** permit a small number of evidence-producing repairs; escalate unchanged errors, scope expansion or uncertain security behavior. No universal ideal attempt count was demonstrated by the literature; tune it later.
6. **Failure states:** `FAILED` (check executed and rejected), `NOT_RUN` (not executed), `BLOCKED` (prevented by policy/dependency) and `INCONCLUSIVE` (execution cannot determine behavior) must not be called `PASSED`.
7. **Interrupts:** persist a concise checkpoint for migrations, changed cross-system invariants, handoff blockers or long tasks; resume against current code and stale evidence checks. Routine tiny tasks need only structured final output.

**What to code rather than merely write:** policy gates for approval; state machine; tool/command permissions; per-stage time/budget ceilings; diff filters; check-output capture; retry caps; status schema; permission denials; test-run identity and provenance; and automatic detection of changed code since a test ran. A Markdown instruction may request these but cannot reliably enforce them alone [S31, S32].

## 8. Efficiency, tokens, model capability and operational cost

**Compare complete accepted results, not per-call unit prices.** Total expected cost combines prompt/context tokens, model reasoning/output, tool/host work, parallel children, testing, corrections, discarded patches and human time. A cheap model that creates five review cycles may be more expensive than one strong model that succeeds once. Expose not only total tokens but **tokens per independently accepted task** and **verification added cost versus added correct acceptances**.

**Study-based effects:**

- EET reduced agent costs by 19–55% on its three SWE-bench Verified systems, with at most 0.2% resolution-rate loss, by stopping low-value work [S15]. This does not justify skipping required tests or QA.
- Repository context files can **increase** inference spending above 20% with no substantial gain in success [S09], or **decrease** runtime/output tokens in another configuration [S10]. Information quality and task match matter more than a blanket “always include AGENTS.md” rule.
- CompactionBench shows that costly context handling can dominate long sessions, with a harness-level approach offering measured reductions [S14]. Avoid forcing duplicate entire-spec/repo text through each child; share compact references and read original evidence on demand.
- A controlled review intervention can yield accuracy gains at modest relative cost [S16], but aggressive review without decisive signals can over-reject valid solutions [S19]. Optimize **net accepted quality**, not number of findings.
- Vendor and model-specific behavior matters [S01]. There is no defensible fixed rule that the cheapest model handles QA, or that the strongest model must orchestrate. Measure at least two model capability tiers with fixed environment and budget.

**Practical operating policy:** use one high-capability execution agent for actual changes; cheaper read-only exploration only where measured to save end-to-end cost; deterministic test runners before a second model examines obvious syntax or type errors; independent QA after material changes; sample audit for low-risk simple edits when policy permits; escalation for irreversible changes. Record cost by **phase** so coordination overhead is visible.

**Human productivity counterevidence:** in METR's randomized field experiment, 16 experienced maintainers took 19% longer to complete 246 issues when early-2025 AI tooling was allowed [S25]. In separate field experiments totaling 4,867 enterprise developers, AI-completion access was associated with 26.08% more completed tasks (SE 10.3%) [S26]. The first used familiar mature repositories and timed actual issue completion; the latter used workplace task counts and different assistance. These cannot be averaged; the disagreement reinforces local measurement.

## 9. Empirical evidence table

**Interpretation key:** pp = percentage points; relative changes and score differences are not interchangeable. “Not reported here” means the available primary-source description did not provide a verified value. Multiple experiments using SWE-bench Verified share a compromised benchmark and are not independent confirmation of true production correctness [S27].

| ID | Study, design and sample | Models/baseline and reported outcome | Limits and relevance |
|---|---|---|---|
| S01 | Kim et al. (2025; revised Apr 2026), 260 configurations across 6 benchmarks including SWE-bench Verified and Terminal-Bench; 5 architectures, 3 model families | PlanCraft: multi-agent relative loss 39–70%; Finance: max +80.8%; SWE Verified average multi-agent changes −2% to −15% with 20-issue subsets | **Includes coding**, but small SWE/terminal subsets and benchmark caveats; no exact FIFE roles |
| S02 | Cemri et al. (2025), 5 MAS frameworks; >150 tasks, analysis of 1,642 traces | Taxonomy of 14 failure modes; expert coding κ=0.88 | Failure classification, not an agent-count A/B test |
| S03 | Xia et al. (2024), Agentless, SWE-bench Lite 300 issues | 96/300 solved (32%); ~$0.70 per issue in cited study | Historical model/scaffold; not matched comparison with all newer agents |
| S04 | Arora et al. (2024), MASAI modular SWE-bench Lite 300 issues | 28.33% solved; under ~$2/issue average | Promising specialized approach; role count not causally isolated against best single-agent |
| S05 | Yu et al. (2025), 133 LeetCode tasks repeated 3 times | 98.50% single vs 97.74% multi acceptance; ~4× generation time; small code-size/complexity differences | Author-hosted paper listed as submitted; isolated puzzles, not repository maintenance |
| S06 | Huang et al. (2023), AgentCoder: programmer, test designer/executor; 9 code models, 12 enhancements | GPT-4 HumanEval/MBPP pass@1 96.3%/91.8% vs cited 90.2%/78.9%; token overhead differed | Tasks, scaffolds and budgets may not be fully matched; no direct FIFE test |
| S07 | Yang et al. (2024), SWE-agent interface design, SWE-bench and HumanEvalFix | 12.5% and 87.7% pass@1 historically | Evidence tool interfaces matter; original scores are obsolete for model rankings |
| S08 | Bairi et al. (FSE 2024), CodePlan; repo migrations and edits across 7 examined repos | Valid change/build 5/7 vs 0/7 same-context baselines without planning | Small focused sample; supports planning for interdependent edits, not universal SDD |
| S09 | Gloaguen et al. (2026), SWE-bench/CTXbench; CTXbench 138 tasks, 12 repos, 4 reported models | No significant task success gain from context files; extra inference cost >20%; human files outperform auto-generated by ~7% average | Preprint; repo context not role prompts; Python tasks and study-specific agents |
| S10 | Lulla et al. (2026), paired AGENTS.md presence/absence over 124 PRs, 10 repos | Median elapsed time −28.64%; median output tokens −16.58%; median **total** tokens slightly higher | Main correctness not rigorously verified; smaller scope and different conditions than S09 |
| S11 | Shanto et al. (Nov 2026), 3,387 instruction files, 1,000 repositories | 16.1% divergent guidance across 386 paired sections; template category coverage 18.7→82.8% | Structural fidelity metric, **not downstream coding correctness**; new preprint |
| S12 | Liu et al. (TACL 2024), long-context QA/retrieval positional experiments | Relevant evidence in middle less reliably used | Not coding agents/current frontier models; mechanism generalizable only cautiously |
| S13 | Qin & Xie (2026), 427 repository retrieval samples, 25 repos | Logged agent paths missed every gold file on 27–35% of samples; no one retriever dominated | Retrieval metric is an upstream proxy; does not fully prove code success |
| S14 | Liu et al. (Oct 2026), 13.5M production sessions plus controlled CompactionBench | 7.8% compacted sessions accounted for 44.2% of tokens; proposed method up to −25.4% cost, −9.6% runtime | Microsoft-specific telemetry and preprint; long horizon only |
| S15 | Guo et al. (ACL Findings 2026), EET with 3 SE agents on SWE-bench Verified | Cost −19–55% (32% mean), resolution loss ≤0.2% | Historical benchmark and implementation assumptions; not universal early stop rule |
| S16 | Zhang et al. (Oct 2026), 17 verification designs, 7 coding models, Terminal-Bench/SWE Verified | Independent review +5.9–9.5 pp TB and +3.9–6.6 pp SWE; 1.13–1.25× / 1.00–1.04× relative cost | Preprint, task and grader dependence, compromised SWE Verified |
| S17 | Wang et al. (2026), SWE-Review; 1,384 candidate PRs, review/revision experiments | Up to +29.4 pp downstream resolution reported; reviewer vs fixed-context improvements | Authors' platform and model choices; non-independent PR candidates and benchmark validity |
| S18 | Yang et al. (Oct 2026), CRBugBench; 1,000 OSS + 800 proprietary bug-introducing PRs | Best system detects 71.9% known bugs in top 5 comments; earlier Opus 4.6 config 47.7% | Models changed; benchmark emphasizes bug-positive cases; clean-PR false positives not equivalent |
| S19 | Guo et al. (Oct 2026), grounded review: 411 traces + 101 controlled cases, held-out evaluation | Frozen generated-evidence cascade coverage .89/.86; reviewer over-rejection .66/.67 for two source sets | Preprint; evidence quality major bottleneck; not direct production threshold |
| S20 | Yu et al. (ICML 2026), SWE-ABS strengthened SWE Verified grading | Rejects 19.78% previously passing patches; one top score 78.80→62.20% | Evaluation intervention; does not prove every rejection is semantically invalid |
| S21 | JSS 2026 exploratory unit-test prompting: 12 synthetic Python methods, 6 LLMs | Sequential multi-turn: **up to** 96.3% branch coverage, 57% mean mutation score, 187% greater computational cost | Small artificial sample, substantial context/model interactions |
| S22 | Haroon et al. (2026), test generation across 8 LLMs, 22,374 program variants | On semantic-altering changes, pass rate 66% and branch coverage 60%, down from baseline | Changed-program evaluation; not standalone independent Tester comparison |
| S23 | 2026 class-level Java test-generation study, 216,300 generated tests, 4 LLMs vs EvoSuite | Hallucination-driven compilation failure as high as 86% in some settings | Older model mix; method-dependent and highly variable |
| S24 | Hill (ESEM 2026), observational 88,052 PRs/119 repos; 25,209 spec-like artifacts, matching and within-author checks | Matched defect risk −0.6 pp (p=.133); no broad rework protection; **no actual SDD tool outputs** | Strong null test of *artifact association*, not causal evidence against AI SDD |
| S25 | Becker et al./METR (2025), RCT 16 maintainers/246 repo tasks | AI-allowed tasks took +19% time; users expected AI speedup | Early-2025 models, expert/repo-specific cohort, human-in-loop not autonomous workflow |
| S26 | Cui et al. (2025), 3 workplace randomized experiments, 4,867 developers | +26.08% completed task count, SE 10.3% | Coding autocomplete setting, count proxy, different population than S25 |
| S27 | OpenAI audit (2026) of SWE Verified/Pro; Scale Pro V2 release (2026) | Original Pro ~30% tasks flagged broken; V2 public split 642, 89 dropped and 69 text corrections | Audits/public benchmark selection may differ; no claim V2 is perfect |
| S28 | Baltes & Treude (Oct 2026), meta-research coding experiment reporting: 325 experiments in 146 peer-reviewed papers | Exact harness version in 15 experiments; full-session traces in 31 | Reports research transparency, not model quality; highlights confounding |
| S29 | Zhong et al. (2026), observational review conversations: 278,790, 300 repos | AI review suggestions accepted less often; >half unadopted incorrect or addressed differently | Observational; selection/social biases, not accuracy ground truth |
| S30 | Debenedetti et al. (2024), AgentDojo, 97 tasks / 629 adversarial security cases | Demonstrated prompt-injection-driven failures across agent tools | Other task domains; security mechanism generalizes more than numeric rates |
| S34 | Hamidi et al. (Sep 2026), 5 LLMs, 4 coding benchmarks; 6,066 selected hard faulty programs, generated tests and oracles | Fault triggering by statement/branch/mutation ~32.9%/38.9%/32.2%; **actual detection ~1–2%** with generated test oracles | **Challenge-selected subset**, not general defect-detection rate; assertion quality is critical |
| S35 | Yang, He & Zhou (Jul 2026), RepoComplianceBench 106 issues / 49 repos, 4 model-agent pairs | Agents opened non-automatically-loaded rule files in only 3.5% of episodes; unaided refusal/handoff compliance 0%; disclosure/verification improved with reminders and quoted rules | Specific contribution rules and agent stacks; policy-enforcement limits cannot be equated with coding pass rates |
| S31 | OWASP (current guidance), AI Agent Security Cheat Sheet | Least privilege, high-impact approval, untrusted input isolation, tool guardrails | Normative engineering/security guidance, not effect-size RCT |
| S32–33 | Official OpenCode V2 / V1 documentation | Agent Markdown location/frontmatter and permission semantics differ by version | Docs do not verify the user's FIFE fork implementation |

## 10. Evidence-to-agent-design matrix

**P0:** critical authority/correctness; **P1:** high-value; **P2:** optional or experimental. This matrix describes inspectable requirements for later review, **not** observed faults in the existing agent files. Empirical citations apply to mechanisms under specified study conditions. A standalone copy is supplied for handoff.

| ID | Design principle | Affected role | Supporting evidence | Evidence classification | Expected benefit | Suggested instruction pattern / enforcement | Tradeoff | Priority | Validation needed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SYS-01 | Require human approval of a specific spec revision before writing | System | S24, S31 | Engineering-supported | Predictable user authority | Workflow must block write phase until explicit approval and lock spec revision | Approval latency | P0 | Test unauthorized write before/after approval |
| SYS-02 | Enforce tool permissions through the harness | System | S30–S33, S35 | Engineering-supported | Prevents high-impact unsanctioned action | Permission config denies unsafe edit/shell/network by role; approvals for destructive operations | Can block legitimate work | P0 | Adversarial permission-denial scenarios |
| SYS-03 | Use explicit phase and status transitions | System | S02, S16 | Engineering-supported | Less premature acceptance | Approved→Implement→Test→QA→Accepted; fail/blocked/inconclusive tracked separately | Controller complexity | P0 | Fault-inject incomplete handoffs and verify blocks |
| SYS-04 | Ground claims in direct code/tool evidence | All | S16, S19, S20 | Engineering-supported | Reduces unsupported success claims | Every material verification claim cites command outcome, diff or reproduced behavior | Some extra logging | P0 | Audit randomly sampled completion claims |
| SYS-05 | Bound retries with escalation rules | System | S02, S15 | Engineering-supported | Fewer unproductive loops | Set retry ceilings; unchanged failure class or scope conflict escalates | May stop recoverable tasks | P1 | Compare failed retries, success and cost |
| SYS-06 | Version-anchor handoffs and stale evidence | System | S14, S20 | Engineering-supported | Resumability and valid evidence | Include spec revision, code commit/tree state, check revision and next owner | Metadata overhead | P0 | Interrupt/rebase/resume and detect invalidation |
| SYS-07 | Use compact, relevant retrieved context | All | S09, S12, S13 | Empirically supported | Less navigation overhead and distraction | Search relevant entry points first; retrieve full source only when needed | May initially miss distant dependency | P1 | Measure file recall, success, tokens |
| SYS-08 | Keep security boundaries for untrusted materials | All | S30, S31, S35 | Engineering-supported | Less injection/tool misuse | Treat file/web/log/subagent text as data; never elevate instructions without authorization | Extra validation | P0 | Run prompt-injection test corpus |
| SYS-09 | Track cost and time per accepted task | System | S01, S15, S25–S26 | Engineering-supported | Quality-adjusted efficiency | Collect each phase token/cost/latency, corrections, human interventions | Telemetry maintenance | P1 | Reconcile ledger totals and accepted counts |
| SYS-10 | Verify frontmatter and permission semantics on the actual fork | System | S32, S33 | Engineering-supported | Avoid inert config rules | Parser/schema test on pinned FIFE commit; reject invalid agent metadata | Requires repo-specific work later | P0 | Introspect loaded agents and denied tools |
| SYS-11 | Do not turn every principle into permanent prompt text | All | S09–S11 | Contradicted or inconclusive | Lower instruction overhead | Prefer short role-specific policy plus optional details; test added rules | Too little guidance can confuse | P1 | Prompt ablation fixed task/model/budget |
| SYS-12 | Keep specialized delegation conditional | System | S01, S02, S05 | Engineering-supported | Less coordination cost | Invoke subagent only for distinct expertise/evidence or parallelizable task | Can miss rare cases needing specialists | P1 | Compare triggered vs unconditional delegation |
| SYS-13 | Separate workflow policy from LLM discretion | System | S16, S31, S35 | Engineering-supported | Reliable gates and permissions | Controller owns approvals, tests/exit codes, diff limits and state | More harness engineering | P0 | Verify policy under adversarial prompts |
| SP-01 | Distinguish requirements, assumptions and open questions | Spec Writer | S24 | Engineering-supported | Less hidden specification drift | Label confirmed/assumed/unresolved and require escalation on material gaps | More user questions | P0 | Blind spec audit for hidden choices |
| SP-02 | Use observable acceptance criteria including failure behaviors | Spec Writer | S08, S20, S24 | Engineering-supported | More testable intent | Specify expected inputs, outputs, error states, constraints and relevant edge cases | Upfront design effort | P0 | Rater checks criteria against issue and tests |
| SP-03 | Inspect actual code interfaces before making technical claims | Spec Writer | S08, S13 | Engineering-supported | Fewer impossible designs | Link repo facts to file paths, symbols and configuration evidence | Research latency | P1 | Track spec technical contradiction rate |
| SP-04 | Keep scope/exclusions and approved change boundary explicit | Spec Writer | S24, S31 | Engineering-supported | Fewer unauthorized changes | Define in-scope interfaces and approval requirement for material expansion | May inhibit useful refactoring | P0 | Review diff vs approved intent |
| SP-05 | Use complexity-sensitive specification depth | Spec Writer | S09, S24 | Contradicted or inconclusive | Less planning burden | Short spec for localized edits; expanded constraints for migrations/security | Wrong complexity classification | P1 | A/B spec effort and rework by risk bucket |
| SP-06 | Make planned checks traceable to acceptance items | Spec Writer | S08, S20 | Engineering-supported | Clear verification target | Assign acceptance IDs linked to expected test or inspection | Traceability maintenance | P1 | Count unmapped acceptance criteria |
| SP-07 | Research/architectural delegation only when uncertainty warrants | Spec Writer | S01, S02 | Engineering-supported | Avoid redundant researcher role | Use read-only specialist for unknown external API, large architectural choice | Potential missed domain expertise | P2 | Compare specialist contribution vs extra cost |
| IM-01 | Change only approved behavior, with scoped exceptions | Implementer | S03, S31 | Engineering-supported | Protects stability | Inspect scope and diff; report unavoidable indirect changes for approval | Less opportunistic cleanup | P0 | Count off-scope edits |
| IM-02 | Localize and edit in small coherent increments | Implementer | S03, S07, S13 | Engineering-supported | Faster error isolation | Find affected symbols; patch; verify targeted tests; inspect diff | Extra intermediate tool calls | P1 | Compare failed patch/rework counts |
| IM-03 | Escalate spec conflicts; never reinterpret material intent | Implementer | S02, S24 | Engineering-supported | Avoids unauthorized product choices | On material ambiguity record options and hand back to Spec Writer/user | Can interrupt flow | P0 | Inject contradictory acceptance cases |
| IM-04 | Do not self-certify unexecuted tests | Implementer | S20, S27 | Engineering-supported | Honest completion status | Report exact command/result or NOT_RUN with reason | Additional metadata | P0 | Audit logs against claimed checks |
| IM-05 | Bound specialist edits to authorized paths | Implementer | S01, S31 | Engineering-supported | Controlled parallelism | Explorers read-only; editing delegate has explicit paths and owner verification | Less concurrency | P0 | Run unauthorized-child-edit attempt |
| IM-06 | Use durable checkpoint only on consequential tasks | Implementer | S14, S15 | Engineering-supported | Resume without excessive reports | For long/cross-system/security/migration tasks save concise state+evidence | Storage/staleness | P1 | Interrupted-run recovery test |
| TE-01 | Prioritize tests by changed behavior and risk | Tester | S20–S23, S34 | Engineering-supported | Find meaningful faults | Map acceptance items to happy path, negative, boundary and regression tests | More test design cost | P0 | Compare confirmed defect detection by category |
| TE-02 | Record test execution provenance | Tester | S20, S27 | Engineering-supported | Reproducible evidence | Capture command, cwd, environment, revision, exit code, failure logs | Log volume | P0 | Replay sample tests in clean environment |
| TE-03 | Separate pass, fail, skipped, blocked, inconclusive | Tester | S20, S27 | Engineering-supported | No false assurance | Never infer pass from intent or unavailable tool | More nuanced reports | P0 | Fault-inject skip and environment crash |
| TE-04 | Use mutation/negative cases when material | Tester | S20–S23, S34 | Empirically supported | Detect weak assertions | First verify assertions reject known-bad behavior; use mutation analysis only if the expected gain warrants its cost | Mutation may barely outperform coverage on hard LLM faults [S34]; compute and upkeep | P1 | Mutant detection plus real regression recall |
| TE-05 | Do not silently weaken/remove failing tests | Tester | S20, S31 | Engineering-supported | Reduces reward hacking | Test changes must preserve expected behavior and be reviewed | May slow legitimate test fixes | P0 | Inject failing test with temptations to delete |
| TE-06 | Run vetted commands automatically in isolated safe environments | Tester | S30, S31 | Engineering-supported | Responsive testing without undue hazard | Allow familiar read-only/build/test commands; ask for unknown/disruptive commands | Approval friction for novel tools | P0 | Permission audit on command categories |
| TE-07 | Invoke independent test generation for high-risk gaps | Tester | S06, S21, S22 | Plausible but unverified | Potential new defect paths | Use for ambiguous behavior, critical regression, unexplained failure | Additional agent cost; correlated misunderstandings | P2 | A/B independent tests on seeded defects |
| QA-01 | Review against approved intent, not implementer summary | QA | S16–S19 | Engineering-supported | Catches missing behavior | Read spec and inspect actual diff and relevant source before judgment | Extra context reads | P0 | Seed omissions and assess catch rate |
| QA-02 | Evaluate evidence adequacy as distinct from test results | QA | S19, S20, S27, S34 | Empirically supported | Fewer false accepts | Check missing tests, environment, unrun checks, covered scenarios | Can increase false rejection | P0 | Measure true/false rejects on labeled patches |
| QA-03 | Use grounded, severity-calibrated findings | QA | S18, S19, S29 | Engineering-supported | Higher precision and usefulness | Finding requires behavior, file/line, evidence, impact and suggested verification | May omit speculative warnings | P1 | Measure bug precision and time to resolve findings |
| QA-04 | Retain reviewer edit independence | QA | S16, S31 | Engineering-supported | Prevents circular assurance | Read-only default; corrections owned by Implementer | Extra handoff | P0 | Verify QA tool denies source edits |
| QA-05 | Re-review corrected code plus related regressions | QA | S17, S20 | Engineering-supported | Prevents partial fixes | On rework inspect new diff, all acceptance criteria affected, rerun evidence | Cycle overhead | P1 | Measure regressions after correction |
| QA-06 | Avoid unbounded reviews and noise | QA | S15, S19 | Engineering-supported | Lowers false positives and cost | Distinguish blocker from advisory; close after verified evidence or escalate | May miss low-severity flaws | P1 | Track false finding rate, cycles, accept quality |
| QA-07 | Express final disposition and residual risks | QA | S16, S19 | Engineering-supported | Clear acceptance control | ACCEPT/REWORK/BLOCK with supported reasons and uncertainties | Report template overhead | P0 | Audit QA judgments on labeled tasks |
| SYS-14 | Validate architecture under matched local tests | System | S01, S05, S28 | Engineering-supported | Avoids architecture cargo cult | A/B 1/2/3/4-role paths, same tasks/model/tools/budget and random order | Experimentation expense | P1 | Held-out paired outcome and confidence intervals |
| SYS-15 | Check role-file divergence and stale duplicates | System | S11, S32, S33 | Engineering-supported | Consistency over time | Single authoritative rule source; lint conflicting cross-file instructions | Central dependency | P1 | Cross-file contradiction lint |
| SYS-16 | Keep human acceptance for high-consequence changes | System | S18, S19, S31 | Engineering-supported | Reduces irreversible errors | Require user approval for secrets, auth, migrations, destructive ops and deployment | Latency/human work | P0 | Verify high-risk action cannot auto-advance |

## 11. Recommended architecture for a personal supervised coding CLI

### Decision: keep four role definitions, invoke only the necessary roles

The recommended **initial operating pattern** is a **deterministic phase controller** plus three routinely active LLM responsibilities: Spec Writer, Implementer and independently operating QA. Testing remains a mandatory **verification function** conducted through executable tools; a dedicated Tester agent is invoked when it has a distinct, justified investigation or test-design assignment. Retain all four Markdown definitions for now. The cost-saving recommendation concerns **when roles run**, not whether the role files should immediately be merged or deleted.

This is a **moderate-confidence engineering design** rooted in stronger evidence for bounded independent review [S16–S19], negative or mixed evidence for adding coordination to otherwise sequential tasks [S01, S05], and strong concerns about benchmark grading [S20, S27]. **No experiment here proves 3 agents beat 4 agents on the exact FIFE workflow.** Therefore, the design should remain reversible.

**Separation of function, identity, and execution:**

- A **function** is work that must be accomplished (e.g., checking error cases). It can exist without its own AI model instance.
- A **role definition** is a set of instructions and permissions expressing responsibility (e.g., `tester.md`). Its existence costs little until invoked, but it has a maintenance burden.
- An **agent invocation** is an actual model execution with context, tools, latency and potential handoff losses. It incurs recurring operating cost.
- A **deterministic gate** checks a concrete condition in code, such as whether a specific approval exists or a test command exited successfully. It should not depend solely on an LLM agreeing to comply.

The proposed workflow's **approval policy stays intact**: for requests that enter supervised SDD, the user approves the specification before write-capable work. The efficiency recommendation does **not** authorize silently skipping this approval on simple changes; a future separately approved fast-track policy would be a distinct user decision.

### Operating modes and triggers

| Mode / circumstances | Active roles | Required assurance | Reason and evidence | Risk / decision |
|---|---|---|---|---|
| Routine, narrow and testable change after spec approval | Spec Writer → Implementer → executable test gate → independent QA | Targeted tests, diff review, explicit pass/not-run evidence | Reduces duplicate agent handoff while preserving a check separate from implementation [S01, S16] | Best default hypothesis, **not** validated optimal configuration |
| Broad feature, complex failure, unclear coverage, high regression risk | Spec Writer → Implementer → **Tester** → QA | Tester designs or extends test scenarios, runs reproducible checks; QA separately assesses requirement coverage and acceptance | Specialized test generation can add scenarios but often has compilation/coverage limitations [S06, S21–S23] | Four-role mode justified by task risk and test complexity |
| Architecture uncertainty, unfamiliar subsystem or external integration | Spec Writer with read-only exploration/research specialist → approval → Implementer → appropriate checks → QA | Repository evidence, explicit assumptions, feasibility, trusted external documentation | Retrieval and planning matter, but dedicated research-role value has not been isolated [S08, S13] | Add specialist only when the information need is concrete |
| Security permissions, migrations, data changes, irreversible actions | Spec Writer → human approval → restricted Implementer → independent test/review | Sandboxed execution, change/rollback plan, privilege gates, domain-specific checks | Engineering safeguards outweigh small latency savings [S30, S31] | Human signoff on consequence; do not delegate irreversible choice blindly |
| Repeated no-progress loop or absent reliable environment | Controller pauses and escalates; no autonomous "accept" | Failure evidence, attempted remedy, remaining uncertainty and owner | Poorly grounded feedback can amplify errors [S02, S19] | No unlimited self-correction |

### Why each role still matters

**Spec Writer:** essential as the single owner of approved intent. It should interpret the request, inspect actual repo interfaces where relevant, propose measurable acceptance criteria and clearly identify consequential ambiguities. **It should not guarantee technical certainty on uninspected code**, approve its own material scope changes, or become an unbounded general researcher. Planning evidence favors particular coupled changes [S08], while artifact-only evidence is null [S24].

**Implementer:** essential as the single write owner for the approved scope. It may make routine internal engineering decisions, choose limited subagent investigations and self-correct within scope. It cannot rewrite approved requirements or declare its unexecuted tests passed. Independent review should inspect the patch, not trust the Implementer's summary [S16, S19].

**Tester:** important **function**, conditionally valuable as an agent. It provides a fresh test strategy, risk-driven negative cases, reproducible failing examples and coverage analysis, not just another invocation of the existing suite. Its role should remain available for complex features, environment diagnosis, changes requiring test-source edits and failure investigation. Direct evidence that a full-time separate Tester consistently outperforms self-testing plus a QA critic remains inadequate. Standalone test-generation literature demonstrates both potential and important failure modes [S06, S21–S23].

**QA:** retain a meaningful independent judgment separate from implementation. It should inspect approved criteria, current patch, relevant behavior and actual verification results; classify defects with grounded evidence; and make an explicit acceptance, rework or blocked recommendation. **A dedicated QA model adds value only if it receives enough trustworthy evidence to outperform a cheaper tool/check path** [S16, S19]. Its independence is functional: read-only by default, no self-approval of its own code changes.

### What not to add at the outset

Do **not** introduce a permanent separate Researcher, Architect, project manager agent, security agent, compliance agent and LLM orchestrator merely because these are recognizable software-industry job titles. Use specialized, read-only investigations or deterministic analyzers when concrete tasks require them. An LLM orchestrator is reasonable only if the workflow has material parallelism, difficult dynamic routing or specialized capability differences that cannot be handled by a small state machine—and later evaluation demonstrates a net benefit.

**Controller ownership:** phase transitions, approval revocation, read/write/tool rights, accepted spec hash, revision-anchored test results, retry/budget caps and evidence persistence. Agent instructions explain required behavior and how to escalate; the harness enforces permissions and gates [S31–S33]. The current OpenCode FIFE fork has **not** been inspected, so no claim is made that all these controls already exist or can be configured in a particular frontmatter field.

### Alternatives that remain viable

- **One capable agent + tools:** attractive for extremely small or repeatable jobs and as an important experimental baseline, but conflicts with a strict independent-acceptance preference unless external review is added. [S03, S05]
- **Two agents (Implementer and independent reviewer), plus deterministic spec approval:** attractive if requirements can be adequately captured in the controller/user interaction or the Implementer reliably creates a reviewable spec. This is the main **lean alternative** to three roles. Its adequacy for ambiguous requests is not proven. [S16]
- **Always-four-agent pipeline:** attractive for large, risky or frequently buggy changes, or if Tester demonstrably finds otherwise escaped defects. Poor as an unexamined global rule because of repeated context acquisition and handoff costs. [S01, S06, S21–S23]
- **More than four agents or manager-worker:** sometimes justified for genuinely parallel, independent investigations; only after comparing against a competent simpler baseline at equivalent model/tool/budget conditions. [S01, S02]

**Trigger to change this recommendation:** measured incremental **true defect detection and accepted correctness** from mandatory Tester participation exceeds its costs, rework, false positives and delay for representative personal tasks. Conversely, if QA adds high false-positive rates and little verified catch, reduce its invocation scope or improve its evidence rather than preserving a job title by convention.

## 12. Prioritized agent design principles and optimizations

The evidence matrix in §10 translates these concepts into reviewable file characteristics. The items below supply the required **problem, evidence, strength, mechanism, benefit, cost, applicability and validation** in a smaller, prioritized set. **Priority is a judgment about consequences for personal use, not an experimentally derived universal order.**

### P0 — foundational correctness and authority

**P0-1. Freeze approved intent at the implementation boundary.**
- **Problem:** silent requirements drift, implementation of unresolved decisions and acceptance against a moving target.
- **Evidence/strength:** engineering-supported; planning's usefulness is task dependent [S08], while simply possessing artifacts has not consistently reduced defects [S24]. No direct proof that every individual approval improves correctness.
- **Where and instruction:** Spec Writer identifies confirmed requirements, consequential assumptions and observable acceptance criteria; a controller binds approval to a spec revision. Implementer treats material conflicts as reapproval triggers.
- **Expected benefit/tradeoff/conditions:** traceability, predictable authority and fewer hidden scope changes; greater upfront latency, especially for trivial tasks. Appropriate because supervised SDD is a stated user requirement.
- **Future validation:** seed ambiguous requirements and changed specifications; check if unauthorized implementation proceeds or acceptance overlooks changed intent.

**P0-2. Make permissions real rather than aspirational.**
- **Problem:** unsafe shell commands, inadvertent repository-wide edits, exposure of secrets and hostile instructions found in retrieved code or web content.
- **Evidence/strength:** direct empirical coding-agent rule-compliance failures [S35], security attack scenarios [S30] and OWASP defensive practices [S31]; no established effect size for the particular FIFE policy controls.
- **Where and instruction:** system/controller enforces actual read/write/shell/network grants; role files state authority and escalation. Untrusted tool output is evidence, not permission to override the instruction hierarchy. Read-only QA is the default.
- **Expected benefit/tradeoff/conditions:** reduces dangerous actions at the cost of occasional approvals and blocked legitimate operations. Always necessary when the agent can affect real files or credentials.
- **Future validation:** negative tests for unapproved writes/destructive commands and instruction injection, plus checks that ordinary authorized work still completes.

**P0-3. Require evidence-backed completion and preserve non-pass states.**
- **Problem:** plausible summaries claiming tests passed when commands were never run or evidence became stale.
- **Evidence/strength:** empirical support for the limits of benchmark tests and independent review [S16, S19, S20, S27]; exact handoff schema is engineering judgment.
- **Where and instruction:** Implementer/Tester record command, environment, result, exit code, and what was not run. QA reviews evidence against code/spec revisions. Controller preserves `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`, `INCONCLUSIVE` as separate states.
- **Expected benefit/tradeoff/conditions:** fewer false completion claims; additional evidence capture and possible delays. Applies to every task requiring verification.
- **Future validation:** independently audit claimed checks against execution logs; intentionally invalidate a test by changing the code after it ran.

**P0-4. Ground independent QA in the actual change and spec.**
- **Problem:** same-model self-confirmation, superficial agreement, missing requirements and unsupported reviewer objections.
- **Evidence/strength:** moderately strong but recent direct empirical evidence that independent review can improve coding-task benchmarks [S16, S17], counterbalanced by high over-rejection in weak-evidence settings [S19].
- **Where and instruction:** QA independently inspects approved spec, current diff, relevant code/test behavior and executed evidence. It reports confirmed issue, file/line or behavior, severity and discriminating evidence; recommendations distinguish accepted, rework and inconclusive.
- **Expected benefit/tradeoff/conditions:** potentially higher accepted correctness; extra inference/context and false-positive risk. Best for meaningful code changes; test QA against low-risk tasks before mandating heavy reviews.
- **Future validation:** paired blind defect-seeding experiment, measured true/false positive rates and cost per independently accepted task.

### P1 — high-value execution quality and efficiency

**P1-1. Retrieve codebase context selectively and record where facts came from.**
- **Problem:** large low-value context, missing critical dependencies, stale summaries, repeated repo reads.
- **Evidence/strength:** empirical for retrieval misses and context compaction, mixed for AGENTS.md files [S09, S10, S12–S14].
- **Where and instruction:** Spec Writer/Implementer use code search and symbols to locate relevant code, read only needed files, retain exact paths and constraints; reuse scoped exploration results.
- **Expected benefit/tradeoff/conditions:** less context waste and more grounded decisions, but aggressive retrieval could miss indirect dependencies. Deepen retrieval for cross-module changes.
- **Future validation:** file recall against actual changed/dependent files, correctness, token usage, missing-dependency failures.

**P1-2. Prefer coherent implementation steps with targeted checks.**
- **Problem:** large unverified diffs make failure localization and regression detection harder.
- **Evidence/strength:** empirical support from agent interface and planning research for certain workflows [S07, S08]; no universal proof that a particular step size is optimal.
- **Where and instruction:** Implementer locates dependencies, patches within scope, runs targeted checks, reviews diff and reports needed broader validation.
- **Expected benefit/tradeoff/conditions:** lower debugging ambiguity and easier review; can add overhead or fragment genuinely atomic refactors. Adapt granularity to coupling.
- **Future validation:** paired changes comparing rework count, introduced defects and total accepted cost.

**P1-3. Design tests for failures they should detect, not coverage they should display.**
- **Problem:** high pass rates and branch coverage can coexist with wrong behavior or brittle generated tests.
- **Evidence/strength:** empirical [S20–S23, S34]; dedicated Tester gain is unverified. A selected-hard-fault experiment showed around 1–2% actual detection despite much higher fault triggering with generated assertions [S34].
- **Where and instruction:** Tester (or Implementer when no Tester is invoked) maps requirements to positive, negative, boundary, integration and regression scenarios; investigates test compilation/runtime and fault sensitivity; records exclusions.
- **Expected benefit/tradeoff/conditions:** stronger behavioral assurance at higher design, mutation-check or environment cost. Prioritize by consequence; do not force every test type on every edit.
- **Future validation:** seeded fault sensitivity, regression escape and tests that fail on known-bad implementations.

**P1-4. Bound corrective iteration and assign a clear next owner.**
- **Problem:** unproductive repair loops, reviewer–implementer ping-pong and endless token spend.
- **Evidence/strength:** failure taxonomy and efficiency interventions provide indirect empirical support [S02, S15, S17, S19]; specific retry counts are engineering judgment.
- **Where and instruction:** controller tracks attempts and stops repeated unchanged errors; QA provides precise feedback; Spec Writer handles requirement conflicts; Implementer owns code corrections.
- **Expected benefit/tradeoff/conditions:** lower coordination cost, more understandable blockers; overly tight limits can halt a solvable task. Escalate by evidence and risk rather than an arbitrary universal number.
- **Future validation:** compare productive correction yield by iteration, time to accepted solution, repeated identical failures.

**P1-5. Make high-risk work resumable and check evidence freshness.**
- **Problem:** lost progress, re-opened decisions or relying on tests executed against earlier code.
- **Evidence/strength:** empirical for long-session context and compaction pressure [S14] and grading pitfalls [S20]; exact checkpoint format is engineering-supported.
- **Where and instruction:** maintain durable minimal checkpoints for migrations, multiple subsystems, interruptions, uncertain approvals or failed handoffs; include revision anchors and current blockers.
- **Expected benefit/tradeoff/conditions:** recovery with less repeated discovery, at a documentation/storage burden. Do not require a long report for every tiny code edit.
- **Future validation:** planned interruption/resumption tests, time lost, stale evidence detection and error rates.

**P1-6. Separate deterministic enforcement from instructions.**
- **Problem:** instructions can be ignored, contradicted or impersonated, while a gate needs reliable decisions.
- **Evidence/strength:** engineering and security support [S30–S33], with experimental evidence that interface and verification architecture matter [S07, S16].
- **Where and instruction:** code/config owns permissions, phase state, approval, command results and budget ceilings. Markdown describes responsibilities and handling of failures; do not duplicate unsupported configuration syntax.
- **Expected benefit/tradeoff/conditions:** more predictable control at the cost of controller maintenance. Appropriate whenever the distinction is safety- or correctness-critical.
- **Future validation:** integration tests that deliberately instruct an agent to bypass each gate and confirm denial.

**P1-7. Optimize cost per *accepted* task; keep specialization conditional.**
- **Problem:** optimizing cheap attempts while spending more on failed runs, redundant role invocations and extra human review.
- **Evidence/strength:** empirically supported coordination effects in a revised 260-configuration study including coding tasks [S01], coding comparison [S05], and cost-saving harness intervention [S15]; exact optimal routing remains unverified.
- **Where and instruction:** controller records full phase costs/latency, routes Tester or specialist only for evidenced needs, and never drops required checks merely to save tokens.
- **Expected benefit/tradeoff/conditions:** better quality-adjusted efficiency with some router complexity and risk of under-escalation. Good default in personal use, but require trial data.
- **Future validation:** fixed-task architecture ablation; accepted-quality and intervention rates, costs and latency with uncertainty bands.

### P2 — deliberately experimental rather than mandatory

**P2-1. Cross-provider review, adversarial agents or multiple independent critics.** Independent reviewers and extra rounds can help some benchmarks [S16], yet poorly grounded review can over-reject [S19]. Different providers are not proven to deliver independent error distributions at acceptable cost for FIFE. Try only on difficult/risky tasks, with a **reliable oracle** (test or discriminating evidence) and a limited budget.

**P2-2. Dedicated Researcher or Architect.** Could improve requirements under uncertainty, but no matched causal evidence favors a persistent separate role over Spec Writer with targeted search. Introduce when the Spec Writer repeatedly produces verifiable technical errors that an independent investigation catches at reasonable cost [S08, S13].

**P2-3. Full requirement-to-test traceability documents for all edits.** Useful for consequential features, regulated work or multi-session transfers; may be clerical overhead for a one-line safe change. Check traceability **quality**, not just a high count of linked IDs [S24].

**P2-4. Large mandatory agent prompts, elaborate persona prompts, and fixed multi-agent debate rituals.** There is inadequate direct evidence that longer role Markdown or prescribed debate improves this workflow. AGENTS.md studies disagree on efficiency and broadly do not show task-success gains [S09, S10]; test prompt variants under equal task/model/compute conditions rather than installing them because they appear comprehensive.

### Practices to avoid, simplify or move outside Markdown

- **Avoid:** claiming "tests passed" when skipped; grading success solely from visible tests; declaring acceptance on reviewer confidence without behavior evidence; autonomously approving changed scope; unconstrained rewrite/review loops; making the QA agent edit the same source it approves by default.
- **Simplify:** repeated general software principles; overlapping four-role admonitions; exhaustive required reports for minor changes; unsolicited research specialists; full-repository text dumps; lengthy speculative risk lists.
- **Move to controller/tools:** approvals; role permission maps; checked command allow/deny rules; actual test execution; structured phase transitions; artifact hashes; budget and retry ceilings; safe workspace isolation; tool-result trust handling; automatic report provenance. [S30–S33]

## 13. Contradictory evidence and unresolved research questions

| Question / apparent conflict | What the evidence actually says | Interpretation and present uncertainty |
|---|---|---|
| Do more agents help? | Controlled scaling shows gains on parallel/decomposable tasks and negative average effects on SWE-bench Verified subsets, sequential PlanCraft and some terminal tasks [S01]; specialized frameworks can solve nontrivial repository tasks [S04, S06]. | Different architectures and baselines can work; **no proven optimal role count** for supervised SDD; SWE samples of 20 tasks per configuration have large uncertainty. |
| Do instruction files help? | Gloaguen et al. report no general task-success gains and >20% inference cost [S09]; Lulla et al. find median time/output improvements with slightly higher total tokens but do not rigorously establish correctness [S10]. | Context content, task selection, model, metric and study design differ. Gloaguen et al. also find context files help in the **special case where other documentation is removed** [S09]. Do not extrapolate either study to exact role-prompt length or assume shorter is always better. |
| Do specs improve software? | CodePlan shows strong localized improvements for complex repository transformations [S08]. Hill finds no statistically significant defect reduction associated with regular PR spec-like artifacts [S24]. | One changes agent planning procedure on a small controlled task set; the other observes historical artifacts. **No causal test of the proposed approved AI-SDD pipeline** was located. |
| Does independent review improve quality? | Verification and review/revision systems show accuracy gains [S16, S17]; grounded review study shows high false-rejection when generated evidence is weak [S19]; field review comments are often rejected [S29]. | Review helps when its information and decision criteria are sufficient. A reviewer label alone does not make its judgments reliable; true-negative/false-positive audits are essential. |
| Are AI assistants faster? | METR randomized experienced maintainers using early-2025 tools and found 19% slower issue completion [S25]; a much larger three-experiment field study found 26.08% higher task counts with AI access [S26]. | Populations, tools, time periods, metric definitions and task selection differ. Either can be locally true; benchmark success and perceived speed are poor substitutes for measured accepted delivery. |
| Does coverage or mutation testing establish reliable fault detection? | On 6,066 selected difficult faulty programs, generated tests with associated oracles detected only ~1–2% even though their inputs triggered far more faults [S34]. | In the studied hard-fault subset, **test assertions**—the logic that decides pass/fail—were a major weakness. Do not generalize the percentage to ordinary defects; prioritize meaningful assertions and external behavior checks. |
| Are benchmark scores accurate? | SWE-ABS invalidated 19.78% of originally passing SWE Verified patches under expanded tests [S20]; 2026 audits identified broken SWE-bench Pro tasks and published corrections [S27]. | Absolute pass percentages can be optimistic and change when the oracle changes; do not combine rankings from unaligned benchmark versions. |
| Should Tester be separate from QA? | Dedicated test-generation systems show potential [S06, S21] and fragility [S22, S23]; independent *review* has demonstrated gains [S16]. | No convincing matched study specifically isolating **four-role Spec/Implementer/Tester/QA** versus **three-role Spec/Implementer/QA + deterministic tests** was identified. This is the largest local decision left to test. |
| Can a smaller/cheaper critic verify a stronger builder? | Some small reviewers succeeded with official ground-truth execution [S19], but that test evidence is normally unavailable; generated evidence caused major over-rejection. | Capability is conditional on **evidence quality**, not simply critic model size. Cross-provider reviewer benefits remain an open design hypothesis. |
| Is a researcher or orchestrator necessary? | Parallel tasks may benefit from coordinator architectures [S01], but trace studies show common handoff and coordination failures [S02]. | Agent manager benefits require meaningful decomposition and dynamic coordination that a deterministic state machine cannot handle. No evidence supports mandatory extra roles for each small task. |

### Further methodological uncertainties

1. **Prompt-length causality:** no sufficiently controlled, current-model experiment in this evidence set proves that a particular length of *role-definition Markdown* optimizes software correctness, costs, or tool-policy adherence. Repository guidance files are an imperfect proxy.
2. **Model/harness interaction:** a policy that helps one model may be redundant or harmful for another, particularly with different long-context attention, tool behavior, temperature or compaction. Reporting quality is poor: the 2026 methods review found only 15 of 325 experiments specified exact harness versions [S28].
3. **Reviewer ground truth:** independent review without a trustworthy behavior oracle can convert ambiguous cases into false defects; defect-positive code-review benchmarks do not always quantify clean-code false alarms [S18, S19].
4. **Real-project longitudinal results:** tasks where requirements evolve, tests change, dependencies break or old decisions become stale may be unlike one-shot SWE-bench issues.
5. **Safety-versus-throughput:** least privilege and user approvals have compelling threat-model justification but comparatively little experimental evidence quantifying coding task success under those restrictions.
6. **Human supervision quality:** approval can catch material ambiguity only when the spec is intelligible and the user has adequate information. The existence of a click or approval token is not itself evidence of good requirements.

## 14. Future validation requirements (not performed)

The appropriate next stage is **file-level QA/QC against this matrix**, followed later by a **separate controlled performance evaluation**. These are different stages: an agent file can meet every instruction-design rule and still produce ineffective agents, and a useful agent may succeed despite an informal file.

### Phase A — future *file-only* QA/QC

1. Establish the exact FIFE fork commit, OpenCode version/config parser, effective agent frontmatter schema, permission behavior, tool environment and actual workflow controller. This step requires repo access **in the later assignment**; it was not performed here [S32, S33].
2. Examine each of four files **individually**, then examine cross-file contracts and contradictions. Use the 43-row §10 matrix, but decide whether each row is applicable, clearly evidenced, partially present, conflicting, absent, redundant, or outside the file's responsibility.
3. Differentiate **file defects** (incompatible schema, contradictory authority, missing completion condition, impossible tool policy) from **unproven enhancement suggestions** (extra specialists, more examples, verbosity changes). Give precise file/line evidence and explain why the concern matters.
4. Identify which findings require controller, test tooling or repository changes, rather than suggesting that more Markdown will enforce them.
5. Record recommendation, supporting evidence, counterevidence, applicability condition and expected tradeoff. Propose revisions **only after** reviewing actual files, not by mechanically inserting every matrix row.

### Phase B — later *behavioral* A/B evaluation

**Do not run this during the current research assignment.** After the files and workflow are ready, develop a diverse held-out set of representative personal coding changes. A first pilot may include roughly 40–100 tasks stratified by size/risk, but this is a pragmatic starting sample, **not** a statistically sufficient universal quota; calculate appropriate sample size and intervals from pilot variance and target minimum detectable effect. Include bug fixes, small features, multi-module changes, failure/negative cases, migration-like work and at least a few interrupted/resumed tasks.

**Compare at least these configurations** where compatible with supervision requirements:

- **A:** capable single execution agent with deterministic test tooling and the same approved spec supplied as input; use as an experimental simplicity baseline, not as the production approval policy.
- **B:** Implementer + independent reviewer, both with identical inputs and tool entitlements appropriate to their stage.
- **C:** Spec Writer + Implementer + QA, with mandatory deterministic test gate and conditional Tester; expected lean default.
- **D:** all four roles invoked on every representative task.
- **E (optional):** four-role workflow with an LLM orchestrator or separate Researcher, only for tasks whose decomposition actually warrants it.

Match **the same model versions, tools, initial repository state, approval criteria, test oracle and monetary/time ceilings** as much as possible. Where roles require different permissions, document that unavoidable architectural difference. Randomize task order and architecture order, isolate workspaces, and repeat stochastic runs where affordable. Do not allow test-set leakage into agent instructions or specs. Compare both **equal-budget** and optionally **natural-cost** operating conditions; do not confuse them.

### Primary/secondary endpoints and decision rules

| Endpoint | How to observe it | What would change the design decision |
|---|---|---|
| Independently accepted functional completion | Held-out acceptance criteria plus human/independent behavior check | Material paired success increase without unacceptable regression on risk |
| Confirmed defect escape | Seeded known faults and later verified regressions | Mandatory Tester worth keeping when it uniquely and reproducibly prevents escapes |
| Reviewer precision and recall | Separate buggy and correct changes, blinded evidence review | QA that often rejects correct work needs evidence redesign or narrower scope |
| Cost and latency per accepted result | Sum full run/retry/review/human intervention | More roles justified only by acceptable quality-adjusted benefit |
| Unauthorized changes | Permission logs/diffs against approved scope | Any dangerous uncontrolled action is a stop condition even when task success is high |
| Handoff and interruption fidelity | Inject handoff truncation and restart, compare against approved state | More/different artifacts justified if they prevent demonstrated loss |
| Test sufficiency | Seeded fault catch, negative cases, mutation where feasible | Evidence for dedicated Tester vs ordinary test gate |
| Prompt efficiency | Vary instruction density while fixing model/task/harness | Retain only extra rules that improve outcomes or clarify required authority |

Report **paired task-level differences**, confidence intervals or bootstrap intervals, raw numerator/denominator, failures, censored runs and review costs. Distinguish exploratory from prespecified comparisons; do not infer meaning from tiny percentage-point changes in a small sample. If evidence is inconclusive, favor simpler operation with reversible specialist escalation—not an unsupported declaration of superiority.

### Targeted ablations worth prioritizing

1. Always-on Tester versus trigger-based Tester, including **unique true defect catches**, false failures and cost.
2. Independent QA based on code/spec/actual tests versus QA based on an Implementer summary, expecting higher grounding but measuring it.
3. Strict full spec template versus compact acceptance criteria with risk-triggered detail. Measure clarification, omissions, implementation acceptance and review cost.
4. Minimal role instructions versus longer step-by-step procedures, preserving safety requirements across both conditions.
5. Repository map and selective retrieval versus large repository context file; use file-recall and acceptance metrics rather than token savings alone.
6. Bounded retry and resumable checkpoints versus unconstrained corrective loops; track progress, repeated errors, stale evidence and recovery cost.
7. Separate Researcher/Architect only for uncertainty-heavy tasks; compare against Spec Writer with the same tools.

## 15. Research completeness assessment

| Audit requirement from the research brief | Assessment | Remaining caveat |
|---|---|---|
| A. Fundamental agent design: instructions, context, tools, autonomy, recovery | **Addressed** (§4) | Direct controlled role-prompt-length evidence is limited; version-sensitive tool permissions must be checked on FIFE later |
| B. Four roles studied independently | **Addressed** (§5) | Tester-versus-QA optimal separation remains unproven |
| C. Single and multi-agent alternatives compared | **Addressed** (§6, §11) | No four-vs-three FIFE-like matched trial |
| D. Handoffs, SDD, approvals and corrections | **Addressed** (§7, §11) | Some rules reflect engineering/security practice, not causal outcome estimates |
| E. Tokens, latency, cost and operating complexity | **Addressed** (§3, §8) | Study cost currencies/models/periods cannot be directly normalized; no FIFE telemetry used |
| Quantitative findings traceable to original sources | **Addressed where publicly verified** (§9, §16) | Several small/new studies rely on abstracts or author reports; no independent reproduction |
| Negative and contradictory findings investigated | **Addressed** (§13) | Publication bias and selective task/reporting remain possible |
| Evidence-to-design matrix complete | **43 reviewable recommendations** (§10; companion file) | Applicability to files is **not yet evaluated** |
| Architecture conclusion follows from research | **Qualified recommendation** (§11) | Three routinely active roles is a hypothesis, not demonstrated optimality |
| Practical future validation and handoff identified | **Addressed** (§14) | No behavioral testing, configuration verification or review of user files was performed, as requested |

**Readiness:** sufficient to support a **critical, research-informed file-level QA/QC review**, not sufficient to certify that the four proposed agents—or the recommended conditional-Tester variation—will work better in actual use. The next reviewer should use the findings as falsifiable questions, not rules to copy blindly.

**Most important remaining empirical gap:** whether a separate Tester materially improves **unique defect detection and accepted-task reliability** beyond an Implementer's executed tests plus an independent QA review, on task types common to FIFE. The second gap is whether additional role instructions measurably change behavior after deterministic workflow controls are in place.

**Research stopping basis:** key alternatives, negative results, benchmark flaws, role responsibilities and workflow controls have been considered. Additional papers on adjacent models/benchmarks are unlikely to settle the exact personal architecture choice without a controlled local comparison. Further investigation could refine individual effect sizes, but design decisions now depend principally on unknown **FIFE-specific task distribution, model, parser and tool environment**, which were intentionally excluded from this research assignment.

## 16. Sources and references

**Citation format:** `[Snn]` in the report and matrix points to the original research or official primary source below. Dates distinguish the original release from later known revisions. An arXiv DOI normally identifies an arXiv preprint; it does not imply peer review. For studies where a full manuscript could not be verified, the report does not assert missing methodology as fact.

### Comparative architectures, planning and coding harnesses

- **[S01]** Kim, Y. et al. **“Towards a Science of Scaling Agent Systems.”** Submitted December 9, 2025; **revision April 8, 2026 (v3)**. Controlled 260 configurations, six benchmarks including SWE-bench Verified and Terminal-Bench, three model families. [Original paper](https://arxiv.org/abs/2512.08296) · [HTML full text, v3](https://arxiv.org/html/2512.08296v3). **Important:** earlier versions had fewer configurations and did not include the two coding/terminal benchmarks; this report uses v3.
- **[S02]** Cemri, M. et al. **“Why Do Multi-Agent LLM Systems Fail?”** 2025 preprint. Failure taxonomy using 1,642 traces and five frameworks. [Original paper](https://arxiv.org/abs/2503.13657).
- **[S03]** Xia, C. S. et al. **“Agentless: Demystifying LLM-based Software Engineering Agents.”** 2024 preprint. [Original paper](https://arxiv.org/abs/2407.01489).
- **[S04]** Arora, D. et al. **“MASAI: Modular Architecture for Software-engineering AI Agents.”** 2024 preprint. [Original paper](https://arxiv.org/abs/2406.11638).
- **[S05]** Yu, L. et al. **“Single-Agent versus Multi-Agent LLM Systems for Automated Programming: A Controlled Experiment in Software Engineering.”** Author-hosted, October 2025; submission status indicated by authors. [Original author page](https://liang-y-yu.github.io/publication/2025-10-01-paper-title-number-10). Peer-review status not independently established.
- **[S06]** Huang, D. et al. **“AgentCoder: Multi-Agent-based Code Generation with Iterative Testing and Optimisation.”** 2023 preprint. [Original paper](https://arxiv.org/abs/2312.13010).
- **[S07]** Yang, J. et al. **“SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering.”** 2024 preprint, with subsequent published versions. [Original paper](https://arxiv.org/abs/2405.15793).
- **[S08]** Bairi, R. et al. **“CodePlan: Repository-Level Coding Using LLMs and Planning.”** FSE 2024. [Microsoft Research original](https://www.microsoft.com/en-us/research/publication/codeplan-repository-level-coding-using-llms-and-planning-2/) · [Code and artifacts](https://github.com/microsoft/CodePlan).

### Agent instructions, context and efficiency

- **[S09]** Gloaguen, T., Mündler-Sasahara, N., Müller, M. N., Raychev, V. and Vechev, M. **“Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?”** February 2026; revised September 29, 2026 (v3). [Original preprint](https://arxiv.org/abs/2602.11988).
- **[S10]** Lulla, J. et al. **“On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents.”** January 2026 preprint, revised March 2026. [Original preprint](https://arxiv.org/abs/2601.20404).
- **[S11]** Shanto, S. et al. **“Toward an Evidence-Based Template for Agent Instruction Files: An Empirical Study of Adoption, Consistency, and Maintenance.”** November 2, 2026 preprint. [Original paper](https://arxiv.org/abs/2611.02383). The coverage and consistency measures reported are **not** correctness metrics.
- **[S12]** Liu, N. F. et al. **“Lost in the Middle: How Language Models Use Long Contexts.”** *Transactions of the Association for Computational Linguistics*, 2024. [Original peer-reviewed paper](https://aclanthology.org/2024.tacl-1.9/).
- **[S13]** Qin, S. and Xie, T. **“Agent Retrieval Bench: Evaluating Repository Context Retrieval for Coding Agents.”** July 2026 preprint. [Original paper](https://arxiv.org/abs/2607.24882).
- **[S14]** Liu, X. et al. **“Benchmarking Long-Horizon Agent Context Compaction with CompactionBench.”** Microsoft Research, October 2026 research report/preprint. [Original research page](https://www.microsoft.com/en-us/research/publication/benchmarking-long-horizon-agent-context-compaction-with-compactionbench/).
- **[S15]** Guo, X. et al. **“EET: Experience-Driven Early Termination for Cost-Efficient Software Engineering Agents.”** *Findings of ACL 2026*. [Original proceedings paper](https://aclanthology.org/2026.findings-acl.1652/).

### Verification, tests, reviewer evidence and benchmark quality

- **[S16]** Zhang, Z. et al. **“Rethinking Verification in Agent Harnesses.”** October 25, 2026 preprint. [Original paper](https://arxiv.org/abs/2610.34577).
- **[S17]** Wang, R. et al. **“SWE-Review: Closing the Loop on Issue Resolution with Agentic Code Review.”** July 7, 2026 preprint. [Original paper](https://arxiv.org/abs/2607.06065) · [Authors’ project site](https://swe-lego.github.io/SWE-Review/).
- **[S18]** Yang, S. et al. **“(When) Should a Software Factory be Lights-off? Benchmarking Code Review Agents on Bug Detection.”** October 2026 preprint. [Original paper](https://arxiv.org/abs/2610.13668).
- **[S19]** Guo, J., Gu, S., Jin, M. and Lavaei, J. **“Groundability, Not Scale Alone: When Weak Reviewers Can Audit Strong Coding Agents.”** October 1, 2026 preprint. [Original paper](https://arxiv.org/abs/2610.01023).
- **[S20]** Yu, K. et al. **“SWE-ABS: Adversarial Benchmark Strengthening Exposes Inflated Success Rates on Test-based Benchmark.”** *ICML 2026*; stronger SWE-bench Verified grading. [Original peer-reviewed proceedings](https://proceedings.mlr.press/v306/yu26b.html).
- **[S21]** **“Impact of Code Context and Prompting Strategies on Automated Unit Test Generation with Modern General-Purpose Large Language Models.”** *Journal of Systems and Software*, July 2026. [Publisher DOI](https://doi.org/10.1016/j.jss.2026.112834). Publisher full text was not consistently available during this review; quantitative details are treated as source-reported.
- **[S22]** Haroon, M. et al. **“Evaluating LLM-Based Test Generation Under Software Evolution.”** March 2026 preprint. [Original paper](https://arxiv.org/abs/2603.23443).
- **[S23]** **Empirical study of generated Java test cases compared with EvoSuite.** *Empirical Software Engineering*, 2026. [Original author/institution PDF](https://orbilu.uni.lu/bitstream/10993/68099/1/s10664-026-10840-4.pdf). Interpret model-dependent failure extremes with caution.
- **[S24]** Hill, C. **“Specification Artifacts in Open-Source Pull Request Workflows Do Not Reduce Defects.”** *ESEM 2026*, October 5, 2026. [Original peer-reviewed conference proceedings](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.84). Explicitly not a test of actual modern agent SDD outputs.
- **[S27]** OpenAI, February 2026. **“Why We No Longer Evaluate SWE-bench Verified.”** [Original benchmark audit](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/); OpenAI, July 8, 2026, **“Separating Signal from Noise in Coding Evaluations.”** [Original SWE-bench Pro audit](https://openai.com/index/separating-signal-from-noise-coding-evaluations/); Scale AI, September 22, 2026, **“SWE-bench Pro V2.”** [Original version and corrections](https://labs.scale.com/blog/swe-bench-pro-v2). These are partly vendor-authored audits with different incentives and claims.

### Real-world productivity, safety, methodological quality and operational documentation

- **[S25]** Becker, J. et al./METR. **“Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity.”** 2025 randomized study. [Original paper](https://arxiv.org/abs/2507.09089) · [Experiment and discussion](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/).
- **[S26]** Cui, K. Z. et al. **“The Effects of Generative AI on High-Skilled Work: Evidence from Three Field Experiments with Software Developers.”** 2025 working paper. [Original MIT-hosted paper](https://economics.mit.edu/sites/default/files/inline-files/draft_copilot_experiments.pdf).
- **[S28]** Baltes, S. and Treude, C. **“Toward Evidence-Based Agentic Software Engineering.”** October 26, 2026 preprint analyzing experiment reporting. [Original paper](https://arxiv.org/abs/2610.35348).
- **[S29]** Zhong, R. et al. **“Human-AI Synergy in Agentic Code Review.”** March 2026 preprint / observational study. [Original paper](https://arxiv.org/abs/2603.15911).
- **[S30]** Debenedetti, E. et al. **“AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents.”** 2024. [Original paper](https://arxiv.org/abs/2406.13352).
- **[S34]** Hamidi, A., Konstantinou, M., Degiovanni, R. and Papadakis, M. **“How Effective Are Traditional Test Criteria at Detecting Bugs in Large Language Models Generated Code?”** September 8, 2026 preprint; 6,066 selected difficult faults from five models across four benchmarks. [Original full text](https://arxiv.org/abs/2609.09315).
- **[S35]** Yang, W., He, R. and Zhou, M. **“A First Look at Coding Agents’ Compliance with AI Contribution Rules in Open-Source Communities.”** July 29, 2026 preprint; RepoComplianceBench. [Original full text](https://arxiv.org/abs/2607.26819).
- **[S31]** OWASP. **“AI Agent Security Cheat Sheet.”** Ongoing security guidance; accessed November 2026. [Original guidance](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html). Normative, not an RCT.
- **[S32]** OpenCode. **V2 Agent Documentation.** [Official documentation](https://opencode.ai/v2/docs/agents). Applicability to FIFE requires inspection of the specific fork version.
- **[S33]** OpenCode. **Agent Documentation, earlier interface.** [Official documentation](https://docs.opencode.ai/docs/agents/). Differences with V2 make configuration verification essential.

---

**Handoff condition:** This file and the separate evidence matrix can be used as research inputs for a future **instruction-only** QA/QC review. That reviewer must inspect each actual role definition, verify FIFE-specific parser/tool behavior, challenge non-applicable principles, distinguish file-level and harness-level concerns, and avoid treating any research recommendation as a proven defect in the current files. No files were inspected or modified for this research.
