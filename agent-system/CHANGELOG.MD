# Agent System Changelog

All notable changes to the managed agent system are documented here. The migrated
role-library history is preserved in `docs/CHANGELOG.MD`.

## 2.0.0 — 2026-11-05

### Added

- Managed agent-system packaging: `manifest.json`, `manifest.schema.json`, canonical
  config fragments, install/status/rollback commands, and automated tests.
- Consolidated 30 global skills into `.opencode/skills`; the five shared skills are
  deduplicated and the newer global copies win.
- `-AgentsOnly`, `-SkipAgents`, `-ConfigRoot`, `-Force`, and `-KeepAutoAccept`
  installer options.
- `session.permissions` defaults to `prompt` when `cli.json` is `autoaccept`;
  `-KeepAutoAccept` records the opt-out in the installed manifest and prints a warning.
- `local:status` reports managed-file drift, missing and unmanaged files, configuration
  drift, and supports `--json` with exit codes 0/1/2/3.
- `local:rollback` restores the agent system and/or the previous binary; restored files
  are verified against the backup hashes.

### Changed

- Role content migrated to v1.1.1: untrusted-material handling, `Skipped`/`Blocked`
  verification statuses, the two-attempt retry ceiling, handoff `check revision`
  anchors, and numbered `tester.md` sections.
- `bun run update:local` installs both the CLI and the agent system. `-SkipAgents`
  preserves the previous CLI-only behavior.
- `AGENTS.md` and `docs/local-development.md` describe the source-of-truth boundary,
  install targets, options, and the tier/SDD boundary.

### Notes

- `opencode-model-router@2.9.1` remains external and is never vendored. Model IDs,
  providers, and tier routing are unchanged.
- The standalone `my-custom-stuff/agents` tree is a read-only migration archive.
- The manifest lists 30 global and 10 project skills. The approved specification's
  nine-project count omitted the existing `opencode-dev` skill; it is preserved as a
  project-scoped skill rather than deleted.
