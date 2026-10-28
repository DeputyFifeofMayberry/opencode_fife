# ECC setup

ECC 2.2.3 is installed for this repository from [affaan-m/ECC](https://github.com/affaan-m/ECC/tree/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b).

- 311 ECC skills are in .opencode/skills alongside 14 preserved custom and project skills.
- 27 agent definitions and 35 commands are registered in .opencode/opencode.jsonc using this fork's v2 configuration. Try /plan, /tdd, /code-review, /security, and /verify.
- Common and TypeScript rules load through the same config. AGENTS.md and package instructions control project-specific behavior.
- /learn keeps the existing project command; /ecc-learn invokes the ECC version.
- Node helpers are in .opencode/scripts. Install their pinned dependencies with npm ci --ignore-scripts --no-audit --no-fund --prefix .opencode after a fresh checkout. Python and optional domain tools are required only for their corresponding skills.

ECC's automatic hook plugin targets OpenCode v1. This fork requires a default plugin definition containing id and setup or effect. The legacy hook plugin and its custom tools are disabled. No MCP server or model is selected by this setup.

The 25 Osmani skills were removed. Shared project checklists remain in .opencode/references, including the actively edited completion checklist. Existing custom skills remain in place. Source version, commit, and installed names are recorded in installation.json. Review upstream changes before replacing this snapshot.
