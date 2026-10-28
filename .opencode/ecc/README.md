# ECC setup

ECC 2.2.3 is installed for this repository from [affaan-m/ECC](https://github.com/affaan-m/ECC/tree/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b).

- 311 ECC skills are in .opencode/skills alongside 14 preserved custom and project skills.
- 27 agent definitions and 35 commands are registered in .opencode/opencode.jsonc using this fork's v2 configuration. Try /plan, /tdd, /code-review, /security, and /verify.
- Common and TypeScript rules load through the same config. AGENTS.md and package instructions control project-specific behavior.
- /learn keeps the existing project command; /ecc-learn invokes the ECC version.
- Node helpers are in .opencode/scripts. Install their pinned dependencies with npm ci --ignore-scripts --no-audit --no-fund --prefix .opencode after a fresh checkout. Python and optional domain tools are required only for their corresponding skills.

The native v2 hook adapter is enabled through the single `./ecc/plugin` entry. It supplies ECC shell environment values, tracks successful writes/edits/patches by session, adds bounded advisory diagnostics, preserves file context during compaction, and audits native terminal execution events. It follows the standard profile by default. See [adapter provenance and options](plugin/provenance.md) and [verification](plugin/verification.md).

The adapter incorporates runtime work from ECC PR #3676 at commit `9f61fc050f10a47fab1a8abefabde44ad552f77d`, adapted to this fork's actual native API. The legacy v1 plugin and its custom tools remain disabled. Automatic typechecks require an explicit Bun command and strict profile. Native formatting and permissions stay in control. No observer, telemetry, modal notifications, MCP server, or model selection is enabled.

To disable the adapter, set its `options.enabled` to false or remove that plugin entry. OpenCode releases the owned registrations, stream, and checks when it unloads the adapter. The next location activation reads the configuration; this setup does not restart an existing service.

The 25 Osmani skills were removed. Shared project checklists remain in .opencode/references, including the actively edited completion checklist. Existing custom skills remain in place. Source version, commit, and installed names are recorded in installation.json. Review upstream changes before replacing this snapshot.
