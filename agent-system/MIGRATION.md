# Migration notes

## Sources

| Source | Content | Treatment |
|---|---|---|
| `Y:\CodingProjects\my-custom-stuff\agents` | v1.1.1 role files, `AGENTS.md`, `CHANGELOG.MD`, `docs/research/` | Migrated into `.opencode/agents/` and `agent-system/docs/`; the standalone tree is now a read-only archive |
| `C:\Users\barne\.config\opencode\skills` | 30 global skills | Copied into `.opencode/skills/`; the global tree becomes an install target |
| Repository `.opencode/skills` | 15 project skills | Preserved; the 10 skills not present globally remain project-scoped |

## Role parity

The four role files were copied from the v1.1.1 standalone files. Line endings were
normalized to LF and the normalized SHA-256 is recorded in `agent-system/manifest.json`.
No role text was reworded, reordered, or cleaned up. The `permissions` key remains
plural, matching the fork's loader.

## Shared skills

The five shared skills were deduplicated:

| Skill | Result |
|---|---|
| `construction-humanizer` | Repository and global copies were byte-identical; kept one copy |
| `walk-me-through` | Repository and global copies were byte-identical; kept one copy |
| `craft-prompting` | Global copy is the newer adaptive-prompting revision; supporting files copied from the global copy |
| `eli5-skill` | Global copy is newer; kept the global body. The shim's user-specific `C:/Users/...` canonical path was rewritten to `~/.agents/...` to satisfy the no-machine-specific-path rule; the shim's meaning is unchanged |
| `find-skills` | Global copy is newer; kept the global body |

`craft-prompting`'s `evals/provenance.json`, `agents/openai.yaml`, references, and
scripts are preserved. `humanizer_fife`'s `LICENSE`, `NOTICE`-equivalent provenance,
and evaluation assets are preserved.

## Excluded artifacts

`__pycache__/`, `*.pyc`, `.DS_Store`, `Thumbs.db`, `node_modules/`, and `.git/` are
not managed. The repository's pre-existing ignored `__pycache__` files were left in
place and are not installed.

## Inventory discrepancy

The approved specification records 14 repository skills and 9 repo-only skills. The
repository actually contains 15 skills and 10 repo-only skills: the specification's
list omits `opencode-dev`, which `AGENTS.md` references as a project skill. The
consolidation preserves it as a project-scoped skill, producing 30 global + 10
project = 40 managed skills. Deleting a working skill to match the specification's
count would violate the preservation requirement, so the discrepancy is recorded
here and in the implementation report.

## Secrets

`service.json`, `service-dev.json`, and `service-local.json` were never read, copied,
or modified. The migration contains no credentials, API keys, or machine-specific
absolute paths in managed files.
