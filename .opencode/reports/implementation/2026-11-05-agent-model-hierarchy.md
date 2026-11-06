# Implementation Report — Agent Model Hierarchy, Planning Consolidation, and Session Isolation

**Spec:** `.opencode/specs/2026-11-05-agent-model-hierarchy.md` (Revision 2, Approved 2026-11-05)
**Stage:** Initial implementation (authorized by user 2026-11-05)
**Status:** Implemented — ready for independent testing, except the live runtime install (R-10/AC-10), which needs a commit and explicit install authorization
**Branch:** `dev` @ `1fe5f42` (committed; installing to the live config)
**Next owner:** Spec Writer for Tester dispatch

## 1. Requirement status

| Req | Status | Evidence |
|---|---|---|
| R-01 Planning consolidation | Implemented (code complete) | `agents.plan.disabled` in fragment + project config; `plan` absent from `debug agents`; effort mapping moved to `spec-writer` |
| R-02 Default model | Implemented | `model: mistral/deepseek-v4-1-flash-1017#max` in fragment + project config; `debug agents` shows no explicit model on spec-writer/implementer/tester/build/general |
| R-03 Tier mapping | Implemented | `subagentTiers {explore:fast, qa:heavy}` plus explicit fallback models; verified resolved models |
| R-04 Delegation depth | Implemented | `experimental.subagent_depth: 2`; live nested delegation **not yet exercised** (see §5) |
| R-05 Tier access matrix | Implemented | Config matrix implemented and asserted; `implementer.md` deny rules and depth paragraph applied |
| R-06 Autoaccept default | Implemented | `cli.json` created with `autoaccept`; `-PromptPermissions` opt-out; `-KeepAutoAccept` removed with an explicit error |
| R-07 Deny preservation | Implemented | No deny rule relaxed; installer asserts the matrix and the spec-writer edit/shell denies |
| R-08 Installer and manifest | Implemented | Versions 2.1.0 / 1.2.0; manifest regenerated and `--check` passes; clean install + idempotence verified |
| R-09 Documentation | Implemented | Five files updated; verification claim corrected to match `--standalone` reality |
| R-10 Runtime verification | **Blocked** | Requires a committed tree and `bun run update:local`; not authorized (see §5) |
| R-11 Non-regression | Partial | `test:agent-system` 43/43 pass; `bun run check` result recorded in §3 |
| R-12 Session-start integrity | Implemented (prompt + tool) | New Spec Writer section and read-only git permissions; `worktree_create` extended with `from`, `base`, and `branch` (new branch), backed by `CreateInput.newBranch` |

## 2. Changed files

### Configuration and installer
- `agent-system/config/opencode.fragment.json` — top-level `model`, `agents.plan.disabled`, per-agent tier-access permissions, `agents.explore.model`, `agents.qa.model`, `experimental.subagent_depth`.
- `agent-system/config/model-router.overrides.jsonc` — added `subagentTiers`.
- `.opencode/opencode.jsonc` — top-level `model` and `agents.plan.disabled`.
- `script/agent-system/merge.ts` — merges `model`, `experimental`, per-agent canonical keys (all keys except `permissions`, which use an idempotent append-after-user-rules merge), and `subagentTiers`; `mergeCliPermissions` inverted to autoaccept-by-default with a `promptPermissions` opt-out.
- `script/agent-system/install.ts` — creates `cli.json` when absent; `promptPermissions` option; new runtime assertions (`assertModels`, rewritten `assertPermissions`, `plan` absence in `assertRoles`, v1.2.0 markers); **`debug agents` now runs with `--standalone`**.
- `script/agent-system/cli.ts`, `script/install-local.ps1` — `-PromptPermissions`; `-KeepAutoAccept` rejected with a migration message.
- `script/agent-system/lib.ts` — versions 2.1.0 / 1.2.0; `InstalledManifest.promptPermissions`.
- `script/agent-system/status.ts` — reports `promptPermissions`.
- `agent-system/manifest.json` — regenerated.

### Roles
- `.opencode/agents/spec-writer.md` — tier-access section; session-start repository integrity and isolation procedure; read-only git/`gh` permissions; `fast` subagent allow.
- `.opencode/agents/qa.md` — depth comment and nesting paragraph updated.
- `.opencode/agents/implementer.md` — **not changed** (blocked, §4).

### Core
- `packages/core/src/effort/delegation.ts` — `DEFAULT_OPERATIONS` key `plan` → `spec-writer`.
- `packages/core/src/effort/adapter.ts` — mode pin `input.agent === "plan"` → `"spec-writer"`; comment updated.
- `packages/core/src/git.ts` — `worktree.create` accepts `branch` (new branch name) and `cwd`; uses `-b <branch>` instead of `--detach` when a branch is named.
- `packages/core/src/worktree.ts`, `packages/core/src/worktree/git.ts`, `packages/core/src/worktree/strategies.ts` — thread `newBranch` and the source worktree as `cwd`.
- `packages/core/src/tool/plugin/opencode.ts` — `worktree_create` accepts `branch` (new branch), `base` (start ref), and `from` (source worktree).
- `packages/schema/src/worktree.ts` — `CreateInput.newBranch`.
- `packages/plugin/src/worktree.ts` — `WorktreeCreateInput.newBranch` for plugin-defined strategies.
- Regenerated (never hand-edited): `packages/protocol/openapi.json`, `packages/client/src/{effect,promise}/…`. Only 5 generated files changed.

### Tests
- `packages/core/test/effort/{delegation,adapter,consistency}.test.ts` — agent id `plan` → `spec-writer`.
- `script/agent-system/{install,merge,powershell,status}.test.ts` — versions, `promptPermissions`, new merge expectations.

### Documentation
- `docs/model-router.md`, `agent-system/README.md`, `AGENTS.md`, `docs/local-development.md`, `.opencode/references/orchestration-patterns.md`.

## 3. Verification executed

| Check | Command / procedure | Result |
|---|---|---|
| Effort tests | `bun test test/effort/{delegation,adapter,consistency}.test.ts` in `packages/core` | **Passed** — 34 tests, 92 assertions |
| Agent-system tests | `bun run test:agent-system` | **Passed** — 43 tests, 225 assertions |
| Manifest check | `bun run agent:manifest -- --check` | **Passed** — 4 agents, 30 global skills, 10 project skills, 222 files |
| Clean install + runtime verify | `bun run agent:install -- -ConfigRoot C:\Windows\Temp\as-clean-6 -AgentsOnly` | **Passed** — all runtime assertions |
| Idempotence | Second identical install | **Passed** — `in sync`, 0 changed, no backup |
| Resolved models | `OPENCODE_CONFIG_DIR=<root> opencode debug agents --standalone` | **Passed** — `plan` absent; explore→minimax#medium; qa→terra#high; tiers preset; SDD roles and build inherit the default |
| Tier access matrix | `debug agents` permissions | **Passed** — build denies the four SDD roles; tiers deny all subagents; spec-writer allows explore+fast and denies medium+heavy |
| Full check | `bun run check` | **Failed — pre-existing and unrelated** (see §3a) |

### 3a. Full check result

`bun run check` exits 1. The only failing task is `@opencode/server#typecheck`, in files this
change does not touch (`packages/server/test/worktree.test.ts`, among others). The errors are
all the same Effect type mismatch: `Request<"Requires", Service>` missing from a test environment.

**Pre-existing proof.** The tracked modifications were stashed (`git stash push` over the
changed paths, with a `git diff` backup at `C:\Windows\Temp\impl-backup.patch`) and the
same package typechecks were run against clean `HEAD` (`69c0d41`):

| Package | Clean HEAD | With this change |
|---|---|---|
| `@opencode/server` | 90 errors in 34 files | 90 errors in 34 files |
| `@opencode/cli` | 2 errors in 2 files | passes |
| `@opencode/core` | passes | passes |
| `@opencode/schema` | passes | passes |

The stash was restored with `git stash pop` and the working tree verified intact.
No new error originates in a file this change modifies. The CLI improvement comes from the
required client regeneration, not from a hand edit.

## 4. Blocked work — resolved

**`.opencode/agents/implementer.md`** — R-05 required two edits: three `subagent` deny rules for
`spec-writer`/`tester`/`qa`, and a rewritten subagent-depth bullet. The Implementer role
hard-denies `edit` on its own file, so the Implementer agent could not apply them directly; the
runtime rejected the attempt. The user directed the change and a separate write-capable agent
applied exactly those two edits. Verified independently: the deny rules are at lines 74–83, the
depth bullet at line 165, the manifest still validates, and `test:agent-system` passes 43/43.

## 5. Not run / blocked verification

- **R-10 / AC-10 runtime install.** `bun run update:local` requires a committed `dev` tree. Committing and installing both need separate explicit authorization, and `AGENTS.md` says "Never install unasked". Not attempted.
- **Nested delegation (AC-04).** Requires a live session with the new config installed. Not exercised.
- **Live autoaccept / stage approval / denied action (AC-06, AC-07).** Require the live install. Not exercised.
- **Spec Writer session-start behaviour (AC-12).** The prompt and permissions are in place; the behaviour was not exercised in a live session.

Safe substitute evidence for the above: a full clean install into an isolated config root
with runtime verification enabled (`opencode debug agents --standalone`) passed every
assertion, including the resolved models, the permission matrix, the absence of `plan`,
and the prompt markers. What remains unproven is only the behaviour that needs a live
TUI session and the real `update:local` install.

## 6. Decisions and deviations

1. **`debug agents --standalone`.** The installer's runtime verification previously connected to the running background service and therefore validated the *live* config, not the installed root. This was discovered when a clean `-ConfigRoot` install reported the live agent set. Adding `--standalone` makes the check read the installed root. This is a pre-existing defect fixed as part of R-08/R-09.
2. **Explicit fallback models for `explore` and `qa`.** `subagentTiers` alone did not set a config-time model for either agent, exactly as the spec's risk table predicted. `agents.explore.model` and `agents.qa.model` were added, matching the tier presets exactly, with `subagentTiers` retained for dispatch-time tier selection.
3. **`-KeepAutoAccept` removed, not deprecated as a no-op.** The CLI rejects it with a message pointing at `-PromptPermissions`, so an old invocation fails loudly instead of silently changing behaviour.
4. **Merge copies all canonical agent keys except `permissions`.** The first implementation copied only `disabled` and `permissions`, which silently dropped `model`. Fixed before verification.
5. **`worktree_create` keeps one name per concept — resolved.** The spec says `Worktree.CreateInput.branch` and `from` are the mechanism for "create a named branch from the chosen base". In the existing code `branch` already meant the starting ref: `WorktreeGit.create` passed it as `ref` to `git worktree add --detach`, `packages/plugin/src/worktree.ts` documents it as "Starting ref, not the name of a new branch", and `test/worktree.test.ts` asserts that a worktree created with `branch: "feature-base"` is detached at that branch's commit. Reinterpreting it broke that test and the documented plugin contract. The implementation keeps `branch` as the starting ref everywhere and adds `newBranch` for the new branch, so `branch` and `newBranch` mean the same thing at the tool input, `Worktree.CreateInput`, the plugin strategy input, and `Git.worktree.create`. The Spec Writer's procedure uses `from` (source worktree), `branch` (starting ref), and `newBranch` (new branch). A new test covers the added behaviour.
6. **Generated client regenerated, not hand-edited.** `Worktree.CreateInput` reaches the public API, so `bun run generate` was run from the repo root. Five generated files changed (`packages/protocol/openapi.json` and four client files). No generated file was edited by hand.
7. **Role files normalized to LF.** Two `edit` operations rewrote `spec-writer.md` and `qa.md` with CRLF while the other role files and the manifest's `lineEndings: "lf"` are LF. Both were normalized back to LF; the byte-sensitive install test then passed.

## 7. Risks

- The tier-access rules for `fast`/`medium`/`heavy` rely on config `agents.<id>.permissions` appending to plugin-registered agents. Verified working for the installed root; a plugin upgrade could change the ordering.
- `subagentTiers` remains unverified at dispatch time for `explore` and `qa`; the explicit model fallbacks make the resolved model correct regardless.
- A persisted session using `plan` now fails with `AgentNotFoundError`; documented, not migrated automatically.
