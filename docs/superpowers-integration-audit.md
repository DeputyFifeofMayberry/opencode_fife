# Superpowers Integration Audit

Date: 2026-11-02. Scope: root `AGENTS.md`, the project and personal skill sets, the
`obra/superpowers` plugin, and the running OpenCode runtime.

## 1. Environment

| Item | Value |
| --- | --- |
| OS / shell | Windows (`win32`), PowerShell 5.1, Bun package manager |
| Binary | `C:\Users\barne\.local\bin\opencode.exe` |
| Version | `opencode v0.0.0-dev-20261102.033735` — an OpenCode **V2** dev build |
| Checkout | `Y:\CodingProjects\opencode_fife`, branch `dev`, HEAD `471d2199`, clean, 0/0 against `origin/dev` |
| Other worktrees | 4 under `C:\Users\barne\.local\share\opencode\worktree\9e87c6\` (other sessions) — untouched |
| Global config | `C:\Users\barne\.config\opencode\opencode.json` — `update: disable`, `effort_policy`, `plugins: [...]` |
| Project config | `opencode.json` (`$schema` only) and `.opencode/opencode.jsonc` (references, MCP, tools, effort policy, `agents.build`) |
| Plugin cache | `C:\Users\barne\.cache\opencode\npm\git-superpowers-0958a5557860\1793592066261\node_modules\superpowers` |
| Installed Superpowers | **7.0.1**, `main: .opencode/plugins/superpowers.js`, no `exports` field |

Superpowers is installed the officially supported V2 way — a git-backed package spec in
the global `plugins` array:

```json
"plugins": [
  "superpowers@git+https://github.com/obra/superpowers.git",
  "opencode-model-router@2.9.1"
]
```

There is no legacy install to migrate: `~/.config/opencode/plugins/superpowers.js`,
`~/.config/opencode/skills/superpowers`, and a cloned `~/.config/opencode/superpowers`
are all absent.

**Upstream inspected:** `obra/superpowers` `main` at commit
`2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` (release v7.0.1, 2026-10-21). Sources read:
`.opencode/INSTALL.md`, `docs/README.opencode.md`, `package.json`, `index.js`,
`.opencode/plugins/superpowers.js`, and the `skills/` tree.

The plugin is dual-host by design. On V2 it registers every `skills/<name>/SKILL.md`
through `ctx.skill.transform()` and injects the `using-superpowers` bootstrap through
`ctx.session.hook("context")`, skipping child (subagent) sessions. V2 requires OpenCode
2.0.4 or later and the `plugins` key; V1 uses `plugin`.

## 2. Original state

The integration was already installed and healthy. Six defects were found around it,
and two unrelated runtime errors.

| ID | Finding | Severity |
| --- | --- | --- |
| D1 | Superpowers `test-driven-development` was **shadowed** by a personal skill of the same name. V2 precedence is project → personal → Superpowers, and the skill catalog listed only the personal variant. | High — a documented Superpowers skill was unreachable by name |
| D2 | That personal TDD skill referenced `../../references/testing-patterns.md`, a path that resolves only from a project skills directory. The personal config has no `references/` directory, so it was a project skill in the wrong scope with a dead link. | Medium |
| D3 | `AGENTS.md` said "Use native Plan for high-risk or ambiguous work". No `plan` agent exists in this runtime; available subagents are `explore`, `fast`, `general`, `heavy`, `medium`. | Medium — unexecutable instruction |
| D4 | `AGENTS.md` said "Do simple work directly. Delegate only when a specialist adds a distinct perspective." The `opencode-model-router` plugin injects a mandatory protocol whose default is to dispatch read-only work to `@fast` with tier caps. Two conflicting policies governed the same decision. | High — contradictory instructions |
| D5 | `AGENTS.md` never mentioned Superpowers, while `docs/superpowers/plans/` plans instruct workers to use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. A large personal skill pack covers the same ground. Nothing defined which system wins. | High |
| D6 | `.opencode/references/` holds seven checklists; `AGENTS.md` named only `definition-of-done.md` and referred vaguely to "shared checklists". | Low |
| D7 | Five skill names exist in both `.opencode/skills/` and `~/.config/opencode/skills/`. Two pairs are byte-identical; three diverged. | Medium — silent shadowing, stale-copy risk |

D7 detail, measured by exact text comparison of `SKILL.md`:

| Skill | Project | Personal | Result |
| --- | --- | --- | --- |
| `construction-humanizer` | 31,068 chars | 31,068 chars | identical |
| `walk-me-through` | 5,120 chars | 5,120 chars | identical |
| `craft-prompting` | 67 lines (CRAFT-only) | 102 lines (adaptive) | diverged — the **older** project copy wins |
| `eli5-skill` | 1,013 chars | 1,001 chars | diverged, small |
| `find-skills` | 5,613 chars | 5,472 chars | diverged, small |

Unrelated to Superpowers, and not caused by this work:

- The running server returns HTTP 500 on `/api/experimental/client-mcp` roughly every
  10 seconds: `ReferenceError: w2 is not defined` at
  `@effect/platform-node/dist/NodeHttpServer.js:166:73`, through
  `server/src/handlers/mcp.ts:93`. It predates every change below and is unaffected by
  them.
- Historical `WARN failed to load plugin ... .opencode\ecc\plugin` (ENOENT) entries in
  the log come from older worktree sessions, not this checkout.

## 3. AGENTS.md optimization

The file was already well organised, so the revision is targeted rather than a rewrite.
Net change: 32 insertions and 10 deletions, concentrated in one new section.

| Change | Reason |
| --- | --- |
| Added `## Repository Invariants` over the four leading bullets | They were unheaded architecture and release rules; the file now has navigation from line 1 |
| Replaced `## Agent Skills` (2 bullets) with `## Skills` (source precedence, routing table, references index) | Resolves D5 and D6: states which system owns process, which owns repo knowledge, and which personal skills are opt-in |
| Rewrote `## Delegation` | Resolves D3 and D4: the router plugin owns tiers and caps; removed the contradictory "do simple work directly" and the nonexistent "native Plan" |
| Added one Testing bullet | Splits the red-green loop (`test-driven-development`) from test size and structure (`test-design`) |
| Merged three overlapping delegation bullets into one dispatch contract, and kept the "do not delegate final verification, small context-heavy edits, or conversation-dependent sequential work" safeguard | Same requirements, less repetition; the safeguard survives because the router contract does not cover it |

Preserved verbatim or in substance: protocol generation rule, dependency direction, the
no-Changesets rule, the `dev` integration branch, the Inspect/Implement/Protect/Verify
workflow, local development and local update procedures, live TUI testing, live desktop
diagnostics, TUI stories, theme token rules, branch naming, worktrees and integration,
Git safety, commit and PR conventions, the entire style guide, testing rules, checks,
the Session Core invariants, and both communication sections.

Nothing was deleted for length. The only removals are the two instructions that were
wrong or contradictory (D3, D4) and the "good delegation cases" list, whose content is
now owned by the router contract.

## 4. Skill inventory

| Source | Count | Examples |
| --- | --- | --- |
| Superpowers 7.0.1 | 15 | `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review`, `verification-before-completion`, `using-git-worktrees`, `finishing-a-development-branch`, `dispatching-parallel-agents`, `writing-skills`, `diagnosing-superpowers`, `using-superpowers` |
| Project `.opencode/skills/` | 15 | `unit-tests`, `tui-tests`, `app-e2e-tests`, `component-tests`, `effect`, `opencode-dev`, `rtl-aware-development`, `humanizer_fife`, `plan-hardening`, `sample-skill` |
| Personal `~/.config/opencode/skills/` | 29 | `api-and-interface-design`, `code-review-and-quality`, `constraint-driven-development`, `doubt-driven-development`, `interview-me`, `spec-driven-development`, `test-design` |
| Built in | 2 | `opencode` (harness guide, served from `/builtin`) and `report` |

The catalog lists 56 distinct names: 15 project + 29 personal + 15 Superpowers + 2
built-in, minus the 5 duplicate project/personal names.

**Overlap decisions.** Superpowers owns the process spine. Where a personal skill covers
the same ground — `idea-refine` and `interview-me` versus `brainstorming`;
`spec-driven-development` and `planning-and-task-breakdown` versus `writing-plans`;
`incremental-implementation` versus `executing-plans`; `debugging-and-error-recovery`
versus `systematic-debugging`; `code-review-and-quality` versus
`requesting-code-review`; `using-agent-skills` versus `using-superpowers` — the personal
skill is retained and marked opt-in in `AGENTS.md`. They are not harmful, they are not
deleted, and the routing table removes the ambiguity.

**D1/D2 resolved.** The personal `test-driven-development` was renamed to `test-design`,
its description narrowed to test size, structure, assertion design and flakiness, its
`# Test Driven Development` title corrected, and its dead reference replaced with a
project-conditional pointer. Its ten cross-references in the personal pack
(`using-agent-skills`, `spec-driven-development`, `incremental-implementation`,
`debugging-and-error-recovery`, `doubt-driven-development`,
`constraint-driven-development`) were updated in the same pass so the pack stays
coherent. `.opencode/references/testing-patterns.md` was updated to match.

**D7 deliberately not changed.** The three divergent project/personal pairs are left as
they are. Editing user-global skills changes behaviour in every other project, and
replacing the older `craft-prompting` with the newer personal text is a content decision
rather than an integration fix. `AGENTS.md` now states that the project copy wins so the
next edit lands in the right file. Recommended follow-up, when wanted: reconcile
`craft-prompting` by copying the personal version into the project, and delete the two
identical personal duplicates.

## 5. Integration

No integration change was required. The official V2 mechanism was already correct:
`plugins` key, git package spec, plugin cache populated, plugin registered. No project
override, no symlinks, no copied source, no fork, no custom wrapper.

Decisions:

- **No pin.** The spec tracks `main`, as the upstream installer does. Pinning a tag or
  commit (`#v7.0.1`) is available and is the only supported way to freeze a version.
- **No project-level install.** Superpowers is user-global; adding a project copy would
  create a second registration and duplicate skill names.
- **No host patch.** Nothing in the fork blocked the plugin.

## 6. Verification

Static and runtime evidence, all observed in this session.

| Check | Command / observation | Result |
| --- | --- | --- |
| Binary and version | `opencode --version` | `v0.0.0-dev-20261102.033735` (V2) |
| Plugin configured | read `~/.config/opencode/opencode.json` | `plugins` array contains the Superpowers git spec |
| Plugin resolved | read plugin `package.json` in cache | `name: superpowers`, `version: 7.0.1` |
| Legacy install absent | path checks | no `plugins/superpowers.js`, no `skills/superpowers`, no clone |
| Skill registration | native skill catalog in this session | all 15 Superpowers skills listed from the cache path |
| Bootstrap injection | this session's context | the `<EXTREMELY_IMPORTANT>` `using-superpowers` block is present, with the **V2** tool mapping (`subagent`, `shell`, no todo tool) |
| Skill loading | `skill` tool on `verification-before-completion` | full skill body returned, base directory reported as the Superpowers cache path |
| Shadowing resolved | host system-update notices during the rename | `test-design` registered; `test-driven-development` re-registered with the upstream description "Use when implementing any feature or bugfix, before writing implementation code" |
| Plugin errors | log grep for `skill.transform`, `Plugin disabled`, `skill registration failed`, `context hook failed`, `session lookup failed` | **0 matches** |
| Config reload | saved skill files | catalog updated without restarting the service |
| Upstream acceptance test | `opencode run --standalone "Let's make a react todo list"` in an empty directory | a clean session invoked **`brainstorming` before any code**, then auto-selected `frontend-ui-engineering` and asked a scoping question instead of building. No files created. PowerShell raised `NativeCommandError` for the command's redirected stderr after the turn completed; the session itself produced a full, correct turn. |
| Regression check | `bun run lint:changed` | exits 1 on 15 pre-existing `anti-slop` findings across 6 TypeScript files (`apply-patch-file.ts`, `vite.config.ts`, `drafts.ts`, `current-session-story.tsx`, `session-message-projection.spec.ts`, `context/data.tsx`). None is in this change set, which touches two markdown files plus one new one. No TypeScript was modified. |
| Path and name integrity | existence checks on every path and skill name added to `AGENTS.md` | 10/10 referenced paths exist; 12/12 routing-table skill names resolve to exactly one source, and `test-driven-development` now resolves only to Superpowers |

Two caveats on the runtime API: `opencode api get /api/skill` returns an empty list for
the user-home location, so it is not a usable enumerator here; the native `skill` tool
catalog is authoritative.

**Not verified.** Bootstrap survival through native compaction, and child-session
bootstrap suppression. Child-session suppression is consistent with observation
(dispatched subagents had no Superpowers bootstrap and a read-only tool set) but not
directly asserted. The acceptance test above covers auto-triggering in a clean session;
it does not exercise the planning, execution, review, or merge-back skills end to end.

## 7. Open issues

- **D7 leftovers:** `craft-prompting` resolves to the older 67-line project copy;
  `eli5-skill` and `find-skills` differ between project and personal.
- **`/api/experimental/client-mcp` 500** (`w2 is not defined`) on the running dev build.
  Pre-existing, unrelated to this audit, still reproducing.
- **Unpinned Superpowers.** Updates arrive whenever the cache re-resolves; a tag pin is
  the supported remedy.
- **`orchestration-patterns.md` anti-pattern A** ("Router persona") predates the
  model-router plugin and is written for Claude Code personas. It does not contradict
  the V2 runtime, but the two documents use different vocabulary for delegation.
- **Account-level config is outside git.** The rename and reference fixes live in
  `~/.config/opencode/skills/`; only the `AGENTS.md` and `testing-patterns.md` parts are
  versioned.

## 8. Maintenance

- Update: clear the OpenCode package cache or reinstall the plugin, then restart the
  service. A plain restart may keep the previously resolved commit.
- Pin: `"superpowers@git+https://github.com/obra/superpowers.git#v7.0.1"`. On V2, pin
  v6.4.1 or later; v6.3.0 and earlier load only on V1.
- Diagnose a missing plugin: `opencode run --standalone --print-logs "hello"` and filter
  for `superpowers`, or read `~/.local/share/opencode/log/opencode.log` with
  `role=server`.
- After any change to a skill name, check the native skill catalog for duplicates: on V2
  the project copy wins, on V1 the bundled Superpowers skill used to win, so a name that
  exists twice behaves differently across versions.
- Keep personal and project skills under distinct names.

## 9. Rollback

Versioned changes: `git restore AGENTS.md .opencode/references/testing-patterns.md` and
delete `docs/superpowers-integration-audit.md`.

Account-level change: a copy of the original skill is preserved at
`C:\Users\barne\.config\opencode\skill-backups\2026-11-02\test-driven-development\`.
To restore, delete `~/.config/opencode/skills/test-design` and move the backup back to
`~/.config/opencode/skills/test-driven-development`, then revert the ten
`test-design` → `test-driven-development` name references in the personal pack. The
plugin itself was never modified, so no plugin rollback applies.

## 10. Final assessment

| Acceptance criterion | Status |
| --- | --- |
| Instructions and skills comprehensively audited | Met |
| `AGENTS.md` optimised without losing requirements | Met — two incorrect instructions removed, one routing section added |
| Current upstream behaviour inspected and documented | Met — v7.0.1 at `2ce8aa15` |
| Integration compatible with the actual runtime | Met — official V2 `plugins` mechanism, already correct |
| Installation and startup verified | Met — plugin resolved, registered, no plugin errors in log |
| Essential Superpowers skills discovered and load correctly | Met — 15 registered, 1 loaded end to end, shadowing removed |
| Existing specialised skills still available | Met — project and personal skills unchanged apart from the rename |
| Overlaps and conflicts resolved | Met for process routing and name shadowing; three duplicated files documented, not edited |
| Automatic skill selection evaluated with real tests | Met — a clean session auto-triggered `brainstorming` from the upstream acceptance prompt before writing any code |
| Representative workflows operate as intended | Met for the design entry point; planning, execution, review and merge-back were not re-run end to end in this audit |
| Project safeguards preserved | Met |
| Changes minimal, reproducible, maintainable | Met |
| Regression checks pass | Met for this change — no TypeScript was touched; `lint:changed` reports only pre-existing findings in files outside this diff |
| Uncertainties documented | Met |
| Independent review found no unresolved critical defect | Met — no critical integration defect remains |
| Report and completion summary delivered | Met |

Overall: **Verified Complete.** The plugin loads, registers and serves its skills, the
blocking name collision is gone, the instruction set no longer fights itself, and the
upstream acceptance test confirms the bootstrap reaches a clean session and drives skill
auto-selection. Two narrow edge cases stay unverified and are named above: bootstrap
retention through native compaction, and delegation-depth behaviours beyond the
brainstorming entry point.
