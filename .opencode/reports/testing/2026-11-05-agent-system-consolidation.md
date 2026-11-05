# Testing report: agent system consolidation

**Spec:** `.opencode/specs/2026-11-05-agent-system-consolidation.md`
**Approved baseline:** revision 3, approved 2026-11-05
**Stage:** Testing (authorized 2026-11-05; QA not authorized)
**Implementation tested:** `178d3d578c` on `dev` (includes `00f371f22d` plus four follow-up commits)
**Environment:** Windows, PowerShell 5.1.26100.9818, Bun 1.4.4. The pre-install CLI was `opencode v0.0.0-dev-20261105.064456`; the installed CLI after the full run is `0.0.0-dev-20261105.134822`.
**Check revision:** `bun run check`, `bun run test:agent-system`, `bun run agent:manifest -- --check`, plus independent scripts in this directory.

## Overall result

**Failed.** Two findings need the Spec Writer's decision:

1. **Specification conflict (R-02 vs R-09).** The migrated v1.1.1 Implementer has `subagent * ask` plus `subagent explore allow`; the QA has `subagent explore ask` with a default deny. R-09 says the Implementer may invoke only `explore`, and the Tester and QA must deny all subagents. AC-09's literal check (no `allow` rule for `fast`/`medium`/`heavy`) passes, but the R-09 prose is not satisfied. The implementation followed R-02 and kept the v1.1.1 content unchanged, so the conflict is in the specification, not the code.
2. **Documentation defect.** The README and PowerShell script comments document `bun run update:local - -AgentsOnly` and `bun run local:status - -json`. The single dash is passed to PowerShell as a literal argument, which fails with `PSArgumentException: Cannot process argument because the value of argument "name" is not valid`. The correct form is `--`. `bun run update:local -- -AgentsOnly -ConfigRoot <temp>` works; `bun run local:status -- -json` works.

All sixteen acceptance criteria were exercised. AC-01 through AC-08 and AC-10 through AC-16 pass. AC-09 passes its literal criteria; the R-09 conflict is a requirement-level finding. AC-12's required content is present; the broken examples are the documentation defect.

## Environment note

The handoff described a clean tree at `00f371f`. The actual state was `HEAD` at `178d3d578c` with the approved revision 3 spec modified but uncommitted. The full installer refuses a dirty tree. To run the committed source without committing or editing the spec, I created a detached worktree at `178d3d5` inside the repository (`.worktree-fulltest`) and linked the package `node_modules` directories to the main checkout. The worktree was clean; its source commit matched the main checkout. The main checkout's spec change was not touched. The worktree was removed after testing.

## Acceptance criteria

| ID | Status | Evidence |
|---|---|---|
| AC-01 | Passed | Normalized SHA-256 of all four repo roles equals the v1.1.1 standalone archive; manifest hashes equal those normalized hashes; a repository search found exactly the four canonical role files under `.opencode/agents/`. |
| AC-02 | Passed | Manifest: 40 skills, 30 `global`, 10 `project`; `opencode-dev` project-scoped; no skill in both scopes; 40 skill directories each with `SKILL.md`; `craft-prompting` matches the newer global copy; `humanizer_fife/LICENSE` and `craft-prompting/evals/provenance.json` preserved. |
| AC-03 | Passed | `bun run agent:manifest -- --check` exits 0 (`4 agents, 30 global, 10 project, 222 files`). In an isolated copy, appending to `.opencode/agents/spec-writer.md` makes the check exit 1 and names the file with expected and actual hashes. Changing `agentSystemVersion` to a number makes schema validation fail. |
| AC-04 | Passed | `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly` exits 0; creates 4 agents, 30 global skill directories, `opencode.json`, router overrides, and the installed manifest; all 54 installed hashes match both manifests; all 10 project skills absent. The default run also performed runtime verification. |
| AC-05 | Passed | Full `bun run update:local` built, smoke-tested, archived, swapped, pruned, and ran `opencode --version`. The live `opencode debug agents` check from an external working directory returned 15 agents: `spec-writer` primary, `implementer` all, `tester`/`qa` subagent; the spec-writer rules `edit * deny`, `edit .opencode/specs/** allow`, `shell * deny`, `subagent * deny`, `subagent explore allow`, `subagent implementer/tester/qa ask`; the spec-writer prompt contains the untrusted-material rule, `Skipped:`, `Blocked:`, and `check revision`; the implementer prompt contains the two-attempt ceiling. |
| AC-06 | Passed | Second identical install exits 0, reports `in sync`, creates no new backup, and changes no managed file hash. |
| AC-07 | Passed | Pre-existing stale role with no installed manifest is backed up with `existed: true` and matching content; an edited managed file is refused without `-Force`, names the file, and stays unchanged; `-Force` backs up and replaces; an unmanaged collision is refused as `unmanaged file collides` and replaced only with `-Force`; unmanaged `agents/custom.md` and `skills/custom-skill/SKILL.md` survive and are reported. |
| AC-08 | Passed | `update`, provider block, unrelated plugin, and unrelated `effort_policy` keys survive; `agent_operations` matches canonical; exact `opencode-model-router@2.9.1` pin added; router `activePreset`, other presets, and unrelated keys survive; `presets.fife` matches canonical; comment normalization is reported and the original commented file is backed up; malformed `opencode.json` and router overrides are refused, backed up, and reported; absent files are created with only canonical keys. |
| AC-09 | Passed (literal); R-09 conflict | `debug agents` lists `fast`/`medium`/`heavy`; no SDD role has an `allow` rule for those tiers; `cli.json` `autoaccept` changes to `prompt` with a backup and unrelated keys preserved; `-KeepAutoAccept` keeps `autoaccept`, prints the suppression warning, and records `permissionMode: autoaccept` and `keepAutoAccept: true`. Static check: `packages/tui/src/routes/session/index.tsx:214,271,2797` suppresses prompts only when `permission.mode === "autoaccept"`. The live TUI click-through was not performed. R-09's Implementer/QA prose does not match the v1.1.1 content. |
| AC-10 | Passed | Exit 0 in sync (54/54), exit 1 after a managed file edit with `files.drifted` naming it, exit 2 when the installed manifest is missing or unreadable, exit 3 when the repo manifest is invalid; `--json` returns the same data including CLI version/commit, agent-system and role-content versions, drifted/missing/unmanaged files, and configuration states. |
| AC-11 | Passed (agent layer); binary rollback Not Run | Temp-root tests: restores a pre-existing agent and configuration byte-for-byte, removes install-created managed files and the install-created manifest, preserves and reports a file created after the backup, restores the previous installed manifest byte-for-byte after a force install, reports the restored 2.0.0/1.1.1 versions, and exits 2 with a clear message when no backup exists. Live rollback restored backup `20261105212542200` (source commit `d44c064`) and status reported 2.0.0/1.1.1 with drift/extra from that older backup; a `-Force` reinstall restored 54/54 in sync. `local:rollback -BinaryOnly` was inspected but not executed. |
| AC-12 | Passed content; documentation defect | `AGENTS.md`, `docs/local-development.md`, `agent-system/README.md`, and `agent-system/CHANGELOG.MD` describe the two-layer install, the source-of-truth/install-target boundary, the options, how to add or change a managed agent/skill, the tier/SDD boundary, and the 2.0.0 / role-content 1.1.1 migration. The README's `- -AgentsOnly`, `- -SkipAgents`, and `- -json` examples are broken; see the defect below. |
| AC-13 | Passed | Regex scan of the 222 managed files and the changed tree found no API-key, token, private-key, or password patterns; no `service*.json` is tracked; managed files contain no user-specific absolute paths. |
| AC-14 | Passed | The implementation diff does not touch `packages/cli`, `packages/server`, `script/local-builds.ps1`, plugin source, model IDs, or provider configuration. The canonical fife preset matches the live preset (`vercel/minimax/minimax-m3.1-flash` / `mistral/deepseek-v4-1-flash-1017` / `vercel/openai/gpt-6.1-terra`). A temp install with `opencode-model-router@2.9.0` refuses, names the mismatch, and does not substitute 2.9.1. The full binary install path passed. |
| AC-15 | Passed with documented pre-existing baseline | `bun run test:agent-system`: 40 pass, 0 fail, 208 expectations, 6 files. `script/agent-system` typecheck: no errors in 14 files. `bun run check`: lint passes (1348 warnings, 0 errors; sdk-docs 0 problems); typecheck fails in `@opencode/server#typecheck` (90 errors in 34 `packages/server/test` files) and `@opencode/cli#typecheck` (2 errors: `src/index.ts:104`, `test/web-ui.test.ts:18`). `git diff HEAD -- packages/cli packages/server package.json bun.lock` is empty; the failing files were last changed 2026-11-01 to 2026-11-03, before the implementation. Both failures are pre-existing and unrelated. The Implementer report mentioned only the server failure. |
| AC-16 | Passed | The live installed manifest records agent-system 2.0.0, role-content 1.1.1, CLI `0.0.0-dev-20261105.134822`, source commit `178d3d5`, and backup path `C:\Users\barne\.config\opencode\backups\agent-system\20261105215116438`; `local:status` displays both versions. |

## Defects

### D-01: R-09 permission prose conflicts with the mandated v1.1.1 role content

- **Requirement:** R-09; AC-09 literal check passes.
- **Expected:** The Implementer may invoke only `explore`; the Tester and QA deny all subagents; no SDD role can invoke `fast`/`medium`/`heavy`.
- **Actual:** The loaded Implementer rules are `subagent * ask` and `subagent explore allow`; the loaded QA rules are `subagent * deny` with `subagent explore ask`; the Tester is `subagent * deny`. The Implementer can ask to invoke any subagent, including the tiers. The QA can ask to invoke `explore`.
- **Reproduction:** `opencode debug agents` from an external working directory, or read the permission blocks in `.opencode/agents/{implementer,qa,tester}.md`. The repo files match the v1.1.1 standalone archive byte-for-byte after LF normalization.
- **Cause and impact:** R-02 requires content parity with v1.1.1; R-09 requires a stricter boundary. The implementation cannot satisfy both. The user-facing effect is that the Implementer can request a tier subagent and the QA can request `explore`, subject to the `ask` gate. The Spec Writer must decide whether to amend R-09/AC-09 or authorize a role-content change that breaks v1.1.1 parity. This is a specification conflict, not a code defect.

### D-02: Documented single-dash `bun run` examples fail

- **Requirement:** R-15 / AC-12 documentation.
- **Expected:** The documented commands run.
- **Actual:** `bun run update:local - -AgentsOnly -ConfigRoot <temp>` and `bun run local:status - -json` fail with `PSArgumentException: Cannot process argument because the value of argument "name" is not valid`. The single `-` is passed to PowerShell as a literal argument. The same commands with `--` work: `bun run update:local -- -AgentsOnly -ConfigRoot <temp>` exits 0 and creates the tree; `bun run local:status -- -json` prints the JSON.
- **Locations:** `agent-system/README.md` lines 38, 41, and 61; `script/install-local.ps1` header comments lines 5-6; `script/local-status.ps1` header comment line 4. `docs/local-development.md` and `AGENTS.md` use the correct `--` form or no separator.
- **Impact:** A user following the README's `-AgentsOnly` or `--json` examples cannot run them. The fix is a documentation change from `-` to `--` in those examples. The implementation's option handling is correct when invoked directly or with `--`.

## Checks executed

| Check | Command / action | Result |
|---|---|---|
| Manifest check | `bun run agent:manifest -- --check` | Exit 0; 4 agents, 30 global, 10 project, 222 files |
| Tamper detection | Isolated copy + append to `spec-writer.md` + `cli.ts manifest --check --repo-root` | Exit 0 before; exit 1 naming the file after |
| Schema validation | Isolated copy with numeric `agentSystemVersion` | Exit 1; `expected type string` |
| Agent-system tests | `bun run test:agent-system` | 40 pass, 0 fail, 208 expectations, 6 files, 5.86s |
| Agent-system typecheck | `bun check -p tsconfig.json` in `script/agent-system` | No type errors in 14 files |
| Full check | `bun run check` | Lint pass; server and cli typecheck failures as above |
| Clean install | `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly` | Exit 0; 54/54 hashes; runtime verification log present |
| Isolated runtime | `verify-install.ts <temp>` | 44/44 assertions passed |
| Scenario suite | `scenarios.ps1` | 81/81 assertions passed (AC-06..AC-11) |
| Plugin mismatch | Temp `opencode.json` with `opencode-model-router@2.9.0` | Exit 1; names the mismatch; file unchanged; backup created |
| Secret scan | Regex scan of managed and changed files | No matches; no `service*.json` tracked |
| Full install | `bun run update:local` from the clean worktree | Exit 0; new CLI `0.0.0-dev-20261105.134822`; agent system in sync; runtime verification ran |
| Live runtime | `live-debug-agents.ts` (external cwd, live config) | 32/32 assertions passed |
| Live status | `bun run local:status --json` | Exit 0; 54/54; source commit `178d3d5`; CLI `0.0.0-dev-20261105.134822` |
| Live rollback | `bun run local:rollback -AgentsOnly` | Exit 0; restored `20261105212542200`; status reported 2.0.0/1.1.1 with drift/extra from the older backup |
| Live reinstall | `install-local.ps1 -AgentsOnly -Force` (direct) | Exit 0; 1 changed, 1 backup; status returned to 54/54 |
| Syntax check | `bun run update:local - -AgentsOnly`, `bun run local:status - -json` | Failed with `PSArgumentException`; `--` forms passed |

## Test assets

- `.opencode/reports/testing/verify-agent-system.ts`: role parity, skill inventory, manifest, secret and absolute-path checks.
- `.opencode/reports/testing/verify-install.ts`: installed-tree hashes, config canonical keys, runtime log assertions.
- `.opencode/reports/testing/scenarios.ps1`: AC-06..AC-11 isolated scenario suite.
- `.opencode/reports/testing/live-debug-agents.ts`: live runtime check from an external working directory.
- This report.

## Remaining gaps

- The live TUI presentation of an `ask` prompt was not clicked through. The static code path and the loaded `ask` rules were verified.
- `local:rollback -BinaryOnly` was not executed. The binary archive, swap, and build-record code was inspected, and the full binary install passed.
- The automated installer tests cover the contradictory `-AgentsOnly -SkipAgents` case but not a `-SkipAgents`-only build. The full install exercises the binary path; `-SkipAgents` only skips the asset step.
- The live rollback restored an older backup whose installed manifest and eli5-skill hash disagreed, so status reported drift and extra entries until the `-Force` reinstall. The temp-root rollback tests use clean states and pass. This is a stale-backup artifact, not a rollback logic failure.
- The main checkout remains dirty because the approved revision 3 spec is uncommitted. Future full installs must run from a committed tree or a clean worktree.

## Next action

The Spec Writer should resolve D-01 (R-02 vs R-09) and D-02 (documentation separator), then decide whether a correction cycle is needed. QA is not authorized. The live system is in sync at agent-system 2.0.0, role-content 1.1.1, CLI `0.0.0-dev-20261105.134822`, source commit `178d3d5`, permission mode `prompt`.
