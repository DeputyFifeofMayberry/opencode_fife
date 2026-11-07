# Cold-session context reduction

Status: Awaiting approval  
Requirements revision: R1  
Date: 2026-11-06  
Evidence baseline: `dev` at `0d2111f091`; installed CLI reported `76a553a88790` and was four commits behind. This specification does not authorize installation.

## Outcome

Reduce the input context sent on a new session's first model call while preserving the instructions, skills, tools, and router behavior needed for the task. The user wants detailed guidance to be available when relevant, with a clear trigger or route to it, and wants router and tool guidance compacted without removing capabilities.

This is one outcome with four connected parts: measurement, project-instruction routing, skill discovery, and router/tool guidance. Their common acceptance question is whether a comparable first request becomes smaller without losing the ability to find and follow applicable guidance. A detailed implementation plan and execution require separate authorization after this specification is reviewed.

## Findings reviewed

- The last investigation found 12 recent top-level sessions at this repository path whose first recorded assistant steps reported 20,864–23,895 input tokens, including cached input. These are historical provider usage records, not a controlled benchmark. Session prompts, attachments, settings, and versions were not held constant; they cannot establish a fixed baseline or category shares.
- Four recent stored initial instruction snapshots contained one root `AGENTS.md` of 27,958 characters, 43 advertised skill entries with 15,820 description characters, and a Code Mode catalog with 7,302 characters of listing lines. These are snapshot values, not model token counts or proof of the complete post-plugin request.
- The tool catalog's 2,000-token budget is based on a four-character heuristic and does not bound pinned entries or all surrounding and direct-tool content. The previously suggested category sizes and 3,000–5,000-token savings are hypotheses, not acceptance thresholds.
- `SessionContext.select` combines catalog and instruction sources; `SessionModelRequest` constructs a request after session hooks can change its content. The direct tool definitions and router-injected text are not fully captured in the stored instruction snapshot (`packages/core/src/session/context.ts`, `packages/core/src/session/model-request.ts`). Provider serialization may further change the request.
- The configured external `opencode-model-router@2.9.1` can inject a delegation protocol. A local rendering using the resolved configuration produced 5,624 characters with its acceptance section and 3,288 without it. This was not a capture from the running server; process environment and session state may differ. The package is external and is never vendored (`agent-system/README.md`). Do not edit its installed cache as source.
- Eligible skill descriptions are advertised; full skill bodies load on invocation. `metadata.opencode/autoinvoke: false` removes an entry from the advertised catalog. The skill tool looks up an ID and enforces permission; hiding a description does not itself give the model a trigger or guarantee discovery (`packages/core/src/skill/instructions.ts`, `packages/core/src/tool/plugin/skill.ts`). Actual loaded behavior remains to be tested.
- Nested `AGENTS.md` discovery is associated with successful reads through the native read tool, not every possible file access or edit (`packages/core/src/tool/plugin/read.ts`). It is useful reinforcement, not a complete trigger for every workflow.
- The TUI context indicator uses the most recent assistant step and includes output and reasoning as well as input and cached input. It is not an isolated first-request input measurement (`packages/tui/src/util/session.ts`).

## Scope and boundaries

Included: establish a reproducible first-request measurement; audit every applicable instruction and advertised skill; reduce always-loaded content while retaining clear routes; review and compact tool and router guidance where feasible; validate discovery and report before/after evidence.

Excluded: removing skills, tools, or router capabilities; changing permission, authorization, release, or service-adoption policy to save tokens; modifying a live server or installed global files; remote push, PR, release, or installation. Do not expose session content, credentials, provider headers, or private prompt text in committed artifacts. Do not use existing private conversation contents as benchmark fixtures.

The repository's canonical skill sources and manifest remain authoritative. Changes to global-scope skills affect other projects after a future authorized install; assess those effects explicitly. Preserve project skill precedence, public interfaces, naming, release policy, and the user's existing boundaries. If a public Protocol/Server `HttpApi` changes, run root `bun run generate` and never hand-edit generated clients.

## Requirements and acceptance criteria

### R-01: Measure the real assembly boundary

Provide a reproducible, privacy-conscious way to compare the first primary model request before and after the changes. It must observe the actual request assembly after session context hooks, including instructions, messages and attachments, tool definitions, and plugin additions, or label any inaccessible component explicitly. Use an isolated deterministic fixture and the same prompt, model/provider route, configuration, permission set, plugin state, and initial session conditions for each comparison. Record baseline and candidate revisions and distinguish direct tools from Code Mode catalog entries.

**AC-01:** A reviewer can repeat the comparison and see per-category rendered character counts, total request character/byte counts as applicable, and the method and limits. Count categories once, explain any overlap, and identify unmeasured provider framing or plugin data. If a model-specific tokenizer or provider-reported input is available, report it separately; never call character estimates measured tokens. A live provider comparison is optional and must disclose cost and cache status; do not disturb an active server or save raw private requests.

**AC-02:** Report total first-request input reduction for the controlled scenario, with uncached and cached input distinguished when a provider is used. If exact provider tokens are unavailable, report a reproducible estimate and clearly state that exact reduction is unverified. Do not substitute the post-task TUI context figure.

### R-02: Preserve and route project guidance

Inventory the existing root `AGENTS.md` rule by rule. For each rule record its destination, trigger, and why it remains always loaded or can be deferred. Keep immediately relevant safety and authorization boundaries, repository invariants, and concise instructions to load specialist guidance. Do not weaken a rule by moving it. Review affected role instructions and skill references to root sections; update references or preserve their targets.

**AC-03:** Every removed or shortened substantive rule is traceable to equivalent retained wording, a named destination and trigger, or an explicitly approved removal. All destinations exist; their paths, names, and skill IDs resolve in the actual runtime. Documentation-only links must clearly tell the agent when to read them.

**AC-04:** For each group below, show a successful route to the complete applicable rules before the relevant action. Use the simplest existing skill or guide where it fits; new material must not duplicate conflicting guidance.

| Trigger | Minimum guidance to preserve |
| --- | --- |
| Writing or editing code | Repository-wide style and relevant specialized style rules. |
| Changing session execution, inbox, history, or compaction | Applicable session-core invariants and related boundary rules. |
| Explaining a technical decision or preparing prose | The user's communication requirements and applicable Humanizer guidance. |
| Creating or installing a local update | Explicit user request, clean committed `dev`, canonical procedure, and live-session safeguards. |
| Live TUI or desktop diagnostics | Safe shared-server and storage practices; CDP `noDefaults` and live-window preferences. |
| TUI stories or theme work | Production-component stories, fixture safety, story controls, semantic tokens, and required theme checks. |
| Testing or Git/release operations | Existing test-skill triggers, non-root test rule, worktree and Git safety, approval boundaries, and generation requirements. |

**AC-05:** Test startup from repository root and a relevant subdirectory. Test a path-based read and at least one workflow that would otherwise bypass native read discovery. A nested `AGENTS.md` alone is not accepted as proof that a rule is always loaded before an edit or shell action.

### R-03: Audit and improve skill discovery

Inventory the skills actually advertised under the controlled configuration, including ID, source, scope, description size, trigger, proposed classification, and destination. Classify as advertised with a concise description, routed by a specific instruction or skill, or explicit invocation. Keep specialized skills available. Favor short discoverable descriptions for broadly useful global skills where hiding them could affect other projects. Do not classify skills solely by description length.

**AC-06:** Every changed catalog entry has a clear reason and retains the distinctions needed for selection. A hidden skill has an explicit route naming its exact ID and trigger, or is explicitly limited to user invocation. Verify that it can be loaded when permitted, and that permission denial still works. Measure the initial catalog and the full body loaded later; do not claim savings for a deferred body that was not in the initial request.

**AC-07:** Review at least `constraint-driven-development`, `component-tests`, `unit-tests`, `craft-prompting`, `construction-humanizer`, and `security-and-hardening` individually. Preserve the user's prompt-writing requirement, test-skill triggers, natural-language construction-writing discovery, and security applicability. The earlier suggested classifications are proposals, not predetermined removals.

**AC-08:** Check changes against global installation scope and installed/project precedence. Regenerate and verify the agent manifest as required by repository instructions; run agent-system checks. Do not install as part of this work.

### R-04: Compact tool and router context without losing capabilities

Measure the tool catalog, direct tool definitions, and router contribution separately where possible. Review lengthy signatures including `opencode.models`, `context7.query-docs`, and `context7.resolve-library-id`; preserve valid call signatures and a reliable path to any omitted detail. Keep pinned or immediately visible information where required for safe use. Evaluate whether shorter descriptions, schema rendering, or existing search can reduce startup size without deleting tools or capabilities.

**AC-09:** For each changed tool listing, verify representative valid calls and relevant error handling against the real implementation; if details are deferred, verify discovery returns the exact callable signature. Compare catalog size before and after. Do not represent changes in output schema or permission behavior as mere wording changes.

**AC-10:** Review router duplication and produce either a source-backed, testable compaction change in an authorized source location or a documented recommendation with the external ownership and required follow-up. Never modify the installed package cache. Preserve tier routing, dispatch syntax, verification, and applicable approval gates. No router feature is disabled to achieve the target.

### R-05: Verify behavior and report tradeoffs

Use reproducible structural checks and representative task scenarios. Validate skill selection, actual load, and use of the relevant instruction separately: the presence of a trigger is not proof that a model follows it. Run relevant repository checks from the proper directories, and read the matching testing skill before writing tests. Include root `bun run agent:manifest -- --check`, `bun run test:agent-system`, and applicable `bun run check` when changes warrant them; regenerate the manifest first if managed skill sources change.

**AC-11:** Exercise simple question; code edit; session-core work; local-update request; live TUI and desktop diagnostics; TUI story and theme change; each of the four test families; prompt creation; construction writing; and security-relevant work. Report correct route and content for each, including negative cases where unrelated guidance stays unloaded. Include a missing or denied skill and explain the user-visible failure or fallback. Check root and subdirectory contexts, and a task crossing domains.

**AC-12:** Report baseline/candidate measurements, test environment, changed guidance, actual checks and results, untested providers or models, global-scope effects, and remaining risks. Behavioral results must identify model, sample prompts, number of trials, and observed outcomes; a deterministic fixture or synthetic check is not a claim of reliable live model behavior. If live verification is unavailable, mark the affected acceptance evidence unverified rather than manufacturing a pass.

**AC-13:** No reduction target overrides safety, discoverability, compatibility, or verification. If measurement shows no reduction or regressions, report the result and revise or retain the original behavior rather than hiding the failure.

## Review and risk disposition

1. **Measurement attribution — high:** Existing snapshots omit final plugin and direct-tool data. R-01 requires a post-hook comparison and labels unavailable provider framing; the 3,000–5,000 estimate is not a promise.
2. **Lost instructions — high:** A moved rule can become unreachable or arrive after an action. R-02 requires a rule map, explicit triggers, role-reference review, and action-level scenarios.
3. **Hidden skills — high:** Removing a catalog description removes the model's normal discovery cue. R-03 requires exact-ID routing or explicit-only classification, permission checks, and representative behavior tests.
4. **Global side effects — medium:** Global skills are shared outside this repository and project precedence matters. R-03 requires scope review and avoids installation.
5. **Router ownership — medium:** The current router is an external dependency, not a repository source file. R-04 forbids cache edits and permits a measured recommendation when an authorized upstream source is unavailable.
6. **False confidence in tests — medium:** Checking an instruction string cannot prove model behavior. R-05 separates structural and live evidence and permits an honest unverified result.
7. **Cache and later context — medium:** A smaller first request does not necessarily reduce every task's overall usage; on-demand reads and cache economics vary. Report first-call and later task effects separately if measured.

This review was performed by the author of the investigation, not an independent reviewer. The specification is awaiting human review; no implementation or runtime behavior has been approved by its creation.

## Approval and execution record

- R1 drafted from the user's stated objective and read-only investigation; no production changes made.
- Repository integrity follow-up after drafting: root `Y:/CodingProjects/opencode_fife`; branch `dev` and HEAD `0d2111f09181c59b17c777d603dd8d684ee1f25b`; local `dev` and locally recorded `origin/dev` have no divergence. The only worktree is the root checkout. Its only untracked change is this specification; no tracked changes, stashes, merge, cherry-pick, revert, or rebase were found. The configured remotes are `origin` (DeputyFifeofMayberry/opencode_fife) and `upstream` (anomalyco/opencode); GitHub CLI authentication is available. No fetch was performed. This is a follow-up check, not a claim that all checks preceded drafting.
- Approval state: Awaiting approval. Approving the specification and authorizing implementation are distinct unless the user explicitly grants both.
- Open technical evidence: actual post-hook request measurement, provider tokenization, effective running-server environment, live model adherence, and authorized router source availability. These are investigation/verification requirements rather than established results.
