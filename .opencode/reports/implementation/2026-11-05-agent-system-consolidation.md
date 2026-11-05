# Implementation report — agent system consolidation

**Spec:** `.opencode/specs/2026-11-05-agent-system-consolidation.md` (revision 2, approved 2026-11-05)
**Stage:** Implementation (authorized 2026-11-05)
**Branch:** `dev`
**Baseline commit:** `d44c064e223ef1b9fa0730c6f9bc9ba74380397b`
**State:** Implementation complete; full-install runtime verification pending
**Next owner:** Spec Writer for Tester dispatch

> The implementer role denies edits to `.opencode/specs/**`, so this report carries the
> execution evidence the specification's Section 13 would otherwise record. The spec
> file itself was committed unchanged.

## Requirements implemented

| Requirement | Status | Evidence |
|---|---|---|
| R-01 single source of truth | Implemented | `.opencode/agents` and `.opencode/skills` are canonical; `~/.config/opencode` is an install target; `AGENTS.md` and `docs/local-development.md` state the boundary |
| R-02 role parity | Implemented | All four role files match the v1.1.1 standalone files after LF normalization; normalized SHA-256 in `agent-system/manifest.json` |
| R-03 skill consolidation | Implemented with documented count deviation | 30 global + 10 project skills; five shared skills match the newer global copies; license/provenance files preserved |
| R-04 manifest and versioning | Implemented | `agent-system/manifest.json` (222 files), `manifest.schema.json`, versions `2.0.0` / `1.1.1`, exact plugin pin |
| R-05 managed install | Implemented | `bun run update:local` installs CLI + assets; installed manifest records versions, commit, CLI version, hashes, backup path |
| R-06 idempotence | Implemented | Second install reports `in sync`, no hash changes, no new backup |
| R-07 backup and local-modification safety | Implemented | Pre-existing files backed up; edited managed files refused without `-Force`; `-Force` backs up and replaces; unmanaged files preserved and reported |
| R-08 configuration merge | Implemented | Canonical keys merged; unrelated keys, presets, active preset, and secrets preserved; malformed config refused with backup; atomic writes and post-write validation |
| R-09 tier/SDD coexistence | Implemented | No SDD role has an allow rule for `fast`/`medium`/`heavy`; installer verifies the loaded rules |
| R-10 permission gate integrity | Implemented | `autoaccept` → `prompt` with backup; `-KeepAutoAccept` records the opt-out and warns; `ask` rules verified in the loaded agent permissions |
| R-11 status and drift | Implemented | `local:status` exit codes 0/1/2/3; `--json`; reports versions, CLI, drift, missing, unmanaged, config drift |
| R-12 rollback | Implemented | `local:rollback -AgentsOnly` / `-BinaryOnly` / both; restored hashes verified; install-created files removed; unmanaged files preserved; no backup exits 2 |
| R-13 clean-install testability | Implemented | `-ConfigRoot` and `-AgentsOnly` create the complete tree under a supplied root |
| R-14 runtime load verification | Implemented in installer; full-install run pending | `verifyRuntime` asserts four roles, modes, permissions, v1.1.1 markers, and optional tiers; output saved to `agent-system.verify.log` on failure |
| R-15 documentation | Implemented | `AGENTS.md`, `docs/local-development.md`, `agent-system/README.md`, `agent-system/CHANGELOG.MD`, `agent-system/MIGRATION.md` |
| R-16 no secrets/machine-specific data | Implemented | Secret scan clean; `service*.json` never read/copied; the `eli5-skill` shim's absolute path was rewritten to `~/.agents/...` |
| R-17 compatibility/non-regression | Implemented | Plugin pin unchanged; model IDs unchanged; binary build/smoke/archive/swap/prune/`--version` preserved; exact pin mismatch is a reported failure |
| R-18 test coverage | Implemented | 40 tests across 6 files; manifest, merge, install, status, rollback, and PowerShell paths covered; package typecheck passes |

## Changed files

- `.opencode/agents/{spec-writer,implementer,tester,qa}.md` — v1.1.1 content, LF normalized.
- `.opencode/skills/` — 25 new global skills; `craft-prompting`, `eli5-skill`, `find-skills` updated from the newer global copies; `eli5-skill` absolute path made portable.
- `.opencode/specs/2026-11-05-agent-system-consolidation.md` — committed unchanged.
- `agent-system/` — manifest, schema, config fragments, README, CHANGELOG, MIGRATION, migrated docs and research.
- `script/agent-system/` — `lib.ts`, `manifest.ts`, `merge.ts`, `backup.ts`, `install.ts`, `status.ts`, `rollback.ts`, `cli.ts`, package/tsconfig, six test files.
- `script/install-local.ps1`, `script/local-status.ps1`, `script/local-rollback.ps1` — options, status/rollback integration.
- `package.json` — `agent:install`, `agent:status`, `agent:rollback`, `agent:manifest`, `test:agent-system`.
- `AGENTS.md`, `docs/local-development.md` — source-of-truth, install, options, tier/SDD boundary.

## Significant decisions

1. **Scope filtering.** Only `global`-scope skills are installed; project-scope skills remain repository-only. This was fixed after an initial run copied them globally.
2. **Runtime verification isolation.** Temp-root installs skip `opencode debug agents` by default because the managed service port conflicts with the live server and the plugin is not bootstrapped in a temp root. The full live install runs the verification with `--require-tiers`.
3. **Rollback semantics.** Install-created managed files are removed when the backup records `existed: false`; unmanaged files created after the backup are preserved and reported. This reconciles R-12 with AC-11's clean-install rollback.
4. **JSONC comments.** Comments are preserved when the file is unchanged; a changed file is normalized, backed up, and reported, per technical constraint 7.
5. **Plugin mismatch.** A different `opencode-model-router` version is a reported refusal, not an automatic upgrade.
6. **Spec inventory discrepancy.** The spec omits `opencode-dev` from the repo-only list; it is preserved as a project skill, yielding 40 managed skills instead of 39.
7. **Line-ending normalization.** Hashing and copying normalize UTF-8 text to LF, so the manifest is stable across Git's CRLF checkout behavior. The manifest records `lineEndings: "lf"`. This changed 51 project-skill hashes whose working-tree files were pre-existing CRLF; their content is unchanged.

## Verification evidence

| Check | Command/procedure | Result | Classification |
|---|---|---|---|
| Agent-system tests | `bun run test:agent-system` from repo root | 40 pass, 0 fail, 208 expectations, 6 files | Passed |
| Agent-system typecheck | `bun check -p tsconfig.json` in `script/agent-system` | No type errors in 14 files | Passed |
| Manifest check | `bun run agent:manifest -- --check` | 4 agents, 30 global, 10 project, 222 files; no errors | Passed |
| Tamper detection | `manifest.test.ts` copies the repo and edits one file | Error names `.opencode/agents/spec-writer.md` | Passed |
| Clean install | `bun run agent:install -- -ConfigRoot <temp> -AgentsOnly` | 4 agents, 30 global skill dirs, config files, installed manifest; project skills absent | Passed |
| Idempotence | Second identical install | `in sync`, no new backup | Passed |
| Local-modification refusal | Edit a managed file, install without `-Force` | Exit 1, names `agents/spec-writer.md`, file unchanged | Passed |
| `-Force` | Install with `-Force` | Replaces and backs up the edited file | Passed |
| Unmanaged preservation | Add `agents/custom.md` and `skills/custom-skill/SKILL.md` | Files survive and are reported | Passed |
| Pre-existing backup | Stale `agents/spec-writer.md`, no installed manifest | Stale content copied into the backup | Passed |
| Config merge | `opencode.json` with `update`, provider, other plugin; JSONC with active preset and comments | Unrelated keys survive; canonical keys set; comments normalized with backup | Passed |
| Malformed config | `opencode.json` = `{ not json` | Refused, backed up, parse error reported | Passed |
| Permission gate | `cli.json` autoaccept | Changed to prompt with backup; `-KeepAutoAccept` keeps it, records opt-out, warns | Passed |
| Status | In sync / edited / missing manifest / unreadable manifest | Exit 0 / 1 / 2 / 2; `--json` serializable | Passed |
| Rollback | Install, force install, rollback | Restored content matches backup hash; clean-install rollback removes created files; unmanaged file survives; no backup exits 2 | Passed |
| PowerShell installer | `install-local.ps1 -AgentsOnly -ConfigRoot <temp>`; `-KeepAutoAccept`; `-Force`; `-AgentsOnly -SkipAgents` | Tree created; opt-out recorded; force replaces; contradictory flags rejected | Passed |
| Role parity | SHA-256 of normalized standalone vs repo | All four match | Passed |
| Line-ending stability | Manifest hash normalization; `--check` after regeneration | 222 files; 51 pre-existing CRLF project-skill hashes normalized; check passes | Passed |
| Shared skills | SHA-256 vs global copies | All five match | Passed |
| License/provenance | File existence | `humanizer_fife/LICENSE`, `craft-prompting/evals/provenance.json`, references preserved | Passed |
| Secret scan | Regex scan of changed files for key/token patterns | No matches; no `service*.json` tracked | Passed |
| Lint | `bun run lint` (part of `bun run check`) | 1348 warnings, 0 errors; `sdk-docs` 0 problems | Passed |
| Full typecheck | `bun run check` | `@opencode/server#typecheck` failed with 90 errors in 34 `packages/server/test` files unchanged from HEAD | Failed (pre-existing baseline) |
| Full install + runtime | `bun run update:local`, then `opencode debug agents` outside the repo | Pending committed-tree run | Not Run |

## Known limitations, failures, and blockers

1. **`bun run check` baseline failure.** `@opencode/server#typecheck` reports 90 errors in 34 files under `packages/server/test`; `git diff HEAD -- packages/server` is empty, so this is not a regression from this change. Lint and all other turbo typecheck tasks passed. The agent-system package typecheck passes.
2. **Spec execution record not updated.** The implementer role denies edits to `.opencode/specs/**`; this report carries the evidence instead.
3. **Skill count deviation.** 40 managed skills (30 global + 10 project) versus the specification's 39/9. `opencode-dev` was omitted from the spec's inventory; it is preserved as a project skill.
4. **AC-05 marker attribution.** The two-attempt retry ceiling is in `implementer.md` in v1.1.1, not `spec-writer.md`. The installer verifies it in the implementer and verifies the untrusted-material rule, `Skipped`/`Blocked`, and `check revision` in the spec-writer.
5. **Temp-root runtime verification.** A temp config root cannot reach the live managed service and the plugin is not bootstrapped there; clean-install tests skip runtime verification via `OPENCODE_AGENT_SYSTEM_SKIP_RUNTIME_VERIFY=1`. The full live install performs the verification.

## Next action

Commit the migration on `dev`, run `bun run update:local` on the committed tree, verify `opencode debug agents` from outside the repository, exercise `local:status` and `local:rollback -AgentsOnly`, reinstall, and update this report with the runtime evidence.
