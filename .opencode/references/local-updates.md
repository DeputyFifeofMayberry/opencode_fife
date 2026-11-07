# Task-specific repository guidance

## Local Updates

- "Update opencode", "create local update package", and "install local build" all mean one procedure: `bun run update:local` (alias of `install:local`) from the repo root on a committed `dev` tree. It installs both the CLI and the agent system. Full process: `docs/local-development.md`; confirmed decisions: `docs/intent/local-update.md`; agent-system contract: `agent-system/README.md`.
- The canonical agent sources are `.opencode/agents/` and `.opencode/skills/`. `~/.config/opencode/` is an install target; never edit it as source. The installer copies the managed roles and global-scope skills there, merges the canonical tier keys into `opencode.json` and `opencode-model-router.overrides.jsonc`, and writes `agent-system.installed.json`.
- Never install unasked. If `bun run local:status` shows `dev` ahead of the installed build, say so and wait for the user to request the update.
- The installer refuses a dirty tree for a full install; commit first. `-AgentsOnly` reports the dirty tree and copies the working tree so assets can be iterated before committing. Its compiled smoke test is the only hard gate; other checks are advisory per the checklist in `docs/local-development.md`.
- Options: `-AgentsOnly` (assets only, no CLI build), `-SkipAgents` (CLI only), `-ConfigRoot <path>` (isolated clean install), `-Force` (back up and replace a locally modified managed file), `-PromptPermissions` (restore `prompt` mode; autoaccept is the default and suppresses tool permission prompts only, leaving the SDD stage approvals intact).
- Companion commands: `local:list`, `local:status`, `local:rollback`, `local:prune`, `agent:install`, `agent:status`, `agent:rollback`, `agent:manifest`, `test:agent-system`. Installs archive the previous build and prune the archive to the newest 5; agent-system backups use the same retention.
- Tier boundary: `fast`, `medium`, and `heavy` are plugin-registered subagents and the sole owners of model selection. The four SDD roles keep their own `subagent` permissions and stage gates; tier selection does not alter stage authorization, approval gates, or correction limits. `plan` is disabled; `spec-writer` is the single planning primary agent and `build` remains the default coding agent.

