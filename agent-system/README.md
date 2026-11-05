# Agent system

The agent system packages the four SDD role contracts, the managed skill library, and
the `fife` tier configuration so one local update installs the CLI and the agent
system together.

## Source of truth and install target

| Tree | Role |
|---|---|
| `.opencode/agents/` | Canonical role contracts (`spec-writer`, `implementer`, `tester`, `qa`) |
| `.opencode/skills/` | Canonical skill library (30 global-scope and 10 project-scope skills) |
| `agent-system/` | Manifest, schema, canonical config fragments, documentation, and migration notes |
| `~/.config/opencode/` | Install target; never edit as source |
| `Y:\CodingProjects\my-custom-stuff\agents` | Read-only v1.1.1 migration archive |

Inside this repository the project `.opencode/agents` and `.opencode/skills` copies
shadow the global copies. The installer copies the same normalized bytes to the
global config root, and `local:status` detects lag between the two.

## Versions

- Agent-system version: `2.0.0`
- Role-content version: `1.1.1`
- Plugin pin: `opencode-model-router@2.9.1` (external, GPL-3.0-only, never vendored)
- CLI version: independent `0.0.0-dev-<timestamp>` build version

The installed manifest records both agent-system versions, the CLI version, the
source commit, and the backup path.

## Install

```powershell
# CLI and agent system (the normal update)
bun run update:local

# Agent system only; no CLI build. Reports a dirty tree but copies the working tree.
bun run update:local -- -AgentsOnly

# CLI only; preserves the previous binary-only behavior
bun run update:local -- -SkipAgents

# Clean install into an isolated config root
bun run agent:install -- -ConfigRoot C:\Windows\Temp\agent-system-clean -AgentsOnly
```

| Option | Effect |
|---|---|
| `-AgentsOnly` | Skip the CLI build and binary swap; install agents, skills, and configuration |
| `-SkipAgents` | Skip the agent-system asset step; preserve the CLI-only install |
| `-ConfigRoot <path>` | Install assets into a different config root; useful for clean-install tests |
| `-Force` | Back up and replace a managed file that was modified since the last install or collides with an unmanaged file |
| `-KeepAutoAccept` | Keep `session.permissions: "autoaccept"`; records the opt-out in the installed manifest and prints a warning |

`-AgentsOnly` and `-SkipAgents` together install nothing and are rejected.

## Status

```powershell
bun run local:status
bun run local:status -- -json
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | In sync |
| `1` | Managed-file, missing-file, extra-file, or configuration drift |
| `2` | Agent system not installed, or the installed manifest is missing or unreadable |
| `3` | Error while reading the repository or configuration |

The report includes the CLI version and source commit, agent-system and role-content
versions, managed-file counts, drifted files, missing files, unmanaged files,
configuration drift, the permission mode, and the `-KeepAutoAccept` record.

## Rollback

```powershell
bun run local:rollback              # agent system + newest archived CLI build
bun run local:rollback -AgentsOnly  # agents, skills, and configuration only
bun run local:rollback -BinaryOnly  # CLI only
bun run local:rollback -Build 20261028170804581
```

Agent rollback restores the most recent backup under
`<config-root>/backups/agent-system/<timestamp>/`. Restored files are verified against
the backup hashes. Files the install created are removed when the backup records that
they did not exist before. Unmanaged files created after the backup are preserved and
reported. If no backup exists, the command exits `2`.

The CLI rollback retains the existing archive, `.old` rename, DLL, and build-record
behavior. A running session can hold the old executable; the leftover rename is
reported and removed by a later install or `local:prune`.

## Manifest and drift

`agent-system/manifest.json` is the install contract. It declares:

- `agentSystemVersion` (`2.0.0`) and `roleContentVersion` (`1.1.1`).
- The exact plugin pin.
- Every managed file with its source path, install target, scope, and SHA-256.
- The canonical config fragments.

`agent-system/manifest.schema.json` validates the manifest. Generate or check it with:

```powershell
bun run agent:manifest          # regenerate hashes after an intentional content change
bun run agent:manifest -- --check
```

`--check` validates the schema, every declared hash, the inventory, and the scope
counts. Tampering with a managed file exits nonzero and names the file.

## Adding or changing a managed agent or skill

1. Edit the role under `.opencode/agents/` or the skill under `.opencode/skills/`.
2. Keep role bodies unchanged unless the change is an intentional role revision; the
   current baseline is v1.1.1.
3. If the change is a new skill, add its directory under `.opencode/skills/` and add
   the name to `GLOBAL_SKILLS` or `PROJECT_SKILLS` in
   `script/agent-system/lib.ts`.
4. Run `bun run agent:manifest` to regenerate the hashes.
5. Run `bun run agent:manifest -- --check` and `bun run test:agent-system`.
6. Commit the change, then run `bun run update:local` when the user asks.

Global-scope skills are installed into `<config-root>/skills/`. Project-scope skills
remain available to this repository only and are never copied to the global config
root. `opencode-dev` is project-scoped because it documents this repository's tooling.

## Configuration merge

The installer treats `opencode.json` and the router overrides as user-owned documents
with a small managed key set.

`opencode.json`:

- `effort_policy.agent_operations` is set to the canonical mapping.
- The exact `opencode-model-router@2.9.1` pin is added if absent.
- A different `opencode-model-router` version is a reported mismatch, not an automatic
  upgrade.
- `update`, provider/auth settings, other plugins, and unrelated keys are preserved.

`opencode-model-router.overrides.jsonc`:

- `presets.fife` is set to the canonical definition.
- `activePreset`, `activeMode`, other presets, `enforcement`, `routing`, and unrelated
  keys are preserved.
- Comments are preserved only when the file is unchanged. If the merge changes the
  file, comments are normalized, the previous file is backed up, and the change is
  reported.

If either configuration file is absent, the installer creates it with only the
canonical keys. Malformed JSON/JSONC is refused, backed up, and reported. Writes are
atomic and validated after writing; a failed validation restores the backup.

`cli.json` is never created. If it exists and `session.permissions` is `autoaccept`,
the default install changes it to `prompt` with a backup. `-KeepAutoAccept` keeps the
value, records the opt-out, and warns that the TUI suppresses `ask` prompts.

## Tier and SDD boundary

`fast`, `medium`, and `heavy` are plugin-registered subagents and the sole owners of
model selection. The four SDD roles keep their own subagent permissions and stage
gates. The Spec Writer may invoke only `explore` (allow) and `implementer`/`tester`/`qa`
(ask). The Implementer may invoke only `explore`. The Tester and QA deny all
subagents. Tier selection does not alter stage authorization, approval gates, or
correction limits.

## Security boundaries

- The installer never reads, copies, or modifies `service*.json`.
- The repository contains no API keys, service passwords, tokens, or machine-specific
  absolute paths in managed files.
- The model-router plugin remains external and is never vendored.
- The installer refuses a dirty tree for a full install. `-AgentsOnly` reports the
  dirty state and copies the working tree so assets can be iterated before committing.

## Tests

```powershell
bun run test:agent-system
```

The root script delegates to `script/agent-system`, the package that owns the tests.
Coverage includes manifest validation and tamper detection, scope selection, JSON and
JSONC merging, path mapping, backup/restore, drift detection, local-modification
refusal, unmanaged-file preservation, clean install, idempotence, rollback, and the
PowerShell `-AgentsOnly`/`-SkipAgents`/`-ConfigRoot`/`-Force`/`-KeepAutoAccept`
paths.

For a clean-install test without the managed-service port conflict, set
`OPENCODE_AGENT_SYSTEM_SKIP_RUNTIME_VERIFY=1` before invoking the PowerShell installer.
The full `update:local` runs `opencode debug agents` against the live config and fails
the install if the four roles, modes, permissions, or v1.1.1 markers are missing.

## Known specification discrepancies

- The approved specification records 14 repository skills and 9 repo-only skills. The
  repository actually contains 15 skills and 10 repo-only skills; the list omits
  `opencode-dev`. The consolidation preserves it as a project-scoped skill, producing
  30 global + 10 project = 40 managed skills. Deleting a working skill to match the
  count would violate the preservation requirement.
- The specification's AC-05 says the `spec-writer` system prompt contains the
  two-attempt retry ceiling. In v1.1.1 that ceiling is in `implementer.md`; the
  installer verifies it there and verifies the untrusted-material rule,
  `Skipped`/`Blocked`, and `check revision` in `spec-writer.md`.
