# ECC setup

ECC is installed for this repository from [affaan-m/ECC](https://github.com/affaan-m/ECC) at upstream `main` snapshot `25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b`. That snapshot is 1,017 commits past the stable `v2.2.3` tag (`93f9f6154d164ccb9f4dc38858a2bc2d5dcab222`); the npm package version `2.2.3` is not the release payload. `installation.json` records the full provenance, including the adapter source.

- 311 ECC skills are in .opencode/skills alongside 14 preserved custom and project skills.
- 27 agent definitions and 35 commands are registered in .opencode/opencode.jsonc using this fork's v2 configuration. Try /plan, /tdd, /code-review, /security, and /verify.
- Only the ECC bridge (`.opencode/ecc/INSTRUCTIONS.md`) loads as an automatic instruction. The `ecc/rules/common` and `ecc/rules/typescript` files stay on disk as reference and are not wired into the config. AGENTS.md and package instructions control project-specific behavior.
- /learn keeps the existing project command; /ecc-learn invokes the ECC version.
- Node helpers are in .opencode/scripts. Install their pinned dependencies with npm ci --ignore-scripts --no-audit --no-fund --prefix .opencode after a fresh checkout. Python and optional domain tools are required only for their corresponding skills.
- The deprecated `continuous-learning` (v1) skill keeps its body for explicit use, and its frontmatter carries `opencode/autoinvoke: false`, so it does not appear in the automatic catalog.
- The docs-lookup specialist uses Context7 when it is actually configured and otherwise fetches official documentation with native webfetch; it reports unverified information instead of presenting stale knowledge.
- The installed contract is enforced by `packages/core/test/ecc-hooks/catalog.test.ts` (run from `packages/core`: `bun run script/test.ts test/ecc-hooks`).

The native v2 hook adapter is enabled through the single `./ecc/plugin` entry. It supplies ECC shell environment values, tracks successful writes/edits/patches by session, adds bounded advisory diagnostics, preserves file context during compaction, and audits native terminal execution events. It follows the standard profile by default. See [adapter provenance and options](plugin/provenance.md) and [verification](plugin/verification.md).

The adapter incorporates runtime work from ECC PR #3676 at commit `9f61fc050f10a47fab1a8abefabde44ad552f77d`, adapted to this fork's actual native API. The legacy v1 plugin and its custom tools remain disabled. Automatic typechecks require an explicit Bun command and strict profile. Native formatting and permissions stay in control. No observer, telemetry, modal notifications, MCP server, or model selection is enabled.

To disable the adapter, set its `options.enabled` to false or remove that plugin entry. OpenCode releases the owned registrations, stream, and checks when it unloads the adapter. The next location activation reads the configuration; this setup does not restart an existing service.

The 25 Osmani skills were removed from the project layer; they remain discoverable through global compatibility sources. Shared project checklists remain in .opencode/references, including the actively edited completion checklist. Existing custom skills remain in place. Source snapshot, stable tag, package version, and installed names are recorded in installation.json. Review upstream changes before replacing this snapshot.

## Local patches (reapply after a selective refresh)

These deltas are deliberately local; a snapshot refresh must reapply them:

1. `instructions` in .opencode/opencode.jsonc carries only `.opencode/ecc/INSTRUCTIONS.md` — no `ecc/rules/*` globs.
2. `.opencode/ecc/INSTRUCTIONS.md` is the rewritten bridge (800-character budget).
3. `ecc/commands/harness-audit.md`, `evolve.md`, `projects.md`, `promote.md`, `instinct-status.md`, `instinct-export.md`, `instinct-import.md` — corrected helper paths, PowerShell/POSIX commands, supported flags, and real export/import formats.
4. `.opencode/skills/continuous-learning/SKILL.md` — `metadata.opencode/autoinvoke: false` added.
5. `ecc/prompts/agents/docs-lookup.txt` plus its config description — Context7-when-present, official-source fallback, unverified reporting.

## Updating the snapshot

Review the upstream diff since the recorded commit, selectively refresh assets, reapply the local patches above, then run the catalog contract and native suites from `packages/core` (`bun run script/test.ts test/ecc-hooks` plus the skill/session tests) and the adapter smoke (`node packages/core/test/ecc-hooks/runtime-smoke.cjs <host>`). Do not use managed repair or auto-update over these manually adapted assets.

## Skill catalog pruning (permission.skill deny rules)

`ecc-skill-prune` added a `permission.skill` ruleset to `.opencode/opencode.jsonc` that removes 100 skills from the advertised catalog. These skills target ecosystems and domains this repo never touches (Perl, Django, Laravel, Swift, Cisco IOS, homelab networking, healthcare, logistics, crypto payments, social media, and similar). Measured cold-prompt input at pruning time (GLM probes, three consistent runs each side): 52,039 → 42,079 tokens per session (−19.1%). The advertised count at any later snapshot is whatever remains after the rules — enumerate it live; do not treat a fixed number (250, 253, or otherwise) as an invariant.

### How it works

- Deny rules filter both the advertised catalog (`packages/core/src/skill/instructions.ts` via `Skill.available`) and the model's skill tool (`packages/core/src/tool/plugin/skill.ts` returns `permission.rejected`).
- Explicit user attachment of a denied skill still works (`packages/core/src/session/prompt.ts` has no permission check): mention the skill by name or activate via `POST /api/experimental/session/:sessionID/skill`.
- Rules resolve with `findLast` (`packages/core/src/permission.ts`): deny groups are listed first, `allow` overrides after win for the 44 skills referenced by ECC agent prompts and commands (for example `django-tdd` from the tdd-guide agent prompt).

### Recovery

1. Mention a denied skill explicitly in a prompt (attachment bypasses deny).
2. Delete or narrow the rule in `.opencode/opencode.jsonc` — config edits apply live, no restart.
3. `git revert` of the config commit restores the original catalog.

### After ECC updates

ECC updates may reinstall skills or add new ones in denied domains. Before trusting the ruleset again:

1. Re-run the catalog enumeration and wildcard dry-run against the new skill list (semantics per `packages/core/src/util/wildcard.ts`: `*` matches any run of characters, `?` matches one, anchored, case-insensitive on Windows).
2. Review the matched set against the protected list: skill IDs referenced anywhere under `.opencode` outside `skills/`, excluding `ecc/installation.json` and `manifests/` (those manifests list every skill name and false-match everything).
3. Confirm allow overrides still cover every referenced ID; add deny rules for new dead domains deliberately, one group at a time.
