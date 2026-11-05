# Retesting report: agent system consolidation, correction cycle 2

**Spec:** `.opencode/specs/2026-11-05-agent-system-consolidation.md`
**Approved baseline:** revision 4, approved 2026-11-05
**Stage:** Retesting (cycle 2), authorized 2026-11-05; QA authorized but not started
**Commits under test:** `377b41b` (`docs(agent-system): align permission and skill counts with revision 4`), `4a3ca55` (`docs(agent-system): correct D-01 skill count and record testing`)
**Environment:** Windows, Bun 1.4.4, HEAD `4a3ca55`, live config root `C:\Users\barne\.config\opencode`, CLI `0.0.0-dev-20261105.134822` (source `178d3d5`), agent-system `2.0.0`, role-content `1.1.1`, permission mode `prompt`, 54/54 managed files in sync.
**Working tree:** `4a3ca55` plus an uncommitted execution-record edit to the spec (section 13 only) and the untracked `.opencode/reports/testing/` directory. The three docs files are clean at HEAD.
**Check revision:** `4a3ca55` plus the working tree; test assets in `.opencode/reports/testing/`.

## Overall result

**Verified for the correction-cycle-2 scope. No blocking issue.** The docs corrections match revision 4's permission model, skill counts, and marker attribution. Both commits contain only the expected docs and spec files, with no code, test, manifest, config, or role-content changes. The committed spec is revision 4 and its D-01 row says 10 repo-only skills. The focused checks pass. Two non-blocking residual docs imprecisions are documented below.

## Coverage

| Item | Method | Result |
|---|---|---|
| Permission model in `agent-system/README.md` and `docs/local-development.md:107` | Compared text with revision 4 R-09 and AC-09 and with the four role frontmatter permission blocks | Passed |
| Skill counts in `agent-system/README.md` and `agent-system/MIGRATION.md` | Compared text with revision 4 section 2.4, R-03, and AC-02; counted manifest skills | Passed |
| Marker attribution | Checked `spec-writer.md` and `implementer.md` content and the `install.ts` marker assertions | Passed, with the README overstatement noted below |
| `377b41b` scope | `git show --name-only`, path-filtered diff | Passed |
| `4a3ca55` scope | `git show --name-only` | Passed |
| Committed spec revision and D-01 row | `git show 4a3ca55:...` | Passed |
| `bun run test:agent-system` | Ran from repo root | Passed: 40 pass, 0 fail, 208 expectations, 6 files, 5.57s |
| `bun run agent:manifest -- --check` | Ran from repo root | Passed: 4 agents, 30 global skills, 10 project skills, 222 files |
| `bun run local:status -- -json` | Ran from repo root | Passed: installed, 2.0.0, 1.1.1, prompt, 54/54 in sync, errors `[]` |
| Full install in a clean worktree | Not Run | Docs-only commits; live install in sync; previous full-install evidence at `de85c05` covers the unchanged code |
| `bun run check` | Not Run | Docs and spec only; previous baseline (lint pass; pre-existing `server` and `cli` typecheck failures) remains applicable |
| TUI `ask` click-through | Not Run | Not affected by docs-only commits; previous retest verified the loaded `ask` rules and `prompt` mode |
| `-KeepAutoAccept` path | Not Run | Not affected by docs-only commits; previous retest verified the warning and manifest record |

## Commit scopes

| Commit | Files | Result |
|---|---|---|
| `377b41b` | `agent-system/README.md`, `agent-system/MIGRATION.md`, `docs/local-development.md` | Passed |
| `4a3ca55` | `.opencode/specs/2026-11-05-agent-system-consolidation.md` | Passed |

`git diff --name-only 377b41b^ 377b41b -- .opencode/agents .opencode/skills agent-system/manifest.json agent-system/config script packages package.json` returned no paths. `4a3ca55` has no paths outside the spec. The two PowerShell scripts in the range `178d3d5..4a3ca55` changed in `de85c05` (correction cycle 1), not in either commit under test.

## Docs corrections

Permission model:
- `agent-system/README.md:161-170` and `docs/local-development.md:107` state the Spec Writer `explore` allow plus `implementer`/`tester`/`qa` ask; Implementer `explore` allow and any other subagent only with `ask`; Tester denies all; QA default deny plus `explore` ask; no SDD role may `allow` `fast`/`medium`/`heavy`.
- The four role frontmatter blocks match: `spec-writer.md` has `subagent * deny`, `explore allow`, and `implementer`/`tester`/`qa` ask; `implementer.md` has `subagent * ask` and `explore allow`; `tester.md` has `subagent * deny`; `qa.md` has `action: "*"` deny and `subagent explore ask`.

Skill counts:
- `agent-system/README.md:201-203` and `agent-system/MIGRATION.md:42-44` state 15 repository skills (10 project-scope including `opencode-dev`, 5 shared) and 40 managed skills (30 global, 10 project).
- The manifest has 40 unique skills: 30 global, 10 project. The project list includes `opencode-dev`; the five shared skills are global-scoped.

Marker attribution:
- `spec-writer.md:101` has the untrusted-material rule; `:907-908` has `Skipped`/`Blocked`; `:800` has the two-correction-cycle limit; `:846` has `check revision`.
- `implementer.md:129` has the two-attempt retry ceiling.
- `install.ts:520-528` asserts the untrusted-material string, `Skipped:`, `Blocked:`, and `check revision` in the spec-writer prompt; `:529` asserts `two consecutive failed attempts` in the implementer prompt.

## Residual findings

Neither finding is blocking. Both are documentation accuracy issues; runtime behavior and the required docs corrections are correct.

1. `agent-system/MIGRATION.md:9` says "15 project skills" for the repository source row, while only 10 of the 15 are project-scoped; the other 5 are shared and installed as global. The same row says "the 10 skills not present globally remain project-scoped", and `MIGRATION.md:42-44` states the precise 10 + 5 + 40 counts. Acceptable as migration-note shorthand. A future docs touch could change "15 project skills" to "15 repository skills".

2. `agent-system/README.md:205-207` says the installer verifies "the untrusted-material rule, `Skipped`/`Blocked`, the correction-cycle limit, and the handoff `check revision` in the `spec-writer` system prompt." `install.ts:520-528` checks the first, second, third, and fourth items but not the correction-cycle limit. The limit is present in `spec-writer.md:800` and is covered by the manifest hash, so the runtime content is correct; the README overstates the marker assertion. A future docs touch could either add a correction-cycle marker to `assertMarkers` or remove it from the README's installer-verified list.

## Remaining gaps

- Full install in a clean worktree at `4a3ca55`: Not Run. The two commits change only docs and the spec; `local:status` reports 54/54 managed files in sync, and the previous full-install evidence at `de85c05` covers the unchanged code.
- `bun run check`: Not Run. The diff is docs and spec only; the previous baseline (lint pass; pre-existing `@opencode/server` and `@opencode/cli` typecheck failures unrelated to this change) remains applicable.
- TUI `ask` click-through and `-KeepAutoAccept`: Not rerun. The docs-only commits do not affect them; the previous retest verified the loaded `ask` rules, `prompt` mode, the `-KeepAutoAccept` warning, and the manifest record.
- Working-tree handoff note: the task said only the untracked `.opencode/reports/testing/` directory remained, but the spec also has an uncommitted execution-record edit (section 13 only, 5 insertions and 4 deletions). It does not change requirements or acceptance criteria. The committed spec at `4a3ca55` is clean; the working tree adds only that execution-record edit and the untracked reports.

## Next action

The Spec Writer may proceed to QA. QA is authorized but must not start until this Verified result is returned. No further correction cycle is needed for the two non-blocking docs imprecisions; they can be folded into a future docs change or accepted as known. The live configuration was not modified: agent-system `2.0.0`, role-content `1.1.1`, CLI `0.0.0-dev-20261105.134822`, permission mode `prompt`, 54/54 in sync.
