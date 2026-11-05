# Retesting report: agent system consolidation — correction cycle 1

**Spec:** `.opencode/specs/2026-11-05-agent-system-consolidation.md`
**Approved baseline:** revision 4, approved 2026-11-05
**Stage:** Retesting (authorized 2026-11-05; QA not authorized)
**Correction commit:** `de85c05343cd0ef52e24b343c61a1eb980ddf925` (`docs(agent-system): correct PowerShell argument examples`)
**Implementation under test:** live install from `178d3d578ce84bcefca0d060bdf7bc7ed2958c7a`; correction commit is docs-only
**Environment:** Windows, Bun 1.4.4, `opencode v0.0.0-dev-20261105.134822`, PowerShell 5.1. Live config root `C:\Users\barne\.config\opencode`; live install agent-system `2.0.0`, role-content `1.1.1`, permission mode `prompt`, 54/54 managed files in sync.
**Working tree:** `de85c05` plus the Spec Writer's execution-record edit to the spec and the untracked `.opencode/reports/testing/` directory. No full install was run, so no clean detached worktree was needed.
**Check revision:** `de85c05` plus the working tree; test assets in `.opencode/reports/testing/`.

## Overall result

**Verified for the correction-cycle-1 scope.** D-02 is fixed and the corrected commands run. AC-09 matches revision 4 and the loaded permissions. The correction commit contains the revision 4 spec and no code, test, manifest, config, or role-content changes. The three previously open gaps are documented below.

One residual documentation inconsistency remains outside the correction scope: `agent-system/README.md`, `agent-system/MIGRATION.md`, and `docs/local-development.md` still describe the pre-revision-4 tier model and the old 14/9 skill counts, and the spec's D-01 row still says 9 repo-only skills. These do not affect D-02 or AC-09, but the Spec Writer should decide whether to authorize a docs-only correction cycle 2 before QA.

## Correction commit scope

| Check | Result | Evidence |
|---|---|---|
| Commit file list | Passed | `git show --stat de85c05`: 4 files changed, 35 insertions, 29 deletions: the spec, `agent-system/README.md`, `script/install-local.ps1`, `script/local-status.ps1`. |
| No code/test/manifest/config/role changes | Passed | `git diff de85c05^ de85c05 -- .opencode/agents .opencode/skills agent-system script package.json` shows only `agent-system/README.md` and comment lines in the two PowerShell scripts. No `.opencode/agents`, `.opencode/skills`, `agent-system/manifest.json`, `agent-system/config`, `package.json`, or test changes. |
| Revision 4 spec in commit | Passed | `git show de85c05:.opencode/specs/...` reports `**Revision:** 4. Corrects R-09 and AC-09 to match the v1.1.1 permission model.` and `**Approval:** Revision 4 approved by user on 2026-11-05`. |
| Spec unchanged from commit to working tree | Passed | `git diff de85c05 -- .opencode/specs/...` contains only the execution-record updates (`Current stage`, authorization line, correction/retesting handoff, stage table). The requirements and acceptance criteria are unchanged. |

## D-02 verification

| Check | Result | Evidence |
|---|---|---|
| README uses `--` | Passed | `agent-system/README.md:38` `bun run update:local -- -AgentsOnly`; `:41` `-- -SkipAgents`; `:61` `bun run local:status -- -json`. |
| Script comments use `--` | Passed | `script/install-local.ps1:5-6` and `script/local-status.ps1:4` use `-- -AgentsOnly`, `-- -SkipAgents`, `-- -json`. |
| Broken single-dash form absent | Passed | Precise search `git grep -n -E '(^|[^-])- -(AgentsOnly\|SkipAgents\|json)'` exited 1 (no matches); literal `update:local - -`, `local:status - -`, and `agent:install - -` searches also exited 1. Note: the corrected `-- -AgentsOnly` contains the literal substring `- -AgentsOnly` starting at the second dash, so a naive substring search would produce a false positive; the precise check targets the broken single-dash form. |
| `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly` | Passed | Exit 0. Created 4 agents, 30 global skill directories, `opencode.json`, `opencode-model-router.overrides.jsonc`, `agent-system.installed.json`, and `agent-system.verify.log`. Output: `Installed agent system 2.0.0`, `Role content: 1.1.1`, `Permission mode: default` (no `cli.json` in the empty root). Temp root removed. |
| `bun run local:status -- -json` | Passed | Exit 0. JSON: `installed: true`, `agentSystemVersion: "2.0.0"`, `roleContentVersion: "1.1.1"`, `permissionMode: "prompt"`, `files.inSync: 54/54`, `config.opencode/router/cli: "in-sync"`, `errors: []`. |
| `bun run update:local -- -AgentsOnly -ConfigRoot <temp>` | Passed | Exit 0. Expected dirty-tree warning because the main tree has uncommitted spec/report files; installed the full asset tree into the temp root; `CLI unchanged (-AgentsOnly)`. Temp root removed. |

## AC-09 verification against revision 4

`retest-ac09.ts` ran `opencode debug agents` from `C:\Windows\Temp\opencode\retest-ac09-cwd` with `OPENCODE_CONFIG_DIR` set to the live config root. Result: **24 passed, 0 failed**.

| Assertion | Result |
|---|---|
| `debug agents` exits 0 and returns 15 agents | Passed |
| Modes: `spec-writer` primary, `implementer` all, `tester` subagent, `qa` subagent | Passed |
| Spec Writer: `subagent * deny`, `subagent explore allow`, `subagent implementer ask`, `subagent tester ask`, `subagent qa ask` | Passed |
| Implementer: `subagent * ask`, `subagent explore allow` | Passed |
| Tester: `subagent * deny` | Passed |
| QA: default deny covering subagent resources, `subagent explore ask` | Passed |
| No SDD role has an `allow` rule for `subagent` `fast`, `medium`, or `heavy` | Passed |
| `fast`, `medium`, `heavy` still present | Passed |
| Live `cli.json` `session.permissions` is `prompt` | Passed |
| Installed manifest `permissionMode: "prompt"`, `keepAutoAccept: false` | Passed |

**`-KeepAutoAccept` path:** a disposable temp root with `cli.json` `session.permissions: "autoaccept"` was installed with `script/install-local.ps1 -AgentsOnly -ConfigRoot <temp> -KeepAutoAccept` and `OPENCODE_AGENT_SYSTEM_SKIP_RUNTIME_VERIFY=1`. Exit 0. Output included `Permission mode: autoaccept (KeepAutoAccept opt-out recorded).` and both warnings: `session.permissions remains autoaccept. The TUI suppresses ask prompts, so SDD approval gates are not presented.` and `-KeepAutoAccept keeps session.permissions at autoaccept; SDD ask gates are suppressed.` The installed manifest recorded `permissionMode: "autoaccept"`, `keepAutoAccept: true`; `cli.json` remained `autoaccept`. Temp root removed.

**TUI `ask` click-through:** Not Run. The loaded `ask` rules and `prompt` mode are verified; the interactive TUI presentation was not exercised in this retest.

## Affected checks re-run

| Check | Result | Evidence |
|---|---|---|
| `bun run test:agent-system` | Passed | 40 pass, 0 fail, 208 expectations, 6 files, 5.73s; exit 0. |
| `bun run agent:manifest -- --check` | Passed | `Manifest OK: 4 agents, 30 global skills, 10 project skills, 222 files.`; exit 0. |
| `bun run check` | Not Run | The correction changes documentation and PowerShell comments only. The previous report's full-check baseline (lint pass; pre-existing `@opencode/server` and `@opencode/cli` typecheck failures unrelated to this change) remains applicable; rerunning it would not exercise the correction. |

## Residual documentation finding (outside correction scope)

The correction cycle was scoped to D-02 only, so the following stale text remains:

- `agent-system/README.md:165-167` says "The Implementer may invoke only `explore`. The Tester and QA deny all subagents." Revision 4 R-09 and the loaded permissions say the Implementer has `subagent * ask` plus `subagent explore allow`, and the QA has a default deny plus `subagent explore ask`.
- `agent-system/README.md:199-207` "Known specification discrepancies" still says the approved spec records 14 repository skills and 9 repo-only skills, and that AC-05 places the two-attempt ceiling in `spec-writer`. Revision 4 records 15/10 including `opencode-dev`, and AC-05 places the ceiling in `implementer`.
- `agent-system/MIGRATION.md:42-45` repeats the old 14/9 count and the `opencode-dev` omission.
- `docs/local-development.md:107` repeats the old tier-boundary model ("Implementer may invoke only `explore`... Tester and QA deny all subagents").
- `.opencode/specs/2026-11-05-agent-system-consolidation.md:406` (D-01 row) still says "9 repo-only stay project-scoped", while R-03 and AC-02 say 10 including `opencode-dev`.

**Expected:** the documentation describes revision 4's permission model and 10 repo-only skills. **Actual:** the locations above describe revision 3's model and the old count. **Impact:** a reader gets the wrong tier/SDD boundary and obsolete spec counts. This is documentation accuracy only; runtime behavior, D-02, and AC-09 are unaffected.

## Remaining gaps

- **`local:rollback -BinaryOnly`:** Not Run. It would modify the live CLI; the correction commit does not touch rollback code. The previous report inspected the path and the full binary install passed. A safe isolated fake-`USERPROFILE` test was not performed.
- **TUI `ask` click-through:** Not Run. Requires an interactive TUI session; the loaded `ask` rules and `prompt` mode are verified, and the previous report verified the static suppression condition (`autoaccept` only).
- **`-SkipAgents`-only:** Not Run. It would rebuild and swap the live CLI. The corrected `-- -AgentsOnly` separator was exercised end to end; `-SkipAgents` uses the same PowerShell parameter binding and the existing binary-install path, which the previous full install covered.
- **Full `bun run check`:** Not rerun; docs/comment-only diff, previous pre-existing baseline applies.
- **Residual documentation inconsistencies:** listed above; the Spec Writer should decide whether to authorize a docs-only correction cycle 2 (or a spec revision 5 for the D-01 row) before QA.

## Next action

The Spec Writer should decide whether the residual documentation inconsistencies require a docs-only correction cycle 2 or can be accepted as known gaps. QA is not authorized. The live configuration was not modified: it remains agent-system `2.0.0`, role-content `1.1.1`, CLI `0.0.0-dev-20261105.134822`, source commit `178d3d5`, permission mode `prompt`, 54/54 in sync.
