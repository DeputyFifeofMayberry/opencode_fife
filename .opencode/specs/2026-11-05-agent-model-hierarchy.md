# Agent Model Hierarchy, Planning Consolidation, and Session Isolation

**Status:** Approved
**Approval:** Revision 2 approved by user on 2026-11-05
**Revision:** 2

## 1. Objective

The agent system currently runs two overlapping designs. The `fife` model-router tiers (`fast`, `medium`, `heavy`) own model selection for delegated work, while the four SDD roles (`spec-writer`, `implementer`, `tester`, `qa`) run on the runtime default model and enforce their own delegation rules. A built-in `plan` agent also overlaps the Spec Writer as a planning entry point. The result is a hierarchy where the tiers, the SDD roles, and the planning agent do not agree on who plans, who delegates, or which model runs which role.

This change makes the hierarchy explicit and coherent:

- `spec-writer` replaces `plan` as the planning agent. `plan` is disabled through configuration, not removed from core code.
- The medium tier model becomes the default for `spec-writer`, `implementer`, `tester`, and `build`. `explore` uses the fast tier. `qa` uses the heavy tier. The tier preset remains the single definition of the model IDs.
- Tool permission prompts are auto-accepted in the TUI. Hard role and safety blocks remain, and the SDD stage approvals remain conversation-level.
- One nested delegation level is allowed, so the Implementer and QA can use `explore` or a tier when a task needs it.
- The tier access matrix prevents `build` and the tier agents from bypassing the Spec Writer's stage gates.
- The Spec Writer verifies the repository state at session start, records the branch and worktree state, and moves the session into a dedicated worktree when the current tree is dirty or already claimed by another session.

When the work is complete, `opencode debug agents` shows one planning agent, one model hierarchy, and no `plan`; the live TUI accepts tool permissions without prompting; the SDD workflow still pauses for user approval at each stage; and each Spec Writer session starts with a recorded repository integrity check and an isolated worktree when needed.

**Relationship to the approved baseline.** This specification supersedes R-09 and R-10 of `.opencode/specs/2026-11-05-agent-system-consolidation.md` and the `cli.json` absent-file behavior in its R-08. The earlier specification remains the baseline for the role content, manifest, install, backup, status, rollback, and clean-install requirements.

## 2. Existing behavior

### 2.1 Agent inventory

`opencode debug agents` currently lists 15 agents: `build`, `compaction`, `explore`, `fast`, `general`, `heavy`, `implementer`, `medium`, `model-router-grader`, `plan`, `qa`, `spec-writer`, `summary`, `tester`, `title`. Evidence: `C:\Users\barne\.config\opencode\agent-system.verify.log` (exit 0).

The four SDD roles are markdown agents under `.opencode/agents/` and are installed to `~/.config/opencode/agents/`. Their frontmatter sets mode and permissions, with no `model` or `temperature`:

- `spec-writer`: `primary`; `edit * deny` except `.opencode/specs/**`; `shell * deny` except narrow git reads; `subagent * deny`, `explore allow`, `implementer`/`tester`/`qa` ask.
- `implementer`: `all`; `edit * allow` except specs and its own file; `shell * ask` with git/bun allows; `subagent * ask`, `explore allow`.
- `tester`: `subagent`; `edit * deny` except test paths and `.opencode/reports/testing/**`; `shell * ask` with narrow allows; `subagent * deny`.
- `qa`: `subagent`; default deny, then read/glob/grep/skill/webfetch/websearch/question/execute allow; `shell * ask` with git reads; `edit .opencode/reports/qa/** allow`; `subagent explore ask`.

### 2.2 Model hierarchy

Only the three tier agents have explicit models, from the `fife` preset in `agent-system/config/model-router.overrides.jsonc` and the live `~/.config/opencode/opencode-model-router.overrides.jsonc`:

- `fast`: `vercel/minimax/minimax-m3.1-flash`, variant `medium`, cost ratio 1.
- `medium`: `mistral/deepseek-v4-1-flash-1017`, variant `max`, cost ratio 3.
- `heavy`: `vercel/openai/gpt-6.1-terra`, variant `high`, cost ratio 8.

No top-level `model` is set in `opencode.json`, the project `.opencode/opencode.jsonc`, or the live config. Agents without an explicit model therefore use the runtime default: the first enabled text-capable model, with a free-model preference when the catalog is signed out. Evidence: `packages/core/src/session/runner/model.ts:77-88`, `packages/core/src/model-resolver.ts:506-519`, `packages/core/src/model.ts:300-305`, `packages/core/src/config/plugin/provider.ts:93-101`.

The SDD roles, `build`, `explore`, and `general` have no explicit model. The tier hierarchy therefore governs only the three tier agents, not the roles that do the work.

### 2.3 Planning overlap

`plan` is a built-in primary agent in `packages/core/src/plugin/plan.ts:12-41`. Its description says it is read-only, but its permissions only deny edits outside `~/.opencode/plan`; it has no `shell` or `subagent` deny, so shell commands and subagent calls are permitted by the base allow-all ruleset. The read-only guarantee is prompt-enforced, not permission-enforced.

`spec-writer` is also a primary agent and already owns specification writing, stage coordination, and handoffs. The two overlap as planning entry points. Active references to `/plan` appear in `.opencode/references/orchestration-patterns.md:83,318`; no `.opencode/command/plan.md` exists.

The effort system also special-cases `plan`: `packages/core/src/effort/delegation.ts:10-16` maps the agent id to the `plan` operation, and `packages/core/src/effort/adapter.ts:65` pins `deep` effort for `input.agent === "plan"`. Disabling the agent makes the mapping dormant without an error, but the pin is a separate hard-coded check, so the replacement is not complete until both move to `spec-writer`.

### 2.4 Delegation and permission conflicts

- The router protocol is injected into top-level orchestrator sessions and tells the orchestrator to delegate to `fast`/`medium`/`heavy` (`opencode-model-router@2.9.1`, `src/router/protocol.ts:186-232`). `spec-writer` denies all tiers, so the protocol and the role permissions disagree.
- `implementer` may ask for any subagent, but `experimental.subagent_depth` defaults to `1` (`packages/schema/src/config/experimental.ts:46-47`; `packages/core/src/tool/plugin/subagent.ts:139-142`). When the Spec Writer invokes the Implementer, a nested call to `explore` or a tier is blocked. The Implementer prompt acknowledges this at `implementer.md:155`.
- `build` has allow-all permissions and no `subagent` rule, so it can invoke `implementer`, `tester`, or `qa` directly and bypass the Spec Writer's stage gates.
- `medium` and `heavy` also have allow-all permissions and no `subagent` rule. With a depth of 2 they could act as orchestrators, although the router protocol treats them as executors.
- `cli.json` sets `session.permissions: "prompt"` (line 25). The installer changes `autoaccept` back to `prompt` by default to preserve the SDD `ask` gates (`script/agent-system/merge.ts:93-134`). The current installed manifest records `permissionMode: "prompt"` and `keepAutoAccept: false`.

### 2.5 Documentation and install drift

- `docs/model-router.md:42` lists the medium model as `vercel/deepseek/deepseek-v4.1-flash-1017`; the live and canonical overrides use `mistral/deepseek-v4-1-flash-1017`.
- `docs/model-router.md:110` shows `maxAttemptsPerTier: 1`; the live override uses `2`.
- `docs/model-router.md:238` says `/tiers` shows no variant fields, which conflicts with the pinned variants.
- `agent-system.installed.json` records source commit `178d3d5`, an ancestor of current HEAD `69c0d41`. Managed hashes match the current manifest, but the recorded install revision is behind.

## 3. Scope

### In scope

1. Disable `plan` through configuration and make `spec-writer` the planning primary. Update active references and the effort integration that special-cases `plan`.
2. Set the top-level default model to the medium tier model, map `explore` to the fast tier and `qa` to the heavy tier, and keep the tier preset as the single model definition.
3. Set `experimental.subagent_depth` to `2`.
4. Make `session.permissions: "autoaccept"` the installed default, keep the hard deny rules, and keep the SDD stage approvals.
5. Define and enforce the tier access matrix so `build` and the tier agents cannot bypass the SDD stage gates.
6. Update the installer, manifest, tests, and documentation, then reinstall and verify the live runtime.
7. Add a session-start repository integrity check and worktree isolation to the Spec Writer, including the small `worktree_create` extension for a named branch.

### Out of scope

1. Removing `packages/core/src/plugin/plan.ts` or the `plan` agent from core code. Configuration disables it; the code and its unit tests remain.
2. Changing the model IDs, providers, cost ratios, or plugin version of `opencode-model-router@2.9.1`.
3. Changing the SDD role semantics beyond the tier-access clarification, the autoaccept distinction, and the session-start integrity addition.
4. Historical specifications and plans under `.opencode/specs/`, `docs/superpowers/`, and `docs/plans/`; they are preserved as records.
5. Upstream package documentation examples such as `packages/web/src/content/docs/*/config.mdx`.
6. Secrets, credentials, authentication, or `service*.json` handling.
7. CI, release, publishing, or non-Windows installers.

## 4. Requirements

**R-01. Planning consolidation.** `plan` must be disabled through configuration in `agent-system/config/opencode.fragment.json` (the canonical `opencode.json` fragment) and the project `.opencode/opencode.jsonc` (`agents.plan.disabled: true`). `spec-writer` must be the only primary planning agent; `build` remains the default coding agent. Active repository guidance must not instruct users to use `/plan`. The effort integration must move the planning behavior from `plan` to `spec-writer`: change the `DEFAULT_OPERATIONS` key in `packages/core/src/effort/delegation.ts` from `plan` to `spec-writer`, change the mode pin in `packages/core/src/effort/adapter.ts` from `input.agent === "plan"` to `input.agent === "spec-writer"`, and update the affected effort tests. The operation name `plan` in the policy remains unchanged; it is not an agent id. Historical specs and plans are exempt.

**R-02. Default model.** The top-level `model` must be `mistral/deepseek-v4-1-flash-1017#max` in `agent-system/config/opencode.fragment.json` and the project `.opencode/opencode.jsonc`. This is the medium tier model. It must apply to every agent without an explicit model, including `spec-writer`, `implementer`, `tester`, `build`, `general`, and the hidden utility agents. No agent may carry a conflicting explicit model.

**R-03. Tier mapping.** `explore` must resolve to the fast tier model (`vercel/minimax/minimax-m3.1-flash`, variant `medium`). `qa` must resolve to the heavy tier model (`vercel/openai/gpt-6.1-terra`, variant `high`). `fast`, `medium`, and `heavy` must keep their preset models. The mapping must use `subagentTiers` in `agent-system/config/model-router.overrides.jsonc` (`{"explore":"fast","qa":"heavy"}`) or an equivalent mechanism that produces the same resolved models. Any explicit model used as a fallback must match the tier preset exactly.

**R-04. Delegation depth.** `experimental.subagent_depth` must be `2`. The Spec Writer must be able to invoke the Implementer. The Implementer must be able to invoke `explore` or a tier one level down, and the QA must be able to invoke `explore` one level down. The router's dispatch caps and the SDD stage gates must remain in force.

**R-05. Tier access matrix.** The effective permissions must enforce the following matrix:

| Caller | May invoke | Must not invoke |
|---|---|---|
| `spec-writer` | `explore`, `fast`; `implementer`, `tester`, `qa` with ask | `medium`, `heavy` |
| `implementer` | `explore`; `fast`, `medium`, `heavy`, `general` with ask | `spec-writer`, `tester`, `qa` |
| `tester` | none | all subagents |
| `qa` | `explore` with ask | all other subagents |
| `build` | `explore`, `fast`, `medium`, `heavy`, `general` | `spec-writer`, `implementer`, `tester`, `qa` |
| `fast` | none | all subagents |
| `medium`, `heavy` | none | all subagents |

The `ask` entries are auto-accepted under R-06; they remain `ask` so the permission model still records the delegation boundary. The matrix must prevent `build` and the tier agents from starting SDD work without the Spec Writer's stage gates. The `spec-writer` prompt must state that `fast` and `explore` are the read-only options and that `medium` and `heavy` are outside the role. The role prompts must be updated where they describe the old depth default or the tier prohibition.

**R-06. Auto-accept default.** `cli.json` must set `session.permissions: "autoaccept"`. The installer must make autoaccept the default, preserve it on reinstall, and record `permissionMode: "autoaccept"` in `agent-system.installed.json`. If `cli.json` is absent, the installer must create it with autoaccept. The installer must offer an explicit `-PromptPermissions` opt-out that restores `prompt` mode and records it. The former `-KeepAutoAccept` behavior must be removed or documented as deprecated. Autoaccept must suppress tool permission prompts only; the SDD stage approval questions must remain.

**R-07. Deny preservation.** Autoaccept must not weaken any deny rule. The Spec Writer must still be unable to edit application code, the Tester must still be unable to edit production code, and every command, path, or resource that is currently denied for an agent must remain denied. The Implementer's existing `ask` boundaries remain `ask` and are auto-accepted; the change must not turn an existing deny into an allow. The installer must not silently change a role's `deny` rules.

**R-08. Installer and manifest.** `agent-system/config/opencode.fragment.json` must include `model`, `agents.plan.disabled`, the tier-access permissions, and `experimental.subagent_depth`. `agent-system/config/model-router.overrides.jsonc` must include `subagentTiers`. The installer must merge them into the live configuration while preserving unrelated keys, other presets, the active preset and mode, and `service*.json`. It must update the manifest hashes and versions. The agent-system version must be bumped to `2.1.0`; the role-content version must be bumped to `1.2.0` because R-05 changes the `spec-writer` prompt. Clean install, idempotence, merge preservation, and the `-PromptPermissions` opt-out must have automated tests.

**R-09. Documentation.** The following must be updated: `docs/model-router.md` (medium model, `maxAttemptsPerTier`, variant wording), `agent-system/README.md` (tier/SDD boundary, autoaccept default, `-PromptPermissions`, plan disabled, model mapping), `AGENTS.md` and `docs/local-development.md` (autoaccept default, plan replacement), and `.opencode/references/orchestration-patterns.md` (remove `/plan` from the active pipeline). No active guidance may tell users to use `plan` or claim that autoaccept suppresses the SDD stage approvals. Document that a persisted session using `plan` must switch to `spec-writer`. Correct the installer-verification claim in `agent-system/README.md` to match the checks actually performed.

**R-10. Runtime verification.** After `bun run update:local`, `opencode debug agents` run from outside the repository must show no `plan`, the expected modes, and the expected models for `spec-writer`, `implementer`, `tester`, `build`, `explore`, `qa`, and the three tiers. A live session must show no tool permission prompt for a representative `ask` action, a stage approval question at the Spec Writer boundary, and a blocked denied action. A nested delegation must succeed.

**R-11. Non-regression.** The model-router plugin version, model IDs, and routing behavior must not change. The existing agent-system tests must pass after their expected updates. `bun run check` must pass, or any failure must be demonstrated pre-existing and unrelated. No secrets or machine-specific absolute paths may enter the repository.

**R-12. Session-start repository integrity and isolation.** At the start of a session, before writing a specification or invoking a downstream agent, the Spec Writer must:

1. Verify the working directory is a Git repository and record the repository root, current branch, HEAD commit, and remote URLs.
2. Record the working-tree state, including tracked changes, untracked files, stashes, and any in-progress merge, rebase, or cherry-pick.
3. List all worktrees and their checked-out branches, and identify any worktree or branch already in use by another session.
4. Determine the base branch: use the current local `dev` when it has unpushed work; otherwise use `origin/dev`. Compare local `dev` with `origin/dev`, record the base commit, and record whether the current branch is ahead, behind, or diverged.
5. If the current worktree is clean and not claimed by another session, use it. If it is dirty or claimed, create a dedicated worktree and branch based on the chosen base, then move the current session into that worktree.
6. Record the worktree path, branch, base commit, integrity results, and isolation decision in the specification's execution record or a session-start record.
7. Never check out, reset, remove, or repurpose another session's worktree or branch. Never modify application code, tests, dependencies, or configuration during setup.
8. If a check fails (not a Git repository, missing `dev`, unreachable remote, worktree creation failure, ambiguous dirty state), stop and report the blocker to the user. Do not proceed with a guessed state.

This requirement applies when the Spec Writer is the active agent. It does not change the default agent or add the check to `build`.

If `gh` is available, the Spec Writer must also check `gh auth status` and report whether GitHub CLI authentication is usable. A missing or unauthenticated `gh` is reported but does not block local work.

The Spec Writer may use the `execute`/Code Mode tool to call `worktree_list`, `worktree_create`, and `session_move` for this setup. This is the only permitted write operation outside `.opencode/specs/`. The `execute` tool must not be used to edit application code or run arbitrary shell commands. `worktree_remove` remains blocked by the Spec Writer's `edit * deny`.

## 5. Acceptance criteria

**AC-01 (R-01).** `opencode debug agents` does not list `plan`. `spec-writer` is present as a primary agent and is the planning entry point. A repository search of active guidance finds no `/plan` workflow instruction. The effort mapping seeds `spec-writer` with the `plan` operation and the deep pin, and the affected effort tests pass. A persisted session whose agent is `plan` fails with the existing `AgentNotFoundError`, and the documentation tells the user to switch it to `spec-writer`.

**AC-02 (R-02).** The resolved model for `spec-writer`, `implementer`, `tester`, and `build` is `mistral/deepseek-v4-1-flash-1017` with variant `max`. No agent carries a conflicting explicit model.

**AC-03 (R-03).** The resolved model for `explore` is `vercel/minimax/minimax-m3.1-flash` with variant `medium`. The resolved model for `qa` is `vercel/openai/gpt-6.1-terra` with variant `high`. `fast`, `medium`, and `heavy` keep their preset models.

**AC-04 (R-04).** A controlled nested delegation from `implementer` to `explore` and from `qa` to `explore` succeeds. The effective subagent depth is 2, and the router caps still apply.

**AC-05 (R-05).** The effective permissions match the matrix. `build` cannot invoke `implementer`, `tester`, or `qa`. `medium` and `heavy` cannot invoke any subagent. `spec-writer` can invoke `fast` and `explore` but not `medium` or `heavy`.

**AC-06 (R-06).** `cli.json` contains `session.permissions: "autoaccept"`. A representative `ask` action in a live session does not show a permission prompt. The Spec Writer still asks for stage approval before implementation, testing, and QA. `-PromptPermissions` restores prompt mode and is recorded.

**AC-07 (R-07).** A Spec Writer attempt to edit an application source file is blocked. A Tester attempt to edit a production source file is blocked. A command that is currently denied for the Spec Writer, Tester, or QA is still denied. Autoaccept does not turn any existing deny into an allow.

**AC-08 (R-08).** A clean install with `-ConfigRoot` creates the expected configuration and manifest. A second install is idempotent. The merge preserves unrelated keys, other presets, and the active preset/mode. The manifest validates and its hashes match.

**AC-09 (R-09).** The documentation changes are present. `docs/model-router.md` shows the medium model `mistral/deepseek-v4-1-flash-1017` and `maxAttemptsPerTier: 2`. No active document claims autoaccept suppresses the stage approvals.

**AC-10 (R-10).** A full `bun run update:local` on a committed tree succeeds. `opencode debug agents` from outside the repository shows the expected hierarchy. A live session confirms no tool permission prompt, a stage approval question, and a blocked denied action.

**AC-11 (R-11).** `bun run test:agent-system` passes with the updated tests. `bun run check` passes, or its only failures are demonstrated pre-existing and unrelated. A secret scan of the changed tree is clean.

**AC-12 (R-12).** Given a clean repository on `dev`, when a Spec Writer session starts, then it records the branch, HEAD, remote, worktree list, and clean status, and uses the current worktree. Given a dirty working tree or a worktree already claimed by another session, when the session starts, then it creates a new worktree and branch based on the chosen base, moves the session into it, leaves the original worktree untouched, and records the new path and branch. Given a missing `dev` branch or an unreachable remote, then it stops and reports the blocker. The original worktree's files and Git state are unchanged in every case. The Spec Writer's effective permissions include the new read-only Git checks, and the `execute` exception reaches `worktree_list`, `worktree_create`, and `session_move` but not `worktree_remove`.

## 6. Technical constraints

1. **Model selection syntax.** The top-level `model` accepts `provider/model#variant` or `{providerID, model, variant}` (`packages/schema/src/config/model.ts:12-36`). Use `mistral/deepseek-v4-1-flash-1017#max`.
2. **`subagentTiers` scope.** It applies to agents whose mode is `subagent` or unset. Mode `all` and `primary` are skipped. Markdown-defined subagents are skipped at config time but can receive the tier at dispatch time when the call names no model. `implementer` is mode `all`, so it inherits the top-level default. `qa` is a markdown subagent; `explore` is a built-in subagent. Verify both at runtime.
3. **Disabling an agent.** `agents.plan.disabled: true` removes the agent from the agent map (`packages/core/src/config/plugin/agent.ts:93-127`). It does not delete the core plugin or its tests.
4. **Permission evaluation.** Rules are evaluated last-match-wins; a matching deny wins over an ask (`packages/core/src/permission.ts:86-96,161-181`). Config permissions append to the built-in rules, so the new denies must come after the allow-all rules.
5. **Autoaccept.** The TUI suppresses permission prompts only when `permission.mode === "autoaccept"` (`packages/tui/src/routes/session/index.tsx:214,271,2797`). Core still evaluates `ask`; an unattended ask with no user present becomes a deny. The SDD stage approvals are conversation-level and are not affected.
6. **Installer merge.** `opencode.json` is JSON; the router overrides are JSONC; `cli.json` is JSON. Preserve unrelated keys and comments where the parser supports them. Back up before writing, write atomically, and validate after writing.
7. **Windows and Bun.** The install path is Windows PowerShell, and the repository pins Bun 1.4.4. Keep the existing dirty-tree guard and backup retention.
8. **Plugin boundary.** `opencode-model-router` is GPL-3.0-only and is never vendored. Pin `2.9.1`; do not substitute another version.
9. **Versioning.** The agent-system version is independent of the CLI dev version. Bump the agent-system version and the role-content version when their content changes, and update the manifest hashes.
10. **Effort integration.** `DEFAULT_OPERATIONS` maps agent ids to operations; `operationFor` falls back to `general` for unknown ids. Disabling `plan` makes the old key dormant without an error. The deep pin is a separate hard-coded check in `adapter.ts:65`, so the mapping change alone does not move it. Change both to `spec-writer` and update `delegation.test.ts`, `adapter.test.ts`, and `consistency.test.ts`.
11. **Session-start tools.** `worktree_list` takes no input and returns the worktrees. `session_move` takes a directory and moves the current session at the next safe boundary; do not run destination-dependent tools in the same `execute` call. `worktree_create` currently takes only a name and creates a detached-HEAD worktree (`packages/core/src/tool/plugin/opencode.ts:31-33,162-175`; `packages/core/src/git.ts:1436-1445`). The `Worktree.CreateInput` schema already supports `branch` and `from` (`packages/schema/src/worktree.ts:11-21`), so the tool and git strategy must be extended to create a named branch from the chosen base. `worktree_remove` must remain blocked by the Spec Writer's `edit * deny`.
12. **Worktree location.** The default worktree parent is outside the project (`global.data/worktree/...`). The Spec Writer's `external_directory: ask` is auto-accepted under R-06. If the session must write specs before the move completes, set `worktree.directory` to a location inside the project or wait for the move before writing. The required behavior is that the session ends up in the worktree before any specification write.
13. **Base selection.** The worktree must be based on the chosen `dev` base, not the current feature branch. If the current branch is not `dev`, the worktree creation must still use the chosen base. The `branch` and `from` fields in `Worktree.CreateInput` are the intended mechanism.
14. **Read-only Git checks.** The Spec Writer's shell permissions must add `git --no-pager worktree list --porcelain`, `git --no-pager remote -v`, `git --no-pager status --porcelain=v2 --branch`, `git --no-pager rev-parse --abbrev-ref --symbolic-full-name @{upstream}`, `git --no-pager rev-list --left-right --count @{upstream}...HEAD`, `git --no-pager rev-parse dev origin/dev`, and `git --no-pager rev-list --left-right --count dev...origin/dev`. It must not add `git fetch`, `git pull`, `git checkout`, `git reset`, `git clean`, or `git worktree add`; worktree creation goes through the tool. If `gh` is available, add `gh auth status` as a read-only check.

## 7. Verification requirements

### 7.1 Static and automated checks

| Check | Requirement | Evidence |
|---|---|---|
| Manifest schema and hashes | R-08 | `bun run agent:manifest -- --check` exits 0; tamper test fails |
| Installer merge | R-08 | Unit tests for `model`, `agents.plan.disabled`, permissions, `experimental.subagent_depth`, `subagentTiers`, and `cli.json` autoaccept |
| Clean install and idempotence | R-08 | `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly`; second run changes nothing |
| `-PromptPermissions` | R-06 | Install with the flag; assert `prompt` mode and the recorded opt-out |
| Agent-system tests | R-11 | `bun run test:agent-system` passes |
| Typecheck and lint | R-11 | `bun run check` passes or pre-existing failures are documented |
| Secret scan | R-11 | No credentials or `service*.json` contents in the changed tree |

### 7.2 Runtime checks

1. Run `bun run update:local` on a committed `dev` tree.
2. From a directory outside the repository, run `opencode debug agents` and capture JSON.
3. Assert: no `plan`; `spec-writer` primary; `implementer` mode `all`; `tester` and `qa` subagent; `fast`/`medium`/`heavy` present; the resolved models from AC-02 and AC-03.
4. Assert the effective permissions from AC-05.
5. Start a live session with `spec-writer`. Trigger a representative `ask` action (for example, a subagent call) and confirm no permission prompt. Confirm the stage approval question appears. Attempt a denied edit and confirm the block.
6. Run a controlled nested delegation from `implementer` to `explore` and confirm it succeeds.
7. Confirm the router's dispatch caps and the tier models are unchanged.
8. Start a Spec Writer session in a clean repository on `dev`; confirm the integrity record and that no new worktree is created.
9. Start a Spec Writer session with a dirty working tree or an active worktree on another branch; confirm a new worktree and branch are created, the session moves, and the original tree is unchanged.
10. Start a Spec Writer session with a missing `dev` or an unreachable remote; confirm the blocker and that no specification is written.

### 7.3 Manual checks

1. Confirm the TUI shows no permission prompt for a tool call that would normally ask.
2. Confirm the Spec Writer still asks for approval before implementation, testing, and QA.
3. Confirm `plan` is absent from the agent selector and `spec-writer` is available as the planning primary.
4. Confirm `/tiers` or the router status shows the expected models and variants.
5. Confirm the Spec Writer records the repository integrity result and the worktree/branch decision before writing the specification.
6. Confirm the original worktree is unchanged after the session moves.

## 8. Supporting evidence and design decisions

### 8.1 Evidence

| Finding | Source | Status |
|---|---|---|
| 15 agents, including `plan` and the three tiers | `agent-system.verify.log`; prior spec | Locally verified |
| Only tiers have explicit models | `agent-system.verify.log`; config inspection | Locally verified |
| No top-level `model`; runtime default is catalog-dependent | `packages/core/src/session/runner/model.ts:77-88`; `model-resolver.ts:506-519`; `model.ts:300-305`; `config/plugin/provider.ts:93-101` | Locally verified |
| `plan` is read-only by prompt, not permissions | `packages/core/src/plugin/plan.ts:12-41` | Locally verified |
| `agents.plan.disabled` removes a built-in agent | `packages/schema/src/config/agent.ts:12-29`; `packages/core/src/config/plugin/agent.ts:93-127` | Locally verified |
| `subagentTiers` applies to subagent-mode agents; skips `all`/`primary` | `opencode-model-router@2.9.1/src/router/subagents.ts:85-88` | Locally verified |
| `experimental.subagent_depth` defaults to 1 | `packages/schema/src/config/experimental.ts:46-47`; `packages/core/src/tool/plugin/subagent.ts:139-142` | Locally verified |
| Autoaccept suppresses TUI prompts; deny still wins | `packages/tui/src/routes/session/index.tsx:214,271,2797`; `packages/core/src/permission.ts:86-96,161-181` | Locally verified |
| Installer resets autoaccept to prompt | `script/agent-system/merge.ts:93-134`; installed manifest | Locally verified |
| Docs drift on medium model and `maxAttemptsPerTier` | `docs/model-router.md:42,110`; live overrides | Locally verified |
| Installed source commit is behind HEAD | `agent-system.installed.json:5`; `git` HEAD | Locally verified |
| Effort system maps `plan` to the `plan` operation and pins `deep` | `packages/core/src/effort/delegation.ts:10-16`; `adapter.ts:46-47,65`; effort tests | Locally verified |
| Spec Writer has no session-start repository check | `.opencode/agents/spec-writer.md:105-172`; allowed git commands at `:24-45` | Locally verified |
| `worktree_create` takes only a name and creates a detached worktree | `packages/core/src/tool/plugin/opencode.ts:31-33,162-175`; `packages/core/src/git.ts:1436-1445` | Locally verified |
| `Worktree.CreateInput` already supports `branch` and `from` | `packages/schema/src/worktree.ts:11-21`; `packages/core/src/worktree.ts:204-225` | Locally verified |
| `session_move` is deferred to the next safe boundary | `packages/core/src/tool/plugin/opencode.ts:137-161`; `packages/core/src/session/move.ts:119-158` | Locally verified |
| Spec Writer's `execute` can reach worktree and session tools | `packages/core/src/tool.ts:271-305`; `packages/core/src/codemode/tool.ts:89-206` | Locally verified |

### 8.2 Decisions

| ID | Decision | Status | Rationale |
|---|---|---|---|
| D-01 | Disable `plan` through `agents.plan.disabled`; keep the core code and tests | User-approved | Reversible, no core fork changes, preserves upstream behavior |
| D-02 | Default model = medium tier model (`mistral/deepseek-v4-1-flash-1017#max`) | User-approved | Matches the current Spec Writer model and the `medium → implement` intent |
| D-03 | `explore` → fast; `qa` → heavy; tiers unchanged | User-approved | Aligns exploration, implementation, and review with the existing tier intent |
| D-04 | Autoaccept tool permissions; keep deny blocks; keep stage approvals | User-approved | Removes prompts without collapsing role separation or the supervised workflow |
| D-05 | `experimental.subagent_depth: 2` | User-approved | Makes the Implementer's and QA's delegation permissions usable |
| D-06 | Enforce the tier access matrix; prevent `build` and tiers from bypassing SDD gates | User-approved | Keeps one authoritative workflow and avoids two competing orchestrators |
| D-07 | Installer manages the new keys; `-PromptPermissions` opt-out | User-approved | Makes the hierarchy reproducible and leaves a deliberate path back to prompts |
| D-08 | Agent-system `2.1.0`; role-content `1.2.0` | User-approved | Records the behavior change in the manifest |
| D-09 | Keep MiniMax-M3.1-Flash on `explore` at the preset's `medium` variant; do not move the other SDD roles to it; test `high` only as a bounded experiment | Proposed | Current Artificial Analysis v5.0.1 shows MiniMax 4 index points behind DeepSeek and 6-8 points behind on coding and terminal benchmarks, with a negative AA-Omniscience score; the cost saving is not worth the quality risk for spec, implementation, testing, or QA |
| D-10 | Add a session-start repository integrity check and worktree isolation to the Spec Writer | User-requested | Prevents conflicts with concurrent sessions and makes the starting state explicit |

### 8.3 Alternatives considered

| Alternative | Why rejected |
|---|---|
| Remove `plan` from core code | Larger diff, changes upstream behavior, and breaks core tests for no user-visible gain; config disable is reversible |
| Keep `plan` and add a handoff to `spec-writer` | Leaves two planning entry points and the read-only permission gap |
| Set `spec-writer` to heavy | The user chose medium; heavy costs about 8x and the current Spec Writer already runs on medium |
| Remove all deny rules | The user chose to keep blocks; removing them would let the Spec Writer implement and the Tester edit production code |
| Keep `session.permissions: "prompt"` | The user explicitly wants no permission prompts |
| Keep depth 1 | The Implementer's and QA's subagent permissions would remain unusable |
| Let `build` call the SDD roles | Build would bypass the Spec Writer's stage gates, recreating the two-orchestrator clash |

### 8.4 MiniMax role assessment

Artificial Analysis v5.0.1, retrieved 2026-11-05:

| Model | Intelligence Index | Cost per task | Time per task |
|---|---|---|---|
| MiniMax-M3.1-Flash | 29 | $0.49 | 18.7 min |
| DeepSeek V4.1 Flash 1017 (Max) | 33 | $0.60 | 13.4 min |
| GPT-6.1 Terra (Max) | 51 | $0.96 | 13.2 min |

The comparison page shows MiniMax ahead on AutomationBench (73% vs 67%), GDP.pdf (21% vs 17%), HLE-Diamond (28% vs 25%), and CritPt (33% vs 25%). It trails DeepSeek on AA-Briefcase (1476 vs 1570), Terminal-Bench 4.0 (26% vs 34%), FrontierCode 2.0 (21% vs 28%), and Terminal-Bench-Science (3% vs 13%). The coding and terminal gap is the decisive one for implementation, testing, and QA. The comparison page gives MiniMax an AA-Omniscience net score of -6 and DeepSeek 1; the Terra page did not expose that value in the captured text.

The announcement-era figures of 42 and $0.22 per task come from a different index version and effort setting. The current v5.0.1 page shows 29 and $0.49 per task. The 42 figure is not a like-for-like comparison. VentureBeat and shattered.io report a 93% hallucination rate on the older AA-Omniscience version, and the current net score is -6. A model that guesses confidently when it does not know is a poor fit for specification writing, implementation, or independent review.

Conclusion: MiniMax is a good fit for read-only exploration, where the orchestrator verifies its findings. It is not approved for the other SDD roles. Raising the fast tier's variant from `medium` to `high` or `max` is supported by the catalog, but no measured cost or latency data exists for this model at those settings, and the quality evidence is confounded. Keep `medium`. If explore quality proves insufficient, run a bounded `high` trial and compare cost per task and explore accuracy before changing the default.

## 9. Risks and dependencies

| Risk | Why plausible | Mitigation |
|---|---|---|
| Cost increase from QA on heavy and the default on medium | Heavy is about 8x the fast tier; the default moves from an unknown catalog model to medium | Router dispatch caps remain; the user can switch presets; verify the cost ratio in `/tiers` |
| `subagentTiers` does not apply to `explore` or `qa` | The plugin skips markdown agents at config time and may not see the built-in `explore` | Verify at runtime; fall back to an explicit `agents.explore.model` / `agents.qa.model` that matches the preset |
| Config merge corrupts user configuration | New nested keys and permission arrays | Back up, merge only the canonical keys, validate after writing, and test unrelated-key preservation |
| Autoaccept hides a misconfigured deny | Prompts are suppressed, so a missing deny is silent | Run the deny tests in AC-07 and inspect the effective permissions |
| Disabling `plan` leaves the effort mapping or tests inconsistent | Core code special-cases `plan` | R-01 updates the mapping and pin to `spec-writer`; run the affected effort tests |
| Installed build is behind HEAD | `agent-system.installed.json` records an older commit | Commit the change, run `bun run update:local`, and verify the installed manifest |
| Plugin behavior changes on upgrade | External GPL plugin | Keep the exact `2.9.1` pin and verify the resolved models |
| Existing sessions with agent `plan` fail after the disable | The agent is removed from the map; `AgentNotFoundError` | Document the switch to `spec-writer`; the error is explicit |
| Spec Writer creates a worktree from the wrong base | `worktree_create` currently uses HEAD and a detached worktree | Extend the tool with `branch` and `from`; verify the base commit before writing the spec |
| Session move fails or lands outside the project | The move is deferred to the next safe boundary; worktrees default outside the project | Verify the move, record the destination, and wait for the boundary before writing |
| Two sessions claim the same worktree or branch | Concurrent sessions may start from the same directory | List worktrees and branches; never reuse an active branch; create a new worktree when in doubt |
| MiniMax hallucination rate affects a core role | The model has a negative AA-Omniscience score and a reported 93% hallucination rate on the older benchmark | Keep MiniMax on read-only explore; verify its findings; do not move spec, implementation, testing, or QA to it |
| Raising the fast variant erodes the cost advantage | Higher reasoning effort likely increases output tokens; no measured cost at `high`/`max` | Keep `medium`; test `high` only as a bounded experiment with cost and quality measurement |

**Dependencies.**

- The user has approved D-01 through D-08. D-10 is user-requested; D-09 is proposed.
- The repository must be committed on `dev` before a full `bun run update:local`.
- `opencode-model-router@2.9.1` must remain installed and pinned.
- R-05 requires a small tier-access clarification in the `spec-writer` prompt; the role-content version becomes `1.2.0`.

## 10. Open questions

None blocking. Minor decisions recorded for implementation:

1. The exact `-PromptPermissions` flag spelling and whether `-KeepAutoAccept` remains as a deprecated no-op.
2. The exact wording of the tier-access clarification in the role prompts.

## 11. Approval

**Decision:** Revision 2 approved by the user on 2026-11-05.

D-01 through D-08 were approved by the user on 2026-11-05. D-10 is user-requested. Revision 2 approval covers D-09 and the new R-12/AC-12 requirements. Specification approval does not authorize implementation; implementation requires a separate explicit authorization.

## 12. Execution record

**Execution status:** Not started
**Current stage:** Awaiting implementation authorization
**Authorizations:** Specification revision 2 approved 2026-11-05; implementation not authorized
**Correction cycles:** 0 of 2
**Next owner:** User for implementation authorization

| Stage | Owner | Authorization | Result | Evidence |
|---|---|---|---|---|
| Specification (revision 1) | Spec Writer | Requested by user | Superseded by revision 2 | Draft history |
| Specification (revision 2) | Spec Writer | Approved by user, 2026-11-05 | Approved | This document |
| Implementation | Implementer | Not authorized | Not started | None |
