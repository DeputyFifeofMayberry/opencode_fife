# Implementation Report — Agent Model Hierarchy, Planning Consolidation, and Session Isolation

**Spec:** `.opencode/specs/2026-11-05-agent-model-hierarchy.md` (Revision 2, Approved 2026-11-05)
**Stage:** Initial implementation (authorized by user 2026-11-05)
**Status:** Implemented — ready for independent testing; live TUI checks in §3c passed
**Branch:** `dev` — feature commit `1fe5f42`, installed and verified live
**Next owner:** Spec Writer for Tester dispatch

## 1. Requirement status

| Req | Status | Evidence |
|---|---|---|
| R-01 Planning consolidation | Implemented (code complete) | `agents.plan.disabled` in fragment + project config; `plan` absent from `debug agents`; effort mapping moved to `spec-writer` |
| R-02 Default model | Implemented | `model: mistral/deepseek-v4-1-flash-1017#max` in fragment + project config; `debug agents` shows no explicit model on spec-writer/implementer/tester/build/general |
| R-03 Tier mapping | Implemented | `subagentTiers {explore:fast, qa:heavy}` plus explicit fallback models; verified resolved models |
| R-04 Delegation depth | Implemented | `experimental.subagent_depth: 2`; live implementer → explore verified (§3c) |
| R-05 Tier access matrix | Implemented | Config matrix implemented and asserted; `implementer.md` deny rules and depth paragraph applied |
| R-06 Autoaccept default | Implemented | `cli.json` created with `autoaccept`; `-PromptPermissions` opt-out; `-KeepAutoAccept` removed with an explicit error |
| R-07 Deny preservation | Implemented | No deny rule relaxed; installer asserts the matrix and the spec-writer edit/shell denies |
| R-08 Installer and manifest | Implemented | Versions 2.1.0 / 1.2.0; manifest regenerated and `--check` passes; clean install + idempotence verified |
| R-09 Documentation | Implemented | Five files updated; verification claim corrected to match `--standalone` reality |
| R-10 Runtime verification | Implemented and verified live | `bun run update:local` installed CLI `0.0.0-dev-20261105.164027` and agent system 2.1.0; live TUI checks in §3c |
| R-11 Non-regression | Partial | `test:agent-system` 43/43 pass; `bun run check` result recorded in §3 |
| R-12 Session-start integrity | Implemented and live-verified (clean path, §3c) | New Spec Writer section and read-only git permissions; `worktree_create` extended with `from`, `base`, and `branch` (new branch), backed by `CreateInput.newBranch` |

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

### 3b. Live install and runtime verification

`bun run update:local` on committed `dev` installed CLI `0.0.0-dev-20261105.164027` and agent
system 2.1.0 / role content 1.2.0, permission mode `autoaccept`. The installer's own runtime
assertions passed. Independent checks against the live config root:

| Check | Result |
|---|---|
| `opencode debug agents --standalone` from outside the repo | 14 agents, **no `plan`** |
| Role modes | `spec-writer` primary, `implementer` all, `tester` subagent, `qa` subagent |
| Resolved models | `explore`→`vercel/minimax/minimax-m3.1-flash#medium`; `qa`→`vercel/openai/gpt-6.1-terra#high`; `fast`/`medium`/`heavy` at preset; `spec-writer`/`implementer`/`tester`/`build`/`general` inherit the default |
| Tier access matrix | `spec-writer`: `*` deny, explore+fast allow, implementer/tester/qa ask. `implementer`: `*` ask, explore allow, spec-writer/tester/qa deny. `tester`: `*` deny. `qa`: explore ask only. `build`: denies the four SDD roles. `fast`/`medium`/`heavy`: `*` deny |
| Live `opencode.json` | `model=mistral/deepseek-v4-1-flash-1017#max`, `agents.plan.disabled=true`, `experimental.subagent_depth=2`, plugin pinned `2.9.1` |
| Live `cli.json` | `session.permissions=autoaccept`, all unrelated keys preserved |
| Live router overrides | `activePreset=fife`, `activeMode=normal`, `subagentTiers={"explore":"fast","qa":"heavy"}`, preset `fife` intact |
| Installed manifest | `agentSystemVersion=2.1.0`, `roleContentVersion=1.2.0`, `permissionMode=autoaccept`, `promptPermissions=false` |
| `bun run local:status` | 54/54 managed files in sync; config in sync; installed build matches `dev` HEAD |

### 3c. Live TUI verification of the remaining gaps

`termctrl` is not installed on this Windows machine. The checks ran through a disposable Bun PTY driver
(`C:\Windows\Temp\opencode\tui-drive\drive.ts`, outside the repository). The driver starts the installed
`opencode --standalone` (0.0.0-dev-20261105.164229) in a real ConPTY, renders the output with
`@xterm/headless`, and asserts on the visible screen. The installed build was updated from the
`0.0.0-dev-20261105.164027` recorded in §3b to `.164229` before these checks. The standalone server used a disposable database
(`OPENCODE_DB=C:\Windows\Temp\opencode\tui-drive\verify.db`) and a disposable git project
(`C:\Windows\Temp\opencode\verify-project`, branch `dev`, clean, tracking a local bare remote). No live
session, worktree, or database was touched. The driver set `SHELL=cmd.exe` because this machine's default
shell resolution picks the WindowsApps `pwsh.exe` execution alias, which fails with EACCES; that is a
pre-existing environment issue, not part of this change.

| Check | Procedure | Result |
|---|---|---|
| AC-06 autoaccept suppression | Implementer session asked to read `C:\Windows\Temp\opencode\outside.txt`, an `external_directory` `ask`. | **Passed**. The read returned `EXTERNAL_TOKEN_8842`; the screen never showed `Permission required`. Evidence: `C:\Windows\Temp\opencode\tui-drive\evidence\autoaccept-after.txt`. |
| AC-07 denied action | Spec Writer session asked to edit `README.md`, which its `edit "*"` rule denies. | **Passed**. The edit tool returned `permission.rejected: Permission denied: edit`; README stayed unchanged; no prompt appeared. Evidence: `...\evidence\deny-after.txt`. |
| AC-04 nested delegation | Implementer session asked to use the `explore` subagent to find a token. | **Passed**. Child session `ses_e518d1fd5fferUUOv8fN9JNGk4` has `parent_id=ses_e518d74faffeP34PJ5lwaJj84a` and `agent=explore`; the parent reported `secret.txt`. Evidence: `...\evidence\delegate-after.txt` and the disposable database query. |
| AC-12 start check, clean path | Spec Writer session asked to start a task and run the integrity procedure. | **Passed**. It recorded the root, branch `dev`, HEAD, remote, clean status, single worktree, base in sync, and the isolation decision "Clean and unclaimed → used directly". Evidence: `...\evidence\spec-start-check.txt`. |
| AC-10 spec approval | Spec Writer presented the spec and asked for approval. | **Passed**. The final run asked in plain text; an earlier run used a `question` form ("Approve specification" / "Request revisions"), observed in the session transcript. Autoaccept did not suppress either. Evidence: `...\evidence\spec-approval.txt` (plain-text ask). |
| AC-10 implementation stage approval | After the spec was approved, the Spec Writer was asked to request implementation authorization. | **Passed**. It recorded the spec as `Approved`, stated that no implementation had begun, and asked for separate authorization before delegating to the Implementer. Evidence: `...\evidence\spec-stage-approval.txt`. |

The live runs exposed three environment limits that do not affect the permission results:

- The TUI sessions resolved to `mimo-v2.6-flash-free` (opencode provider), not the configured default
  `mistral/deepseek-v4-1-flash-1017#max`. The model-router plugin's auto mode selected the free model.
  The permission checks are independent of the model.
- The `explore` agent's configured model `vercel/minimax/minimax-m3.1-flash` was unavailable at runtime.
  The Implementer overrode it with `deepseek-v4.1-flash-free`; the nested delegation still succeeded.
- The Spec Writer's `gh auth status` check did not run because its shell attempt was denied (the model
  used a command outside the narrow allowlist). It completed the rest of the check with the read-only
  git tools and direct `.git` reads. The prompt makes the `gh` check optional.

## 4. Blocked work — resolved

**`.opencode/agents/implementer.md`** — R-05 required two edits: three `subagent` deny rules for
`spec-writer`/`tester`/`qa`, and a rewritten subagent-depth bullet. The Implementer role
hard-denies `edit` on its own file, so the Implementer agent could not apply them directly; the
runtime rejected the attempt. The user directed the change and a separate write-capable agent
applied exactly those two edits. Verified independently: the deny rules are at lines 74–83, the
depth bullet at line 165, the manifest still validates, and `test:agent-system` passes 43/43.

## 5. Remaining verification gaps

The four gaps from the previous revision are closed for the user's pending list. AC-04
(implementer → explore), AC-06, AC-07, AC-12 (clean path), and the stage-approval question all
have live TUI evidence in §3c.

Still unexercised:

- **AC-12 dirty or claimed worktree.** The clean-path session chose the current worktree. A dirty
  tree or a worktree claimed by another session was not run, so the `worktree_create` +
  `session_move` branch has no live evidence.
- **AC-12 missing `dev` or unreachable remote.** Not run.
- **AC-04 QA → explore.** Only implementer → explore was exercised.
- **Configured models at runtime.** The live sessions used `mimo-v2.6-flash-free`, and the explore
  override used `deepseek-v4.1-flash-free`, because the configured provider models were unavailable.
  The config-level model resolution remains as recorded in §3b.

The running background server was not restarted by the installer. It still runs the previous
build until the next service restart; the `--standalone` checks used the new binary and the live
config.

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
