# Agent System Consolidation and Managed Install

**Status:** Approved
**Approval:** Revision 4 approved by user on 2026-11-05
**Revision:** 4. Corrects R-09 and AC-09 to match the v1.1.1 permission model.

> **Provenance.** Revision 1 was produced by the build agent, not the Spec Writer. The Spec Writer reviewed that draft against its role contract, checked the material claims against the repository and runtime evidence, and revised the requirements, acceptance criteria, decisions, and failure handling below. Revision 2 was approved on 2026-11-05. Revision 3 corrected three findings from the implementation handoff and was approved on 2026-11-05. Revision 4 corrects the permission-model description after the Tester found a conflict between R-02 and R-09 and was approved on 2026-11-05.

## 1. Objective

Consolidate the four SDD role contracts, their supporting documents, the managed skill library, and the `fife` tier routing into `Y:\CodingProjects\opencode_fife`, so that a single `bun run update:local` installs both the CLI and the agent system.

Packaging is only part of the problem. Three copies of the roles currently exist, and the newest content is installed nowhere:

| Copy | Location | Version |
|---|---|---|
| Standalone source | `Y:\CodingProjects\my-custom-stuff\agents` | v1.1.1 (newest) |
| Repo project agents | `Y:\CodingProjects\opencode_fife\.opencode\agents` | pre-v1.1.0 |
| Global runtime | `C:\Users\barne\.config\opencode\agents` | pre-v1.1.0 |

The repo copies and the global copies are byte-identical to each other and both predate v1.1.0. The runtime therefore loads roles that lack the untrusted-material rule, the `Skipped`/`Blocked` statuses, the two-attempt retry ceiling, and the handoff `check revision` anchor.

When this work is complete:

- After migration, the repo is the only authoritative source for the roles, managed skills, and tier configuration.
- `~/.config/opencode` is a generated install target, never edited as source.
- `bun run update:local` installs the CLI and the agent system, reports drift, and can roll both back.
- `opencode debug agents` shows the v1.1.1 roles with their intended permissions, alongside the unchanged `fast`/`medium`/`heavy` tiers.
- A clean install can be proven in an isolated config root without touching the user's live configuration.

## 2. Existing behavior

### 2.1 Runtime and loader

Verified on this machine:

- `opencode --version` returns `0.0.0-dev-20261105.064456`.
- `C:\Users\barne\.local\bin\opencode-build.json` records repository `Y:\CodingProjects\opencode_fife`, commit `d44c064e223ef1b9fa0730c6f9bc9ba74380397b`, channel `dev`, installed `2026-11-05T14:46:19Z`.
- `opencode debug agents` lists 15 agents: `build`, `compaction`, `explore`, `fast`, `general`, `heavy`, `implementer`, `medium`, `model-router-grader`, `plan`, `qa`, `spec-writer`, `summary`, `tester`, `title`.
- In a directory without a project `.opencode`, the four SDD roles load from the global config dir. The effective `spec-writer` permissions include `edit * deny`, `edit .opencode/specs/** allow`, `shell * deny` with narrow git allows, `subagent * deny`, `subagent explore allow`, and `subagent implementer|tester|qa ask`. The `permissions:` block is therefore enforced, not documentation.

Loader evidence from the fork:

- `packages/core/src/config/plugin/agent.ts:21-33` scans `{agent,agents}/**/*.md` and `{mode,modes}/*.md`; both singular and plural directory names work.
- `packages/schema/src/config/agent.ts:12-29` accepts `permissions` (plural) and rejects `permission` (singular). The accepted YAML keys are `model`, `variant`, `request`, `system`, `description`, `mode`, `hidden`, `color`, `steps`, `disabled`, `permissions`.
- `packages/core/src/config/discovery.ts:68-82` treats `~/.config/opencode` as a first-class config root; `packages/core/src/config.ts:340` loads it below project directories, so project agents override global agents of the same id.
- `packages/core/src/config/plugin/agent.ts:60-80` watches agent sources and reloads after a ~100 ms debounce. A restart is not required.
- `packages/core/src/config/plugin/skill.ts:89-90` accepts both `skill/` and `skills/`; project skills take precedence over global skills.

### 2.2 Current `update:local`

`package.json:34-35` maps both `install:local` and `update:local` to `powershell.exe -NoProfile -ExecutionPolicy Bypass -File script/install-local.ps1`.

The script:

1. Refuses a dirty source tree (`install-local.ps1:16-34`).
2. Rejects unresolved tracked symlinks (`:36-49`).
3. Stamps a dev version and channel (`:50-51`).
4. Builds `packages/cli` with `--single --skip-install` (`:53`).
5. Runs `packages/cli/script/service-smoke.ts` (`:56-57`).
6. Rechecks the source fingerprint (`:58-60`).
7. Archives the previous binary and DLLs under `%USERPROFILE%\.local\share\opencode-fife-builds\<timestamp>` (`:70-77`).
8. Swaps `opencode.exe` with a `.new`/`.old` sequence and restores on failure (`:90-104`).
9. Writes `%USERPROFILE%\.local\bin\opencode-build.json` with version, channel, commit, fingerprint, and SHA-256 (`:106-114`).
10. Prunes old builds, keeping five (`script/local-builds.ps1:5,23-32`), removes stale `.old-*` files (`:34-41`), and runs `opencode --version` (`:119-120`).

It writes only under `%USERPROFILE%\.local`. No step copies agents, skills, or configuration into `%USERPROFILE%\.config\opencode`. The documented intent is binary-only: `AGENTS.md:43` defines `update:local` as the one update procedure, and `docs/local-development.md:5` describes only the CLI install.

### 2.3 Role drift

The standalone set is v1.1.1. `CHANGELOG.MD` records:

- v1.1.0: untrusted-material handling, `Skipped`/`Blocked` statuses, the two-attempt retry ceiling, handoff version anchors, per-stage cost tracking, and the `M-` typo fix.
- v1.1.1: numbered `tester.md` sections.

The repo and global copies lack all of those changes. `tester.md` is 169 lines instead of 171; `implementer.md` is 198 instead of 200; `spec-writer.md` is 983 instead of 989; `qa.md` is 230 lines in both but has two substituted lines. Frontmatter is identical across all three copies. The divergence is entirely in body text.

### 2.4 Skills

- Repo `.opencode/skills`: 15 skills.
- Global `~/.config/opencode/skills`: 30 skills.
- Intersection: 5 (`construction-humanizer`, `craft-prompting`, `eli5-skill`, `find-skills`, `walk-me-through`).
- Repo-only: 10 (`app-e2e-tests`, `component-tests`, `effect`, `humanizer_fife`, `opencode-dev`, `plan-hardening`, `rtl-aware-development`, `sample-skill`, `tui-tests`, `unit-tests`).
- Global-only: 25.
- Total canonical: 40 (30 global, 10 project).

`craft-prompting` diverges materially: the repo copy is the older CRAFT-only wording; the global copy is the newer adaptive-prompting revision. No `SKILL.md` carries a `version:` field.

### 2.5 Tier routing

- The plugin is `opencode-model-router@2.9.1`, GPL-3.0-only, installed externally and never vendored (`docs/model-router.md:7`).
- The plugin registers the `fast`, `medium`, and `heavy` subagents through its host `config` hook (`docs/model-router.md:11`).
- The `fife` preset lives in `~/.config/opencode/opencode-model-router.overrides.jsonc:2-22`: `fast` → `vercel/minimax/minimax-m3.1-flash` / `medium` / cost ratio 1; `medium` → `mistral/deepseek-v4-1-flash-1017` / `max` / 3; `heavy` → `vercel/openai/gpt-6.1-terra` / `high` / 8.
- `~/.config/opencode/opencode.json:8-12` maps `fast` → `explore`, `medium` → `implement`, `heavy` → `review`; `:14-16` pins the plugin as a string.
- `~/.config/opencode/cli.json:20` sets `session.permissions: "autoaccept"`. The TUI suppresses `ask` prompts in that mode (`packages/tui/src/routes/session/index.tsx:214,271,2797`). Core still evaluates `ask` (`packages/core/src/permission.ts:86-94,161-181`), but the user is not shown the prompt. This weakens the SDD `ask` gates.

### 2.6 Repository and testability

- The working tree is on `dev` (verified with `git branch --show-current`). `origin` is `https://github.com/DeputyFifeofMayberry/opencode_fife.git`; `upstream` is `https://github.com/anomalyco/opencode.git`.
- `.opencode/specs` exists, contains this specification, and is not ignored. The directory is currently untracked, so the working tree is dirty until the spec is committed.
- `OPENCODE_CONFIG_DIR` overrides the config root (`packages/util/src/global.ts:79`), which makes an isolated clean-install test possible.
- `opencode debug agents` prints JSON, including each agent's `system`, `mode`, and `permissions`.

## 3. Scope

### In scope

1. Migrate the v1.1.1 role contracts into the repo's canonical `.opencode/agents/` directory.
2. Consolidate all 30 global skills into the repo's canonical `.opencode/skills/` directory, deduplicate the five shared skills, and mark each skill as `global` or `project` in a manifest.
3. Add an `agent-system/` packaging layer: manifest, schema, config fragments, changelog, documentation, install/status/rollback scripts, and tests.
4. Extend `bun run update:local` to install the agent system alongside the CLI, with `-AgentsOnly`, `-SkipAgents`, `-ConfigRoot`, `-Force`, and `-KeepAutoAccept` options.
5. Merge the canonical tier configuration into `opencode.json` and `opencode-model-router.overrides.jsonc` without destroying unrelated user configuration.
6. Default `session.permissions` to `prompt` when it is `autoaccept`, so the SDD `ask` gates are presented, with an explicit `-KeepAutoAccept` opt-out that records the risk.
7. Extend `local:status` and `local:rollback` to cover agent-system files, configuration, and version metadata.
8. Update `AGENTS.md`, `docs/local-development.md`, and add `agent-system/README.md` and `agent-system/CHANGELOG.MD`.
9. Verify a clean install in an isolated config root and verify the live runtime loads the updated roles.

### Out of scope

1. Changing the content or semantics of the four roles beyond migrating v1.1.1.
2. Changing model IDs, providers, tier heuristics, or the `fife` preset's model choices.
3. Modifying, vendoring, or republishing the GPL-3.0 model-router plugin.
4. Rotating or managing secrets, API keys, or the `service*.json` credentials.
5. CI/release pipeline changes, npm publishing, or non-Windows installers.
6. Migrating themes, keybinds, MCP servers, commands, or CLI preferences other than the `session.permissions` gate-safety change in R-10.
7. Deleting or rewriting the standalone `Y:\CodingProjects\my-custom-stuff\agents` directory. It remains a read-only migration archive.
8. Changing the SDD workflow's approval semantics, correction-cycle limits, or stage ownership.

## 4. Requirements

**R-01. Single source of truth.** The repo's `.opencode/agents/` and `.opencode/skills/` are the only authoritative sources for the managed roles and skills. The global `~/.config/opencode` tree is an install target and must never be treated as a source. The standalone `my-custom-stuff/agents` tree is a migration input only.

**R-02. Role content parity.** After migration, the four repo role files must be content-identical to the v1.1.1 standalone files, including frontmatter and `permissions`. Line endings may be normalized to the repo's convention; the normalization must be recorded and applied consistently. No role text may be reworded, reordered, or "cleaned up" in this change.

**R-03. Skill consolidation.** All 30 global skills must be present in the repo's canonical skills tree. The five shared skills must be deduplicated, with the newer global copy winning where the bodies differ. The ten repo-only skills, including `opencode-dev`, must remain available to the repo but must not be installed globally. Every managed skill must carry a `global` or `project` scope in the manifest, and all license/provenance files must be preserved.

**R-04. Manifest and versioning.** `agent-system/manifest.json` must declare the agent-system version (`2.0.0`), the role-content version (`1.1.1`), the exact plugin pin (`opencode-model-router@2.9.1`), every managed file with its SHA-256 and scope, and the canonical config fragments. The manifest must validate against a checked-in schema.

**R-05. Managed install.** `bun run update:local` must install the CLI and the agent system. It must copy the managed agents and global-scope skills to `<config-root>/agents/` and `<config-root>/skills/`, merge the canonical configuration into `<config-root>/opencode.json` and `<config-root>/opencode-model-router.overrides.jsonc`, and write `<config-root>/agent-system.installed.json` with the agent-system version, role-content version, source commit, CLI version, per-file hashes, and backup path.

**R-06. Idempotence.** Re-running the install with unchanged sources must make no content changes, create no unnecessary backup, and report the installation as in sync.

**R-07. Backup and local-modification safety.** Before replacing any managed file or configuration file, the installer must copy the previous version into a timestamped backup directory with a backup manifest. If a previous installed manifest exists and a managed file differs from its recorded hash, the installer must refuse by default and identify the file. If no previous installed manifest exists, an existing file at a managed path is treated as pre-existing and backed up before replacement. An unmanaged file whose name collides with a managed file is treated the same way as a local modification. `-Force` may replace a conflicting file only after backing it up. Unmanaged files in the agents and skills directories must never be deleted; they must be reported.

**R-08. Configuration merge.** The installer must preserve unrelated keys in `opencode.json` (including `update`, provider/auth settings, and other plugins), other presets and the active preset/mode in the router overrides, and all `service*.json` files. It must add or update only the canonical keys: `effort_policy.agent_operations`, the exact plugin pin, and `presets.fife`. If either configuration file is absent, the installer must create it with only the canonical keys. If `cli.json` is absent, the installer must not create it; it must verify the runtime's default permission mode instead. Writes must be atomic and validated after writing. If a file cannot be parsed, the installer must refuse, back it up, and report the parse error.

**R-09. Tier and SDD coexistence.** `fast`, `medium`, and `heavy` remain plugin-registered subagents and the sole owners of model selection. No SDD role may have an `allow` rule for `subagent` resources `fast`, `medium`, or `heavy`. The v1.1.1 permission model is: the Spec Writer may invoke `explore` (allow) and `implementer`/`tester`/`qa` (ask); the Implementer may invoke `explore` (allow) and any other subagent only with `ask`; the Tester must deny all subagents; the QA must deny all subagents by default and may invoke `explore` only with `ask`. Tier selection must not alter stage authorization, approval gates, or correction limits.

**R-10. Permission gate integrity.** The default install must ensure that `ask` rules are presented. If `session.permissions` is `"autoaccept"` in `cli.json`, the installer must set it to `"prompt"` with a backup and report the change, because `autoaccept` suppresses the TUI presentation of `ask` rules. A user who explicitly opts out with `-KeepAutoAccept` must receive a warning that the `ask` gates are suppressed; the opt-out must be recorded in the installed manifest. The installer must verify that an `ask` rule is presented after the default change. It must not silently weaken any role's `permissions` block.

**R-11. Status and drift.** `bun run local:status` must report the CLI version/commit, the agent-system and role-content versions, managed-file counts, drifted files, missing files, unmanaged files, and configuration drift. It must exit `0` when in sync, `1` on drift, `2` when the agent system is not installed (including a missing or unreadable installed manifest), and `3` on error. A `--json` mode must be available for tests.

**R-12. Rollback.** `bun run local:rollback` must restore the most recent agent-system backup and the previous binary, or support `-AgentsOnly` and `-BinaryOnly` to restore one layer. Restored files must match the backup hashes. Files created after the backup must be preserved and reported, not deleted. If no backup exists, it must exit `2` with a clear message.

**R-13. Clean-install testability.** The installer must support `-ConfigRoot <path>` and `-AgentsOnly` so a clean install can be exercised without touching the live configuration or rebuilding the CLI. The clean-install path must create the complete agents, skills, configuration, and installed-manifest tree under the supplied root.

**R-14. Runtime load verification.** After installation, `opencode debug agents` run from a directory outside the repo must list `spec-writer`, `implementer`, `tester`, and `qa` with modes `primary`, `all`, `subagent`, and `subagent`, and must show the expected permission rules. The loaded `spec-writer` system prompt must contain the untrusted-material rule, `Skipped`/`Blocked`, the correction-cycle limit, and the handoff `check revision`. The loaded `implementer` system prompt must contain the two-attempt retry ceiling. If the command is unavailable or fails, the installer must fail the verification and preserve the command output for diagnosis.

**R-15. Documentation.** `AGENTS.md:43`, `docs/local-development.md`, and the new `agent-system/README.md` must describe `update:local` as installing both the CLI and the agent system, define the source-of-truth and install-target boundaries, document install/status/rollback and the `-AgentsOnly`/`-ConfigRoot`/`-Force`/`-KeepAutoAccept` options, explain how to add or change a managed agent or skill, and state the tier/SDD boundary.

**R-16. No secrets or machine-specific data.** The repo must contain no API keys, service passwords, tokens, or machine-specific absolute paths in managed files. The installer must never read, copy, or modify `service*.json`. A secret scan must be part of verification.

**R-17. Compatibility and non-regression.** The model-router plugin, its version, its model IDs, and its routing behavior must not change. The installer must verify that `opencode-model-router@2.9.1` is installed and must not silently substitute another version; a missing or mismatched plugin is a reported failure, not an automatic upgrade. The existing binary build, smoke test, archive, swap, prune, and `--version` behavior must continue to work. The existing `local:status` and `local:rollback` behavior must remain available.

**R-18. Test coverage.** Manifest validation, hash generation/comparison, scope selection, JSON/JSONC merging, path mapping, backup/restore, drift detection, local-modification refusal, and clean install must have automated tests. The agent-system tests must run from their package directory (or a dedicated script that sets the correct working directory), not from the repository root. The full `bun run check` must pass, or any failure must be demonstrated to be pre-existing and unrelated to the agent-system change, with the baseline failure recorded and the agent-system package typecheck passing.

## 5. Acceptance criteria

**AC-01 (R-01, R-02).** A repository search finds exactly one canonical copy of each role file under `.opencode/agents/`. Each file's content matches the corresponding v1.1.1 standalone file after the documented line-ending normalization, and the normalized SHA-256 is recorded in the manifest. No role file exists outside `.opencode/agents/` and the standalone archive, and no role file is loaded from the standalone directory.

**AC-02 (R-03).** The manifest lists 40 skills: 30 with scope `global` and 10 with scope `project`, including `opencode-dev` as project-scoped. The five shared skills appear once. `craft-prompting` matches the newer global revision. Every skill directory with a `LICENSE`, `NOTICE`, or provenance file retains it.

**AC-03 (R-04).** `bun run agent:manifest --check` validates the manifest against the schema and every declared hash. Tampering with one managed file causes a nonzero exit and names the file.

**AC-04 (R-05, R-13).** Given an empty temporary directory, when `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly` runs, then it exits `0` and creates `<temp>/agents/{spec-writer,implementer,tester,qa}.md`, `<temp>/skills/<30 global skills>/SKILL.md`, `<temp>/opencode.json`, `<temp>/opencode-model-router.overrides.jsonc`, and `<temp>/agent-system.installed.json`. Every installed hash matches the manifest.

**AC-05 (R-14).** Given a full `bun run update:local` on a committed `dev` tree, when `opencode debug agents` runs from a directory outside the repo, then the JSON contains the four role ids with the expected modes, and the `spec-writer` permissions contain `edit * deny`, `edit .opencode/specs/** allow`, `shell * deny`, `subagent * deny`, `subagent explore allow`, and `subagent implementer|tester|qa ask`. The `spec-writer` system prompt contains the untrusted-material rule, `Skipped`/`Blocked`, the correction-cycle limit, and `check revision`. The `implementer` system prompt contains the two-attempt retry ceiling. If `opencode debug agents` is unavailable or fails, the installer exits nonzero and preserves the command output.

**AC-06 (R-06).** A second identical install exits `0`, changes no managed file hash, creates no new backup directory, and reports `in sync`.

**AC-07 (R-07).** Given a pre-existing stale global role file and no previous installed manifest, when the installer runs, then the old file is copied into the backup directory before replacement. Given a managed file that was edited after the last install, when the installer runs without `-Force`, then it exits nonzero, names the file, and leaves it unchanged. With `-Force`, it backs up and replaces the file. Given an unmanaged file whose name collides with a managed file, the installer treats it as a local modification. An unmanaged file placed in `agents/` or `skills/` survives the install and is reported.

**AC-08 (R-08).** Given an `opencode.json` containing `update: "disable"`, a provider block, and an unrelated plugin, when the installer merges, then those keys survive, `effort_policy.agent_operations` equals the canonical mapping, and the plugin pin is exactly `opencode-model-router@2.9.1`. Given a router overrides file with a different `activePreset`, other presets, and comments, when the installer merges, then the active preset, other presets, and unrelated keys survive, and `presets.fife` matches the canonical definition. When either configuration file is absent, the installer creates it with only the canonical keys. A malformed JSON/JSONC file causes a refusal, a backup, and a parse-error report.

**AC-09 (R-09, R-10).** `opencode debug agents` still lists `fast`, `medium`, and `heavy`. No SDD role's permission set contains an `allow` rule for `subagent` resources `fast`, `medium`, or `heavy`. The loaded permissions match the v1.1.1 model: the Implementer has `subagent * ask` and `subagent explore allow`; the Tester has `subagent * deny`; the QA has a default deny and `subagent explore ask`; the Spec Writer has the expected `explore`/`implementer`/`tester`/`qa` rules. `cli.json` has `session.permissions: "prompt"`, and an `ask` rule is presented in the TUI (verified manually or with the runtime's permission test harness). The installer reports the `autoaccept` change and its backup path. If `-KeepAutoAccept` was used, the installed manifest records the opt-out and the installer prints a warning that `ask` gates are suppressed.

**AC-10 (R-11).** `bun run local:status` exits `0` after a clean install, exits `1` after a managed file is edited, exits `2` when the installed manifest is removed, and reports the CLI version, source commit, agent-system version, role-content version, drifted files, missing files, unmanaged files, and configuration drift. `--json` returns the same data in machine-readable form.

**AC-11 (R-12).** After a clean install, `bun run local:rollback -AgentsOnly` restores the previous agents, skills, and configuration byte-for-byte, and `local:status` reports the restored version. `bun run local:rollback` also restores the previous binary. A file created after the backup survives the rollback and is reported. With no backup, it exits `2`.

**AC-12 (R-15).** `AGENTS.md`, `docs/local-development.md`, `agent-system/README.md`, and `agent-system/CHANGELOG.MD` describe the new install behavior, source-of-truth rules, options, and tier/SDD boundary. The changelog records `2.0.0` and the role-content `1.1.1` migration.

**AC-13 (R-16).** A secret scan of the changed tree finds no API keys, passwords, tokens, or `service*.json` contents. No managed file contains a user-specific absolute path.

**AC-14 (R-17).** `git diff` shows no change to the model-router plugin, model IDs, provider configuration, or role semantics. The installer verifies the exact `opencode-model-router@2.9.1` pin and reports a mismatch instead of substituting another version. The full binary install path still builds, smoke-tests, archives, swaps, prunes, and runs `--version`.

**AC-15 (R-18).** `bun run test:agent-system` passes from the repository root and delegates to the package directory that owns the tests. `bun run check` passes, or the only failures are demonstrated pre-existing baseline failures unrelated to the change; the agent-system package typecheck passes. The installer tests cover the asset step, `-AgentsOnly`, `-SkipAgents`, `-ConfigRoot`, and `-KeepAutoAccept`.

**AC-16 (R-04, R-05).** The installed manifest records agent-system `2.0.0`, role-content `1.1.1`, the CLI version, the source commit, and the backup path. `local:status` displays both versions.

## 6. Technical constraints

1. **Windows/PowerShell.** The install path is Windows-only and uses `powershell.exe` (Windows PowerShell), not `pwsh`. Scripts must remain compatible with the existing execution policy and quoting.
2. **Bun 1.4.4.** The repo pins `bun@1.4.4` (`package.json`). New TypeScript scripts must run under that version.
3. **Dirty-tree guard.** `install-local.ps1:16-34` refuses uncommitted source. The migration must be committed on `dev` before a full `update:local`. `-AgentsOnly` may bypass the build but must still report the tree state.
4. **Loader semantics.** The fork accepts `agent/` and `agents/`, and `permissions` (plural) only. Do not "correct" the role files to upstream's singular `permission`.
5. **Precedence.** Global config loads below project config. Inside `opencode_fife`, the project `.opencode/agents` copies shadow the global copies. The installer must copy the same normalized content so the two remain identical at install time, and `local:status` must detect lag.
6. **Hot reload.** Agent edits reload after ~100 ms. Tests must allow for the debounce rather than requiring a restart.
7. **Config formats.** `opencode.json` is plain JSON. The router overrides file is JSONC and may contain comments. The merge must preserve comments where the parser supports it; if a parser normalizes them away, the backup and a change record are mandatory.
8. **Secrets boundary.** `service.json`, `service-dev.json`, and `service-local.json` contain plaintext credentials. They are user configuration and must never enter the repo or the manifest.
9. **GPL boundary.** `opencode-model-router` is GPL-3.0-only and is never vendored (`docs/model-router.md:7`). The repo may pin and configure it but must not copy its source.
10. **Symlinks.** Windows symlinks/junctions require privileges and may cross drives (`Y:` → `C:`). The install mechanism is copy-based, not link-based.
11. **Backup retention.** Binary builds keep five archives (`script/local-builds.ps1:5`). Agent-system backups should use the same retention default unless the user configures otherwise.
12. **`debug agents` output size.** The command prints full system prompts. Tests must parse JSON and assert fields rather than snapshotting or printing the whole output.

## 7. Verification requirements

### 7.1 Automated checks

| Check | Requirement | Evidence |
|---|---|---|
| Manifest schema and hashes | R-04 | `bun run agent:manifest --check` exits 0; tamper test exits nonzero |
| Role parity | R-02 | Normalized SHA-256 comparison against the v1.1.1 standalone files |
| Skill inventory and scope | R-03 | Manifest count/scope assertions; license-file presence |
| Config merge | R-08 | Unit tests for JSON and JSONC merge, unknown-key preservation, malformed-input refusal |
| Clean install | R-05, R-13 | `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly`; assert tree and hashes |
| Idempotence | R-06 | Second install; assert no hash changes and no new backup |
| Drift and local modifications | R-07, R-11 | Edit a managed file; assert refusal without `-Force`, backup with `-Force`, status exit 1 |
| Unmanaged preservation | R-07 | Place an unmanaged file; assert it survives and is reported |
| Rollback | R-12 | Install, roll back, assert byte-for-byte restore and status |
| Tier boundary | R-09 | Parse `debug agents` JSON; assert no SDD allow rule for `fast`/`medium`/`heavy` |
| Permission gate | R-10 | Assert `cli.json` is `prompt`; manually confirm an `ask` rule is presented; verify the `-KeepAutoAccept` warning and manifest record |
| Secret scan | R-16 | Scan changed files for credentials; assert no `service*.json` |
| Regression | R-17 | Existing installer tests pass; `bun run check` passes or its only failures are demonstrated pre-existing baseline failures |

### 7.2 Runtime verification

1. Run `bun run update:local` from a committed `dev` tree.
2. From a directory outside the repo, run `opencode debug agents` and capture JSON.
3. Assert the four role ids, modes, and permission rules from AC-05.
4. Assert `fast`, `medium`, and `heavy` are still present.
5. Assert the `spec-writer` system prompt contains the v1.1.1 markers.
6. Edit an installed agent file in a temporary config root, wait for the debounce, and assert `opencode debug agents` reflects the change. Restore the file afterward.

### 7.3 Clean-install verification

1. Create a temporary config root and data root.
2. Run `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly`.
3. Assert the tree and hashes from AC-04.
4. Run `OPENCODE_CONFIG_DIR=<temp> XDG_DATA_HOME=<temp-data> opencode debug agents` and assert the four roles load from the temporary root.
5. Remove the temporary roots. The live configuration must be untouched.

### 7.4 Manual verification

1. Confirm the TUI presents an `ask` prompt for a Spec Writer subagent delegation under `session.permissions: "prompt"`.
2. Confirm the `fife` preset is active and the tier agents report the expected models via `/tiers` or the router status output.
3. Confirm `bun run local:status` and `bun run local:rollback` are understandable and actionable.

## 8. Migration and rollback

### 8.1 Migration steps

1. Create a branch from `dev` (for example `agent-system-consolidation`).
2. Copy the four v1.1.1 role files from `Y:\CodingProjects\my-custom-stuff\agents` into `Y:\CodingProjects\opencode_fife\.opencode\agents`, replacing the pre-v1.1.0 copies. Verify content parity after the documented line-ending normalization.
3. Copy `AGENTS.md` and `CHANGELOG.MD` into `agent-system/docs/`, and `docs/research/` into `agent-system/docs/research/`. Update internal links and note that the standalone tree is an archive.
4. Copy the 30 global skills from `C:\Users\barne\.config\opencode\skills` into `.opencode/skills`. For the five shared skills, compare bodies and keep the newer global copy; preserve any repo-specific references that would otherwise be lost. Keep the nine repo-only skills and mark them `project`.
5. Add `agent-system/manifest.json`, `agent-system/manifest.schema.json`, `agent-system/config/opencode.fragment.json`, `agent-system/config/model-router.overrides.jsonc`, `agent-system/README.md`, and `agent-system/CHANGELOG.MD`.
6. Add the install/status/rollback implementation and tests. A TypeScript core (`script/agent-system/*.ts`) invoked by the PowerShell entry points is recommended so merge and hash logic are unit-testable. Tests must run from their package directory, not the repository root.
7. Extend `script/install-local.ps1` with `-AgentsOnly`, `-SkipAgents`, `-ConfigRoot`, `-Force`, and `-KeepAutoAccept`. Extend `script/local-status.ps1` and `script/local-rollback.ps1`. Add `agent:install`, `agent:status`, `agent:rollback`, `agent:manifest`, and `test:agent-system` scripts to `package.json`.
8. Update `AGENTS.md`, `docs/local-development.md`, and the new README/changelog.
9. Generate the manifest hashes, run `bun run agent:manifest --check`, and run `bun run test:agent-system` from the repository root. The script must delegate to the package directory that owns the tests.
10. Commit the migration on the branch, including this specification, then merge it to `dev` (or commit directly on `dev` if the user prefers). The full installer will refuse a dirty tree.
11. Run `bun run update:local`.
12. Verify the acceptance criteria in Section 5; at minimum AC-04 through AC-11 and AC-16.
13. Run the rollback test from AC-11, then reinstall.
14. Record the execution results in this specification's execution record.

### 8.2 Rollback steps

**Automatic.** If the asset install fails, restore the backup created in that run and exit nonzero. The binary install retains its existing `.old` restore behavior.

**Manual, managed.** Run `bun run local:rollback -AgentsOnly` to restore agents, skills, and configuration, or `bun run local:rollback` to restore the binary as well. Confirm `local:status` reports the restored version and hashes.

**Manual, filesystem.** Copy the contents of `~/.config/opencode/backups/agent-system/<timestamp>/` back over `~/.config/opencode/`, preserving unmanaged files. Validate `opencode.json` and the router overrides before restarting.

**Git.** Revert the consolidation commit and re-run `bun run update:local` from the reverted tree. The installer will rebuild and reinstall the previous binary and assets.

**Runtime failure.** If `opencode debug agents` fails to load the roles after an install, restore the backup, restart OpenCode, and re-run `opencode debug agents` before attempting another install.

## 9. Supporting evidence and design decisions

### 9.1 Evidence trail

| Finding | Source | Status |
|---|---|---|
| Runtime loads the four roles and the three tiers | `opencode debug agents` output | Locally verified |
| `permissions` plural list is enforced | `opencode debug agents` effective rules; `packages/core/test/agent.test.ts:147,234` | Locally verified |
| Both `agent/` and `agents/` are scanned | `packages/core/src/config/plugin/agent.ts:21-33` | Locally verified |
| Global config root is scanned below project roots | `packages/core/src/config/discovery.ts:68-82`; `config.ts:340` | Locally verified |
| Agent edits hot-reload | `packages/core/src/config/plugin/agent.ts:60-80` | Locally verified |
| `update:local` is binary-only | `script/install-local.ps1`; `AGENTS.md:43`; `docs/local-development.md:5` | Locally verified |
| Installed roles are pre-v1.1.0 | Three-way diff; `CHANGELOG.MD` v1.1.0/v1.1.1 | Locally verified |
| Repo roles equal installed roles | Pairwise diff, all four files | Locally verified |
| 30 global / 14 repo / 5 shared skills | Directory inventory and frontmatter comparison | Locally verified |
| `craft-prompting` global copy is newer | Frontmatter comparison | Locally verified |
| `autoaccept` suppresses `ask` prompts | `packages/tui/src/routes/session/index.tsx:214,271,2797` | Locally verified |
| `OPENCODE_CONFIG_DIR` overrides the config root | `packages/util/src/global.ts:79`; `docs/local-development.md:55-62` | Locally verified |
| Plugin is external and GPL-3.0 | `docs/model-router.md:7` | Locally verified |
| `fife` preset and tier mappings | `opencode-model-router.overrides.jsonc:2-22` | Locally verified |

### 9.2 Recommended design

This section records the recommended approach. It is not a mandatory implementation; the requirements and acceptance criteria are the contract. The Implementer may choose a different structure that satisfies them.

**Canonical layout.** Keep the repo's existing `.opencode/` tree as the source of truth (user decision). Add a packaging layer beside it:

```
.opencode/
  agents/
    spec-writer.md
    implementer.md
    tester.md
    qa.md
  skills/
    <39 skill directories, each with SKILL.md>
agent-system/
  manifest.json
  manifest.schema.json
  CHANGELOG.MD
  README.md
  docs/
    AGENTS.md
    research/
  config/
    opencode.fragment.json
    model-router.overrides.jsonc
  scripts/
    install.ps1
    status.ps1
    rollback.ps1
    lib.ps1
script/
  agent-system/
    manifest.ts
    merge.ts
    install.ts
    status.ts
    rollback.ts
    *.test.ts
```

The `.opencode/agents` and `.opencode/skills` directories remain the files the repo itself loads. The installer copies the same bytes to the global config root. This preserves the existing dogfooding loop and avoids a second source tree.

**Manifest shape.** The manifest is the install contract, not a copy of the content. It declares the version, role-content version, plugin pin, every managed file with its SHA-256 and scope, and the canonical config keys. The installed manifest records what was actually written, so drift is a hash comparison rather than a guess.

**Copy, not link.** Windows symlinks and junctions require privileges and may cross drives. A copy plus a hash manifest is deterministic, testable, and rollback-friendly. Generation is used only for the manifest hashes and, optionally, for a dry-run plan; it is not the install mechanism.

**Config merge.** The installer treats `opencode.json` and the router overrides as user-owned documents with a small managed key set. It deep-merges only the canonical keys, preserves everything else, backs up first, writes atomically, and validates after writing. `service*.json` is never opened.

**Tier boundary.** The tiers are execution capacity, not workflow authority. The router assigns models to `fast`/`medium`/`heavy`; the SDD roles keep their own `subagent` permissions and stage gates. Because the four roles deny `subagent *` except `explore` and the three named SDD agents, they cannot call the tiers directly. This is verified from the loaded permission rules, not assumed from the role text.

**Versioning.** The proposed agent-system version is `2.0.0`, with a separate role-content version `1.1.1`. It is independent of the CLI's `0.0.0-dev-<timestamp>` version. The installed manifest records both, plus the source commit, so a support report can identify exactly what is running.

### 9.3 Alternatives considered

| Alternative | Why rejected |
|---|---|
| Symlink or junction the global agents directory to the repo | Windows privileges, cross-drive behavior, and runtime path assumptions; a broken link silently removes all agents |
| Generate the global files without a manifest | No reliable drift detection or rollback; generation alone does not prove what the runtime loaded |
| Keep the standalone repo as the source and copy from it | The user wants consolidation in `opencode_fife`; a second repo keeps the split-brain problem |
| Put the roles in `agent-system/` and remove `.opencode/agents` | Cleaner single tree, but loses the repo's existing dogfooding loop and requires an assets-only reinstall to test every edit; rejected by the user's layout decision |
| Manage only the role files and leave skills/tier config user-owned | Does not eliminate skill drift or make the tier configuration reproducible; rejected by the full-consolidation decision |

## 10. Risks and dependencies

| Risk | Why plausible | Mitigation |
|---|---|---|
| `autoaccept` suppresses the SDD `ask` prompt | `cli.json:20`; TUI suppresses prompts (`routes/session/index.tsx:214,271,2797`) | Default to `prompt`, back up, verify an `ask` rule is presented (R-10/AC-09) |
| User opts out with `-KeepAutoAccept` | The gate-safety default is bypassed by choice | Record the opt-out in the installed manifest, print a warning, and surface it in `local:status` |
| Config merge corrupts user configuration | Two formats, comments, unknown keys, active preset | Backup, atomic write, post-write validation, malformed-input refusal, dry-run mode |
| Skill licensing/provenance is lost | 30 skills copied from a user directory; some have licenses/evals | Preserve license/provenance files; record source and scope in the manifest; review before publishing |
| Repo bloat and upstream merge conflicts | 39 skills and a new packaging tree in a fork | Isolate under `.opencode/` and `agent-system/`; minimize edits to upstream files; keep the plugin external |
| Project copies shadow global copies inside the repo | Loader precedence; repo copies are project-scoped | Copy identical bytes at install time; `local:status` detects lag; document the behavior |
| Installer refuses dirty trees during development | `install-local.ps1:16-34` | Commit before a full install; use `-AgentsOnly` for asset iteration |
| Windows file locks block rollback | A running OpenCode session may hold files | Retry, report the locked path, and instruct the user to restart; keep the backup |
| Plugin version or model IDs drift | External plugin, user overrides | Exact pin in the manifest; verify `opencode plugin add`; do not modify model IDs |
| `debug agents` output changes shape | Fork-specific CLI | Parse defensively, assert required fields, and fail with the raw output path on mismatch |
| Secrets leak into the repo | User config contains `service*.json` credentials | Never read/copy those files; secret scan in verification |

**Dependencies.**

- The v1.1.1 standalone role files and `CHANGELOG.MD` must remain available until migration is verified.
- The global skills directory must be readable during migration.
- The repo must be on `dev` and committed before the full install.
- `opencode-model-router@2.9.1` must remain installable from the configured registry.
- The user must approve the proposed decisions D-03 through D-06 in Section 11.1 before implementation. The skill migration (D-01) and canonical layout (D-02) are already approved.

## 11. Open questions and approval decisions

None blocking.

### 11.1 Decisions requiring approval

| ID | Decision | Status | Rationale |
|---|---|---|---|
| D-01 | Full skill consolidation: all 30 global skills move into the repo; 5 shared deduped; 9 repo-only stay project-scoped | User-approved | Eliminates skill drift; matches the consolidation goal |
| D-02 | `.opencode/agents/` and `.opencode/skills/` remain the canonical source | User-approved | Preserves the existing loader and dogfooding loop; smallest diff |
| D-03 | Agent-system version `2.0.0`, role-content version `1.1.1` | Proposed | Packaging and install contract change; independent of the CLI dev timestamp |
| D-04 | Default `session.permissions` to `prompt` when it is `autoaccept`, with an explicit `-KeepAutoAccept` opt-out | Proposed | `autoaccept` suppresses the SDD `ask` gates; the opt-out preserves user authority |
| D-05 | Merge canonical keys into `opencode.json` and the router overrides, preserving unrelated keys and secrets | Proposed | Makes the tier configuration reproducible without taking ownership of the rest of the user config |
| D-06 | Copy-based install with a SHA-256 manifest, not symlink or generation-only | Proposed | Windows-safe, drift-detectable, rollback-friendly |

Approval of this specification approves D-03 through D-06 unless the user requests a revision. D-01 and D-02 are already settled.

Minor decisions recorded for implementation:

1. **Backup retention.** Use five agent-system backups, matching the binary build retention, unless the user prefers a different number.
2. **`sample-skill`.** Keep it `project`-scoped; it is a template, not a global capability.
3. **Shared-skill bodies.** For the four shared skills whose frontmatter matches, compare bodies during migration and keep the newer global copy unless it loses a repo-specific reference; record the choice in the migration notes.
4. **Standalone archive.** Leave `Y:\CodingProjects\my-custom-stuff\agents` untouched. Do not delete or rewrite it in this change.

## 12. Approval

**Decision:** Revision 4 approved by user on 2026-11-05.

Revision 3 was approved and tested. The Tester found a conflict between R-02 (role content parity with v1.1.1) and R-09 (an idealized permission model that the v1.1.1 files do not implement). Revision 4 corrects R-09 and AC-09 to describe the actual v1.1.1 permissions while preserving the invariant that no SDD role may `allow` the tier agents. It was approved on 2026-11-05 and authorizes correction cycle 1 for D-02 only. QA remains a separate approval.

## 13. Execution record

**Execution status:** In progress
**Current stage:** Correction cycle 1 (D-02 docs fix)
**Authorizations:** Revision 4 approved 2026-11-05; implementation authorized 2026-11-05; testing authorized 2026-11-05; correction cycle 1 authorized 2026-11-05; QA not authorized
**Correction cycles:** 1 (authorized 2026-11-05)
**Implementation handoff:** Spec revision 3 (approved 2026-11-05); tree state `dev` at commit `178d3d5`; checks `bun run test:agent-system` (40 tests passed), `bun run agent:manifest -- --check` (passed), `bun run check` (pre-existing `server` and `cli` typecheck failures); full-install runtime verification passed in testing; next owner Spec Writer.
**Testing handoff:** Spec revision 3 (approved 2026-11-05); implementation commit `178d3d5`; result Failed — D-01 spec conflict (R-02 vs R-09), D-02 docs defect (`- -` vs `-- -`); 14/16 ACs passed, AC-09 literal pass with R-09 conflict, AC-12 content pass with docs defect; report `.opencode/reports/testing/2026-11-05-agent-system-consolidation.md`; next owner Spec Writer for revision 4 and correction authorization.
**Correction handoff:** Spec revision 4 (approved 2026-11-05); implementation commit `178d3d5`; scope D-02 only (README and script-comment `- -` → `-- -`); next owner Implementer.

**Provenance:** Revision 1 was produced by the build agent. Revision 2 was the Spec Writer's re-validation and the approved baseline. Revision 3 corrected three findings from the implementation handoff and was approved on 2026-11-05. Revision 4 corrects the permission-model description and is pending approval.

| Stage | Owner | Authorization | Result | Evidence |
|---|---|---|---|---|
| Specification (revision 1) | Build agent | Requested by user | Superseded by revision 2 | Draft history |
| Specification (revision 2) | Spec Writer | Approved by user, 2026-11-05 | Approved | This document |
| Implementation | Implementer | Authorized by user, 2026-11-05 | Complete; full-install runtime verification passed in testing; D-02 docs defect open | Commit `178d3d5`; `.opencode/reports/implementation/2026-11-05-agent-system-consolidation.md` |
| Specification (revision 3) | Spec Writer | Approved by user, 2026-11-05 | Approved | This document |
| Testing | Tester | Authorized by user, 2026-11-05 | Failed — D-01 spec conflict, D-02 docs defect | `.opencode/reports/testing/2026-11-05-agent-system-consolidation.md` |
| Specification (revision 4) | Spec Writer | Approved by user, 2026-11-05 | Approved | This document |
| Correction (cycle 1) | Implementer | Authorized by user, 2026-11-05 | In progress | Pending handoff |
| QA | QA | Not authorized | Not started | n/a |
