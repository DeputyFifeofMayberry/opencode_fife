# QA report — agent system consolidation

**Spec:** `.opencode/specs/2026-11-05-agent-system-consolidation.md`
**Approved revision:** 4, approved 2026-11-05
**QA authorization:** User authorized QA on 2026-11-05 (Spec Writer execution record and QA dispatch)
**Review cycle:** Initial QA review (no prior QA disposition)
**Reviewed tree:** `dev` at `4a3ca55`; implementation `178d3d5`; docs `377b41b`; spec `4a3ca55`
**Working tree:** One uncommitted execution-record edit to the spec (section 13 only; requirements and ACs unchanged) and the untracked `.opencode/reports/testing/` directory. No uncommitted application, test, manifest, or configuration changes.
**Tested revision:** Live install source commit `178d3d5`; live CLI `0.0.0-dev-20261105.134822`; live config root `C:\Users\barne\.config\opencode`; agent-system `2.0.0`, role-content `1.1.1`, permission mode `prompt`, 54/54 managed files in sync.
**Check revision:** `4a3ca55` plus the working-tree execution-record edit; Tester assets in `.opencode/reports/testing/`.

## Disposition

**Pass with residual nonblocking gaps.** The core requirements and acceptance criteria are delivered and independently confirmed: role parity, the 40-skill inventory, manifest validation, clean install, idempotence, configuration merge, live runtime loading, permission mode, tier boundary, status, and agent-layer rollback. Two minor documentation defects remain, and three checks were not executed (binary-only rollback, TUI `ask` click-through, and `-SkipAgents`-only). Those gaps are low-risk and code-inspected, but they are disclosed rather than treated as fully verified. The pre-existing `bun run check` failures are outside this change and are permitted by AC-15 when demonstrated as pre-existing.

This is a recommendation for user acceptance, not user acceptance itself and not deployment authorization.

## Basis

- Approved spec revision 4; requirements R-01..R-18 and AC-01..AC-16 unchanged by the working-tree execution-record edit.
- Implementation baseline `178d3d5` on `dev`; docs correction `377b41b`; spec correction `4a3ca55`.
- Live installed manifest: agent-system `2.0.0`, role-content `1.1.1`, source commit `178d3d5`, CLI `0.0.0-dev-20261105.134822`, backup `C:\Users\barne\.config\opencode\backups\agent-system\20261105215116438`, permission mode `prompt`, `keepAutoAccept: false`, 54 files, three config entries.
- Scope reviewed: requirements and ACs, install/status/rollback workflow, permission gates, tier boundary, docs, tests, runtime behavior, regression risk, and applicable DoD items. Repository exploration was limited to the changed agent-system, role, skill, script, and documentation paths plus their callers and tests.

## Requirement status

| ID | Status | Evidence |
|---|---|---|
| R-01 single source of truth | Satisfied | `.opencode/agents/` and `.opencode/skills/` are canonical; `AGENTS.md`, `docs/local-development.md`, and `agent-system/README.md` state the boundary; no role file exists outside the canonical tree and the standalone archive |
| R-02 role content parity | Satisfied | Normalized SHA-256 of all four repo roles equals the v1.1.1 standalone archive and the manifest (independently recomputed) |
| R-03 skill consolidation | Satisfied | Manifest: 40 skills, 30 global, 10 project, `opencode-dev` project-scoped, five shared skills once; `craft-prompting` is the adaptive revision; `humanizer_fife/LICENSE` and `craft-prompting/evals/provenance.json` present |
| R-04 manifest and versioning | Satisfied | `agent-system/manifest.json` declares `2.0.0`, `1.1.1`, `opencode-model-router@2.9.1`, 222 files with hashes/scopes, and two config fragments; schema validates; `bun run agent:manifest -- --check` exits 0 |
| R-05 managed install | Satisfied | Installer copies agents and global skills, merges configuration, writes `agent-system.installed.json`; live install is 54/54 in sync; clean-install and PowerShell tests pass |
| R-06 idempotence | Satisfied | Second identical install reports `in sync`, changes no managed hash, and creates no new backup (`install.test.ts`; Tester scenario suite) |
| R-07 backup and local-modification safety | Satisfied | Pre-existing files backed up; edited managed file refused and named without `-Force`; `-Force` backs up and replaces; unmanaged collisions treated as local modifications; unmanaged files preserved and reported (`install.test.ts`, `powershell.test.ts`, Tester `scenarios.ps1`) |
| R-08 configuration merge | Satisfied | Unrelated `opencode.json` keys, provider, other plugins, router active preset/other presets, and comments are preserved or backed up/normalized; exact plugin pin; malformed JSON/JSONC refused with backup; absent files created with canonical keys; atomic writes and post-write validation (`merge.test.ts`, `install.test.ts`) |
| R-09 tier/SDD coexistence | Satisfied | Live `opencode debug agents`: `spec-writer` primary, `implementer` all, `tester`/`qa` subagent; spec-writer `subagent * deny`, `explore allow`, `implementer`/`tester`/`qa` ask; implementer `subagent * ask` + `explore allow`; tester `subagent * deny`; QA default deny + `explore ask`; no SDD role allows `fast`/`medium`/`heavy`; tiers present |
| R-10 permission gate integrity | Satisfied with one unverified element | Live `cli.json` `session.permissions` is `prompt`; installed manifest records `prompt`/`keepAutoAccept: false`; `-KeepAutoAccept` warning and record tested; installer asserts spec-writer `ask` rules. The interactive TUI presentation of an `ask` prompt was not executed (QA-04) |
| R-11 status and drift | Satisfied | Live `bun run local:status -- -json` exits 0 with 54/54, versions, CLI, config states, errors `[]`; tests cover exit 1 (file/config drift), exit 2 (missing/unreadable installed manifest), and `--json`; Tester reports exit 3 on invalid repo manifest |
| R-12 rollback | Satisfied for agent layer; Unverified for binary layer | Agent rollback restores previous content, removes install-created files, preserves/reports unmanaged files, and exits 2 with no backup (`rollback.test.ts`; Tester live rollback). `-BinaryOnly` was inspected but not executed (QA-03) |
| R-13 clean-install testability | Satisfied | `-ConfigRoot` + `-AgentsOnly` creates agents, 30 global skills, configuration, and installed manifest under a temporary root; project skills absent; tests and Tester runs pass |
| R-14 runtime load verification | Satisfied with a minor assertion gap | Live `opencode debug agents` from outside the repo shows the four roles, modes, permission rules, `fast`/`medium`/`heavy`, and the v1.1.1 markers (untrusted-material rule, `Skipped:`, `Blocked:`, `check revision`, two-correction-cycle limit, implementer two-attempt ceiling). Installer asserts spec-writer markers, implementer retry ceiling, roles/modes, and tier boundary; it does not assert the correction-cycle limit or the full Implementer/Tester/QA rule set (QA-07) |
| R-15 documentation | Satisfied with two minor defects | `AGENTS.md`, `docs/local-development.md`, `agent-system/README.md`, and `agent-system/CHANGELOG.MD` describe the two-layer install, source-of-truth boundary, options, status/rollback, adding agents/skills, and tier/SDD boundary. Two imprecisions remain (QA-01, QA-02) |
| R-16 no secrets or machine-specific data | Satisfied | Tester secret scan found no credentials and no tracked `service*.json`; managed files contain no user-specific absolute paths; the `eli5-skill` shim path was made portable. QA spot checks found no `service*.json` in the changed tree |
| R-17 compatibility and non-regression | Satisfied | No plugin source, model ID, provider, or routing change; exact `opencode-model-router@2.9.1` pin; mismatched version refused, not substituted; full binary install built, smoke-tested, archived, swapped, pruned, and ran `--version`; existing `local:status`/`local:rollback` remain |
| R-18 test coverage | Satisfied with documented baseline | `bun run test:agent-system` passes 40 tests / 208 expectations / 6 files; agent-system typecheck passes 14 files; `bun run check` has pre-existing `@opencode/server` and `@opencode/cli` typecheck failures in unchanged test files; `-SkipAgents`-only is not automated (QA-05) |

## Acceptance criteria status

| ID | Status | Evidence |
|---|---|---|
| AC-01 | Satisfied | Four canonical role files; normalized SHA-256 equals the v1.1.1 archive and manifest; no duplicate role files |
| AC-02 | Satisfied | 40 skills (30 global, 10 project), `opencode-dev` project, five shared once, `craft-prompting` adaptive, license/provenance present |
| AC-03 | Satisfied | `bun run agent:manifest -- --check` exits 0; tamper test names the file and exits nonzero; schema rejects wrong scope/hash |
| AC-04 | Satisfied | Clean install creates the four agents, 30 global skill directories, `opencode.json`, router overrides, and installed manifest; hashes match; project skills absent; tests and Tester runs pass |
| AC-05 | Satisfied | Live `opencode debug agents` from an external directory: 15 agents, four roles with expected modes, spec-writer rules, v1.1.1 markers, implementer retry ceiling; full install completed and live CLI/commit recorded |
| AC-06 | Satisfied | Second install in sync, no hash change, no new backup |
| AC-07 | Satisfied | Pre-existing stale role backed up; edited managed file refused and unchanged without `-Force`; `-Force` backs up and replaces; unmanaged collision refused; unmanaged files survive and are reported |
| AC-08 | Satisfied | Unrelated keys, provider, other plugins, active preset, other presets, and comments preserved or backed up; canonical keys set; malformed files refused with backup; absent files created with canonical keys |
| AC-09 | Satisfied with one unverified element | Live permissions match the v1.1.1 model; no tier allow; `cli.json` `prompt`; `-KeepAutoAccept` warning and manifest record. TUI `ask` presentation not executed (QA-04) |
| AC-10 | Satisfied | Live status exits 0 with versions/CLI/54-54/config; tests cover exit 1/2/3 and `--json` |
| AC-11 | Satisfied for agent layer; Unverified for binary layer | Agent rollback restores content, removes install-created files, preserves unmanaged files, exits 2 with no backup; binary-only rollback not executed (QA-03) |
| AC-12 | Satisfied with two minor defects | Required documentation content present; `MIGRATION.md:9` count wording and `README.md:205-207` installer-verification claim are imprecise (QA-01, QA-02) |
| AC-13 | Satisfied | Tester secret scan clean; no tracked `service*.json`; no machine-specific absolute paths in managed files |
| AC-14 | Satisfied | No plugin/model/provider change; exact pin; mismatch refused; full binary install path passed |
| AC-15 | Satisfied with documented baseline | 40 tests pass; agent-system typecheck passes; `bun run check` failures are in unchanged `packages/server/test` and `packages/cli` files and are documented as pre-existing; `-SkipAgents`-only coverage gap (QA-05) |
| AC-16 | Satisfied | Installed manifest records `2.0.0`, `1.1.1`, CLI version, source commit, and backup path; `local:status` displays both versions |

## Independent work

Commands and inspections actually performed by QA:

| Check | Result |
|---|---|
| `git status`, `git log`, `git diff` on `dev` | HEAD `4a3ca55`; one spec execution-record edit; untracked testing reports; no application/test/config changes |
| `bun run agent:manifest -- --check` | Exit 0: 4 agents, 30 global skills, 10 project skills, 222 files |
| `bun run test:agent-system` | 40 pass, 0 fail, 208 expectations, 6 files, ~5.9 s |
| `bun run local:status -- -json` | Exit 0: installed, 2.0.0/1.1.1, prompt, 54/54, config in sync, errors `[]` |
| `opencode debug agents` from `C:\Windows\Temp\opencode\qa-runtime-cwd` with live config | 15 agents; `spec-writer` primary, `implementer` all, `tester`/`qa` subagent; expected subagent rules; `fast`/`medium`/`heavy` present; spec-writer markers all true; implementer two-attempt marker true |
| Role parity | Normalized SHA-256 of all four roles equals the standalone archive and manifest |
| `bun check -p tsconfig.json` in `script/agent-system` | No type errors in 14 files |
| Live installed manifest and `cli.json` | Versions, source commit, CLI, backup path, `prompt`, `keepAutoAccept: false`, 54 files, three configs |
| Skill inventory and license/provenance | 30 global, 10 project, `opencode-dev` project, five shared once, `craft-prompting` adaptive, license/provenance present |
| Documentation inspection | `AGENTS.md`, `docs/local-development.md`, `README.md`, `MIGRATION.md`, `CHANGELOG.MD` reviewed; two imprecisions confirmed |
| Test inspection | Manifest, merge, install, status, rollback, and PowerShell tests reviewed; assertions are meaningful and cover the required happy and failure paths |
| Isolated clean install/status/rollback | Direct CLI install into a temp root with a pre-existing stale role: exit 0; 4 agents, 30 global skills, configuration, and installed manifest created; status exit 0 with 54/54; second install `in sync` with no new backup; edited managed file status exit 1 and install refused without `-Force` (file unchanged); `-Force` replaced it; agent rollback restored the backup; missing installed manifest status exit 2. Temp roots were outside the repository. |
| Baseline/regression check | `git diff HEAD -- packages/server packages/cli package.json bun.lock` is empty; the failing test files were last changed in `33f30ecbbc` (2026-11-03), before the implementation; no `service*.json` credential files are tracked; no user-specific absolute paths in managed sources; no secret-pattern hits in changed non-md files. |

Tester-supplied evidence, not personally reproduced by QA: full `bun run update:local` build/swap/prune, live agent-layer rollback and reinstall, `scenarios.ps1` 81 assertions, `verify-install.ts` 44 assertions, `live-debug-agents.ts` 32 assertions, `retest-ac09.ts` 24 assertions, full `bun run check` baseline, secret scan, and the `-KeepAutoAccept` temp-root run.

Checks not run by QA: full `bun run check` (inherited Tester baseline); `local:rollback -BinaryOnly`; TUI `ask` click-through; `-SkipAgents`-only; full `update:local` (Tester ran it; live install confirms the result). The isolated install/status/rollback scenario was run directly through `bun script/agent-system/cli.ts`; a first attempt through `bun run` failed because the PowerShell wrapper surfaced the script's stderr as a terminating error, not because of an installer defect.

## Findings

### Confirmed defects

**QA-01 — Minor — `MIGRATION.md:9` says "15 project skills" for a 10-project/5-shared inventory.**
Location: `agent-system/MIGRATION.md:9`. Expected: the repository source row should say 15 repository skills (10 project-scoped + 5 shared) or 10 project skills. Actual: "15 project skills". The same document later states the precise 10 + 5 + 40 counts, and the manifest is correct. Impact: a reader skimming the source table gets the wrong scope count. Action: change the wording to "15 repository skills" or "10 project-scoped skills (5 shared)".

**QA-02 — Minor — `README.md:205-207` says the installer verifies the correction-cycle limit, but `install.ts:520-528` does not assert it.**
Location: `agent-system/README.md:205-207`; `script/agent-system/install.ts:520-528`. Expected: the README should list only markers the installer actually asserts, or the installer should assert the limit. Actual: `assertMarkers` checks the untrusted-material rule, `Skipped:`, `Blocked:`, and `check revision` in the spec-writer prompt, and the two-attempt ceiling in the implementer prompt; it does not check the correction-cycle limit. The limit is present in `.opencode/agents/spec-writer.md:800`, is covered by the manifest hash, and is present in the live loaded prompt (QA verified `cyclelimit=True`). Impact: the README overstates the installer's runtime assertion; a future removal of the limit would not be caught by the marker check, though the manifest hash and `agent:manifest --check` would catch an unmanifested edit. Action: add a correction-cycle marker to `assertMarkers` or remove it from the README's installer-verified list.

### Unverified risks and evidence gaps

**QA-03 — `local:rollback -BinaryOnly` was not executed.**
The code path in `script/local-rollback.ps1` selects the newest archive (or `-Build`), copies `opencode.exe` and renderer DLLs, restores the archived build record, removes pre-existing `.old-*` renames, and runs `--version`. It does not verify the archived binary's SHA-256 against the archive record. The Tester reports the full binary install path passed, and the archive/swap code is shared, so the risk is low, but the binary rollback behavior is not execution-verified. AC-11's binary layer is Unverified. Action: run `local:rollback -BinaryOnly` in an isolated fake `USERPROFILE`, or explicitly accept the code-inspection evidence.

**QA-04 — TUI `ask` click-through was not executed.**
The loaded `ask` rules and `cli.json` `prompt` mode are verified, and the TUI suppresses prompts only when `permission.mode === "autoaccept"` (`packages/tui/src/routes/session/index.tsx:214,271,2797`). The interactive presentation of an `ask` prompt was not exercised. AC-09's manual/harness element is Unverified. Risk is low because the condition is simple and the loaded rules are present. Action: perform the manual click-through or use the runtime permission harness.

**QA-05 — `-SkipAgents`-only was not automated or executed.**
`install-local.ps1` guards the asset step with `if (-not $SkipAgents)` and the full binary path is exercised by the full install; the contradictory `-AgentsOnly -SkipAgents` case is tested. A `-SkipAgents`-only run would rebuild and swap the live CLI, so it was not performed. AC-15's installer coverage is therefore incomplete for that option. Risk is low. Action: add a test that stubs the binary step, or run it when a CLI rebuild is acceptable.

**QA-06 — `bun run check` is not green.**
The Tester reports `@opencode/server#typecheck` (90 errors in 34 `packages/server/test` files) and `@opencode/cli#typecheck` (2 errors in `src/index.ts:104` and `test/web-ui.test.ts:18`). The Tester reports `git diff HEAD -- packages/cli packages/server package.json bun.lock` is empty and the failing files were last changed before the implementation. QA independently confirmed the diff is empty, the failing files were last changed in `33f30ecbbc` (2026-11-03), and the implementation does not touch `packages/cli` or `packages/server`; QA did not rerun the full check, and the agent-system package typecheck passes. AC-15 permits pre-existing baseline failures when demonstrated; the Tester's evidence supports that classification. Action: keep the baseline record; no change required for this task.

**QA-07 — Installer runtime verification is narrower than the full permission model.**
`assertPermissions` checks the spec-writer rules and that no SDD role allows `fast`/`medium`/`heavy`; it does not assert the Implementer `subagent * ask`, Tester `subagent * deny`, or QA default-deny/`explore ask` rules, and `assertMarkers` does not assert the correction-cycle limit. The live `debug agents` output and the Tester's `retest-ac09.ts` cover those rules, and the role files are manifest-hashed. This is a verification-depth gap, not a runtime defect. Action: extend the installer assertions if the installer is intended to be the sole acceptance check.

**QA-08 — Rollback removes install-created managed files even if edited after install.**
`restoreBackup` removes any target recorded as `existed: false` when it exists at rollback time. R-12 says "Files created after the backup must be preserved and reported, not deleted"; the implementation interprets that as unmanaged files, and the tests cover an unmanaged file created after the backup. A user edit to an install-created managed file would be lost on rollback. The file is a managed artifact recoverable from the repository, so the likelihood and impact are low. Action: clarify the requirement or preserve modified managed files with a report.

**QA-09 — Absent-`cli.json` permission verification is indirect.**
When `cli.json` is absent, `assertPermissionMode` checks that no `cli.json` was created with `autoaccept`; it does not query the runtime's default permission mode. R-08 says the installer must verify the runtime's default permission mode instead. The runtime default is `prompt` by code and the clean-install test passes, but the verification is not a direct runtime query. Action: add a runtime assertion if the default is not guaranteed by the loader.

**QA-10 — `local:status` does not detect repo source/manifest drift.**
`readStatus` compares installed files to the manifest's declared hashes; it does not run `checkManifest` against the repo sources. A stale manifest would be caught by `agent:manifest -- --check` and by the installer's post-write validation, but not by `local:status` alone. This is a minor observability gap, not a requirement violation. Action: optionally have status report manifest-check errors.

**QA-11 — Router merge overwrites a non-object `presets` value.**
`mergeRouterOverrides` treats a non-record `presets` value as `{}` and replaces it with the canonical `fife` preset. A malformed but parseable router file with `presets` as an array or string would be normalized rather than refused. The spec requires malformed JSON/JSONC to be refused; this is a semantic malformation edge case. Action: refuse a non-object `presets` value if strictness is desired.

### Regression concerns

- No application, test, manifest, or configuration changes are uncommitted. The only working-tree changes are the spec execution record and the untracked Tester reports; the committed spec at `4a3ca55` is clean.
- The live install source commit is `178d3d5`; the later `377b41b` and `4a3ca55` commits are docs/spec only and do not change runtime behavior.
- The pre-existing `bun run check` failures are in unchanged `packages/server/test` and `packages/cli` files; the agent-system change does not touch those packages. No regression attributable to this work was found.
- The model-router plugin, model IDs, provider configuration, and routing behavior are unchanged; the exact `2.9.1` pin is enforced.

### Definition of Done assessment

- Correctness: acceptance criteria are met for the core workflow; runtime behavior was verified live; tests cover the required happy and failure paths. The unexecuted binary rollback and TUI presentation are residual verification gaps.
- Quality: the implementation is structured around a manifest, merge, backup, install, status, and rollback modules with focused tests; no dead code or unrelated refactor was found in the reviewed paths; the agent-system typecheck passes.
- Integration: configuration merge, backup/restore, status, and the binary install path integrate with the existing local update workflow; the pre-existing check failures are documented.
- Documentation: the required docs are updated; two minor imprecisions remain.
- Ship-readiness: the change is local-only; no deployment or publication is involved; a rollback path exists; secrets are not copied.

## Handoff

**Report path:** `.opencode/reports/qa/2026-11-05-agent-system-consolidation.md`

**Recommendation:** Accept the delivery with the residual gaps disclosed. If the user wants a fully evidenced acceptance, close QA-01 and QA-02 (docs-only) and run QA-03, QA-04, and QA-05 before acceptance. None of the findings is a confirmed Blocker or Major issue; the two docs defects are minor and the three unexecuted checks are low-risk verification gaps.

**Next owner:** Spec Writer/user for the acceptance decision. If corrections are authorized, return to the Implementer for the docs changes and to the Tester for the targeted checks under the established workflow. QA does not invoke Implementer or Tester and does not grant user acceptance.

**Specific decision needed:** Accept the two docs imprecisions and the three unexecuted checks as known nonblocking gaps, or authorize a docs-only correction and targeted verification before acceptance.

**Residual limitations of this QA review:** QA did not rerun the full `bun run update:local` or `bun run check`; those results are Tester-supplied. QA did not execute binary-only rollback, the TUI click-through, or a `-SkipAgents`-only run. The live environment was inspected read-only; no production code, tests, configuration, or specification were modified by QA.
