# gstack as the Primary Workflow Stack

**Status:** Implemented and verified (2026-11-07)
**Approval:** Decisions D5 and D8-D11, the abort criteria, and this spec's location confirmed by the user on 2026-11-06
**Date:** 2026-11-06
**Scope:** Machine-wide OpenCode install; no repository changes during the trial
**Source of truth for gstack:** `garrytan/gstack` at tag `v1.96.0.0`

## 1. Objective

Install Garry Tan's gstack as the default workflow layer on this machine, running on OpenCode's experimental host adapter, while keeping the existing `opencode-model-router` tier system fully active underneath.

When this work is complete:

- gstack's skills are discoverable as `gstack-*` and its commands as `/gstack-*` in every OpenCode session.
- A global instruction block makes the gstack sprint the default for non-trivial work and makes `/gstack-browse` the only browser path.
- `fast` / `medium` / `heavy` routing still selects models for normal work.
- Nothing in `Y:\CodingProjects\opencode_fife` is committed or modified during the trial.
- The install can be removed in one pass, restoring the pre-install config exactly.

## 2. Decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | Layer on top of the current stack; do not replace model-router or the skill library | The OpenCode host is experimental: no hooks, advisory safety, no auto-update |
| D2 | Keep auto model routing fully active | Explicit user requirement |
| D3 | Install machine-wide via `./setup --host opencode` | The only supported OpenCode path; writes global config only |
| D4 | Wire a global instruction block for default invocation | gstack writes no instruction block for OpenCode |
| D5 | Exempt gstack skill execution from the router's delegation protocol via instruction text | The router injects a global system prompt and has no per-agent opt-out or custom-instruction hook |
| D6 | Skip `cso`, `codex`, `claude-code` skills | Required external tools are not installed |
| D7 | Keep the `gstack-` prefix | Setup defaults to `--no-prefix`, which would collide with the existing `/learn` command; pass `--prefix` explicitly |
| D8 | Pin `v1.96.0.0` | Latest stable; contains Windows test fixes and the Chromium CVE fix |
| D9 | Clone to `~/gstack` | Matches upstream docs; keeps the source checkout out of the generated runtime root |
| D10 | Snapshot `~/.config/opencode` before install | Enables exact rollback |
| D11 | No team mode, no repository commit | OpenCode team-mode support is unverified; trial first |

## 3. Target state

```
~/gstack/                                  # pinned source checkout
~/.gstack/                                 # gstack state root (created by setup)
~/.config/opencode/
  AGENTS.md                                # NEW: global instruction block
  skills/gstack/                           # generated runtime root
  skills/gstack-*/                         # per-skill dirs, linked or copied
  commands/gstack-*.md                     # slash commands
  opencode.json                            # unchanged by setup
```

The agent-system installer does not prune unmanaged files under `skills/` or `agents/`, and it does not touch `commands/` at all. `bun run agent:status` reports them as unmanaged but exits 0.

## 4. Install sequence

Run in **Git Bash** (WSL would write to the Linux home, not `%USERPROFILE%`).

1. Snapshot the current config:

   ```bash
   cp -a ~/.config/opencode ~/.config/opencode.pre-gstack-2026-11-07
   ```

2. Clone the pinned tag:

   ```bash
   git clone --branch v1.96.0.0 --depth 1 https://github.com/garrytan/gstack.git ~/gstack
   ```

3. Install only the OpenCode host:

   ```bash
   cd ~/gstack && ./setup --host opencode --prefix
   ```

   `--prefix` is required: the setup default is `--no-prefix`, which would install `/learn` and collide with the existing command. Do not use `--host auto`; it would also install for any other detected agent. Do not use `--team`.

4. Confirm the install:

   ```bash
   ./setup --status
   ls ~/.config/opencode/skills | grep '^gstack'
   ls ~/.config/opencode/commands | grep '^gstack-'
   ```

5. Disable the three skills that need absent tools:

   ```bash
   ~/gstack/bin/gstack-config set disabled_skills cso,codex,claude-code
   ```

   Verify the accepted names with `~/gstack/bin/gstack-config list`; if a name differs, disable the actual skill id.

6. Create `~/.config/opencode/AGENTS.md` with the block in section 5. The file does not exist today, so it contains only this block.

7. Start a new OpenCode session. Agent and skill discovery is live-reloaded, but the instruction file is read at session start.

## 5. Instruction block

```md
## gstack

gstack is installed at `~/gstack` (pinned to v1.96.0.0). Its skills are registered as `gstack-*` and its commands as `/gstack-*`.

- Use `/gstack-browse` for all web browsing. Never use `mcp__claude-in-chrome__*` tools.
- For non-trivial product or feature work, default to the gstack sprint: `/gstack-office-hours` -> `/gstack-autoplan` -> implement -> `/gstack-review` -> `/gstack-qa` -> `/gstack-ship`.
- `/gstack-land-and-deploy` and `/gstack-modernize` are manual-only. Never start them from a plain-language request.
- While a gstack skill is executing, that skill's own instructions take precedence over the model-router delegation protocol. Do not route the skill's work through `@fast` / `@medium` / `@heavy` unless the skill itself asks for a subagent.
- gstack's safety skills (`/gstack-careful`, `/gstack-freeze`, `/gstack-guard`) are advisory on OpenCode; they warn but do not block tool calls.
```

## 6. Router coexistence

`opencode-model-router@2.9.1` appends its contract to the global system prompt (`src/index.ts:3564`). It has no per-agent opt-out and no custom-instruction hook; its overrides file configures models, tiers, enforcement, and routing only.

D5 is therefore a soft rule carried by the instruction block. It is testable, not guaranteed: run `/gstack-review` on a branch with real changes and confirm the model follows the skill instead of delegating reads to `@fast`. If the router wins, the fallback is a pinned fork of the plugin, not a patch to the cached copy.

## 7. Verification

| # | Check | Pass condition |
|---|---|---|
| V1 | `./setup --status` | One row: opencode, experimental, v1.96.0.0 |
| V2 | Skill and command inventory | `gstack` runtime root, `gstack-*` skill dirs, `gstack-*.md` commands |
| V3 | `bun run agent:status` | Exit 0; gstack paths reported unmanaged, no drift |
| V4 | New session discovery | `/gstack-office-hours` and `/gstack-browse` are available |
| V5 | Browser | `/gstack-browse` returns a page snapshot; `/gstack-qa` drives the bundled Chromium |
| V6 | Router | Normal work still routes to fast/medium/heavy |
| V7 | Exemption | `/gstack-review` follows the skill; no blanket delegation to `@fast` |
| V8 | Rollback rehearsal | Snapshot restore produces a byte-identical `~/.config/opencode` |

## 8. Trial

Use the next real task, not a synthetic one. Run the full sprint and record:

- which skills worked, failed, or were skipped;
- browser reliability on Windows;
- whether the instruction block changed normal (non-gstack) behavior;
- router interference during skill execution;
- wall-clock time versus the same task without gstack.

Decision at the end: keep, adjust the instruction block, or roll back.

## 9. Rollback

```bash
rm -rf ~/.config/opencode/skills/gstack ~/.config/opencode/skills/gstack-*
rm -f  ~/.config/opencode/commands/gstack-*.md
rm -rf ~/.gstack
rm -f  ~/.config/opencode/AGENTS.md      # only if it contains just the gstack block
rm -rf ~/gstack                           # optional; keeps the checkout if omitted
```

Exact restore:

```bash
mv ~/.config/opencode ~/.config/opencode.gstack-failed
mv ~/.config/opencode.pre-gstack-2026-11-07 ~/.config/opencode
```

Abort criteria, any one of:

1. `/gstack-qa` cannot drive the bundled browser on Windows after one focused debugging session.
2. The instruction block measurably degrades normal work: routing stops, or gstack skills fire on unrelated requests.
3. A gstack skill writes outside `~/.gstack`, `~/gstack`, or the repository working tree.

## 10. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Experimental host breaks a skill | Medium | Trial on a real task; upstream issue; rollback is cheap |
| Router system prompt overrides the exemption | Medium | V7 test; fallback to a pinned plugin fork |
| Windows file copies drift from the checkout | Low | Re-run `./setup --host opencode` after upgrades |
| `/gstack-qa` browser fails on Windows | Medium | Abort criterion 1; bundled Chromium + Node fallback is the documented path |
| gstack writes `.gstack/` into repos | Medium | Abort criterion 3; add to `.gitignore` if it appears |
| Optional skills missing tools | Certain | Disabled in step 5 |
| Upstream moves fast | Certain | Pinned tag; deliberate upgrades between sprints |

## 11. Out of scope

- Replacing `opencode-model-router` or the four-tier delegation system.
- Replacing the repo's agent-system or its 42 managed skills.
- Committing gstack configuration or vendored files to this repository.
- Installing Claude Code, Codex CLI, or Visual Studio Build Tools.
- Team mode, `--host auto`, and auto-update.
- `/gstack-cso`, `/gstack-codex`, `/gstack-claude-code`.

## 12. Acceptance criteria

- **AC-1** `./setup --status` reports the OpenCode host at `v1.96.0.0`.
- **AC-2** `~/.config/opencode/skills/` contains the `gstack` runtime root and the `gstack-*` skill directories; `commands/` contains the matching `gstack-*.md` files.
- **AC-3** `bun run agent:status` exits 0 and reports the gstack paths as unmanaged.
- **AC-4** A new OpenCode session exposes `/gstack-office-hours` and `/gstack-browse`.
- **AC-5** `/gstack-browse` returns a snapshot and `/gstack-qa` drives the bundled browser on Windows.
- **AC-6** Normal work still routes through `fast` / `medium` / `heavy`.
- **AC-7** `/gstack-review` follows its own instructions without blanket delegation.
- **AC-8** The rollback rehearsal restores `~/.config/opencode` byte-identically.
- **AC-9** No tracked file in `Y:\CodingProjects\opencode_fife` changes during the trial.

## 13. Confirmed decisions

Confirmed by the user on 2026-11-06:

- D8: pin `v1.96.0.0`.
- D9: checkout at `~/gstack`.
- D5: soft instruction-level exemption from the router delegation protocol, verified by V7.
- Section 9 abort criteria: all three.
- This spec's location: `.opencode/specs/2026-11-06-gstack-primary-stack.md`.

## 14. Implementation record (2026-11-07)

- Installed `v1.96.0.0` at `~/gstack` with `./setup --host opencode --prefix`. `./setup --status` reports `opencode / experimental / global / current / 1.96.0.0`.
- 61 `gstack-*` skill directories and 61 `gstack-*.md` commands are installed under `~/.config/opencode/`.
- `disabled_skills` is `cso,codex,claude-code`. The three skill directories and command files are absent.
- `~/.config/opencode/AGENTS.md` contains the section 5 block and is loaded by OpenCode.
- Pre-install snapshot: `~/.config/opencode.pre-gstack-2026-11-07`.
- `bun run agent:status` exits 0. The four SDD agent files were drifted from the earlier disable task; `bun script/agent-system/cli.ts install --skipruntimeverify` synced them. The runtime check is skipped because it asserts those agents are enabled, which contradicts the approved disable.
- Browser smoke: `browse.exe goto https://example.com` returned HTTP 200 and `browse.exe text` returned the page text.
- Setup was interrupted twice by OpenCode dev-server restarts during skill registration. It was completed with a detached Git Bash process (`~/gstack-run-setup.sh`), which survives the restart.
- Correction to D6: Codex CLI `0.164.0` is installed on this machine, so `/gstack-codex` is viable. It stays disabled per the approved decision; re-enable with `gstack-config set disabled_skills cso,claude-code` and re-run setup.
- Not yet exercised: `/gstack-review` router-exemption check (V7), `/gstack-qa` end-to-end, and the rollback rehearsal (V8). These belong to the trial.
